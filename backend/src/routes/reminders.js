// Lịch nhắc uống thuốc (Medication_Reminders) và xác nhận "Đã uống"
const router = require('express').Router();
const db = require('../db');
const { TIMEZONE } = require('../config');
const { ah, HttpError } = require('../utils/http');
const { notify } = require('../services/notifications');
const { assertCanManage } = require('../services/family');
const {
    getTodayDoses, summarize, getHistory, ringPatient, notifyCaregiversConfirmed,
} = require('../services/reminders');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TODAY = `(now() AT TIME ZONE '${TIMEZONE}')::date`;

// patient_id lấy từ query/body, mặc định là chính mình
async function resolvePatient(req) {
    const patientId = Number(req.query.patient_id || req.body.patient_id || req.user.id);
    if (!Number.isInteger(patientId)) throw new HttpError(400, 'patient_id không hợp lệ');
    const access = await assertCanManage(req.user.id, patientId);
    return { patientId, ...access };
}

async function loadReminder(id, actorId) {
    const { rows } = await db.query('SELECT * FROM medication_reminders WHERE id = $1 AND is_active', [id]);
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy lịch nhắc');
    const access = await assertCanManage(actorId, rows[0].patient_user_id);
    return { reminder: rows[0], access };
}

function validateFields(body, { requireTimes }) {
    const drugName = (body.drug_name || '').trim();
    const dosage = (body.dosage || '').trim();
    if (!drugName) throw new HttpError(400, 'Vui lòng nhập tên thuốc');
    if (!dosage) throw new HttpError(400, 'Vui lòng nhập liều lượng (ví dụ: 1 viên)');
    if (body.start_date && !DATE_RE.test(body.start_date)) throw new HttpError(400, 'Ngày bắt đầu không hợp lệ');
    if (body.end_date && !DATE_RE.test(body.end_date)) throw new HttpError(400, 'Ngày kết thúc không hợp lệ');
    if (body.start_date && body.end_date && body.end_date < body.start_date) {
        throw new HttpError(400, 'Ngày kết thúc phải sau ngày bắt đầu');
    }
    let times = [];
    if (requireTimes) {
        times = [...new Set((body.schedule_times || []).map((t) => String(t).slice(0, 5)))];
        if (!times.length) throw new HttpError(400, 'Vui lòng chọn ít nhất một giờ uống');
        if (times.some((t) => !TIME_RE.test(t))) throw new HttpError(400, 'Giờ uống không hợp lệ');
    } else if (!TIME_RE.test(String(body.schedule_time || '').slice(0, 5))) {
        throw new HttpError(400, 'Giờ uống không hợp lệ');
    }
    return {
        drugName,
        dosage,
        times,
        mealNote: (body.meal_note || '').trim() || null,
        pillImage: (body.pill_image_url || '').trim() || null,
        startDate: body.start_date || null,
        endDate: body.end_date || null,
    };
}

router.get('/', ah(async (req, res) => {
    const { patientId } = await resolvePatient(req);
    const { rows } = await db.query(
        `SELECT r.id, r.patient_user_id, r.drug_name, r.dosage, r.meal_note, r.pill_image_url,
                to_char(r.schedule_time, 'HH24:MI') AS schedule_time,
                to_char(r.start_date, 'YYYY-MM-DD') AS start_date, to_char(r.end_date, 'YYYY-MM-DD') AS end_date,
                r.prescription_id, r.prescription_item_id, r.created_by_user_id, c.full_name AS created_by_name
         FROM medication_reminders r JOIN users c ON c.id = r.created_by_user_id
         WHERE r.patient_user_id = $1 AND r.is_active
         ORDER BY r.schedule_time, r.drug_name`,
        [patientId]
    );
    res.json({ reminders: rows });
}));

router.get('/today', ah(async (req, res) => {
    const { patientId } = await resolvePatient(req);
    const doses = await getTodayDoses([patientId]);
    res.json({ doses, summary: summarize(doses) });
}));

router.get('/history', ah(async (req, res) => {
    const { patientId } = await resolvePatient(req);
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
    res.json(await getHistory(patientId, days));
}));

// Thuốc trong các đơn đã kê/đã duyệt, để Con chọn nhanh khi tạo lịch
router.get('/prescription-items', ah(async (req, res) => {
    const { patientId } = await resolvePatient(req);
    const { rows } = await db.query(
        `SELECT pi.id, pi.prescription_id, COALESCE(md.name, pi.drug_name_raw) AS drug_name, pi.dosage,
                pi.quantity, pi.duration_days, pi.usage_instructions, md.image_url,
                to_char(p.issued_date, 'YYYY-MM-DD') AS issued_date, p.source
         FROM prescription_items pi
         JOIN prescriptions p ON p.id = pi.prescription_id
         LEFT JOIN master_drugs md ON md.id = pi.master_drug_id
         WHERE p.patient_user_id = $1 AND (p.source = 'E_PRESCRIPTION' OR p.ai_validation_status = 'APPROVED')
         ORDER BY p.created_at DESC, pi.id
         LIMIT 50`,
        [patientId]
    );
    res.json({ items: rows });
}));

// Tạo lịch: mỗi giờ uống là một dòng medication_reminders
router.post('/', ah(async (req, res) => {
    const { patientId, self } = await resolvePatient(req);
    const f = validateFields(req.body, { requireTimes: true });

    let prescriptionId = null;
    let prescriptionItemId = null;
    if (req.body.prescription_item_id) {
        const item = await db.query(
            `SELECT pi.id, pi.prescription_id FROM prescription_items pi
             JOIN prescriptions p ON p.id = pi.prescription_id
             WHERE pi.id = $1 AND p.patient_user_id = $2`,
            [req.body.prescription_item_id, patientId]
        );
        if (!item.rows[0]) throw new HttpError(400, 'Thuốc trong đơn không thuộc người này');
        prescriptionItemId = item.rows[0].id;
        prescriptionId = item.rows[0].prescription_id;
    }

    const created = await db.withTransaction(async (client) => {
        const rows = [];
        for (const time of f.times) {
            const result = await client.query(
                `INSERT INTO medication_reminders (patient_user_id, created_by_user_id, prescription_id, prescription_item_id,
                        drug_name, dosage, meal_note, pill_image_url, schedule_time, start_date, end_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, ${LOCAL_TODAY}), $11)
                 RETURNING id, drug_name, dosage, to_char(schedule_time, 'HH24:MI') AS schedule_time`,
                [patientId, req.user.id, prescriptionId, prescriptionItemId, f.drugName, f.dosage, f.mealNote,
                    f.pillImage, time, f.startDate, f.endDate]
            );
            rows.push(result.rows[0]);
        }
        return rows;
    });

    if (!self) {
        const { rows } = await db.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
        await notify(patientId, {
            type: 'MEDICATION_REMINDER',
            title: 'Con vừa cài lịch uống thuốc cho bạn',
            body: `${rows[0].full_name} đã cài: ${f.drugName} - ${f.dosage}, lúc ${f.times.sort().join(', ')}.`,
            data: { kind: 'REMINDER_CREATED', reminder_ids: created.map((r) => r.id) },
        });
    }
    res.status(201).json({ reminders: created });
}));

router.put('/:id', ah(async (req, res) => {
    const { reminder } = await loadReminder(req.params.id, req.user.id);
    const f = validateFields(req.body, { requireTimes: false });
    const { rows } = await db.query(
        `UPDATE medication_reminders SET drug_name = $2, dosage = $3, meal_note = $4, pill_image_url = $5,
                schedule_time = $6, start_date = COALESCE($7::date, start_date), end_date = $8
         WHERE id = $1 RETURNING id`,
        [reminder.id, f.drugName, f.dosage, f.mealNote, f.pillImage, String(req.body.schedule_time).slice(0, 5),
            f.startDate, f.endDate]
    );
    res.json({ reminder: rows[0] });
}));

// Xóa mềm để giữ lịch sử tuân thủ
router.delete('/:id', ah(async (req, res) => {
    const { reminder } = await loadReminder(req.params.id, req.user.id);
    await db.query('UPDATE medication_reminders SET is_active = FALSE WHERE id = $1', [reminder.id]);
    res.json({ ok: true });
}));

// Bấm "Đã uống" (hoặc "Bỏ qua") cho liều hôm nay
router.post('/:id/confirm', ah(async (req, res) => {
    const { reminder } = await loadReminder(req.params.id, req.user.id);
    const status = req.body.status === 'SKIPPED' ? 'SKIPPED' : 'TAKEN';

    const before = await db.query(
        `SELECT status, confirmed_at FROM medication_adherence_logs WHERE reminder_id = $1 AND scheduled_date = ${LOCAL_TODAY}`,
        [reminder.id]
    );
    if (before.rows[0] && before.rows[0].confirmed_at && before.rows[0].status === status) {
        return res.json({ log: before.rows[0], already: true });
    }

    const { rows } = await db.query(
        `INSERT INTO medication_adherence_logs (reminder_id, scheduled_date, status, confirmed_at)
         VALUES ($1, ${LOCAL_TODAY}, $2, now())
         ON CONFLICT (reminder_id, scheduled_date) DO UPDATE SET status = EXCLUDED.status, confirmed_at = now()
         RETURNING *`,
        [reminder.id, status]
    );
    await notifyCaregiversConfirmed(reminder, status, req.user.id, rows[0].confirmed_at);
    res.json({ log: rows[0] });
}));

// "Thử chuông": đổ chuông ngay trên máy người uống (dùng khi demo hoặc Con muốn nhắc lại)
router.post('/:id/ring-now', ah(async (req, res) => {
    const { reminder } = await loadReminder(req.params.id, req.user.id);
    const { rows } = await db.query(
        `INSERT INTO medication_adherence_logs (reminder_id, scheduled_date, status, reminded_at)
         VALUES ($1, ${LOCAL_TODAY}, 'MISSED', now())
         ON CONFLICT (reminder_id, scheduled_date) DO UPDATE
             SET status = 'MISSED', confirmed_at = NULL, reminded_at = now(), caregiver_notified_at = NULL
             WHERE medication_adherence_logs.status <> 'TAKEN'
         RETURNING to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date`,
        [reminder.id]
    );
    if (!rows[0]) throw new HttpError(409, 'Liều này hôm nay đã uống rồi');
    await ringPatient(reminder, rows[0].scheduled_date);
    res.json({ ok: true });
}));

module.exports = router;
