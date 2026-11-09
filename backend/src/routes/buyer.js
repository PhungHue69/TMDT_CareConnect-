/*
 * API cho Người mua (dùng chung bởi trang Mua thuốc và Family Care). Mount tại /api/buyer, đã qua requireAuth.
 * Mọi giao dịch (đơn hàng, đơn thuốc, ca khám, lịch phòng khám) ghi vào PostgreSQL để
 * Nhà thuốc (TV4), Bác sĩ (TV3) và Family Care (TV1) cùng nhìn thấy.
 *
 * Trang Mua thuốc dùng id của SQLite (Python); bảng pharmacies / master_drugs có cột shop_ref
 * để khớp (xem migration 030_shop_catalog.sql). Các API nhận *_ref là id phía trang Mua thuốc.
 */
const router = require('express').Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { notify } = require('../services/notifications');
const { assertCanManage } = require('../services/family');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'frontend', 'uploads', 'prescriptions');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const GATEWAYS = ['VNPAY', 'MOMO', 'ZALOPAY', 'VIETQR', 'CARD', 'COD'];
const MODES = ['CHAT', 'AUDIO', 'VIDEO'];

// ------------------------------------------------------------------ helpers

// Người nhận là chính mình, hoặc người thân mình được quyền đặt thuốc hộ
async function resolveRecipient(me, recipientId) {
    const id = Number(recipientId) || me;
    await assertCanManage(me, id, 'order_for');
    const { rows } = await db.query('SELECT id, full_name, phone FROM users WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy người nhận');
    return rows[0];
}

// Địa chỉ giao: của mình hoặc của người nhận
async function resolveAddress(me, recipientId, addressId) {
    const { rows } = await db.query(
        `SELECT * FROM user_addresses WHERE id = $1 AND user_id IN ($2, $3)`,
        [addressId, me, recipientId]
    );
    if (!rows[0]) throw new HttpError(400, 'Vui lòng chọn địa chỉ nhận thuốc');
    return rows[0];
}

async function commissionRates(client) {
    const { rows } = await client.query(
        `SELECT DISTINCT ON (rule_key) rule_key, rate FROM commission_rules
         WHERE effective_from <= CURRENT_DATE ORDER BY rule_key, effective_from DESC`
    );
    return Object.fromEntries(rows.map((r) => [r.rule_key, Number(r.rate)]));
}

function distanceKm(lat1, lng1, lat2, lng2) {
    const rad = (d) => (Number(d) * Math.PI) / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
        + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Phí giao hỏa tốc mẫu: 15.000đ cho 3km đầu, thêm 4.000đ mỗi km, tối đa 60.000đ
function shippingFee(km) {
    return Math.min(60000, 15000 + Math.max(0, Math.ceil(km - 3)) * 4000);
}

function orderCode() {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `CC-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function paymentFields(gateway) {
    const g = GATEWAYS.includes(gateway) ? gateway : 'VNPAY';
    return g === 'COD'
        ? { gateway: 'COD', method: 'COD', paymentStatus: 'PENDING', paymentTxnStatus: 'PENDING' }
        : { gateway: g, method: 'ONLINE_ESCROW', paymentStatus: 'HOLDING_ESCROW', paymentTxnStatus: 'SUCCESS' };
}

async function pharmacyStaffIds(pharmacyId) {
    const { rows } = await db.query(
        'SELECT user_id FROM pharmacy_staff WHERE pharmacy_id = $1 AND is_active',
        [pharmacyId]
    );
    return rows.map((r) => r.user_id);
}

async function notifyMany(userIds, payload) {
    for (const id of new Set(userIds)) {
        try { await notify(id, payload); } catch (err) { console.error('notify', err.message); }
    }
}

/**
 * Tạo đơn hàng trong một transaction: dòng đơn, thanh toán (giả lập), tiền tạm giữ Escrow của nhà thuốc.
 * lines: [{ inventory_id, name, product_type, unit_price, quantity, prescription_item_id }]
 */
async function createOrder(client, { me, recipient, address, pharmacy, lines, gateway, note, prescriptionId, requestId }) {
    const rates = await commissionRates(client);
    let subtotal = 0;
    let commission = 0;
    const priced = lines.map((l) => {
        const rate = rates[l.product_type] ?? 0.05;
        const total = Number(l.unit_price) * l.quantity;
        const fee = Math.round(total * rate);
        subtotal += total;
        commission += fee;
        return { ...l, rate, total, fee };
    });
    const km = distanceKm(pharmacy.latitude, pharmacy.longitude, address.latitude, address.longitude);
    const ship = shippingFee(km);
    const pay = paymentFields(gateway);

    const { rows } = await client.query(
        `INSERT INTO orders (order_code, buyer_user_id, recipient_user_id, pharmacy_id, prescription_id, prescription_request_id,
                shipping_address_id, shipping_recipient_name, shipping_recipient_phone, shipping_address_line,
                shipping_latitude, shipping_longitude, subtotal_amount, shipping_fee, total_amount,
                platform_commission_amount, status, payment_method, payment_status, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'PENDING_CONFIRM', $17, $18, $19)
         RETURNING *`,
        [orderCode(), me, recipient.id, pharmacy.id, prescriptionId || null, requestId || null,
            address.id, address.recipient_name, address.recipient_phone, address.address_line,
            address.latitude, address.longitude, subtotal, ship, subtotal + ship,
            commission, pay.method, pay.paymentStatus, note ? String(note).slice(0, 500) : null]
    );
    const order = rows[0];

    for (const l of priced) {
        await client.query(
            `INSERT INTO order_items (order_id, pharmacy_inventory_id, prescription_item_id, product_name_snapshot,
                    product_type_snapshot, unit_price, quantity, total_price, commission_rate, commission_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [order.id, l.inventory_id, l.prescription_item_id || null, l.name, l.product_type,
                l.unit_price, l.quantity, l.total, l.rate, l.fee]
        );
    }
    await client.query(
        `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
         VALUES ($1, NULL, 'PENDING_CONFIRM', $2, 'Người mua đặt đơn')`,
        [order.id, me]
    );
    // Thanh toán giả lập qua cổng: tiền vào tài khoản sàn và tạm giữ (Escrow) tới khi giao xong
    await client.query(
        `INSERT INTO payments (payer_user_id, purpose, order_id, gateway, gateway_txn_id, amount, status, paid_at)
         VALUES ($1, 'ORDER', $2, $3, $4, $5, $6, $7)`,
        [me, order.id, pay.gateway, `DEMO-${order.order_code}`, order.total_amount, pay.paymentTxnStatus,
            pay.paymentTxnStatus === 'SUCCESS' ? new Date() : null]
    );
    if (pay.method === 'ONLINE_ESCROW') {
        await client.query(
            `UPDATE wallets SET pending_escrow_balance = pending_escrow_balance + $1
             WHERE owner_type = 'PHARMACY' AND pharmacy_id = $2`,
            [subtotal - commission, pharmacy.id]
        );
    }
    return { ...order, distance_km: Math.round(km * 10) / 10 };
}

async function notifyNewOrder(order, me, recipient, pharmacyName) {
    const { rows } = await db.query('SELECT full_name FROM users WHERE id = $1', [me]);
    const buyerName = rows[0].full_name;
    await notifyMany(await pharmacyStaffIds(order.pharmacy_id), {
        type: 'ORDER_UPDATE',
        title: 'Có đơn hàng mới',
        body: `${order.order_code} · ${buyerName} · ${Number(order.total_amount).toLocaleString('vi-VN')}đ. Vui lòng xác nhận đơn.`,
        data: { kind: 'NEW_ORDER', order_id: order.id },
    });
    if (recipient.id !== me) {
        await notifyMany([recipient.id], {
            type: 'ORDER_UPDATE',
            title: `${buyerName} vừa đặt thuốc cho bạn`,
            body: `Đơn ${order.order_code} từ ${pharmacyName}, giao tới ${order.shipping_address_line}. Chờ nhà thuốc xác nhận.`,
            data: { kind: 'ORDER_STATUS', order_id: order.id, status: order.status },
        });
    }
}

// ------------------------------------------------------------------ bối cảnh đặt hàng

// Người có thể nhận thuốc (mình + người thân được đặt hộ) và các địa chỉ dùng được
router.get('/context', ah(async (req, res) => {
    const me = req.user.id;
    const people = await db.query(
        `SELECT u.id, u.full_name, u.phone, NULL AS relationship FROM users u WHERE u.id = $1
         UNION ALL
         SELECT u.id, u.full_name, u.phone, fl.relationship
         FROM family_links fl JOIN users u ON u.id = fl.dependent_user_id
         WHERE fl.caregiver_user_id = $1 AND fl.status = 'ACTIVE'
           AND COALESCE((fl.permissions_json->>'order_for')::boolean, TRUE)`,
        [me]
    );
    const ids = people.rows.map((p) => p.id);
    const addresses = await db.query(
        `SELECT id, user_id, label, recipient_name, recipient_phone, address_line, latitude, longitude, is_default
         FROM user_addresses WHERE user_id = ANY($1::bigint[])
         ORDER BY (user_id = $2) DESC, is_default DESC, created_at`,
        [ids, me]
    );
    res.json({ people: people.rows, addresses: addresses.rows });
}));

// ------------------------------------------------------------------ đơn mua trực tiếp (OTC/TPCN)

router.post('/orders', ah(async (req, res) => {
    const me = req.user.id;
    const { pharmacy_ref, items, recipient_user_id, address_id, payment_gateway, note } = req.body;
    if (!Array.isArray(items) || !items.length || items.length > 50) throw new HttpError(400, 'Giỏ hàng trống');
    const qty = new Map();
    for (const it of items) {
        const ref = Number(it.drug_ref);
        const q = Number(it.quantity);
        if (!Number.isInteger(ref) || !Number.isInteger(q) || q < 1 || q > 1000) throw new HttpError(400, 'Số lượng không hợp lệ');
        qty.set(ref, (qty.get(ref) || 0) + q);
    }

    const recipient = await resolveRecipient(me, recipient_user_id);
    const address = await resolveAddress(me, recipient.id, address_id);
    const ph = await db.query('SELECT id, name, latitude, longitude FROM pharmacies WHERE shop_ref = $1', [pharmacy_ref]);
    const pharmacy = ph.rows[0];
    if (!pharmacy) throw new HttpError(404, 'Không tìm thấy nhà thuốc');

    const order = await db.withTransaction(async (client) => {
        const inv = await client.query(
            `SELECT pi.id AS inventory_id, pi.stock_quantity, pi.price, md.shop_ref, md.name, md.product_type
             FROM pharmacy_inventories pi JOIN master_drugs md ON md.id = pi.master_drug_id
             WHERE pi.pharmacy_id = $1 AND md.shop_ref = ANY($2::int[]) AND pi.status = 'IN_STOCK'
             FOR UPDATE OF pi`,
            [pharmacy.id, [...qty.keys()]]
        );
        const byRef = new Map(inv.rows.map((r) => [r.shop_ref, r]));
        const lines = [];
        for (const [ref, q] of qty) {
            const row = byRef.get(ref);
            if (!row) throw new HttpError(409, 'Nhà thuốc không còn bán một sản phẩm trong giỏ');
            // Thuốc kê đơn bắt buộc qua dược sĩ kiểm tra đơn (gửi ảnh đơn hoặc đơn bác sĩ kê)
            if (row.product_type === 'RX') throw new HttpError(403, `"${row.name}" là thuốc kê đơn, cần gửi đơn thuốc để dược sĩ báo giá`);
            if (row.stock_quantity < q) throw new HttpError(409, `"${row.name}" chỉ còn ${row.stock_quantity} sản phẩm`);
            lines.push({ inventory_id: row.inventory_id, name: row.name, product_type: row.product_type, unit_price: Number(row.price), quantity: q });
        }
        return createOrder(client, { me, recipient, address, pharmacy, lines, gateway: payment_gateway, note });
    });

    await notifyNewOrder(order, me, recipient, pharmacy.name);
    res.status(201).json({ order });
}));

// Đơn của tôi: tôi đặt, hoặc người thân đặt cho tôi
router.get('/orders', ah(async (req, res) => {
    const me = req.user.id;
    const { rows } = await db.query(
        `SELECT o.id, o.order_code, o.status, o.payment_method, o.payment_status, o.subtotal_amount, o.shipping_fee,
                o.total_amount, o.created_at, o.shipping_address_line, o.shipping_recipient_name, o.cancel_reason,
                o.buyer_user_id, o.recipient_user_id, o.prescription_id,
                p.name AS pharmacy_name, p.phone AS pharmacy_phone, b.full_name AS buyer_name, r.full_name AS recipient_name,
                s.provider AS ship_provider, s.driver_name, s.driver_phone, s.tracking_code,
                (SELECT json_agg(json_build_object('name', oi.product_name_snapshot, 'quantity', oi.quantity,
                        'unit_price', oi.unit_price, 'product_type', oi.product_type_snapshot) ORDER BY oi.id)
                 FROM order_items oi WHERE oi.order_id = o.id) AS items
         FROM orders o
         JOIN pharmacies p ON p.id = o.pharmacy_id
         JOIN users b ON b.id = o.buyer_user_id
         JOIN users r ON r.id = o.recipient_user_id
         LEFT JOIN shipments s ON s.order_id = o.id
         WHERE o.buyer_user_id = $1 OR o.recipient_user_id = $1
         ORDER BY o.created_at DESC
         LIMIT 50`,
        [me]
    );
    res.json({ orders: rows });
}));

// Người mua hủy khi nhà thuốc chưa xác nhận (hoàn tiền tạm giữ)
router.post('/orders/:id/cancel', ah(async (req, res) => {
    const me = req.user.id;
    const order = await db.withTransaction(async (client) => {
        const { rows } = await client.query(
            `SELECT * FROM orders WHERE id = $1 AND buyer_user_id = $2 FOR UPDATE`,
            [req.params.id, me]
        );
        const o = rows[0];
        if (!o) throw new HttpError(404, 'Không tìm thấy đơn hàng');
        if (o.status !== 'PENDING_CONFIRM') throw new HttpError(409, 'Nhà thuốc đã xác nhận đơn, không thể tự hủy');
        const refunded = o.payment_status === 'HOLDING_ESCROW';
        await client.query(
            `UPDATE orders SET status = 'CANCELLED', cancel_reason = 'Người mua hủy đơn',
                    payment_status = CASE WHEN $2 THEN 'REFUNDED'::payment_status_enum ELSE payment_status END
             WHERE id = $1`,
            [o.id, refunded]
        );
        if (refunded) {
            await client.query(
                `UPDATE wallets SET pending_escrow_balance = GREATEST(0, pending_escrow_balance - $1)
                 WHERE owner_type = 'PHARMACY' AND pharmacy_id = $2`,
                [Number(o.subtotal_amount) - Number(o.platform_commission_amount), o.pharmacy_id]
            );
            await client.query(`UPDATE payments SET status = 'REFUNDED' WHERE order_id = $1`, [o.id]);
        }
        await client.query(
            `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
             VALUES ($1, 'PENDING_CONFIRM', 'CANCELLED', $2, 'Người mua hủy đơn')`,
            [o.id, me]
        );
        return o;
    });
    await notifyMany(await pharmacyStaffIds(order.pharmacy_id), {
        type: 'ORDER_UPDATE',
        title: 'Khách đã hủy đơn',
        body: `Đơn ${order.order_code} đã được người mua hủy trước khi xác nhận.`,
        data: { kind: 'ORDER_CANCELLED', order_id: order.id },
    });
    res.json({ ok: true });
}));

// ------------------------------------------------------------------ đơn thuốc gửi nhà thuốc báo giá

// Gửi AI (dịch vụ Python của trang Mua thuốc) đọc ảnh đơn. Luật chặn kê đơn theo triệu chứng nằm ở đây.
async function analyzeImage(buffer, mime) {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: mime }), `don-thuoc${IMAGE_TYPES[mime]}`);
    let res;
    try {
        res = await fetch(`${AI_SERVICE_URL}/prescriptions/analyze`, { method: 'POST', body: form });
    } catch (err) {
        throw new HttpError(503, 'Dịch vụ AI kiểm tra đơn thuốc chưa chạy. Vui lòng thử lại sau.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status === 429 ? 429 : 502, body.detail || 'AI không kiểm tra được ảnh đơn thuốc');
    return body;
}

function parseImage(dataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new HttpError(400, 'Ảnh đơn thuốc phải là JPG, PNG hoặc WebP');
    const buffer = Buffer.from(m[2], 'base64');
    if (!buffer.length) throw new HttpError(400, 'Ảnh rỗng');
    if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'Ảnh vượt quá 5MB');
    return { mime: m[1], buffer };
}

async function createRequest(prescriptionId, pharmacyId, me) {
    const { rows } = await db.query(
        `INSERT INTO prescription_requests (prescription_id, pharmacy_id, requested_by_user_id, status)
         VALUES ($1, $2, $3, 'SENT')
         ON CONFLICT (prescription_id, pharmacy_id) DO UPDATE
             SET status = 'SENT', quoted_subtotal = NULL, reject_reason = NULL, created_at = now()
             WHERE prescription_requests.status IN ('REJECTED', 'EXPIRED', 'CANCELLED')
         RETURNING *`,
        [prescriptionId, pharmacyId, me]
    );
    if (!rows[0]) throw new HttpError(409, 'Đơn thuốc này đã được gửi tới nhà thuốc và đang chờ xử lý');
    return rows[0];
}

async function notifyNewRequest(request, pharmacyName, me) {
    const { rows } = await db.query('SELECT full_name FROM users WHERE id = $1', [me]);
    await notifyMany(await pharmacyStaffIds(request.pharmacy_id), {
        type: 'PRESCRIPTION_QUOTE',
        title: 'Có đơn thuốc mới cần báo giá',
        body: `${rows[0].full_name} vừa gửi đơn thuốc tới ${pharmacyName}.`,
        data: { kind: 'NEW_PRESCRIPTION_REQUEST', request_id: request.id },
    });
}

/*
 * Gửi đơn thuốc cho một nhà thuốc báo giá. Hai cách:
 *  - Ảnh đơn: { pharmacy_ref, image_data_url, patient_user_id } → AI kiểm tra, đọc tên thuốc
 *  - Đơn bác sĩ kê trên CareConnect: { pharmacy_ref | pharmacy_id, prescription_id }
 */
router.post('/prescription-requests', ah(async (req, res) => {
    const me = req.user.id;
    const { pharmacy_ref, pharmacy_id, image_data_url, prescription_id, patient_user_id } = req.body;
    const ph = await db.query(
        'SELECT id, name FROM pharmacies WHERE ($1::int IS NOT NULL AND shop_ref = $1) OR ($1::int IS NULL AND id = $2)',
        [pharmacy_ref ?? null, pharmacy_id ?? null]
    );
    const pharmacy = ph.rows[0];
    if (!pharmacy) throw new HttpError(404, 'Không tìm thấy nhà thuốc');

    if (prescription_id) {
        const { rows } = await db.query(
            `SELECT id, patient_user_id, valid_until, is_fully_dispensed FROM prescriptions
             WHERE id = $1 AND source = 'E_PRESCRIPTION'`,
            [prescription_id]
        );
        const rx = rows[0];
        if (!rx) throw new HttpError(404, 'Không tìm thấy đơn thuốc');
        await assertCanManage(me, rx.patient_user_id, 'order_for');
        if (rx.is_fully_dispensed) throw new HttpError(409, 'Đơn thuốc này đã mua đủ số lượng');
        if (rx.valid_until && new Date(rx.valid_until) < new Date(new Date().toDateString())) {
            throw new HttpError(409, 'Đơn thuốc đã hết hạn, vui lòng khám lại để được kê đơn mới');
        }
        const request = await createRequest(rx.id, pharmacy.id, me);
        await notifyNewRequest(request, pharmacy.name, me);
        return res.status(201).json({ request, pharmacy_name: pharmacy.name });
    }

    const patient = await resolveRecipient(me, patient_user_id);
    const { mime, buffer } = parseImage(image_data_url);
    const ai = await analyzeImage(buffer, mime);
    if (ai.status === 'REJECTED_NOT_RX') {
        // AI Guardrail: ảnh ghi triệu chứng / nhờ kê đơn → không chuyển cho dược sĩ, gợi ý khám bác sĩ
        return res.status(422).json({ error: 'Đây không phải đơn thuốc. Dược sĩ không được chẩn đoán hay kê đơn, hãy tư vấn bác sĩ.', redirect: 'DOCTOR' });
    }
    if (ai.status !== 'APPROVED' || !Array.isArray(ai.items) || !ai.items.length) {
        throw new HttpError(422, ai.message || 'Không đọc được đơn thuốc. Vui lòng chụp lại rõ hơn.');
    }

    const refs = ai.items.map((i) => i.matched_drug_id).filter(Boolean);
    const drugs = await db.query('SELECT id, shop_ref FROM master_drugs WHERE shop_ref = ANY($1::int[])', [refs]);
    const drugByRef = new Map(drugs.rows.map((d) => [d.shop_ref, d.id]));

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = crypto.randomBytes(24).toString('hex') + IMAGE_TYPES[mime];
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    const imageUrl = `/uploads/prescriptions/${filename}`;

    let request;
    try {
        request = await db.withTransaction(async (client) => {
            const rx = await client.query(
                `INSERT INTO prescriptions (patient_user_id, uploaded_by_user_id, source, patient_name_on_rx,
                        prescription_image_url, ocr_raw_text, ai_validation_status)
                 VALUES ($1, $2, 'UPLOAD_IMAGE', $3, $4, $5, 'APPROVED') RETURNING id`,
                [patient.id, me, patient.full_name, imageUrl, ai.ocr_raw_text || null]
            );
            const rxId = rx.rows[0].id;
            for (const it of ai.items.slice(0, 30)) {
                await client.query(
                    `INSERT INTO prescription_items (prescription_id, master_drug_id, drug_name_raw, dosage, quantity)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [rxId, drugByRef.get(it.matched_drug_id) || null, String(it.name || 'Thuốc chưa rõ tên').slice(0, 255),
                        it.dosage ? String(it.dosage).slice(0, 100) : null, Math.max(1, Math.round(Number(it.quantity) || 1))]
                );
            }
            await client.query(
                `INSERT INTO prescription_ai_logs (prescription_id, model_name, input_payload, ai_response_json, detected_intent)
                 VALUES ($1, $2, $3, $4, 'VALID_RX')`,
                [rxId, process.env.GEMINI_MODEL || 'gemini', `image:${mime}:${buffer.length}B`, ai]
            );
            const r = await client.query(
                `INSERT INTO prescription_requests (prescription_id, pharmacy_id, requested_by_user_id, status)
                 VALUES ($1, $2, $3, 'SENT') RETURNING *`,
                [rxId, pharmacy.id, me]
            );
            return r.rows[0];
        });
    } catch (err) {
        fs.rmSync(path.join(UPLOAD_DIR, filename), { force: true });
        throw err;
    }
    await notifyNewRequest(request, pharmacy.name, me);
    res.status(201).json({ request, pharmacy_name: pharmacy.name, items: ai.items });
}));

// Các đơn thuốc tôi đã gửi (kèm báo giá nếu có)
router.get('/prescription-requests', ah(async (req, res) => {
    const me = req.user.id;
    const { rows } = await db.query(
        `SELECT pr.id, pr.status, pr.quoted_subtotal, pr.pharmacist_note, pr.reject_reason, pr.quoted_at, pr.expires_at,
                pr.created_at, pr.prescription_id, ph.name AS pharmacy_name, ph.phone AS pharmacy_phone,
                p.source, p.prescription_image_url, p.diagnosis, pu.id AS patient_user_id, pu.full_name AS patient_name,
                (SELECT o.order_code FROM orders o WHERE o.prescription_request_id = pr.id ORDER BY o.id DESC LIMIT 1) AS order_code,
                (SELECT json_agg(json_build_object('name', pi.drug_name_raw, 'dosage', pi.dosage, 'quantity', pi.quantity) ORDER BY pi.id)
                 FROM prescription_items pi WHERE pi.prescription_id = p.id) AS prescribed,
                (SELECT json_agg(json_build_object('name', COALESCE(md.name, pi.drug_name_raw), 'quantity', q.quantity,
                        'unit_price', q.unit_price, 'is_substitute', q.is_substitute, 'note', q.note,
                        'available', q.pharmacy_inventory_id IS NOT NULL) ORDER BY q.id)
                 FROM prescription_request_items q
                 JOIN prescription_items pi ON pi.id = q.prescription_item_id
                 LEFT JOIN pharmacy_inventories inv ON inv.id = q.pharmacy_inventory_id
                 LEFT JOIN master_drugs md ON md.id = inv.master_drug_id
                 WHERE q.request_id = pr.id) AS quote
         FROM prescription_requests pr
         JOIN prescriptions p ON p.id = pr.prescription_id
         JOIN pharmacies ph ON ph.id = pr.pharmacy_id
         JOIN users pu ON pu.id = p.patient_user_id
         WHERE pr.requested_by_user_id = $1 OR p.patient_user_id = $1
         ORDER BY pr.created_at DESC
         LIMIT 50`,
        [me]
    );
    res.json({ requests: rows });
}));

// Đồng ý báo giá → tạo đơn hàng (chỉ các dòng nhà thuốc còn hàng)
router.post('/prescription-requests/:id/accept', ah(async (req, res) => {
    const me = req.user.id;
    const { address_id, payment_gateway, note } = req.body;
    const { rows } = await db.query(
        `SELECT pr.*, p.patient_user_id, ph.name AS pharmacy_name, ph.latitude, ph.longitude
         FROM prescription_requests pr
         JOIN prescriptions p ON p.id = pr.prescription_id
         JOIN pharmacies ph ON ph.id = pr.pharmacy_id
         WHERE pr.id = $1 AND pr.requested_by_user_id = $2`,
        [req.params.id, me]
    );
    const rq = rows[0];
    if (!rq) throw new HttpError(404, 'Không tìm thấy đơn thuốc đã gửi');
    if (rq.status !== 'QUOTED') throw new HttpError(409, 'Nhà thuốc chưa báo giá hoặc đơn đã được xử lý');
    if (rq.expires_at && new Date(rq.expires_at) < new Date()) throw new HttpError(409, 'Báo giá đã hết hạn, hãy gửi lại đơn');

    const recipient = await resolveRecipient(me, rq.patient_user_id);
    const address = await resolveAddress(me, recipient.id, address_id);
    const pharmacy = { id: rq.pharmacy_id, name: rq.pharmacy_name, latitude: rq.latitude, longitude: rq.longitude };

    const order = await db.withTransaction(async (client) => {
        const lock = await client.query(
            `UPDATE prescription_requests SET status = 'ACCEPTED' WHERE id = $1 AND status = 'QUOTED' RETURNING id`,
            [rq.id]
        );
        if (!lock.rows[0]) throw new HttpError(409, 'Báo giá đã được xử lý');
        const q = await client.query(
            `SELECT q.pharmacy_inventory_id AS inventory_id, q.prescription_item_id, q.quantity, q.unit_price,
                    md.name, md.product_type
             FROM prescription_request_items q
             JOIN pharmacy_inventories inv ON inv.id = q.pharmacy_inventory_id
             JOIN master_drugs md ON md.id = inv.master_drug_id
             WHERE q.request_id = $1 AND q.quantity > 0`,
            [rq.id]
        );
        if (!q.rows.length) throw new HttpError(409, 'Báo giá không có sản phẩm nào còn hàng');
        const lines = q.rows.map((l) => ({ ...l, unit_price: Number(l.unit_price) }));
        return createOrder(client, {
            me, recipient, address, pharmacy, lines, gateway: payment_gateway, note,
            prescriptionId: rq.prescription_id, requestId: rq.id,
        });
    });
    await notifyNewOrder(order, me, recipient, pharmacy.name);
    res.status(201).json({ order });
}));

router.post('/prescription-requests/:id/cancel', ah(async (req, res) => {
    const { rows } = await db.query(
        `UPDATE prescription_requests SET status = 'CANCELLED'
         WHERE id = $1 AND requested_by_user_id = $2 AND status IN ('SENT', 'QUOTED') RETURNING pharmacy_id`,
        [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new HttpError(409, 'Không thể hủy đơn thuốc này');
    res.json({ ok: true });
}));

// Đơn bác sĩ đã kê (của tôi và người thân), để gửi nhà thuốc báo giá
router.get('/prescriptions', ah(async (req, res) => {
    const me = req.user.id;
    const { rows } = await db.query(
        `SELECT p.id, p.diagnosis, p.issued_date, p.valid_until, p.is_fully_dispensed, p.consultation_id,
                pu.id AS patient_user_id, pu.full_name AS patient_name, du.full_name AS doctor_name, pp.specialty,
                (SELECT json_agg(json_build_object('name', i.drug_name_raw, 'dosage', i.dosage, 'quantity', i.quantity,
                        'usage', i.usage_instructions, 'duration_days', i.duration_days) ORDER BY i.id)
                 FROM prescription_items i WHERE i.prescription_id = p.id) AS items
         FROM prescriptions p
         JOIN users pu ON pu.id = p.patient_user_id
         LEFT JOIN professional_profiles pp ON pp.id = p.doctor_profile_id
         LEFT JOIN users du ON du.id = pp.user_id
         WHERE p.source = 'E_PRESCRIPTION'
           AND (p.patient_user_id = $1 OR p.patient_user_id IN (
                SELECT dependent_user_id FROM family_links WHERE caregiver_user_id = $1 AND status = 'ACTIVE'))
         ORDER BY p.created_at DESC
         LIMIT 30`,
        [me]
    );
    res.json({ prescriptions: rows });
}));

// Nhà thuốc gần một vị trí, ưu tiên nơi còn nhiều thuốc trong đơn
router.get('/prescriptions/:id/pharmacies', ah(async (req, res) => {
    const me = req.user.id;
    const { rows: rx } = await db.query('SELECT id, patient_user_id FROM prescriptions WHERE id = $1', [req.params.id]);
    if (!rx[0]) throw new HttpError(404, 'Không tìm thấy đơn thuốc');
    await assertCanManage(me, rx[0].patient_user_id, 'order_for');
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'Thiếu vị trí để tìm nhà thuốc');
    const { rows } = await db.query(
        `SELECT ph.id, ph.name, ph.address, ph.phone,
                ROUND((ST_Distance(ph.geom::geography, ST_MakePoint($2, $3)::geography) / 1000)::numeric, 1) AS distance_km,
                (SELECT COUNT(*)::int FROM prescription_items pi
                 JOIN pharmacy_inventories inv ON inv.master_drug_id = pi.master_drug_id AND inv.pharmacy_id = ph.id
                 WHERE pi.prescription_id = $1 AND inv.stock_quantity > 0) AS in_stock,
                (SELECT COUNT(*)::int FROM prescription_items WHERE prescription_id = $1) AS total_items
         FROM pharmacies ph
         WHERE ph.verification_status = 'APPROVED'
         ORDER BY ph.geom::geography <-> ST_MakePoint($2, $3)::geography
         LIMIT 10`,
        [req.params.id, lng, lat]
    );
    rows.sort((a, b) => b.in_stock - a.in_stock || a.distance_km - b.distance_km);
    res.json({ pharmacies: rows });
}));

// ------------------------------------------------------------------ khám bác sĩ online

router.get('/doctors', ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const { rows } = await db.query(
        `SELECT pp.id, u.full_name, pp.avatar_url, pp.specialty, pp.workplace, pp.years_of_experience, pp.bio,
                pp.consultation_fee, pp.consultation_modes::text[] AS consultation_modes, pp.is_online,
                pp.rating, pp.rating_count
         FROM professional_profiles pp JOIN users u ON u.id = pp.user_id
         WHERE pp.professional_type = 'DOCTOR' AND pp.verification_status = 'APPROVED' AND u.is_active
           AND ($1 = '' OR u.full_name ILIKE '%' || $1 || '%' OR pp.specialty ILIKE '%' || $1 || '%')
         ORDER BY pp.is_online DESC, pp.rating DESC NULLS LAST, u.full_name
         LIMIT 50`,
        [q]
    );
    res.json({ doctors: rows });
}));

// Đặt khám: trả phí (giả lập), tiền tạm giữ tới khi bác sĩ khám xong và kê đơn
router.post('/consultations', ah(async (req, res) => {
    const me = req.user.id;
    const { doctor_profile_id, patient_user_id, mode, symptom_description, payment_gateway } = req.body;
    const symptom = String(symptom_description || '').trim();
    if (symptom.length < 5) throw new HttpError(400, 'Vui lòng mô tả triệu chứng để bác sĩ chuẩn bị');
    const patient = await resolveRecipient(me, patient_user_id);
    const { rows: docs } = await db.query(
        `SELECT pp.id, pp.user_id, pp.consultation_fee, pp.consultation_modes::text[] AS modes, u.full_name
         FROM professional_profiles pp JOIN users u ON u.id = pp.user_id
         WHERE pp.id = $1 AND pp.professional_type = 'DOCTOR' AND pp.verification_status = 'APPROVED'`,
        [doctor_profile_id]
    );
    const doc = docs[0];
    if (!doc) throw new HttpError(404, 'Không tìm thấy bác sĩ');
    const m = MODES.includes(mode) ? mode : 'CHAT';
    if (doc.modes && !doc.modes.includes(m)) throw new HttpError(400, 'Bác sĩ không nhận hình thức khám này');
    if (payment_gateway === 'COD') throw new HttpError(400, 'Phí khám cần thanh toán trước');

    const consultation = await db.withTransaction(async (client) => {
        const rates = await commissionRates(client);
        const fee = Number(doc.consultation_fee) || 0;
        const rate = rates.CONSULTATION ?? 0.2;
        const { rows } = await client.query(
            `INSERT INTO consultations (booker_user_id, patient_user_id, doctor_profile_id, mode, fee_amount,
                    commission_rate, commission_amount, payment_status, status, symptom_description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'HOLDING_ESCROW', 'WAITING', $8) RETURNING *`,
            [me, patient.id, doc.id, m, fee, rate, Math.round(fee * rate), symptom.slice(0, 2000)]
        );
        const pay = paymentFields(payment_gateway);
        await client.query(
            `INSERT INTO payments (payer_user_id, purpose, consultation_id, gateway, gateway_txn_id, amount, status, paid_at)
             VALUES ($1, 'CONSULTATION', $2, $3, $4, $5, 'SUCCESS', now())`,
            [me, rows[0].id, pay.gateway, `DEMO-KHAM-${rows[0].id}`, fee]
        );
        return rows[0];
    });

    await notifyMany([doc.user_id], {
        type: 'CONSULTATION_UPDATE',
        title: 'Có ca khám mới',
        body: `${patient.full_name}: "${symptom.slice(0, 120)}"`,
        data: { kind: 'NEW_CONSULTATION', consultation_id: consultation.id },
    });
    if (patient.id !== me) {
        const { rows } = await db.query('SELECT full_name FROM users WHERE id = $1', [me]);
        await notifyMany([patient.id], {
            type: 'CONSULTATION_UPDATE',
            title: `${rows[0].full_name} đã đặt khám cho bạn`,
            body: `Bác sĩ ${doc.full_name} sẽ liên hệ với bạn để khám ${m === 'VIDEO' ? 'qua video' : m === 'AUDIO' ? 'qua điện thoại' : 'qua tin nhắn'}.`,
            data: { kind: 'CONSULTATION_BOOKED', consultation_id: consultation.id },
        });
    }
    res.status(201).json({ consultation, doctor_name: doc.full_name });
}));

router.get('/consultations', ah(async (req, res) => {
    const me = req.user.id;
    const { rows } = await db.query(
        `SELECT c.id, c.mode, c.status, c.fee_amount, c.payment_status, c.symptom_description, c.diagnosis,
                c.created_at, c.started_at, c.ended_at, c.patient_user_id, pu.full_name AS patient_name,
                du.full_name AS doctor_name, du.phone AS doctor_phone, pp.specialty,
                p.id AS prescription_id, p.valid_until,
                (SELECT json_agg(json_build_object('name', i.drug_name_raw, 'dosage', i.dosage, 'quantity', i.quantity,
                        'usage', i.usage_instructions) ORDER BY i.id)
                 FROM prescription_items i WHERE i.prescription_id = p.id) AS items
         FROM consultations c
         JOIN users pu ON pu.id = c.patient_user_id
         JOIN professional_profiles pp ON pp.id = c.doctor_profile_id
         JOIN users du ON du.id = pp.user_id
         LEFT JOIN prescriptions p ON p.consultation_id = c.id
         WHERE c.booker_user_id = $1 OR c.patient_user_id = $1
         ORDER BY c.created_at DESC
         LIMIT 30`,
        [me]
    );
    res.json({ consultations: rows });
}));

// Hủy khi bác sĩ chưa bắt đầu khám → hoàn phí
router.post('/consultations/:id/cancel', ah(async (req, res) => {
    const { rows } = await db.query(
        `UPDATE consultations SET status = 'CANCELLED', payment_status = 'REFUNDED', cancel_reason = 'Người bệnh hủy'
         WHERE id = $1 AND booker_user_id = $2 AND status = 'WAITING' RETURNING id`,
        [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new HttpError(409, 'Bác sĩ đã bắt đầu khám, không thể hủy');
    await db.query(`UPDATE payments SET status = 'REFUNDED' WHERE consultation_id = $1`, [rows[0].id]);
    res.json({ ok: true });
}));

// ------------------------------------------------------------------ đặt lịch phòng khám

router.get('/clinics', ah(async (req, res) => {
    const { rows } = await db.query(
        `SELECT c.id, c.name, c.address, c.phone,
                (SELECT json_agg(json_build_object('name', u.full_name, 'specialty', pp.specialty))
                 FROM doctor_clinic_assignments a
                 JOIN professional_profiles pp ON pp.id = a.doctor_profile_id
                 JOIN users u ON u.id = pp.user_id
                 WHERE a.clinic_id = c.id) AS doctors
         FROM clinics c WHERE c.verification_status = 'APPROVED' ORDER BY c.name`
    );
    res.json({ clinics: rows });
}));

router.post('/clinic-bookings', ah(async (req, res) => {
    const me = req.user.id;
    const { clinic_id, patient_user_id, booking_time, symptom_note } = req.body;
    const patient = await resolveRecipient(me, patient_user_id);
    const time = new Date(booking_time);
    if (Number.isNaN(time.getTime()) || time < new Date()) throw new HttpError(400, 'Vui lòng chọn thời gian khám trong tương lai');
    const clinic = await db.query(`SELECT id, name, owner_user_id FROM clinics WHERE id = $1 AND verification_status = 'APPROVED'`, [clinic_id]);
    if (!clinic.rows[0]) throw new HttpError(404, 'Không tìm thấy phòng khám');
    const { rows } = await db.query(
        `INSERT INTO clinic_bookings (buyer_user_id, patient_user_id, clinic_id, booking_time, symptom_note)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [me, patient.id, clinic.rows[0].id, time, symptom_note ? String(symptom_note).slice(0, 1000) : null]
    );
    await notifyMany([clinic.rows[0].owner_user_id], {
        type: 'SYSTEM',
        title: 'Có lịch khám mới',
        body: `${patient.full_name} đặt lịch lúc ${time.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
        data: { kind: 'CLINIC_BOOKING', booking_id: rows[0].id },
    });
    res.status(201).json({ booking: rows[0], clinic_name: clinic.rows[0].name });
}));

router.get('/clinic-bookings', ah(async (req, res) => {
    const me = req.user.id;
    const { rows } = await db.query(
        `SELECT b.id, b.booking_time, b.status, b.symptom_note, b.created_at, c.name AS clinic_name, c.address, c.phone,
                pu.full_name AS patient_name
         FROM clinic_bookings b JOIN clinics c ON c.id = b.clinic_id JOIN users pu ON pu.id = b.patient_user_id
         WHERE b.buyer_user_id = $1 OR b.patient_user_id = $1
         ORDER BY b.booking_time DESC LIMIT 30`,
        [me]
    );
    res.json({ bookings: rows });
}));

router.post('/clinic-bookings/:id/cancel', ah(async (req, res) => {
    const { rows } = await db.query(
        `UPDATE clinic_bookings SET status = 'CANCELLED' WHERE id = $1 AND buyer_user_id = $2 AND status = 'CONFIRMED' RETURNING id`,
        [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new HttpError(409, 'Không thể hủy lịch khám này');
    res.json({ ok: true });
}));

module.exports = router;
