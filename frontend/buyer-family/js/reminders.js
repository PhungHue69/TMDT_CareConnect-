/* Lịch nhắc uống thuốc: chọn người, xem hôm nay, báo cáo 7 ngày, thêm/sửa/xóa lịch, thử chuông */
(async function () {
    const CC = window.CC;
    const user = await CC.layout.init({ active: 'reminders', title: 'Lịch uống thuốc' });
    if (!user) return;

    const page = CC.$('#page');
    const PRESETS = [
        { label: 'Sáng', time: '07:00' },
        { label: 'Trưa', time: '12:00' },
        { label: 'Chiều', time: '17:00' },
        { label: 'Tối', time: '19:00' },
        { label: 'Trước ngủ', time: '21:30' },
    ];
    const MEALS = ['Sau ăn', 'Trước ăn', 'Trong bữa ăn', 'Không phụ thuộc bữa ăn'];

    const fam = await CC.api('/family');
    const people = [{ user_id: user.id, full_name: user.full_name, label: 'Tôi' }]
        .concat(fam.dependents.map((d) => ({ ...d, label: d.relationship })));
    let patientId = Number(CC.param('patient_id')) || user.id;
    if (!people.some((p) => p.user_id === patientId)) patientId = user.id;

    const current = () => people.find((p) => p.user_id === patientId);
    const isSelf = () => patientId === user.id;

    async function render() {
        let data;
        try {
            const q = `?patient_id=${patientId}`;
            const [list, today, history] = await Promise.all([
                CC.api('/reminders' + q),
                CC.api('/reminders/today' + q),
                CC.api('/reminders/history' + q),
            ]);
            data = { list: list.reminders, today, history };
        } catch (err) {
            page.innerHTML = `<div class="card empty">${CC.icon('alert')}<p>${CC.esc(err.message)}</p></div>`;
            return;
        }
        const p = current();
        const who = isSelf() ? 'của tôi' : `của ${p.label.toLowerCase()}`;
        CC.layout.setTitle(isSelf() ? 'Lịch uống thuốc' : `Lịch thuốc ${p.label}`);

        const groups = {};
        for (const r of data.list) (groups[CC.partOfDay(r.schedule_time)] = groups[CC.partOfDay(r.schedule_time)] || []).push(r);
        const days = data.history.days.slice().reverse();

        page.innerHTML = `
            <div class="stack">
                ${people.length > 1 ? `<div class="patient-switch">${people.map((x) => `
                    <button class="chip ${x.user_id === patientId ? 'active' : ''}" data-patient="${x.user_id}">${CC.esc(x.label)}${x.user_id !== user.id ? ` · ${CC.esc(x.full_name.split(' ').pop())}` : ''}</button>`).join('')}
                </div>` : ''}

                <div class="row between">
                    <div>
                        <h2>${CC.esc(p.full_name)}</h2>
                        <p class="small muted">${data.list.length} lịch nhắc đang bật</p>
                    </div>
                    <button class="btn btn-primary" id="add-btn">${CC.icon('plus', 'icon-sm')} Thêm lịch</button>
                </div>

                <div class="grid grid-2">
                    <section class="card">
                        <div class="card-head">
                            <h2>Hôm nay</h2>
                            <span class="small muted">${data.today.summary.taken}/${data.today.summary.total} đã uống</span>
                        </div>
                        ${data.today.doses.length ? `<div class="timeline">${data.today.doses.map(todayItem).join('')}</div>` : '<p class="muted">Không có liều nào hôm nay</p>'}
                        ${!isSelf() && data.today.doses.length ? `<p class="small muted" style="margin-top:10px">"Thử chuông" đổ chuông ngay trên máy ${CC.esc(p.label.toLowerCase())}. Nếu quá giờ chưa bấm "Đã uống", bạn sẽ nhận cảnh báo.</p>` : ''}
                    </section>

                    <section class="card">
                        <div class="card-head">
                            <h2>Tuân thủ 7 ngày</h2>
                            ${data.history.adherence_rate !== null ? `<span class="badge ${data.history.adherence_rate >= 80 ? 'badge-success' : 'badge-warning'}">${data.history.adherence_rate}%</span>` : ''}
                        </div>
                        ${days.length ? `<div class="week">${days.map((d) => {
                            const pct = d.total ? Math.round((d.taken / d.total) * 100) : 0;
                            return `<div class="week-day">
                                <span class="week-value">${d.total ? `${d.taken}/${d.total}` : '-'}</span>
                                <div class="week-bar ${!d.total ? 'none' : pct < 80 ? 'low' : ''}"><span style="height:${pct}%"></span></div>
                                <span>${CC.fmt.weekday(d.date)}</span>
                            </div>`;
                        }).join('')}</div>
                        <p class="small muted" style="margin-top:10px">Đã uống ${data.history.taken}/${data.history.total} liều đến giờ trong 7 ngày qua.</p>` : '<p class="muted">Chưa có dữ liệu</p>'}
                    </section>
                </div>

                <section class="card">
                    <div class="card-head"><h2>Lịch nhắc ${CC.esc(who)}</h2></div>
                    ${data.list.length ? ['Sáng', 'Trưa', 'Chiều', 'Tối'].filter((g) => groups[g]).map((g) => `
                        <div class="part-title">${g}</div>
                        <div>${groups[g].map(reminderItem).join('')}</div>`).join('') : `
                    <div class="empty">${CC.icon('clock')}<p>Chưa có lịch nhắc nào.<br>Bấm "Thêm lịch" để cài giờ uống thuốc.</p></div>`}
                </section>
            </div>`;

        CC.$$('[data-patient]', page).forEach((b) => b.addEventListener('click', () => {
            patientId = Number(b.dataset.patient);
            history.replaceState(null, '', `?patient_id=${patientId}`);
            render();
        }));
        CC.$('#add-btn').addEventListener('click', () => openForm());
        CC.$$('[data-edit]', page).forEach((b) => b.addEventListener('click', () => openForm(data.list.find((r) => r.id === Number(b.dataset.edit)))));
        CC.$$('[data-delete]', page).forEach((b) => b.addEventListener('click', async () => {
            if (!(await CC.confirm('Xóa lịch nhắc này? Lịch sử uống thuốc vẫn được giữ lại.', { okText: 'Xóa', danger: true }))) return;
            await CC.busy(b, async () => {
                try {
                    await CC.api(`/reminders/${b.dataset.delete}`, { method: 'DELETE' });
                    CC.toast('Đã xóa lịch nhắc', 'success');
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
            render();
        }));
        CC.$$('[data-ring]', page).forEach((b) => b.addEventListener('click', () =>
            CC.busy(b, async () => {
                try {
                    await CC.api(`/reminders/${b.dataset.ring}/ring-now`, { method: 'POST' });
                    CC.toast(isSelf() ? 'Đã đổ chuông' : `Đã đổ chuông trên máy ${current().label.toLowerCase()}`, 'success');
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            }).then(render)
        ));
        CC.$$('[data-confirm]', page).forEach((b) => b.addEventListener('click', () =>
            CC.busy(b, async () => {
                try {
                    await CC.api(`/reminders/${b.dataset.confirm}/confirm`, { method: 'POST', body: { status: b.dataset.status || 'TAKEN' } });
                    CC.toast('Đã ghi nhận', 'success');
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            }).then(render)
        ));
    }

    function todayItem(x) {
        const open = ['DUE', 'MISSED', 'UPCOMING'].includes(x.today_status);
        let actions = CC.doseBadge(x.today_status);
        if (open && isSelf()) {
            actions = `<button class="btn btn-sm btn-success" data-confirm="${x.id}">${CC.icon('check', 'icon-sm')} Đã uống</button>`;
        } else if (open) {
            actions = `${CC.doseBadge(x.today_status)}<button class="btn btn-sm btn-outline" data-ring="${x.id}">${CC.icon('bell', 'icon-sm')} Thử chuông</button>`;
        }
        return `
            <div class="timeline-item">
                <span class="timeline-time">${x.schedule_time}</span>
                <div class="grow">
                    <div class="strong">${CC.esc(x.drug_name)}</div>
                    <div class="small muted">${CC.esc(x.dosage)}${x.meal_note ? ' · ' + CC.esc(x.meal_note) : ''}${x.today_status === 'TAKEN' && x.confirmed_at ? ` · uống lúc ${CC.fmt.time(x.confirmed_at)}` : ''}</div>
                </div>
                <div class="row-wrap" style="justify-content:flex-end">${actions}</div>
            </div>`;
    }

    function reminderItem(r) {
        const range = r.end_date ? `${CC.fmt.date(r.start_date)} - ${CC.fmt.date(r.end_date)}` : `Từ ${CC.fmt.date(r.start_date)}`;
        return `
            <div class="reminder-item">
                <span class="reminder-icon">${r.pill_image_url ? `<img src="${CC.esc(r.pill_image_url)}" alt="">` : CC.icon('pill')}</span>
                <div class="grow">
                    <div class="row-wrap"><span class="strong">${r.schedule_time}</span><span class="strong">${CC.esc(r.drug_name)}</span>${r.prescription_id ? '<span class="badge badge-muted">Theo đơn</span>' : ''}</div>
                    <div class="small muted">${CC.esc(r.dosage)}${r.meal_note ? ' · ' + CC.esc(r.meal_note) : ''} · ${range}</div>
                    <div class="small muted">Cài bởi ${r.created_by_user_id === user.id ? 'bạn' : CC.esc(r.created_by_name)}</div>
                </div>
                <div class="row" style="gap:4px">
                    <button class="btn btn-sm btn-ghost" data-edit="${r.id}" aria-label="Sửa">${CC.icon('edit', 'icon-sm')}</button>
                    <button class="btn btn-sm btn-ghost" data-delete="${r.id}" aria-label="Xóa" style="color:var(--danger)">${CC.icon('trash', 'icon-sm')}</button>
                </div>
            </div>`;
    }

    // ================================================================ Form thêm / sửa
    async function openForm(reminder) {
        const editing = Boolean(reminder);
        const p = current();
        let items = [];
        if (!editing) {
            try { ({ items } = await CC.api(`/reminders/prescription-items?patient_id=${patientId}`)); } catch (e) { items = []; }
        }
        const r = reminder || {};
        const times = new Set(editing ? [r.schedule_time] : []);
        let prescriptionItemId = null;

        const m = CC.modal(`
            <div class="modal-head">
                <h2>${editing ? 'Sửa lịch nhắc' : `Thêm lịch cho ${CC.esc(isSelf() ? 'tôi' : p.label.toLowerCase())}`}</h2>
                <button class="icon-btn" data-close>${CC.icon('x')}</button>
            </div>
            <form id="reminder-form" class="stack">
                ${items.length ? `
                <div class="field">
                    <label for="rx-item">Chọn nhanh từ đơn thuốc đã kê</label>
                    <select class="select" id="rx-item">
                        <option value="">Tự nhập thuốc</option>
                        ${items.map((i) => `<option value="${i.id}">${CC.esc(i.drug_name)} - ${CC.esc(i.dosage || '')} (đơn ${CC.fmt.date(i.issued_date)})</option>`).join('')}
                    </select>
                    <span class="hint" id="rx-usage"></span>
                </div>` : ''}
                <div class="form-grid form-grid-2">
                    <div class="field span-2">
                        <label for="drug_name">Tên thuốc</label>
                        <input class="input" id="drug_name" name="drug_name" value="${CC.esc(r.drug_name || '')}" placeholder="Ví dụ: Amlodipin 5mg" required>
                    </div>
                    <div class="field">
                        <label for="dosage">Liều mỗi lần</label>
                        <input class="input" id="dosage" name="dosage" value="${CC.esc(r.dosage || '')}" placeholder="1 viên" required>
                    </div>
                    <div class="field">
                        <label for="meal_note">Cách uống</label>
                        <select class="select" id="meal_note" name="meal_note">${MEALS.map((x) => `<option ${x === (r.meal_note || 'Sau ăn') ? 'selected' : ''}>${x}</option>`).join('')}</select>
                    </div>
                </div>
                <div class="field">
                    <label>${editing ? 'Giờ uống' : 'Giờ uống (chọn một hoặc nhiều)'}</label>
                    ${editing
                        ? `<input class="input" type="time" name="schedule_time" value="${CC.esc(r.schedule_time)}" required>`
                        : `<div class="time-chips" id="preset-chips">${PRESETS.map((x) => `<button type="button" class="chip" data-time="${x.time}">${x.label} ${x.time}</button>`).join('')}</div>
                           <div class="row" style="margin-top:8px">
                               <input class="input grow" type="time" id="custom-time" aria-label="Giờ khác">
                               <button type="button" class="btn btn-outline" id="add-time">Thêm giờ</button>
                           </div>
                           <div class="time-chips" id="custom-chips" style="margin-top:8px"></div>`}
                </div>
                <div class="form-grid form-grid-2">
                    <div class="field">
                        <label for="start_date">Bắt đầu</label>
                        <input class="input" type="date" id="start_date" name="start_date" value="${CC.esc(r.start_date || CC.fmt.localDate())}">
                    </div>
                    <div class="field">
                        <label for="end_date">Kết thúc (không bắt buộc)</label>
                        <input class="input" type="date" id="end_date" name="end_date" value="${CC.esc(r.end_date || '')}">
                    </div>
                </div>
                <div class="field">
                    <label for="pill_image_url">Link ảnh viên/vỉ thuốc (không bắt buộc)</label>
                    <input class="input" id="pill_image_url" name="pill_image_url" type="url" value="${CC.esc(r.pill_image_url || '')}" placeholder="https://...">
                    <span class="hint">Ảnh giúp bố mẹ nhận ra đúng viên thuốc khi chuông reo.</span>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" data-close>Hủy</button>
                    <button type="submit" class="btn btn-primary">${editing ? 'Lưu' : 'Tạo lịch nhắc'}</button>
                </div>
            </form>`);

        const form = CC.$('#reminder-form', m.el);

        function paintTimes() {
            CC.$$('#preset-chips [data-time]', m.el).forEach((c) => c.classList.toggle('active', times.has(c.dataset.time)));
            const custom = [...times].filter((t) => !PRESETS.some((x) => x.time === t)).sort();
            const host = CC.$('#custom-chips', m.el);
            if (host) {
                host.innerHTML = custom.map((t) => `<button type="button" class="chip active" data-remove="${t}">${t} ${CC.icon('x', 'icon-sm')}</button>`).join('');
                CC.$$('[data-remove]', host).forEach((c) => c.addEventListener('click', () => { times.delete(c.dataset.remove); paintTimes(); }));
            }
        }

        if (!editing) {
            CC.$$('#preset-chips [data-time]', m.el).forEach((c) => c.addEventListener('click', () => {
                if (times.has(c.dataset.time)) times.delete(c.dataset.time);
                else times.add(c.dataset.time);
                paintTimes();
            }));
            CC.$('#add-time', m.el).addEventListener('click', () => {
                const v = CC.$('#custom-time', m.el).value;
                if (!v) return CC.toast('Chọn giờ trước khi thêm', 'error');
                times.add(v.slice(0, 5));
                paintTimes();
            });
        }

        const rx = CC.$('#rx-item', m.el);
        if (rx) {
            rx.addEventListener('change', () => {
                const item = items.find((i) => i.id === Number(rx.value));
                prescriptionItemId = item ? item.id : null;
                CC.$('#rx-usage', m.el).textContent = item && item.usage_instructions ? `Bác sĩ dặn: ${item.usage_instructions}` : '';
                if (!item) return;
                form.drug_name.value = item.drug_name;
                form.dosage.value = item.dosage || '';
                if (item.image_url) form.pill_image_url.value = item.image_url;
                if (item.duration_days) {
                    const end = new Date(form.start_date.value || Date.now());
                    end.setDate(end.getDate() + item.duration_days - 1);
                    form.end_date.value = CC.fmt.localDate(end);
                }
                // Gợi ý giờ theo lời dặn: "sáng", "tối"...
                const usage = (item.usage_instructions || '').toLowerCase();
                if (usage.includes('sáng')) times.add('07:00');
                if (usage.includes('trưa')) times.add('12:00');
                if (usage.includes('tối')) times.add('19:00');
                paintTimes();
            });
        }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const body = CC.formData(form);
            body.patient_id = patientId;
            if (!editing) {
                body.schedule_times = [...times].sort();
                if (!body.schedule_times.length) return CC.toast('Chọn ít nhất một giờ uống', 'error');
                if (prescriptionItemId) body.prescription_item_id = prescriptionItemId;
            }
            CC.busy(form.querySelector('[type=submit]'), async () => {
                try {
                    if (editing) await CC.api(`/reminders/${r.id}`, { method: 'PUT', body });
                    else await CC.api('/reminders', { method: 'POST', body });
                    CC.toast(editing ? 'Đã lưu lịch nhắc' : isSelf() ? 'Đã tạo lịch nhắc' : `Đã tạo lịch, ${p.label.toLowerCase()} sẽ nhận chuông báo đúng giờ`, 'success');
                    m.close();
                    render();
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        });
    }

    await render();
    if (CC.param('add')) openForm();
    window.addEventListener('cc:notification', (e) => {
        const kind = (e.detail.data_json || {}).kind;
        if (['DOSE_TAKEN', 'DOSE_SKIPPED', 'MISSED_DOSE', 'REMINDER_CREATED'].includes(kind)) render();
    });
    window.addEventListener('cc:dose-updated', render);
})();
