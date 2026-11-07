const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');

// Phân hệ Quản lý kho thuốc (Inventory)
router.use('/inventory', require('./inventory'));

// Phân hệ Tiếp nhận & Báo giá Đơn thuốc (Prescriptions)
router.use('/prescriptions', require('./prescriptionRequests'));

// Phân hệ Quản lý Đơn hàng bán ra & Giao vận (Orders)
router.use('/orders', require('./orders'));

// Phân hệ Ví & Doanh thu (Wallet & Payouts)
router.use('/wallet', require('./wallet'));

/**
 * GET /api/pharmacy/me
 * Trả về thông tin Dược sĩ đang đăng nhập và Nhà thuốc đang trực
 */
router.get('/me', ah(async (req, res) => {
    // Thông tin chi tiết của user
    const userRes = await db.query(
        `SELECT id, phone, email, full_name, avatar_url, role FROM users WHERE id = $1`,
        [req.user.id]
    );

    // Thông tin ví nhà thuốc
    const walletRes = await db.query(
        `SELECT id, balance, pending_escrow_balance FROM wallets WHERE owner_type = 'PHARMACY' AND pharmacy_id = $1`,
        [req.pharmacyId]
    );

    res.json({
        user: userRes.rows[0],
        pharmacy: req.pharmacy,
        wallet: walletRes.rows[0] || { balance: 0, pending_escrow_balance: 0 },
    });
}));

/**
 * PUT /api/pharmacy/profile
 * Cập nhật thông tin nhà thuốc & dược sĩ phụ trách chuyên môn
 */
router.put('/profile', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const {
        name,
        phone,
        address,
        business_license_number,
        gpp_certificate,
        storefront_image_url,
        latitude,
        longitude,
        pharmacist_name,
        email,
    } = req.body;

    await db.withTransaction(async (client) => {
        // Cập nhật bảng pharmacies
        await client.query(
            `UPDATE pharmacies
             SET name = COALESCE($1, name),
                 phone = COALESCE($2, phone),
                 address = COALESCE($3, address),
                 business_license_number = COALESCE($4, business_license_number),
                 gpp_certificate = COALESCE($5, gpp_certificate),
                 storefront_image_url = COALESCE($6, storefront_image_url),
                 latitude = COALESCE($7, latitude),
                 longitude = COALESCE($8, longitude),
                 geom = CASE 
                     WHEN $7::numeric IS NOT NULL AND $8::numeric IS NOT NULL 
                     THEN ST_SetSRID(ST_MakePoint($8::numeric, $7::numeric), 4326)
                     ELSE geom 
                 END
             WHERE id = $9`,
            [
                name || null,
                phone || null,
                address || null,
                business_license_number || null,
                gpp_certificate || null,
                storefront_image_url || null,
                latitude ? parseFloat(latitude) : null,
                longitude ? parseFloat(longitude) : null,
                pharmacyId,
            ]
        );

        // Cập nhật bảng users (Dược sĩ phụ trách)
        if (pharmacist_name || email) {
            await client.query(
                `UPDATE users
                 SET full_name = COALESCE($1, full_name),
                     email = COALESCE($2, email)
                 WHERE id = $3`,
                [pharmacist_name || null, email || null, req.user.id]
            );
        }
    });

    const updatedPharmacy = await db.query(`SELECT * FROM pharmacies WHERE id = $1`, [pharmacyId]);
    const updatedUser = await db.query(`SELECT id, phone, email, full_name, avatar_url FROM users WHERE id = $1`, [req.user.id]);

    res.json({
        success: true,
        message: 'Đã cập nhật thông tin nhà thuốc và hồ sơ GPP thành công!',
        pharmacy: updatedPharmacy.rows[0],
        user: updatedUser.rows[0],
    });
}));

/**
 * POST /api/pharmacy/upload-storefront
 * Tải ảnh quầy thuốc / mặt tiền nhà thuốc từ file máy tính hoặc điện thoại
 */
router.post('/upload-storefront', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { image_base64 } = req.body;

    if (!image_base64) {
        throw new HttpError(400, 'Không tìm thấy dữ liệu ảnh để tải lên');
    }

    // Tách base64 data URL
    const matches = image_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = 'jpg';

    if (matches && matches.length === 3) {
        const mimeType = matches[1].toLowerCase();
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('webp')) ext = 'webp';
        else if (mimeType.includes('gif')) ext = 'gif';
        else ext = 'jpg';
        buffer = Buffer.from(matches[2], 'base64');
    } else {
        buffer = Buffer.from(image_base64, 'base64');
    }

    if (buffer.length > 10 * 1024 * 1024) {
        throw new HttpError(400, 'Dung lượng ảnh vượt quá giới hạn 10MB');
    }

    const uploadDir = path.join(__dirname, '..', '..', '..', 'frontend', 'uploads', 'storefront');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const newFilename = `pharmacy_${pharmacyId}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, newFilename);
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/storefront/${newFilename}`;

    // Lưu ngay đường dẫn ảnh vào bảng pharmacies
    await db.query(
        `UPDATE pharmacies SET storefront_image_url = $1 WHERE id = $2`,
        [relativeUrl, pharmacyId]
    );

    res.json({
        success: true,
        message: 'Tải ảnh quầy thuốc lên thành công!',
        url: relativeUrl,
    });
}));

/**
 * GET /api/pharmacy/dashboard
 * Thống kê tổng quan ca trực và các cảnh báo nhanh
 */
router.get('/dashboard', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;

    // 1. Số yêu cầu đơn thuốc chờ dược sĩ báo giá (status = 'SENT')
    const pendingRxRes = await db.query(
        `SELECT COUNT(*)::int AS count FROM prescription_requests WHERE pharmacy_id = $1 AND status = 'SENT'`,
        [pharmacyId]
    );

    // 2. Số đơn hàng cần xử lý / chuẩn bị đóng gói
    const activeOrdersRes = await db.query(
        `SELECT COUNT(*)::int AS count FROM orders WHERE pharmacy_id = $1 AND status IN ('PENDING_CONFIRM', 'CONFIRMED', 'PREPARING')`,
        [pharmacyId]
    );

    // 3. Doanh thu hôm nay (các đơn COMPLETED trong ngày)
    const todayRevenueRes = await db.query(
        `SELECT COALESCE(SUM(total_amount - platform_commission_amount), 0)::numeric AS revenue
         FROM orders
         WHERE pharmacy_id = $1 AND status = 'COMPLETED'
           AND DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = CURRENT_DATE`,
        [pharmacyId]
    );

    // 4. Cảnh báo kho: Thuốc sắp hết hàng (<= 10 đơn vị)
    const lowStockRes = await db.query(
        `SELECT COUNT(*)::int AS count FROM pharmacy_inventories WHERE pharmacy_id = $1 AND stock_quantity <= 10`,
        [pharmacyId]
    );

    // 5. Cảnh báo kho: Thuốc cận date (trong vòng 90 ngày tới)
    const expiringSoonRes = await db.query(
        `SELECT COUNT(*)::int AS count FROM pharmacy_inventories
         WHERE pharmacy_id = $1 AND nearest_expiry_date IS NOT NULL AND nearest_expiry_date <= CURRENT_DATE + INTERVAL '90 days'`,
        [pharmacyId]
    );

    // 6. Số dư ví nhà thuốc
    const walletRes = await db.query(
        `SELECT balance, pending_escrow_balance FROM wallets WHERE owner_type = 'PHARMACY' AND pharmacy_id = $1`,
        [pharmacyId]
    );

    // 7. Danh sách 5 yêu cầu đơn thuốc mới nhất
    const recentRxRes = await db.query(
        `SELECT pr.id, pr.status, pr.quoted_subtotal, pr.created_at,
                p.id AS prescription_id, p.diagnosis, p.source, p.prescription_image_url,
                p.patient_name_on_rx,
                u.full_name AS requester_name, u.phone AS requester_phone
         FROM prescription_requests pr
         JOIN prescriptions p ON p.id = pr.prescription_id
         JOIN users u ON u.id = pr.requested_by_user_id
         WHERE pr.pharmacy_id = $1
         ORDER BY pr.created_at DESC
         LIMIT 5`,
        [pharmacyId]
    );

    // 8. Danh sách 5 đơn hàng gần đây nhất
    const recentOrdersRes = await db.query(
        `SELECT o.id, o.order_code, o.total_amount, o.status, o.payment_status, o.created_at,
                o.shipping_recipient_name, o.shipping_recipient_phone, o.shipping_address_line
         FROM orders o
         WHERE o.pharmacy_id = $1
         ORDER BY o.created_at DESC
         LIMIT 5`,
        [pharmacyId]
    );

    res.json({
        stats: {
            pending_prescriptions: pendingRxRes.rows[0].count,
            active_orders: activeOrdersRes.rows[0].count,
            today_revenue: parseFloat(todayRevenueRes.rows[0].revenue) || 0,
            low_stock: lowStockRes.rows[0].count,
            expiring_soon: expiringSoonRes.rows[0].count,
            wallet_balance: walletRes.rows[0] ? parseFloat(walletRes.rows[0].balance) : 0,
            escrow_balance: walletRes.rows[0] ? parseFloat(walletRes.rows[0].pending_escrow_balance) : 0,
        },
        recent_prescriptions: recentRxRes.rows,
        recent_orders: recentOrdersRes.rows,
    });
}));

module.exports = router;
