import { useEffect, useState } from 'react';
export default function Dataset({ onLoad, loaded }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [catalog, setCatalog] = useState([]);
    const [health, setHealth] = useState(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    async function checkHealth() {
        setHealth(null);
        try { const r = await fetch('/admin-api/health'); if (!r.ok) throw Error(); setHealth(await r.json()); }
        catch { setHealth({ error: 'Không kết nối được dịch vụ Admin' }); }
    }
    useEffect(() => { checkHealth(); }, []);
    async function load() {
        setBusy(true); setError('');
        try {
            const [state, products] = await Promise.all(['state', 'catalog'].map(async key => {
                const r = await fetch(`/admin-api/dataset/${key}`);
                if (!r.ok) throw new Error('Không tải được dataset. Kiểm tra dịch vụ Admin và data/demo.');
                return r.json();
            }));
            if (!Array.isArray(state.orders) || !state.wallets || !Array.isArray(products)) throw new Error('Dataset không đúng cấu trúc');
            setCatalog(products); onLoad(state); setPage(1);
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    }
    const filtered = catalog.filter(p => `${p.id} ${p.name} ${p.manufacturer}`.toLowerCase().includes(query.toLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / 25));
    return <section><h1>Dataset & kết nối</h1><p>Tên thuốc, hãng và hàm lượng lấy từ Kaggle Bangladesh. Giá VND, đối tác, đơn hàng và chi trả là giả lập; không phải danh mục cấp phép tại Việt Nam.</p><a href="https://www.kaggle.com/datasets/ahmedshahriarsakib/assorted-medicine-dataset-of-bangladesh" target="_blank" rel="noreferrer">Nguồn dataset Kaggle</a><p>Nạp bộ dữ liệu sẽ thay các đơn và ví đang dùng trong phiên Admin này. Thay đổi demo mất khi đăng xuất hoặc tải lại trang.</p><button disabled={busy || loaded} onClick={load}>{busy ? 'Đang tải dataset…' : loaded ? 'Đã nạp dataset lớn' : 'Nạp 100.000 đơn & danh mục thuốc'}</button>{error && <p role="alert">{error}</p>}<h2>Kết nối backend</h2><button onClick={checkHealth}>Kiểm tra lại kết nối</button>{!health ? <p>Đang kiểm tra…</p> : <><p>Family Care / Nhà thuốc: {health.familyPharmacy === 'connected' ? 'Đã kết nối' : health.familyPharmacy || health.error}</p><p>Mua thuốc: {health.buyer === 'connected' ? 'Đã kết nối' : health.buyer || health.error}</p></>}<h2>Tra cứu danh mục ({catalog.length.toLocaleString('vi-VN')} thuốc)</h2><label>Tìm mã, tên thuốc hoặc hãng<input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><div className="finance-table-wrapper"><table className="finance-table"><thead><tr><th>Mã</th><th>Tên thuốc</th><th>Hàm lượng</th><th>Hãng</th></tr></thead><tbody>{filtered.slice((page - 1) * 25, page * 25).map(p => <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.strength}</td><td>{p.manufacturer}</td></tr>)}</tbody></table></div><div className="data-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button><span>Trang {page}/{pages} · {filtered.length} kết quả</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Sau</button></div></section>;
}
