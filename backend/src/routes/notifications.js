// Chuông báo: danh sách thông báo và kênh realtime
const router = require('express').Router();
const db = require('../db');
const { ah } = require('../utils/http');
const { addClient, removeClient } = require('../services/notifications');

router.get('/', ah(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const unreadOnly = req.query.unread === '1';
    const { rows } = await db.query(
        `SELECT * FROM notifications WHERE user_id = $1 ${unreadOnly ? 'AND NOT is_read' : ''}
         ORDER BY created_at DESC LIMIT $2`,
        [req.user.id, limit]
    );
    const count = await db.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT is_read', [req.user.id]);
    res.json({ items: rows, unread: count.rows[0].n });
}));

router.post('/read-all', ah(async (req, res) => {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read', [req.user.id]);
    res.json({ ok: true });
}));

router.post('/:id/read', ah(async (req, res) => {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
}));

// Server-Sent Events: trình duyệt giữ kết nối, máy chủ đẩy thông báo mới ngay lập tức
router.get('/stream', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const userId = req.user.id;
    addClient(userId, res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
        clearInterval(heartbeat);
        removeClient(userId, res);
    });
});

module.exports = router;
