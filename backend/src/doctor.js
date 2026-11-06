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

module.exports = router;
