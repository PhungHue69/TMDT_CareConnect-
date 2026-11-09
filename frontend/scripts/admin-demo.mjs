import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const sessions = new Map();
const attempts = new Map();
const hash = scryptSync(process.env.ADMIN_DEMO_PASSWORD || '123456', 'cc-demo', 32);
const files = { catalog: 'catalog.json', state: 'escrow-state.json', manifest: 'manifest.json' };
function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
}
createServer(async (req, res) => {
    try {
        const path = new URL(req.url, 'http://localhost').pathname;
        if (req.headers.origin && !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(req.headers.origin)) return send(res, 403, { error: 'Nguồn yêu cầu không hợp lệ' });
        if (path === '/admin-api/login' && req.method === 'POST') {
            const ip = req.socket.remoteAddress;
            const a = attempts.get(ip) || { count: 0, until: Date.now() + 60000 };
            if (a.until < Date.now()) { a.count = 0; a.until = Date.now() + 60000; }
            attempts.set(ip, a);
            if (++a.count > 15) return send(res, 429, { error: 'Vui lòng thử lại sau một phút' });
            let raw = '';
            for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send(res, 413, { error: 'Yêu cầu quá lớn' }); }
            let body;
            try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Dữ liệu không hợp lệ' }); }
            if (body.email !== 'admin@gmail.com' || typeof body.password !== 'string' || !timingSafeEqual(scryptSync(body.password, 'cc-demo', 32), hash)) return send(res, 401, { error: 'Email hoặc mật khẩu không đúng' });
            const token = randomBytes(32).toString('hex'); sessions.set(token, Date.now() + 28800000);
            return send(res, 200, { email: body.email }, { 'Set-Cookie': `cc_admin=${token}; HttpOnly; SameSite=Strict; Path=/admin-api; Max-Age=28800` });
        }
        const token = req.headers.cookie?.match(/(?:^|;\s*)cc_admin=([a-f0-9]+)/)?.[1];
        if (!token || (sessions.get(token) || 0) <= Date.now()) return send(res, 401, { error: 'Vui lòng đăng nhập Admin' });
        if (path === '/admin-api/logout' && req.method === 'POST') {
            sessions.delete(token);
            return send(res, 200, {}, { 'Set-Cookie': 'cc_admin=; HttpOnly; SameSite=Strict; Path=/admin-api; Max-Age=0' });
        }
        if (req.method !== 'GET') return send(res, 405, {});
        if (path === '/admin-api/session') return send(res, 200, { email: 'admin@gmail.com', demo: true });
        if (path === '/admin-api/health') {
            const results = await Promise.all([['familyPharmacy', 'http://127.0.0.1:5000/api/health'], ['buyer', 'http://127.0.0.1:8000/locations']].map(async ([name, address]) => {
                try { const r = await fetch(address, { signal: AbortSignal.timeout(4000) }); return [name, r.ok ? 'connected' : `HTTP ${r.status}`]; } catch { return [name, 'offline']; }
            }));
            return send(res, 200, Object.fromEntries(results));
        }
        const key = path.replace('/admin-api/dataset/', '');
        if (files[key]) {
            const content = await readFile(new URL(`../../data/demo/${files[key]}`, import.meta.url));
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(content);
        }
        send(res, 404, {});
    } catch { send(res, 500, { error: 'Không thể đọc dataset. Kiểm tra thư mục data/demo và dịch vụ Admin.' }); }
}).listen(Number(process.env.ADMIN_DEMO_PORT || 5001), '127.0.0.1', () => console.log('Admin demo API: http://127.0.0.1:5001'));
