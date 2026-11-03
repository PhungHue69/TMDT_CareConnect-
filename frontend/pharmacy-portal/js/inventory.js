/* =============================================================================
   CareConnect Pharmacy Portal - Inventory Management Logic
   ============================================================================= */

let currentFilters = {
    q: '',
    category_id: '',
    product_type: '',
    status: '',
    alert: '',
    page: 1,
    limit: 50
};

let inventoryData = [];

document.addEventListener('DOMContentLoaded', async () => {
    const pharmacyData = await initPortalLayout('inventory', 'Quản lý kho thuốc');
    if (!pharmacyData) return;

    setupEvents();
    loadInventory();
});

function setupEvents() {
    // Tìm kiếm với debounce
    let searchTimer;
    const searchInput = document.getElementById('filter-search');
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentFilters.q = searchInput.value.trim();
            currentFilters.page = 1;
            loadInventory();
        }, 300);
    });

    // Lọc loại sản phẩm
    document.getElementById('filter-type').addEventListener('change', (e) => {
        currentFilters.product_type = e.target.value;
        currentFilters.page = 1;
        loadInventory();
    });

    // Lọc trạng thái
    document.getElementById('filter-status').addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        currentFilters.page = 1;
        loadInventory();
    });

    // Lọc danh mục
    document.getElementById('filter-category').addEventListener('change', (e) => {
        currentFilters.category_id = e.target.value;
        currentFilters.page = 1;
        loadInventory();
    });

    // Nút đặt lại bộ lọc
    document.getElementById('btn-reset-filters').addEventListener('click', () => {
        searchInput.value = '';
        document.getElementById('filter-type').value = '';
        document.getElementById('filter-status').value = '';
        document.getElementById('filter-category').value = '';
        currentFilters = { q: '', category_id: '', product_type: '', status: '', alert: '', page: 1, limit: 50 };
        document.querySelectorAll('.clickable-card').forEach(c => c.classList.remove('active-filter'));
        loadInventory();
    });

    // Nút lọc nhanh theo thẻ KPI
    document.getElementById('card-filter-all').addEventListener('click', () => {
        currentFilters.alert = '';
        setActiveCard('card-filter-all');
        loadInventory();
    });
    document.getElementById('card-filter-instock').addEventListener('click', () => {
        currentFilters.alert = '';
        currentFilters.status = 'IN_STOCK';
        document.getElementById('filter-status').value = 'IN_STOCK';
        setActiveCard('card-filter-instock');
        loadInventory();
    });
    document.getElementById('card-filter-low').addEventListener('click', () => {
        currentFilters.alert = 'low_stock';
        setActiveCard('card-filter-low');
        loadInventory();
    });
    document.getElementById('card-filter-expiring').addEventListener('click', () => {
        currentFilters.alert = 'expiring';
        setActiveCard('card-filter-expiring');
        loadInventory();
    });

    // Nút mở modal thêm thuốc mới
    document.getElementById('btn-add-drug').addEventListener('click', openAddDrugModal);
}

function setActiveCard(cardId) {
    document.querySelectorAll('.clickable-card').forEach(c => c.classList.remove('active-filter'));
    const el = document.getElementById(cardId);
    if (el) el.classList.add('active-filter');
}

async function loadInventory() {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = `<tr><td colspan="8" class="center muted" style="padding:40px"><span class="spinner"></span> Đang tải dữ liệu...</td></tr>`;

    try {
        const queryParams = new URLSearchParams();
        Object.entries(currentFilters).forEach(([k, v]) => {
            if (v !== '' && v !== null && v !== undefined) queryParams.set(k, v);
        });

        const data = await CC.api('/pharmacy/inventory?' + queryParams.toString());
        inventoryData = data.items;

        // Cập nhật thống kê
        const s = data.stats;
        document.getElementById('stat-total').textContent = s.total_items;
        document.getElementById('stat-instock').textContent = s.in_stock;
        document.getElementById('stat-low').textContent = s.low_stock;
        document.getElementById('stat-expiring').textContent = s.expiring_soon;

        // Đổ danh mục vào select nếu chưa có
        const catSelect = document.getElementById('filter-category');
        if (catSelect.options.length <= 1 && data.categories) {
            data.categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.category_name;
                catSelect.appendChild(opt);
            });
        }

        renderInventoryTable(data.items, data.total);
    } catch (err) {
        console.error('Lỗi tải danh sách tồn kho:', err);
        tbody.innerHTML = `<tr><td colspan="8" class="center" style="color:var(--danger);padding:40px">Có lỗi: ${CC.esc(err.message)}</td></tr>`;
    }
}

function renderInventoryTable(items, total) {
    const tbody = document.getElementById('inventory-table-body');
    const paginationInfo = document.getElementById('pagination-info');

    paginationInfo.textContent = `Hiển thị ${items.length} trên tổng số ${total} sản phẩm`;

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="center muted" style="padding:40px">Không tìm thấy sản phẩm nào phù hợp với bộ lọc.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map((item) => {
        // Phân loại badge
        let typeBadge = '<span class="badge badge-gray">Sản phẩm</span>';
        if (item.product_type === 'RX') typeBadge = '<span class="badge badge-danger">Kê đơn (RX)</span>';
        else if (item.product_type === 'OTC') typeBadge = '<span class="badge badge-success">Không kê đơn (OTC)</span>';
        else if (item.product_type === 'SUPPLEMENT') typeBadge = '<span class="badge badge-info">TPCN</span>';
        else if (item.product_type === 'DEVICE') typeBadge = '<span class="badge badge-gray">Thiết bị y tế</span>';

        // Tồn kho pill
        let stockCls = 'ok';
        if (item.stock_quantity === 0) stockCls = 'zero';
        else if (item.stock_quantity <= 10) stockCls = 'low';

        // Trạng thái badge
        let statusBadge = '<span class="badge badge-success">Còn hàng</span>';
        if (item.status === 'OUT_OF_STOCK' || item.stock_quantity === 0) {
            statusBadge = '<span class="badge badge-danger">Hết hàng</span>';
        } else if (item.status === 'DISCONTINUED') {
            statusBadge = '<span class="badge badge-gray">Ngừng bán</span>';
        }

        // Hạn sử dụng & Cảnh báo cận date
        let expiryDisplay = item.nearest_expiry_date ? CC.fmt.date(item.nearest_expiry_date) : '<span class="muted">Chưa nhập</span>';
        let isExpiring = false;
        if (item.nearest_expiry_date) {
            const expDate = new Date(item.nearest_expiry_date);
            const now = new Date();
            const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 0) {
                expiryDisplay = `<span style="color:var(--danger);font-weight:700">Đã hết hạn (${CC.fmt.date(item.nearest_expiry_date)})</span>`;
            } else if (daysLeft <= 90) {
                expiryDisplay = `<span style="color:var(--warning);font-weight:700">⚠️ ${CC.fmt.date(item.nearest_expiry_date)} (còn ${daysLeft} ngày)</span>`;
            }
        }

        return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:12px">
                        <div class="drug-thumbnail">💊</div>
                        <div>
                            <div style="font-weight:700;color:var(--text);font-size:0.95rem">${CC.esc(item.drug_name)}</div>
                            <div class="small muted">
                                ${item.active_ingredient ? `Hoạt chất: ${CC.esc(item.active_ingredient)}` : ''} 
                                ${item.strength ? `• ${CC.esc(item.strength)}` : ''}
                            </div>
                            ${item.registration_number ? `<div class="small muted" style="font-size:0.75rem">SĐK: ${CC.esc(item.registration_number)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${typeBadge}</td>
                <td><span style="font-weight:600">${CC.esc(item.unit || 'Hộp')}</span></td>
                <td>
                    <div style="font-weight:700;color:var(--primary-dark);font-size:1rem">${CC.fmt.money(item.price)}</div>
                    ${item.reference_price ? `<div class="small muted" style="text-decoration:line-through;font-size:0.75rem">Gốc: ${CC.fmt.money(item.reference_price)}</div>` : ''}
                </td>
                <td>
                    <span class="stock-pill ${stockCls}">${item.stock_quantity}</span>
                </td>
                <td>${expiryDisplay}</td>
                <td>${statusBadge}</td>
                <td style="text-align:right">
                    <button class="btn btn-outline btn-sm btn-edit" data-id="${item.id}" title="Chỉnh sửa giá và số lượng">
                        ✏️ Sửa
                    </button>
                    <button class="btn btn-outline btn-sm btn-delete" data-id="${item.id}" style="color:var(--danger);margin-left:4px" title="Xóa khỏi kho">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Gắn sự kiện sửa
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = Number(btn.dataset.id);
            const item = inventoryData.find(x => x.id === id);
            if (item) openEditDrugModal(item);
        });
    });

    // Gắn sự kiện xóa
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            const item = inventoryData.find(x => x.id === id);
            if (!item) return;

            const ok = await CC.confirm(`Bạn có chắc chắn muốn xóa thuốc "${item.drug_name}" khỏi kho nhà thuốc?`, { danger: true });
            if (ok) {
                try {
                    await CC.api(`/pharmacy/inventory/${id}`, { method: 'DELETE' });
                    CC.toast('Đã xóa thuốc khỏi kho thành công', 'success');
                    loadInventory();
                } catch (err) {
                    CC.toast(err.message || 'Không thể xóa thuốc', 'danger');
                }
            }
        });
    });
}

/**
 * Modal Chỉnh sửa Thuốc trong kho
 */
function openEditDrugModal(item) {
    const modalHtml = `
        <div class="modal-header">
            <h3 style="font-size:1.15rem;font-weight:700">Chỉnh sửa thông tin kho & Giá bán</h3>
        </div>
        <form id="form-edit-drug" class="stack" style="margin-top:16px">
            <div style="background:#f8fafc;padding:12px;border-radius:10px;border:1px solid var(--border);margin-bottom:8px">
                <div style="font-weight:700;font-size:1.02rem;color:var(--text)">${CC.esc(item.drug_name)}</div>
                <div class="small muted">${CC.esc(item.active_ingredient || '')} • ${CC.esc(item.unit || '')}</div>
            </div>

            <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field">
                    <label for="edit-price">Giá bán niêm yết (VNĐ) *</label>
                    <input class="input" id="edit-price" name="price" type="number" min="0" step="500" value="${item.price}" required>
                </div>
                <div class="field">
                    <label for="edit-stock">Số lượng tồn kho *</label>
                    <input class="input" id="edit-stock" name="stock_quantity" type="number" min="0" value="${item.stock_quantity}" required>
                </div>
            </div>

            <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field">
                    <label for="edit-expiry">Hạn dùng lô gần nhất</label>
                    <input class="input" id="edit-expiry" name="nearest_expiry_date" type="date" value="${item.nearest_expiry_date ? String(item.nearest_expiry_date).slice(0, 10) : ''}">
                </div>
                <div class="field">
                    <label for="edit-status">Trạng thái bán</label>
                    <select class="input" id="edit-status" name="status">
                        <option value="IN_STOCK" ${item.status === 'IN_STOCK' ? 'selected' : ''}>Còn hàng</option>
                        <option value="OUT_OF_STOCK" ${item.status === 'OUT_OF_STOCK' ? 'selected' : ''}>Hết hàng</option>
                        <option value="DISCONTINUED" ${item.status === 'DISCONTINUED' ? 'selected' : ''}>Ngừng kinh doanh</option>
                    </select>
                </div>
            </div>

            <div class="modal-actions" style="margin-top:20px">
                <button type="button" class="btn btn-outline" data-close>Hủy</button>
                <button type="submit" class="btn btn-primary" id="btn-save-edit">Lưu cập nhật</button>
            </div>
        </form>
    `;

    const { el, close } = CC.modal(modalHtml, { className: 'modal-md' });

    el.querySelector('#form-edit-drug').addEventListener('submit', async (e) => {
        e.preventDefault();
        const price = Number(el.querySelector('#edit-price').value);
        const stock_quantity = Number(el.querySelector('#edit-stock').value);
        const nearest_expiry_date = el.querySelector('#edit-expiry').value || null;
        const status = el.querySelector('#edit-status').value;

        const saveBtn = el.querySelector('#btn-save-edit');
        await CC.busy(saveBtn, async () => {
            try {
                await CC.api(`/pharmacy/inventory/${item.id}`, {
                    method: 'PUT',
                    body: { price, stock_quantity, nearest_expiry_date, status }
                });
                CC.toast('Cập nhật thông tin kho thành công!', 'success');
                close();
                loadInventory();
            } catch (err) {
                CC.toast(err.message || 'Lỗi khi cập nhật kho', 'danger');
            }
        });
    });
}

/**
 * Modal Thêm thuốc mới từ Dược điển quốc gia (master_drugs)
 */
function openAddDrugModal() {
    const modalHtml = `
        <div class="modal-header">
            <h3 style="font-size:1.2rem;font-weight:700">+ Nhập thuốc mới từ Dược điển vào kho</h3>
            <p class="muted small" style="margin-top:4px">Tìm kiếm danh mục thuốc chuẩn và thiết lập số lượng tồn, giá bán cho nhà thuốc của bạn.</p>
        </div>

        <div class="stack" style="margin-top:16px">
            <div class="field">
                <label for="search-master">Tìm kiếm trong Dược điển</label>
                <input class="input" id="search-master" type="search" placeholder="Gõ tên thuốc hoặc hoạt chất (ví dụ: Paracetamol, Amoxicillin...)" autocomplete="off">
            </div>

            <!-- Danh sách gợi ý -->
            <div id="master-drugs-results" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;background:#fafbfc;padding:6px;display:none">
            </div>

            <!-- Form điền thông tin sau khi chọn thuốc -->
            <form id="form-confirm-add" style="display:none;margin-top:14px;border-top:1px dashed var(--border);padding-top:14px">
                <input type="hidden" id="selected-master-id">
                
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px;border-radius:10px;margin-bottom:12px">
                    <div style="font-weight:700;color:#166534" id="selected-drug-name">Tên thuốc</div>
                    <div class="small muted" id="selected-drug-sub">Hoạt chất • Đơn vị</div>
                </div>

                <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="field">
                        <label for="add-price">Giá bán niêm yết (VNĐ) *</label>
                        <input class="input" id="add-price" type="number" min="0" step="500" required placeholder="50000">
                    </div>
                    <div class="field">
                        <label for="add-stock">Số lượng nhập ban đầu *</label>
                        <input class="input" id="add-stock" type="number" min="1" value="50" required>
                    </div>
                </div>

                <div class="field" style="margin-top:10px">
                    <label for="add-expiry">Hạn sử dụng của lô</label>
                    <input class="input" id="add-expiry" type="date">
                </div>

                <div class="modal-actions" style="margin-top:20px">
                    <button type="button" class="btn btn-outline" data-close>Hủy</button>
                    <button type="submit" class="btn btn-primary" id="btn-submit-add">Nhập vào kho</button>
                </div>
            </form>
        </div>
    `;

    const { el, close } = CC.modal(modalHtml, { className: 'modal-lg' });

    const searchInput = el.querySelector('#search-master');
    const resultsBox = el.querySelector('#master-drugs-results');
    const addForm = el.querySelector('#form-confirm-add');
    const selectedIdInput = el.querySelector('#selected-master-id');
    const selectedNameEl = el.querySelector('#selected-drug-name');
    const selectedSubEl = el.querySelector('#selected-drug-sub');
    const priceInput = el.querySelector('#add-price');

    let searchTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const query = searchInput.value.trim();
        if (query.length < 1) {
            resultsBox.style.display = 'none';
            return;
        }

        searchTimer = setTimeout(async () => {
            try {
                resultsBox.style.display = 'block';
                resultsBox.innerHTML = '<div class="center muted small" style="padding:10px"><span class="spinner"></span> Đang tra cứu...</div>';

                const res = await CC.api(`/pharmacy/inventory/master-drugs?q=${encodeURIComponent(query)}`);
                if (!res.items || res.items.length === 0) {
                    resultsBox.innerHTML = '<div class="center muted small" style="padding:12px">Không tìm thấy thuốc nào khớp trong dược điển.</div>';
                    return;
                }

                resultsBox.innerHTML = res.items.map(drug => `
                    <div class="master-drug-item" data-id="${drug.id}" data-name="${CC.esc(drug.name)}" data-unit="${CC.esc(drug.unit || 'Hộp')}" data-price="${drug.reference_price || 0}" data-ing="${CC.esc(drug.active_ingredient || '')}" data-strength="${CC.esc(drug.strength || '')}"
                         style="padding:10px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;transition:background 0.15s ease">
                        <div>
                            <div style="font-weight:700;color:var(--text);font-size:0.92rem">${CC.esc(drug.name)}</div>
                            <div class="small muted">${CC.esc(drug.active_ingredient || '')} ${drug.strength ? `• ${CC.esc(drug.strength)}` : ''} • Đơn vị: ${CC.esc(drug.unit || 'Hộp')}</div>
                        </div>
                        <div style="text-align:right">
                            <span class="badge ${drug.product_type === 'RX' ? 'badge-danger' : 'badge-success'}">${drug.product_type}</span>
                            ${drug.existing_stock !== null ? `<div class="small muted" style="color:var(--primary);font-size:0.75rem">Đã có trong kho (${drug.existing_stock})</div>` : ''}
                        </div>
                    </div>
                `).join('');

                // Gắn sự kiện chọn thuốc
                resultsBox.querySelectorAll('.master-drug-item').forEach(item => {
                    item.addEventListener('mouseenter', () => item.style.background = '#e8f1fd');
                    item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                    item.addEventListener('click', () => {
                        selectedIdInput.value = item.dataset.id;
                        selectedNameEl.textContent = item.dataset.name;
                        selectedSubEl.textContent = `${item.dataset.ing} • Đơn vị tính: ${item.dataset.unit}`;
                        priceInput.value = item.dataset.price || 50000;

                        resultsBox.style.display = 'none';
                        addForm.style.display = 'block';
                        priceInput.focus();
                    });
                });
            } catch (err) {
                resultsBox.innerHTML = `<div class="center small" style="color:var(--danger);padding:10px">Lỗi tìm kiếm: ${CC.esc(err.message)}</div>`;
            }
        }, 250);
    });

    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const master_drug_id = Number(selectedIdInput.value);
        const price = Number(priceInput.value);
        const stock_quantity = Number(el.querySelector('#add-stock').value);
        const nearest_expiry_date = el.querySelector('#add-expiry').value || null;

        const submitBtn = el.querySelector('#btn-submit-add');
        await CC.busy(submitBtn, async () => {
            try {
                await CC.api('/pharmacy/inventory', {
                    method: 'POST',
                    body: { master_drug_id, price, stock_quantity, nearest_expiry_date }
                });
                CC.toast('Đã nhập thuốc vào kho thành công!', 'success');
                close();
                loadInventory();
            } catch (err) {
                CC.toast(err.message || 'Lỗi khi nhập thuốc vào kho', 'danger');
            }
        });
    });
}
