// Trừ phí khám của bác sĩ vào đơn thuốc. Gọi trong cùng transaction với lúc tạo đơn.
// Điều kiện: đơn thuốc điện tử còn hạn, đúng người nhận, ca khám đã COMPLETED, voucher chưa dùng.
// Số tiền trừ = LEAST(phí khám của ca, tiền thuốc). Trả về null nếu không đủ điều kiện.
async function applyConsultationCredit(client, orderId) {
    const { rows } = await client.query(
        `WITH o AS (
            SELECT id, prescription_id, recipient_user_id, subtotal_amount
            FROM orders
            WHERE id = $1 AND prescription_id IS NOT NULL
         ), claim AS (
            UPDATE consultations c
            SET fee_credit_order_id = o.id
            FROM o
            JOIN prescriptions p ON p.id = o.prescription_id
            WHERE c.id = p.consultation_id
              AND p.source = 'E_PRESCRIPTION'
              AND p.valid_until >= CURRENT_DATE
              AND p.patient_user_id = o.recipient_user_id
              AND c.status = 'COMPLETED'
              AND c.fee_credit_order_id IS NULL
            RETURNING c.fee_amount, o.id AS order_id, o.subtotal_amount
         )
         UPDATE orders od
         SET discount_amount = od.discount_amount + LEAST(claim.fee_amount, claim.subtotal_amount),
             total_amount    = GREATEST(od.total_amount - LEAST(claim.fee_amount, claim.subtotal_amount), 0)
         FROM claim
         WHERE od.id = claim.order_id
         RETURNING od.discount_amount, od.total_amount`,
        [orderId]
    );
    return rows[0] || null;
}

module.exports = { applyConsultationCredit };