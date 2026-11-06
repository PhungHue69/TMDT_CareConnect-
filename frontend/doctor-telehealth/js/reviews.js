/* Đánh giá của bệnh nhân dành cho bác sĩ */
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

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

    async function load() {
        try {
            const res = await fetch('/api/doctor/reviews', { headers: { Authorization: 'Bearer ' + findToken() } });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.message || ('Lỗi ' + res.status));

            $('summary').innerHTML = d.summary.total
                ? '<span class="tp-stars">★</span> <b>' + d.summary.average + '</b> / 5 (' + d.summary.total + ' đánh giá)'
                : 'Chưa có đánh giá nào.';

            $('list').innerHTML = d.reviews.map((r) =>
                '<div class="tp-review"><div class="tp-stars">' + stars(r.rating) + '</div>' +
                '<div>' + esc(r.comment || '(Không có nhận xét)') + '</div>' +
                '<small>' + esc(r.patient_name) + ' · ' + new Date(r.created_at).toLocaleString('vi-VN') + '</small></div>'
            ).join('');
        } catch (e) {
            $('summary').innerHTML = '<span style="color:#dc2626">Không tải được đánh giá: ' + esc(e.message) + '</span>';
        }
    }
    load();
})();