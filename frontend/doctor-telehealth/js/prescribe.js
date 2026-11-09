/* Doctor Portal (TV3) - Trang Kê đơn điện tử riêng.
   Dùng API: GET /doctor/consultations, GET /doctor/drugs, POST/GET /doctor/consultations/:id/prescription,
   PUT /doctor/consultations/:id/start */
(async function () {
    const CC = window.CC;
    const me = await window.initDoctorLayout('prescribe', 'Kê đơn điện tử');
    if (!me) return;

    const API = '/api/doctor';
    const STATUS = { WAITING: 'Đang chờ', IN_PROGRESS: 'Đang khám', COMPLETED: 'Đã xong' };

    async function call(method, path, body) {
        const res = await fetch(API + path, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CC.auth.token },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401) { location.replace(CC.loginUrl); throw new Error('Hết phiên đăng nhập'); }
        let data = null;
        try { data = await res.json(); } catch (e) { /* không có body */ }
        if (!res.ok) throw new Error((data && (data.error || data.message)) || ('Lỗi ' + res.status));
        return data;
    }
    const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
    const fdate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');
    const esc = (s) => CC.esc(s == null ? '' : String(s));

    // ----- Vùng nội dung: chèn ngay dưới thanh trên -----
    let root = document.getElementById('rx-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'rx-root';
        const topbar = CC.$('#dr-topbar');
        if (topbar && topbar.parentElement) {
            // Xóa nội dung của trang mẫu (nếu copy từ queue.html), giữ lại thẻ script
            let n = topbar.nextElementSibling;
            while (n) { const next = n.nextElementSibling; if (n.tagName !== 'SCRIPT') n.remove(); n = next; }
            topbar.after(root);
        } else {
            document.body.append(root);
        }
    }

    const style = document.createElement('style');
    style.textContent = `
        #rx-root { padding: 24px 32px; max-width: 980px; }
        .rx-card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:18px 20px; margin-bottom:14px; }
        .rx-card h3 { margin:0 0 12px; font-size:17px; }
        .rx-row { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
        .rx-muted { color:#6b7280; font-size:14px; }
        .rx-tag { display:inline-block; padding:2px 10px; border-radius:999px; background:#eef2ff; color:#3730a3; font-size:12px; margin-left:6px; }
        .rx-btn { border:0; border-radius:10px; padding:8px 16px; background:#e8f0fe; color:#2563eb; font-weight:600; cursor:pointer; font-size:14px; }
        .rx-btn.primary { background:#0f9d6b; color:#fff; }
        .rx-btn.ghost { background:#f3f4f6; color:#374151; }
        .rx-btn:disabled { opacity:.5; cursor:not-allowed; }
        .rx-field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
        .rx-field label { font-size:13px; font-weight:600; color:#374151; }
        .rx-field input, .rx-field textarea { border:1px solid #d1d5db; border-radius:10px; padding:8px 12px; font:inherit; }
        .rx-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; }
        .rx-drug { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #f3f4f6; }
        .rx-item { border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:10px; }
        .rx-item-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-weight:600; }
        .rx-x { background:none; border:0; color:#dc2626; cursor:pointer; font-size:14px; }
        .rx-section-title { margin:22px 0 10px; font-size:15px; font-weight:700; color:#111827; }
    `;
    document.head.append(style);

    let consultations = [];

    // ================= DANH SÁCH =================
    async function showList() {
        root.innerHTML = '<div class="rx-card rx-muted">Đang tải...</div>';
        try {
            consultations = (await call('GET', '/consultations')).consultations;
        } catch (err) {
            root.innerHTML = `<div class="rx-card">Không tải được danh sách: ${esc(err.message)}</div>`;
            return;
        }
        const need = consultations.filter((c) => c.status === 'IN_PROGRESS' && !c.has_prescription);
        const waiting = consultations.filter((c) => c.status === 'WAITING');
        const done = consultations.filter((c) => c.has_prescription);

        const card = (c, actions) => `
            <div class="rx-card">
                <div class="rx-row">
                    <div>
                        <strong>${esc(c.patient_name)}</strong>
                        <span class="rx-tag">${esc(c.mode)}</span>
                        <span class="rx-tag">${money(c.fee_amount)}</span>
                        <span class="rx-tag">${esc(STATUS[c.status] || c.status)}</span>
                    </div>
                    <div>${actions}</div>
                </div>
                <div class="rx-muted" style="margin-top:8px">${esc(c.symptom_description || 'Không có mô tả triệu chứng')}</div>
            </div>`;

        const section = (title, list, actionsOf, emptyText) => `
            <div class="rx-section-title">${title} (${list.length})</div>
            ${list.length ? list.map((c) => card(c, actionsOf(c))).join('') : `<div class="rx-card rx-muted">${emptyText}</div>`}`;

        root.innerHTML =
            section('Cần kê đơn', need,
                (c) => `<button class="rx-btn primary" data-act="write" data-id="${c.id}">Kê đơn</button>`,
                'Chưa có ca nào đang khám cần kê đơn.') +
            section('Đang chờ bắt đầu', waiting,
                (c) => `<button class="rx-btn" data-act="start" data-id="${c.id}">Bắt đầu khám</button>`,
                'Không có ca nào đang chờ.') +
            section('Đã kê đơn', done,
                (c) => `<button class="rx-btn ghost" data-act="view" data-id="${c.id}">Xem đơn</button>`,
                'Chưa có đơn thuốc nào được kê.');
    }

    root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === 'start') {
            btn.disabled = true;
            try { await call('PUT', `/consultations/${id}/start`); CC.toast('Đã bắt đầu khám', 'success'); await showList(); }
            catch (err) { CC.toast(err.message, 'danger'); btn.disabled = false; }
        } else if (act === 'write') {
            showForm(consultations.find((c) => String(c.id) === String(id)));
        } else if (act === 'view') {
            showDetail(consultations.find((c) => String(c.id) === String(id)));
        } else if (act === 'back') {
            showList();
        }
    });

    // ================= FORM KÊ ĐƠN =================
    function showForm(c) {
        if (!c) return;
        const items = []; // { master_drug_id, name, strength, quantity, dosage, duration_days, usage_instructions }

        root.innerHTML = `
            <div class="rx-card">
                <div class="rx-row">
                    <div><h3 style="margin:0">Kê đơn cho ${esc(c.patient_name)}</h3>
                    <div class="rx-muted">${esc(c.symptom_description || '')}</div></div>
                    <button class="rx-btn ghost" data-act="back">← Quay lại</button>
                </div>
            </div>

            <div class="rx-card">
                <h3>1. Chẩn đoán</h3>
                <div class="rx-field"><label for="rx-diag">Chẩn đoán</label>
                    <textarea id="rx-diag" rows="2" maxlength="1000" placeholder="Ví dụ: Tăng huyết áp độ 1"></textarea></div>
                <div class="rx-field" style="max-width:220px"><label for="rx-days">Đơn có hiệu lực (ngày)</label>
                    <input id="rx-days" type="number" min="1" value="7"></div>
            </div>

            <div class="rx-card">
                <h3>2. Tìm và thêm thuốc</h3>
                <div class="rx-field"><label for="rx-q">Tên thuốc hoặc hoạt chất</label>
                    <input id="rx-q" type="search" placeholder="Gõ para, amlodipin..." autocomplete="off"></div>
                <div id="rx-results" class="rx-muted">Gõ để tìm thuốc trong danh mục.</div>
            </div>

            <div class="rx-card">
                <h3>3. Thuốc trong đơn (<span id="rx-count">0</span>)</h3>
                <div id="rx-items" class="rx-muted">Chưa có thuốc nào.</div>
            </div>

            <div class="rx-row">
                <button class="rx-btn ghost" data-act="back">Hủy</button>
                <button class="rx-btn primary" id="rx-save">Lưu đơn thuốc</button>
            </div>`;

        const resultsEl = CC.$('#rx-results');
        const itemsEl = CC.$('#rx-items');

        function renderItems() {
            CC.$('#rx-count').textContent = items.length;
            if (!items.length) { itemsEl.className = 'rx-muted'; itemsEl.textContent = 'Chưa có thuốc nào.'; return; }
            itemsEl.className = '';
            itemsEl.innerHTML = items.map((it, idx) => `
                <div class="rx-item">
                    <div class="rx-item-head">
                        <span>${esc(it.name)} <span class="rx-muted">${esc(it.strength || '')}</span></span>
                        <button type="button" class="rx-x" data-remove="${idx}">Xóa</button>
                    </div>
                    <div class="rx-grid">
                        <div class="rx-field"><label>Số lượng *</label>
                            <input type="number" min="1" data-idx="${idx}" data-f="quantity" value="${esc(it.quantity)}"></div>
                        <div class="rx-field"><label>Số ngày dùng</label>
                            <input type="number" min="1" data-idx="${idx}" data-f="duration_days" value="${esc(it.duration_days)}"></div>
                        <div class="rx-field"><label>Liều dùng</label>
                            <input type="text" maxlength="100" data-idx="${idx}" data-f="dosage" value="${esc(it.dosage)}" placeholder="1 viên/lần"></div>
                    </div>
                    <div class="rx-field" style="margin-bottom:0"><label>Cách dùng</label>
                        <input type="text" maxlength="500" data-idx="${idx}" data-f="usage_instructions" value="${esc(it.usage_instructions)}" placeholder="Uống sau ăn, sáng và tối"></div>
                </div>`).join('');
        }

        itemsEl.addEventListener('input', (e) => {
            const f = e.target.dataset.f;
            if (f) items[Number(e.target.dataset.idx)][f] = e.target.value;
        });
        itemsEl.addEventListener('click', (e) => {
            const r = e.target.closest('[data-remove]');
            if (r) { items.splice(Number(r.dataset.remove), 1); renderItems(); }
        });

        let timer = null;
        let lastDrugs = [];
        async function search() {
            const q = CC.$('#rx-q').value.trim();
            if (!q) { resultsEl.className = 'rx-muted'; resultsEl.textContent = 'Gõ để tìm thuốc trong danh mục.'; return; }
            try {
                lastDrugs = (await call('GET', '/drugs?q=' + encodeURIComponent(q))).drugs;
            } catch (err) { resultsEl.textContent = 'Lỗi tìm thuốc: ' + err.message; return; }
            if (!lastDrugs.length) { resultsEl.className = 'rx-muted'; resultsEl.textContent = 'Không tìm thấy thuốc phù hợp.'; return; }
            resultsEl.className = '';
            resultsEl.innerHTML = lastDrugs.map((d) => `
                <div class="rx-drug">
                    <div><strong>${esc(d.name)}</strong>
                        <div class="rx-muted">${esc([d.active_ingredient, d.strength, d.dosage_form].filter(Boolean).join(' · '))}</div></div>
                    <button type="button" class="rx-btn" data-add="${d.id}">+ Thêm</button>
                </div>`).join('');
        }
        CC.$('#rx-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 300); });
        resultsEl.addEventListener('click', (e) => {
            const b = e.target.closest('[data-add]');
            if (!b) return;
            const d = lastDrugs.find((x) => String(x.id) === b.dataset.add);
            if (!d) return;
            if (items.some((i) => String(i.master_drug_id) === String(d.id))) { CC.toast('Thuốc này đã có trong đơn', 'danger'); return; }
            items.push({ master_drug_id: d.id, name: d.name, strength: d.strength, quantity: 1, duration_days: '', dosage: '', usage_instructions: '' });
            renderItems();
        });

        CC.$('#rx-save').addEventListener('click', async (ev) => {
            if (!items.length) { CC.toast('Hãy thêm ít nhất một loại thuốc', 'danger'); return; }
            if (items.some((i) => !Number.isInteger(Number(i.quantity)) || Number(i.quantity) < 1)) {
                CC.toast('Số lượng mỗi thuốc phải là số nguyên từ 1 trở lên', 'danger'); return;
            }
            const ok = await CC.confirm('Lưu đơn thuốc và hoàn thành ca khám này?', { okText: 'Lưu đơn' });
            if (!ok) return;
            ev.target.disabled = true;
            try {
                await call('POST', `/consultations/${c.id}/prescription`, {
                    diagnosis: CC.$('#rx-diag').value.trim(),
                    valid_days: Number(CC.$('#rx-days').value) || 7,
                    items: items.map((i) => ({
                        master_drug_id: i.master_drug_id,
                        quantity: Number(i.quantity),
                        dosage: i.dosage || null,
                        duration_days: i.duration_days ? Number(i.duration_days) : null,
                        usage_instructions: i.usage_instructions || null,
                    })),
                });
                CC.toast('Đã lưu đơn thuốc', 'success');
                await showList();
            } catch (err) {
                CC.toast(err.message, 'danger');
                ev.target.disabled = false;
            }
        });
    }

    // ================= XEM ĐƠN ĐÃ KÊ =================
    async function showDetail(c) {
        if (!c) return;
        root.innerHTML = '<div class="rx-card rx-muted">Đang tải đơn thuốc...</div>';
        let p;
        try {
            p = (await call('GET', `/consultations/${c.id}/prescription`)).prescription;
        } catch (err) {
            root.innerHTML = `<div class="rx-card">${esc(err.message)}<div style="margin-top:12px"><button class="rx-btn ghost" data-act="back">← Quay lại</button></div></div>`;
            return;
        }
        root.innerHTML = `
            <div class="rx-card">
                <div class="rx-row">
                    <div><h3 style="margin:0">Đơn thuốc của ${esc(c.patient_name)}</h3>
                    <div class="rx-muted">Ngày kê ${fdate(p.issued_date)} · Hiệu lực đến ${fdate(p.valid_until)}</div></div>
                    <button class="rx-btn ghost" data-act="back">← Quay lại</button>
                </div>
                <div style="margin-top:12px"><strong>Chẩn đoán:</strong> ${esc(p.diagnosis || 'Không ghi')}</div>
            </div>
            ${(p.items || []).map((i) => `
                <div class="rx-item">
                    <div class="rx-item-head"><span>${esc(i.drug)}</span><span class="rx-muted">SL: ${esc(i.quantity)}</span></div>
                    <div class="rx-muted">${esc([i.dosage, i.duration_days ? i.duration_days + ' ngày' : '', i.usage].filter(Boolean).join(' · ') || 'Không có hướng dẫn thêm')}</div>
                </div>`).join('')}`;
    }

    showList();
})();