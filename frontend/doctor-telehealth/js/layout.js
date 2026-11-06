/* CareConnect Doctor Portal (TV3) - khung dùng chung: kiểm tra phiên Bác sĩ, menu, thanh trên */
(function () {
    const CC = window.CC;

    // Khi hết phiên hoặc đăng xuất, đưa về trang đăng nhập của Bác sĩ (mặc định của api.js là trang Người mua)
    CC.loginUrl = '/doctor-telehealth/login.html';

    const DISCLAIMER = 'Bản mô phỏng phục vụ học tập. Bác sĩ, phòng khám và đơn thuốc là dữ liệu giả, không dùng để tư vấn y tế thật.';

    // Các mục chưa làm hiển thị mờ để cả nhóm thấy khung menu cuối cùng
    const NAV = [
        { key: 'dashboard', icon: '🏠', label: 'Tổng quan', href: 'index.html' },
        { key: 'queue', icon: '💬', label: 'Hàng chờ khám', href: 'queue.html' },
        { key: 'prescribe', icon: '📝', label: 'Kê đơn điện tử', soon: true },
        { key: 'wallet', icon: '💰', label: 'Ví và thu nhập', soon: true },
        { key: 'reviews', icon: '⭐', label: 'Đánh giá', soon: true },
    ];

    async function initDoctorLayout(activeKey, pageTitle) {
        const user = CC.auth.user;
        if (!CC.auth.token || !user) {
            location.replace(CC.loginUrl);
            return null;
        }
        if (user.role !== 'DOCTOR') {
            CC.toast('Tài khoản này không có quyền vào Cổng Bác sĩ', 'danger');
            CC.auth.clear();
            location.replace(CC.loginUrl);
            return null;
        }

        let me;
        try {
            me = await CC.api('/doctor/me');
        } catch (err) {
            CC.toast(err.message || 'Không thể tải hồ sơ bác sĩ', 'danger');
            return null;
        }
        const u = me.user || user;

        const bar = document.createElement('div');
        bar.className = 'dr-disclaimer';
        bar.textContent = DISCLAIMER;
        document.body.prepend(bar);

        const links = NAV.map((n) => n.soon
            ? `<span class="dr-nav-link is-disabled" aria-disabled="true">${n.icon} ${n.label}<small>sắp có</small></span>`
            : `<a class="dr-nav-link ${n.key === activeKey ? 'active' : ''}" href="${n.href}">${n.icon} ${n.label}</a>`
        ).join('');

        const sidebar = CC.$('#dr-sidebar');
        if (sidebar) {
            sidebar.innerHTML = `
                <div class="dr-brand">
                    <div class="dr-brand-logo">🩺</div>
                    <div><h1>CareConnect</h1><span>Cổng Bác sĩ</span></div>
                </div>
                <nav class="dr-nav" aria-label="Menu chính">${links}</nav>
                <div class="dr-sidebar-footer">
                    ${CC.avatar(u)}
                    <div>
                        <div class="name">${CC.esc(u.full_name || 'Bác sĩ')}</div>
                        <div class="sub">${CC.esc(me.doctor.specialty || 'Chưa cập nhật chuyên khoa')}</div>
                    </div>
                </div>`;
        }

        const topbar = CC.$('#dr-topbar');
        if (topbar) {
            topbar.innerHTML = `
                <h2>${CC.esc(pageTitle || 'Cổng Bác sĩ')}</h2>
                <button type="button" class="btn btn-outline btn-sm" id="dr-logout">Đăng xuất</button>`;
            CC.$('#dr-logout').addEventListener('click', async () => {
                const ok = await CC.confirm('Bạn có chắc muốn đăng xuất?', { okText: 'Đăng xuất' });
                if (ok) CC.auth.logout();
            });
        }

        return me;
    }

    window.initDoctorLayout = initDoctorLayout;
})();
