const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { notifyOrderStatusChange } = require('../services/notifications');

/**
 * GET /api/pharmacy/orders
 * Danh sách đơn hàng của nhà thuốc với bộ lọc trạng thái và tìm kiếm
 */
router.get('/', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { status, q, page = 1, limit = 20 } = req.query;

    const conditions = ['o.pharmacy_id = $1'];
    const params = [pharmacyId];

    if (status && status !== 'ALL') {
        if (status === 'PREPARING') {
            conditions.push(`o.status IN ('CONFIRMED', 'PREPARING')`);
        } else if (status === 'CANCELLED') {
            conditions.push(`o.status IN ('CANCELLED', 'RETURNED')`);
        } else {
            params.push(status);
            conditions.push(`o.status = $${params.length}`);
        }
    }

    if (q && q.trim()) {
        params.push(`%${q.trim().toLowerCase()}%`);
        conditions.push(`(
            LOWER(o.order_code) LIKE $${params.length} OR
            LOWER(o.shipping_recipient_name) LIKE $${params.length} OR
            LOWER(o.shipping_recipient_phone) LIKE $${params.length} OR
            LOWER(b.full_name) LIKE $${params.length} OR
            LOWER(b.phone) LIKE $${params.length}
        )`);
    }

    const whereClause = conditions.join(' AND ');

    // Đếm tổng số
    const countRes = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM orders o
         JOIN users b ON b.id = o.buyer_user_id
         JOIN users r ON r.id = o.recipient_user_id
         WHERE ${whereClause}`,
        params
    );
    const total = countRes.rows[0].total;

    // Phân trang
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const listQuery = `
        SELECT o.id, o.order_code, o.status, o.payment_method, o.payment_status,
               o.subtotal_amount, o.shipping_fee, o.discount_amount, o.care_coin_used,
               o.total_amount, o.platform_commission_amount,
               (o.subtotal_amount - o.platform_commission_amount) AS net_payout_amount,
               o.shipping_recipient_name, o.shipping_recipient_phone, o.shipping_address_line,
               o.shipping_latitude, o.shipping_longitude,
               o.note, o.cancel_reason, o.created_at, o.updated_at,
               o.prescription_id, o.prescription_request_id,
               b.id AS buyer_id, b.full_name AS buyer_name, b.phone AS buyer_phone,
               r.id AS recipient_id, r.full_name AS recipient_name, r.phone AS recipient_phone,
               fl.relationship,
               (o.buyer_user_id <> o.recipient_user_id) AS is_family_order,
               (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) AS item_count,
               s.id AS shipment_id, s.provider AS shipping_provider, s.tracking_code,
               s.driver_name, s.driver_phone, s.driver_plate, s.status AS shipment_status
        FROM orders o
        JOIN users b ON b.id = o.buyer_user_id
        JOIN users r ON r.id = o.recipient_user_id
        LEFT JOIN family_links fl ON fl.caregiver_user_id = o.buyer_user_id 
             AND fl.dependent_user_id = o.recipient_user_id AND fl.status = 'ACTIVE'
        LEFT JOIN shipments s ON s.order_id = o.id
        WHERE ${whereClause}
        ORDER BY 
            CASE o.status
                WHEN 'PENDING_CONFIRM' THEN 1
                WHEN 'CONFIRMED' THEN 2
                WHEN 'PREPARING' THEN 3
                WHEN 'SHIPPING' THEN 4
                WHEN 'COMPLETED' THEN 5
                ELSE 6
            END ASC,
            o.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const listRes = await db.query(listQuery, params);

    // Thống kê số lượng theo từng tab trạng thái
    const statsRes = await db.query(
        `SELECT 
            COUNT(*)::int AS all_count,
            COUNT(*) FILTER (WHERE status = 'PENDING_CONFIRM')::int AS pending_confirm_count,
            COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'PREPARING'))::int AS preparing_count,
            COUNT(*) FILTER (WHERE status = 'SHIPPING')::int AS shipping_count,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_count,
            COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'RETURNED'))::int AS cancelled_count,
            COALESCE(SUM(total_amount - platform_commission_amount) FILTER (
                WHERE status = 'COMPLETED' 
                  AND DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = CURRENT_DATE
            ), 0)::numeric AS today_revenue
         FROM orders
         WHERE pharmacy_id = $1`,
        [pharmacyId]
    );

    res.json({
        items: listRes.rows,
        total,
        page: Number(page),
        limit: Number(limit),
        stats: statsRes.rows[0],
    });
}));

/**
 * GET /api/pharmacy/orders/:id
 * Chi tiết toàn diện đơn hàng, thuốc cần đóng gói, người nhận và vận chuyển
 */
router.get('/:id', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;

    // 1. Thông tin chung đơn hàng
    const orderRes = await db.query(
        `SELECT o.*,
                (o.subtotal_amount - o.platform_commission_amount) AS net_payout_amount,
                b.id AS buyer_id, b.full_name AS buyer_name, b.phone AS buyer_phone, b.email AS buyer_email,
                r.id AS recipient_id, r.full_name AS recipient_name, r.phone AS recipient_phone,
                fl.relationship,
                (o.buyer_user_id <> o.recipient_user_id) AS is_family_order,
                p.name AS pharmacy_name, p.phone AS pharmacy_phone, p.address AS pharmacy_address
         FROM orders o
         JOIN users b ON b.id = o.buyer_user_id
         JOIN users r ON r.id = o.recipient_user_id
         JOIN pharmacies p ON p.id = o.pharmacy_id
         LEFT JOIN family_links fl ON fl.caregiver_user_id = o.buyer_user_id 
              AND fl.dependent_user_id = o.recipient_user_id AND fl.status = 'ACTIVE'
         WHERE o.id = $1 AND o.pharmacy_id = $2`,
        [id, pharmacyId]
    );

    if (!orderRes.rows.length) {
        throw new HttpError(404, 'Không tìm thấy đơn hàng tại nhà thuốc của bạn');
    }
    const order = orderRes.rows[0];

    // 2. Danh sách các mặt hàng thuốc trong đơn (order_items)
    const itemsRes = await db.query(
        `SELECT oi.*,
                md.name AS master_drug_name,
                md.active_ingredient,
                md.strength,
                md.dosage_form,
                md.unit,
                md.registration_number,
                md.manufacturer,
                inv.stock_quantity AS current_stock,
                inv.nearest_expiry_date,
                COALESCE(pi.usage_instructions, 'Uống theo chỉ dẫn của dược sĩ') AS usage_instructions,
                COALESCE(pi.dosage, '1 liều/lần') AS dosage,
                pi.duration_days,
                md.product_type,
                md.is_prescription_only
         FROM order_items oi
         LEFT JOIN pharmacy_inventories inv ON inv.id = oi.pharmacy_inventory_id
         LEFT JOIN master_drugs md ON md.id = inv.master_drug_id
         LEFT JOIN prescription_items pi ON pi.id = oi.prescription_item_id
         WHERE oi.order_id = $1
         ORDER BY oi.id ASC`,
        [id]
    );

    // 3. Thông tin giao vận (shipments)
    const shipmentRes = await db.query(
        `SELECT * FROM shipments WHERE order_id = $1`,
        [id]
    );

    // 4. Lịch sử thay đổi trạng thái (order_status_logs)
    const logsRes = await db.query(
        `SELECT osl.*, u.full_name AS changed_by_name, u.role AS changed_by_role
         FROM order_status_logs osl
         LEFT JOIN users u ON u.id = osl.changed_by_user_id
         WHERE osl.order_id = $1
         ORDER BY osl.created_at ASC`,
        [id]
    );

    // 5. Đơn thuốc gốc nếu đơn hàng phát sinh từ đơn bác sĩ
    let prescription = null;
    if (order.prescription_id) {
        const rxRes = await db.query(
            `SELECT p.id, p.source, p.patient_name_on_rx, p.diagnosis,
                    p.facility_name_raw, p.prescriber_name_raw, p.prescription_image_url,
                    p.ai_validation_status, p.issued_date,
                    doc.full_name AS doctor_name, prof.specialty AS doctor_specialty, prof.license_number AS doctor_license
             FROM prescriptions p
             LEFT JOIN professional_profiles prof ON prof.id = p.doctor_profile_id
             LEFT JOIN users doc ON doc.id = prof.user_id
             WHERE p.id = $1`,
            [order.prescription_id]
        );
        prescription = rxRes.rows[0] || null;
    }

    res.json({
        order,
        items: itemsRes.rows,
        shipment: shipmentRes.rows[0] || null,
        logs: logsRes.rows,
        prescription,
    });
}));

/**
 * PUT /api/pharmacy/orders/:id/status
 * Chuyển trạng thái đơn hàng (Xác nhận, Chuẩn bị thuốc, Giao hàng, Hoàn thành, Hủy)
 */
router.put('/:id/status', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;
    const { status: targetStatus, note, shipping_info, cancel_reason } = req.body;

    if (!targetStatus) {
        throw new HttpError(400, 'Thiếu trạng thái cần cập nhật (status)');
    }

    // 1. Kiểm tra đơn hàng hiện tại
    const orderRes = await db.query(
        `SELECT * FROM orders WHERE id = $1 AND pharmacy_id = $2`,
        [id, pharmacyId]
    );
    if (!orderRes.rows.length) {
        throw new HttpError(404, 'Không tìm thấy đơn hàng');
    }
    const order = orderRes.rows[0];
    const currentStatus = order.status;

    // Kiểm tra tính hợp lệ của luồng chuyển trạng thái
    const validTransitions = {
        PENDING_CONFIRM: ['CONFIRMED', 'PREPARING', 'CANCELLED'],
        CONFIRMED: ['PREPARING', 'CANCELLED'],
        PREPARING: ['PREPARING', 'SHIPPING', 'CANCELLED'],
        SHIPPING: ['SHIPPING', 'COMPLETED', 'CANCELLED', 'RETURNED'],
        COMPLETED: [],
        CANCELLED: [],
        RETURNED: [],
    };

    if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(targetStatus)) {
        throw new HttpError(
            400,
            `Không thể chuyển trạng thái từ "${currentStatus}" sang "${targetStatus}"`
        );
    }

    // Lấy danh sách sản phẩm để xử lý trừ/hoàn kho và hạn ngạch đơn thuốc RX
    const orderItemsRes = await db.query(
        `SELECT id, pharmacy_inventory_id, prescription_item_id, quantity, product_name_snapshot
         FROM order_items WHERE order_id = $1`,
        [id]
    );
    const orderItems = orderItemsRes.rows;

    await db.withTransaction(async (client) => {
        // A. Cập nhật trạng thái đơn hàng
        const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
        const updateParams = [targetStatus, id];

        if (targetStatus === 'CANCELLED' && cancel_reason) {
            updateFields.push(`cancel_reason = $${updateParams.length + 1}`);
            updateParams.splice(updateParams.length - 1, 0, cancel_reason);
        }

        await client.query(
            `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
            updateParams
        );

        // B. Ghi log lịch sử trạng thái
        await client.query(
            `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, currentStatus, targetStatus, req.user.id, note || null]
        );

        // C. Xử lý tồn kho & Hạn ngạch đơn thuốc (Prescription quota):
        // - Khi đơn bắt đầu chuyển sang PREPARING/CONFIRMED: Kiểm tra và trừ tồn kho, cập nhật dispensed_quantity
        // - Khi đơn bị CANCELLED/RETURNED: Hoàn trả lại tồn kho và hoàn trả quota nếu trước đó đã ở bước PREPARING hoặc SHIPPING
        if (['CONFIRMED', 'PREPARING'].includes(targetStatus) && currentStatus === 'PENDING_CONFIRM') {
            for (const item of orderItems) {
                if (item.pharmacy_inventory_id) {
                    // Kiểm tra tồn kho trước khi trừ
                    const invRes = await client.query(
                        `SELECT stock_quantity, status FROM pharmacy_inventories WHERE id = $1 FOR UPDATE`,
                        [item.pharmacy_inventory_id]
                    );
                    if (invRes.rows.length) {
                        const newStock = Math.max(0, invRes.rows[0].stock_quantity - item.quantity);
                        const newStatus = newStock === 0 ? 'OUT_OF_STOCK' : 'IN_STOCK';
                        await client.query(
                            `UPDATE pharmacy_inventories 
                             SET stock_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP 
                             WHERE id = $3`,
                            [newStock, newStatus, item.pharmacy_inventory_id]
                        );
                    }
                }

                // Cập nhật số lượng đã bán (dispensed_quantity) của mục đơn thuốc để chống mua vượt đơn (Luồng 3 - AI & OCR)
                if (item.prescription_item_id) {
                    await client.query(
                        `UPDATE prescription_items 
                         SET dispensed_quantity = LEAST(quantity, dispensed_quantity + $1)
                         WHERE id = $2`,
                        [item.quantity, item.prescription_item_id]
                    );
                }
            }

            // Nếu đơn thuốc đã bán đủ số lượng cho toàn bộ các mục, khóa đơn không cho dùng lại
            if (order.prescription_id) {
                const unfulfilledRes = await client.query(
                    `SELECT COUNT(*)::int AS remaining 
                     FROM prescription_items 
                     WHERE prescription_id = $1 AND dispensed_quantity < quantity`,
                    [order.prescription_id]
                );
                if (unfulfilledRes.rows[0].remaining === 0) {
                    await client.query(
                        `UPDATE prescriptions SET is_fully_dispensed = TRUE WHERE id = $1`,
                        [order.prescription_id]
                    );
                }
            }
        } else if (['CANCELLED', 'RETURNED'].includes(targetStatus) && ['CONFIRMED', 'PREPARING', 'SHIPPING'].includes(currentStatus)) {
            // Hoàn trả lại số lượng tồn kho và phục hồi quota đơn thuốc
            for (const item of orderItems) {
                if (item.pharmacy_inventory_id) {
                    await client.query(
                        `UPDATE pharmacy_inventories 
                         SET stock_quantity = stock_quantity + $1, status = 'IN_STOCK', updated_at = CURRENT_TIMESTAMP 
                         WHERE id = $2`,
                        [item.quantity, item.pharmacy_inventory_id]
                    );
                }

                if (item.prescription_item_id) {
                    await client.query(
                        `UPDATE prescription_items 
                         SET dispensed_quantity = GREATEST(0, dispensed_quantity - $1)
                         WHERE id = $2`,
                        [item.quantity, item.prescription_item_id]
                    );
                }
            }

            if (order.prescription_id) {
                await client.query(
                    `UPDATE prescriptions SET is_fully_dispensed = FALSE WHERE id = $1`,
                    [order.prescription_id]
                );
            }
        }

        // D. Xử lý thông tin giao vận (shipments)
        if (targetStatus === 'SHIPPING' && (shipping_info || currentStatus !== 'SHIPPING')) {
            const shipProvider = (shipping_info && shipping_info.provider) || 'AHAMOVE';
            const trackingCode = (shipping_info && shipping_info.tracking_code) || `CC-SHIP-${Date.now().toString().slice(-6)}`;
            const driverName = (shipping_info && shipping_info.driver_name) || 'Nguyễn Văn Hùng';
            const driverPhone = (shipping_info && shipping_info.driver_phone) || '0988123456';
            const driverPlate = (shipping_info && shipping_info.driver_plate) || '29A-888.99';

            await client.query(
                `INSERT INTO shipments (
                    order_id, provider, tracking_code, driver_name, driver_phone, driver_plate,
                    status, picked_up_at
                ) VALUES ($1, $2, $3, $4, $5, $6, 'IN_TRANSIT', CURRENT_TIMESTAMP)
                ON CONFLICT (order_id) DO UPDATE SET
                    provider = EXCLUDED.provider,
                    tracking_code = EXCLUDED.tracking_code,
                    driver_name = EXCLUDED.driver_name,
                    driver_phone = EXCLUDED.driver_phone,
                    driver_plate = EXCLUDED.driver_plate,
                    status = 'IN_TRANSIT',
                    picked_up_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP`,
                [id, shipProvider, trackingCode, driverName, driverPhone, driverPlate]
            );
        } else if (targetStatus === 'COMPLETED') {
            // Cập nhật trạng thái giao hàng thành công
            await client.query(
                `UPDATE shipments 
                 SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                 WHERE order_id = $1`,
                [id]
            );

            // E. Giải phóng tiền ký quỹ Escrow vào Ví nhà thuốc
            // Theo Luồng 1 (Dòng tiền): Doanh thu đối tác = Subtotal - Hoa hồng sàn (Phí ship thuộc về đơn vị vận chuyển/sàn)
            if (order.payment_status === 'HOLDING_ESCROW') {
                const netPayout = Number(order.subtotal_amount) - Number(order.platform_commission_amount);

                // Chuyển trạng thái thanh toán sang RELEASED
                await client.query(
                    `UPDATE orders SET payment_status = 'RELEASED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                    [id]
                );

                // Cập nhật ví nhà thuốc
                const walletRes = await client.query(
                    `UPDATE wallets 
                     SET balance = balance + $1,
                         pending_escrow_balance = GREATEST(0, pending_escrow_balance - $1)
                     WHERE owner_type = 'PHARMACY' AND pharmacy_id = $2
                     RETURNING id, balance`,
                    [netPayout, pharmacyId]
                );

                // Ghi nhật ký giao dịch ví
                if (walletRes.rows.length) {
                    await client.query(
                        `INSERT INTO wallet_transactions (
                            wallet_id, order_id, transaction_type, amount, balance_after, description
                        ) VALUES ($1, $2, 'ESCROW_RELEASE', $3, $4, $5)`,
                        [
                            walletRes.rows[0].id,
                            id,
                            netPayout,
                            walletRes.rows[0].balance,
                            `Giải phóng tiền ký quỹ đơn hàng ${order.order_code} (Đã trừ chiết khấu sàn)`,
                        ]
                    );
                }
            }
        } else if (['CANCELLED', 'RETURNED'].includes(targetStatus)) {
            // Hủy hoặc cập nhật shipment thất bại/hoàn hàng
            const shipStatus = targetStatus === 'RETURNED' ? 'FAILED' : 'CANCELLED';
            await client.query(
                `UPDATE shipments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2`,
                [shipStatus, id]
            );

            // Xử lý hoàn tiền ký quỹ (Luồng 1: Trả tiền hàng cho khách, giữ lại tiền ship)
            if (order.payment_status === 'HOLDING_ESCROW') {
                const netPayout = Number(order.subtotal_amount) - Number(order.platform_commission_amount);
                await client.query(
                    `UPDATE orders SET payment_status = 'REFUNDED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                    [id]
                );
                await client.query(
                    `UPDATE wallets 
                     SET pending_escrow_balance = GREATEST(0, pending_escrow_balance - $1)
                     WHERE owner_type = 'PHARMACY' AND pharmacy_id = $2`,
                    [netPayout, pharmacyId]
                );
            }
        }
    });

    // 4. Bắn thông báo realtime cho người mua và người nhận (Bố mẹ)
    try {
        await notifyOrderStatusChange(id);
    } catch (err) {
        console.error('Lỗi gửi thông báo đổi trạng thái đơn hàng:', err);
    }

    res.json({
        success: true,
        message: `Đã cập nhật trạng thái đơn hàng sang ${targetStatus}`,
        status: targetStatus,
    });
}));

/**
 * POST /api/pharmacy/orders/:id/dispatch-driver
 * Điều phối gọi tài xế bên thứ 3 (Ahamove / GrabExpress) hoặc gán Shipper nội bộ
 * Xử lý các kịch bản: Tìm thấy tài xế, Không tìm thấy tài xế (Giờ cao điểm/mưa bão)
 */
router.post('/:id/dispatch-driver', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;
    const { 
        provider = 'AHAMOVE', 
        simulate_no_driver = false, 
        driver_name, 
        driver_phone, 
        driver_plate 
    } = req.body;

    const orderRes = await db.query(
        `SELECT * FROM orders WHERE id = $1 AND pharmacy_id = $2`,
        [id, pharmacyId]
    );
    if (!orderRes.rows.length) {
        throw new HttpError(404, 'Không tìm thấy đơn hàng');
    }
    const order = orderRes.rows[0];

    // Xử lý kịch bản: Giờ cao điểm / Thời tiết xấu => Không tìm thấy tài xế
    if (simulate_no_driver) {
        await db.query(
            `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
             VALUES ($1, $2, $2, $3, $4)`,
            [
                id, 
                order.status, 
                req.user.id, 
                `⚠️ Đối tác ${provider}: Không tìm thấy tài xế nhận cuốc sau 3 lượt quét (Bán kính 3km). Chờ dược sĩ xử lý.`
            ]
        );
        return res.json({
            success: false,
            no_driver: true,
            provider,
            message: `Không tìm thấy tài xế ${provider} trong bán kính 3km. Dược sĩ có thể thử tìm lại, chuyển sang GrabExpress hoặc điều động Shipper nội bộ.`
        });
    }

    // Tạo thông tin tài xế thực tế (Mô phỏng Webhook từ 3rd party API hoặc Shipper nội bộ)
    const codeSuffix = Date.now().toString().slice(-6);
    let assignedDriver = {
        provider,
        tracking_code: `${provider === 'GRAB_EXPRESS' ? 'GRAB' : provider === 'AHAMOVE' ? 'AHA' : 'INT'}-${codeSuffix}`,
        driver_name: driver_name || (provider === 'GRAB_EXPRESS' ? 'Trần Minh Tuấn' : provider === 'AHAMOVE' ? 'Nguyễn Văn Hùng' : 'Lê Hoàng Nam (Nhân viên tiệm)'),
        driver_phone: driver_phone || (provider === 'GRAB_EXPRESS' ? '0912345678' : provider === 'AHAMOVE' ? '0988123456' : '0933555777'),
        driver_plate: driver_plate || (provider === 'GRAB_EXPRESS' ? '29E2-654.32' : provider === 'AHAMOVE' ? '29B1-888.99' : '29X5-112.23'),
        rating: 4.9,
        vehicle_model: provider === 'GRAB_EXPRESS' ? 'Honda Vision (Trắng)' : provider === 'AHAMOVE' ? 'Wave Alpha (Đỏ)' : 'Yamaha Sirius',
        tracking_url: provider === 'AHAMOVE' 
            ? `https://ahamove.com/tracking/AHA-${codeSuffix}` 
            : provider === 'GRAB_EXPRESS' 
                ? `https://grab.com/express/track/GRAB-${codeSuffix}` 
                : null
    };

    // Lưu thông tin vào bảng shipments
    await db.query(
        `INSERT INTO shipments (
            order_id, provider, tracking_code, driver_name, driver_phone, driver_plate, tracking_url,
            status, picked_up_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRIVER_ACCEPTED', CURRENT_TIMESTAMP)
        ON CONFLICT (order_id) DO UPDATE SET
            provider = EXCLUDED.provider,
            tracking_code = EXCLUDED.tracking_code,
            driver_name = EXCLUDED.driver_name,
            driver_phone = EXCLUDED.driver_phone,
            driver_plate = EXCLUDED.driver_plate,
            tracking_url = EXCLUDED.tracking_url,
            status = 'DRIVER_ACCEPTED',
            updated_at = CURRENT_TIMESTAMP`,
        [
            id, 
            assignedDriver.provider, 
            assignedDriver.tracking_code, 
            assignedDriver.driver_name, 
            assignedDriver.driver_phone, 
            assignedDriver.driver_plate, 
            assignedDriver.tracking_url
        ]
    );

    // Ghi log chi tiết vào Timeline
    const noteText = provider === 'INTERNAL_SHIPPER'
        ? `🚴 Nhà thuốc điều động Shipper nội bộ: ${assignedDriver.driver_name} (${assignedDriver.driver_phone})`
        : `📡 Đối tác ${provider} đã điều phối tài xế: ${assignedDriver.driver_name} (${assignedDriver.driver_phone}, Biển số: ${assignedDriver.driver_plate}). Đang di chuyển đến nhà thuốc.`;

    await db.query(
        `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
         VALUES ($1, $2, $2, $3, $4)`,
        [id, order.status, req.user.id, noteText]
    );

    res.json({
        success: true,
        no_driver: false,
        driver: assignedDriver,
        message: `Đã kết nối tài xế thành công từ ${provider}`
    });
}));

/**
 * POST /api/pharmacy/orders/mock-seed
 * Tạo đơn hàng mẫu đa dạng trạng thái để kiểm thử và demo quy trình nhà thuốc
 */
router.post('/mock-seed', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;

    // Lấy thông tin user người mua, người nhận
    const usersRes = await db.query(`SELECT id, full_name, phone FROM users WHERE role = 'BUYER' ORDER BY id LIMIT 3`);
    if (!usersRes.rows.length) {
        throw new HttpError(400, 'Chưa có tài khoản BUYER mẫu trong hệ thống');
    }

    const buyer = usersRes.rows[0];
    const parentRecipient = usersRes.rows.length > 1 ? usersRes.rows[1] : usersRes.rows[0];

    // Lấy thuốc từ kho nhà thuốc
    let invRes = await db.query(
        `SELECT pi.id, pi.price, pi.stock_quantity, md.name, md.product_type, md.unit
         FROM pharmacy_inventories pi
         JOIN master_drugs md ON md.id = pi.master_drug_id
         WHERE pi.pharmacy_id = $1
         ORDER BY pi.stock_quantity DESC
         LIMIT 4`,
        [pharmacyId]
    );

    // Nếu kho chưa có thuốc, tự động cấp bổ sung 4 mặt hàng từ danh mục master_drugs
    if (invRes.rows.length < 2) {
        await db.query(
            `INSERT INTO pharmacy_inventories (pharmacy_id, master_drug_id, stock_quantity, price, nearest_expiry_date, status)
             SELECT $1, md.id, 50, md.reference_price, '2027-12-31', 'IN_STOCK'
             FROM master_drugs md
             WHERE md.id NOT IN (SELECT master_drug_id FROM pharmacy_inventories WHERE pharmacy_id = $1)
             LIMIT 4`,
            [pharmacyId]
        );

        invRes = await db.query(
            `SELECT pi.id, pi.price, pi.stock_quantity, md.name, md.product_type, md.unit
             FROM pharmacy_inventories pi
             JOIN master_drugs md ON md.id = pi.master_drug_id
             WHERE pi.pharmacy_id = $1
             ORDER BY pi.stock_quantity DESC
             LIMIT 4`,
            [pharmacyId]
        );
    }

    const item1 = invRes.rows[0];
    const item2 = invRes.rows.length > 1 ? invRes.rows[1] : invRes.rows[0];

    const randStr = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const timeCode = Date.now().toString().slice(-5);

    const mockOrders = [
        {
            code: `CC-${timeCode}-P${randStr().slice(0, 3)}`,
            status: 'PENDING_CONFIRM',
            buyerId: buyer.id,
            recipientId: parentRecipient.id,
            recipientName: parentRecipient.full_name || 'Bác Vũ Văn An (Bố)',
            recipientPhone: parentRecipient.phone || '0912345678',
            address: 'Số 15 ngõ 42 Tràng Tiền, Hoàn Kiếm, Hà Nội',
            lat: 21.0254,
            lng: 105.8562,
            note: 'Con đặt mua thuốc gửi về cho Bố ở quê, xin kiểm tra kỹ hạn sử dụng',
            paymentMethod: 'ONLINE_ESCROW',
            paymentStatus: 'HOLDING_ESCROW',
            items: [
                { invId: item1.id, name: item1.name, type: item1.product_type, qty: 2, price: item1.price },
            ]
        },
        {
            code: `CC-${timeCode}-R${randStr().slice(0, 3)}`,
            status: 'PREPARING',
            buyerId: buyer.id,
            recipientId: buyer.id,
            recipientName: buyer.full_name,
            recipientPhone: buyer.phone,
            address: 'Tòa nhà Landmark 81, 720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM',
            lat: 10.7950,
            lng: 106.7218,
            note: 'Giao trong giờ hành chính giúp tôi',
            paymentMethod: 'ONLINE_ESCROW',
            paymentStatus: 'HOLDING_ESCROW',
            items: [
                { invId: item1.id, name: item1.name, type: item1.product_type, qty: 1, price: item1.price },
                { invId: item2.id, name: item2.name, type: item2.product_type, qty: 2, price: item2.price },
            ]
        },
        {
            code: `CC-${timeCode}-S${randStr().slice(0, 3)}`,
            status: 'SHIPPING',
            buyerId: buyer.id,
            recipientId: parentRecipient.id,
            recipientName: parentRecipient.full_name || 'Cụ Bà Nguyễn Thị Mơ (Mẹ)',
            recipientPhone: parentRecipient.phone || '0987654321',
            address: 'Nhà số 8, Phố Hàng Bạc, Hoàn Kiếm, Hà Nội',
            lat: 21.0345,
            lng: 105.8521,
            note: 'Thuốc hạ áp uống buổi sáng, đóng gói cẩn thận',
            paymentMethod: 'ONLINE_ESCROW',
            paymentStatus: 'HOLDING_ESCROW',
            items: [
                { invId: item2.id, name: item2.name, type: item2.product_type, qty: 3, price: item2.price },
            ],
            shipment: {
                provider: 'AHAMOVE',
                trackingCode: `AHA-VN-${timeCode}`,
                driverName: 'Trần Văn Mạnh',
                driverPhone: '0977889900',
                driverPlate: '29B1-678.90',
            }
        },
        {
            code: `CC-${timeCode}-C${randStr().slice(0, 3)}`,
            status: 'COMPLETED',
            buyerId: buyer.id,
            recipientId: buyer.id,
            recipientName: buyer.full_name,
            recipientPhone: buyer.phone,
            address: 'Số 48 Liễu Giai, Ba Đình, Hà Nội',
            lat: 21.0333,
            lng: 105.8142,
            note: 'Đã nhận đủ thuốc, cảm ơn dược sĩ',
            paymentMethod: 'ONLINE_ESCROW',
            paymentStatus: 'RELEASED',
            items: [
                { invId: item1.id, name: item1.name, type: item1.product_type, qty: 2, price: item1.price },
            ]
        }
    ];

    let createdCount = 0;

    await db.withTransaction(async (client) => {
        // Đảm bảo ví nhà thuốc tồn tại
        let walletRes = await client.query(
            `SELECT id, balance FROM wallets WHERE owner_type = 'PHARMACY' AND pharmacy_id = $1`,
            [pharmacyId]
        );
        if (!walletRes.rows.length) {
            walletRes = await client.query(
                `INSERT INTO wallets (owner_type, pharmacy_id, balance, pending_escrow_balance)
                 VALUES ('PHARMACY', $1, 0, 0) RETURNING id, balance`,
                [pharmacyId]
            );
        }
        const walletId = walletRes.rows[0].id;

        for (const mo of mockOrders) {
            let subtotal = 0;
            let totalCommission = 0;
            const calculatedItems = mo.items.map(it => {
                const itemTotal = it.qty * Number(it.price);
                let rate = 0.05;
                if (it.type === 'RX') rate = 0.05;
                else if (it.type === 'SUPPLEMENT') rate = 0.10;
                else if (it.type === 'OTC') rate = 0.07;
                else if (it.type === 'COSMETIC') rate = 0.15;
                else if (it.type === 'MEDICAL_DEVICE') rate = 0.07;

                const itemComm = Math.round(itemTotal * rate);
                subtotal += itemTotal;
                totalCommission += itemComm;
                return { ...it, itemTotal, rate, itemComm };
            });

            const shippingFee = 25000;
            const total = subtotal + shippingFee;
            const commission = totalCommission;
            const netPayout = subtotal - commission;

            const orderInsertRes = await client.query(
                `INSERT INTO orders (
                    order_code, buyer_user_id, recipient_user_id, pharmacy_id,
                    shipping_recipient_name, shipping_recipient_phone, shipping_address_line,
                    shipping_latitude, shipping_longitude,
                    subtotal_amount, shipping_fee, total_amount, platform_commission_amount,
                    status, payment_method, payment_status, note
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING id`,
                [
                    mo.code, mo.buyerId, mo.recipientId, pharmacyId,
                    mo.recipientName, mo.recipientPhone, mo.address,
                    mo.lat, mo.lng,
                    subtotal, shippingFee, total, commission,
                    mo.status, mo.paymentMethod, mo.paymentStatus, mo.note
                ]
            );
            const orderId = orderInsertRes.rows[0].id;

            // Thêm order_items với tỷ lệ chiết khấu chuẩn hóa theo Luồng 1
            for (const it of calculatedItems) {
                await client.query(
                    `INSERT INTO order_items (
                        order_id, pharmacy_inventory_id, product_name_snapshot,
                        product_type_snapshot, unit_price, quantity, total_price,
                        commission_rate, commission_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        orderId, it.invId, it.name,
                        it.type, it.price, it.qty, it.itemTotal,
                        it.rate, it.itemComm
                    ]
                );
            }

            // Thêm log trạng thái ban đầu
            await client.query(
                `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
                 VALUES ($1, NULL, $2, $3, 'Khởi tạo đơn hàng mẫu demo')`,
                [orderId, mo.status, req.user.id]
            );

            // Thêm shipment nếu có
            if (mo.shipment) {
                await client.query(
                    `INSERT INTO shipments (
                        order_id, provider, tracking_code, driver_name, driver_phone, driver_plate,
                        status, picked_up_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'IN_TRANSIT', CURRENT_TIMESTAMP)`,
                    [
                        orderId, mo.shipment.provider, mo.shipment.trackingCode,
                        mo.shipment.driverName, mo.shipment.driverPhone, mo.shipment.driverPlate
                    ]
                );
            }

            // Cập nhật ví nhà thuốc theo thuật toán Escrow Luồng 1:
            // Doanh thu thực nhận đối tác = Subtotal - Hoa hồng
            if (mo.status === 'COMPLETED') {
                const updatedW = await client.query(
                    `UPDATE wallets 
                     SET balance = balance + $1
                     WHERE id = $2
                     RETURNING balance`,
                    [netPayout, walletId]
                );

                await client.query(
                    `INSERT INTO wallet_transactions (
                        wallet_id, order_id, transaction_type, amount, balance_after, description
                    ) VALUES ($1, $2, 'ESCROW_RELEASE', $3, $4, $5)`,
                    [
                        walletId,
                        orderId,
                        netPayout,
                        updatedW.rows[0].balance,
                        `Giải phóng tiền ký quỹ đơn hàng ${mo.code} (Đã trừ chiết khấu sàn)`,
                    ]
                );
            } else if (mo.paymentStatus === 'HOLDING_ESCROW') {
                await client.query(
                    `UPDATE wallets 
                     SET pending_escrow_balance = pending_escrow_balance + $1
                     WHERE id = $2`,
                    [netPayout, walletId]
                );
            }

            createdCount++;
        }
    });

    res.json({
        success: true,
        message: `Đã tạo thành công ${createdCount} đơn hàng mẫu với đầy đủ các trạng thái!`,
    });
}));

module.exports = router;
