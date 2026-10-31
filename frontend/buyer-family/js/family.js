/* Gia đình: liên kết qua mã QR / số điện thoại, danh sách thành viên, hồ sơ người thân */
(async function () {
    const CC = window.CC;
    const user = await CC.layout.init({ active: 'family', title: 'Gia đình' });
    if (!user) return;

    const page = CC.$('#page');
    const simple = user.ui_mode === 'SIMPLE';
    const RELATIONSHIPS = ['Mẹ', 'Bố', 'Bà', 'Ông', 'Vợ', 'Chồng', 'Con', 'Anh/Chị/Em', 'Người thân khác'];
    const SCANNER_SRC = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

    let tab = CC.param('tab') === 'add' ? 'add' : 'members';
    let scanner = null;

    const relOptions = (selected = 'Mẹ') =>
        RELATIONSHIPS.map((r) => `<option ${r === selected ? 'selected' : ''}>${r}</option>`).join('');

    // ================================================================ Danh sách thành viên
    async function renderMain() {
        stopScanner();
        const fam = await CC.api('/family');
        page.innerHTML = `
            <div class="stack">
                <div class="segmented">
                    <button data-tab="members" class="${tab === 'members' ? 'active' : ''}">Thành viên</button>
                    <button data-tab="add" class="${tab === 'add' ? 'active' : ''}">Thêm thành viên</button>
                </div>
                <div id="tab-body"></div>
            </div>`;
        CC.$$('[data-tab]', page).forEach((b) => b.addEventListener('click', () => {
            tab = b.dataset.tab;
            history.replaceState(null, '', tab === 'add' ? '?tab=add' : 'family.html');
            renderMain();
        }));
        const body = CC.$('#tab-body');
        if (tab === 'members') renderMembers(body, fam);
        else renderAdd(body);
    }

    function renderMembers(body, fam) {
        const nothing = !fam.dependents.length && !fam.caregivers.length && !fam.incoming.length && !fam.outgoing.length;
        body.innerHTML = `
            <div class="stack">
                ${fam.incoming.length ? `
                <section class="card">
                    <div class="card-head"><h2>Lời mời đang chờ bạn</h2></div>
                    <div class="list">${fam.incoming.map((l) => `
                        <div class="list-item">
                            ${CC.avatar(l)}
                            <div class="grow">
                                <div class="strong">${CC.esc(l.full_name)}</div>
                                <div class="small muted">Muốn chăm sóc bạn với vai trò con · bạn là "${CC.esc(l.relationship)}"</div>
                            </div>
                        </div>
                        <div class="row" style="padding-bottom:12px">
                            <button class="btn btn-primary grow" data-accept="${l.link_id}">${CC.icon('check', 'icon-sm')} Đồng ý</button>
                            <button class="btn btn-outline grow" data-reject="${l.link_id}">Từ chối</button>
                        </div>`).join('')}
                    </div>
                </section>` : ''}

                ${fam.dependents.length ? `
                <section class="card">
                    <div class="card-head"><h2>Người tôi chăm sóc</h2><span class="badge">${fam.dependents.length}</span></div>
                    <div class="list">${fam.dependents.map((d) => `
                        <div class="list-item">
                            ${CC.avatar(d)}
                            <div class="grow">
                                <div class="strong">${CC.esc(d.full_name)} <span class="badge">${CC.esc(d.relationship)}</span></div>
                                <div class="small muted">${CC.esc(d.phone)} · Hôm nay ${d.summary.taken}/${d.summary.total} liều${d.ui_mode === 'SIMPLE' ? ' · Giao diện đơn giản' : ''}</div>
                            </div>
                            <a class="btn btn-sm btn-outline" href="?member=${d.user_id}">Hồ sơ</a>
                        </div>`).join('')}
                    </div>
                </section>` : ''}

                ${fam.caregivers.length ? `
                <section class="card">
                    <div class="card-head"><h2>Người chăm sóc tôi</h2></div>
                    <div class="list">${fam.caregivers.map((c) => `
                        <div class="list-item">
                            ${CC.avatar(c)}
                            <div class="grow">
                                <div class="strong">${CC.esc(c.full_name)}</div>
                                <div class="small muted">Con · ${CC.esc(c.phone)}</div>
                            </div>
                            <a class="btn btn-sm btn-primary" href="tel:${CC.esc(c.phone)}">${CC.icon('phone', 'icon-sm')} Gọi</a>
                            <button class="btn btn-sm btn-ghost" data-unlink="${c.link_id}" data-name="${CC.esc(c.full_name)}" aria-label="Hủy liên kết">${CC.icon('x', 'icon-sm')}</button>
                        </div>`).join('')}
                    </div>
                </section>` : ''}

                ${fam.outgoing.length ? `
                <section class="card">
                    <div class="card-head"><h2>Lời mời đã gửi</h2></div>
                    <div class="list">${fam.outgoing.map((l) => `
                        <div class="list-item">
                            ${CC.avatar(l)}
                            <div class="grow">
                                <div class="strong">${CC.esc(l.full_name)} <span class="badge badge-warning">Chờ xác nhận</span></div>
                                <div class="small muted">${CC.esc(l.relationship)} · ${CC.esc(l.phone)}</div>
                            </div>
                            <button class="btn btn-sm btn-ghost" data-unlink="${l.link_id}" data-name="${CC.esc(l.full_name)}" data-pending="1">Thu hồi</button>
                        </div>`).join('')}
                    </div>
                </section>` : ''}

                ${nothing ? `
                <div class="card empty">
                    ${CC.icon('users')}
                    <p>Chưa có thành viên nào. Mời người thân bằng mã QR, số điện thoại, hoặc nhập mã người thân gửi cho bạn.</p>
                    <button class="btn btn-primary" data-goto-add>${CC.icon('plus')} Thêm thành viên</button>
                </div>` : ''}
            </div>`;

        CC.$$('[data-accept]', body).forEach((b) => b.addEventListener('click', () => act(b, `/family/links/${b.dataset.accept}/accept`, 'POST', 'Đã liên kết với con')));
        CC.$$('[data-reject]', body).forEach((b) => b.addEventListener('click', () => act(b, `/family/links/${b.dataset.reject}/reject`, 'POST', 'Đã từ chối lời mời')));
        CC.$$('[data-unlink]', body).forEach((b) => b.addEventListener('click', async () => {
            const pending = b.dataset.pending;
            const ok = await CC.confirm(pending ? `Thu hồi lời mời gửi ${b.dataset.name}?` : `Hủy liên kết gia đình với ${b.dataset.name}?`, { okText: pending ? 'Thu hồi' : 'Hủy liên kết', danger: true });
            if (ok) act(b, `/family/links/${b.dataset.unlink}`, 'DELETE', pending ? 'Đã thu hồi lời mời' : 'Đã hủy liên kết');
        }));
        const goto = CC.$('[data-goto-add]', body);
        if (goto) goto.addEventListener('click', () => { tab = 'add'; renderMain(); });
    }

    async function act(button, path, method, message) {
        await CC.busy(button, async () => {
            try {
                await CC.api(path, { method });
                CC.toast(message, 'success');
            } catch (err) {
                CC.toast(err.message, 'error');
            }
        });
        renderMain();
    }

    // ================================================================ Thêm thành viên
    function renderAdd(body) {
        const joinCard = `
            <section class="card stack">
                <div>
                    <h2>Nhập mã người thân gửi</h2>
                    <p class="small muted">Người thân đọc cho bạn 6 ký tự, hoặc bấm "Quét mã QR" rồi đưa camera vào mã trên máy của họ.</p>
                </div>
                <form id="join-form" class="stack-sm">
                    <input class="input code-input" name="code" maxlength="6" autocomplete="off" placeholder="A1B2C3" required>
                    <button class="btn btn-primary btn-block" type="submit">${CC.icon('check')} Liên kết</button>
                </form>
                <button class="btn btn-outline btn-block" id="scan-btn">${CC.icon('camera')} Quét mã QR</button>
                <div id="qr-reader" hidden></div>
            </section>`;

        const inviteCard = `
            <section class="card stack">
                <div>
                    <h2>Mời bằng mã QR</h2>
                    <p class="small muted">Tạo mã rồi đưa bố mẹ quét bằng camera, hoặc đọc 6 ký tự để bố mẹ nhập. Mã dùng được 24 giờ.</p>
                </div>
                <form id="invite-form" class="row">
                    <select class="select grow" name="relationship" aria-label="Người được mời là gì của bạn">${relOptions()}</select>
                    <button class="btn btn-primary" type="submit">${CC.icon('qr', 'icon-sm')} Tạo mã</button>
                </form>
                <div id="invite-result"></div>
            </section>`;

        const phoneCard = `
            <section class="card stack">
                <div>
                    <h2>Mời bằng số điện thoại</h2>
                    <p class="small muted">Bố mẹ đã có tài khoản CareConnect sẽ nhận chuông báo và bấm "Đồng ý" trong mục Gia đình.</p>
                </div>
                <form id="phone-form" class="stack-sm">
                    <div class="field">
                        <label for="invite-phone">Số điện thoại của bố mẹ</label>
                        <input class="input" id="invite-phone" name="phone" type="tel" inputmode="numeric" placeholder="0901234567" required>
                    </div>
                    <div class="field">
                        <label for="invite-rel">Người này là gì của bạn?</label>
                        <select class="select" id="invite-rel" name="relationship">${relOptions()}</select>
                    </div>
                    <button class="btn btn-primary btn-block" type="submit">${CC.icon('send', 'icon-sm')} Gửi lời mời</button>
                </form>
            </section>`;

        // Mọi tài khoản đều mời được người khác và nhập được mã; chế độ Đơn giản đưa ô nhập mã lên đầu
        body.innerHTML = simple
            ? `<div class="stack">${joinCard}${inviteCard}${phoneCard}</div>`
            : `<div class="grid grid-2">${inviteCard}${phoneCard}</div><div style="margin-top:16px">${joinCard}</div>`;

        bindJoin(body);
        const inviteForm = CC.$('#invite-form', body);
        if (inviteForm) {
            inviteForm.addEventListener('submit', (e) => {
                e.preventDefault();
                CC.busy(inviteForm.querySelector('[type=submit]'), async () => {
                    try {
                        const { invite } = await CC.api('/family/invites', { method: 'POST', body: CC.formData(inviteForm) });
                        showInvite(invite);
                    } catch (err) {
                        CC.toast(err.message, 'error');
                    }
                });
            });
        }
        const phoneForm = CC.$('#phone-form', body);
        if (phoneForm) {
            phoneForm.addEventListener('submit', (e) => {
                e.preventDefault();
                CC.busy(phoneForm.querySelector('[type=submit]'), async () => {
                    try {
                        await CC.api('/family/links/by-phone', { method: 'POST', body: CC.formData(phoneForm) });
                        CC.toast('Đã gửi lời mời. Chờ bố mẹ đồng ý trên máy của mình.', 'success');
                        phoneForm.reset();
                    } catch (err) {
                        CC.toast(err.message, 'error');
                    }
                });
            });
        }
    }

    let countdown = null;
    function showInvite(invite) {
        const box = CC.$('#invite-result');
        const joinUrl = `${location.origin}/buyer-family/family.html?code=${invite.code}`;
        box.innerHTML = `
            <div class="qr-box">
                <div class="qr-canvas" id="qr-canvas"></div>
                <div>
                    <div class="small muted">Mã mời cho ${CC.esc(invite.relationship)}</div>
                    <div class="invite-code">${CC.esc(invite.code)}</div>
                    <div class="small muted" id="invite-expire"></div>
                </div>
                <ol class="small muted" style="text-align:left;margin:0;padding-left:18px">
                    <li>Mở CareConnect trên điện thoại của ${CC.esc(invite.relationship.toLowerCase())}, đăng nhập.</li>
                    <li>Vào <strong>Gia đình</strong> → <strong>Nhập mã của con</strong>.</li>
                    <li>Quét mã QR này hoặc nhập 6 ký tự ở trên.</li>
                </ol>
                <button class="btn btn-sm btn-outline" id="copy-link">Sao chép link mời</button>
            </div>`;
        if (window.QRCode) {
            new window.QRCode(CC.$('#qr-canvas'), { text: joinUrl, width: 196, height: 196, colorDark: '#1557b0', colorLight: '#ffffff' });
        } else {
            CC.$('#qr-canvas').innerHTML = '<p class="small muted" style="line-height:1.4;padding:20px">Không tải được thư viện QR (cần Internet). Hãy dùng mã 6 ký tự.</p>';
        }
        CC.$('#copy-link').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(joinUrl);
                CC.toast('Đã sao chép link mời', 'success');
            } catch (e) {
                CC.toast(joinUrl, 'info', 'Link mời');
            }
        });
        clearInterval(countdown);
        const tick = () => {
            const left = new Date(invite.expires_at) - Date.now();
            const el = CC.$('#invite-expire');
            if (!el) return clearInterval(countdown);
            if (left <= 0) {
                el.textContent = 'Mã đã hết hạn';
                return clearInterval(countdown);
            }
            const h = Math.floor(left / 3600000);
            const m = Math.floor((left % 3600000) / 60000);
            el.textContent = `Hết hạn sau ${h} giờ ${m} phút`;
        };
        tick();
        countdown = setInterval(tick, 30000);
    }

    function bindJoin(root) {
        const form = CC.$('#join-form', root);
        if (!form) return;
        form.code.addEventListener('input', () => { form.code.value = form.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (form.code.value.length !== 6) return CC.toast('Mã mời gồm 6 ký tự', 'error');
            previewInvite(form.code.value);
        });
        CC.$('#scan-btn', root).addEventListener('click', startScanner);
    }

    // Xem trước rồi mới đồng ý, để bố mẹ biết ai đang mời
    async function previewInvite(code) {
        let invite;
        try {
            ({ invite } = await CC.api(`/family/invites/${encodeURIComponent(code)}`));
        } catch (err) {
            return CC.toast(err.message, 'error');
        }
        if (invite.is_own) return CC.toast('Đây là mã bạn vừa tạo. Hãy mở mã này trên máy của bố mẹ.', 'error');
        const m = CC.modal(`
            <div class="stack center" style="align-items:center">
                <span class="avatar avatar-lg">${CC.esc(CC.initials(invite.inviter_name))}</span>
                <h2>${CC.esc(invite.inviter_name)}</h2>
                <p class="muted">${CC.esc(invite.inviter_phone)}</p>
                <p style="font-size:1.05rem">muốn liên kết với bạn với vai trò <strong>con</strong>.<br>Bạn là <strong>"${CC.esc(invite.relationship)}"</strong> của người này.</p>
                <p class="small muted">Sau khi liên kết, con có thể cài lịch nhắc uống thuốc, đặt thuốc giao về nhà và nhận thông báo khi bạn uống thuốc.</p>
                <button class="btn btn-primary btn-lg btn-block" data-join>${CC.icon('check')} Đồng ý liên kết</button>
                <button class="btn btn-ghost btn-block" data-close>Để sau</button>
            </div>`);
        CC.$('[data-join]', m.el).addEventListener('click', (e) =>
            CC.busy(e.currentTarget, async () => {
                try {
                    await CC.api('/family/join', { method: 'POST', body: { code: invite.code } });
                    m.close();
                    CC.toast(`Đã liên kết với ${invite.inviter_name}`, 'success');
                    tab = 'members';
                    history.replaceState(null, '', 'family.html');
                    renderMain();
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            })
        );
    }

    // ---------------------------------------------------------------- Quét QR bằng camera
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (window.Html5Qrcode) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Không tải được trình quét QR (cần Internet)'));
            document.head.appendChild(s);
        });
    }

    async function startScanner() {
        const reader = CC.$('#qr-reader');
        if (scanner) return stopScanner();
        if (!window.isSecureContext) {
            return CC.toast('Trình duyệt chỉ cho mở camera trên localhost hoặc https. Hãy dùng camera điện thoại quét QR, hoặc nhập mã 6 ký tự.', 'error');
        }
        try {
            await loadScript(SCANNER_SRC);
            reader.hidden = false;
            scanner = new window.Html5Qrcode('qr-reader');
            await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (text) => {
                const match = String(text).match(/code=([A-Z0-9]{6})/i) || String(text).match(/^([A-Z0-9]{6})$/i);
                if (!match) return;
                stopScanner();
                previewInvite(match[1].toUpperCase());
            });
            CC.$('#scan-btn').innerHTML = `${CC.icon('x')} Tắt camera`;
        } catch (err) {
            stopScanner();
            CC.toast(err.message || 'Không mở được camera', 'error');
        }
    }

    function stopScanner() {
        if (!scanner) return;
        const s = scanner;
        scanner = null;
        s.stop().catch(() => {}).finally(() => s.clear());
        const reader = CC.$('#qr-reader');
        if (reader) reader.hidden = true;
        const btn = CC.$('#scan-btn');
        if (btn) btn.innerHTML = `${CC.icon('camera')} Quét mã QR`;
    }

    // ================================================================ Hồ sơ người thân
    async function renderMember(memberId) {
        let data;
        try {
            data = await CC.api(`/family/members/${memberId}`);
        } catch (err) {
            page.innerHTML = `<div class="card empty">${CC.icon('alert')}<p>${CC.esc(err.message)}</p><a class="btn btn-outline" href="family.html">Quay lại</a></div>`;
            return;
        }
        const { member, health_profile: hp, history, today, summary } = data;
        CC.layout.setTitle(`Hồ sơ ${member.relationship || member.full_name}`);
        const age = CC.fmt.age(member.date_of_birth);
        const h = hp || {};
        const days = history.days.slice().reverse();

        page.innerHTML = `
            <div class="stack">
                <a href="family.html" class="small">← Gia đình</a>
                <section class="card profile-head">
                    ${CC.avatar(member, 'lg')}
                    <div class="grow">
                        <h2>${CC.esc(member.full_name)}</h2>
                        <div class="muted small">${CC.esc(member.relationship || '')}${age ? ` · ${age} tuổi` : ''} · ${CC.esc(member.phone)}</div>
                    </div>
                    <a class="btn btn-primary" href="tel:${CC.esc(member.phone)}">${CC.icon('phone', 'icon-sm')} Gọi</a>
                </section>

                <div class="grid grid-2">
                    <section class="card">
                        <div class="card-head">
                            <h2>Uống thuốc 7 ngày</h2>
                            ${history.adherence_rate !== null ? `<span class="badge ${history.adherence_rate >= 80 ? 'badge-success' : 'badge-warning'}">${history.adherence_rate}% đúng lịch</span>` : ''}
                        </div>
                        ${days.length ? `<div class="week">${days.map((d) => {
                            const pct = d.total ? Math.round((d.taken / d.total) * 100) : 0;
                            return `<div class="week-day">
                                <span class="week-value">${d.total ? `${d.taken}/${d.total}` : '-'}</span>
                                <div class="week-bar ${!d.total ? 'none' : pct < 80 ? 'low' : ''}"><span style="height:${pct}%"></span></div>
                                <span>${CC.fmt.weekday(d.date)}</span>
                            </div>`;
                        }).join('')}</div>` : '<p class="muted">Chưa có dữ liệu</p>'}
                    </section>

                    <section class="card">
                        <div class="card-head">
                            <h2>Hôm nay</h2>
                            <a class="btn btn-sm btn-outline" href="reminders.html?patient_id=${member.user_id}">Lịch thuốc</a>
                        </div>
                        ${today.length ? `<div class="timeline">${today.map((x) => `
                            <div class="timeline-item">
                                <span class="timeline-time">${x.schedule_time}</span>
                                <div class="grow"><div class="strong">${CC.esc(x.drug_name)}</div><div class="small muted">${CC.esc(x.dosage)}</div></div>
                                ${CC.doseBadge(x.today_status)}
                            </div>`).join('')}</div>
                            <p class="small muted" style="margin-top:8px">Đã uống ${summary.taken}/${summary.total} liều</p>` : '<p class="muted">Chưa có lịch uống thuốc hôm nay</p>'}
                    </section>
                </div>

                <section class="card">
                    <div class="card-head">
                        <h2>Hồ sơ sức khỏe</h2>
                        <button class="btn btn-sm btn-outline" id="edit-health">${CC.icon('edit', 'icon-sm')} Sửa</button>
                    </div>
                    <div class="info-grid">
                        ${info('Nhóm máu', h.blood_type)}
                        ${info('Chiều cao / Cân nặng', h.height_cm || h.weight_kg ? `${h.height_cm || '?'} cm / ${h.weight_kg || '?'} kg` : '')}
                        ${info('Bệnh nền', h.chronic_conditions, true)}
                        ${info('Dị ứng', h.allergies, true)}
                        ${info('Thuốc đang dùng', h.current_medications, true)}
                        ${info('Liên hệ khẩn cấp', h.emergency_contact_name ? `${h.emergency_contact_name} · ${h.emergency_contact_phone || ''}` : '', true)}
                        ${h.notes ? info('Ghi chú', h.notes, true) : ''}
                    </div>
                </section>

                ${data.addresses.length ? `
                <section class="card">
                    <div class="card-head"><h2>Địa chỉ nhận thuốc</h2></div>
                    <div class="list">${data.addresses.map((a) => `
                        <div class="list-item">${CC.icon('map')}<div class="grow"><div class="strong">${CC.esc(a.label || a.recipient_name)}</div><div class="small muted">${CC.esc(a.address_line)}</div></div></div>`).join('')}
                    </div>
                </section>` : ''}
            </div>`;

        CC.$('#edit-health').addEventListener('click', () =>
            CC.openHealthForm(hp, `/family/members/${member.user_id}/health`, () => renderMember(memberId))
        );
    }

    function info(label, value, full = false) {
        return `<div class="info-item${full ? ' full' : ''}"><div class="label">${label}</div><div class="value">${value ? CC.esc(value) : '<span class="muted">Chưa có</span>'}</div></div>`;
    }

    // ================================================================ Điều hướng
    const memberId = CC.param('member');
    const code = CC.param('code');
    if (memberId) {
        await renderMember(memberId);
    } else {
        if (code) tab = 'add';
        await renderMain();
        if (code) {
            const input = CC.$('#join-form [name=code]');
            if (input) input.value = code.toUpperCase();
            previewInvite(code.toUpperCase());
        }
    }
    window.addEventListener('cc:notification', (e) => {
        const kind = (e.detail.data_json || {}).kind || '';
        if (!memberId && kind.startsWith('FAMILY_') && tab === 'members') renderMain();
    });
})();
