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
                    <div class="portal-brand-logo">💊</div>
                    <div class="portal-brand-text">
                        <h1>CareConnect</h1>
                        <span>Pharmacy Portal</span>
                    </div>
                </div>
                <nav class="portal-nav">
                    <div class="portal-nav-group-title">Nghiệp vụ Nhà thuốc</div>
                    <a href="index.html" class="portal-nav-link ${activeNavKey === 'dashboard' ? 'active' : ''}">
                        <span class="nav-icon">📊</span> Tổng quan
                    </a>
                    <a href="prescriptions.html" class="portal-nav-link ${activeNavKey === 'prescriptions' ? 'active' : ''}">
                        <span class="nav-icon">📋</span> Báo giá đơn thuốc
                        <span class="portal-nav-badge" id="badge-rx-count" style="display:none">0</span>
                    </a>
                    <a href="inventory.html" class="portal-nav-link ${activeNavKey === 'inventory' ? 'active' : ''}">
                        <span class="nav-icon">📦</span> Quản lý kho thuốc
                    </a>
                    <a href="orders.html" class="portal-nav-link ${activeNavKey === 'orders' ? 'active' : ''}">
                        <span class="nav-icon">🛍️</span> Đơn hàng bán ra
                        <span class="portal-nav-badge" id="badge-orders-count" style="display:none">0</span>
                    </a>
                    
                    <div class="portal-nav-group-title">Tài chính & Quản trị</div>
                    <a href="wallet.html" class="portal-nav-link ${activeNavKey === 'wallet' ? 'active' : ''}">
                        <span class="nav-icon">💰</span> Ví & Doanh thu
                    </a>
                    <a href="profile.html" class="portal-nav-link ${activeNavKey === 'profile' ? 'active' : ''}">
                        <span class="nav-icon">⚙️</span> Thông tin nhà thuốc
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
                    <h2 class="topbar-page-title">${CC.esc(pageTitle || 'Cổng Nhà thuốc')}</h2>
                    ${p.is_pro_seller ? '<span class="badge badge-pro">⭐ ĐỐI TÁC PRO</span>' : ''}
                    <span class="badge badge-success">✓ Chuẩn ${CC.esc(p.gpp_certificate || 'GPP')}</span>
                </div>
                <div class="topbar-right">
                    <button class="btn btn-outline btn-sm" id="btn-portal-refresh" title="Tải lại dữ liệu">
                        🔄 Làm mới
                    </button>
                    <button class="btn btn-outline btn-sm" id="btn-portal-logout" style="color:var(--danger)">
                        🚪 Đăng xuất
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

        // Cập nhật số đếm badge thông báo trên Sidebar
        try {
            const dashRes = await CC.api('/pharmacy/dashboard');
            if (dashRes && dashRes.stats) {
                const rxBadge = CC.$('#badge-rx-count');
                if (rxBadge && dashRes.stats.pending_prescriptions > 0) {
                    rxBadge.textContent = dashRes.stats.pending_prescriptions;
                    rxBadge.style.display = 'inline-block';
                }
                const ordersBadge = CC.$('#badge-orders-count');
                if (ordersBadge && dashRes.stats.active_orders > 0) {
                    ordersBadge.textContent = dashRes.stats.active_orders;
                    ordersBadge.style.display = 'inline-block';
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
