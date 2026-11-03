const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { notify } = require('../services/notifications');

/**
 * GET /api/pharmacy/prescriptions
 * Lấy danh sách yêu cầu đơn thuốc của nhà thuốc theo bộ lọc trạng thái
 */
router.get('/', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { status, q, page = 1, limit = 20 } = req.query;

    const conditions = ['pr.pharmacy_id = $1'];
    const params = [pharmacyId];

    if (status && status !== 'ALL') {
        params.push(status);
        conditions.push(`pr.status = $${params.length}`);
    }

    if (q && q.trim()) {
        params.push(`%${q.trim().toLowerCase()}%`);
        conditions.push(`(
            LOWER(p.patient_name_on_rx) LIKE $${params.length} OR
            LOWER(p.diagnosis) LIKE $${params.length} OR
            LOWER(u.full_name) LIKE $${params.length} OR
            LOWER(u.phone) LIKE $${params.length}
        )`);
    }

    const whereClause = conditions.join(' AND ');

    // Đếm tổng số
    const countRes = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM prescription_requests pr
         JOIN prescriptions p ON p.id = pr.prescription_id
         JOIN users u ON u.id = pr.requested_by_user_id
         WHERE ${whereClause}`,
        params
    );
    const total = countRes.rows[0].total;

    // Phân trang
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const listQuery = `
        SELECT pr.id, pr.prescription_id, pr.pharmacy_id, pr.requested_by_user_id,
               pr.status, pr.pharmacist_user_id, pr.quoted_subtotal, pr.pharmacist_note,
               pr.reject_reason, pr.quoted_at, pr.expires_at, pr.created_at,
               p.source, p.patient_name_on_rx, p.diagnosis, p.facility_name_raw,
               p.prescriber_name_raw, p.prescription_image_url, p.ai_validation_status,
               u.full_name AS requester_name, u.phone AS requester_phone,
               (SELECT COUNT(*)::int FROM prescription_items WHERE prescription_id = p.id) AS item_count
        FROM prescription_requests pr
        JOIN prescriptions p ON p.id = pr.prescription_id
        JOIN users u ON u.id = pr.requested_by_user_id
        WHERE ${whereClause}
        ORDER BY 
            CASE pr.status 
                WHEN 'SENT' THEN 1 
                WHEN 'QUOTED' THEN 2 
                WHEN 'ACCEPTED' THEN 3 
                ELSE 4 
            END ASC,
            pr.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const listRes = await db.query(listQuery, params);

    // Thống kê số lượng theo từng tab
    const statsRes = await db.query(
        `SELECT 
            COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent_count,
            COUNT(*) FILTER (WHERE status = 'QUOTED')::int AS quoted_count,
            COUNT(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted_count,
            COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_count,
            COUNT(*)::int AS all_count
         FROM prescription_requests
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
 * GET /api/pharmacy/prescriptions/:id
 * Chi tiết yêu cầu đơn thuốc, danh sách thuốc cần báo giá và gợi ý thuốc trong kho
 */
router.get('/:id', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;

    // 1. Thông tin chung về request và prescription
    const reqRes = await db.query(
        `SELECT pr.*,
                p.source, p.patient_name_on_rx, p.facility_name_raw, p.prescriber_name_raw,
                p.diagnosis, p.prescription_image_url, p.raw_text_input, p.ocr_raw_text,
                p.ai_validation_status, p.valid_until, p.is_fully_dispensed, p.issued_date,
                u.id AS requester_user_id, u.full_name AS requester_name, u.phone AS requester_phone,
                doc.full_name AS doctor_name,
                doc_prof.specialty AS doctor_specialty, doc_prof.license_number AS doctor_license
         FROM prescription_requests pr
         JOIN prescriptions p ON p.id = pr.prescription_id
         JOIN users u ON u.id = pr.requested_by_user_id
         LEFT JOIN professional_profiles doc_prof ON doc_prof.id = p.doctor_profile_id
         LEFT JOIN users doc ON doc.id = doc_prof.user_id
         WHERE pr.id = $1 AND pr.pharmacy_id = $2`,
        [id, pharmacyId]
    );

    if (!reqRes.rows.length) {
        throw new HttpError(404, 'Không tìm thấy yêu cầu đơn thuốc này tại nhà thuốc của bạn');
    }
    const requestData = reqRes.rows[0];

    // 2. Danh sách các thuốc bác sĩ kê trong đơn (prescription_items)
    // Đồng thời tra cứu xem nhà thuốc có sẵn mặt hàng này trong kho không
    const itemsRes = await db.query(
        `SELECT pi.id, pi.prescription_id, pi.master_drug_id, pi.drug_name_raw,
                pi.dosage, pi.quantity AS prescribed_quantity, pi.dispensed_quantity,
                pi.duration_days, pi.usage_instructions,
                md.name AS master_drug_name, md.active_ingredient, md.strength,
                md.dosage_form, md.product_type, md.unit, md.reference_price,
                inv.id AS inventory_id,
                inv.stock_quantity AS current_stock,
                inv.price AS pharmacy_price,
                inv.nearest_expiry_date,
                inv.status AS inventory_status
         FROM prescription_items pi
         LEFT JOIN master_drugs md ON md.id = pi.master_drug_id
         LEFT JOIN pharmacy_inventories inv ON inv.master_drug_id = pi.master_drug_id AND inv.pharmacy_id = $1
         WHERE pi.prescription_id = $2
         ORDER BY pi.id ASC`,
        [pharmacyId, requestData.prescription_id]
    );

    // Tìm kiếm các thuốc thay thế cùng hoạt chất trong kho cho từng loại thuốc được kê
    for (const item of itemsRes.rows) {
        if (item.active_ingredient) {
            // Tách từ khóa hoạt chất chính (ví dụ Amoxicillin, Paracetamol,...)
            const primaryIngredient = item.active_ingredient.split(/[\s+,]/)[0].trim();
            const subRes = await db.query(
                `SELECT inv.id AS inventory_id, inv.stock_quantity, inv.price,
                        md.id AS master_drug_id, md.name AS drug_name,
                        md.active_ingredient, md.strength, md.unit, md.product_type,
                        md.manufacturer
                 FROM pharmacy_inventories inv
                 JOIN master_drugs md ON md.id = inv.master_drug_id
                 WHERE inv.pharmacy_id = $1 AND inv.stock_quantity > 0 AND inv.status = 'IN_STOCK'
                   AND LOWER(md.active_ingredient) LIKE '%' || LOWER($2) || '%'
                   AND md.id <> COALESCE($3, -1)
                 LIMIT 6`,
                [pharmacyId, primaryIngredient, item.master_drug_id]
            );
            item.suggested_substitutes = subRes.rows;
        } else {
            item.suggested_substitutes = [];
        }
    }

    // Danh sách toàn bộ thuốc đang có hàng trong kho nhà thuốc để hỗ trợ đổi thuốc tự do
    const allStockRes = await db.query(
        `SELECT inv.id AS inventory_id, inv.stock_quantity, inv.price,
                md.id AS master_drug_id, md.name AS drug_name,
                md.active_ingredient, md.strength, md.unit, md.product_type,
                md.manufacturer
         FROM pharmacy_inventories inv
         JOIN master_drugs md ON md.id = inv.master_drug_id
         WHERE inv.pharmacy_id = $1 AND inv.stock_quantity > 0 AND inv.status = 'IN_STOCK'
         ORDER BY md.name ASC`,
        [pharmacyId]
    );

    // 3. Nếu đơn đã được báo giá (status != 'SENT'), lấy chi tiết các dòng đã báo giá
    let quotedItems = [];
    if (requestData.status !== 'SENT') {
        const quotedRes = await db.query(
            `SELECT pri.*,
                    inv.stock_quantity AS current_stock,
                    md.name AS quoted_drug_name,
                    md.active_ingredient,
                    md.unit
             FROM prescription_request_items pri
             LEFT JOIN pharmacy_inventories inv ON inv.id = pri.pharmacy_inventory_id
             LEFT JOIN master_drugs md ON md.id = inv.master_drug_id
             WHERE pri.request_id = $1
             ORDER BY pri.id ASC`,
            [id]
        );
        quotedItems = quotedRes.rows;
    }

    // 4. Lấy thông tin nhật ký AI OCR & Guardrail từ Luồng 3 (TV2)
    const aiLogRes = await db.query(
        `SELECT model_name, detected_intent, confidence, flagged_reason, created_at
         FROM prescription_ai_logs
         WHERE prescription_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [requestData.prescription_id]
    );
    const aiLog = aiLogRes.rows[0] || null;

    res.json({
        request: requestData,
        prescribed_items: itemsRes.rows,
        quoted_items: quotedItems,
        all_inventory: allStockRes.rows,
        ai_log: aiLog,
    });
}));

/**
 * POST /api/pharmacy/prescriptions/:id/quote
 * Dược sĩ gửi báo giá chi tiết cho đơn thuốc
 */
router.post('/:id/quote', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;
    const { pharmacist_note, expires_in_hours = 24, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new HttpError(400, 'Báo giá phải có ít nhất 1 sản phẩm thuốc');
    }

    // Kiểm tra yêu cầu
    const reqRes = await db.query(
        `SELECT id, prescription_id, requested_by_user_id, status FROM prescription_requests WHERE id = $1 AND pharmacy_id = $2`,
        [id, pharmacyId]
    );
    if (!reqRes.rows.length) throw new HttpError(404, 'Không tìm thấy yêu cầu đơn thuốc');
    const rxReq = reqRes.rows[0];

    if (['ACCEPTED', 'CANCELLED', 'EXPIRED'].includes(rxReq.status)) {
        throw new HttpError(400, `Không thể báo giá đơn thuốc ở trạng thái ${rxReq.status}`);
    }

    let calculatedSubtotal = 0;

    await db.withTransaction(async (client) => {
        // Xóa báo giá cũ nếu có
        await client.query(`DELETE FROM prescription_request_items WHERE request_id = $1`, [id]);

        // Thêm từng dòng báo giá
        for (const item of items) {
            const { prescription_item_id, pharmacy_inventory_id, is_substitute = false, quantity, unit_price, note } = item;

            if (!prescription_item_id) throw new HttpError(400, 'Thiếu thông tin prescription_item_id');
            const qty = Number(quantity);
            const price = Number(unit_price);

            if (isNaN(qty) || qty <= 0) throw new HttpError(400, 'Số lượng báo giá phải lớn hơn 0');
            if (isNaN(price) || price < 0) throw new HttpError(400, 'Đơn giá không hợp lệ');

            // Ràng buộc an toàn kho: Không cho phép báo giá vượt quá số lượng thực tế trong kho
            if (pharmacy_inventory_id) {
                const invCheck = await client.query(
                    `SELECT pi.stock_quantity, md.name AS drug_name, md.unit
                     FROM pharmacy_inventories pi
                     JOIN master_drugs md ON md.id = pi.master_drug_id
                     WHERE pi.id = $1 AND pi.pharmacy_id = $2`,
                    [pharmacy_inventory_id, pharmacyId]
                );
                if (!invCheck.rows.length) {
                    throw new HttpError(400, 'Sản phẩm được chọn không thuộc kho của nhà thuốc');
                }
                const inv = invCheck.rows[0];
                if (qty > inv.stock_quantity) {
                    throw new HttpError(
                        400,
                        `Thuốc "${inv.drug_name}" hiện chỉ còn ${inv.stock_quantity} ${inv.unit || 'đơn vị'} trong kho. Không thể báo giá ${qty} đơn vị!`
                    );
                }
            }

            calculatedSubtotal += (qty * price);

            await client.query(
                `INSERT INTO prescription_request_items (request_id, prescription_item_id, pharmacy_inventory_id, is_substitute, quantity, unit_price, note)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, prescription_item_id, pharmacy_inventory_id || null, Boolean(is_substitute), qty, price, note || null]
            );
        }

        // Cập nhật trạng thái yêu cầu
        await client.query(
            `UPDATE prescription_requests
             SET status = 'QUOTED',
                 pharmacist_user_id = $1,
                 quoted_subtotal = $2,
                 pharmacist_note = $3,
                 quoted_at = CURRENT_TIMESTAMP,
                 expires_at = CURRENT_TIMESTAMP + ($4 || ' hours')::interval
             WHERE id = $5`,
            [req.user.id, calculatedSubtotal, pharmacist_note || null, Number(expires_in_hours) || 24, id]
        );
    });

    // Gửi thông báo realtime cho người mua
    try {
        await notify(rxReq.requested_by_user_id, {
            type: 'PRESCRIPTION_QUOTE',
            title: 'Nhà thuốc đã báo giá đơn thuốc',
            body: `${req.pharmacy.pharmacy_name} vừa gửi báo giá: ${calculatedSubtotal.toLocaleString('vi-VN')}đ. Mời bạn kiểm tra và xác nhận.`,
            data: { request_id: Number(id), prescription_id: rxReq.prescription_id }
        });
    } catch (notifErr) {
        console.error('Không thể gửi thông báo:', notifErr);
    }

    res.json({
        success: true,
        quoted_subtotal: calculatedSubtotal,
        message: 'Đã gửi báo giá thành công đến khách hàng!'
    });
}));

/**
 * POST /api/pharmacy/prescriptions/:id/reject
 * Dược sĩ từ chối báo giá đơn thuốc (ví dụ: hết toàn bộ thuốc, đơn không hợp lệ,...)
 */
router.post('/:id/reject', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;
    const { reject_reason } = req.body;

    if (!reject_reason || !reject_reason.trim()) {
        throw new HttpError(400, 'Vui lòng nhập lý do từ chối đơn thuốc');
    }

    const { rows } = await db.query(
        `UPDATE prescription_requests
         SET status = 'REJECTED',
             reject_reason = $1,
             pharmacist_user_id = $2
         WHERE id = $3 AND pharmacy_id = $4
         RETURNING *`,
        [reject_reason.trim(), req.user.id, id, pharmacyId]
    );

    if (!rows.length) throw new HttpError(404, 'Không tìm thấy yêu cầu đơn thuốc');

    // Bắn thông báo cho khách hàng
    try {
        await notify(rows[0].requested_by_user_id, {
            type: 'PRESCRIPTION_QUOTE',
            title: 'Đơn thuốc không thể phục vụ',
            body: `Nhà thuốc ${req.pharmacy.pharmacy_name} không thể báo giá đơn này: ${reject_reason.trim()}`,
            data: { request_id: Number(id) }
        });
    } catch (err) {
        console.error('Lỗi bắn thông báo:', err);
    }

    res.json({ success: true, message: 'Đã từ chối tiếp nhận đơn thuốc' });
}));

/**
 * POST /api/pharmacy/prescriptions/mock-seed
 * Endpoint hỗ trợ demo: Tự động tạo 1 yêu cầu đơn thuốc gửi tới nhà thuốc hiện tại
 */
router.post('/mock-seed', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;

    // Tìm một user đóng vai trò người mua (ví dụ user Nam id=2 hoặc user bất kỳ có role BUYER)
    const buyerRes = await db.query(`SELECT id, full_name, phone FROM users WHERE role = 'BUYER' LIMIT 1`);
    if (!buyerRes.rows.length) throw new HttpError(400, 'Không tìm thấy tài khoản người mua trong hệ thống');
    const buyer = buyerRes.rows[0];

    // Tạo đơn thuốc mẫu
    const rxRes = await db.query(
        `INSERT INTO prescriptions (
            patient_user_id, uploaded_by_user_id, source, patient_name_on_rx,
            facility_name_raw, prescriber_name_raw, diagnosis,
            prescription_image_url, ai_validation_status
        ) VALUES (
            $1, $1, 'UPLOAD_IMAGE', $2, 'Bệnh viện Bạch Mai - Khoa Nội',
            'BS. CKII Hoàng Minh Tuấn', 'Viêm họng cấp, Tăng huyết áp độ 1',
            'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80',
            'APPROVED'
        ) RETURNING id`,
        [buyer.id, buyer.full_name]
    );
    const newRxId = rxRes.rows[0].id;

    // Thêm các thuốc trong đơn:
    // Thuốc 1: Amoxicillin 500mg (master_drug_id = 1)
    await db.query(
        `INSERT INTO prescription_items (prescription_id, master_drug_id, drug_name_raw, dosage, quantity, duration_days, usage_instructions)
         VALUES ($1, 1, 'Amoxicillin 500mg', '1 viên', 20, 5, 'Uống 1 viên sau ăn sáng, 1 viên sau ăn tối')`,
        [newRxId]
    );
    // Thuốc 2: Panadol Extra (master_drug_id = 7)
    await db.query(
        `INSERT INTO prescription_items (prescription_id, master_drug_id, drug_name_raw, dosage, quantity, duration_days, usage_instructions)
         VALUES ($1, 7, 'Panadol Extra', '1 viên', 10, 5, 'Uống khi sốt trên 38.5 độ hoặc đau đầu, cách nhau tối thiểu 4-6 giờ')`,
        [newRxId]
    );

    // Gửi yêu cầu tới nhà thuốc hiện tại
    const reqRes = await db.query(
        `INSERT INTO prescription_requests (prescription_id, pharmacy_id, requested_by_user_id, status)
         VALUES ($1, $2, $3, 'SENT')
         ON CONFLICT (prescription_id, pharmacy_id) DO UPDATE SET status = 'SENT'
         RETURNING id`,
        [newRxId, pharmacyId, buyer.id]
    );

    res.json({
        success: true,
        request_id: reqRes.rows[0].id,
        prescription_id: newRxId,
        message: 'Đã tạo thành công đơn thuốc mẫu gửi tới nhà thuốc của bạn!'
    });
}));

module.exports = router;
