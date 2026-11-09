import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tinhThongKe, tinhHoaHong, tinhTienDoiTac } from '../src/admin-escrow/services/escrow.js';

test('Admin session, protected datasets, totals and logout', async () => {
    const server = spawn(process.execPath, [new URL('./admin-demo.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], { env: { ...process.env, ADMIN_DEMO_PORT: '15001', ADMIN_DEMO_PASSWORD: '123456' }, stdio: ['ignore', 'pipe', 'inherit'] });
    try {
        await once(server.stdout, 'data');
        const base = 'http://127.0.0.1:15001/admin-api';
        assert.equal((await fetch(`${base}/dataset/state`)).status, 401);
        const login = password => fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@gmail.com', password }) });
        assert.equal((await login('wrong')).status, 401);
        const response = await login('123456');
        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie'), /HttpOnly/);
        const headers = { Cookie: response.headers.get('set-cookie').split(';')[0] };
        assert.equal((await fetch(`${base}/session`, { headers })).status, 200);
        const state = await (await fetch(`${base}/dataset/state`, { headers })).json();
        const manifest = await (await fetch(`${base}/dataset/manifest`, { headers })).json();
        assert.equal(state.orders.length, manifest.orderCount);
        assert.deepEqual(tinhThongKe(state.orders), manifest.expectedStats);
        for (const order of state.orders) if (['completed', 'paid_out'].includes(order.status)) {
            assert.equal(order.hoaHong, tinhHoaHong(order.subtotal, order.commissionRate));
            assert.equal(order.tienDoiTac, tinhTienDoiTac(order));
        }
        assert.equal((await fetch(`${base}/logout`, { method: 'POST', headers })).status, 200);
        assert.equal((await fetch(`${base}/session`, { headers })).status, 401);
    } finally { server.kill(); }
});
