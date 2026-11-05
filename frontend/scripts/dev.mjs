import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const children = [];
function start(entry, args, cwd) {
    const child = spawn(process.execPath, [entry, ...args], { cwd, stdio: 'inherit' });
    children.push(child);
    child.on('exit', code => { for (const other of children) if (other !== child) other.kill(); process.exitCode = code ?? 1; });
}
start(fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), [], fileURLToPath(new URL('..', import.meta.url)));
start(fileURLToPath(new URL('../buyer/node_modules/next/dist/bin/next', import.meta.url)), ['dev', '--port', '3001'], fileURLToPath(new URL('../buyer', import.meta.url)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) child.kill(); });
