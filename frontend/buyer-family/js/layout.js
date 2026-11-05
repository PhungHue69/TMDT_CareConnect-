/* Phân hệ Người mua - Family Care: khung giao diện (sidebar/tabbar), icon, chuông báo toàn cục */
(function () {
    const CC = window.CC;

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
    };

    CC.icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

    const NAV = [
        { key: 'home', href: 'index.html', label: 'Trang chủ', icon: 'home' },
        { key: 'reminders', href: 'reminders.html', label: 'Lịch thuốc', icon: 'pill' },
        { key: 'family', href: 'family.html', label: 'Gia đình', icon: 'users' },
        { key: 'notifications', href: 'notifications.html', label: 'Thông báo', icon: 'bell' },
        { key: 'profile', href: 'profile.html', label: 'Tài khoản', icon: 'user' },
    ];

    const brand = `<a class="topbar-brand" href="index.html"><span class="brand-mark">${CC.icon('heart', 'icon-sm')}</span>CareConnect</a>`;

    let state = { active: '', title: '', unread: 0 };

    function isSimple() {
        const u = CC.auth.user;
        return u && u.ui_mode === 'SIMPLE';
    }

    function renderShell() {
        const simple = isSimple();
        document.body.classList.toggle('simple', simple);
        const items = NAV;
        const link = (n, cls) => `<a class="${cls}${n.key === state.active ? ' active' : ''}" href="${n.href}">${CC.icon(n.icon)}<span>${n.label}</span></a>`;

        CC.$$('.sidebar, .topbar, .tabbar').forEach((el) => el.remove());
        const main = CC.$('main.content');
        main.insertAdjacentHTML('beforebegin', `
            <aside class="sidebar">${brand}${items.map((n) => link(n, 'nav-link')).join('')}</aside>
            <header class="topbar">
                <div class="topbar-title">${CC.esc(state.title)}</div>
                <a class="icon-btn" href="notifications.html" aria-label="Thông báo">
                    ${CC.icon('bell')}<span class="count-badge" data-unread hidden></span>
                </a>
            </header>`);
        main.insertAdjacentHTML('afterend', `<nav class="tabbar">${items.map((n) => link(n, 'tab')).join('')}</nav>`);
        setUnread(state.unread);
    }

    function setUnread(n) {
        state.unread = Math.max(0, n);
        CC.$$('[data-unread]').forEach((el) => {
            el.hidden = state.unread === 0;
            el.textContent = state.unread > 99 ? '99+' : state.unread;
        });
    }

    // ------------------------------------------------------------------ Chuông uống thuốc
    const ringQueue = [];
    let ringOpen = false;

    function showNextRing() {
        if (ringOpen || !ringQueue.length) return;
        ringOpen = true;
        const n = ringQueue.shift();
        const d = n.data_json || {};
        CC.sound.startRing();
        const m = CC.modal(`
            <div class="ring">
                <div class="ring-bell">${CC.icon('bellRing', 'icon-lg')}</div>
                <p class="muted">Đến giờ uống thuốc</p>
                <div class="ring-time">${CC.esc(d.schedule_time || '')}</div>
                ${d.pill_image_url ? `<img class="ring-img" src="${CC.esc(d.pill_image_url)}" alt="">` : ''}
                <h2 class="ring-drug">${CC.esc(d.drug_name || n.title)}</h2>
                <p class="ring-dose">${CC.esc(d.dosage || '')}${d.meal_note ? ' · ' + CC.esc(d.meal_note) : ''}</p>
                <button class="btn btn-success btn-lg btn-block ring-taken" data-taken>${CC.icon('check')} Đã uống</button>
                <button class="btn btn-ghost btn-block" data-close>Nhắc lại sau</button>
            </div>`, {
            className: 'ring-modal',
            onClose: () => {
                CC.sound.stopRing();
                ringOpen = false;
                setTimeout(showNextRing, 300);
            },
        });
        m.el.querySelector('[data-taken]').addEventListener('click', (e) =>
            CC.busy(e.currentTarget, async () => {
                try {
                    await CC.api(`/reminders/${d.reminder_id}/confirm`, { method: 'POST', body: { status: 'TAKEN' } });
                    await markRead(n);
                    CC.toast('Đã ghi nhận uống thuốc. Người nhà đang chăm sóc bạn sẽ nhận được thông báo.', 'success');
                    window.dispatchEvent(new CustomEvent('cc:dose-updated'));
                    m.close();
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            })
        );
    }

    function showMissedAlert(n) {
        const d = n.data_json || {};
        CC.sound.alert();
        CC.modal(`
            <div class="ring">
                <div class="ring-bell ring-bell-warn">${CC.icon('alert', 'icon-lg')}</div>
                <h2>${CC.esc(n.title)}</h2>
                <p class="muted">${CC.esc(n.body || '')}</p>
                ${d.patient_phone ? `<a class="btn btn-primary btn-lg btn-block" href="tel:${CC.esc(d.patient_phone)}">${CC.icon('phone')} Gọi ngay ${CC.esc(d.patient_phone)}</a>` : ''}
                <a class="btn btn-outline btn-block" href="reminders.html?patient_id=${CC.esc(d.patient_id || '')}">Xem lịch thuốc</a>
                <button class="btn btn-ghost btn-block" data-close>Đã hiểu</button>
            </div>`, { className: 'ring-modal' });
    }

    async function markRead(n) {
        if (n.is_read) return;
        n.is_read = true;
        setUnread(state.unread - 1);
        try { await CC.api(`/notifications/${n.id}/read`, { method: 'POST' }); } catch (e) { /* bỏ qua */ }
    }

    function handleNotification(n) {
        setUnread(state.unread + 1);
        const kind = (n.data_json || {}).kind;
        if (kind === 'RING') {
            ringQueue.push(n);
            showNextRing();
        } else if (kind === 'MISSED_DOSE') {
            showMissedAlert(n);
        } else {
            CC.sound.ding();
            CC.toast(n.body || '', kind === 'DOSE_TAKEN' ? 'success' : 'info', n.title);
        }
    }

    // ------------------------------------------------------------------ Khởi tạo trang
    CC.layout = {
        /**
         * Gọi đầu mỗi trang: kiểm tra đăng nhập, vẽ khung, mở kênh chuông báo.
         * Trả về thông tin user mới nhất (hoặc null nếu chưa đăng nhập).
         */
        async init({ active, title }) {
            if (!CC.requireLogin()) return null;
            state.active = active;
            state.title = title;
            renderShell();

            let user;
            try {
                ({ user } = await CC.api('/auth/me'));
            } catch (err) {
                CC.$('main.content').innerHTML = `<div class="card empty">${CC.icon('alert')}<p>${CC.esc(err.message)}</p><button class="btn btn-outline" onclick="location.reload()">Thử lại</button></div>`;
                return null;
            }
            const modeChanged = !CC.auth.user || CC.auth.user.ui_mode !== user.ui_mode;
            CC.auth.setUser(user);
            if (modeChanged) renderShell();

            CC.api('/notifications?limit=1').then((r) => setUnread(r.unread)).catch(() => {});
            CC.realtime.on(handleNotification);
            CC.realtime.connect();
            return user;
        },
        setTitle(title) {
            state.title = title;
            const el = CC.$('.topbar-title');
            if (el) el.textContent = title;
        },
        setUnread,
        markRead,
        isSimple,
        rerender: renderShell,
    };

    // Nhãn và màu cho trạng thái một liều thuốc trong ngày
    CC.doseStatus = {
        TAKEN: { label: 'Đã uống', cls: 'badge-success' },
        SKIPPED: { label: 'Bỏ qua', cls: 'badge-muted' },
        MISSED: { label: 'Chưa uống', cls: 'badge-danger' },
        DUE: { label: 'Đến giờ', cls: 'badge-warning' },
        UPCOMING: { label: 'Sắp tới', cls: '' },
        NEW: { label: 'Từ ngày mai', cls: 'badge-muted' },
    };
    CC.doseBadge = (s) => {
        const st = CC.doseStatus[s] || { label: s, cls: '' };
        return `<span class="badge ${st.cls}">${st.label}</span>`;
    };

    CC.orderStatus = {
        PENDING_CONFIRM: { label: 'Chờ nhà thuốc duyệt', cls: 'badge-warning' },
        CONFIRMED: { label: 'Nhà thuốc đã duyệt', cls: '' },
        PREPARING: { label: 'Đang chuẩn bị', cls: '' },
        SHIPPING: { label: 'Đang giao', cls: '' },
        COMPLETED: { label: 'Đã giao', cls: 'badge-success' },
        CANCELLED: { label: 'Đã hủy', cls: 'badge-danger' },
        RETURNED: { label: 'Hoàn hàng', cls: 'badge-muted' },
    };
    CC.orderBadge = (s) => {
        const st = CC.orderStatus[s] || { label: s, cls: '' };
        return `<span class="badge ${st.cls}">${st.label}</span>`;
    };

    // Buổi trong ngày theo giờ uống
    CC.partOfDay = (time) => {
        const h = Number(String(time).slice(0, 2));
        if (h < 11) return 'Sáng';
        if (h < 14) return 'Trưa';
        if (h < 18) return 'Chiều';
        return 'Tối';
    };
})();
