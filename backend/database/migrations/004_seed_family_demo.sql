-- =============================================================================
-- DỮ LIỆU DEMO FAMILY CARE (chạy sau 002 và 003)
-- Kịch bản: anh Nam (Hà Nội) đã liên kết với mẹ (bà Lan, Nam Định), mẹ có lịch uống thuốc
-- và 1 đơn thuốc đang chờ nhà thuốc duyệt. Bố (ông Bình) đã có tài khoản nhưng CHƯA liên kết
-- để demo trực tiếp thao tác liên kết bằng mã QR/SĐT.
-- Mật khẩu: 123456
-- =============================================================================

INSERT INTO users (phone, password_hash, full_name, date_of_birth, gender, role, ui_mode, kyc_status)
VALUES ('0900000003', crypt('123456', gen_salt('bf', 10)), 'Nguyễn Văn Bình', '1958-03-02', 'MALE', 'BUYER', 'SIMPLE', 'VERIFIED');

INSERT INTO health_profiles (user_id, blood_type, height_cm, weight_kg, allergies, chronic_conditions, current_medications, emergency_contact_name, emergency_contact_phone, notes)
SELECT id, 'A', 165, 62, NULL, 'Tăng huyết áp, Thoái hóa khớp gối', 'Losartan 50mg', 'Nguyễn Văn Nam', '0900000001', 'Hút thuốc lá 20 năm, đã bỏ từ 2020'
FROM users WHERE phone = '0900000003';

INSERT INTO user_addresses (user_id, label, recipient_name, recipient_phone, address_line, latitude, longitude, is_default)
SELECT id, 'Nhà riêng', 'Nguyễn Văn Bình', '0900000003', '25 Trần Hưng Đạo, TP. Nam Định', 20.43380000, 106.17690000, TRUE
FROM users WHERE phone = '0900000003';

-- -----------------------------------------------------------------------------
-- Lượt khám online anh Nam đặt cho mẹ với BS. Hùng và đơn thuốc điện tử
-- -----------------------------------------------------------------------------
INSERT INTO consultations (booker_user_id, patient_user_id, doctor_profile_id, mode, fee_amount, commission_rate, commission_amount, payment_status, status, symptom_description, diagnosis, started_at, ended_at, created_at)
SELECT nam.id, lan.id, pp.id, 'VIDEO', 20000, 0.2000, 4000, 'RELEASED', 'COMPLETED',
       'Mẹ hay chóng mặt buổi sáng, đường huyết đo tại nhà 8.2 mmol/L',
       'Tăng huyết áp độ 1, Đái tháo đường type 2',
       now() - interval '8 days', now() - interval '8 days' + interval '15 minutes', now() - interval '8 days'
FROM users nam, users lan, professional_profiles pp
JOIN users d ON d.id = pp.user_id
WHERE nam.phone = '0900000001' AND lan.phone = '0900000002' AND d.phone = '0900000011';

INSERT INTO prescriptions (patient_user_id, uploaded_by_user_id, source, doctor_profile_id, consultation_id, patient_name_on_rx, diagnosis, issued_date, valid_until, ai_validation_status, created_at)
SELECT c.patient_user_id, d.user_id, 'E_PRESCRIPTION', c.doctor_profile_id, c.id, 'Trần Thị Lan', c.diagnosis,
       (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 8, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 22, 'APPROVED', c.created_at
FROM consultations c JOIN professional_profiles d ON d.id = c.doctor_profile_id
WHERE c.symptom_description LIKE 'Mẹ hay chóng mặt%';

INSERT INTO prescription_items (prescription_id, master_drug_id, drug_name_raw, dosage, quantity, duration_days, usage_instructions)
SELECT p.id, md.id, md.name, v.dosage, v.quantity, 30, v.usage
FROM prescriptions p
CROSS JOIN (VALUES
    ('Amlodipin 5mg', '1 viên', 30, 'Uống 1 viên mỗi sáng sau ăn'),
    ('Metformin 500mg', '1 viên', 60, 'Uống 1 viên sau ăn sáng và 1 viên sau ăn tối')
) AS v(name, dosage, quantity, usage)
JOIN master_drugs md ON md.name = v.name
WHERE p.patient_name_on_rx = 'Trần Thị Lan' AND p.source = 'E_PRESCRIPTION';

-- -----------------------------------------------------------------------------
-- Lịch nhắc uống thuốc của mẹ do anh Nam cài
-- -----------------------------------------------------------------------------
INSERT INTO medication_reminders (patient_user_id, created_by_user_id, prescription_id, prescription_item_id, drug_name, dosage, meal_note, schedule_time, start_date, end_date, created_at)
SELECT p.patient_user_id, nam.id, p.id, pi.id, pi.drug_name_raw, pi.dosage, 'Sau ăn', v.t::time,
       (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 7, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 22, now() - interval '8 days'
FROM prescriptions p
JOIN prescription_items pi ON pi.prescription_id = p.id
JOIN (VALUES ('Amlodipin 5mg', '07:00'), ('Metformin 500mg', '07:00'), ('Metformin 500mg', '19:00')) AS v(name, t)
    ON v.name = pi.drug_name_raw
CROSS JOIN users nam
WHERE p.patient_name_on_rx = 'Trần Thị Lan' AND nam.phone = '0900000001';

-- Lịch sử 7 ngày qua: phần lớn đã uống, có vài liều bỏ lỡ để báo cáo tuân thủ có số liệu
INSERT INTO medication_adherence_logs (reminder_id, scheduled_date, status, confirmed_at, reminded_at, caregiver_notified_at)
SELECT r.id, d.day,
       CASE WHEN (d.n = 2 AND r.schedule_time = '19:00') OR (d.n = 5 AND r.drug_name = 'Amlodipin 5mg') THEN 'MISSED' ELSE 'TAKEN' END::adherence_status_enum,
       CASE WHEN (d.n = 2 AND r.schedule_time = '19:00') OR (d.n = 5 AND r.drug_name = 'Amlodipin 5mg') THEN NULL
            ELSE ((d.day + r.schedule_time + interval '8 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh') END,
       (d.day + r.schedule_time) AT TIME ZONE 'Asia/Ho_Chi_Minh',
       CASE WHEN (d.n = 2 AND r.schedule_time = '19:00') OR (d.n = 5 AND r.drug_name = 'Amlodipin 5mg')
            THEN ((d.day + r.schedule_time + interval '30 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh') END
FROM medication_reminders r
CROSS JOIN LATERAL (
    SELECT n, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - n AS day FROM generate_series(1, 7) AS n
) d
JOIN users lan ON lan.id = r.patient_user_id
WHERE lan.phone = '0900000002';

-- -----------------------------------------------------------------------------
-- Đơn thuốc anh Nam đặt giao về nhà mẹ, đang chờ Nhà thuốc Phúc An duyệt
-- -----------------------------------------------------------------------------
INSERT INTO orders (order_code, buyer_user_id, recipient_user_id, pharmacy_id, prescription_id,
                    shipping_address_id, shipping_recipient_name, shipping_recipient_phone, shipping_address_line, shipping_latitude, shipping_longitude,
                    subtotal_amount, shipping_fee, total_amount, platform_commission_amount, status, payment_method, payment_status)
SELECT 'CC-DEMO-0001', nam.id, lan.id, ph.id, p.id,
       a.id, a.recipient_name, a.recipient_phone, a.address_line, a.latitude, a.longitude,
       0, 15000, 0, 0, 'PENDING_CONFIRM', 'ONLINE_ESCROW', 'HOLDING_ESCROW'
FROM users nam
JOIN users lan ON lan.phone = '0900000002'
JOIN user_addresses a ON a.user_id = nam.id AND a.label = 'Nhà Bố mẹ'
JOIN pharmacies ph ON ph.gpp_certificate = 'GPP-DEMO-02'
JOIN prescriptions p ON p.patient_user_id = lan.id AND p.source = 'E_PRESCRIPTION'
WHERE nam.phone = '0900000001';

INSERT INTO order_items (order_id, pharmacy_inventory_id, prescription_item_id, product_name_snapshot, product_type_snapshot, unit_price, quantity, total_price, commission_rate, commission_amount)
SELECT o.id, inv.id, pi.id, md.name, md.product_type, inv.price, v.qty, inv.price * v.qty, 0.0500, ROUND(inv.price * v.qty * 0.05, 0)
FROM orders o
JOIN prescription_items pi ON pi.prescription_id = o.prescription_id
JOIN master_drugs md ON md.id = pi.master_drug_id
JOIN pharmacy_inventories inv ON inv.pharmacy_id = o.pharmacy_id AND inv.master_drug_id = md.id
JOIN (VALUES ('Amlodipin 5mg', 1), ('Metformin 500mg', 1)) AS v(name, qty) ON v.name = md.name
WHERE o.order_code = 'CC-DEMO-0001';

UPDATE orders o SET
    subtotal_amount = s.subtotal,
    total_amount = s.subtotal + o.shipping_fee,
    platform_commission_amount = s.commission
FROM (SELECT order_id, SUM(total_price) AS subtotal, SUM(commission_amount) AS commission FROM order_items GROUP BY order_id) s
WHERE s.order_id = o.id AND o.order_code = 'CC-DEMO-0001';

INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by_user_id, note)
SELECT id, NULL, 'PENDING_CONFIRM', buyer_user_id, 'Con đặt thuốc giao về nhà mẹ'
FROM orders WHERE order_code = 'CC-DEMO-0001';
