const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { signToken, requireAuth } = require('../middleware/auth');

const PHONE_RE = /^0\d{9}$/;
const USER_FIELDS = 'id, phone, email, full_name, date_of_birth, gender, avatar_url, role, ui_mode, care_coin_balance';

// Đăng ký tài khoản Người mua (Con cái hoặc Bố mẹ)
router.post('/register', ah(async (req, res) => {
    const { full_name, phone, password, email, date_of_birth, gender, ui_mode } = req.body;
    if (!full_name || !full_name.trim()) throw new HttpError(400, 'Vui lòng nhập họ tên');
    if (!PHONE_RE.test(phone || '')) throw new HttpError(400, 'Số điện thoại gồm 10 số và bắt đầu bằng 0');
    if ((password || '').length < 6) throw new HttpError(400, 'Mật khẩu tối thiểu 6 ký tự');
    if (ui_mode && !['STANDARD', 'SIMPLE'].includes(ui_mode)) throw new HttpError(400, 'Chế độ giao diện không hợp lệ');

    const exists = await db.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
    if (exists.rowCount) throw new HttpError(409, 'Số điện thoại này đã được đăng ký');

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
        `INSERT INTO users (full_name, phone, email, password_hash, date_of_birth, gender, ui_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${USER_FIELDS}`,
        [full_name.trim(), phone, email || null, hash, date_of_birth || null, gender || null, ui_mode || 'STANDARD']
    );
    res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
}));

router.post('/login', ah(async (req, res) => {
    const { phone, password } = req.body;
    const { rows } = await db.query(
        `SELECT ${USER_FIELDS}, password_hash, is_active FROM users WHERE phone = $1`,
        [phone || '']
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
        throw new HttpError(401, 'Số điện thoại hoặc mật khẩu không đúng');
    }
    if (!user.is_active) throw new HttpError(403, 'Tài khoản đã bị khóa');
    delete user.password_hash;
    delete user.is_active;
    res.json({ token: signToken(user), user });
}));

router.get('/me', requireAuth, ah(async (req, res) => {
    const { rows } = await db.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) throw new HttpError(401, 'Tài khoản không tồn tại');
    res.json({ user: rows[0] });
}));

module.exports = router;
module.exports.USER_FIELDS = USER_FIELDS;
module.exports.PHONE_RE = PHONE_RE;
