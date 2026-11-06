// API giả lập dùng khi demo, lúc chưa ghép phân hệ Nhà thuốc (TV4). Tắt khi NODE_ENV=production
const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { notifyOrderStatusChange } = require('../services/notifications');

const ALLOWED = ['CONFIRMED', 'PREPARING', 'SHIPPING', 'COMPLETED', 'CANCELLED'];

// Giả lập Nhà thuốc đổi trạng thái đơn -> Bố mẹ và Con nhận chuông báo
router.post('/orders/:id/status', ah(async (req, res) => {
    const status = req.body.status;
    if (!ALLOWED.includes(status)) throw new HttpError(400, 'Trạng thái không hợp lệ');
    const { rows } = await db.query('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy đơn hàng');

    await db.query('UPDATE orders SET status = $2 WHERE id = $1', [rows[0].id, status]);
    await db.query(
        `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
         VALUES ($1, $2, $3, $4, 'Giả lập từ màn hình demo Family Care')`,
        [rows[0].id, rows[0].status, status, req.user.id]
    );
    await notifyOrderStatusChange(rows[0].id);
    res.json({ ok: true });
}));

module.exports = router;
