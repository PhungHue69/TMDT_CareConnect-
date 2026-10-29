-- =============================================================================
-- DỮ LIỆU MẪU KHỞI ĐẦU (chạy sau 001_init_schema.sql)
-- Dùng để cả nhóm có chung tài khoản demo và danh mục tham chiếu.
-- Khi nhóm thu thập xong ~50 sản phẩm thật (CSV), import bổ sung vào master_drugs.
-- Mật khẩu tất cả tài khoản demo: 123456
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Tỷ lệ hoa hồng theo mô hình doanh thu
-- -----------------------------------------------------------------------------
INSERT INTO commission_rules (rule_key, rate, effective_from) VALUES
    ('RX', 0.0500, '2026-10-01'),
    ('OTC', 0.0700, '2026-10-01'),
    ('SUPPLEMENT', 0.1000, '2026-10-01'),
    ('COSMETIC', 0.1500, '2026-10-01'),
    ('DEVICE', 0.0700, '2026-10-01'),
    ('CONSULTATION', 0.2000, '2026-10-01'),
    ('CLINIC_BOOKING', 0.0500, '2026-10-01');

-- -----------------------------------------------------------------------------
-- Danh mục sản phẩm
-- -----------------------------------------------------------------------------
INSERT INTO drug_categories (id, parent_id, category_name) VALUES
    (1, NULL, 'Thuốc kê đơn'),
    (2, NULL, 'Thuốc không kê đơn'),
    (3, NULL, 'Thực phẩm chức năng'),
    (4, NULL, 'Thiết bị y tế'),
    (11, 1, 'Kháng sinh'),
    (12, 1, 'Tim mạch - Huyết áp'),
    (13, 1, 'Tiểu đường'),
    (14, 1, 'Tiêu hóa'),
    (21, 2, 'Giảm đau - Hạ sốt'),
    (22, 2, 'Dị ứng'),
    (23, 2, 'Tiêu hóa không kê đơn'),
    (31, 3, 'Vitamin & Khoáng chất'),
    (32, 3, 'Tim mạch - Não bộ'),
    (41, 4, 'Dụng cụ theo dõi sức khỏe');
SELECT setval('drug_categories_id_seq', (SELECT MAX(id) FROM drug_categories));

-- -----------------------------------------------------------------------------
-- Sản phẩm mẫu (giá tham khảo; registration_number để NULL, điền khi có data thật)
-- -----------------------------------------------------------------------------
INSERT INTO master_drugs (category_id, name, active_ingredient, strength, dosage_form, product_type, unit, reference_price) VALUES
    (11, 'Amoxicillin 500mg', 'Amoxicillin', '500mg', 'Viên nang', 'RX', 'Hộp 10 vỉ x 10 viên', 85000),
    (11, 'Augmentin 625mg', 'Amoxicillin + Acid clavulanic', '500mg/125mg', 'Viên nén bao phim', 'RX', 'Hộp 2 vỉ x 7 viên', 210000),
    (12, 'Amlodipin 5mg', 'Amlodipine', '5mg', 'Viên nén', 'RX', 'Hộp 3 vỉ x 10 viên', 30000),
    (12, 'Losartan 50mg', 'Losartan kali', '50mg', 'Viên nén bao phim', 'RX', 'Hộp 3 vỉ x 10 viên', 45000),
    (13, 'Metformin 500mg', 'Metformin hydroclorid', '500mg', 'Viên nén bao phim', 'RX', 'Hộp 5 vỉ x 10 viên', 40000),
    (14, 'Omeprazol 20mg', 'Omeprazole', '20mg', 'Viên nang tan trong ruột', 'RX', 'Hộp 3 vỉ x 10 viên', 35000),
    (21, 'Panadol Extra', 'Paracetamol + Caffeine', '500mg/65mg', 'Viên nén', 'OTC', 'Hộp 15 vỉ x 12 viên', 195000),
    (21, 'Hapacol 250', 'Paracetamol', '250mg', 'Thuốc bột sủi', 'OTC', 'Hộp 24 gói', 50000),
    (22, 'Loratadin 10mg', 'Loratadine', '10mg', 'Viên nén', 'OTC', 'Hộp 1 vỉ x 10 viên', 15000),
    (23, 'Berberin 100mg', 'Berberin clorid', '100mg', 'Viên nén', 'OTC', 'Lọ 100 viên', 12000),
    (23, 'Oresol 245', 'Natri clorid + Glucose + Kali clorid + Natri citrat', '4,1g', 'Thuốc bột pha uống', 'OTC', 'Hộp 20 gói', 40000),
    (31, 'Vitamin C 500mg', 'Acid ascorbic', '500mg', 'Viên nén', 'SUPPLEMENT', 'Lọ 100 viên', 60000),
    (31, 'Canxi + Vitamin D3', 'Calci carbonat + Cholecalciferol', '600mg/400IU', 'Viên nén', 'SUPPLEMENT', 'Lọ 60 viên', 180000),
    (32, 'Omega-3 Fish Oil 1000mg', 'Dầu cá (EPA, DHA)', '1000mg', 'Viên nang mềm', 'SUPPLEMENT', 'Lọ 100 viên', 250000),
    (41, 'Máy đo huyết áp bắp tay', NULL, NULL, NULL, 'DEVICE', 'Cái', 850000),
    (41, 'Nhiệt kế điện tử', NULL, NULL, NULL, 'DEVICE', 'Cái', 90000),
    (41, 'Que thử đường huyết', NULL, NULL, NULL, 'DEVICE', 'Hộp 50 que', 320000);

-- -----------------------------------------------------------------------------
-- Tài khoản demo (kịch bản: anh Nam ở Hà Nội chăm mẹ ở Nam Định)
-- -----------------------------------------------------------------------------
INSERT INTO users (phone, email, password_hash, full_name, date_of_birth, gender, role, ui_mode, kyc_status) VALUES
    ('0900000000', 'admin@careconnect.demo', crypt('123456', gen_salt('bf', 10)), 'Quản trị viên', NULL, NULL, 'ADMIN', 'STANDARD', 'VERIFIED'),
    ('0900000001', 'nam@careconnect.demo', crypt('123456', gen_salt('bf', 10)), 'Nguyễn Văn Nam', '1995-04-12', 'MALE', 'BUYER', 'STANDARD', 'VERIFIED'),
    ('0900000002', NULL, crypt('123456', gen_salt('bf', 10)), 'Trần Thị Lan', '1962-08-20', 'FEMALE', 'BUYER', 'SIMPLE', 'VERIFIED'),
    ('0900000011', 'bs.hung@careconnect.demo', crypt('123456', gen_salt('bf', 10)), 'BS. Lê Văn Hùng', '1980-02-15', 'MALE', 'DOCTOR', 'STANDARD', 'VERIFIED'),
    ('0900000012', 'bs.mai@careconnect.demo', crypt('123456', gen_salt('bf', 10)), 'BS. Phạm Thị Mai', '1987-11-03', 'FEMALE', 'DOCTOR', 'STANDARD', 'VERIFIED'),
    ('0900000021', 'ds.minhtam@careconnect.demo', crypt('123456', gen_salt('bf', 10)), 'DS. Đỗ Minh Tâm', '1985-06-09', 'MALE', 'PHARMACIST', 'STANDARD', 'VERIFIED'),
    ('0900000022', 'ds.phucan@careconnect.demo', crypt('123456', gen_salt('bf', 10)), 'DS. Vũ Thị Phúc', '1990-01-25', 'FEMALE', 'PHARMACIST', 'STANDARD', 'VERIFIED'),
    ('0900000031', 'pk.anbinh@careconnect.demo', crypt('123456', gen_salt('bf', 10)), 'Phòng khám An Bình', NULL, NULL, 'CLINIC', 'STANDARD', 'VERIFIED');

INSERT INTO health_profiles (user_id, blood_type, height_cm, weight_kg, allergies, chronic_conditions, current_medications, emergency_contact_name, emergency_contact_phone)
SELECT id, 'O', 155, 54, 'Dị ứng Penicillin', 'Tăng huyết áp, Tiểu đường type 2', 'Amlodipin 5mg, Metformin 500mg', 'Nguyễn Văn Nam', '0900000001'
FROM users WHERE phone = '0900000002';

INSERT INTO user_addresses (user_id, label, recipient_name, recipient_phone, address_line, latitude, longitude, is_default)
SELECT id, 'Nhà riêng', 'Nguyễn Văn Nam', '0900000001', '144 Xuân Thủy, Cầu Giấy, Hà Nội', 21.03671000, 105.78252000, TRUE
FROM users WHERE phone = '0900000001';
INSERT INTO user_addresses (user_id, label, recipient_name, recipient_phone, address_line, latitude, longitude, is_default)
SELECT id, 'Nhà Bố mẹ', 'Trần Thị Lan', '0900000002', '25 Trần Hưng Đạo, TP. Nam Định', 20.43380000, 106.17690000, FALSE
FROM users WHERE phone = '0900000001';
INSERT INTO user_addresses (user_id, label, recipient_name, recipient_phone, address_line, latitude, longitude, is_default)
SELECT id, 'Nhà riêng', 'Trần Thị Lan', '0900000002', '25 Trần Hưng Đạo, TP. Nam Định', 20.43380000, 106.17690000, TRUE
FROM users WHERE phone = '0900000002';

INSERT INTO family_links (caregiver_user_id, dependent_user_id, relationship, permissions_json, status, invite_code)
SELECT c.id, d.id, 'Mẹ', '{"view_health": true, "order_for": true, "manage_reminders": true}'::jsonb, 'ACTIVE', 'FAM-DEMO01'
FROM users c, users d WHERE c.phone = '0900000001' AND d.phone = '0900000002';

-- -----------------------------------------------------------------------------
-- Bác sĩ & Dược sĩ (đã được Admin duyệt)
-- -----------------------------------------------------------------------------
INSERT INTO professional_profiles (user_id, professional_type, license_number, specialty, workplace, years_of_experience, bio, consultation_fee, consultation_modes, is_online, verification_status, reviewed_at)
SELECT id, 'DOCTOR', 'CCHN-DEMO-0011', 'Nội tổng quát', 'Bệnh viện Đa khoa (demo)', 15, 'Khám và tư vấn bệnh nội khoa, tăng huyết áp, tiểu đường.', 20000, '{CHAT,AUDIO,VIDEO}', TRUE, 'APPROVED', CURRENT_TIMESTAMP
FROM users WHERE phone = '0900000011';
INSERT INTO professional_profiles (user_id, professional_type, license_number, specialty, workplace, years_of_experience, bio, consultation_fee, consultation_modes, is_online, verification_status, reviewed_at)
SELECT id, 'DOCTOR', 'CCHN-DEMO-0012', 'Nhi khoa', 'Bệnh viện Nhi (demo)', 8, 'Tư vấn sức khỏe trẻ em.', 15000, '{CHAT,VIDEO}', FALSE, 'APPROVED', CURRENT_TIMESTAMP
FROM users WHERE phone = '0900000012';
INSERT INTO professional_profiles (user_id, professional_type, license_number, specialty, years_of_experience, verification_status, reviewed_at)
SELECT id, 'PHARMACIST', 'CCHN-DEMO-0021', 'Dược sĩ đại học', 12, 'APPROVED', CURRENT_TIMESTAMP
FROM users WHERE phone = '0900000021';
INSERT INTO professional_profiles (user_id, professional_type, license_number, specialty, years_of_experience, verification_status, reviewed_at)
SELECT id, 'PHARMACIST', 'CCHN-DEMO-0022', 'Dược sĩ đại học', 6, 'APPROVED', CURRENT_TIMESTAMP
FROM users WHERE phone = '0900000022';

-- -----------------------------------------------------------------------------
-- Nhà thuốc (1 ở Hà Nội gần anh Nam, 1 ở Nam Định gần mẹ)
-- -----------------------------------------------------------------------------
INSERT INTO pharmacies (owner_user_id, name, phone, business_license_number, gpp_certificate, address, latitude, longitude, opening_hours_json, is_pro_seller, verification_status, reviewed_at)
SELECT id, 'Nhà thuốc Minh Tâm (demo)', '0900000021', 'DKKD-DEMO-01', 'GPP-DEMO-01', '120 Cầu Giấy, Hà Nội', 21.03310000, 105.79860000,
       '{"mon-sun": "07:00-22:00"}'::jsonb, TRUE, 'APPROVED', CURRENT_TIMESTAMP
FROM users WHERE phone = '0900000021';
INSERT INTO pharmacies (owner_user_id, name, phone, business_license_number, gpp_certificate, address, latitude, longitude, opening_hours_json, is_pro_seller, verification_status, reviewed_at)
SELECT id, 'Nhà thuốc Phúc An (demo)', '0900000022', 'DKKD-DEMO-02', 'GPP-DEMO-02', '60 Hàng Thao, TP. Nam Định', 20.42950000, 106.17580000,
       '{"mon-sat": "07:00-21:00"}'::jsonb, FALSE, 'APPROVED', CURRENT_TIMESTAMP
FROM users WHERE phone = '0900000022';

INSERT INTO pharmacy_staff (pharmacy_id, user_id, staff_role)
SELECT p.id, p.owner_user_id, 'OWNER' FROM pharmacies p;

INSERT INTO seller_subscriptions (pharmacy_id, plan_name, price, status, start_date, end_date)
SELECT id, 'PRO_MONTHLY', 299000, 'ACTIVE', '2026-10-01', '2026-11-01'
FROM pharmacies WHERE gpp_certificate = 'GPP-DEMO-01';

-- Tồn kho: nhà thuốc Hà Nội bán đủ danh mục, nhà thuốc Nam Định bán phần lớn (giá chênh nhẹ)
INSERT INTO pharmacy_inventories (pharmacy_id, master_drug_id, stock_quantity, price, nearest_expiry_date)
SELECT p.id, d.id, 50, d.reference_price, '2027-12-31'
FROM pharmacies p CROSS JOIN master_drugs d
WHERE p.gpp_certificate = 'GPP-DEMO-01';
INSERT INTO pharmacy_inventories (pharmacy_id, master_drug_id, stock_quantity, price, nearest_expiry_date)
SELECT p.id, d.id, 30, ROUND(d.reference_price * 0.95, -3), '2027-06-30'
FROM pharmacies p CROSS JOIN master_drugs d
WHERE p.gpp_certificate = 'GPP-DEMO-02' AND d.name NOT IN ('Augmentin 625mg', 'Máy đo huyết áp bắp tay');

-- -----------------------------------------------------------------------------
-- Phòng khám (Phase 2)
-- -----------------------------------------------------------------------------
INSERT INTO clinics (owner_user_id, name, phone, operating_license, address, latitude, longitude, verification_status)
SELECT id, 'Phòng khám Đa khoa An Bình (demo)', '0900000031', 'GPHĐ-DEMO-01', '15 Nguyễn Văn Huyên, Cầu Giấy, Hà Nội', 21.04100000, 105.79950000, 'APPROVED'
FROM users WHERE phone = '0900000031';

-- -----------------------------------------------------------------------------
-- Ví Escrow: 1 ví hệ thống, mỗi bác sĩ và nhà thuốc 1 ví
-- -----------------------------------------------------------------------------
INSERT INTO wallets (owner_type) VALUES ('SYSTEM');
INSERT INTO wallets (owner_type, user_id)
SELECT 'DOCTOR', user_id FROM professional_profiles WHERE professional_type = 'DOCTOR';
INSERT INTO wallets (owner_type, pharmacy_id)
SELECT 'PHARMACY', id FROM pharmacies;
