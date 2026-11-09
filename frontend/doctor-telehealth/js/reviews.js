/* Đánh giá của bệnh nhân dành cho bác sĩ */
(function () {
    // Token của tab hiện tại (mỗi tab giữ một tài khoản riêng, xem shared/js/api.js)
    function findToken() {
        return (window.CC && window.CC.auth.token) || '';
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
    window.initDoctorLayout('reviews', 'Đánh giá của bệnh nhân').then((me) => { if (me) load(); });
})();