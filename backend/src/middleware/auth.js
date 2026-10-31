const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

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

module.exports = { signToken, requireAuth };
