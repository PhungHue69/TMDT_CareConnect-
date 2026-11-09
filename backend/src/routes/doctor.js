/* Doctor Portal (TV3) - API cho bác sĩ. Mount tại /api/doctor (đã qua requireAuth + requireDoctor) */
const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { loadDoctor } = require('../middleware/doctorAuth');
const { notify } = require('../services/notifications');

const FEE_MIN = 5000;
const FEE_MAX = 30000;
const MODES = ['CHAT', 'AUDIO', 'VIDEO'];

// Hoa hồng sàn khi tất toán ca khám: dùng tỷ lệ đã chốt lúc người bệnh đặt khám (consultations.commission_rate,
// lấy từ commission_rules 'CONSULTATION'). Số dưới đây chỉ dùng cho ca khám không có tỷ lệ.
const PLATFORM_FEE_RATE = 0.1;
// Giá trị enum transaction_type cho khoản thu nhập từ ca khám.
// PHẢI khớp enum trong DB (xem migration của bảng wallet_transactions), nếu sai sẽ báo lỗi 500.
const TX_EARNING_TYPE = 'CONSULTATION_EARNING';

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
                EXISTS (SELECT 1 FROM prescriptions p WHERE p.consultation_id = c.id) AS has_prescription
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
         -- Ưu tiên thuốc đang bán ở các nhà thuốc trên trang Mua thuốc để người bệnh mua được theo đơn
         ORDER BY (shop_ref IS NULL), name
         LIMIT 20`,
        [q]
    );
    res.json({ drugs: rows });
}));

// Kê đơn điện tử cho một ca khám, sau đó tất toán phí khám vào ví bác sĩ
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

    // Ca khám phải thuộc bác sĩ này (lấy thêm fee_amount để tất toán)
    const c = await db.query(
        `SELECT id, patient_user_id, booker_user_id, fee_amount, commission_rate, payment_status
         FROM consultations WHERE id = $1 AND doctor_profile_id = $2`,
        [req.params.id, req.doctor.id]
    );
    if (!c.rows[0]) throw new HttpError(404, 'Không tìm thấy ca khám');

    // Mỗi ca chỉ kê một đơn (cũng đảm bảo mỗi ca chỉ tất toán một lần)
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

    const diagText = diagnosis ? String(diagnosis).slice(0, 1000) : null;
    // Khám xong: phí khám đang tạm giữ (Escrow) được giải phóng
    await db.query(
        `UPDATE consultations SET diagnosis = $1, status = 'COMPLETED', ended_at = NOW(),
                payment_status = CASE WHEN payment_status = 'HOLDING_ESCROW' THEN 'RELEASED'::payment_status_enum ELSE payment_status END
         WHERE id = $2`,
        [diagText, c.rows[0].id]
    );

    // Báo người bệnh (và người đặt khám hộ, ví dụ con đặt cho bố mẹ) để mang đơn đi mua thuốc
    const notifyTo = new Set([Number(c.rows[0].patient_user_id), Number(c.rows[0].booker_user_id)].filter(Boolean));
    for (const userId of notifyTo) {
        try {
            await notify(userId, {
                type: 'CONSULTATION_UPDATE',
                title: 'Bác sĩ đã kê đơn thuốc',
                body: `${req.doctor.specialty ? req.doctor.specialty + ' · ' : ''}Chẩn đoán: ${diagText || 'xem trong đơn'}. Vào mục Khám bác sĩ để gửi đơn cho nhà thuốc gần nhà.`,
                data: { kind: 'E_PRESCRIPTION', consultation_id: Number(c.rows[0].id), prescription_id: Number(rows[0].prescription_id) },
            });
        } catch (err) {
            console.error('notify', err.message);
        }
    }

    // Tất toán: cộng tiền vào ví bác sĩ sau khi trừ hoa hồng sàn
    const fee = Number(c.rows[0].fee_amount) || 0;
    const rate = c.rows[0].commission_rate === null ? PLATFORM_FEE_RATE : Number(c.rows[0].commission_rate);
    const net = Math.round(fee * (1 - rate));
    const commission = fee - net;
    if (net > 0) {
        let w = await db.query(
            `SELECT id FROM wallets WHERE user_id = $1 AND owner_type = 'DOCTOR' LIMIT 1`,
            [req.user.id]
        );
        if (!w.rows[0]) {
            w = await db.query(
                `INSERT INTO wallets (user_id, owner_type, balance, pending_escrow_balance)
                 VALUES ($1, 'DOCTOR', 0, 0) RETURNING id`,
                [req.user.id]
            );
        }
        await db.query(
            `WITH w AS (
                UPDATE wallets SET balance = balance + $2 WHERE id = $1 RETURNING id, balance
             )
             INSERT INTO wallet_transactions
                (wallet_id, consultation_id, transaction_type, amount, balance_after, description)
             SELECT w.id, $3, $5, $2, w.balance, $4 FROM w`,
            [w.rows[0].id, net, c.rows[0].id,
             `Phí khám ${fee}đ, hoa hồng sàn ${commission}đ`, TX_EARNING_TYPE]
        );
    }

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

// ===== VÍ & THU NHẬP =====
router.get('/wallet', ah(async (req, res) => {
    const w = await db.query(
        `SELECT id, balance, pending_escrow_balance FROM wallets WHERE user_id = $1 AND owner_type = 'DOCTOR' LIMIT 1`,
        [req.user.id]
    );
    const wallet = w.rows[0] || { id: null, balance: 0, pending_escrow_balance: 0 };

    let transactions = [];
    let payouts = [];
    if (wallet.id) {
        const t = await db.query(
            `SELECT id, consultation_id, transaction_type::text AS transaction_type,
                    amount, balance_after, description, created_at
             FROM wallet_transactions WHERE wallet_id = $1
             ORDER BY created_at DESC LIMIT 50`,
            [wallet.id]
        );
        transactions = t.rows;
        const p = await db.query(
            `SELECT id, amount, bank_name, bank_account_number, account_holder,
                    status::text AS status, created_at, processed_at
             FROM payout_requests WHERE wallet_id = $1
             ORDER BY created_at DESC LIMIT 20`,
            [wallet.id]
        );
        payouts = p.rows;
    }

    const s = await db.query(
        `SELECT COUNT(*)::int AS completed_count, COALESCE(SUM(fee_amount), 0) AS gross_fee
         FROM consultations WHERE doctor_profile_id = $1 AND status = 'COMPLETED'`,
        [req.doctor.id]
    );
    res.json({ wallet, transactions, payouts, stats: s.rows[0] });
}));

// Gửi yêu cầu rút tiền (Admin sẽ xử lý)
router.post('/wallet/payout', ah(async (req, res) => {
    const amount = Number(req.body.amount);
    const bank_name = String(req.body.bank_name || '').trim().slice(0, 100);
    const bank_account_number = String(req.body.bank_account_number || '').trim().slice(0, 30);
    const account_holder = String(req.body.account_holder || '').trim().slice(0, 100);

    if (!Number.isInteger(amount) || amount < 10000) {
        throw new HttpError(400, 'Số tiền rút tối thiểu là 10.000đ');
    }
    if (!bank_name || !bank_account_number || !account_holder) {
        throw new HttpError(400, 'Vui lòng nhập đủ thông tin ngân hàng');
    }

    const w = await db.query(
        `SELECT id, balance FROM wallets WHERE user_id = $1 AND owner_type = 'DOCTOR' LIMIT 1`,
        [req.user.id]
    );
    if (!w.rows[0]) throw new HttpError(404, 'Bạn chưa có ví');
    if (Number(w.rows[0].balance) < amount) throw new HttpError(400, 'Số dư không đủ');

    // Chặn rút vượt số dư khi đã có yêu cầu chờ duyệt
    const pend = await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payout_requests WHERE wallet_id = $1 AND status = 'PENDING'`,
        [w.rows[0].id]
    );
    if (Number(w.rows[0].balance) - Number(pend.rows[0].total) < amount) {
        throw new HttpError(400, 'Số dư khả dụng không đủ (đang có yêu cầu rút chờ duyệt)');
    }

    const r = await db.query(
        `INSERT INTO payout_requests (wallet_id, amount, bank_name, bank_account_number, account_holder, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING id`,
        [w.rows[0].id, amount, bank_name, bank_account_number, account_holder]
    );
    res.status(201).json({ payout_id: r.rows[0].id });
}));

// ===== ĐÁNH GIÁ =====
router.get('/reviews', ah(async (req, res) => {
    const { rows } = await db.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, r.consultation_id,
                u.full_name AS patient_name
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.doctor_profile_id = $1
         ORDER BY r.created_at DESC
         LIMIT 100`,
        [req.doctor.id]
    );
    const s = await db.query(
        `SELECT COUNT(*)::int AS total, COALESCE(ROUND(AVG(rating), 1), 0) AS average
         FROM reviews WHERE doctor_profile_id = $1`,
        [req.doctor.id]
    );
    res.json({ reviews: rows, summary: s.rows[0] });
}));

module.exports = router;