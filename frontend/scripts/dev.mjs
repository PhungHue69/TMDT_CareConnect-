import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const children = [];
function start(entry, args, cwd) {
    const child = spawn(process.execPath, [entry, ...args], { cwd, stdio: 'inherit' });
    children.push(child);
    child.on('exit', code => { for (const other of children) if (other !== child) other.kill(); process.exitCode = code ?? 1; });
}
function backend(command, args, cwd) {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...(command === process.execPath ? {} : { DATABASE_URL: 'sqlite:///./o2o.db' }) } });
    children.push(child);
    child.on('error', () => console.error('Không chạy được backend. Xem docs/FRONTEND_INTEGRATION.md.'));
    child.on('exit', code => { if (code) console.error('Backend chưa sẵn sàng; frontend vẫn chạy. Kiểm tra Dataset & kết nối trong Admin.'); });
}
start(fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), [], fileURLToPath(new URL('..', import.meta.url)));
start(fileURLToPath(new URL('./admin-demo.mjs', import.meta.url)), [], fileURLToPath(new URL('..', import.meta.url)));
start(fileURLToPath(new URL('../buyer/node_modules/next/dist/bin/next', import.meta.url)), ['dev', '--port', '3001'], fileURLToPath(new URL('../buyer', import.meta.url)));
const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url));
const python = fileURLToPath(new URL('../../backend/.venv/Scripts/python.exe', import.meta.url));
if (existsSync(python)) backend(python, ['-m', 'scripts.run_buyer_demo'], backendDir);
if (existsSync(fileURLToPath(new URL('../../backend/node_modules/express/package.json', import.meta.url)))) backend(process.execPath, [fileURLToPath(new URL('../../backend/src/server.js', import.meta.url))], backendDir);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) child.kill(); });
