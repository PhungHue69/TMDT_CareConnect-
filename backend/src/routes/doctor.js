/* Doctor Portal (TV3) - API cho bác sĩ. Mount tại /api/doctor (đã qua requireAuth + requireDoctor) */
const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { loadDoctor } = require('../middleware/doctorAuth');

const FEE_MIN = 5000;
const FEE_MAX = 30000;
const MODES = ['CHAT', 'AUDIO', 'VIDEO'];

// Thông tin tài khoản và hồ sơ chuyên môn của bác sĩ đang đăng nhập
router.get('/me', ah(async (req, res) => {
    const { rows } = await db.query(
        'SELECT id, phone, full_name, avatar_url, role FROM users WHERE id = $1',
        [req.user.id]
    );
    res.json({ user: rows[0], doctor: req.doctor });
}));

// Bật / tắt nhận khám. Chỉ hồ sơ đã được Admin duyệt và đã có phí khám mới được bật.
router.put('/online', ah(async (req, res) => {
    const { is_online } = req.body;
    if (typeof is_online !== 'boolean') throw new HttpError(400, 'Giá trị trạng thái không hợp lệ');
    if (is_online && req.doctor.verification_status !== 'APPROVED') {
        throw new HttpError(403, 'Hồ sơ chưa được duyệt nên chưa thể bật nhận khám');
    }
    if (is_online && req.doctor.consultation_fee === null) {
        throw new HttpError(400, 'Vui lòng cấu hình phí khám trước khi bật nhận khám');
    }
    await db.query('UPDATE professional_profiles SET is_online = $1 WHERE id = $2', [is_online, req.doctor.id]);
    res.json({ doctor: await loadDoctor(req.user.id) });
}));

// Cấu hình phí khám (5.000đ - 30.000đ), hình thức khám và giới thiệu
router.put('/settings', ah(async (req, res) => {
    const { consultation_fee, consultation_modes, bio } = req.body;

    const fee = Number(consultation_fee);
    if (!Number.isInteger(fee) || fee < FEE_MIN || fee > FEE_MAX) {
        throw new HttpError(400, 'Phí khám phải là số nguyên từ 5.000đ đến 30.000đ');
    }

    if (!Array.isArray(consultation_modes) || !consultation_modes.length
        || consultation_modes.some((m) => !MODES.includes(m))) {
        throw new HttpError(400, 'Hãy chọn ít nhất một hình thức khám hợp lệ (chat, gọi thoại, video)');
    }
    const modes = [...new Set(consultation_modes)];

    const bioText = bio === undefined || bio === null ? null : String(bio).trim().slice(0, 1000);

    await db.query(
        `UPDATE professional_profiles
         SET consultation_fee = $1,
             consultation_modes = $2::text[]::consultation_mode_enum[],
             bio = COALESCE($3, bio)
         WHERE id = $4`,
        [fee, modes, bioText, req.doctor.id]
    );
    res.json({ doctor: await loadDoctor(req.user.id) });
}));
// ===== HÀNG CHỜ KHÁM =====
// Danh sách ca khám của bác sĩ đang đăng nhập (mới nhất trước)
router.get('/consultations', ah(async (req, res) => {
    const { rows } = await db.query(
        `SELECT c.id, c.mode, c.status, c.fee_amount, c.symptom_description,
                c.scheduled_at, c.created_at,
                u.full_name AS patient_name,
                EXISTS (SELECT 1 FROM prescriptions p WHERE p.consultation_id = c.id) AS has_prescription,
                (c.fee_credit_order_id IS NOT NULL) AS fee_credit_used
         FROM consultations c
         JOIN users u ON u.id = c.patient_user_id
         WHERE c.doctor_profile_id = $1
         ORDER BY c.created_at DESC
         LIMIT 100`,
        [req.doctor.id]
    );
    res.json({ consultations: rows });
}));

// Chi tiết một ca khám
router.get('/consultations/:id', ah(async (req, res) => {
    const { rows } = await db.query(
        `SELECT c.*, u.full_name AS patient_name, u.date_of_birth, u.gender
         FROM consultations c
         JOIN users u ON u.id = c.patient_user_id
         WHERE c.id = $1 AND c.doctor_profile_id = $2`,
        [req.params.id, req.doctor.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy ca khám');
    res.json({ consultation: rows[0] });
}));

// ===== KÊ ĐƠN ĐIỆN TỬ =====
// Tìm thuốc trong danh mục Master_Drugs (TV4)
router.get('/drugs', ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const { rows } = await db.query(
        `SELECT id, name, active_ingredient, strength, dosage_form, unit,
                product_type, reference_price, image_url
         FROM master_drugs
         WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR active_ingredient ILIKE '%' || $1 || '%'
         ORDER BY name
         LIMIT 20`,
        [q]
    );
    res.json({ drugs: rows });
}));

// Kê đơn điện tử cho một ca khám
// body: { diagnosis, valid_days, items: [{ master_drug_id, dosage, quantity, duration_days, usage_instructions }] }
router.post('/consultations/:id/prescription', ah(async (req, res) => {
    const { diagnosis, valid_days, items } = req.body;

    if (!Array.isArray(items) || !items.length || items.length > 30) {
        throw new HttpError(400, 'Đơn thuốc cần từ 1 đến 30 loại thuốc');
    }
    const clean = items.map((i) => ({
        master_drug_id: Number(i.master_drug_id),
        dosage: i.dosage ? String(i.dosage).slice(0, 100) : null,
        quantity: Number(i.quantity),
        duration_days: i.duration_days ? Number(i.duration_days) : null,
        usage_instructions: i.usage_instructions ? String(i.usage_instructions).slice(0, 500) : null,
    }));
    if (clean.some((i) => !Number.isInteger(i.master_drug_id) || !Number.isInteger(i.quantity) || i.quantity < 1)) {
        throw new HttpError(400, 'Mã thuốc hoặc số lượng không hợp lệ');
    }
    const days = Number.isInteger(Number(valid_days)) && Number(valid_days) > 0 ? Number(valid_days) : 7;

    // Ca khám phải thuộc bác sĩ này
    const c = await db.query(
        'SELECT id, patient_user_id FROM consultations WHERE id = $1 AND doctor_profile_id = $2',
        [req.params.id, req.doctor.id]
    );
    if (!c.rows[0]) throw new HttpError(404, 'Không tìm thấy ca khám');

    // Mỗi ca chỉ kê một đơn
    const dup = await db.query('SELECT 1 FROM prescriptions WHERE consultation_id = $1', [c.rows[0].id]);
    if (dup.rows.length) throw new HttpError(409, 'Ca khám này đã có đơn thuốc');

    // Mọi mã thuốc phải có trong danh mục
    const ids = [...new Set(clean.map((i) => i.master_drug_id))];
    const found = await db.query('SELECT id FROM master_drugs WHERE id = ANY($1::bigint[])', [ids]);
    if (found.rows.length !== ids.length) throw new HttpError(400, 'Có thuốc không tồn tại trong danh mục');

    // Một câu lệnh duy nhất nên tạo đơn và các dòng thuốc cùng lúc, lỗi thì không lưu gì
    const { rows } = await db.query(
        `WITH p AS (
            INSERT INTO prescriptions
                (patient_user_id, uploaded_by_user_id, source, doctor_profile_id, consultation_id,
                 diagnosis, issued_date, valid_until, ai_validation_status)
            VALUES ($1, $2, 'E_PRESCRIPTION', $3, $4, $5, CURRENT_DATE, CURRENT_DATE + $6::int, 'APPROVED')
            RETURNING id
         )
         INSERT INTO prescription_items
            (prescription_id, master_drug_id, drug_name_raw, dosage, quantity, duration_days, usage_instructions)
         SELECT p.id, m.id, m.name, i.dosage, i.quantity, i.duration_days, i.usage_instructions
         FROM p
         CROSS JOIN jsonb_to_recordset($7::jsonb)
              AS i(master_drug_id bigint, dosage text, quantity int, duration_days int, usage_instructions text)
         JOIN master_drugs m ON m.id = i.master_drug_id
         RETURNING prescription_id`,
        [c.rows[0].patient_user_id, req.user.id, req.doctor.id, c.rows[0].id,
         diagnosis ? String(diagnosis).slice(0, 1000) : null, days, JSON.stringify(clean)]
    );

    await db.query(`UPDATE consultations SET diagnosis = $1, status = 'COMPLETED', ended_at = NOW() WHERE id = $2`,
        [diagnosis ? String(diagnosis).slice(0, 1000) : null, c.rows[0].id]);

    res.status(201).json({ prescription_id: rows[0].prescription_id, item_count: rows.length });
}));

// Xem lại đơn đã kê của một ca
router.get('/consultations/:id/prescription', ah(async (req, res) => {
    const { rows } = await db.query(
        `SELECT p.id, p.diagnosis, p.issued_date, p.valid_until,
                json_agg(json_build_object(
                    'drug', i.drug_name_raw, 'dosage', i.dosage, 'quantity', i.quantity,
                    'duration_days', i.duration_days, 'usage', i.usage_instructions)) AS items
         FROM prescriptions p
         JOIN prescription_items i ON i.prescription_id = p.id
         WHERE p.consultation_id = $1 AND p.doctor_profile_id = $2
         GROUP BY p.id`,
        [req.params.id, req.doctor.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Ca khám này chưa có đơn thuốc');
    res.json({ prescription: rows[0] });
}));
// Bắt đầu khám: WAITING -> IN_PROGRESS
router.put('/consultations/:id/start', ah(async (req, res) => {
    const r = await db.query(
        `UPDATE consultations SET status = 'IN_PROGRESS', started_at = NOW()
         WHERE id = $1 AND doctor_profile_id = $2 AND status = 'WAITING' RETURNING id`,
        [req.params.id, req.doctor.id]
    );
    if (!r.rows[0]) throw new HttpError(409, 'Ca khám không ở trạng thái chờ');
    res.json({ ok: true });
}));

module.exports = router;
