/* CareConnect - tiện ích dùng chung cho các phân hệ: gọi API, đăng nhập, toast, modal, định dạng */
(function () {
    const CC = (window.CC = window.CC || {});
    const TOKEN_KEY = 'cc_token';
    const USER_KEY = 'cc_user';

    // localStorage có thể bị chặn (chế độ ẩn danh...), nên luôn bọc try/catch
    function store(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch (e) { /* bỏ qua */ }
    }
    function load(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    CC.loginUrl = '/buyer-family/login.html';

    CC.auth = {
        get token() { return load(TOKEN_KEY); },
        get user() {
            try { return JSON.parse(load(USER_KEY)); } catch (e) { return null; }
        },
        save(token, user) { store(TOKEN_KEY, token); store(USER_KEY, JSON.stringify(user)); },
        setUser(user) { store(USER_KEY, JSON.stringify(user)); },
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
