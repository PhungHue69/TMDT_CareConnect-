/* =============================================================================
   CareConnect Pharmacy Portal - Layout Shell dùng chung cho toàn bộ phân hệ
   Quản lý Sidebar, Topbar, phiên Dược sĩ, chuông báo realtime
   ============================================================================= */

(function () {
    const CC = window.CC || {};

    // Đổi link login mặc định của phân hệ về trang đăng nhập Dược sĩ
    CC.loginUrl = '/pharmacy-portal/login.html';

    async function initPortalLayout(activeNavKey, pageTitle) {
        // Kiểm tra xem đã đăng nhập chưa
        const user = CC.auth.user;
        if (!CC.auth.token || !user) {
            location.replace(CC.loginUrl);
            return null;
        }

        // Kiểm tra vai trò PHARMACIST
        if (user.role !== 'PHARMACIST') {
            alert('Tài khoản của bạn không có quyền truy cập Cổng Dược sĩ / Nhà thuốc!');
            CC.auth.clear();
            location.replace(CC.loginUrl);
            return null;
        }

        let pharmacyData = null;
        try {
            pharmacyData = await CC.api('/pharmacy/me');
        } catch (err) {
            console.error('Lỗi lấy thông tin nhà thuốc:', err);
            CC.toast(err.message || 'Không thể tải thông tin nhà thuốc', 'danger');
        }

        const p = pharmacyData ? pharmacyData.pharmacy : { name: 'Nhà thuốc GPP', gpp_certificate: 'GPP-00' };
        const u = (pharmacyData && pharmacyData.user) ? pharmacyData.user : user;

        // Render Sidebar
        const sidebarEl = CC.$('#portal-sidebar');
        if (sidebarEl) {
            sidebarEl.innerHTML = `
                <div class="portal-brand">
                    <div class="portal-brand-logo">${CC.icon('heart')}</div>
                    <div class="portal-brand-text">
                        <h1>CareConnect</h1>
                        <span>Pharmacy Portal</span>
                    </div>
                    <button type="button" class="btn-sidebar-close" id="btn-close-sidebar" aria-label="Đóng menu">${CC.icon('x', 'icon-sm')}</button>
                </div>
                <nav class="portal-nav">
                    <div class="portal-nav-group-title">Nghiệp vụ Nhà thuốc</div>
                    <a href="index.html" class="portal-nav-link ${activeNavKey === 'dashboard' ? 'active' : ''}">
                        <span class="nav-icon">${CC.icon('home', 'icon-sm')}</span> Tổng quan
                    </a>
                    <a href="prescriptions.html" class="portal-nav-link ${activeNavKey === 'prescriptions' ? 'active' : ''}">
                        <span class="nav-icon">${CC.icon('clipboard', 'icon-sm')}</span> Báo giá đơn thuốc
                        <span class="portal-nav-badge" id="badge-rx-count" style="display:none">0</span>
                    </a>
                    <a href="inventory.html" class="portal-nav-link ${activeNavKey === 'inventory' ? 'active' : ''}">
                        <span class="nav-icon">${CC.icon('box', 'icon-sm')}</span> Quản lý kho thuốc
                    </a>
                    <a href="orders.html" class="portal-nav-link ${activeNavKey === 'orders' ? 'active' : ''}">
                        <span class="nav-icon">${CC.icon('bag', 'icon-sm')}</span> Đơn hàng bán ra
                        <span class="portal-nav-badge" id="badge-orders-count" style="display:none">0</span>
                    </a>
                    
                    <div class="portal-nav-group-title">Tài chính & Quản trị</div>
                    <a href="wallet.html" class="portal-nav-link ${activeNavKey === 'wallet' ? 'active' : ''}">
                        <span class="nav-icon">${CC.icon('wallet', 'icon-sm')}</span> Ví & Doanh thu
                    </a>
                    <a href="profile.html" class="portal-nav-link ${activeNavKey === 'profile' ? 'active' : ''}">
                        <span class="nav-icon">${CC.icon('settings', 'icon-sm')}</span> Thông tin nhà thuốc
                    </a>
                </nav>
                <div class="portal-sidebar-footer">
                    <div class="pharmacy-badge-box">
                        <div class="pharmacy-avatar">${CC.initials(p.name)}</div>
                        <div class="pharmacy-info">
                            <div class="pharmacy-name" title="${CC.esc(p.name)}">${CC.esc(p.name)}</div>
                            <div class="pharmacist-name">DS. ${CC.esc(u.full_name || 'Dược sĩ')}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Render Topbar
        const topbarEl = CC.$('#portal-topbar');
        if (topbarEl) {
            topbarEl.innerHTML = `
                <div class="topbar-left">
                    <button type="button" class="btn-sidebar-toggle" id="btn-toggle-sidebar" aria-label="Mở menu">
                        ${CC.icon('menu')}
                    </button>
                    <div class="topbar-title-group">
                        <h2 class="topbar-page-title">${CC.esc(pageTitle || 'Cổng Nhà thuốc')}</h2>
                        <div class="topbar-badges">
                            ${p.is_pro_seller ? '<span class="badge badge-pro">⭐ PRO</span>' : ''}
                            <span class="badge badge-success">✓ ${CC.esc(p.gpp_certificate || 'GPP')}</span>
                        </div>
                    </div>
                </div>
                <div class="topbar-right">
                    <button class="btn btn-outline btn-sm topbar-btn" id="btn-portal-refresh" title="Tải lại dữ liệu">
                        <span class="btn-icon">${CC.icon('refresh', 'icon-sm')}</span> <span class="btn-text">Làm mới</span>
                    </button>
                    <button class="btn btn-outline btn-sm topbar-btn" id="btn-portal-logout" style="color:var(--danger)" title="Đăng xuất">
                        <span class="btn-icon">${CC.icon('logout', 'icon-sm')}</span> <span class="btn-text">Đăng xuất</span>
                    </button>
                </div>
            `;

            CC.$('#btn-portal-logout').addEventListener('click', async () => {
                const ok = await CC.confirm('Bạn có chắc chắn muốn kết thúc ca trực và đăng xuất?');
                if (ok) {
                    CC.auth.logout();
                }
            });

            CC.$('#btn-portal-refresh').addEventListener('click', () => {
                location.reload();
            });
        }

        // Tạo backdrop cho mobile drawer nếu chưa có
        let backdropEl = CC.$('#portal-sidebar-backdrop');
        if (!backdropEl) {
            backdropEl = document.createElement('div');
            backdropEl.id = 'portal-sidebar-backdrop';
            backdropEl.className = 'portal-sidebar-backdrop';
            document.body.appendChild(backdropEl);
        }

        const toggleSidebar = (forceState) => {
            const sidebar = CC.$('#portal-sidebar');
            if (!sidebar) return;
            const isOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
            if (isOpen) {
                sidebar.classList.add('open');
                backdropEl.classList.add('active');
                document.body.classList.add('sidebar-drawer-open');
            } else {
                sidebar.classList.remove('open');
                backdropEl.classList.remove('active');
                document.body.classList.remove('sidebar-drawer-open');
            }
        };

        const toggleBtn = CC.$('#btn-toggle-sidebar');
        if (toggleBtn) toggleBtn.addEventListener('click', () => toggleSidebar());

        const closeBtn = CC.$('#btn-close-sidebar');
        if (closeBtn) closeBtn.addEventListener('click', () => toggleSidebar(false));

        backdropEl.addEventListener('click', () => toggleSidebar(false));

        // Tự động đóng sidebar khi chuyển trang trên thiết bị di động
        document.querySelectorAll('.portal-nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 900) toggleSidebar(false);
            });
        });

        // Tạo Mobile Bottom Navigation Bar (thanh điều hướng đáy tiện dụng cho smartphone)
        let bottomNav = CC.$('#portal-bottom-nav');
        if (!bottomNav) {
            bottomNav = document.createElement('nav');
            bottomNav.id = 'portal-bottom-nav';
            bottomNav.className = 'portal-bottom-nav';
            bottomNav.innerHTML = `
                <a href="index.html" class="bottom-nav-item ${activeNavKey === 'dashboard' ? 'active' : ''}">
                    <span class="bottom-nav-icon">${CC.icon('home')}</span>
                    <span class="bottom-nav-label">Tổng quan</span>
                </a>
                <a href="prescriptions.html" class="bottom-nav-item ${activeNavKey === 'prescriptions' ? 'active' : ''}">
                    <span class="bottom-nav-icon">${CC.icon('clipboard')}</span>
                    <span class="bottom-nav-label">Đơn thuốc</span>
                    <span class="bottom-nav-badge" id="bottom-badge-rx" style="display:none">0</span>
                </a>
                <a href="inventory.html" class="bottom-nav-item ${activeNavKey === 'inventory' ? 'active' : ''}">
                    <span class="bottom-nav-icon">${CC.icon('box')}</span>
                    <span class="bottom-nav-label">Kho thuốc</span>
                </a>
                <a href="orders.html" class="bottom-nav-item ${activeNavKey === 'orders' ? 'active' : ''}">
                    <span class="bottom-nav-icon">${CC.icon('bag')}</span>
                    <span class="bottom-nav-label">Đơn hàng</span>
                    <span class="bottom-nav-badge" id="bottom-badge-orders" style="display:none">0</span>
                </a>
                <a href="wallet.html" class="bottom-nav-item ${activeNavKey === 'wallet' ? 'active' : ''}">
                    <span class="bottom-nav-icon">${CC.icon('wallet')}</span>
                    <span class="bottom-nav-label">Ví & Tiền</span>
                </a>
            `;
            document.body.appendChild(bottomNav);
        }

        // Cập nhật số đếm badge thông báo trên Sidebar & Mobile Bottom Bar
        try {
            const dashRes = await CC.api('/pharmacy/dashboard');
            if (dashRes && dashRes.stats) {
                const rxCount = dashRes.stats.pending_prescriptions || 0;
                const ordersCount = dashRes.stats.active_orders || 0;

                const rxBadge = CC.$('#badge-rx-count');
                const bottomRxBadge = CC.$('#bottom-badge-rx');
                if (rxCount > 0) {
                    if (rxBadge) { rxBadge.textContent = rxCount; rxBadge.style.display = 'inline-block'; }
                    if (bottomRxBadge) { bottomRxBadge.textContent = rxCount; bottomRxBadge.style.display = 'inline-block'; }
                }

                const ordersBadge = CC.$('#badge-orders-count');
                const bottomOrdersBadge = CC.$('#bottom-badge-orders');
                if (ordersCount > 0) {
                    if (ordersBadge) { ordersBadge.textContent = ordersCount; ordersBadge.style.display = 'inline-block'; }
                    if (bottomOrdersBadge) { bottomOrdersBadge.textContent = ordersCount; bottomOrdersBadge.style.display = 'inline-block'; }
                }
            }
        } catch (e) {
            // bỏ qua lỗi nếu chưa có dữ liệu dashboard
        }

        // Kết nối Server-Sent Events realtime
        if (CC.realtime) {
            CC.realtime.connect();
            window.addEventListener('cc:notification', (e) => {
                const n = e.detail;
                if (n.type === 'PRESCRIPTION_QUOTE') {
                    CC.toast('Khách hàng vừa gửi yêu cầu báo giá đơn thuốc mới!', 'warning', 'Đơn thuốc mới');
                    if (CC.sound) CC.sound.alert();
                } else if (n.type === 'ORDER_UPDATE') {
                    CC.toast(n.body || 'Có cập nhật đơn hàng mới!', 'info', 'Đơn hàng');
                    if (CC.sound) CC.sound.ding();
                }
            });
        }

        return pharmacyData;
    }

    window.initPortalLayout = initPortalLayout;
})();
