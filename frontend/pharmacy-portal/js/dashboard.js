/* =============================================================================
   CareConnect Pharmacy Portal - Dashboard Logic
   ============================================================================= */

document.addEventListener('DOMContentLoaded', async () => {
    // Khởi tạo layout chung (activeNav = 'dashboard', title = 'Tổng quan ca trực')
    const pharmacyData = await initPortalLayout('dashboard', 'Tổng quan ca trực');
    if (!pharmacyData) return;

    loadDashboardData();
});

async function loadDashboardData() {
    try {
        const data = await CC.api('/pharmacy/dashboard');
        const s = data.stats;

        // Cập nhật các thẻ chỉ số KPI
        document.getElementById('kpi-pending-rx').textContent = s.pending_prescriptions;
        document.getElementById('kpi-active-orders').textContent = s.active_orders;
        document.getElementById('kpi-today-revenue').textContent = CC.fmt.money(s.today_revenue);
        document.getElementById('kpi-inventory-alerts').textContent = s.low_stock + s.expiring_soon;
        document.getElementById('kpi-inventory-desc').textContent = `${s.low_stock} thuốc sắp hết • ${s.expiring_soon} cận hạn dùng`;

        // Cập nhật badge trên sidebar nếu có đơn chờ
        const badgeRx = document.getElementById('badge-rx-count');
        if (badgeRx && s.pending_prescriptions > 0) {
            badgeRx.textContent = s.pending_prescriptions;
            badgeRx.style.display = 'inline-block';
        }
        const badgeOrders = document.getElementById('badge-orders-count');
        if (badgeOrders && s.active_orders > 0) {
            badgeOrders.textContent = s.active_orders;
            badgeOrders.style.display = 'inline-block';
        }

        // Render bảng đơn thuốc gần đây
        renderRecentPrescriptions(data.recent_prescriptions);

        // Render bảng đơn hàng gần đây
        renderRecentOrders(data.recent_orders);
    } catch (err) {
        console.error('Lỗi tải dữ liệu dashboard:', err);
        CC.toast(err.message || 'Không thể tải số liệu ca trực', 'danger');
    }
}

function renderRecentPrescriptions(list) {
    const tbody = document.getElementById('table-recent-rx');
    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="center muted" style="padding:24px">Chưa có yêu cầu đơn thuốc nào cần xử lý.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((rx) => {
        let statusBadge = '<span class="badge badge-warning">⏳ Chờ báo giá</span>';
        if (rx.status === 'QUOTED') statusBadge = '<span class="badge badge-info">Đã báo giá</span>';
        if (rx.status === 'ACCEPTED') statusBadge = '<span class="badge badge-success">✓ Đã chốt đơn</span>';
        if (rx.status === 'REJECTED') statusBadge = '<span class="badge badge-danger">Đã từ chối</span>';

        return `
            <tr>
                <td><strong>#RX-${rx.id}</strong><div class="small muted">${CC.fmt.ago(rx.created_at)}</div></td>
                <td>
                    <div style="font-weight:600">${CC.esc(rx.requester_name || rx.patient_name_on_rx || 'Khách vãng lai')}</div>
                    <div class="small muted">${CC.esc(rx.requester_phone || '')}</div>
                </td>
                <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${CC.esc(rx.diagnosis || '')}">
                    ${CC.esc(rx.diagnosis || 'Không có mô tả')}
                </td>
                <td>${statusBadge}</td>
                <td>
                    <a href="prescriptions.html?id=${rx.id}" class="btn btn-outline btn-sm">Xem & Báo giá</a>
                </td>
            </tr>
        `;
    }).join('');
}

function renderRecentOrders(list) {
    const tbody = document.getElementById('table-recent-orders');
    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="center muted" style="padding:24px">Chưa có đơn hàng nào phát sinh gần đây.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((order) => {
        let statusBadge = '<span class="badge badge-warning">Chờ xử lý</span>';
        if (order.status === 'PREPARING') statusBadge = '<span class="badge badge-info">📦 Đang đóng gói</span>';
        if (order.status === 'SHIPPING') statusBadge = '<span class="badge badge-info">🚚 Đang giao hàng</span>';
        if (order.status === 'COMPLETED') statusBadge = '<span class="badge badge-success">✓ Hoàn tất</span>';
        if (order.status === 'CANCELLED') statusBadge = '<span class="badge badge-danger">Đã hủy</span>';

        return `
            <tr>
                <td>
                    <a href="orders.html" style="font-weight:700;color:var(--primary)">#${CC.esc(order.order_code)}</a>
                    <div class="small muted">${CC.fmt.ago(order.created_at)}</div>
                </td>
                <td>
                    <div style="font-weight:600">${CC.esc(order.shipping_recipient_name || 'Khách hàng')}</div>
                    <div class="small muted">${CC.esc(order.shipping_address_line || '')}</div>
                </td>
                <td><strong>${CC.fmt.money(order.total_amount)}</strong></td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}
