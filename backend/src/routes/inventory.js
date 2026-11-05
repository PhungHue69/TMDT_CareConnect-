const router = require('express').Router();
const db = require('../db');
const { ah, HttpError } = require('../utils/http');

/**
 * GET /api/pharmacy/inventory
 * Lấy danh sách tồn kho của nhà thuốc với bộ lọc, tìm kiếm và phân trang
 */
router.get('/', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { q, category_id, product_type, status, alert, page = 1, limit = 50 } = req.query;

    const conditions = ['pi.pharmacy_id = $1'];
    const params = [pharmacyId];

    // Tìm kiếm theo tên thuốc, hoạt chất hoặc số đăng ký
    if (q && q.trim()) {
        params.push(`%${q.trim().toLowerCase()}%`);
        conditions.push(`(
            LOWER(md.name) LIKE $${params.length} OR 
            LOWER(COALESCE(md.active_ingredient, '')) LIKE $${params.length} OR
            LOWER(COALESCE(md.registration_number, '')) LIKE $${params.length}
        )`);
    }

    // Lọc theo nhóm danh mục
    if (category_id) {
        params.push(Number(category_id));
        conditions.push(`md.category_id = $${params.length}`);
    }

    // Lọc theo phân loại sản phẩm (RX, OTC, SUPPLEMENT, DEVICE, COSMETIC)
    if (product_type) {
        params.push(product_type);
        conditions.push(`md.product_type = $${params.length}`);
    }

    // Lọc theo trạng thái kho (IN_STOCK, OUT_OF_STOCK, DISCONTINUED)
    if (status) {
        params.push(status);
        conditions.push(`pi.status = $${params.length}`);
    }

    // Lọc theo cảnh báo đặc biệt
    if (alert === 'low_stock') {
        conditions.push(`pi.stock_quantity <= 10`);
    } else if (alert === 'expiring') {
        conditions.push(`pi.nearest_expiry_date IS NOT NULL AND pi.nearest_expiry_date <= CURRENT_DATE + INTERVAL '90 days'`);
    }

    const whereClause = conditions.join(' AND ');

    // Đếm tổng số lượng bản ghi thỏa mãn điều kiện
    const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM pharmacy_inventories pi
        JOIN master_drugs md ON md.id = pi.master_drug_id
        WHERE ${whereClause}
    `;
    const countRes = await db.query(countQuery, params);
    const total = countRes.rows[0].total;

    // Lấy dữ liệu phân trang
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const listQuery = `
        SELECT pi.id, pi.pharmacy_id, pi.master_drug_id, pi.stock_quantity,
               pi.price, pi.nearest_expiry_date, pi.status, pi.updated_at,
               md.name AS drug_name, md.active_ingredient, md.strength,
               md.dosage_form, md.product_type, md.is_prescription_only,
               md.unit, md.reference_price, md.image_url, md.registration_number,
               dc.category_name
        FROM pharmacy_inventories pi
        JOIN master_drugs md ON md.id = pi.master_drug_id
        LEFT JOIN drug_categories dc ON dc.id = md.category_id
        WHERE ${whereClause}
        ORDER BY pi.status ASC, pi.stock_quantity ASC, md.name ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const listRes = await db.query(listQuery, params);

    // Lấy thống kê tổng quan của kho
    const statsQuery = `
        SELECT 
            COUNT(*)::int AS total_items,
            COUNT(*) FILTER (WHERE status = 'IN_STOCK' AND stock_quantity > 0)::int AS in_stock,
            COUNT(*) FILTER (WHERE stock_quantity <= 10 AND status = 'IN_STOCK')::int AS low_stock,
            COUNT(*) FILTER (WHERE stock_quantity = 0 OR status = 'OUT_OF_STOCK')::int AS out_of_stock,
            COUNT(*) FILTER (WHERE nearest_expiry_date IS NOT NULL AND nearest_expiry_date <= CURRENT_DATE + INTERVAL '90 days')::int AS expiring_soon
        FROM pharmacy_inventories
        WHERE pharmacy_id = $1
    `;
    const statsRes = await db.query(statsQuery, [pharmacyId]);

    // Lấy danh mục để người dùng lọc
    const categoriesRes = await db.query(`SELECT id, category_name FROM drug_categories ORDER BY id ASC`);

    res.json({
        items: listRes.rows,
        total,
        page: Number(page),
        limit: Number(limit),
        stats: statsRes.rows[0],
        categories: categoriesRes.rows,
    });
}));

/**
 * GET /api/pharmacy/inventory/master-drugs
 * Tìm kiếm trong Dược điển quốc gia (master_drugs) để thêm vào kho
 */
router.get('/master-drugs', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { q, limit = 20 } = req.query;

    let query = `
        SELECT md.id, md.name, md.active_ingredient, md.strength, md.dosage_form,
               md.product_type, md.unit, md.reference_price, md.registration_number,
               dc.category_name,
               pi.id AS inventory_id,
               pi.stock_quantity AS existing_stock,
               pi.price AS existing_price
        FROM master_drugs md
        LEFT JOIN drug_categories dc ON dc.id = md.category_id
        LEFT JOIN pharmacy_inventories pi ON pi.master_drug_id = md.id AND pi.pharmacy_id = $1
    `;
    const params = [pharmacyId];

    if (q && q.trim()) {
        params.push(`%${q.trim().toLowerCase()}%`);
        query += ` WHERE LOWER(md.name) LIKE $2 OR LOWER(COALESCE(md.active_ingredient, '')) LIKE $2 OR LOWER(COALESCE(md.registration_number, '')) LIKE $2 `;
    }

    params.push(Number(limit));
    query += ` ORDER BY md.name ASC LIMIT $${params.length} `;

    const { rows } = await db.query(query, params);
    res.json({ items: rows });
}));

/**
 * POST /api/pharmacy/inventory
 * Nhập thêm thuốc mới từ master_drugs vào kho nhà thuốc
 */
router.post('/', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { master_drug_id, stock_quantity = 0, price, nearest_expiry_date } = req.body;

    if (!master_drug_id) throw new HttpError(400, 'Vui lòng chọn thuốc từ danh mục');
    if (price === undefined || price === null || Number(price) < 0) {
        throw new HttpError(400, 'Giá bán phải lớn hơn hoặc bằng 0');
    }
    if (Number(stock_quantity) < 0) {
        throw new HttpError(400, 'Số lượng tồn kho không được âm');
    }

    // Kiểm tra xem thuốc đã có trong kho chưa
    const existing = await db.query(
        `SELECT id FROM pharmacy_inventories WHERE pharmacy_id = $1 AND master_drug_id = $2`,
        [pharmacyId, master_drug_id]
    );

    let resultRow;
    const status = Number(stock_quantity) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';

    if (existing.rowCount > 0) {
        // Cập nhật thêm số lượng nếu đã có sẵn
        const { rows } = await db.query(
            `UPDATE pharmacy_inventories
             SET stock_quantity = stock_quantity + $1,
                 price = $2,
                 nearest_expiry_date = COALESCE($3, nearest_expiry_date),
                 status = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [Number(stock_quantity), Number(price), nearest_expiry_date || null, status, existing.rows[0].id]
        );
        resultRow = rows[0];
    } else {
        // Thêm mới vào kho
        const { rows } = await db.query(
            `INSERT INTO pharmacy_inventories (pharmacy_id, master_drug_id, stock_quantity, price, nearest_expiry_date, status)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [pharmacyId, master_drug_id, Number(stock_quantity), Number(price), nearest_expiry_date || null, status]
        );
        resultRow = rows[0];
    }

    res.status(201).json({ item: resultRow, message: 'Đã cập nhật kho thành công' });
}));

/**
 * PUT /api/pharmacy/inventory/:id
 * Cập nhật thông tin tồn kho, giá bán, hạn dùng
 */
router.put('/:id', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;
    const { stock_quantity, price, nearest_expiry_date, status } = req.body;

    if (price !== undefined && Number(price) < 0) {
        throw new HttpError(400, 'Giá bán không được âm');
    }
    if (stock_quantity !== undefined && Number(stock_quantity) < 0) {
        throw new HttpError(400, 'Số lượng tồn kho không được âm');
    }

    // Tự động suy ra trạng thái nếu số lượng = 0
    let autoStatus = status;
    if (stock_quantity !== undefined && Number(stock_quantity) === 0 && (!status || status === 'IN_STOCK')) {
        autoStatus = 'OUT_OF_STOCK';
    } else if (stock_quantity !== undefined && Number(stock_quantity) > 0 && status === 'OUT_OF_STOCK') {
        autoStatus = 'IN_STOCK';
    }

    const { rows } = await db.query(
        `UPDATE pharmacy_inventories
         SET stock_quantity = COALESCE($1, stock_quantity),
             price = COALESCE($2, price),
             nearest_expiry_date = $3,
             status = COALESCE($4, status),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND pharmacy_id = $6
         RETURNING *`,
        [
            stock_quantity !== undefined ? Number(stock_quantity) : null,
            price !== undefined ? Number(price) : null,
            nearest_expiry_date !== undefined ? (nearest_expiry_date || null) : null,
            autoStatus || null,
            id,
            pharmacyId
        ]
    );

    if (!rows.length) throw new HttpError(404, 'Không tìm thấy sản phẩm trong kho của bạn');
    res.json({ item: rows[0], message: 'Cập nhật kho thành công' });
}));

/**
 * DELETE /api/pharmacy/inventory/:id
 * Xóa thuốc khỏi kho (hoặc chuyển trạng thái DISCONTINUED)
 */
router.delete('/:id', ah(async (req, res) => {
    const pharmacyId = req.pharmacyId;
    const { id } = req.params;

    const { rowCount } = await db.query(
        `DELETE FROM pharmacy_inventories WHERE id = $1 AND pharmacy_id = $2`,
        [id, pharmacyId]
    );

    if (!rowCount) throw new HttpError(404, 'Không tìm thấy sản phẩm trong kho để xóa');
    res.json({ success: true, message: 'Đã xóa sản phẩm khỏi kho nhà thuốc' });
}));

module.exports = router;
