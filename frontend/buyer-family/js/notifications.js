/* Chuông báo: danh sách thông báo, đánh dấu đã đọc, bật thông báo hệ thống */
(async function () {
    const CC = window.CC;
    const user = await CC.layout.init({ active: 'notifications', title: 'Thông báo' });
    if (!user) return;

    const page = CC.$('#page');
    let filter = 'all';
    let items = [];

    const KIND_STYLE = {
        RING: { icon: 'bellRing', cls: '' },
        MISSED_DOSE: { icon: 'alert', cls: 'warn' },
        DOSE_TAKEN: { icon: 'check', cls: 'ok' },
        DOSE_SKIPPED: { icon: 'x', cls: '' },
        REMINDER_CREATED: { icon: 'clock', cls: '' },
        ORDER_STATUS: { icon: 'truck', cls: 'order' },
        HELP_REQUEST: { icon: 'cart', cls: 'warn' },
        FAMILY_LINK_REQUEST: { icon: 'users', cls: '' },
        FAMILY_LINKED: { icon: 'users', cls: 'ok' },
    };

    // Bấm vào thông báo thì mở màn hình liên quan
    function targetUrl(n) {
        const d = n.data_json || {};
        switch (d.kind) {
            case 'RING': case 'REMINDER_CREATED': case 'ORDER_STATUS': return 'index.html';
            case 'MISSED_DOSE': case 'DOSE_TAKEN': case 'DOSE_SKIPPED': return `reminders.html?patient_id=${d.patient_id}`;
            case 'FAMILY_LINK_REQUEST': case 'FAMILY_LINK_REJECTED': case 'FAMILY_UNLINKED': return 'family.html';
            case 'FAMILY_LINKED': return d.user_id && user.ui_mode !== 'SIMPLE' ? `family.html?member=${d.user_id}` : 'family.html';
            case 'HELP_REQUEST': return d.phone ? `tel:${d.phone}` : null;
            default: return null;
        }
    }

    async function load() {
        const data = await CC.api('/notifications?limit=100');
        items = data.items;
        CC.layout.setUnread(data.unread);
        render();
    }

    function render() {
        const list = filter === 'unread' ? items.filter((n) => !n.is_read) : items;
        const unread = items.filter((n) => !n.is_read).length;
        const canAsk = 'Notification' in window && Notification.permission === 'default';
        page.innerHTML = `
            <div class="stack">
                ${canAsk ? `
                <div class="card card-soft row">
                    ${CC.icon('bellRing')}
                    <span class="grow small">Bật thông báo của trình duyệt để nhận chuông nhắc thuốc cả khi đang mở tab khác.</span>
                    <button class="btn btn-sm btn-primary" id="enable-push">Bật</button>
                </div>` : ''}
                <div class="row between">
                    <div class="segmented" style="flex:0 1 280px">
                        <button data-filter="all" class="${filter === 'all' ? 'active' : ''}">Tất cả</button>
                        <button data-filter="unread" class="${filter === 'unread' ? 'active' : ''}">Chưa đọc${unread ? ` (${unread})` : ''}</button>
                    </div>
                    <button class="btn btn-sm btn-ghost" id="read-all" ${unread ? '' : 'disabled'}>Đọc tất cả</button>
                </div>
                <section class="card" style="padding:0;overflow:hidden">
                    ${list.length ? list.map(item).join('') : `<div class="empty">${CC.icon('bell')}<p>${filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}</p></div>`}
                </section>
            </div>`;

        CC.$$('[data-filter]', page).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));
        CC.$('#read-all').addEventListener('click', async () => {
            await CC.api('/notifications/read-all', { method: 'POST' });
            items.forEach((n) => { n.is_read = true; });
            CC.layout.setUnread(0);
            render();
        });
        const enable = CC.$('#enable-push');
        if (enable) enable.addEventListener('click', async () => {
            if (await CC.requestSystemNotifications()) CC.toast('Đã bật thông báo trình duyệt', 'success');
            render();
        });
        CC.$$('[data-noti]', page).forEach((el) => el.addEventListener('click', async () => {
            const n = items.find((x) => x.id === Number(el.dataset.noti));
            await CC.layout.markRead(n);
            const url = targetUrl(n);
            if (url) location.href = url;
            else render();
        }));
    }

    function item(n) {
        const style = KIND_STYLE[(n.data_json || {}).kind] || { icon: 'bell', cls: '' };
        return `
            <div class="noti ${n.is_read ? '' : 'unread'}" data-noti="${n.id}" role="button" tabindex="0">
                <span class="noti-icon ${style.cls}">${CC.icon(style.icon, 'icon-sm')}</span>
                <div class="grow">
                    <div class="strong">${CC.esc(n.title)}</div>
                    ${n.body ? `<div class="small muted">${CC.esc(n.body)}</div>` : ''}
                    <div class="small muted" style="margin-top:2px">${CC.fmt.ago(n.created_at)}</div>
                </div>
                ${n.is_read ? '' : '<span class="noti-dot"></span>'}
            </div>`;
    }

    await load();
    window.addEventListener('cc:notification', (e) => {
        items.unshift(e.detail);
        render();
    });
})();
