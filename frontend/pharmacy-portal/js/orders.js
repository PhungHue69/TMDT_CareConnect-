/* =============================================================================
   CareConnect Pharmacy Portal - Quản lý Đơn hàng bán ra & Giao vận
   ============================================================================= */

(function () {
    const CC = window.CC || {};

    // Các hàm định dạng an toàn tương thích toàn bộ hệ thống
    const fmtNum = (v) => Number(v || 0).toLocaleString('vi-VN');
    const fmtMoney = (v) => (CC.fmt && CC.fmt.money ? CC.fmt.money(v) : Number(v || 0).toLocaleString('vi-VN') + ' đ');
    const fmtDate = (v) => (CC.fmt && CC.fmt.date ? CC.fmt.date(v) : String(v || '').slice(0, 10));

    // Polyfill để tương thích ngược
    CC.num = CC.num || fmtNum;
    CC.curr = CC.curr || fmtMoney;
    CC.date = CC.date || fmtDate;

    let currentTab = 'ALL';
    let currentSearch = '';
    let currentPage = 1;
    let selectedOrder = null;
    let cachedPharmacyInfo = null;

    // Khởi tạo trang khi DOM sẵn sàng
    document.addEventListener('DOMContentLoaded', async () => {
        // Khởi tạo layout shell chung
        const user = await window.initPortalLayout('orders', 'Quản lý Đơn hàng bán ra & Giao vận');
        if (!user) return;

        // Lấy thông tin nhà thuốc đang đăng nhập
        try {
            const meRes = await CC.api('/pharmacy/me');
            if (meRes && meRes.pharmacy) {
                cachedPharmacyInfo = meRes.pharmacy;
            }
        } catch (e) {
            console.error('Không lấy được thông tin nhà thuốc:', e);
        }

        bindEvents();
        await loadOrders();

        // Lắng nghe realtime chuông báo đổi trạng thái đơn
        if (window.CCRealtime && CC.realtime) {
            CC.realtime.onNotification((notif) => {
                if (notif.type === 'ORDER_UPDATE') {
                    CC.toast(`🔔 Cập nhật đơn hàng: ${notif.title || 'Có thay đổi trạng thái'}`, 'info');
                    loadOrders();
                }
            });
        }
    });

    /**
     * Gắn các sự kiện tương tác giao diện
     */
    function bindEvents() {
        // 1. Chuyển Tab trạng thái
        const tabItems = document.querySelectorAll('.order-tab-item');
        tabItems.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabItems.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                currentTab = tab.getAttribute('data-status');
                currentPage = 1;
                loadOrders();
            });
        });

        // 2. Tìm kiếm đơn hàng (debounce 300ms)
        let searchTimer = null;
        const searchInput = CC.$('#filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    currentSearch = e.target.value.trim();
                    currentPage = 1;
                    loadOrders();
                }, 300);
            });
        }

        // Nút xóa lọc
        const clearBtn = CC.$('#btn-clear-search');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                currentSearch = '';
                currentPage = 1;
                loadOrders();
            });
        }

        // Nút làm mới
        const refreshBtn = CC.$('#btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadOrders();
                CC.toast('Đã làm mới danh sách đơn hàng', 'info');
            });
        }

        // Nút tạo đơn hàng mẫu demo
        const mockSeedBtn = CC.$('#btn-mock-seed');
        if (mockSeedBtn) {
            mockSeedBtn.addEventListener('click', async () => {
                if (!confirm('Hệ thống sẽ tạo 4 đơn hàng mẫu với các trạng thái khác nhau (Chờ xác nhận, Chuẩn bị, Đang giao, Hoàn thành) để kiểm thử quy trình. Bạn có muốn tiếp tục?')) {
                    return;
                }
                try {
                    mockSeedBtn.disabled = true;
                    mockSeedBtn.textContent = '⏳ Đang tạo đơn mẫu...';
                    const res = await CC.api('/pharmacy/orders/mock-seed', { method: 'POST' });
                    CC.toast(res.message || 'Đã tạo thành công các đơn hàng mẫu!', 'success');
                    await loadOrders();
                } catch (err) {
                    CC.toast(err.message || 'Lỗi khi tạo đơn hàng mẫu', 'danger');
                } finally {
                    mockSeedBtn.disabled = false;
                    mockSeedBtn.textContent = '🧪 Tạo đơn hàng mẫu demo';
                }
            });
        }

        // Đóng Modal chi tiết đơn
        const closeModalBtn = CC.$('#btn-close-modal');
        const closeModalBottomBtn = CC.$('#btn-close-modal-bottom');
        const modalEl = CC.$('#modal-order-detail');

        if (closeModalBtn) closeModalBtn.addEventListener('click', closeDetailModal);
        if (closeModalBottomBtn) closeModalBottomBtn.addEventListener('click', closeDetailModal);
        if (modalEl) {
            modalEl.addEventListener('click', (e) => {
                if (e.target === modalEl) closeDetailModal();
            });
        }

        // Nút in phiếu xuất kho từ modal
        const printBtn = CC.$('#btn-print-order');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                if (selectedOrder) {
                    printOrderSlip(selectedOrder);
                }
            });
        }
    }

    /**
     * Tải danh sách đơn hàng từ API
     */
    async function loadOrders() {
        const tbody = CC.$('#orders-tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding:40px;color:var(--muted)">
                    <div style="font-size:1.5rem;margin-bottom:8px">⏳</div>
                    Đang tải danh sách đơn hàng...
                </td>
            </tr>
        `;

        try {
            const queryParams = new URLSearchParams({
                status: currentTab,
                page: currentPage,
                limit: 15,
            });
            if (currentSearch) queryParams.set('q', currentSearch);

            const data = await CC.api(`/pharmacy/orders?${queryParams.toString()}`);

            // Cập nhật thẻ KPI
            if (data.stats) {
                CC.$('#kpi-total-orders').textContent = fmtNum(data.stats.all_count || 0);
                CC.$('#kpi-pending-orders').textContent = fmtNum((data.stats.pending_confirm_count || 0) + (data.stats.preparing_count || 0));
                CC.$('#kpi-shipping-orders').textContent = fmtNum(data.stats.shipping_count || 0);
                CC.$('#kpi-today-revenue').textContent = fmtMoney(data.stats.today_revenue || 0);

                // Cập nhật tab badges
                CC.$('#tab-badge-all').textContent = data.stats.all_count || 0;
                CC.$('#tab-badge-pending').textContent = data.stats.pending_confirm_count || 0;
                CC.$('#tab-badge-preparing').textContent = data.stats.preparing_count || 0;
                CC.$('#tab-badge-shipping').textContent = data.stats.shipping_count || 0;
                CC.$('#tab-badge-completed').textContent = data.stats.completed_count || 0;
                CC.$('#tab-badge-cancelled').textContent = data.stats.cancelled_count || 0;
            }

            renderOrdersTable(data.items || []);
            renderPagination(data.total || 0, data.page || 1, data.limit || 15);
        } catch (err) {
            console.error('Lỗi tải danh sách đơn hàng:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger" style="padding:40px">
                        Lỗi tải dữ liệu: ${CC.esc(err.message || 'Không thể kết nối máy chủ')}
                    </td>
                </tr>
            `;
        }
    }

    /**
     * Render bảng danh sách đơn hàng
     */
    function renderOrdersTable(items) {
        const tbody = CC.$('#orders-tbody');
        if (!items || items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center" style="padding:50px 20px;color:var(--muted)">
                        <div style="font-size:2.5rem;margin-bottom:12px">🛍️</div>
                        <div style="font-size:1.05rem;font-weight:600;color:#334155;margin-bottom:6px">Chưa có đơn hàng nào trong mục này</div>
                        <p class="small muted" style="margin:0">Bạn có thể bấm nút "Tạo đơn hàng mẫu demo" ở trên để kiểm thử đầy đủ các luồng xử lý</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map((o) => {
            // Huy hiệu nguồn đơn
            const rxBadge = o.prescription_id
                ? `<span class="badge badge-info" style="font-size:0.75rem" title="Đơn thuốc kê đơn bác sĩ">📋 Đơn thuốc RX</span>`
                : `<span class="badge badge-neutral" style="font-size:0.75rem">💊 Thuốc OTC</span>`;

            // Huy hiệu quan hệ gia đình (CareConnect O2O: Con đặt cho Bố Mẹ)
            const familyBadge = o.is_family_order
                ? `<div class="family-badge" title="Người đặt: ${CC.esc(o.buyer_name)} (${CC.esc(o.buyer_phone)})">
                       👨‍👩‍👧 Con đặt cho ${CC.esc(o.relationship || 'Bố Mẹ')}
                   </div>`
                : '';

            // Huy hiệu thanh toán
            let paymentBadge = `<span class="badge badge-neutral small">COD</span>`;
            if (o.payment_method === 'ONLINE_ESCROW') {
                if (o.payment_status === 'HOLDING_ESCROW') {
                    paymentBadge = `<span class="badge badge-info small" title="Tiền đang được CareConnect tạm giữ an toàn, sẽ tự động giải phóng vào ví khi khách nhận thuốc">🔒 Đã ký quỹ Escrow</span>`;
                } else if (o.payment_status === 'RELEASED') {
                    paymentBadge = `<span class="badge badge-success small" title="Tiền đã giải phóng vào ví nhà thuốc">✅ Tiền đã vào ví</span>`;
                }
            }

            // Huy hiệu trạng thái đơn hàng
            const statusBadge = getOrderStatusBadge(o.status);

            // Nút thao tác nhanh trực tiếp theo trạng thái
            let quickActionBtn = '';
            if (o.status === 'PENDING_CONFIRM') {
                quickActionBtn = `
                    <button class="btn btn-primary small btn-quick-confirm" data-id="${o.id}" style="padding:4px 8px;font-size:0.78rem">
                        ⚡ Duyệt đơn
                    </button>
                `;
            } else if (o.status === 'CONFIRMED' || o.status === 'PREPARING') {
                quickActionBtn = `
                    <button class="btn btn-outline small btn-quick-ship" data-id="${o.id}" style="padding:4px 8px;font-size:0.78rem;color:var(--primary)">
                        🛵 Bàn giao
                    </button>
                `;
            }

            return `
                <tr>
                    <td>
                        <a href="javascript:void(0)" class="btn-view-order" data-id="${o.id}" style="font-weight:700;font-family:monospace;color:var(--primary)">
                            ${CC.esc(o.order_code)}
                        </a>
                        <div class="small muted" style="margin-top:2px">${o.item_count || 1} món thuốc</div>
                    </td>
                    <td>
                        <div style="font-size:0.85rem">${formatOrderTime(o.created_at)}</div>
                    </td>
                    <td>
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                            <strong style="color:#0f172a">${CC.esc(o.shipping_recipient_name)}</strong>
                            <span class="muted small">(${CC.esc(o.shipping_recipient_phone)})</span>
                            ${familyBadge}
                        </div>
                        <div class="small muted truncate" style="max-width:280px;margin-top:2px" title="${CC.esc(o.shipping_address_line)}">
                            📍 ${CC.esc(o.shipping_address_line)}
                        </div>
                    </td>
                    <td>
                        ${rxBadge}
                    </td>
                    <td>
                        <div style="font-weight:700;color:#0f172a">${fmtMoney(o.total_amount)}</div>
                        <div style="margin-top:2px">${paymentBadge}</div>
                    </td>
                    <td>
                        ${statusBadge}
                    </td>
                    <td style="text-align:right">
                        <div style="display:inline-flex;gap:6px;align-items:center">
                            ${quickActionBtn}
                            <button class="btn btn-outline small btn-view-order" data-id="${o.id}" title="Xem chi tiết & đóng gói" style="padding:4px 8px">
                                👁️
                            </button>
                            <button class="btn btn-outline small btn-print-quick" data-id="${o.id}" title="In phiếu xuất kho GPP" style="padding:4px 8px">
                                🖨️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Gắn sự kiện các nút trên từng dòng
        tbody.querySelectorAll('.btn-view-order').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                openOrderDetail(id);
            });
        });

        tbody.querySelectorAll('.btn-print-quick').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                try {
                    const detail = await CC.api(`/pharmacy/orders/${id}`);
                    printOrderSlip(detail);
                } catch (e) {
                    CC.toast('Lỗi mở phiếu in: ' + e.message, 'danger');
                }
            });
        });

        tbody.querySelectorAll('.btn-quick-confirm').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                await updateOrderStatus(id, 'PREPARING', 'Dược sĩ đã duyệt đơn và bắt đầu chuẩn bị thuốc');
            });
        });

        tbody.querySelectorAll('.btn-quick-ship').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                openOrderDetail(id);
            });
        });
    }

    function openDetailModal() {
        const modalEl = CC.$('#modal-order-detail');
        if (modalEl) {
            modalEl.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    function closeDetailModal() {
        const modalEl = CC.$('#modal-order-detail');
        if (modalEl) {
            modalEl.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    /**
     * Mở modal chi tiết đơn hàng
     */
    async function openOrderDetail(orderId) {
        try {
            CC.toast('Đang tải chi tiết đơn hàng...', 'info');
            const data = await CC.api(`/pharmacy/orders/${orderId}`);
            selectedOrder = data;

            const o = data.order;

            // Header modal
            CC.$('#modal-order-code').textContent = o.order_code;
            CC.$('#modal-order-date').textContent = `Thời gian đặt: ${formatOrderTime(o.created_at)}`;

            // Người nhận & Người mua
            CC.$('#modal-recipient-name').textContent = o.shipping_recipient_name;
            const phoneEl = CC.$('#modal-recipient-phone');
            phoneEl.textContent = o.shipping_recipient_phone;
            phoneEl.href = `tel:${o.shipping_recipient_phone}`;
            CC.$('#modal-shipping-address').textContent = o.shipping_address_line;

            // Huy hiệu gia đình
            const familyTagEl = CC.$('#modal-family-tag');
            if (o.is_family_order) {
                familyTagEl.innerHTML = `<span class="family-badge">👨‍👩‍👧 Con đặt thuốc cho ${CC.esc(o.relationship || 'Bố Mẹ')}</span>`;
                CC.$('#modal-buyer-box').style.display = 'block';
                CC.$('#modal-buyer-name').textContent = o.buyer_name;
                CC.$('#modal-buyer-phone').textContent = o.buyer_phone;
            } else {
                familyTagEl.innerHTML = '';
                CC.$('#modal-buyer-box').style.display = 'none';
            }

            // Ghi chú của khách
            CC.$('#modal-note-text').textContent = o.note || 'Không có ghi chú thêm từ khách hàng';

            // Danh sách thuốc đóng gói
            CC.$('#modal-item-count').textContent = `${data.items.length} món`;
            const itemsTbody = CC.$('#modal-items-tbody');
            itemsTbody.innerHTML = data.items.map((it) => {
                const shelfBadge = it.shelf_location
                    ? `<span class="badge badge-neutral" style="font-family:monospace;font-weight:700">Kệ ${CC.esc(it.shelf_location)}</span>`
                    : `<span class="badge badge-neutral" style="font-size:0.75rem">Kho GPP</span>`;

                const expiryInfo = it.nearest_expiry_date
                    ? `<div class="small muted">HSD: ${fmtDate(it.nearest_expiry_date)}</div>`
                    : '';

                return `
                    <tr>
                        <td>
                            <div style="font-weight:600;color:#0f172a">${CC.esc(it.product_name_snapshot)}</div>
                            <div class="small muted">
                                ${CC.esc(it.active_ingredient || '')} ${CC.esc(it.strength || '')} (${CC.esc(it.dosage_form || '')})
                            </div>
                            ${expiryInfo}
                        </td>
                        <td style="text-align:center">
                            ${shelfBadge}
                        </td>
                        <td style="text-align:center;font-weight:700;color:var(--primary);font-size:0.95rem">
                            ${it.quantity} <span class="small muted font-normal">${CC.esc(it.unit || 'đơn vị')}</span>
                        </td>
                        <td style="text-align:right">
                            ${fmtMoney(it.unit_price)}
                        </td>
                        <td style="text-align:right;font-weight:600;color:#0f172a">
                            ${fmtMoney(it.total_price)}
                        </td>
                    </tr>
                `;
            }).join('');

            // Tài chính & Thực nhận
            CC.$('#modal-subtotal-val').textContent = fmtMoney(o.subtotal_amount);
            CC.$('#modal-shipping-fee-val').textContent = fmtMoney(o.shipping_fee);
            CC.$('#modal-commission-val').textContent = `-${fmtMoney(o.platform_commission_amount)}`;
            CC.$('#modal-net-payout-val').textContent = fmtMoney(o.net_payout_amount);

            // Render khung Giao vận
            renderShipmentCard(data.shipment);

            // Render Nhật ký trạng thái (Timeline)
            renderTimeline(data.logs || [], o.created_at);

            // Render khung Thao tác đổi trạng thái (Action Box)
            renderActionBox(o, data.shipment);

            // Mở modal
            openDetailModal();
        } catch (err) {
            console.error('Lỗi khi mở chi tiết đơn:', err);
            CC.toast(err.message || 'Không thể xem chi tiết đơn hàng', 'danger');
        }
    }

    /**
     * Render thẻ thông tin giao vận
     */
    function renderShipmentCard(shipment) {
        const contentEl = CC.$('#modal-shipment-content');
        const providerBadge = CC.$('#modal-shipment-provider');

        if (!shipment || !shipment.driver_name) {
            providerBadge.textContent = 'CHƯA GÁN';
            providerBadge.className = 'badge badge-neutral';
            contentEl.innerHTML = `
                <div class="small muted" style="padding:10px 0;text-align:center">
                    Đơn hàng chưa kết nối hoặc chưa bàn giao cho đối tác giao hàng
                </div>
            `;
            return;
        }

        providerBadge.textContent = shipment.provider || 'AHAMOVE';
        providerBadge.className = shipment.provider === 'GRAB_EXPRESS' 
            ? 'badge badge-success' 
            : shipment.provider === 'INTERNAL_SHIPPER' 
                ? 'badge badge-warning' 
                : 'badge badge-info';

        const statusBadges = {
            ASSIGNING_DRIVER: '<span class="badge badge-warning" style="font-size:0.75rem">Đang điều phối xe</span>',
            DRIVER_ACCEPTED: '<span class="badge badge-info" style="font-size:0.75rem">Tài xế đang tới quầy</span>',
            PICKING_UP: '<span class="badge badge-info" style="font-size:0.75rem">Đang nhận thuốc</span>',
            IN_TRANSIT: '<span class="badge badge-primary" style="font-size:0.75rem">Đang giao thuốc</span>',
            DELIVERED: '<span class="badge badge-success" style="font-size:0.75rem">Đã giao thành công</span>',
            FAILED: '<span class="badge badge-danger" style="font-size:0.75rem">Giao thất bại / Hoàn hàng</span>',
            CANCELLED: '<span class="badge badge-danger" style="font-size:0.75rem">Đã hủy cuốc xe</span>'
        };

        const statusTag = statusBadges[shipment.status] || '';
        const trackingLink = shipment.tracking_url 
            ? `<a href="${CC.esc(shipment.tracking_url)}" target="_blank" style="color:var(--primary);text-decoration:none;font-weight:600">📍 Theo dõi GPS</a>` 
            : '';

        contentEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px">
                <div class="driver-avatar" style="font-size:1.8rem">🛵</div>
                <div style="flex:1">
                    <div style="display:flex;align-items:center;justify-content:space-between">
                        <strong style="color:#0f172a">${CC.esc(shipment.driver_name)}</strong>
                        ${statusTag}
                    </div>
                    <div class="small" style="margin-top:2px">
                        📞 SĐT: <a href="tel:${shipment.driver_phone}" style="color:var(--primary);font-weight:700">${CC.esc(shipment.driver_phone || '---')}</a>
                    </div>
                    <div class="small muted">
                        Biển số xe: <strong>${CC.esc(shipment.driver_plate || '---')}</strong>
                    </div>
                </div>
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:0.8rem;color:#475569;display:flex;justify-content:space-between;align-items:center">
                <span>Mã vận đơn: <strong>${CC.esc(shipment.tracking_code || '---')}</strong></span>
                ${trackingLink}
            </div>
        `;
    }

    /**
     * Render lịch sử trạng thái Timeline
     */
    function renderTimeline(logs, orderCreatedAt) {
        const timelineEl = CC.$('#modal-timeline');
        if (!logs || logs.length === 0) {
            timelineEl.innerHTML = `
                <div class="timeline-item active">
                    <div class="timeline-dot"></div>
                    <div class="timeline-title">Đơn hàng được tạo</div>
                    <div class="timeline-time">${formatOrderTime(orderCreatedAt)}</div>
                </div>
            `;
            return;
        }

        timelineEl.innerHTML = logs.map((log, index) => {
            const isLast = index === logs.length - 1;
            const statusLabel = getStatusTitle(log.new_status);
            const userNote = log.note ? `<div class="timeline-desc">${CC.esc(log.note)}</div>` : '';
            const byUser = log.changed_by_name ? `<span class="small muted"> (${CC.esc(log.changed_by_name)})</span>` : '';

            return `
                <div class="timeline-item ${isLast ? 'active' : 'success'}">
                    <div class="timeline-dot"></div>
                    <div class="timeline-title">${statusLabel}${byUser}</div>
                    <div class="timeline-time">${formatOrderTime(log.created_at)}</div>
                    ${userNote}
                </div>
            `;
        }).join('');
    }

    /**
     * Render các nút thao tác chuyển trạng thái
     */
    function renderActionBox(order, shipment) {
        const box = CC.$('#modal-action-box');
        const st = order.status;

        if (st === 'PENDING_CONFIRM') {
            box.innerHTML = `
                <p class="small muted" style="margin-bottom:12px">
                    Khách hàng vừa đặt đơn. Dược sĩ kiểm tra các loại thuốc trên kệ và xác nhận bắt đầu đóng gói.
                </p>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <button class="btn btn-primary" id="btn-action-confirm" style="width:100%">
                        ✅ Xác nhận đơn & Bắt đầu chuẩn bị thuốc
                    </button>
                    <button class="btn btn-outline" id="btn-action-cancel" style="width:100%;color:#dc2626;border-color:#fca5a5">
                        ❌ Từ chối / Hủy đơn
                    </button>
                </div>
            `;

            CC.$('#btn-action-confirm').addEventListener('click', async () => {
                await updateOrderStatus(order.id, 'PREPARING', 'Dược sĩ đã duyệt đơn và bắt đầu nhặt thuốc chuẩn bị đóng gói');
            });

            CC.$('#btn-action-cancel').addEventListener('click', async () => {
                const reason = prompt('Nhập lý do từ chối / hủy đơn thuốc này:', 'Hết thuốc trong kho');
                if (reason) {
                    await updateOrderStatus(order.id, 'CANCELLED', 'Nhà thuốc hủy đơn: ' + reason, null, reason);
                }
            });

        } else if (st === 'CONFIRMED' || st === 'PREPARING') {
            let activeShipment = shipment;
            const hasDriver = activeShipment && activeShipment.driver_name && activeShipment.status !== 'CANCELLED' && activeShipment.status !== 'FAILED';

            box.innerHTML = `
                <div style="background:#eff6ff;padding:12px;border-radius:8px;border:1px solid #bfdbfe;margin-bottom:12px;font-size:0.84rem;color:#1e40af">
                    📦 <strong>Đang chuẩn bị hàng:</strong> Dược sĩ hãy nhặt đủ số lượng thuốc, kiểm tra hạn sử dụng và kẹp phiếu xuất kho GPP vào gói thuốc.
                </div>

                <!-- Lựa chọn hình thức điều phối giao hàng -->
                <div style="display:flex;background:#f1f5f9;border-radius:8px;padding:3px;margin-bottom:12px;font-size:0.82rem;font-weight:600">
                    <button type="button" id="tab-btn-auto" style="flex:1;padding:6px;border:none;border-radius:6px;background:#ffffff;color:var(--primary-dark);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.08);transition:all 0.2s">
                        📡 Đặt xe công nghệ (Tự động)
                    </button>
                    <button type="button" id="tab-btn-manual" style="flex:1;padding:6px;border:none;border-radius:6px;background:transparent;color:#64748b;cursor:pointer;transition:all 0.2s">
                        🚴 Shipper nội bộ (Nhập tay)
                    </button>
                </div>

                <!-- Panel 1: Đặt xe công nghệ tự động (Ahamove / GrabExpress) -->
                <div id="panel-dispatch-auto">
                    <div style="font-size:0.78rem;color:#64748b;margin-bottom:10px;line-height:1.4">
                        💡 <em>Hệ thống kết nối trực tiếp API Ahamove/Grab. Khi có tài xế nhận cuốc, thông tin (Tên, SĐT, Biển số xe) sẽ tự động đồng bộ qua Webhook mà Dược sĩ không cần gõ tay.</em>
                    </div>

                    <!-- Khung trạng thái tài xế đã nhận cuốc -->
                    <div id="box-driver-assigned" style="${hasDriver ? 'display:block' : 'display:none'};background:#f0fdf4;border:1px solid #bbf7d0;padding:12px;border-radius:8px;margin-bottom:12px">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                            <span class="badge badge-success" style="font-size:0.75rem">⚡ Đã kết nối tài xế</span>
                            <span id="label-assigned-provider" style="font-size:0.75rem;font-weight:700;color:#15803d">${hasDriver ? (activeShipment.provider || 'AHAMOVE') : 'AHAMOVE'}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                            <div style="font-size:1.8rem">🛵</div>
                            <div style="flex:1">
                                <div style="font-weight:700;font-size:0.9rem;color:#0f172a" id="label-assigned-name">${hasDriver ? CC.esc(activeShipment.driver_name) : 'Nguyễn Văn Hùng'}</div>
                                <div style="font-size:0.78rem;color:#15803d">⭐ 4.9 (1.240 chuyến) • <span id="label-assigned-vehicle">Wave Alpha (Đỏ)</span></div>
                                <div style="font-size:0.8rem;color:#475569">📞 SĐT: <strong id="label-assigned-phone">${hasDriver ? CC.esc(activeShipment.driver_phone) : '0988123456'}</strong> | BS: <strong id="label-assigned-plate">${hasDriver ? CC.esc(activeShipment.driver_plate) : '29B1-888.99'}</strong></div>
                            </div>
                        </div>
                        <div style="color:#166534;background:#dcfce7;padding:6px 10px;border-radius:6px;font-size:0.78rem;margin-bottom:10px">
                            📍 Tài xế đang di chuyển tới nhà thuốc (Dự kiến đến sau 3 - 5 phút).
                        </div>
                        <button class="btn btn-primary" id="btn-confirm-handover" style="width:100%;background:#16a34a;border-color:#16a34a;font-weight:700">
                            🛵 Tài xế đã tới - Bàn giao thuốc cho Shipper
                        </button>
                    </div>

                    <!-- Khung các nút gọi xe khi chưa có tài xế -->
                    <div id="box-call-actions" style="${hasDriver ? 'display:none' : 'display:block'}">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
                            <button type="button" class="btn btn-primary" id="btn-call-ahamove" style="font-size:0.85rem;padding:9px 6px">
                                🚀 Gọi Ahamove Siêu Tốc
                            </button>
                            <button type="button" class="btn btn-outline" id="btn-call-grab" style="font-size:0.85rem;padding:9px 6px;color:#0284c7;border-color:#bae6fd">
                                🚕 Gọi GrabExpress
                            </button>
                        </div>
                        <div style="text-align:center">
                            <button type="button" id="btn-test-no-driver" style="background:none;border:none;color:#d97706;font-size:0.75rem;cursor:pointer;text-decoration:underline">
                                ⚠️ Thử nghiệm kịch bản: Giờ cao điểm / Không có tài xế
                            </button>
                        </div>
                    </div>

                    <!-- Khung cảnh báo khi không tìm được tài xế -->
                    <div id="box-no-driver-alert" style="display:none;background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:8px;margin-bottom:10px">
                        <div style="font-weight:700;color:#b45309;font-size:0.85rem;margin-bottom:4px">
                            ⚠️ Không tìm thấy tài xế trong khu vực!
                        </div>
                        <div style="font-size:0.78rem;color:#92400e;margin-bottom:10px">
                            Hệ thống đã quét trong bán kính 3km nhưng chưa có tài xế nhận cuốc (do thời tiết xấu hoặc giờ cao điểm). Dược sĩ vui lòng chọn giải pháp:
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px">
                            <button type="button" class="btn btn-primary btn-sm" id="btn-retry-dispatch" style="width:100%;font-size:0.82rem">
                                🔄 Thử tìm lại tài xế (Mở rộng bán kính)
                            </button>
                            <button type="button" class="btn btn-outline btn-sm" id="btn-switch-to-grab" style="width:100%;font-size:0.82rem">
                                🚕 Đổi sang đối tác GrabExpress
                            </button>
                            <button type="button" class="btn btn-outline btn-sm" id="btn-switch-to-internal" style="width:100%;font-size:0.82rem">
                                🚴 Cử Shipper nội bộ nhà thuốc tự đi giao
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Panel 2: Shipper nội bộ nhà thuốc (Dược sĩ nhập tay) -->
                <div id="panel-dispatch-manual" style="display:none">
                    <div style="font-size:0.8rem;color:#64748b;margin-bottom:10px">
                        Nhà thuốc tự cử nhân viên tiệm hoặc xe quen giao hàng tận tay khách.
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                        <div>
                            <label class="form-label small" style="font-weight:600">Tên nhân viên giao:</label>
                            <input type="text" id="manual-driver-name" class="form-control small" value="Lê Hoàng Nam (Nhân viên tiệm)" placeholder="Tên nhân viên">
                        </div>
                        <div>
                            <label class="form-label small" style="font-weight:600">SĐT liên hệ:</label>
                            <input type="text" id="manual-driver-phone" class="form-control small" value="0933555777" placeholder="SĐT nhân viên">
                        </div>
                    </div>
                    <div style="margin-bottom:12px">
                        <label class="form-label small" style="font-weight:600">Biển số xe / Phương tiện:</label>
                        <input type="text" id="manual-driver-plate" class="form-control small" value="29X5-112.23" placeholder="Biển số xe máy">
                    </div>
                    <button class="btn btn-primary" id="btn-handover-manual" style="width:100%">
                        🛵 Bàn giao cho Shipper nội bộ & Bắt đầu giao
                    </button>
                </div>
            `;

            // Tab Switching Logic
            const tabAuto = CC.$('#tab-btn-auto');
            const tabManual = CC.$('#tab-btn-manual');
            const panelAuto = CC.$('#panel-dispatch-auto');
            const panelManual = CC.$('#panel-dispatch-manual');

            const setTab = (isAuto) => {
                if (isAuto) {
                    tabAuto.style.background = '#ffffff';
                    tabAuto.style.color = 'var(--primary-dark)';
                    tabAuto.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                    tabManual.style.background = 'transparent';
                    tabManual.style.color = '#64748b';
                    tabManual.style.boxShadow = 'none';
                    panelAuto.style.display = 'block';
                    panelManual.style.display = 'none';
                } else {
                    tabManual.style.background = '#ffffff';
                    tabManual.style.color = 'var(--primary-dark)';
                    tabManual.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                    tabAuto.style.background = 'transparent';
                    tabAuto.style.color = '#64748b';
                    tabAuto.style.boxShadow = 'none';
                    panelManual.style.display = 'block';
                    panelAuto.style.display = 'none';
                }
            };

            tabAuto.addEventListener('click', () => setTab(true));
            tabManual.addEventListener('click', () => setTab(false));

            // Hàm gọi tài xế qua API
            const callDriverAPI = async (provider, simulateNoDriver = false) => {
                try {
                    CC.toast(`📡 Đang kết nối API ${provider}...`, 'info');
                    const res = await CC.api(`/pharmacy/orders/${order.id}/dispatch-driver`, {
                        method: 'POST',
                        body: {
                            provider,
                            simulate_no_driver: simulateNoDriver,
                        }
                    });

                    if (res.no_driver) {
                        CC.$('#box-call-actions').style.display = 'none';
                        CC.$('#box-driver-assigned').style.display = 'none';
                        CC.$('#box-no-driver-alert').style.display = 'block';
                        CC.toast(res.message, 'warning');
                        return;
                    }

                    // Tìm thấy tài xế thành công
                    activeShipment = res.driver;
                    renderShipmentCard(res.driver);

                    CC.$('#box-call-actions').style.display = 'none';
                    CC.$('#box-no-driver-alert').style.display = 'none';
                    CC.$('#box-driver-assigned').style.display = 'block';

                    CC.$('#label-assigned-provider').textContent = res.driver.provider;
                    CC.$('#label-assigned-name').textContent = res.driver.driver_name;
                    CC.$('#label-assigned-vehicle').textContent = res.driver.vehicle_model || 'Xe máy';
                    CC.$('#label-assigned-phone').textContent = res.driver.driver_phone;
                    CC.$('#label-assigned-plate').textContent = res.driver.driver_plate;

                    CC.toast(`⚡ ${res.driver.driver_name} (${res.driver.provider}) đã nhận cuốc xe!`, 'success');
                } catch (err) {
                    console.error('Lỗi gọi tài xế:', err);
                    CC.toast(err.message || 'Không thể kết nối đối tác giao hàng', 'danger');
                }
            };

            CC.$('#btn-call-ahamove').addEventListener('click', () => callDriverAPI('AHAMOVE', false));
            CC.$('#btn-call-grab').addEventListener('click', () => callDriverAPI('GRAB_EXPRESS', false));
            CC.$('#btn-test-no-driver').addEventListener('click', () => callDriverAPI('AHAMOVE', true));

            // Xử lý khi không tìm thấy tài xế
            CC.$('#btn-retry-dispatch').addEventListener('click', () => callDriverAPI('AHAMOVE', false));
            CC.$('#btn-switch-to-grab').addEventListener('click', () => callDriverAPI('GRAB_EXPRESS', false));
            CC.$('#btn-switch-to-internal').addEventListener('click', () => setTab(false));

            // Bàn giao cho tài xế công nghệ
            CC.$('#btn-confirm-handover').addEventListener('click', async () => {
                const driverInfo = activeShipment || {
                    provider: 'AHAMOVE',
                    driver_name: 'Nguyễn Văn Hùng',
                    driver_phone: '0988123456',
                    driver_plate: '29B1-888.99',
                };
                await updateOrderStatus(
                    order.id,
                    'SHIPPING',
                    `Đã đóng gói hoàn tất và bàn giao thuốc cho tài xế ${driverInfo.driver_name} (${driverInfo.provider})`,
                    driverInfo
                );
            });

            // Bàn giao cho Shipper nội bộ
            CC.$('#btn-handover-manual').addEventListener('click', async () => {
                const driverName = CC.$('#manual-driver-name').value.trim() || 'Nhân viên nhà thuốc';
                const driverPhone = CC.$('#manual-driver-phone').value.trim() || '0933555777';
                const driverPlate = CC.$('#manual-driver-plate').value.trim() || '29X5-112.23';

                const shippingInfo = {
                    provider: 'INTERNAL_SHIPPER',
                    driver_name: driverName,
                    driver_phone: driverPhone,
                    driver_plate: driverPlate,
                    tracking_code: `INT-${Date.now().toString().slice(-6)}`,
                };

                await updateOrderStatus(
                    order.id,
                    'SHIPPING',
                    `Đã đóng gói hoàn tất và bàn giao cho Shipper nội bộ: ${shippingInfo.driver_name} (${shippingInfo.driver_phone})`,
                    shippingInfo
                );
            });

        } else if (st === 'SHIPPING') {
            box.innerHTML = `
                <div style="background:#f0fdf4;padding:12px;border-radius:6px;border:1px solid #bbf7d0;margin-bottom:14px;font-size:0.85rem;color:#166534">
                    🛵 <strong>Đang trên đường giao:</strong> Thuốc đang được tài xế giao tới tận tay người nhận.
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <button class="btn btn-primary" id="btn-action-complete" style="width:100%;background:var(--success);border-color:var(--success);font-weight:700">
                        🎉 Xác nhận đã giao thuốc thành công
                    </button>
                    <button class="btn btn-outline" id="btn-action-reschedule" style="width:100%;color:#d97706;border-color:#fde68a;background:#fffbeb;font-weight:600;font-size:0.85rem">
                        ⏰ Khách hẹn giao lại (Giao lần 2)
                    </button>
                    <button class="btn btn-outline" id="btn-action-return" style="width:100%;color:#b91c1c;border-color:#fca5a5;font-size:0.85rem">
                        ↩️ Giao thất bại - Xác nhận nhận lại hàng hoàn (RETURNED)
                    </button>
                </div>
            `;

            CC.$('#btn-action-complete').addEventListener('click', async () => {
                if (confirm('Xác nhận khách hàng đã nhận thuốc thành công? Tiền ký quỹ Escrow sẽ được tự động giải phóng vào Ví nhà thuốc của bạn!')) {
                    await updateOrderStatus(order.id, 'COMPLETED', 'Khách hàng đã nhận thuốc thành công. Tiền đã giải phóng vào ví nhà thuốc.');
                }
            });

            CC.$('#btn-action-reschedule').addEventListener('click', async () => {
                const note = prompt('Nhập ghi chú khách hẹn giao lại (ví dụ: Khách bận họp, hẹn giao lại sau 17:30):', 'Khách bận họp, hẹn giao lại sau 17:30');
                if (note) {
                    await updateOrderStatus(order.id, 'SHIPPING', '⏰ Khách hẹn giao lại: ' + note);
                }
            });

            CC.$('#btn-action-return').addEventListener('click', async () => {
                const reason = prompt('Nhập lý do giao hàng thất bại / hoàn hàng về nhà thuốc:', 'Khách hàng từ chối nhận thuốc hoặc không liên lạc được');
                if (reason) {
                    if (confirm('Xác nhận nhà thuốc đã nhận lại đầy đủ số lượng thuốc hoàn từ tài xế? Hệ thống sẽ tự động CỘNG LẠI TỒN KHO cho nhà thuốc và hoàn tiền ký quỹ cho khách hàng.')) {
                        await updateOrderStatus(order.id, 'RETURNED', 'Giao hàng thất bại, nhà thuốc nhận lại hàng hoàn: ' + reason, null, reason);
                    }
                }
            });

        } else if (st === 'COMPLETED') {
            box.innerHTML = `
                <div style="background:#f0fdf4;padding:14px;border-radius:6px;border:1px solid #86efac;text-align:center">
                    <div style="font-size:1.8rem;margin-bottom:4px">✅</div>
                    <div style="font-weight:700;color:#15803d;font-size:0.95rem">Đơn hàng đã hoàn thành</div>
                    <div class="small" style="color:#166534;margin-top:4px">
                        Tiền thanh toán <strong>${fmtMoney(order.net_payout_amount)}</strong> đã được ghi có vào Ví nhà thuốc.
                    </div>
                </div>
            `;
        } else if (st === 'RETURNED') {
            box.innerHTML = `
                <div style="background:#fffbeb;padding:14px;border-radius:6px;border:1px solid #fde68a;text-align:center">
                    <div style="font-size:1.8rem;margin-bottom:4px">↩️</div>
                    <div style="font-weight:700;color:#b45309;font-size:0.95rem">Đơn hàng đã hoàn trả về nhà thuốc</div>
                    <div class="small" style="color:#92400e;margin-top:4px">
                        Lý do: ${CC.esc(order.cancel_reason || 'Giao hàng không thành công')}
                    </div>
                    <div class="small" style="color:#15803d;margin-top:6px;font-weight:600">
                        ✓ Số lượng thuốc đã được tự động cộng trả lại vào kho nhà thuốc.
                    </div>
                </div>
            `;
        } else if (st === 'CANCELLED') {
            box.innerHTML = `
                <div style="background:#fef2f2;padding:14px;border-radius:6px;border:1px solid #fecaca;text-align:center">
                    <div style="font-size:1.8rem;margin-bottom:4px">⚠️</div>
                    <div style="font-weight:700;color:#b91c1c;font-size:0.95rem">Đơn hàng đã bị hủy</div>
                    <div class="small" style="color:#991b1b;margin-top:4px">
                        Lý do: ${CC.esc(order.cancel_reason || 'Không rõ lý do')}
                    </div>
                </div>
            `;
        }
    }

    /**
     * Gửi yêu cầu cập nhật trạng thái đơn hàng tới API
     */
    async function updateOrderStatus(orderId, newStatus, note, shippingInfo = null, cancelReason = null) {
        try {
            CC.toast('Đang cập nhật trạng thái...', 'info');

            const payload = {
                status: newStatus,
                note: note || '',
                shipping_info: shippingInfo,
                cancel_reason: cancelReason,
            };

            await CC.api(`/pharmacy/orders/${orderId}/status`, {
                method: 'PUT',
                body: payload,
            });

            CC.toast('Cập nhật trạng thái thành công!', 'success');

            // Đóng modal nếu có và tải lại danh sách
            closeDetailModal();
            await loadOrders();
        } catch (err) {
            console.error('Lỗi cập nhật trạng thái đơn:', err);
            CC.toast(err.message || 'Không thể cập nhật trạng thái đơn hàng', 'danger');
        }
    }

    /**
     * Mở popup in phiếu xuất kho kiêm bán lẻ thuốc chuẩn GPP
     */
    function printOrderSlip(orderData) {
        const o = orderData.order;
        const items = orderData.items;
        const pharmacy = cachedPharmacyInfo || {};

        CC.$('#print-pharmacy-name').textContent = pharmacy.name || 'NHÀ THUỐC ĐẠT CHUẨN GPP';
        CC.$('#print-pharmacy-address').textContent = `Địa chỉ: ${pharmacy.address || pharmacy.pharmacy_address || 'Hà Nội'}`;
        CC.$('#print-pharmacy-phone').textContent = pharmacy.phone || pharmacy.pharmacy_phone || '0900000021';

        CC.$('#print-order-code').textContent = o.order_code;
        CC.$('#print-order-time').textContent = `Ngày: ${formatOrderTime(o.created_at)}`;

        CC.$('#print-recipient-name').textContent = o.shipping_recipient_name;
        CC.$('#print-recipient-phone').textContent = o.shipping_recipient_phone;
        CC.$('#print-shipping-address').textContent = o.shipping_address_line;

        CC.$('#print-buyer-name').textContent = `${o.buyer_name} (${o.buyer_phone})`;
        CC.$('#print-payment-method').textContent = o.payment_method === 'ONLINE_ESCROW' ? 'Thanh toán trực tuyến bảo đảm (Escrow)' : 'Thu tiền mặt COD';
        CC.$('#print-note').textContent = o.note || 'Không';

        // Bảng thuốc in
        const printTbody = CC.$('#print-items-tbody');
        printTbody.innerHTML = items.map((it, idx) => {
            return `
                <tr style="border-bottom:1px solid #cbd5e1">
                    <td style="padding:6px;text-align:center">${idx + 1}</td>
                    <td style="padding:6px">
                        <strong>${CC.esc(it.product_name_snapshot)}</strong>
                        <div style="font-size:0.75rem;color:#475569">
                            ${CC.esc(it.active_ingredient || '')} ${CC.esc(it.strength || '')}
                        </div>
                    </td>
                    <td style="padding:6px;text-align:center">${CC.esc(it.unit || 'Hộp')}</td>
                    <td style="padding:6px;text-align:center;font-weight:700">${it.quantity}</td>
                    <td style="padding:6px;text-align:right">${fmtMoney(it.unit_price)}</td>
                    <td style="padding:6px;text-align:right;font-weight:600">${fmtMoney(it.total_price)}</td>
                </tr>
            `;
        }).join('');

        CC.$('#print-subtotal').textContent = fmtMoney(o.subtotal_amount);
        CC.$('#print-shipping-fee').textContent = fmtMoney(o.shipping_fee);
        CC.$('#print-total').textContent = fmtMoney(o.total_amount);

        // Hiển thị khung in và gọi window.print()
        const printArea = CC.$('#print-slip-area');
        printArea.style.display = 'block';
        window.print();
        setTimeout(() => {
            printArea.style.display = 'none';
        }, 1000);
    }

    /**
     * Render các nút phân trang
     */
    function renderPagination(total, page, limit) {
        const totalPages = Math.ceil(total / limit) || 1;
        const infoEl = CC.$('#orders-pagination-info');
        const btnsEl = CC.$('#orders-pagination-btns');

        infoEl.textContent = `Hiển thị trang ${page} / ${totalPages} (Tổng ${total} đơn hàng)`;

        let html = '';
        if (page > 1) {
            html += `<button class="btn btn-outline small" id="page-prev">&laquo; Trước</button>`;
        }
        if (page < totalPages) {
            html += `<button class="btn btn-outline small" id="page-next">Sau &raquo;</button>`;
        }

        btnsEl.innerHTML = html;

        const prevBtn = CC.$('#page-prev');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                currentPage--;
                loadOrders();
            });
        }
        const nextBtn = CC.$('#page-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                currentPage++;
                loadOrders();
            });
        }
    }

    /**
     * Trả về badge trạng thái đơn hàng
     */
    function getOrderStatusBadge(status) {
        switch (status) {
            case 'PENDING_CONFIRM':
                return `<span class="badge badge-warning">⏳ Chờ xác nhận</span>`;
            case 'CONFIRMED':
            case 'PREPARING':
                return `<span class="badge badge-info">📦 Đang chuẩn bị thuốc</span>`;
            case 'SHIPPING':
                return `<span class="badge" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd">🛵 Đang giao hàng</span>`;
            case 'COMPLETED':
                return `<span class="badge badge-success">✅ Hoàn thành</span>`;
            case 'CANCELLED':
                return `<span class="badge badge-neutral">❌ Đã hủy</span>`;
            case 'RETURNED':
                return `<span class="badge badge-danger">↩️ Hoàn hàng</span>`;
            default:
                return `<span class="badge badge-neutral">${CC.esc(status)}</span>`;
        }
    }

    function getStatusTitle(status) {
        switch (status) {
            case 'PENDING_CONFIRM': return 'Chờ nhà thuốc xác nhận';
            case 'CONFIRMED': return 'Nhà thuốc đã duyệt đơn';
            case 'PREPARING': return 'Đang đóng gói thuốc';
            case 'SHIPPING': return 'Bàn giao đối tác giao vận';
            case 'COMPLETED': return 'Đã giao thành công';
            case 'CANCELLED': return 'Đơn hàng bị hủy';
            case 'RETURNED': return 'Đơn hàng bị hoàn trả';
            default: return status;
        }
    }

    function formatOrderTime(isoString) {
        if (!isoString) return '--';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        return `${time} ${date}`;
    }
})();
