(async function () {
    const me = await initDoctorLayout('queue', 'Hàng chờ khám');
    if (!me) return;

    const H = () => ({ Authorization: 'Bearer ' + CC.auth.token, 'Content-Type': 'application/json' });
    const call = async (url, opt = {}) => {
        const r = await fetch('/api/doctor' + url, { ...opt, headers: H() });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Lỗi');
        return j;
    };
    const STATUS = { WAITING: 'Đang chờ', IN_PROGRESS: 'Đang khám', COMPLETED: 'Đã xong', CANCELLED: 'Đã hủy' };
    const box = document.getElementById('queue-box');
    const rx = document.getElementById('rx-box');
    let items = [];

    async function load() {
        try {
            const { consultations } = await call('/consultations');
            if (!consultations.length) { box.innerHTML = '<p>Chưa có ca khám nào.</p>'; return; }
            box.innerHTML = consultations.map((c) => `
                <div style="border:1px solid #dde;border-radius:12px;padding:14px;margin-bottom:10px;background:#fff">
                  <b>${CC.esc(c.patient_name)}</b> · ${c.mode} · ${Number(c.fee_amount).toLocaleString('vi-VN')}đ
                  · <i>${STATUS[c.status]}</i>
                  <div style="color:#667;margin:6px 0">${CC.esc(c.symptom_description || '')}</div>
                  ${c.status === 'WAITING' ? `<button class="btn btn-sm" data-start="${c.id}">Bắt đầu khám</button>` : ''}
                  ${c.status === 'IN_PROGRESS' && !c.has_prescription ? `<button class="btn btn-sm" data-rx="${c.id}">Kê đơn</button>` : ''}
                  ${c.has_prescription ? '<span>✅ Đã kê đơn</span>' : ''}
                </div>`).join('');
        } catch (err) {
            box.innerHTML = '<p>Không tải được danh sách: ' + CC.esc(err.message) + '</p>';
        }
    }

    box.addEventListener('click', async (e) => {
        try {
            if (e.target.dataset.start) {
                await call(`/consultations/${e.target.dataset.start}/start`, { method: 'PUT' });
                CC.toast('Đã bắt đầu khám');
                load();
            }
            if (e.target.dataset.rx) openRx(e.target.dataset.rx);
        } catch (err) { CC.toast(err.message, 'danger'); }
    });

    function openRx(id) {
        items = [];
        rx.style.display = 'block';
        rx.innerHTML = `
          <h3>Kê đơn điện tử (ca #${id})</h3>
          <input id="rx-q" placeholder="Tìm thuốc theo tên hoặc hoạt chất" style="width:100%;padding:10px;margin-bottom:8px">
          <div id="rx-results"></div>
          <h4>Thuốc trong đơn</h4><div id="rx-items"></div>
          <textarea id="rx-diag" placeholder="Chẩn đoán" style="width:100%;padding:10px;margin:8px 0"></textarea>
          <button class="btn btn-primary" id="rx-save">Lưu đơn thuốc</button>`;
        const q = document.getElementById('rx-q');
        const search = async () => {
            const { drugs } = await call('/drugs?q=' + encodeURIComponent(q.value));
            document.getElementById('rx-results').innerHTML = drugs.map((d) =>
                `<div><button class="btn btn-outline btn-sm" data-add="${d.id}" data-name="${CC.esc(d.name)}">+</button>
                 ${CC.esc(d.name)} ${CC.esc(d.strength || '')}</div>`).join('');
        };
        q.addEventListener('input', search);
        search();
        rx.onclick = (e) => {
            if (e.target.dataset.add) {
                items.push({ master_drug_id: +e.target.dataset.add, name: e.target.dataset.name,
                             dosage: '', quantity: 1, duration_days: 7, usage_instructions: '' });
                drawItems();
            }
        };
        document.getElementById('rx-save').onclick = async () => {
            try {
                const body = { diagnosis: document.getElementById('rx-diag').value,
                    items: items.map(({ name, ...rest }) => rest) };
                await call(`/consultations/${id}/prescription`, { method: 'POST', body: JSON.stringify(body) });
                CC.toast('Đã lưu đơn thuốc');
                rx.style.display = 'none';
                load();
            } catch (err) { CC.toast(err.message, 'danger'); }
        };
    }

    function drawItems() {
        const el = document.getElementById('rx-items');
        el.innerHTML = items.map((it, i) => `
          <div style="margin-bottom:6px"><b>${CC.esc(it.name)}</b>
            SL <input type="number" min="1" value="${it.quantity}" data-i="${i}" data-f="quantity" style="width:60px">
            Ngày <input type="number" min="1" value="${it.duration_days}" data-i="${i}" data-f="duration_days" style="width:60px">
            <input placeholder="Cách dùng (VD: 1 viên sáng)" value="${CC.esc(it.usage_instructions)}" data-i="${i}" data-f="usage_instructions" style="width:260px">
          </div>`).join('');
        el.oninput = (e) => {
            const { i, f } = e.target.dataset;
            if (i === undefined) return;
            items[i][f] = f === 'usage_instructions' ? e.target.value : Number(e.target.value);
            if (f === 'usage_instructions') items[i].dosage = e.target.value.slice(0, 100);
        };
    }

    load();
})();