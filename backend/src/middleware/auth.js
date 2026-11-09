const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('../db');

function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// Nhận token từ header Authorization, hoặc ?token= (EventSource không gửi được header)
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (!token) return res.status(401).json({ error: 'Vui lòng đăng nhập' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { id: Number(payload.id), role: payload.role };
        next();
    } catch (err) {
        res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
    }
}

// Middleware kiểm tra quyền Dược sĩ và ánh xạ thông tin Nhà thuốc đang trực
async function requirePharmacist(req, res, next) {
    if (!req.user || req.user.role !== 'PHARMACIST') {
        return res.status(403).json({ error: 'Chức năng chỉ dành cho Dược sĩ / Quản lý nhà thuốc' });
    }
    try {
        const { rows } = await db.query(
            `SELECT ps.pharmacy_id, ps.staff_role, ps.is_active,
                    p.name AS pharmacy_name, p.address AS pharmacy_address,
                    p.phone AS pharmacy_phone, p.gpp_certificate,
                    p.is_pro_seller, p.verification_status, p.rating, p.rating_count
             FROM pharmacy_staff ps
             JOIN pharmacies p ON p.id = ps.pharmacy_id
             WHERE ps.user_id = $1 AND ps.is_active = TRUE
             LIMIT 1`,
            [req.user.id]
        );
        if (!rows.length) {
            return res.status(403).json({ error: 'Tài khoản dược sĩ chưa được liên kết với Nhà thuốc nào hoặc đã bị vô hiệu hóa' });
        }
        req.pharmacy = rows[0];
        req.pharmacyId = rows[0].pharmacy_id;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { signToken, requireAuth, requirePharmacist };
