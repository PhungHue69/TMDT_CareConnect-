/* =============================================================================
   CareConnect Pharmacy Portal - Wallet & Revenue Management Logic
   ============================================================================= */

(function () {
    'use strict';

    let currentWallet = { balance: 0, pending_escrow_balance: 0 };
    let currentTxPage = 1;
    const txLimit = 15;
    let currentTxType = 'ALL';

    // Formatters an toàn
    const fmtMoney = (v) => {
        const n = Number(v) || 0;
        return n.toLocaleString('vi-VN') + ' đ';
    };

    const fmtDate = (d) => {
        if (!d) return '---';
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return String(d);
        return dt.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    document.addEventListener('DOMContentLoaded', async () => {
        // Khởi tạo layout chung (activeNav = 'wallet')
        const pharmacyData = await initPortalLayout('wallet', 'Ví & Quản lý Doanh thu');
        if (!pharmacyData) return;

        setupEventListeners();
        await loadWalletOverview();
        await loadTransactions();
        await loadPayouts();
    });

    /**
     * Gắn các sự kiện tương tác
     */
    function setupEventListeners() {
        // Tab switching
        const tabBtnTx = CC.$('#tab-btn-tx');
        const tabBtnPayouts = CC.$('#tab-btn-payouts');
        const panelTx = CC.$('#panel-tab-tx');
        const panelPayouts = CC.$('#panel-tab-payouts');
        const txFilterWrapper = CC.$('#tx-filter-wrapper');

        tabBtnTx.addEventListener('click', () => {
            tabBtnTx.classList.add('active');
            tabBtnPayouts.classList.remove('active');
            panelTx.style.display = 'block';
            panelPayouts.style.display = 'none';
            txFilterWrapper.style.display = 'block';
        });

        tabBtnPayouts.addEventListener('click', () => {
            tabBtnPayouts.classList.add('active');
            tabBtnTx.classList.remove('active');
            panelPayouts.style.display = 'block';
            panelTx.style.display = 'none';
            txFilterWrapper.style.display = 'none';
        });

        // Lọc loại giao dịch
        CC.$('#select-tx-type').addEventListener('change', (e) => {
            currentTxType = e.target.value;
            currentTxPage = 1;
            loadTransactions();
        });

        // Phân trang giao dịch
        CC.$('#btn-tx-prev').addEventListener('click', () => {
            if (currentTxPage > 1) {
                currentTxPage--;
                loadTransactions();
            }
        });

        CC.$('#btn-tx-next').addEventListener('click', () => {
            currentTxPage++;
            loadTransactions();
        });

        // Modal rút tiền
        const modalPayout = CC.$('#modal-payout');
        CC.$('#btn-open-payout-modal').addEventListener('click', () => {
            CC.$('#modal-avail-balance').textContent = fmtMoney(currentWallet.balance);
            CC.$('#payout-amount').value = '';
            CC.$('#payout-amount').max = currentWallet.balance;
            modalPayout.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });

        document.querySelectorAll('.btn-close-payout').forEach((btn) => {
            btn.addEventListener('click', () => {
                modalPayout.style.display = 'none';
                document.body.style.overflow = '';
            });
        });

        modalPayout.addEventListener('click', (e) => {
            if (e.target === modalPayout) {
                modalPayout.style.display = 'none';
                document.body.style.overflow = '';
            }
        });

        // Nút "Rút tối đa"
        CC.$('#btn-withdraw-all').addEventListener('click', () => {
            const maxVal = Math.floor(currentWallet.balance);
            if (maxVal < 50000) {
                CC.toast('Số dư khả dụng cần tối thiểu 50.000 đ để rút', 'warning');
                return;
            }
            CC.$('#payout-amount').value = maxVal;
        });

        // Submit form rút tiền
        CC.$('#form-payout').addEventListener('submit', handlePayoutSubmit);

        // Nút tạo dữ liệu mẫu demo
        CC.$('#btn-seed-wallet').addEventListener('click', async () => {
            try {
                CC.toast('Đang tạo số dư ví và dữ liệu đối soát demo...', 'info');
                await CC.api('/pharmacy/wallet/mock-seed', { method: 'POST' });
                CC.toast('Đã nạp số dư và tạo giao dịch mẫu thành công!', 'success');
                await loadWalletOverview();
                await loadTransactions();
                await loadPayouts();
            } catch (err) {
                console.error('Lỗi nạp số dư demo:', err);
                CC.toast(err.message || 'Không thể tạo dữ liệu mẫu', 'danger');
            }
        });
    }

    /**
     * Tải tổng quan ví và chỉ số tài chính
     */
    async function loadWalletOverview() {
        try {
            const data = await CC.api('/pharmacy/wallet');
            currentWallet = data.wallet;
            const stats = data.stats;

            // Cập nhật thẻ KPI
            CC.$('#stat-wallet-balance').textContent = fmtMoney(currentWallet.balance);
            CC.$('#stat-escrow-balance').textContent = fmtMoney(currentWallet.pending_escrow_balance);
            CC.$('#stat-escrow-desc').textContent = `${stats.pending_orders_count || 0} đơn đang giao, giải phóng khi khách nhận`;

            CC.$('#stat-total-earned').textContent = fmtMoney(stats.total_earned);
            CC.$('#stat-completed-desc').textContent = `Từ ${stats.completed_orders_count || 0} đơn hàng hoàn tất`;

            CC.$('#stat-total-commission').textContent = fmtMoney(stats.total_commission);
        } catch (err) {
            console.error('Lỗi tải tổng quan ví:', err);
            CC.toast('Không thể tải thông tin ví nhà thuốc', 'danger');
        }
    }

    /**
     * Tải lịch sử biến động số dư (Đối soát đơn hàng)
     */
    async function loadTransactions() {
        const tbody = CC.$('#tbody-transactions');
        tbody.innerHTML = `<tr><td colspan="6" class="center muted" style="padding:24px">Đang tải lịch sử giao dịch...</td></tr>`;

        try {
            const res = await CC.api(`/pharmacy/wallet/transactions?page=${currentTxPage}&limit=${txLimit}&type=${currentTxType}`);
            const list = res.transactions;
            const total = res.total;

            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="center muted" style="padding:24px">Chưa có giao dịch biến động số dư nào.</td></tr>`;
                CC.$('#tx-pagination-info').textContent = 'Hiển thị 0 giao dịch';
                CC.$('#btn-tx-prev').disabled = true;
                CC.$('#btn-tx-next').disabled = true;
                return;
            }

            tbody.innerHTML = list.map((tx) => {
                const amount = Number(tx.amount) || 0;
                const isPositive = amount > 0;
                const amountFormatted = (isPositive ? '+' : '') + fmtMoney(amount);
                const amountClass = isPositive ? 'amount-pos' : 'amount-neg';

                // Badge loại giao dịch
                let typeBadge = '<span class="badge badge-neutral">Biến động khác</span>';
                if (tx.transaction_type === 'ESCROW_RELEASE') {
                    typeBadge = '<span class="badge badge-success">✓ Tiền vào từ đơn</span>';
                } else if (tx.transaction_type === 'PAYOUT_RELEASE') {
                    typeBadge = '<span class="badge badge-info">💸 Rút về ngân hàng</span>';
                } else if (tx.transaction_type === 'COMMISSION_DEDUCT') {
                    typeBadge = '<span class="badge badge-warning">Chiết khấu sàn</span>';
                } else if (tx.transaction_type === 'REFUND') {
                    typeBadge = '<span class="badge badge-danger">Hoàn tiền cọc</span>';
                }

                // Mã đơn hàng đối soát
                const orderCell = tx.order_code
                    ? `<a href="orders.html" style="font-weight:700;color:var(--primary);text-decoration:none">#${CC.esc(tx.order_code)}</a>`
                    : '<span class="muted">---</span>';

                return `
                    <tr>
                        <td>
                            <div style="font-weight:600;color:#0f172a">${fmtDate(tx.created_at)}</div>
                            <div class="small muted" style="font-family:monospace">#TX-${tx.id}</div>
                        </td>
                        <td>${typeBadge}</td>
                        <td>${orderCell}</td>
                        <td style="text-align:right" class="${amountClass}">${amountFormatted}</td>
                        <td style="text-align:right;font-weight:700;color:#334155">${fmtMoney(tx.balance_after)}</td>
                        <td style="font-size:0.85rem;color:#475569">${CC.esc(tx.description || 'Không có mô tả')}</td>
                    </tr>
                `;
            }).join('');

            // Phân trang
            const totalPages = Math.ceil(total / txLimit) || 1;
            CC.$('#tx-pagination-info').textContent = `Trang ${currentTxPage} / ${totalPages} (Tổng cộng ${total} giao dịch)`;
            CC.$('#btn-tx-prev').disabled = currentTxPage <= 1;
            CC.$('#btn-tx-next').disabled = currentTxPage >= totalPages;
        } catch (err) {
            console.error('Lỗi tải lịch sử giao dịch:', err);
            tbody.innerHTML = `<tr><td colspan="6" class="center" style="color:var(--danger);padding:24px">Không thể tải dữ liệu giao dịch: ${CC.esc(err.message)}</td></tr>`;
        }
    }

    /**
     * Tải danh sách yêu cầu rút tiền về ngân hàng
     */
    async function loadPayouts() {
        const tbody = CC.$('#tbody-payouts');
        tbody.innerHTML = `<tr><td colspan="6" class="center muted" style="padding:24px">Đang tải danh sách rút tiền...</td></tr>`;

        try {
            const res = await CC.api('/pharmacy/wallet/payouts');
            const list = res.payouts;

            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="center muted" style="padding:24px">Chưa có yêu cầu rút tiền nào. Hãy bấm nút "Yêu cầu rút tiền" để gửi lệnh rút.</td></tr>`;
                return;
            }

            tbody.innerHTML = list.map((p) => {
                let statusBadge = '<span class="badge badge-warning">⏳ Chờ duyệt chuyển khoản</span>';
                if (p.status === 'PAID') {
                    statusBadge = '<span class="badge badge-success">✅ Đã chuyển khoản</span>';
                } else if (p.status === 'REJECTED') {
                    statusBadge = '<span class="badge badge-danger">❌ Từ chối</span>';
                }

                const bankDetails = `
                    <div style="font-weight:700;color:#0f172a">${CC.esc(p.bank_name)}</div>
                    <div class="small" style="font-family:monospace">STK: <strong>${CC.esc(p.bank_account_number)}</strong></div>
                    <div class="small muted">Chủ TK: <strong>${CC.esc(p.account_holder)}</strong></div>
                `;

                return `
                    <tr>
                        <td>
                            <strong style="color:var(--primary);font-family:monospace">#PO-${p.id}</strong>
                        </td>
                        <td>${fmtDate(p.created_at)}</td>
                        <td style="text-align:right">
                            <strong style="font-size:1.05rem;color:#0f172a">${fmtMoney(p.amount)}</strong>
                        </td>
                        <td>${bankDetails}</td>
                        <td>${statusBadge}</td>
                        <td>${p.processed_at ? fmtDate(p.processed_at) : '<span class="muted small">Đang xử lý trong 24h</span>'}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Lỗi tải yêu cầu rút tiền:', err);
            tbody.innerHTML = `<tr><td colspan="6" class="center" style="color:var(--danger);padding:24px">Không thể tải danh sách rút tiền: ${CC.esc(err.message)}</td></tr>`;
        }
    }

    /**
     * Xử lý gửi yêu cầu rút tiền
     */
    async function handlePayoutSubmit(e) {
        e.preventDefault();
        const submitBtn = CC.$('#btn-submit-payout');
        const amount = parseFloat(CC.$('#payout-amount').value);
        const bankName = CC.$('#payout-bank-name').value;
        const accNumber = CC.$('#payout-acc-number').value.trim();
        const accHolder = CC.$('#payout-acc-holder').value.trim();

        if (!amount || amount < 50000) {
            CC.toast('Số tiền rút tối thiểu là 50.000 VNĐ', 'warning');
            return;
        }

        if (amount > currentWallet.balance) {
            CC.toast(`Số dư khả dụng không đủ (${fmtMoney(currentWallet.balance)})`, 'danger');
            return;
        }

        if (!bankName || !accNumber || !accHolder) {
            CC.toast('Vui lòng điền đầy đủ thông tin tài khoản ngân hàng thụ hưởng', 'warning');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang xử lý...';

            const payload = {
                amount,
                bank_name: bankName,
                bank_account_number: accNumber,
                account_holder: accHolder,
            };

            const res = await CC.api('/pharmacy/wallet/payouts', {
                method: 'POST',
                body: payload,
            });

            CC.toast(res.message || 'Gửi yêu cầu rút tiền thành công!', 'success');

            // Đóng modal
            CC.$('#modal-payout').style.display = 'none';
            document.body.style.overflow = '';

            // Tải lại dữ liệu
            await loadWalletOverview();
            await loadTransactions();
            await loadPayouts();

            // Chuyển sang tab Lịch sử rút tiền
            CC.$('#tab-btn-payouts').click();
        } catch (err) {
            console.error('Lỗi gửi yêu cầu rút tiền:', err);
            CC.toast(err.message || 'Không thể tạo yêu cầu rút tiền', 'danger');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Xác nhận gửi yêu cầu';
        }
    }
})();
