/* CareConnect - tiện ích dùng chung cho các phân hệ: gọi API, đăng nhập, toast, modal, định dạng */
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const home = document.createElement('a');
        home.href = '/';
        home.textContent = '← Đổi phân hệ';
        home.className = 'cc-switch-module';
        home.setAttribute('aria-label', 'Về trang chọn phân hệ CareConnect');
        document.body.appendChild(home);
    });
    const CC = (window.CC = window.CC || {});
    const TOKEN_KEY = 'cc_token';
    const USER_KEY = 'cc_user';

    /*
     * Phiên đăng nhập lưu theo từng tab (sessionStorage) để mỗi tab giữ một tài khoản riêng,
     * ví dụ tab trái là Con, tab phải là Bố mẹ khi demo. localStorage chỉ để tab mới mở
     * lấy lại lần đăng nhập gần nhất. Bộ nhớ trình duyệt có thể bị chặn nên luôn bọc try/catch.
     */
    function setIn(storage, key, value) {
        try {
            if (value === null) storage.removeItem(key);
            else storage.setItem(key, value);
        } catch (e) { /* bỏ qua */ }
    }
    function getIn(storage, key) {
        try { return storage.getItem(key); } catch (e) { return null; }
    }
    function store(key, value) {
        setIn(sessionStorage, key, value);
        setIn(localStorage, key, value);
    }
    // Tab mới mở: nhận lần đăng nhập gần nhất rồi giữ riêng cho tab này
    function adoptLatestLogin() {
        if (getIn(sessionStorage, TOKEN_KEY) !== null) return;
        const token = getIn(localStorage, TOKEN_KEY);
        if (token === null) return;
        setIn(sessionStorage, TOKEN_KEY, token);
        const user = getIn(localStorage, USER_KEY);
        if (user !== null) setIn(sessionStorage, USER_KEY, user);
    }
    function load(key) {
        adoptLatestLogin();
        return getIn(sessionStorage, key);
    }

    CC.loginUrl = '/buyer-family/login.html';

    CC.auth = {
        get token() { return load(TOKEN_KEY); },
        get user() {
            try { return JSON.parse(load(USER_KEY)); } catch (e) { return null; }
        },
        save(token, user) { store(TOKEN_KEY, token); store(USER_KEY, JSON.stringify(user)); },
        // Chỉ cập nhật tab hiện tại, tránh ghi đè lần đăng nhập của tab khác
        setUser(user) { setIn(sessionStorage, USER_KEY, JSON.stringify(user)); },
        clear() { store(TOKEN_KEY, null); store(USER_KEY, null); },
        logout() { CC.auth.clear(); location.href = CC.loginUrl; },
    };

    CC.api = async function (path, options = {}) {
        const { method = 'GET', body } = options;
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const token = CC.auth.token;
        if (token) headers.Authorization = 'Bearer ' + token;

        let res;
        try {
            res = await fetch('/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        } catch (e) {
            throw new Error('Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.');
        }
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && token) {
            CC.auth.clear();
            location.href = CC.loginUrl + '?next=' + encodeURIComponent(location.pathname + location.search);
            throw new Error(data.error || 'Phiên đăng nhập đã hết hạn');
        }
        if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại');
        return data;
    };

    CC.requireLogin = function () {
        if (CC.auth.token) return true;
        location.replace(CC.loginUrl + '?next=' + encodeURIComponent(location.pathname + location.search));
        return false;
    };

    CC.param = (name) => new URLSearchParams(location.search).get(name);

    // ------------------------------------------------------------------ HTML helpers
    CC.esc = function (value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    CC.$ = (sel, root = document) => root.querySelector(sel);
    CC.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    CC.initials = function (name) {
        const parts = String(name || '?').trim().split(/\s+/);
        const last = parts[parts.length - 1] || '?';
        return last.charAt(0).toUpperCase();
    };

    CC.avatar = function (user, size = '') {
        const cls = 'avatar' + (size ? ' avatar-' + size : '');
        if (user && user.avatar_url) return `<span class="${cls}"><img src="${CC.esc(user.avatar_url)}" alt=""></span>`;
        return `<span class="${cls}">${CC.esc(CC.initials(user && user.full_name))}</span>`;
    };

    // ------------------------------------------------------------------ Định dạng
    CC.fmt = {
        money(v) { return Number(v || 0).toLocaleString('vi-VN') + 'đ'; },
        date(v) {
            if (!v) return '';
            const [y, m, d] = String(v).slice(0, 10).split('-');
            return `${d}/${m}/${y}`;
        },
        // Lịch uống thuốc lưu theo giờ Việt Nam, nên hiển thị giờ cũng cố định múi giờ này
        time(v) {
            return new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        },
        dateTime(v) {
            const d = new Date(v);
            const tz = { timeZone: 'Asia/Ho_Chi_Minh' };
            return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', ...tz }) + ' ' + d.toLocaleDateString('vi-VN', tz);
        },
        ago(v) {
            const diff = (Date.now() - new Date(v).getTime()) / 1000;
            if (diff < 60) return 'Vừa xong';
            if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
            if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
            if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' ngày trước';
            return new Date(v).toLocaleDateString('vi-VN');
        },
        age(dob) {
            if (!dob) return null;
            const b = new Date(dob);
            const now = new Date();
            let age = now.getFullYear() - b.getFullYear();
            if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
            return age;
        },
        weekday(v) {
            const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
            return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
        },
        today() {
            return new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        },
        localDate(d = new Date()) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        },
    };

    // ------------------------------------------------------------------ Icon
    // Bộ icon nét mảnh dùng chung cho mọi phân hệ (Người dùng, Bác sĩ, Nhà thuốc) để giao diện nhất quán.
    // Bản React của các icon menu nằm ở frontend/buyer/components/UserShell.tsx.
    const ICONS = {
        home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z"/><path d="m8.5 8.5 7 7"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
        camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
        alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
        map: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
        truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
        chevron: '<path d="m9 18 6-6-6-6"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
        file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
        video: '<path d="m23 7-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        bellRing: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0M2 8c0-2.2.7-4.3 2-6M22 8a10 10 0 0 0-2-6"/>',
        doctor: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
        clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
        box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
        bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
        wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
        refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    };

    CC.icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

    // ------------------------------------------------------------------ Toast
    CC.toast = function (message, type = 'info', title = '') {
        let host = CC.$('.toast-host');
        if (!host) {
            host = document.createElement('div');
            host.className = 'toast-host';
            document.body.appendChild(host);
        }
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.innerHTML = `<div>${title ? `<div class="toast-title">${CC.esc(title)}</div>` : ''}<div>${CC.esc(message)}</div></div>`;
        host.appendChild(el);
        setTimeout(() => el.remove(), title ? 6000 : 3500);
    };

    // ------------------------------------------------------------------ Modal
    // Trả về { el, close }. Các nút [data-close] tự đóng modal.
    CC.modal = function (html, { onClose, className = '' } = {}) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `<div class="modal ${className}" role="dialog" aria-modal="true">${html}</div>`;
        document.body.appendChild(backdrop);
        const close = () => {
            backdrop.remove();
            if (onClose) onClose();
        };
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop || e.target.closest('[data-close]')) close();
        });
        return { el: backdrop.querySelector('.modal'), close };
    };

    CC.confirm = function (message, { okText = 'Đồng ý', danger = false } = {}) {
        return new Promise((resolve) => {
            let answered = false;
            const m = CC.modal(
                `<p style="font-size:1.02rem">${CC.esc(message)}</p>
                 <div class="modal-actions">
                    <button class="btn btn-outline" data-close>Hủy</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${CC.esc(okText)}</button>
                 </div>`,
                { onClose: () => { if (!answered) resolve(false); } }
            );
            m.el.querySelector('[data-ok]').addEventListener('click', () => {
                answered = true;
                m.close();
                resolve(true);
            });
        });
    };

    // Đọc dữ liệu form thành object
    CC.formData = function (form) {
        const data = {};
        for (const [k, v] of new FormData(form).entries()) data[k] = typeof v === 'string' ? v.trim() : v;
        return data;
    };

    // Khóa nút trong lúc gửi để tránh bấm nhiều lần
    CC.busy = async function (button, fn) {
        const old = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span>';
        try { return await fn(); } finally {
            button.disabled = false;
            button.innerHTML = old;
        }
    };
})();
