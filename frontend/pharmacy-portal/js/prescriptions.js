/* =============================================================================
   CareConnect Pharmacy Portal - Prescription Fulfillment & Quoting Logic
   Hỗ trợ Soi đơn, Đối soát kho, Giới hạn tồn kho & Đổi thuốc cùng hoạt chất
   ============================================================================= */

let currentRxStatus = 'SENT';
let activeRequestId = null;
let currentDetailData = null;
let zoomLevel = 1;
let rotateDeg = 0;

document.addEventListener('DOMContentLoaded', async () => {
    const pharmacyData = await initPortalLayout('prescriptions', 'Tiếp nhận & Báo giá Đơn thuốc');
    if (!pharmacyData) return;

    setupListEvents();
    setupDetailEvents();

    const paramId = CC.param('id');
    if (paramId) {
        openPrescriptionDetail(paramId);
    } else {
        loadPrescriptionsList();
    }
});

function setupListEvents() {
    document.querySelectorAll('.rx-tab-item').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.rx-tab-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentRxStatus = tab.dataset.status;
            loadPrescriptionsList();
        });
    });

    const searchInput = document.getElementById('search-rx-input');
    const searchBtn = document.getElementById('btn-search-rx');
    searchBtn.addEventListener('click', () => loadPrescriptionsList());
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadPrescriptionsList();
    });

    document.getElementById('btn-mock-seed').addEventListener('click', async () => {
        const btn = document.getElementById('btn-mock-seed');
        await CC.busy(btn, async () => {
            try {
                const res = await CC.api('/pharmacy/prescriptions/mock-seed', { method: 'POST' });
                CC.toast('Đã tạo thành công đơn thuốc mẫu mới!', 'success');
                loadPrescriptionsList();
                if (res.request_id) {
                    openPrescriptionDetail(res.request_id);
                }
            } catch (err) {
                CC.toast(err.message || 'Lỗi khi tạo đơn mẫu', 'danger');
            }
        });
    });

    document.getElementById('btn-back-to-list').addEventListener('click', () => {
        history.pushState(null, '', 'prescriptions.html');
        document.getElementById('view-detail').style.display = 'none';
        document.getElementById('view-list').style.display = 'block';
        loadPrescriptionsList();
    });
}

function setupDetailEvents() {
    const imgEl = document.getElementById('dt-rx-img');
    document.getElementById('btn-zoom-in').addEventListener('click', (e) => {
        e.preventDefault();
        zoomLevel = Math.min(zoomLevel + 0.25, 3);
        updateImageTransform();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', (e) => {
        e.preventDefault();
        zoomLevel = Math.max(zoomLevel - 0.25, 0.5);
        updateImageTransform();
    });
    document.getElementById('btn-rotate').addEventListener('click', (e) => {
        e.preventDefault();
        rotateDeg = (rotateDeg + 90) % 360;
        updateImageTransform();
    });
    document.getElementById('btn-view-full').addEventListener('click', (e) => {
        e.preventDefault();
        if (imgEl.src) {
            CC.modal(`
                <div style="text-align:center">
                    <img src="${imgEl.src}" alt="Ảnh lớn" style="max-width:100%;max-height:85vh;border-radius:8px">
                    <div style="margin-top:12px">
                        <button class="btn btn-outline" data-close>Đóng</button>
                    </div>
                </div>
            `, { className: 'modal-lg' });
        }
    });

    function updateImageTransform() {
        imgEl.style.transform = `scale(${zoomLevel}) rotate(${rotateDeg}deg)`;
    }

    document.getElementById('btn-reject-rx').addEventListener('click', async () => {
        if (!activeRequestId) return;
        const modalHtml = `
            <div class="modal-header">
                <h3 style="font-size:1.15rem;font-weight:700;color:var(--danger)">Từ chối phục vụ đơn thuốc</h3>
                <p class="muted small" style="margin-top:4px">Vui lòng nhập lý do để thông báo rõ ràng cho khách hàng.</p>
            </div>
            <div class="field" style="margin-top:16px">
                <label for="reject-reason-input">Lý do từ chối *</label>
                <textarea class="input" id="reject-reason-input" rows="3" placeholder="Ví dụ: Nhà thuốc tạm hết kháng sinh này, chữ viết bác sĩ quá mờ không dịch được..."></textarea>
            </div>
            <div class="modal-actions" style="margin-top:20px">
                <button type="button" class="btn btn-outline" data-close>Hủy</button>
                <button type="button" class="btn btn-danger" id="btn-confirm-reject">Xác nhận từ chối</button>
            </div>
        `;
        const { el, close } = CC.modal(modalHtml);
        el.querySelector('#btn-confirm-reject').addEventListener('click', async () => {
            const reason = el.querySelector('#reject-reason-input').value.trim();
            if (!reason) {
                CC.toast('Vui lòng nhập lý do từ chối', 'warning');
                return;
            }
            try {
                await CC.api(`/pharmacy/prescriptions/${activeRequestId}/reject`, {
                    method: 'POST',
                    body: { reject_reason: reason }
                });
                CC.toast('Đã từ chối đơn thuốc thành công', 'success');
                close();
                openPrescriptionDetail(activeRequestId);
            } catch (err) {
                CC.toast(err.message || 'Lỗi khi từ chối đơn', 'danger');
            }
        });
    });

    document.getElementById('form-quote-submission').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeRequestId) return;

        const note = document.getElementById('quote-pharmacist-note').value.trim();
        const expiresInHours = Number(document.getElementById('quote-expiry').value) || 24;

        const items = [];
        const itemRows = document.querySelectorAll('.quote-row-item');
        let hasStockError = false;

        itemRows.forEach(row => {
            const rxItemId = Number(row.dataset.rxItemId);
            const inventoryId = row.dataset.inventoryId ? Number(row.dataset.inventoryId) : null;
            const isSubstitute = row.dataset.isSubstitute === 'true';
            const maxStock = row.dataset.maxStock !== '' ? Number(row.dataset.maxStock) : null;
            const drugName = row.dataset.drugName || 'Thuốc';
            const qty = Number(row.querySelector('.input-quote-qty').value);
            const price = Number(row.querySelector('.input-quote-price').value);
            const itemNote = row.querySelector('.input-quote-note').value.trim();

            if (maxStock !== null && qty > maxStock) {
                CC.toast(`Số lượng thuốc "${drugName}" (${qty}) vượt quá tồn kho thực tế (${maxStock})!`, 'danger');
                hasStockError = true;
                row.querySelector('.input-quote-qty').focus();
                return;
            }

            items.push({
                prescription_item_id: rxItemId,
                pharmacy_inventory_id: inventoryId,
                is_substitute: isSubstitute,
                quantity: qty,
                unit_price: price,
                note: itemNote || null
            });
        });

        if (hasStockError) return;

        if (items.length === 0) {
            CC.toast('Vui lòng nhập ít nhất 1 dòng thuốc để báo giá', 'warning');
            return;
        }

        const confirmOk = await CC.confirm(`Bạn có chắc chắn muốn gửi báo giá này cho khách hàng? Báo giá sẽ có hiệu lực trong ${expiresInHours} giờ.`);
        if (!confirmOk) return;

        const submitBtn = document.getElementById('btn-submit-quote');
        await CC.busy(submitBtn, async () => {
            try {
                await CC.api(`/pharmacy/prescriptions/${activeRequestId}/quote`, {
                    method: 'POST',
                    body: {
                        pharmacist_note: note,
                        expires_in_hours: expiresInHours,
                        items
                    }
                });
                CC.toast('Đã gửi báo giá thành công tới khách hàng!', 'success');
                openPrescriptionDetail(activeRequestId);
            } catch (err) {
                CC.toast(err.message || 'Lỗi khi gửi báo giá', 'danger');
            }
        });
    });
}

async function loadPrescriptionsList() {
    const tbody = document.getElementById('rx-table-body');
    tbody.innerHTML = `<tr><td colspan="7" class="center muted" style="padding:40px"><span class="spinner"></span> Đang tải yêu cầu đơn thuốc...</td></tr>`;

    const searchVal = document.getElementById('search-rx-input').value.trim();

    try {
        const query = new URLSearchParams();
        if (currentRxStatus) query.set('status', currentRxStatus);
        if (searchVal) query.set('q', searchVal);

        const data = await CC.api('/pharmacy/prescriptions?' + query.toString());

        const s = data.stats;
        document.getElementById('tab-badge-sent').textContent = s.sent_count;
        document.getElementById('tab-badge-quoted').textContent = s.quoted_count;
        document.getElementById('tab-badge-accepted').textContent = s.accepted_count;
        document.getElementById('tab-badge-rejected').textContent = s.rejected_count;
        document.getElementById('tab-badge-all').textContent = s.all_count;

        renderPrescriptionsTable(data.items);
    } catch (err) {
        console.error('Lỗi tải danh sách đơn thuốc:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="center" style="color:var(--danger);padding:40px">Lỗi: ${CC.esc(err.message)}</td></tr>`;
    }
}

function renderPrescriptionsTable(items) {
    const tbody = document.getElementById('rx-table-body');
    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="center muted" style="padding:40px">Không có yêu cầu đơn thuốc nào trong mục này.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(rx => {
        let statusBadge = '<span class="badge badge-warning">⏳ Chờ báo giá</span>';
        if (rx.status === 'QUOTED') statusBadge = '<span class="badge badge-info">📝 Đã báo giá</span>';
        if (rx.status === 'ACCEPTED') statusBadge = '<span class="badge badge-success">✓ Khách đã chốt</span>';
        if (rx.status === 'REJECTED') statusBadge = '<span class="badge badge-danger">❌ Đã từ chối</span>';

        let sourceBadge = '<span class="badge badge-gray">Tải ảnh</span>';
        if (rx.source === 'E_PRESCRIPTION') sourceBadge = '<span class="badge badge-info">Đơn điện tử</span>';

        return `
            <tr>
                <td>
                    <strong>#RX-${rx.id}</strong>
                    <div class="small muted">${CC.fmt.ago(rx.created_at)}</div>
                </td>
                <td>
                    <div style="font-weight:700;color:var(--text)">${CC.esc(rx.patient_name_on_rx || rx.requester_name || 'Khách vãng lai')}</div>
                    <div class="small muted">Người gửi: ${CC.esc(rx.requester_name || '')} (${CC.esc(rx.requester_phone || '')})</div>
                </td>
                <td>
                    <div style="font-weight:600;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${CC.esc(rx.diagnosis || '')}">
                        ${CC.esc(rx.diagnosis || 'Không có chẩn đoán')}
                    </div>
                    <div class="small muted">${CC.esc(rx.facility_name_raw || 'Bệnh viện / Cơ sở y tế')}</div>
                </td>
                <td>${sourceBadge}</td>
                <td><span style="font-weight:700">${rx.item_count}</span> thuốc</td>
                <td>${statusBadge}</td>
                <td style="text-align:right">
                    <button class="btn btn-primary btn-sm btn-view-rx" data-id="${rx.id}">
                        📋 Soi đơn & Báo giá
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-view-rx').forEach(btn => {
        btn.addEventListener('click', () => {
            openPrescriptionDetail(btn.dataset.id);
        });
    });
}

async function openPrescriptionDetail(requestId) {
    activeRequestId = requestId;
    history.pushState(null, '', `prescriptions.html?id=${requestId}`);

    document.getElementById('view-list').style.display = 'none';
    document.getElementById('view-detail').style.display = 'block';

    const titleEl = document.getElementById('detail-header-title');
    const badgeEl = document.getElementById('detail-header-badge');
    titleEl.textContent = `Đang tải đơn thuốc #RX-${requestId}...`;

    try {
        const data = await CC.api(`/pharmacy/prescriptions/${requestId}`);
        currentDetailData = data;
        const req = data.request;

        titleEl.textContent = `Chi tiết đơn thuốc #RX-${req.id}`;
        
        let statusBadge = '<span class="badge badge-warning">⏳ Chờ báo giá</span>';
        if (req.status === 'QUOTED') statusBadge = '<span class="badge badge-info">📝 Đã gửi báo giá</span>';
        if (req.status === 'ACCEPTED') statusBadge = '<span class="badge badge-success">✓ Khách đã chốt đơn</span>';
        if (req.status === 'REJECTED') statusBadge = '<span class="badge badge-danger">❌ Đã từ chối</span>';
        badgeEl.innerHTML = statusBadge;

        document.getElementById('dt-patient-name').textContent = req.patient_name_on_rx || req.requester_name || 'Bệnh nhân';
        document.getElementById('dt-requester-info').textContent = `${req.requester_name || 'Khách'} (${req.requester_phone || ''})`;
        document.getElementById('dt-facility').textContent = req.facility_name_raw || 'Bệnh viện / Cơ sở y tế';
        document.getElementById('dt-prescriber').textContent = req.prescriber_name_raw || (req.doctor_name ? `BS. ${req.doctor_name}` : 'Bác sĩ điều trị');
        document.getElementById('dt-diagnosis').textContent = req.diagnosis || 'Không có thông tin chẩn đoán';

        let srcText = '<span class="badge badge-gray">Ảnh chụp đơn thuốc</span>';
        if (req.source === 'E_PRESCRIPTION') srcText = '<span class="badge badge-info">Đơn điện tử CareConnect</span>';
        document.getElementById('dt-source-badge').innerHTML = srcText;

        // Hiển thị thông tin kiểm duyệt AI OCR & Guardrail (Luồng 3 - AI & OCR Quét đơn thuốc)
        const aiBox = document.getElementById('dt-ai-guardrail-box');
        if (aiBox) {
            if (req.source === 'E_PRESCRIPTION') {
                aiBox.innerHTML = `
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:10px 12px;border-radius:8px;font-size:0.85rem">
                        <div style="font-weight:700;display:flex;align-items:center;gap:6px">🩺 ĐƠN THUỐC ĐIỆN TỬ CARECONNECT</div>
                        <div style="margin-top:4px;color:#1d4ed8">Kê bởi Bác sĩ chuyên khoa xác thực. Toàn vẹn dữ liệu số 100%.</div>
                    </div>
                `;
            } else if (data.ai_log) {
                const confPercent = Math.round((Number(data.ai_log.confidence) || 0.98) * 100);
                const modelName = data.ai_log.model_name || 'Gemini Vision AI';
                if (req.ai_validation_status === 'APPROVED' || !data.ai_log.flagged_reason) {
                    aiBox.innerHTML = `
                        <div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:10px 12px;border-radius:8px;font-size:0.85rem">
                            <div style="font-weight:700;display:flex;align-items:center;gap:6px">🤖 AI OCR (${CC.esc(modelName)}): HỢP LỆ (${confPercent}%)</div>
                            <div style="margin-top:4px;color:#047857">Đã trích xuất & đối soát tự động danh mục thuốc Bộ Y Tế.</div>
                        </div>
                    `;
                } else {
                    aiBox.innerHTML = `
                        <div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:10px 12px;border-radius:8px;font-size:0.85rem">
                            <div style="font-weight:700;display:flex;align-items:center;gap:6px">⚠️ AI OCR (${CC.esc(modelName)}): CẦN DUYỆT LẠI (${confPercent}%)</div>
                            <div style="margin-top:4px;color:#b45309">Lý do: ${CC.esc(data.ai_log.flagged_reason || 'Chữ viết tay mờ hoặc thiếu thông tin chẩn đoán')}</div>
                        </div>
                    `;
                }
            } else {
                aiBox.innerHTML = `
                    <div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:10px 12px;border-radius:8px;font-size:0.85rem">
                        <div style="font-weight:700;display:flex;align-items:center;gap:6px">🛡️ AI Guardrail: ĐƠN THUỐC HỢP LỆ</div>
                        <div style="margin-top:4px;color:#047857">Đã qua bộ lọc an toàn và kiểm tra tính hợp lệ trước khi gửi nhà thuốc.</div>
                    </div>
                `;
            }
        }

        const imgCard = document.getElementById('card-rx-image');
        const rxImg = document.getElementById('dt-rx-img');
        if (req.prescription_image_url) {
            imgCard.style.display = 'block';
            rxImg.src = req.prescription_image_url;
            zoomLevel = 1;
            rotateDeg = 0;
            rxImg.style.transform = 'scale(1) rotate(0deg)';
        } else {
            imgCard.style.display = 'none';
        }

        renderQuotingForm(data);

    } catch (err) {
        console.error('Lỗi tải chi tiết đơn thuốc:', err);
        CC.toast(err.message || 'Không thể tải chi tiết đơn thuốc', 'danger');
    }
}

/**
 * Render Form Lập Báo giá với tính năng ĐỔI THUỐC CÙNG HOẠT CHẤT
 */
function renderQuotingForm(data) {
    const container = document.getElementById('quote-items-container');
    const req = data.request;
    const prescribedItems = data.prescribed_items || [];
    const quotedItems = data.quoted_items || [];
    const allInventory = data.all_inventory || [];

    document.getElementById('dt-item-count').textContent = `${prescribedItems.length} loại thuốc được kê`;
    document.getElementById('quote-pharmacist-note').value = req.pharmacist_note || '';

    const isLocked = ['ACCEPTED', 'REJECTED'].includes(req.status);
    const actionButtons = document.getElementById('quote-action-buttons');
    if (isLocked) {
        actionButtons.style.display = 'none';
        document.getElementById('quote-pharmacist-note').disabled = true;
        document.getElementById('quote-expiry').disabled = true;
    } else {
        actionButtons.style.display = 'flex';
        document.getElementById('quote-pharmacist-note').disabled = false;
        document.getElementById('quote-expiry').disabled = false;
    }

    if (prescribedItems.length === 0) {
        container.innerHTML = `<div class="center muted" style="padding:30px">Đơn thuốc này chưa có danh mục thuốc chi tiết.</div>`;
        return;
    }

    container.innerHTML = prescribedItems.map((item, idx) => {
        const quoted = quotedItems.find(q => q.prescription_item_id === item.id);

        const hasInventory = Boolean(item.inventory_id);
        const currentStock = hasInventory ? Number(item.current_stock) : null;
        const prescribedQty = Number(item.prescribed_quantity) || 1;

        let initialQty = quoted ? quoted.quantity : prescribedQty;
        let isOverPrescribed = false;
        if (hasInventory && currentStock !== null && prescribedQty > currentStock && !quoted) {
            initialQty = Math.max(0, currentStock);
            isOverPrescribed = true;
        }

        const unitPrice = quoted ? quoted.unit_price : (item.pharmacy_price || item.reference_price || 0);
        const note = quoted ? (quoted.note || '') : '';
        const isSubstitute = quoted ? Boolean(quoted.is_substitute) : false;

        // Trạng thái kho gốc
        let stockDisplay = '';
        if (hasInventory) {
            if (currentStock === 0) {
                stockDisplay = `<span class="badge badge-danger">❌ HẾT HÀNG TRONG KHO (0 ${CC.esc(item.unit || 'đơn vị')})</span>`;
            } else if (isOverPrescribed) {
                stockDisplay = `<span class="badge badge-warning">⚠️ KHO CHỈ CÒN ${currentStock} ${CC.esc(item.unit || 'đơn vị')}</span>`;
            } else {
                stockDisplay = `<span class="badge badge-success">✓ Sẵn sàng trong kho (${currentStock} ${CC.esc(item.unit || 'đơn vị')})</span>`;
            }
        } else {
            stockDisplay = `<span class="badge badge-danger">⚠️ Nhà thuốc chưa có loại thuốc này</span>`;
        }

        const suggestedSubs = item.suggested_substitutes || [];

        return `
            <div class="quote-item-card ${isSubstitute ? 'has-substitute' : ''} quote-row-item" 
                 id="quote-card-${idx}"
                 data-idx="${idx}"
                 data-rx-item-id="${item.id}"
                 data-inventory-id="${quoted ? (quoted.pharmacy_inventory_id || '') : (item.inventory_id || '')}"
                 data-max-stock="${currentStock !== null ? currentStock : ''}"
                 data-drug-name="${CC.esc(item.drug_name_raw)}"
                 data-original-drug-name="${CC.esc(item.drug_name_raw)}"
                 data-original-price="${item.pharmacy_price || item.reference_price || 0}"
                 data-original-stock="${currentStock !== null ? currentStock : ''}"
                 data-original-inv-id="${item.inventory_id || ''}"
                 data-is-substitute="${isSubstitute}">
                
                <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:8px">
                    <div>
                        <div style="font-weight:700;font-size:1.02rem;color:var(--text)" class="display-drug-name">
                            ${idx + 1}. ${CC.esc(item.drug_name_raw)}
                        </div>
                        <div class="small muted">
                            Liều dùng: <strong>${CC.esc(item.dosage || 'Theo chỉ định')}</strong> • 
                            Bác sĩ kê: <strong style="color:var(--primary)">${prescribedQty} ${CC.esc(item.unit || 'đơn vị')}</strong>
                            ${item.active_ingredient ? `• Hoạt chất: <strong>${CC.esc(item.active_ingredient)}</strong>` : ''}
                        </div>
                        ${item.usage_instructions ? `<div class="small" style="color:#0369a1;margin-top:2px">💡 Dặn dò từ đơn: ${CC.esc(item.usage_instructions)}</div>` : ''}
                    </div>
                    <div style="text-align:right">
                        <div class="display-stock-status">${stockDisplay}</div>
                        ${!isLocked ? `
                            <button type="button" class="btn btn-outline btn-sm btn-toggle-sub" data-idx="${idx}" style="font-size:0.75rem;padding:3px 10px;margin-top:6px">
                                🔄 Đổi thuốc cùng hoạt chất / hãng khác
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Banner thông báo khi đã đổi thuốc thay thế -->
                <div class="substitute-alert-box" id="sub-alert-${idx}" style="display:${isSubstitute ? 'flex' : 'none'};background:#fffbeb;border:1px solid #fef3c7;padding:8px 12px;border-radius:8px;margin-bottom:10px;align-items:center;justify-content:space-between">
                    <div style="font-size:0.85rem;color:#b45309;font-weight:700" class="sub-alert-text">
                        🔄 ĐÃ ĐỔI THUỐC THAY THẾ CÙNG HOẠT CHẤT
                    </div>
                    ${!isLocked ? `
                        <button type="button" class="btn btn-outline btn-sm btn-revert-sub" data-idx="${idx}" style="font-size:0.75rem;padding:2px 8px;background:#ffffff">
                            ↺ Khôi phục thuốc gốc
                        </button>
                    ` : ''}
                </div>

                ${isOverPrescribed ? `
                    <div class="overprescribed-alert" style="background:#fef2f2;border:1px solid #fecaca;padding:8px 12px;border-radius:8px;margin-bottom:10px;font-size:0.84rem;color:#b91c1c;font-weight:600">
                        ⚠️ Cảnh báo tồn kho: Bác sĩ kê <strong>${prescribedQty} ${CC.esc(item.unit || 'hộp')}</strong> nhưng kho hiện chỉ còn <strong>${currentStock}</strong>. Hệ thống đã tự động giới hạn tối đa ${currentStock} để tránh thiếu hàng!
                    </div>
                ` : ''}

                <!-- Drawer chọn thuốc thay thế (Mở khi bấm nút Đổi thuốc) -->
                <div class="sub-drawer" id="sub-drawer-${idx}" style="display:none;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:14px;margin-bottom:14px">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                        <strong style="color:var(--primary-dark);font-size:0.9rem">🔄 Lựa chọn thuốc thay thế từ kho nhà thuốc:</strong>
                        <button type="button" class="btn btn-outline btn-sm btn-close-sub" data-idx="${idx}" style="font-size:0.75rem;padding:2px 8px">Đóng</button>
                    </div>

                    ${suggestedSubs.length > 0 ? `
                        <div style="margin-bottom:10px">
                            <span class="small muted" style="font-weight:700;display:block;margin-bottom:6px">Gợi ý thuốc cùng hoạt chất (${CC.esc(item.active_ingredient)}):</span>
                            <div style="display:flex;flex-wrap:wrap;gap:6px">
                                ${suggestedSubs.map(s => `
                                    <button type="button" class="btn btn-outline btn-sm btn-pick-sub" 
                                            data-idx="${idx}"
                                            data-inv-id="${s.inventory_id}"
                                            data-name="${CC.esc(s.drug_name)}"
                                            data-stock="${s.stock_quantity}"
                                            data-price="${s.price}"
                                            data-unit="${CC.esc(s.unit || 'Hộp')}"
                                            data-active="${CC.esc(s.active_ingredient || '')}"
                                            style="font-size:0.82rem;background:#ffffff;border-color:#38bdf8;color:#0369a1">
                                        ✨ ${CC.esc(s.drug_name)} (Kho: ${s.stock_quantity}) — ${CC.fmt.money(s.price)}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="small muted" style="margin-bottom:8px">Không tìm thấy thuốc khác trùng hoạt chất trong kho. Bạn có thể chọn loại khác bên dưới:</div>
                    `}

                    <!-- Ô tìm kiếm thuốc nhanh trong kho (Live Search) -->
                    <div style="margin-top:10px">
                        <span class="small muted" style="font-weight:700;display:block;margin-bottom:6px">🔍 Tìm kiếm thuốc nhanh theo tên hoặc hoạt chất:</span>
                        <div style="position:relative">
                            <input type="text" class="input input-sub-search" data-idx="${idx}" 
                                   placeholder="Gõ tên thuốc (vd: Paracetamol, Hapacol, Panadol...) hoặc hoạt chất..." 
                                   style="font-size:0.88rem;background:#ffffff;padding-left:36px;border-radius:8px;border:1px solid #cbd5e1" 
                                   autocomplete="off">
                            <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:0.95rem;pointer-events:none">🔍</span>
                            <button type="button" class="btn-clear-sub-search" data-idx="${idx}" 
                                    style="display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#94a3b8;font-size:0.9rem">✕</button>
                        </div>
                        <!-- Danh sách kết quả tìm kiếm realtime -->
                        <div class="sub-search-results" id="sub-search-results-${idx}" 
                             style="display:none;margin-top:8px;max-height:220px;overflow-y:auto;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.06)">
                        </div>
                    </div>

                    <details style="margin-top:10px;font-size:0.84rem">
                        <summary style="cursor:pointer;color:var(--muted);font-weight:600">📋 Hoặc duyệt toàn bộ danh mục kho (${allInventory.length} sản phẩm)</summary>
                        <div style="margin-top:6px">
                            <select class="input select-sub-inv" data-idx="${idx}" style="font-size:0.88rem;background:#ffffff">
                                <option value="">-- Bấm để chọn thuốc thay thế từ kho nhà thuốc --</option>
                                ${allInventory.map(inv => `
                                    <option value="${inv.inventory_id}" 
                                            data-name="${CC.esc(inv.drug_name)}"
                                            data-stock="${inv.stock_quantity}"
                                            data-price="${inv.price}"
                                            data-unit="${CC.esc(inv.unit || 'Hộp')}"
                                            data-active="${CC.esc(inv.active_ingredient || '')}">
                                        💊 ${CC.esc(inv.drug_name)} — Hoạt chất: ${CC.esc(inv.active_ingredient || 'N/A')} (Kho: ${inv.stock_quantity}) — ${CC.fmt.money(inv.price)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </details>
                </div>

                <!-- Các ô nhập báo giá -->
                <div class="grid" style="display:grid;grid-template-columns:140px 160px 1fr 140px;gap:12px;align-items:end;margin-top:10px">
                    <div class="field" style="margin-bottom:0">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                            <label style="font-size:0.78rem;font-weight:700;margin:0">Số lượng bán</label>
                            <span class="display-max-stock" style="font-size:0.72rem;color:var(--muted)">${currentStock !== null ? `Tối đa: ${currentStock}` : ''}</span>
                        </div>
                        <input class="input input-quote-qty" type="number" min="1" 
                               max="${currentStock !== null ? currentStock : ''}" 
                               value="${initialQty}" 
                               ${isLocked ? 'disabled' : ''} 
                               style="font-weight:700">
                        <div class="stock-err-msg small" style="color:var(--danger);font-weight:700;font-size:0.72rem;display:none;margin-top:2px"></div>
                    </div>
                    <div class="field" style="margin-bottom:0">
                        <label style="font-size:0.78rem;font-weight:700">Đơn giá (VNĐ)</label>
                        <input class="input input-quote-price" type="number" min="0" step="500" value="${unitPrice}" ${isLocked ? 'disabled' : ''} style="font-weight:700;color:var(--primary-dark)">
                    </div>
                    <div class="field" style="margin-bottom:0">
                        <label style="font-size:0.78rem;font-weight:700">Ghi chú dòng thuốc</label>
                        <input class="input input-quote-note" type="text" placeholder="Ghi chú thêm cho khách..." value="${CC.esc(note)}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <div style="text-align:right">
                        <span style="font-size:0.78rem;color:var(--muted);display:block">Thành tiền</span>
                        <strong class="item-line-total" style="font-size:1.05rem;color:var(--text)">${CC.fmt.money(initialQty * unitPrice)}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Xử lý sự kiện Đổi thuốc cùng hoạt chất
    setupSubstituteHandlers(prescribedItems, allInventory);

    // Xử lý tính toán giá và kiểm tra tồn kho
    setupCalculationHandlers();

    calculateGrandTotal();
    checkGlobalValidity();
}

/**
 * Gắn sự kiện Đổi thuốc thay thế
 */
function setupSubstituteHandlers(prescribedItems, allInventory) {
    // 1. Mở / Đóng drawer
    document.querySelectorAll('.btn-toggle-sub').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.idx;
            const drawer = document.getElementById(`sub-drawer-${idx}`);
            drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
        });
    });

    document.querySelectorAll('.btn-close-sub').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.idx;
            document.getElementById(`sub-drawer-${idx}`).style.display = 'none';
        });
    });

    // 2. Chọn thuốc từ gợi ý cùng hoạt chất
    document.querySelectorAll('.btn-pick-sub').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.idx;
            const subData = {
                inventory_id: btn.dataset.invId,
                name: btn.dataset.name,
                stock: Number(btn.dataset.stock),
                price: Number(btn.dataset.price),
                unit: btn.dataset.unit,
                active: btn.dataset.active
            };
            applySubstitute(idx, subData, prescribedItems[idx]);
        });
    });

    // 3.1. Tìm kiếm nhanh thuốc thay thế trong kho (Live Search)
    const normalizeStr = (str) => {
        if (!str) return '';
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    };

    document.querySelectorAll('.input-sub-search').forEach(input => {
        const idx = input.dataset.idx;
        const resultsBox = document.getElementById(`sub-search-results-${idx}`);
        const clearBtn = input.parentElement.querySelector('.btn-clear-sub-search');

        const doSearch = () => {
            const rawQuery = input.value.trim();
            const q = normalizeStr(rawQuery);

            if (clearBtn) clearBtn.style.display = rawQuery ? 'block' : 'none';

            if (!q) {
                resultsBox.style.display = 'none';
                resultsBox.innerHTML = '';
                return;
            }

            const matched = allInventory.filter(inv => {
                const nameMatch = normalizeStr(inv.drug_name).includes(q);
                const activeMatch = normalizeStr(inv.active_ingredient).includes(q);
                return nameMatch || activeMatch;
            }).slice(0, 15);

            if (matched.length === 0) {
                resultsBox.innerHTML = `
                    <div style="padding:12px;text-align:center;color:#64748b;font-size:0.85rem">
                        Không tìm thấy thuốc nào khớp với từ khóa "<strong>${CC.esc(rawQuery)}</strong>".
                    </div>
                `;
            } else {
                resultsBox.innerHTML = matched.map(inv => {
                    const isOutOfStock = Number(inv.stock_quantity) <= 0;
                    return `
                        <div class="sub-search-row" 
                             style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:${isOutOfStock ? 'not-allowed' : 'pointer'};background:#fff;transition:background 0.15s"
                             data-inv-id="${inv.inventory_id}"
                             data-name="${CC.esc(inv.drug_name)}"
                             data-stock="${inv.stock_quantity}"
                             data-price="${inv.price}"
                             data-unit="${CC.esc(inv.unit || 'Hộp')}"
                             data-active="${CC.esc(inv.active_ingredient || '')}">
                            <div>
                                <div style="font-weight:700;font-size:0.88rem;color:#0f172a">
                                    💊 ${CC.esc(inv.drug_name)}
                                </div>
                                <div style="font-size:0.75rem;color:#64748b;margin-top:2px">
                                    Hoạt chất: <span style="color:#0284c7;font-weight:600">${CC.esc(inv.active_ingredient || 'N/A')}</span> | ĐVT: ${CC.esc(inv.unit || 'Hộp')}
                                </div>
                            </div>
                            <div style="text-align:right;flex-shrink:0;margin-left:12px">
                                <span class="badge ${isOutOfStock ? 'badge-danger' : 'badge-success'}" style="font-size:0.75rem;margin-bottom:3px;display:inline-block">
                                    ${isOutOfStock ? 'Hết hàng' : `Kho: ${inv.stock_quantity}`}
                                </span>
                                <div style="font-weight:700;color:var(--primary-dark);font-size:0.85rem">
                                    ${CC.fmt.money(inv.price)}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                resultsBox.querySelectorAll('.sub-search-row').forEach(row => {
                    const stock = Number(row.dataset.stock);
                    if (stock <= 0) return;

                    row.addEventListener('mouseenter', () => row.style.background = '#f0f9ff');
                    row.addEventListener('mouseleave', () => row.style.background = '#fff');

                    row.addEventListener('click', () => {
                        const subData = {
                            inventory_id: row.dataset.invId,
                            name: row.dataset.name,
                            stock: stock,
                            price: Number(row.dataset.price),
                            unit: row.dataset.unit,
                            active: row.dataset.active
                        };
                        applySubstitute(idx, subData, prescribedItems[idx]);
                    });
                });
            }

            resultsBox.style.display = 'block';
        };

        input.addEventListener('input', doSearch);
        input.addEventListener('focus', () => {
            if (input.value.trim()) doSearch();
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                resultsBox.style.display = 'none';
                clearBtn.style.display = 'none';
                input.focus();
            });
        }
    });

    // 3.2. Chọn thuốc từ dropdown kho tự do
    document.querySelectorAll('.select-sub-inv').forEach(sel => {
        sel.addEventListener('change', () => {
            const idx = sel.dataset.idx;
            const selectedOpt = sel.options[sel.selectedIndex];
            if (!selectedOpt.value) return;

            const subData = {
                inventory_id: selectedOpt.value,
                name: selectedOpt.dataset.name,
                stock: Number(selectedOpt.dataset.stock),
                price: Number(selectedOpt.dataset.price),
                unit: selectedOpt.dataset.unit,
                active: selectedOpt.dataset.active
            };
            applySubstitute(idx, subData, prescribedItems[idx]);
        });
    });

    // 4. Khôi phục về thuốc gốc
    document.querySelectorAll('.btn-revert-sub').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.idx;
            revertSubstitute(idx, prescribedItems[idx]);
        });
    });
}

function applySubstitute(idx, sub, originalItem) {
    const card = document.getElementById(`quote-card-${idx}`);
    card.classList.add('has-substitute');

    // Cập nhật dataset
    card.dataset.inventoryId = sub.inventory_id;
    card.dataset.isSubstitute = 'true';
    card.dataset.maxStock = sub.stock;
    card.dataset.drugName = sub.name;

    // Cập nhật thông tin giao diện
    card.querySelector('.display-drug-name').innerHTML = `${Number(idx) + 1}. ${CC.esc(sub.name)} <span class="badge badge-warning" style="font-size:0.75rem">Thuốc thay thế</span>`;
    card.querySelector('.display-stock-status').innerHTML = `<span class="badge badge-success">✓ Kho còn ${sub.stock} ${CC.esc(sub.unit || 'đơn vị')}</span>`;

    // Hiển thị banner thay thế
    const alertBox = document.getElementById(`sub-alert-${idx}`);
    alertBox.style.display = 'flex';
    alertBox.querySelector('.sub-alert-text').innerHTML = `🔄 ĐÃ ĐỔI: <strong>${CC.esc(sub.name)}</strong> (cùng hoạt chất: <em>${CC.esc(sub.active || originalItem.active_ingredient || '')}</em>)`;

    // Đóng drawer
    document.getElementById(`sub-drawer-${idx}`).style.display = 'none';

    // Cập nhật ô nhập
    const qtyInput = card.querySelector('.input-quote-qty');
    const priceInput = card.querySelector('.input-quote-price');
    const noteInput = card.querySelector('.input-quote-note');
    const maxStockSpan = card.querySelector('.display-max-stock');

    priceInput.value = sub.price;
    qtyInput.max = sub.stock;
    qtyInput.value = Math.min(Number(originalItem.prescribed_quantity) || 1, sub.stock);
    maxStockSpan.textContent = `Tối đa: ${sub.stock}`;
    noteInput.value = `Đổi sang ${sub.name} do cùng hoạt chất ${originalItem.active_ingredient || ''}`;

    // Cập nhật thành tiền
    card.querySelector('.item-line-total').textContent = CC.fmt.money(Number(qtyInput.value) * sub.price);

    // Ẩn cảnh báo cũ nếu có
    const overAlert = card.querySelector('.overprescribed-alert');
    if (overAlert) overAlert.style.display = 'none';

    CC.toast(`Đã chọn thuốc thay thế: ${sub.name}`, 'info');
    calculateGrandTotal();
    checkGlobalValidity();
}

function revertSubstitute(idx, originalItem) {
    const card = document.getElementById(`quote-card-${idx}`);
    card.classList.remove('has-substitute');

    const origInvId = card.dataset.originalInvId;
    const origStock = card.dataset.originalStock !== '' ? Number(card.dataset.originalStock) : null;
    const origPrice = Number(card.dataset.originalPrice) || 0;
    const prescribedQty = Number(originalItem.prescribed_quantity) || 1;

    // Reset dataset
    card.dataset.inventoryId = origInvId;
    card.dataset.isSubstitute = 'false';
    card.dataset.maxStock = origStock !== null ? origStock : '';
    card.dataset.drugName = originalItem.drug_name_raw;

    // Reset giao diện
    card.querySelector('.display-drug-name').textContent = `${Number(idx) + 1}. ${originalItem.drug_name_raw}`;
    
    let stockDisplay = '';
    if (origInvId) {
        if (origStock === 0) stockDisplay = `<span class="badge badge-danger">❌ HẾT HÀNG TRONG KHO (0 ${CC.esc(originalItem.unit || 'đơn vị')})</span>`;
        else if (prescribedQty > origStock) stockDisplay = `<span class="badge badge-warning">⚠️ KHO CHỈ CÒN ${origStock} ${CC.esc(originalItem.unit || 'đơn vị')}</span>`;
        else stockDisplay = `<span class="badge badge-success">✓ Sẵn sàng trong kho (${origStock} ${CC.esc(originalItem.unit || 'đơn vị')})</span>`;
    } else {
        stockDisplay = `<span class="badge badge-danger">⚠️ Nhà thuốc chưa có loại thuốc này</span>`;
    }
    card.querySelector('.display-stock-status').innerHTML = stockDisplay;

    // Ẩn banner thay thế
    document.getElementById(`sub-alert-${idx}`).style.display = 'none';

    // Reset ô nhập
    const qtyInput = card.querySelector('.input-quote-qty');
    const priceInput = card.querySelector('.input-quote-price');
    const noteInput = card.querySelector('.input-quote-note');
    const maxStockSpan = card.querySelector('.display-max-stock');

    priceInput.value = origPrice;
    qtyInput.max = origStock !== null ? origStock : '';
    qtyInput.value = origStock !== null ? Math.min(prescribedQty, origStock) : prescribedQty;
    maxStockSpan.textContent = origStock !== null ? `Tối đa: ${origStock}` : '';
    noteInput.value = '';

    card.querySelector('.item-line-total').textContent = CC.fmt.money(Number(qtyInput.value) * origPrice);

    CC.toast(`Đã khôi phục về thuốc gốc: ${originalItem.drug_name_raw}`, 'info');
    calculateGrandTotal();
    checkGlobalValidity();
}

function setupCalculationHandlers() {
    document.querySelectorAll('.quote-row-item').forEach(row => {
        const qtyInput = row.querySelector('.input-quote-qty');
        const priceInput = row.querySelector('.input-quote-price');
        const errMsg = row.querySelector('.stock-err-msg');

        function validateRow() {
            const qty = Number(qtyInput.value) || 0;
            const price = Number(priceInput.value) || 0;
            const maxStock = row.dataset.maxStock !== '' ? Number(row.dataset.maxStock) : null;

            if (maxStock !== null && qty > maxStock) {
                qtyInput.style.borderColor = 'var(--danger)';
                qtyInput.style.backgroundColor = '#fef2f2';
                errMsg.textContent = `❌ Kho chỉ còn ${maxStock}!`;
                errMsg.style.display = 'block';
            } else {
                qtyInput.style.borderColor = '';
                qtyInput.style.backgroundColor = '';
                errMsg.style.display = 'none';
            }

            row.querySelector('.item-line-total').textContent = CC.fmt.money(qty * price);
            calculateGrandTotal();
            checkGlobalValidity();
        }

        qtyInput.addEventListener('input', validateRow);
        priceInput.addEventListener('input', validateRow);
    });
}

function checkGlobalValidity() {
    let hasError = false;
    document.querySelectorAll('.quote-row-item').forEach(row => {
        const qty = Number(row.querySelector('.input-quote-qty').value) || 0;
        const maxStock = row.dataset.maxStock !== '' ? Number(row.dataset.maxStock) : null;
        if (maxStock !== null && qty > maxStock) {
            hasError = true;
        }
    });

    const submitBtn = document.getElementById('btn-submit-quote');
    if (submitBtn) {
        if (hasError) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⚠️ Số lượng thuốc vượt quá tồn kho!';
            submitBtn.style.opacity = '0.6';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🚀 Gửi báo giá cho khách hàng';
            submitBtn.style.opacity = '1';
        }
    }
}

function calculateGrandTotal() {
    let grandTotal = 0;
    document.querySelectorAll('.quote-row-item').forEach(row => {
        const qty = Number(row.querySelector('.input-quote-qty').value) || 0;
        const price = Number(row.querySelector('.input-quote-price').value) || 0;
        grandTotal += (qty * price);
    });
    document.getElementById('dt-total-quoted-amount').textContent = CC.fmt.money(grandTotal);
}
