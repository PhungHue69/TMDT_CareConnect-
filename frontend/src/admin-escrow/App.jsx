import { useEffect, useState } from 'react';
import AdminDashboard from "./AdminDashboard";

export default function App() {
    const [session, setSession] = useState(null);
    const [checking, setChecking] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        fetch('/admin-api/session').then(async r => { if (r.ok) setSession(await r.json()); }).catch(() => {}).finally(() => setChecking(false));
    }, []);
    async function login(event) {
        event.preventDefault(); setBusy(true); setError('');
        const data = new FormData(event.currentTarget);
        try {
            const r = await fetch('/admin-api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)) });
            const body = await r.json(); if (!r.ok) throw new Error(body.error); setSession(body);
        } catch (e) { setError(e.message || 'Không kết nối được dịch vụ đăng nhập'); }
        finally { setBusy(false); }
    }
    async function logout() {
        try { const r = await fetch('/admin-api/logout', { method: 'POST' }); if (!r.ok) throw new Error('Không thể đăng xuất'); setSession(null); }
        catch (e) { setError(e.message); }
    }
    if (checking) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
    if (session) return <><div className="admin-session"><span>{session.email} · Admin demo</span><button onClick={logout}>Đăng xuất</button>{error && <p role="alert">{error}</p>}</div><AdminDashboard /></>;
    return <main className="admin-login"><form onSubmit={login}><h1>Đăng nhập Admin</h1><p>CareConnect · Trang quản trị demo</p><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button><p>Tài khoản demo: admin@gmail.com / 123456</p></form></main>;
}
