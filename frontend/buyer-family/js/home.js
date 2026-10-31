/*
 * Trang chủ người mua. Mọi tài khoản đều có đủ dịch vụ; chế độ Đơn giản chỉ khác cách
 * hiển thị (chữ to, thuốc hôm nay lên đầu) để người lớn tuổi dễ dùng.
 */
(async function () {
    const CC = window.CC;

    /*
     * Các dịch vụ trên trang chủ. Khi ghép phân hệ, thành viên phụ trách sửa href
     * tới trang của mình và đổi ready thành true.
     */
    const SERVICES = [
        { label: 'Mua thuốc', desc: 'Thuốc không kê đơn, TPCN, thiết bị y tế quanh bạn', icon: 'cart', href: '', owner: 'TV2', ready: false },
        { label: 'Gửi đơn thuốc', desc: 'Chụp đơn, AI kiểm tra rồi gửi nhà thuốc báo giá', icon: 'file', href: '', owner: 'TV2', ready: false },
        { label: 'Khám bác sĩ online', desc: 'Chat, gọi video với bác sĩ từ 5.000đ', icon: 'video', href: '', owner: 'TV3', ready: false },
        { label: 'Đặt lịch phòng khám', desc: 'Chọn phòng khám, ngày giờ cho mình hoặc người thân', icon: 'calendar', href: '', owner: 'TV4', ready: false },
        { label: 'Gia đình', desc: 'Liên kết với gia đình, xem hồ sơ sức khỏe', icon: 'users', href: 'family.html', owner: 'TV1', ready: true },
        { label: 'Lịch uống thuốc', desc: 'Nhắc giờ uống thuốc cho mình và người thân', icon: 'clock', href: 'reminders.html', owner: 'TV1', ready: true },
    ];
    const user = await CC.layout.init({ active: 'home', title: 'Trang chủ' });
    if (!user) return;

    const page = CC.$('#page');
    const config = await CC.api('/config').catch(() => ({}));
    const simple = user.ui_mode === 'SIMPLE';
    const firstName = user.full_name.trim().split(/\s+/).pop();

    async function render() {
        // Không vẽ lại khi người dùng đang gõ tìm kiếm, tránh mất chữ đang nhập
        if (document.activeElement && document.activeElement.closest('#search-form')) return;
        try {
            if (simple) await renderSimple();
            else await renderStandard();
        } catch (err) {
            page.innerHTML = `<div class="card empty">${CC.icon('alert')}<p>${CC.esc(err.message)}</p></div>`;
        }
    }

    async function confirmDose(id, button) {
        await CC.busy(button, async () => {
            try {
                await CC.api(`/reminders/${id}/confirm`, { method: 'POST', body: { status: 'TAKEN' } });
                CC.toast('Đã ghi nhận uống thuốc', 'success');
            } catch (err) {
                CC.toast(err.message, 'error');
            }
        });
        render();
    }

    function serviceGrid() {
        return `<section class="service-grid">${SERVICES.map((s, i) => `
            <${s.ready ? `a href="${s.href}"` : `button type="button" data-soon="${i}"`} class="service-card ${s.ready ? '' : 'soon'}">
                ${s.ready ? '' : '<span class="badge badge-muted">Sắp ra mắt</span>'}
                <span class="service-icon">${CC.icon(s.icon)}</span>
                <span class="service-title">${s.label}</span>
                <span class="service-desc">${s.desc}</span>
            </${s.ready ? 'a' : 'button'}>`).join('')}
        </section>`;
    }

    // Người đang chăm sóc mình (nếu có): gọi nhanh hoặc nhờ mua thuốc
    function caregiverBar(fam) {
        const c = fam.caregivers[0];
        if (!c) return '';
        return `
            <div class="parent-actions">
                <a class="btn btn-primary" href="tel:${CC.esc(c.phone)}">${CC.icon('phone')} Gọi cho ${CC.esc(c.full_name.split(' ').pop())}</a>
                <button class="btn btn-outline" data-help>${CC.icon('send')} Nhờ ${CC.esc(c.full_name.split(' ').pop())} mua thuốc</button>
            </div>`;
    }

    function incomingBanner(fam) {
        if (!fam.incoming.length) return '';
        return `
            <a class="card card-soft row" href="family.html">
                ${CC.icon('users')}
                <span class="grow">Bạn có <strong>${fam.incoming.length}</strong> lời mời liên kết gia đình đang chờ</span>
                ${CC.icon('chevron')}
            </a>`;
    }

    function bindCommon() {
        const soon = (s) => CC.toast(`Tính năng "${s.label}" thuộc phân hệ của ${s.owner}, sẽ có khi ghép code.`, 'info');
        CC.$$('[data-soon]', page).forEach((b) => b.addEventListener('click', () => soon(SERVICES[b.dataset.soon])));
        const search = CC.$('#search-form', page);
        if (search) search.addEventListener('submit', (e) => {
            e.preventDefault();
            soon(SERVICES[0]);
        });
        CC.$$('[data-confirm]', page).forEach((b) => b.addEventListener('click', () => confirmDose(b.dataset.confirm, b)));
        const help = CC.$('[data-help]', page);
        if (help) help.addEventListener('click', openHelp);
    }

    // ================================================================ Chế độ Đầy đủ
    async function renderStandard() {
        const [fam, mine, orders] = await Promise.all([
            CC.api('/family'),
            CC.api('/reminders/today'),
            CC.api('/family/orders'),
        ]);

        const totals = fam.dependents.reduce((a, d) => {
            a.total += d.summary.total;
            a.taken += d.summary.taken;
            a.missed += d.summary.missed;
            return a;
        }, { total: 0, taken: 0, missed: 0 });

        page.innerHTML = `
            <div class="stack">
                <section class="card card-hero hello">
                    <h1>Xin chào, ${CC.esc(firstName)}</h1>
                    <p class="muted">${CC.esc(CC.fmt.today())}</p>
                    <form class="search-box" id="search-form" role="search">
                        ${CC.icon('search', 'icon-sm')}
                        <input name="q" placeholder="Tìm thuốc, bác sĩ, nhà thuốc gần bạn..." aria-label="Tìm kiếm">
                        <button class="btn btn-sm btn-primary" type="submit">Tìm</button>
                    </form>
                </section>

                ${incomingBanner(fam)}
                ${serviceGrid()}
                ${caregiverBar(fam)}

                <div class="section-head">
                    <h2>Gia đình hôm nay</h2>
                    <a href="family.html" class="small">${fam.dependents.length ? `${totals.taken}/${totals.total} liều đã uống · Quản lý` : 'Quản lý'}</a>
                </div>
                ${fam.dependents.length ? `<div class="grid grid-2">${fam.dependents.map(memberCard).join('')}</div>` : `
                <div class="card row">
                    ${CC.icon('users')}
                    <p class="grow small">Liên kết với gia đình để cài lịch nhắc thuốc cho người thân, đặt thuốc giao tận nhà và nhận thông báo khi người thân quên uống thuốc.</p>
                    <a class="btn btn-sm btn-primary" href="family.html?tab=add">Liên kết với gia đình</a>
                </div>`}

                ${mine.doses.length ? `
                <div class="section-head"><h2>Thuốc của tôi hôm nay</h2><a href="reminders.html" class="small">Xem lịch</a></div>
                <div class="card"><div class="timeline">${mine.doses.map(ownDose).join('')}</div></div>` : ''}

                ${orders.orders.length ? `
                <div class="section-head"><h2>Đơn thuốc trong gia đình</h2></div>
                <div class="grid grid-2">${orders.orders.map((o) => orderCard(o, config.demo_mode)).join('')}</div>` : ''}
            </div>`;

        bindCommon();
        CC.$$('[data-order-status]', page).forEach((b) =>
            b.addEventListener('click', () =>
                CC.busy(b, async () => {
                    try {
                        await CC.api(`/demo/orders/${b.dataset.orderId}/status`, { method: 'POST', body: { status: b.dataset.orderStatus } });
                    } catch (err) {
                        CC.toast(err.message, 'error');
                    }
                }).then(render)
            )
        );
    }

    function memberCard(d) {
        const s = d.summary;
        const done = s.taken + s.skipped;
        const pct = s.total ? Math.round((s.taken / s.total) * 100) : 0;
        const age = CC.fmt.age(d.date_of_birth);
        return `
            <article class="card member-card">
                <div class="member-head">
                    ${CC.avatar(d)}
                    <div class="grow">
                        <h3>${CC.esc(d.full_name)}</h3>
                        <div class="small muted">${CC.esc(d.relationship)}${age ? ` · ${age} tuổi` : ''}</div>
                    </div>
                    <a class="icon-btn" href="tel:${CC.esc(d.phone)}" aria-label="Gọi">${CC.icon('phone', 'icon-sm')}</a>
                </div>
                ${s.total ? `
                <div class="stack-sm">
                    <div class="row between small"><span>Đã uống ${s.taken}/${s.total} liều</span>${s.missed ? `<span class="badge badge-danger">${s.missed} chưa uống</span>` : done === s.total ? '<span class="badge badge-success">Hoàn thành</span>' : ''}</div>
                    <div class="progress"><span style="width:${pct}%"></span></div>
                </div>
                <div class="dose-mini">${d.today.map((x) => `
                    <div class="dose-mini-item">
                        <span class="dose-mini-time">${x.schedule_time}</span>
                        <span class="grow truncate">${CC.esc(x.drug_name)} <span class="muted small">· ${CC.esc(x.dosage)}</span></span>
                        ${CC.doseBadge(x.today_status)}
                    </div>`).join('')}
                </div>` : '<p class="muted small">Chưa có lịch uống thuốc hôm nay.</p>'}
                <div class="row">
                    <a class="btn btn-sm btn-primary grow" href="reminders.html?patient_id=${d.user_id}">${CC.icon('pill', 'icon-sm')} Lịch thuốc</a>
                    <a class="btn btn-sm btn-outline grow" href="family.html?member=${d.user_id}">Hồ sơ</a>
                </div>
            </article>`;
    }

    function ownDose(x) {
        const canConfirm = ['DUE', 'MISSED', 'UPCOMING'].includes(x.today_status);
        return `
            <div class="timeline-item">
                <span class="timeline-time">${x.schedule_time}</span>
                <div class="grow">
                    <div class="strong">${CC.esc(x.drug_name)}</div>
                    <div class="small muted">${CC.esc(x.dosage)}${x.meal_note ? ' · ' + CC.esc(x.meal_note) : ''}</div>
                </div>
                ${canConfirm ? `<button class="btn btn-sm btn-success" data-confirm="${x.id}">${CC.icon('check', 'icon-sm')} Đã uống</button>` : CC.doseBadge(x.today_status)}
            </div>`;
    }

    const DEMO_NEXT = {
        PENDING_CONFIRM: { status: 'CONFIRMED', label: 'Giả lập: Nhà thuốc duyệt đơn' },
        CONFIRMED: { status: 'SHIPPING', label: 'Giả lập: Bắt đầu giao hàng' },
        PREPARING: { status: 'SHIPPING', label: 'Giả lập: Bắt đầu giao hàng' },
        SHIPPING: { status: 'COMPLETED', label: 'Giả lập: Đã giao thành công' },
    };

    function orderCard(o, demo) {
        const toMe = o.recipient_user_id === user.id;
        const next = demo && !toMe && DEMO_NEXT[o.status];
        return `
            <article class="card order-card">
                <div class="row between">
                    <span class="strong">${CC.esc(o.order_code)}</span>
                    ${CC.orderBadge(o.status)}
                </div>
                <div class="small">${toMe
                    ? `${CC.icon('heart', 'icon-sm')} ${CC.esc(o.buyer_name)} đặt cho bạn`
                    : `Gửi cho <strong>${CC.esc(o.relationship || o.recipient_name)}</strong> · ${CC.esc(o.shipping_address_line)}`}</div>
                <div class="order-items">${(o.items || []).map((i) => `${CC.esc(i.name)} x${i.quantity}`).join(', ')}</div>
                <div class="row between small">
                    <span class="muted">${CC.esc(o.pharmacy_name)}</span>
                    <span class="strong">${CC.fmt.money(o.total_amount)}</span>
                </div>
                ${next ? `<button class="btn btn-sm btn-outline" data-order-id="${o.id}" data-order-status="${next.status}">${CC.icon('truck', 'icon-sm')} ${next.label}</button>` : ''}
            </article>`;
    }

    // ================================================================ Chế độ Đơn giản
    // Đủ dịch vụ như chế độ Đầy đủ, nhưng thuốc hôm nay lên đầu và nút bấm to hơn
    async function renderSimple() {
        const [today, fam, orders] = await Promise.all([
            CC.api('/reminders/today'),
            CC.api('/family'),
            CC.api('/family/orders'),
        ]);
        const toMe = orders.orders.filter((o) => o.recipient_user_id === user.id && !['COMPLETED', 'CANCELLED'].includes(o.status));

        page.innerHTML = `
            <div class="stack">
                <section class="card card-hero hello">
                    <h1>Xin chào, ${CC.esc(user.full_name)}</h1>
                    <p class="muted">${CC.esc(CC.fmt.today())}</p>
                </section>

                ${incomingBanner(fam)}

                <h2>Thuốc hôm nay</h2>
                ${today.doses.length ? `<div class="stack">${today.doses.map(bigDose).join('')}</div>` : `
                <div class="card row">${CC.icon('pill')}<p class="grow">Hôm nay không có lịch uống thuốc.</p><a class="btn btn-sm btn-outline" href="reminders.html?add=1">Cài lịch</a></div>`}

                ${caregiverBar(fam)}

                ${toMe.length ? `
                <h2>Thuốc người nhà gửi về</h2>
                ${toMe.map((o) => `
                    <div class="card order-card">
                        <div class="row between"><span class="strong">${CC.esc(o.buyer_name)} đặt cho bạn</span>${CC.orderBadge(o.status)}</div>
                        <div class="order-items">${(o.items || []).map((i) => `${CC.esc(i.name)} x${i.quantity}`).join(', ')}</div>
                        <div class="small muted">${CC.esc(o.pharmacy_name)}</div>
                    </div>`).join('')}` : ''}

                <h2>Dịch vụ</h2>
                ${serviceGrid()}
            </div>`;

        bindCommon();
    }

    function bigDose(x) {
        const cls = { DUE: 'is-due', MISSED: 'is-missed', TAKEN: 'is-taken' }[x.today_status] || '';
        const action = x.today_status === 'TAKEN'
            ? `<div class="dose-big-done">${CC.icon('check')} Đã uống lúc ${CC.fmt.time(x.confirmed_at)}</div>`
            : x.today_status === 'SKIPPED' || x.today_status === 'NEW'
                ? CC.doseBadge(x.today_status)
                : `<button class="btn ${x.today_status === 'UPCOMING' ? 'btn-outline' : 'btn-success'}" data-confirm="${x.id}">${CC.icon('check')} Đã uống</button>`;
        return `
            <div class="dose-big ${cls}">
                <div class="dose-big-time">${x.schedule_time}</div>
                <div class="dose-big-name">${CC.esc(x.drug_name)}</div>
                <div class="dose-big-meta">${CC.esc(x.dosage)}${x.meal_note ? ' · ' + CC.esc(x.meal_note) : ''} ${x.today_status === 'MISSED' ? CC.doseBadge('MISSED') : ''}</div>
                <div class="dose-big-action">${action}</div>
            </div>`;
    }

    function openHelp() {
        const reasons = ['Sắp hết thuốc huyết áp', 'Sắp hết thuốc tiểu đường', 'Cần mua thuốc cảm, hạ sốt', 'Gọi lại cho mình nhé'];
        const m = CC.modal(`
            <div class="modal-head"><h2>Nhờ người nhà mua thuốc</h2><button class="icon-btn" data-close>${CC.icon('x')}</button></div>
            <div class="stack">
                <div class="stack-sm">${reasons.map((r) => `<button class="btn btn-outline btn-block" data-reason="${CC.esc(r)}">${CC.esc(r)}</button>`).join('')}</div>
                <div class="field">
                    <label for="help-msg">Hoặc nhập lời nhắn</label>
                    <textarea class="textarea" id="help-msg" placeholder="Ví dụ: Mẹ cần thêm thuốc bổ khớp"></textarea>
                </div>
                <button class="btn btn-primary btn-block" data-send>${CC.icon('send')} Gửi cho người nhà</button>
            </div>`);
        const send = (message, button) =>
            CC.busy(button, async () => {
                try {
                    await CC.api('/family/help-request', { method: 'POST', body: { message } });
                    CC.toast('Đã gửi lời nhắn cho người nhà', 'success');
                    m.close();
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        CC.$$('[data-reason]', m.el).forEach((b) => b.addEventListener('click', () => send(b.dataset.reason, b)));
        CC.$('[data-send]', m.el).addEventListener('click', (e) => send(CC.$('#help-msg', m.el).value, e.currentTarget));
    }

    await render();
    window.addEventListener('cc:notification', render);
    window.addEventListener('cc:dose-updated', render);
    setInterval(render, 60000);
})();
