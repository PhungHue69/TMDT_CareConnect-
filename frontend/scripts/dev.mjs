import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
const children = [];
let stopping = false;
function stop() {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
        if (child.exitCode !== null || !child.pid) continue;
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else child.kill();
    }
}
async function available(port) {
    return new Promise(resolve => {
        const socket = createConnection({ host: '127.0.0.1', port });
        socket.setTimeout(1000);
        socket.once('connect', () => { socket.destroy(); console.log(`Cổng ${port} đã có dịch vụ; giữ phiên đang chạy. Dừng terminal cũ nếu cần áp dụng bản sửa backend.`); resolve(false); });
        socket.once('error', () => { socket.destroy(); resolve(true); });
        socket.once('timeout', () => { socket.destroy(); resolve(true); });
    });
}
async function start(entry, args, cwd, port) {
    if (!await available(port)) return;
    const child = spawn(process.execPath, [entry, ...args], { cwd, stdio: 'inherit' });
    children.push(child);
    child.on('error', error => console.error(`Không khởi động được ${entry}: ${error.message}`));
    child.on('exit', code => { if (!stopping && code) console.error(`Dịch vụ dừng (mã ${code}): ${entry}. Các dịch vụ khác vẫn chạy; kiểm tra cổng hoặc cấu hình.`); });
}
async function backend(command, args, cwd, port) {
    if (!await available(port)) return;
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...(command === process.execPath ? {} : { DATABASE_URL: 'sqlite:///./o2o.db' }) } });
    children.push(child);
    child.on('error', () => console.error('Không chạy được backend. Xem docs/FRONTEND_INTEGRATION.md.'));
    child.on('exit', code => { if (code) console.error('Backend chưa sẵn sàng; frontend vẫn chạy. Kiểm tra Dataset & kết nối trong Admin.'); });
}
await start(fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), [], fileURLToPath(new URL('..', import.meta.url)), 5173);
await start(fileURLToPath(new URL('./admin-demo.mjs', import.meta.url)), [], fileURLToPath(new URL('..', import.meta.url)), 5001);
await start(fileURLToPath(new URL('../buyer/node_modules/next/dist/bin/next', import.meta.url)), ['dev', '--port', '3001'], fileURLToPath(new URL('../buyer', import.meta.url)), 3001);
const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url));
const python = fileURLToPath(new URL('../../backend/.venv/Scripts/python.exe', import.meta.url));
if (existsSync(python)) await backend(python, ['-m', 'scripts.run_buyer_demo'], backendDir, 8000);
if (existsSync(fileURLToPath(new URL('../../backend/node_modules/express/package.json', import.meta.url)))) await backend(process.execPath, [fileURLToPath(new URL('../../backend/src/server.js', import.meta.url))], backendDir, 5000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
process.on('exit', stop);
