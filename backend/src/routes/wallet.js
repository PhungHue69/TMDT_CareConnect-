const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');

/**
 * Lấy hoặc tạo ví cho nhà thuốc hiện tại
 */
async function getOrCreatePharmacyWallet(pharmacyId, client = db) {
    let res = await client.query(
        `SELECT * FROM wallets WHERE owner_type = 'PHARMACY' AND pharmacy_id = $1`,
        [pharmacyId]
    );
    if (!res.rows.length) {
        res = await client.query(
            `INSERT INTO wallets (owner_type, pharmacy_id, balance, pending_escrow_balance)
             VALUES ('PHARMACY', $1, 0.00, 0.00)
             RETURNING *`,
            [pharmacyId]
        );
    }
    return res.rows[0];
}

/**
 * GET /api/pharmacy/wallet
 * Lấy thông tin số dư ví, tiền ký quỹ Escrow và thống kê tài chính
 */
router.get('/', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const wallet = await getOrCreatePharmacyWallet(pharmacyId);

    // 1. Tổng tiền ký quỹ đang tạm giữ từ các đơn đang xử lý / đang giao (Doanh thu đối tác = Subtotal - Chiết khấu)
    const pendingEscrowRes = await db.query(
        `SELECT COALESCE(SUM(subtotal_amount - platform_commission_amount), 0)::numeric AS pending_amount,
                COUNT(*)::int AS pending_orders_count
         FROM orders
         WHERE pharmacy_id = $1 AND status IN ('CONFIRMED', 'PREPARING', 'SHIPPING') AND payment_status = 'HOLDING_ESCROW'`,
        [pharmacyId]
    );
    const pendingFromOrders = parseFloat(pendingEscrowRes.rows[0].pending_amount) || 0;

    // 2. Tổng doanh thu tích lũy từ các đơn hoàn thành
    const totalEarnedRes = await db.query(
        `SELECT COALESCE(SUM(subtotal_amount - platform_commission_amount), 0)::numeric AS total_earned,
                COALESCE(SUM(platform_commission_amount), 0)::numeric AS total_commission,
                COUNT(*)::int AS completed_orders_count
         FROM orders
         WHERE pharmacy_id = $1 AND status = 'COMPLETED'`,
        [pharmacyId]
    );

    // 3. Doanh thu tháng này
    const monthRevenueRes = await db.query(
        `SELECT COALESCE(SUM(subtotal_amount - platform_commission_amount), 0)::numeric AS month_revenue
         FROM orders
         WHERE pharmacy_id = $1 AND status = 'COMPLETED'
           AND DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE_TRUNC('month', CURRENT_DATE)`,
        [pharmacyId]
    );

    // 4. Tổng tiền đã rút thành công
    const withdrawnRes = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total_withdrawn
         FROM payout_requests
         WHERE wallet_id = $1 AND status = 'PAID'`,
        [wallet.id]
    );

    // 5. Tiền đang trong lệnh rút chờ xử lý (PENDING)
    const pendingPayoutRes = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS pending_payout
         FROM payout_requests
         WHERE wallet_id = $1 AND status = 'PENDING'`,
        [wallet.id]
    );

    res.json({
        wallet: {
            id: wallet.id,
            balance: parseFloat(wallet.balance) || 0,
            pending_escrow_balance: pendingFromOrders > 0 ? pendingFromOrders : (parseFloat(wallet.pending_escrow_balance) || 0),
        },
        stats: {
            total_earned: parseFloat(totalEarnedRes.rows[0].total_earned) || 0,
            total_commission: parseFloat(totalEarnedRes.rows[0].total_commission) || 0,
            month_revenue: parseFloat(monthRevenueRes.rows[0].month_revenue) || 0,
            total_withdrawn: parseFloat(withdrawnRes.rows[0].total_withdrawn) || 0,
            pending_payout: parseFloat(pendingPayoutRes.rows[0].pending_payout) || 0,
            completed_orders_count: totalEarnedRes.rows[0].completed_orders_count,
            pending_orders_count: pendingEscrowRes.rows[0].pending_orders_count,
        }
    });
}));

/**
 * GET /api/pharmacy/wallet/transactions
 * Lịch sử biến động số dư (Đối soát doanh thu đơn hàng, tiền vào, rút tiền)
 */
router.get('/transactions', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const wallet = await getOrCreatePharmacyWallet(pharmacyId);
    const { type, limit = 20, page = 1 } = req.query;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const conditions = ['wt.wallet_id = $1'];
    const params = [wallet.id];

    if (type && type !== 'ALL') {
        params.push(type);
        conditions.push(`wt.transaction_type = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // Đếm tổng số giao dịch
    const countRes = await db.query(
        `SELECT COUNT(*)::int AS total FROM wallet_transactions wt WHERE ${whereClause}`,
        params
    );
    const total = countRes.rows[0].total;

    // Lấy danh sách giao dịch kèm thông tin đơn hàng
    params.push(parseInt(limit, 10), offset);
    const txRes = await db.query(
        `SELECT wt.*, o.order_code, o.total_amount AS order_total, o.platform_commission_amount AS order_commission
         FROM wallet_transactions wt
         LEFT JOIN orders o ON o.id = wt.order_id
         WHERE ${whereClause}
         ORDER BY wt.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    res.json({
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        transactions: txRes.rows,
    });
}));

/**
 * GET /api/pharmacy/wallet/payouts
 * Danh sách các yêu cầu rút tiền về ngân hàng
 */
router.get('/payouts', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const wallet = await getOrCreatePharmacyWallet(pharmacyId);

    const payoutsRes = await db.query(
        `SELECT pr.*, u.full_name AS processed_by_name
         FROM payout_requests pr
         LEFT JOIN users u ON u.id = pr.processed_by_user_id
         WHERE pr.wallet_id = $1
         ORDER BY pr.created_at DESC`,
        [wallet.id]
    );

    res.json({
        payouts: payoutsRes.rows,
    });
}));

/**
 * POST /api/pharmacy/wallet/payouts
 * Tạo yêu cầu rút tiền mới về tài khoản ngân hàng
 */
router.post('/payouts', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { amount, bank_name, bank_account_number, account_holder } = req.body;

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
        throw new HttpError(400, 'Số tiền rút không hợp lệ');
    }
    if (numAmount < 50000) {
        throw new HttpError(400, 'Số tiền rút tối thiểu là 50.000 VNĐ');
    }
    if (!bank_name || !bank_account_number || !account_holder) {
        throw new HttpError(400, 'Vui lòng điền đầy đủ tên ngân hàng, số tài khoản và tên chủ tài khoản thụ hưởng');
    }

    const cleanBank = bank_name.trim();
    const cleanAccNo = bank_account_number.trim().replace(/\s+/g, '');
    const cleanHolder = account_holder.trim().toUpperCase();

    let createdPayout = null;
    let newBalance = 0;

    await db.withTransaction(async (client) => {
        // Kiểm tra số dư khả dụng với FOR UPDATE để tránh race condition
        const walletRes = await client.query(
            `SELECT * FROM wallets WHERE owner_type = 'PHARMACY' AND pharmacy_id = $1 FOR UPDATE`,
            [pharmacyId]
        );
        if (!walletRes.rows.length) {
            throw new HttpError(404, 'Không tìm thấy ví nhà thuốc');
        }
        const wallet = walletRes.rows[0];
        const currentBalance = parseFloat(wallet.balance) || 0;

        if (currentBalance < numAmount) {
            throw new HttpError(
                400,
                `Số dư khả dụng không đủ để rút. Hiện tại bạn có ${new Intl.NumberFormat('vi-VN').format(currentBalance)} VNĐ`
            );
        }

        newBalance = currentBalance - numAmount;

        // Trừ tiền khỏi ví
        await client.query(
            `UPDATE wallets 
             SET balance = $1
             WHERE id = $2`,
            [newBalance, wallet.id]
        );

        // Tạo yêu cầu rút tiền payout_requests
        const payoutInsert = await client.query(
            `INSERT INTO payout_requests (
                wallet_id, amount, bank_name, bank_account_number, account_holder, status
            ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
            RETURNING *`,
            [wallet.id, numAmount, cleanBank, cleanAccNo, cleanHolder]
        );
        createdPayout = payoutInsert.rows[0];

        // Ghi nhật ký biến động số dư
        await client.query(
            `INSERT INTO wallet_transactions (
                wallet_id, transaction_type, amount, balance_after, description
            ) VALUES ($1, 'PAYOUT_RELEASE', $2, $3, $4)`,
            [
                wallet.id,
                -numAmount,
                newBalance,
                `Yêu cầu rút tiền về ${cleanBank} (${cleanAccNo}) - Chủ TK: ${cleanHolder}`,
            ]
        );
    });

    res.json({
        success: true,
        message: 'Đã gửi yêu cầu rút tiền thành công! Tiền sẽ được chuyển về tài khoản trong 24 giờ làm việc.',
        payout: createdPayout,
        new_balance: newBalance,
    });
}));

/**
 * POST /api/pharmacy/wallet/mock-seed
 * Nạp dữ liệu mẫu ví & giao dịch để kiểm thử đối soát và rút tiền
 */
router.post('/mock-seed', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const wallet = await getOrCreatePharmacyWallet(pharmacyId);

    await db.withTransaction(async (client) => {
        // Nạp thêm số dư demo 2.500.000 VNĐ vào ví
        const topupAmount = 2500000;
        const currentBal = parseFloat(wallet.balance) || 0;
        const updatedBal = currentBal + topupAmount;

        await client.query(
            `UPDATE wallets SET balance = $1, pending_escrow_balance = 350000 WHERE id = $2`,
            [updatedBal, wallet.id]
        );

        // Sinh 3 giao dịch mẫu
        await client.query(
            `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, balance_after, description, created_at)
             VALUES 
             ($1, 'ESCROW_RELEASE', 850000, $2, 'Giải phóng tiền ký quỹ đơn hàng CC-DEMO-01 (Đã trừ chiết khấu sàn 10%)', CURRENT_TIMESTAMP - INTERVAL '2 days'),
             ($1, 'ESCROW_RELEASE', 1250000, $2, 'Giải phóng tiền ký quỹ đơn hàng CC-DEMO-02 (Đã trừ chiết khấu sàn 10%)', CURRENT_TIMESTAMP - INTERVAL '1 day'),
             ($1, 'PAYOUT_RELEASE', -500000, $2, 'Rút tiền về Vietcombank (STK: 0011001234567) - Đã xử lý thành công', CURRENT_TIMESTAMP - INTERVAL '12 hours')`,
            [wallet.id, updatedBal]
        );

        // Sinh 1 yêu cầu rút tiền đã thành công và 1 đang chờ
        await client.query(
            `INSERT INTO payout_requests (wallet_id, amount, bank_name, bank_account_number, account_holder, status, processed_at, created_at)
             VALUES 
             ($1, 500000, 'Vietcombank', '0011001234567', 'NGUYEN THI DUOC SI', 'PAID', CURRENT_TIMESTAMP - INTERVAL '10 hours', CURRENT_TIMESTAMP - INTERVAL '12 hours'),
             ($1, 200000, 'Techcombank', '19034567890123', 'NGUYEN THI DUOC SI', 'PENDING', NULL, CURRENT_TIMESTAMP - INTERVAL '1 hour')`,
            [wallet.id]
        );
    });

    res.json({
        success: true,
        message: 'Đã nạp số dư ví và tạo dữ liệu giao dịch mẫu thành công!',
    });
}));

module.exports = router;
