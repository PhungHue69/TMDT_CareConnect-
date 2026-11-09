ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS fee_credit_order_id bigint REFERENCES orders(id) ON DELETE SET NULL;

-- Mỗi đơn hàng chỉ gắn với tối đa một ca khám đã dùng voucher
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultations_fee_credit_order
  ON consultations (fee_credit_order_id) WHERE fee_credit_order_id IS NOT NULL;