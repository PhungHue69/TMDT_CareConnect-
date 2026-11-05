// Chuông báo: lưu vào bảng notifications và đẩy realtime tới các tab/máy đang mở (Server-Sent Events)
const db = require('../db');

const clients = new Map(); // userId -> Set<res>

function addClient(userId, res) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(res);
}

function removeClient(userId, res) {
    const set = clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) clients.delete(userId);
}

function push(userId, event, payload) {
    const set = clients.get(Number(userId));
    if (!set) return;
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) res.write(message);
}

/**
 * Gửi một thông báo cho một người dùng.
 * type: notification_type_enum. data.kind cho frontend biết cách hiển thị (RING, MISSED_DOSE, ORDER_STATUS...)
 */
async function notify(userId, { type, title, body = null, data = null }) {
    const { rows } = await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data_json)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, type, title, body, data]
    );
    push(userId, 'notification', rows[0]);
    return rows[0];
}

const ORDER_MESSAGES = {
    CONFIRMED: {
        title: 'Nhà thuốc đã duyệt đơn',
        buyer: (o) => `${o.pharmacy_name} đã duyệt đơn ${o.order_code} gửi cho ${o.recipient_label}.`,
        recipient: (o) => `${o.buyer_name} đã đặt thuốc cho bạn. ${o.pharmacy_name} đã duyệt đơn và đang chuẩn bị giao tới nhà.`,
        self: (o) => `${o.pharmacy_name} đã duyệt đơn ${o.order_code} của bạn.`,
    },
    PREPARING: {
        title: 'Nhà thuốc đang chuẩn bị thuốc',
        buyer: (o) => `${o.pharmacy_name} đang đóng gói đơn ${o.order_code} cho ${o.recipient_label}.`,
        recipient: (o) => `${o.pharmacy_name} đang đóng gói thuốc ${o.buyer_name} đặt cho bạn.`,
        self: (o) => `${o.pharmacy_name} đang đóng gói đơn ${o.order_code}.`,
    },
    SHIPPING: {
        title: 'Thuốc đang được giao',
        buyer: (o) => `Đơn ${o.order_code} đang được giao tới ${o.recipient_label}.`,
        recipient: (o) => `Thuốc từ ${o.pharmacy_name} đang trên đường giao tới nhà bạn. Bạn để ý điện thoại nhé.`,
        self: (o) => `Đơn ${o.order_code} đang được giao tới bạn.`,
    },
    COMPLETED: {
        title: 'Đã giao thuốc thành công',
        buyer: (o) => `${o.recipient_label} đã nhận đơn ${o.order_code}.`,
        recipient: () => 'Bạn đã nhận thuốc. Lịch uống thuốc hiển thị ở màn hình Hôm nay.',
        self: (o) => `Bạn đã nhận đơn ${o.order_code}.`,
    },
    CANCELLED: {
        title: 'Đơn thuốc đã bị hủy',
        buyer: (o) => `Đơn ${o.order_code} gửi cho ${o.recipient_label} đã bị hủy.`,
        recipient: (o) => `Đơn thuốc ${o.buyer_name} đặt cho bạn đã bị hủy.`,
        self: (o) => `Đơn ${o.order_code} đã bị hủy.`,
    },
};

/**
 * Báo cho người mua và người nhận (Bố mẹ) khi đơn đổi trạng thái.
 * Phân hệ Nhà thuốc gọi hàm này sau khi cập nhật orders.status.
 */
async function notifyOrderStatusChange(orderId) {
    const { rows } = await db.query(
        `SELECT o.id, o.order_code, o.status, o.buyer_user_id, o.recipient_user_id,
                p.name AS pharmacy_name, b.full_name AS buyer_name, r.full_name AS recipient_name,
                fl.relationship
         FROM orders o
         JOIN pharmacies p ON p.id = o.pharmacy_id
         JOIN users b ON b.id = o.buyer_user_id
         JOIN users r ON r.id = o.recipient_user_id
         LEFT JOIN family_links fl ON fl.caregiver_user_id = o.buyer_user_id
              AND fl.dependent_user_id = o.recipient_user_id AND fl.status = 'ACTIVE'
         WHERE o.id = $1`,
        [orderId]
    );
    const order = rows[0];
    const messages = order && ORDER_MESSAGES[order.status];
    if (!messages) return;

    order.recipient_label = order.relationship || order.recipient_name;
    const data = { kind: 'ORDER_STATUS', order_id: order.id, status: order.status };

    if (order.buyer_user_id === order.recipient_user_id) {
        await notify(order.buyer_user_id, { type: 'ORDER_UPDATE', title: messages.title, body: messages.self(order), data });
        return;
    }
    await notify(order.recipient_user_id, { type: 'ORDER_UPDATE', title: messages.title, body: messages.recipient(order), data });
    await notify(order.buyer_user_id, { type: 'ORDER_UPDATE', title: messages.title, body: messages.buyer(order), data });
}

module.exports = { addClient, removeClient, notify, notifyOrderStatusChange };
