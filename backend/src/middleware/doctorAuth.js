/* Doctor Portal (TV3) - kiểm tra quyền Bác sĩ và nạp hồ sơ chuyên môn đang đăng nhập */
const db = require('../db');

// Đọc hồ sơ bác sĩ. consultation_modes ép sang text[] vì driver pg không tự đọc mảng enum;
// các cột numeric được pg trả về dạng chuỗi nên đổi sang số.
async function loadDoctor(userId) {
    const { rows } = await db.query(
        `SELECT id, license_number, avatar_url, specialty, workplace, years_of_experience, bio,
                consultation_fee, consultation_modes::text[] AS consultation_modes,
                is_online, rating, rating_count, verification_status
         FROM professional_profiles
         WHERE user_id = $1 AND professional_type = 'DOCTOR'::professional_type_enum`,
        [userId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
        ...row,
        consultation_fee: row.consultation_fee === null ? null : Number(row.consultation_fee),
        rating: row.rating === null ? null : Number(row.rating),
    };
}

async function requireDoctor(req, res, next) {
    if (!req.user || req.user.role !== 'DOCTOR') {
        return res.status(403).json({ error: 'Chức năng chỉ dành cho Bác sĩ' });
    }
    try {
        const doctor = await loadDoctor(req.user.id);
        if (!doctor) {
            return res.status(403).json({ error: 'Tài khoản chưa có hồ sơ bác sĩ' });
        }
        req.doctor = doctor;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { requireDoctor, loadDoctor };
