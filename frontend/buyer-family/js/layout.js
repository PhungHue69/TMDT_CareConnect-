/* Phân hệ Người mua - Family Care: khung giao diện (sidebar/tabbar), icon, chuông báo toàn cục */
(function () {
    const CC = window.CC;


    /*
     * Menu của ứng dụng Người dùng. Mua thuốc, Khám bác sĩ, Đơn hàng là các trang Next.js (/shop)
     * nhưng dùng cùng khung này (frontend/buyer/components/UserShell.tsx), nên hai nơi phải giữ cùng thứ tự.
     * mobile: true → hiện ở thanh tab dưới trên điện thoại (tối đa 5 mục).
     */
    const NAV = [
        { key: 'home', href: '/buyer-family/index.html', label: 'Trang chủ', icon: 'home', mobile: true },
        { key: 'shop', href: '/shop', label: 'Mua thuốc', icon: 'cart', mobile: true },
        { key: 'doctor', href: '/shop/doctor', label: 'Khám bác sĩ', icon: 'video' },
        { key: 'orders', href: '/shop/orders', label: 'Đơn hàng', icon: 'file', mobile: true },
        { key: 'reminders', href: '/buyer-family/reminders.html', label: 'Lịch thuốc', icon: 'pill' },
        { key: 'family', href: '/buyer-family/family.html', label: 'Gia đình', icon: 'users', mobile: true },
        { key: 'notifications', href: '/buyer-family/notifications.html', label: 'Thông báo', icon: 'bell' },
        { key: 'profile', href: '/buyer-family/profile.html', label: 'Tài khoản', icon: 'user', mobile: true },
    ];

    const brand = `<a class="topbar-brand" href="/buyer-family/index.html"><span class="brand-mark">${CC.icon('heart', 'icon-sm')}</span>CareConnect</a>`;

    // Số sản phẩm trong giỏ của trang Mua thuốc (cùng địa chỉ nên đọc chung localStorage)
    function cartCount() {
        try {
            const cart = JSON.parse(localStorage.getItem('o2o_cart') || '{}');
            return (cart.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);
        } catch (e) {
            return 0;
        }
    }

    let state = { active: '', title: '', unread: 0 };

    function isSimple() {
        const u = CC.auth.user;
        return u && u.ui_mode === 'SIMPLE';
    }

    function renderShell() {
        const simple = isSimple();
        document.body.classList.toggle('simple', simple);
        const link = (n, cls) => `<a class="${cls}${n.key === state.active ? ' active' : ''}" href="${n.href}">${CC.icon(n.icon)}<span>${n.label}</span></a>`;
        const cart = cartCount();

        CC.$$('.sidebar, .topbar, .tabbar').forEach((el) => el.remove());
        const main = CC.$('main.content');
        main.insertAdjacentHTML('beforebegin', `
            <aside class="sidebar">
                ${brand}${NAV.map((n) => link(n, 'nav-link')).join('')}
                <div class="sidebar-footer"><a href="/" class="muted">← Đổi phân hệ (demo)</a></div>
            </aside>
            <header class="topbar">
                <div class="topbar-title">${CC.esc(state.title)}</div>
                <div class="topbar-actions">
                    <a class="icon-btn" href="/shop/cart" aria-label="Giỏ hàng">
                        ${CC.icon('cart')}<span class="count-badge" ${cart ? '' : 'hidden'}>${cart}</span>
                    </a>
                    <a class="icon-btn" href="/buyer-family/notifications.html" aria-label="Thông báo">
                        ${CC.icon('bell')}<span class="count-badge" data-unread hidden></span>
                    </a>
                </div>
            </header>`);
        main.insertAdjacentHTML('afterend', `<nav class="tabbar">${NAV.filter((n) => n.mobile).map((n) => link(n, 'tab')).join('')}</nav>`);
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
                <a class="btn btn-outline btn-block" href="/buyer-family/reminders.html?patient_id=${CC.esc(d.patient_id || '')}">Xem lịch thuốc</a>
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
