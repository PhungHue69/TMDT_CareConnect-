/* Ví & thu nhập của bác sĩ. Tự lấy token nên không phụ thuộc tên hàm trong api.js */
(function () {
    function findToken() {
        for (const store of [localStorage, sessionStorage]) {
            for (let i = 0; i < store.length; i++) {
                let v = store.getItem(store.key(i)) || '';
                try { const o = JSON.parse(v); if (o && typeof o === 'object') v = o.token || o.accessToken || v; } catch (e) { /* giữ nguyên */ }
                if (typeof v === 'string' && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) return v;
            }
        }
        return '';
    }

    async function call(path, options) {
        const opt = options || {};
        const res = await fetch('/api/doctor' + path, {
            method: opt.method || 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + findToken() }, opt.headers),
            body: opt.body ? JSON.stringify(opt.body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || ('Lỗi ' + res.status));
        return data;
    }

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
    const date = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '');
    const STATUS = { PENDING: 'Chờ duyệt', PAID: 'Đã chuyển', REJECTED: 'Từ chối' };

    async function load() {
        try {
            const d = await call('/wallet');
            $('cards').innerHTML =
                '<div class="tp-card"><small>Số dư khả dụng</small><b>' + money(d.wallet.balance) + '</b></div>' +
                '<div class="tp-card"><small>Đang tạm giữ</small><b>' + money(d.wallet.pending_escrow_balance) + '</b></div>' +
                '<div class="tp-card"><small>Ca đã hoàn thành</small><b>' + d.stats.completed_count + '</b></div>' +
                '<div class="tp-card"><small>Tổng phí khám</small><b>' + money(d.stats.gross_fee) + '</b></div>';

            $('payouts').innerHTML = d.payouts.length
                ? '<table class="tp-table"><tr><th>Ngày</th><th>Số tiền</th><th>Ngân hàng</th><th>Trạng thái</th></tr>' +
                  d.payouts.map((p) => '<tr><td>' + date(p.created_at) + '</td><td>' + money(p.amount) + '</td><td>' +
                      esc(p.bank_name) + ' - ' + esc(p.bank_account_number) + '</td><td>' + esc(STATUS[p.status] || p.status) + '</td></tr>').join('') +
                  '</table>'
                : 'Chưa có yêu cầu rút nào.';

            $('txs').innerHTML = d.transactions.length
                ? '<table class="tp-table"><tr><th>Ngày</th><th>Loại</th><th>Số tiền</th><th>Số dư sau</th><th>Mô tả</th></tr>' +
                  d.transactions.map((t) => '<tr><td>' + date(t.created_at) + '</td><td>' + esc(t.transaction_type) + '</td><td>' +
                      money(t.amount) + '</td><td>' + money(t.balance_after) + '</td><td>' + esc(t.description) + '</td></tr>').join('') +
                  '</table>'
                : 'Chưa có giao dịch nào.';
        } catch (e) {
            $('cards').innerHTML = '<span class="tp-err">Không tải được ví: ' + esc(e.message) + '</span>';
        }
    }

    $('p-submit').addEventListener('click', async () => {
        const msg = $('p-msg');
        msg.className = 'tp-msg';
        msg.textContent = '';
        try {
            await call('/wallet/payout', {
                method: 'POST',
                body: {
                    amount: Number($('p-amount').value),
                    bank_name: $('p-bank').value,
                    bank_account_number: $('p-number').value,
                    account_holder: $('p-holder').value,
                },
            });
            msg.className = 'tp-msg tp-ok';
            msg.textContent = 'Đã gửi yêu cầu rút tiền, chờ Admin duyệt.';
            load();
        } catch (e) {
            msg.className = 'tp-msg tp-err';
            msg.textContent = e.message;
        }
    });

    load();
})();