// Quản lý tài khoản cá nhân: thông tin, chế độ giao diện, mật khẩu, hồ sơ sức khỏe, sổ địa chỉ
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { USER_FIELDS, PHONE_RE } = require('./auth');
const { getHealthProfile, upsertHealthProfile } = require('../services/healthProfile');

async function listAddresses(userId) {
    const { rows } = await db.query(
        `SELECT id, label, recipient_name, recipient_phone, address_line, latitude, longitude, is_default
         FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at`,
        [userId]
    );
    return rows;
}

router.get('/', ah(async (req, res) => {
    const { rows } = await db.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [req.user.id]);
    res.json({
        user: rows[0],
        health_profile: await getHealthProfile(req.user.id),
        addresses: await listAddresses(req.user.id),
    });
}));

router.put('/', ah(async (req, res) => {
    const { full_name, email, date_of_birth, gender, avatar_url } = req.body;
    if (!full_name || !full_name.trim()) throw new HttpError(400, 'Vui lòng nhập họ tên');
    const { rows } = await db.query(
        `UPDATE users SET full_name = $2, email = $3, date_of_birth = $4, gender = $5, avatar_url = $6
         WHERE id = $1 RETURNING ${USER_FIELDS}`,
        [req.user.id, full_name.trim(), email || null, date_of_birth || null, gender || null, avatar_url || null]
    );
    res.json({ user: rows[0] });
}));

router.put('/ui-mode', ah(async (req, res) => {
    const { ui_mode } = req.body;
    if (!['STANDARD', 'SIMPLE'].includes(ui_mode)) throw new HttpError(400, 'Chế độ giao diện không hợp lệ');
    const { rows } = await db.query(
        `UPDATE users SET ui_mode = $2 WHERE id = $1 RETURNING ${USER_FIELDS}`,
        [req.user.id, ui_mode]
    );
    res.json({ user: rows[0] });
}));

router.put('/password', ah(async (req, res) => {
    const { current_password, new_password } = req.body;
    if ((new_password || '').length < 6) throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự');
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(current_password || '', rows[0].password_hash))) {
        throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    }
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await bcrypt.hash(new_password, 10)]);
    res.json({ ok: true });
}));

router.put('/health', ah(async (req, res) => {
    res.json({ health_profile: await upsertHealthProfile(req.user.id, req.body) });
}));

// ---------------------------------------------------------------- Sổ địa chỉ
function validateAddress(body) {
    const { recipient_name, recipient_phone, address_line, latitude, longitude } = body;
    if (!recipient_name || !address_line) throw new HttpError(400, 'Vui lòng nhập tên người nhận và địa chỉ');
    if (!PHONE_RE.test(recipient_phone || '')) throw new HttpError(400, 'Số điện thoại người nhận không hợp lệ');
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!latitude || !longitude || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new HttpError(400, 'Vui lòng lấy tọa độ cho địa chỉ (bấm "Tìm tọa độ" hoặc "Vị trí hiện tại")');
    }
    return [body.label || null, recipient_name, recipient_phone, address_line, lat, lng, Boolean(body.is_default)];
}

router.get('/addresses', ah(async (req, res) => {
    res.json({ addresses: await listAddresses(req.user.id) });
}));

router.post('/addresses', ah(async (req, res) => {
    const values = validateAddress(req.body);
    await db.withTransaction(async (client) => {
        const count = await client.query('SELECT COUNT(*)::int AS n FROM user_addresses WHERE user_id = $1', [req.user.id]);
        const isDefault = values[6] || count.rows[0].n === 0;
        if (isDefault) await client.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1', [req.user.id]);
        await client.query(
            `INSERT INTO user_addresses (user_id, label, recipient_name, recipient_phone, address_line, latitude, longitude, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [req.user.id, ...values.slice(0, 6), isDefault]
        );
    });
    res.status(201).json({ addresses: await listAddresses(req.user.id) });
}));

router.put('/addresses/:id', ah(async (req, res) => {
    const values = validateAddress(req.body);
    await db.withTransaction(async (client) => {
        if (values[6]) await client.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1', [req.user.id]);
        const result = await client.query(
            `UPDATE user_addresses SET label = $3, recipient_name = $4, recipient_phone = $5, address_line = $6,
                    latitude = $7, longitude = $8, is_default = (is_default OR $9)
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id, ...values]
        );
        if (!result.rowCount) throw new HttpError(404, 'Không tìm thấy địa chỉ');
    });
    res.json({ addresses: await listAddresses(req.user.id) });
}));

router.delete('/addresses/:id', ah(async (req, res) => {
    const { rows } = await db.query(
        'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING is_default',
        [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy địa chỉ');
    if (rows[0].is_default) {
        await db.query(
            `UPDATE user_addresses SET is_default = TRUE
             WHERE id = (SELECT id FROM user_addresses WHERE user_id = $1 ORDER BY created_at LIMIT 1)`,
            [req.user.id]
        );
    }
    res.json({ addresses: await listAddresses(req.user.id) });
}));

module.exports = router;
