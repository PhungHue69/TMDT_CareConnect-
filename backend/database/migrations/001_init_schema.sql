-- Kích hoạt tiện ích mở rộng tạo UUID tự động và PostGIS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- ENUM TYPES DEFINITION
-- -----------------------------------------------------------------------------
CREATE TYPE user_role_enum AS ENUM ('BUYER', 'DOCTOR', 'PHARMACIST', 'CLINIC', 'ADMIN');
CREATE TYPE gender_enum AS ENUM ('MALE', 'FEMALE', 'OTHER');
CREATE TYPE ui_mode_enum AS ENUM ('STANDARD', 'SIMPLE'); -- SIMPLE: giao diện chữ to, ít nút cho Bố mẹ
CREATE TYPE kyc_status_enum AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE family_link_status_enum AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');
CREATE TYPE verification_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE professional_type_enum AS ENUM ('DOCTOR', 'PHARMACIST');
CREATE TYPE product_type_enum AS ENUM ('RX', 'OTC', 'SUPPLEMENT', 'DEVICE', 'COSMETIC');
CREATE TYPE consultation_mode_enum AS ENUM ('CHAT', 'AUDIO', 'VIDEO');
CREATE TYPE consultation_status_enum AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE message_type_enum AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM');
CREATE TYPE prescription_source_enum AS ENUM ('E_PRESCRIPTION', 'UPLOAD_IMAGE', 'PASTE_TEXT');
CREATE TYPE ai_validation_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED_NOT_RX', 'PENDING_HUMAN');
CREATE TYPE prescription_request_status_enum AS ENUM ('SENT', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE order_status_enum AS ENUM ('PENDING_CONFIRM', 'CONFIRMED', 'PREPARING', 'SHIPPING', 'COMPLETED', 'CANCELLED', 'RETURNED');
CREATE TYPE payment_method_enum AS ENUM ('ONLINE_ESCROW', 'COD');
CREATE TYPE payment_status_enum AS ENUM ('PENDING', 'HOLDING_ESCROW', 'RELEASED', 'REFUNDED', 'FAILED');
CREATE TYPE payment_gateway_enum AS ENUM ('VNPAY', 'MOMO', 'ZALOPAY', 'VIETQR', 'CARD', 'COD', 'CARE_COIN');
CREATE TYPE payment_purpose_enum AS ENUM ('ORDER', 'CONSULTATION', 'PREMIUM_SUBSCRIPTION', 'PRO_SUBSCRIPTION', 'ADVERTISING');
CREATE TYPE payment_txn_status_enum AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');
CREATE TYPE shipping_provider_enum AS ENUM ('AHAMOVE', 'GRAB_EXPRESS', 'LALAMOVE', 'SHOPEE_FOOD', 'INTERNAL_SHIPPER');
CREATE TYPE shipment_status_enum AS ENUM ('PENDING', 'ASSIGNING_DRIVER', 'DRIVER_ACCEPTED', 'PICKING_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED');
CREATE TYPE wallet_owner_type_enum AS ENUM ('SYSTEM', 'DOCTOR', 'PHARMACY');
CREATE TYPE wallet_tx_type_enum AS ENUM ('ESCROW_HOLD', 'ESCROW_RELEASE', 'COMMISSION_DEDUCT', 'SHIPPING_SPREAD', 'REFUND', 'SUBSCRIPTION_FEE', 'ADVERTISING_FEE', 'PAYOUT_RELEASE');
CREATE TYPE payout_status_enum AS ENUM ('PENDING', 'PAID', 'REJECTED');
CREATE TYPE adherence_status_enum AS ENUM ('TAKEN', 'MISSED', 'SKIPPED');
CREATE TYPE notification_type_enum AS ENUM ('MEDICATION_REMINDER', 'MISSED_DOSE_ALERT', 'ORDER_UPDATE', 'CONSULTATION_UPDATE', 'PRESCRIPTION_QUOTE', 'SYSTEM');
CREATE TYPE subscription_plan_enum AS ENUM ('MONTHLY_49K', 'ANNUAL_499K');
CREATE TYPE subscription_status_enum AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE ad_type_enum AS ENUM ('SPONSORED_SEARCH', 'BANNER');
CREATE TYPE ad_status_enum AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE booking_status_enum AS ENUM ('CONFIRMED', 'COMPLETED', 'CANCELLED');

-- =============================================================================
-- PHÂN HỆ 1: USER & FAMILY DOMAIN (TÀI KHOẢN & LIÊN KẾT GIA ĐÌNH)
-- =============================================================================

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    date_of_birth DATE,
    gender gender_enum,
    avatar_url VARCHAR(500), -- Ảnh đại diện cá nhân
    role user_role_enum NOT NULL DEFAULT 'BUYER',
    ui_mode ui_mode_enum NOT NULL DEFAULT 'STANDARD',
    kyc_status kyc_status_enum NOT NULL DEFAULT 'PENDING',
    care_coin_balance INT NOT NULL DEFAULT 0 CHECK (care_coin_balance >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hồ sơ sức khỏe (Bác sĩ xem khi khám, Dược sĩ xem khi tư vấn)
CREATE TABLE health_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blood_type VARCHAR(5),
    height_cm DECIMAL(5, 1),
    weight_kg DECIMAL(5, 1),
    allergies TEXT, -- Dị ứng thuốc/thực phẩm
    chronic_conditions TEXT, -- Bệnh mạn tính (tiểu đường, huyết áp...)
    current_medications TEXT,
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(20),
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(50), -- 'Nhà riêng', 'Nhà Bố mẹ', 'Công ty'
    recipient_name VARCHAR(150) NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    address_line TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(Point, 4326),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE family_links (
    id BIGSERIAL PRIMARY KEY,
    caregiver_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Con cái (người quản lý)
    dependent_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Bố mẹ (người được chăm sóc)
    relationship VARCHAR(50) NOT NULL,
    permissions_json JSONB,
    status family_link_status_enum NOT NULL DEFAULT 'PENDING',
    invite_code VARCHAR(20) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_different_users CHECK (caregiver_user_id <> dependent_user_id),
    CONSTRAINT uq_family_link UNIQUE(caregiver_user_id, dependent_user_id)
);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type_enum NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data_json JSONB, -- Ví dụ: {"order_id": 12} để app điều hướng khi bấm
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PHÂN HỆ 2: PROVIDER & MERCHANT DOMAIN (ĐỐI TÁC Y TẾ & GIAN HÀNG O2O)
-- =============================================================================

-- Hồ sơ hành nghề của Bác sĩ và Dược sĩ (Admin duyệt CCHN)
CREATE TABLE professional_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    professional_type professional_type_enum NOT NULL,
    license_number VARCHAR(100) UNIQUE NOT NULL,
    avatar_url VARCHAR(500), -- Ảnh chân dung
    license_image_url VARCHAR(500), -- Ảnh chụp Giấy chứng chỉ hành nghề (CCHN)
    specialty VARCHAR(150), -- Chuyên khoa (Bác sĩ)
    workplace VARCHAR(255), -- Bệnh viện/cơ sở đang công tác
    years_of_experience INT CHECK (years_of_experience >= 0),
    bio TEXT,
    -- Bác sĩ chỉ thu phí khám, không bán thuốc. Dược sĩ để NULL
    consultation_fee DECIMAL(12, 2) CHECK (consultation_fee BETWEEN 5000 AND 30000),
    consultation_modes consultation_mode_enum[] NOT NULL DEFAULT '{CHAT}',
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    rating DECIMAL(3, 2) DEFAULT 5.00,
    rating_count INT NOT NULL DEFAULT 0,
    verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_doctor_fee CHECK (professional_type <> 'DOCTOR' OR consultation_fee IS NOT NULL)
);

CREATE TABLE pharmacies (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    business_license_number VARCHAR(100), -- Giấy chứng nhận đủ điều kiện kinh doanh dược
    gpp_certificate VARCHAR(100) NOT NULL,
    storefront_image_url VARCHAR(500), -- Ảnh chụp mặt tiền Nhà thuốc
    gpp_certificate_image_url VARCHAR(500), -- Ảnh chụp Giấy chứng nhận đạt chuẩn GPP
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(Point, 4326),
    opening_hours_json JSONB, -- {"mon": "07:00-22:00", ...}
    is_pro_seller BOOLEAN NOT NULL DEFAULT FALSE, -- Cache từ seller_subscriptions để sắp xếp tìm kiếm nhanh
    rating DECIMAL(3, 2) DEFAULT 5.00,
    rating_count INT NOT NULL DEFAULT 0,
    verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dược sĩ/nhân viên làm việc tại Nhà thuốc
CREATE TABLE pharmacy_staff (
    id BIGSERIAL PRIMARY KEY,
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    staff_role VARCHAR(30) NOT NULL DEFAULT 'PHARMACIST' CHECK (staff_role IN ('OWNER', 'PHARMACIST', 'STAFF')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pharmacy_staff UNIQUE(pharmacy_id, user_id)
);

CREATE TABLE clinics (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    operating_license VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(Point, 4326),
    verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE doctor_clinic_assignments (
    id BIGSERIAL PRIMARY KEY,
    doctor_profile_id BIGINT NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
    clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    schedule_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_doctor_clinic UNIQUE(doctor_profile_id, clinic_id)
);

-- =============================================================================
-- PHÂN HỆ 3: DRUG CATALOG & INVENTORY DOMAIN (DƯỢC ĐIỂN & KHO HÀNG)
-- =============================================================================

CREATE TABLE drug_categories (
    id SERIAL PRIMARY KEY,
    parent_id INT REFERENCES drug_categories(id) ON DELETE SET NULL,
    category_name VARCHAR(150) NOT NULL
);

CREATE TABLE master_drugs (
    id BIGSERIAL PRIMARY KEY,
    category_id INT REFERENCES drug_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    active_ingredient VARCHAR(255), -- NULL với thiết bị y tế
    strength VARCHAR(100), -- Hàm lượng: '500mg', '5mg/5ml'
    dosage_form VARCHAR(100), -- Dạng bào chế: viên nén, siro, gói bột...
    product_type product_type_enum NOT NULL, -- Quyết định % hoa hồng và việc bắt buộc đơn thuốc
    is_prescription_only BOOLEAN GENERATED ALWAYS AS (product_type = 'RX') STORED,
    registration_number VARCHAR(100), -- Số đăng ký (SĐK) của Cục Quản lý Dược
    manufacturer VARCHAR(255),
    country_of_origin VARCHAR(100),
    unit VARCHAR(50) NOT NULL,
    description TEXT,
    usage_guide TEXT,
    contraindications TEXT,
    reference_price DECIMAL(12, 2), -- Giá tham khảo khi import data
    image_url VARCHAR(500), -- Ảnh đại diện bao bì chính của sản phẩm
    gallery_images JSONB DEFAULT '[]'::jsonb, -- Danh sách ảnh chi tiết (mặt trước, mặt sau, viên)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pharmacy_inventories (
    id BIGSERIAL PRIMARY KEY,
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    master_drug_id BIGINT NOT NULL REFERENCES master_drugs(id) ON DELETE CASCADE,
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    price DECIMAL(12, 2) NOT NULL CHECK (price >= 0),
    nearest_expiry_date DATE, -- Hạn dùng gần nhất của lô đang bán
    status VARCHAR(20) NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pharmacy_drug UNIQUE(pharmacy_id, master_drug_id)
);

-- =============================================================================
-- PHÂN HỆ 4: TELEHEALTH & AI DOMAIN (KHÁM BỆNH & ĐƠN THUỐC AI GUARDRAIL)
-- =============================================================================

-- Bác sĩ chỉ khám và thu phí. Đơn thuốc kê ra, người dùng tự tìm Nhà thuốc để mua
CREATE TABLE consultations (
    id BIGSERIAL PRIMARY KEY,
    booker_user_id BIGINT NOT NULL REFERENCES users(id), -- Người đặt và trả tiền (có thể là Con)
    patient_user_id BIGINT NOT NULL REFERENCES users(id), -- Người được khám (có thể là Bố mẹ)
    doctor_profile_id BIGINT NOT NULL REFERENCES professional_profiles(id),
    mode consultation_mode_enum NOT NULL DEFAULT 'CHAT',
    fee_amount DECIMAL(12, 2) NOT NULL CHECK (fee_amount >= 0),
    commission_rate DECIMAL(5, 4) NOT NULL, -- Chốt tỷ lệ tại thời điểm đặt
    commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    payment_status payment_status_enum NOT NULL DEFAULT 'PENDING',
    status consultation_status_enum NOT NULL DEFAULT 'WAITING',
    symptom_description TEXT,
    symptom_image_urls JSONB DEFAULT '[]'::jsonb, -- Ảnh chụp triệu chứng/phát ban ngoài da
    diagnosis TEXT,
    doctor_notes TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    cancel_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE consultation_messages (
    id BIGSERIAL PRIMARY KEY,
    consultation_id BIGINT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    sender_user_id BIGINT REFERENCES users(id), -- NULL với tin nhắn hệ thống
    message_type message_type_enum NOT NULL DEFAULT 'TEXT',
    content TEXT,
    attachment_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescriptions (
    id BIGSERIAL PRIMARY KEY,
    patient_user_id BIGINT NOT NULL REFERENCES users(id),
    uploaded_by_user_id BIGINT NOT NULL REFERENCES users(id), -- Con có thể tải đơn lên cho Bố mẹ
    source prescription_source_enum NOT NULL,
    doctor_profile_id BIGINT REFERENCES professional_profiles(id), -- Chỉ có với đơn điện tử kê trên CareConnect
    consultation_id BIGINT REFERENCES consultations(id),
    -- Thông tin đọc từ đơn bên ngoài (bệnh viện tỉnh...)
    patient_name_on_rx VARCHAR(150),
    prescriber_name_raw VARCHAR(150),
    facility_name_raw VARCHAR(255),
    diagnosis TEXT,
    issued_date DATE,
    valid_until DATE, -- Hạn mua thuốc theo đơn
    prescription_image_url VARCHAR(500), -- Ảnh chụp đơn thuốc gốc phục vụ AI OCR
    raw_text_input TEXT, -- Nội dung người dùng dán vào
    ocr_raw_text TEXT,
    -- Mặc định PENDING: chỉ chuyển cho dược sĩ khi AI đã duyệt APPROVED
    ai_validation_status ai_validation_status_enum NOT NULL DEFAULT 'PENDING',
    is_fully_dispensed BOOLEAN NOT NULL DEFAULT FALSE, -- Đã bán đủ số lượng, không cho dùng lại
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_e_prescription CHECK (
        source <> 'E_PRESCRIPTION' OR (doctor_profile_id IS NOT NULL AND consultation_id IS NOT NULL)
    ),
    CONSTRAINT chk_upload_has_input CHECK (
        source = 'E_PRESCRIPTION' OR prescription_image_url IS NOT NULL OR raw_text_input IS NOT NULL
    )
);

CREATE TABLE prescription_items (
    id BIGSERIAL PRIMARY KEY,
    prescription_id BIGINT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    master_drug_id BIGINT REFERENCES master_drugs(id), -- NULL nếu AI chưa khớp được với danh mục
    drug_name_raw VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    dispensed_quantity INT NOT NULL DEFAULT 0, -- Số lượng đã bán, chống mua vượt đơn
    duration_days INT,
    usage_instructions TEXT,
    CONSTRAINT chk_dispensed CHECK (dispensed_quantity BETWEEN 0 AND quantity)
);

CREATE TABLE prescription_ai_logs (
    id BIGSERIAL PRIMARY KEY,
    prescription_id BIGINT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    model_name VARCHAR(100),
    input_payload TEXT NOT NULL,
    ai_response_json JSONB NOT NULL,
    detected_intent VARCHAR(30) CHECK (detected_intent IN ('VALID_RX', 'SYMPTOM_REQUEST', 'UNREADABLE', 'OTHER')),
    confidence DECIMAL(4, 3),
    flagged_reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Người dùng gửi đơn đến Nhà thuốc, Dược sĩ báo giá (có thể gửi nhiều nhà thuốc để so giá)
CREATE TABLE prescription_requests (
    id BIGSERIAL PRIMARY KEY,
    prescription_id BIGINT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id),
    requested_by_user_id BIGINT NOT NULL REFERENCES users(id),
    status prescription_request_status_enum NOT NULL DEFAULT 'SENT',
    pharmacist_user_id BIGINT REFERENCES users(id),
    quoted_subtotal DECIMAL(12, 2),
    pharmacist_note TEXT, -- Tư vấn cách dùng, không chẩn đoán/kê đơn
    reject_reason TEXT,
    quoted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_prescription_pharmacy UNIQUE(prescription_id, pharmacy_id)
);

-- Từng dòng báo giá, gồm cả thuốc thay thế cùng hoạt chất
CREATE TABLE prescription_request_items (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES prescription_requests(id) ON DELETE CASCADE,
    prescription_item_id BIGINT NOT NULL REFERENCES prescription_items(id),
    pharmacy_inventory_id BIGINT REFERENCES pharmacy_inventories(id), -- NULL nếu hết hàng
    is_substitute BOOLEAN NOT NULL DEFAULT FALSE,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12, 2),
    note TEXT
);

-- =============================================================================
-- PHÂN HỆ 5: ORDER & FINANCIAL LEDGER DOMAIN (ĐƠN HÀNG & SỔ CÁI ESCROW)
-- =============================================================================

-- Tỷ lệ hoa hồng theo loại sản phẩm/dịch vụ (Admin chỉnh được)
CREATE TABLE commission_rules (
    id SERIAL PRIMARY KEY,
    rule_key VARCHAR(30) NOT NULL, -- 'RX', 'OTC', 'SUPPLEMENT', 'DEVICE', 'COSMETIC', 'CONSULTATION', 'CLINIC_BOOKING'
    rate DECIMAL(5, 4) NOT NULL CHECK (rate BETWEEN 0 AND 1),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT uq_commission_rule UNIQUE(rule_key, effective_from)
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    order_code VARCHAR(30) UNIQUE NOT NULL,
    buyer_user_id BIGINT NOT NULL REFERENCES users(id),
    recipient_user_id BIGINT NOT NULL REFERENCES users(id), -- Có thể là Bố mẹ
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id),
    prescription_id BIGINT REFERENCES prescriptions(id),
    prescription_request_id BIGINT REFERENCES prescription_requests(id),
    -- Bản chụp địa chỉ giao tại thời điểm đặt
    shipping_address_id BIGINT REFERENCES user_addresses(id) ON DELETE SET NULL,
    shipping_recipient_name VARCHAR(150) NOT NULL,
    shipping_recipient_phone VARCHAR(20) NOT NULL,
    shipping_address_line TEXT NOT NULL,
    shipping_latitude DECIMAL(10, 8) NOT NULL,
    shipping_longitude DECIMAL(11, 8) NOT NULL,
    subtotal_amount DECIMAL(12, 2) NOT NULL CHECK (subtotal_amount >= 0),
    shipping_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    care_coin_used INT NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
    platform_commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    status order_status_enum NOT NULL DEFAULT 'PENDING_CONFIRM',
    payment_method payment_method_enum NOT NULL DEFAULT 'ONLINE_ESCROW',
    payment_status payment_status_enum NOT NULL DEFAULT 'PENDING',
    note TEXT,
    cancel_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    pharmacy_inventory_id BIGINT NOT NULL REFERENCES pharmacy_inventories(id),
    prescription_item_id BIGINT REFERENCES prescription_items(id), -- Bắt buộc với thuốc RX (kiểm tra ở backend)
    product_name_snapshot VARCHAR(255) NOT NULL,
    product_type_snapshot product_type_enum NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    total_price DECIMAL(12, 2) NOT NULL,
    commission_rate DECIMAL(5, 4) NOT NULL, -- Chốt tỷ lệ tại thời điểm đặt
    commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00
);

CREATE TABLE order_status_logs (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by_user_id BIGINT REFERENCES users(id), -- NULL nếu hệ thống/webhook tự đổi
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider shipping_provider_enum NOT NULL DEFAULT 'AHAMOVE',
    third_party_order_id VARCHAR(100), -- Mã đơn hàng do API đối tác 3rd party trả về (e.g. Ahamove/Grab)
    tracking_code VARCHAR(100),       -- Mã vận đơn / tracking
    tracking_url TEXT,                 -- Link xem vị trí tài xế real-time trên bản đồ
    distance_km DECIMAL(5, 2),        -- Khoảng cách tính cước giao hàng (km)
    driver_name VARCHAR(150),          -- Tên tài xế (đồng bộ tự động từ Webhook)
    driver_phone VARCHAR(20),          -- SĐT tài xế (đồng bộ tự động từ Webhook)
    driver_plate VARCHAR(20),          -- Biển số xe tài xế (đồng bộ tự động từ Webhook)
    proof_of_delivery_image_url VARCHAR(500), -- Ảnh chụp xác nhận giao hàng thành công (POD)
    status shipment_status_enum NOT NULL DEFAULT 'PENDING',
    actual_shipping_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Cước phí thực tế trả cho 3rd party API (giá gốc)
    charged_shipping_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- Cước phí thu từ khách hàng
    shipping_margin DECIMAL(12, 2) GENERATED ALWAYS AS (charged_shipping_fee - actual_shipping_cost) STORED, -- Chênh lệch cước (Lợi nhuận Sàn)
    webhook_last_payload JSONB,        -- Nhật ký payload Webhook gần nhất từ đối tác giao hàng
    picked_up_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mọi lần thu tiền qua cổng thanh toán (đơn hàng, phí khám, Premium, Pro, quảng cáo)
CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    payer_user_id BIGINT NOT NULL REFERENCES users(id),
    purpose payment_purpose_enum NOT NULL,
    order_id BIGINT REFERENCES orders(id),
    consultation_id BIGINT REFERENCES consultations(id),
    gateway payment_gateway_enum NOT NULL,
    gateway_txn_id VARCHAR(100) UNIQUE, -- Mã giao dịch VNPay/MoMo trả về
    amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
    status payment_txn_status_enum NOT NULL DEFAULT 'PENDING',
    gateway_callback_json JSONB,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_order CHECK (purpose <> 'ORDER' OR order_id IS NOT NULL),
    CONSTRAINT chk_payment_consultation CHECK (purpose <> 'CONSULTATION' OR consultation_id IS NOT NULL)
);

-- Ví SYSTEM: user_id và pharmacy_id đều NULL. Ví DOCTOR: user_id. Ví PHARMACY: pharmacy_id
CREATE TABLE wallets (
    id BIGSERIAL PRIMARY KEY,
    owner_type wallet_owner_type_enum NOT NULL,
    user_id BIGINT REFERENCES users(id),
    pharmacy_id BIGINT REFERENCES pharmacies(id),
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    pending_escrow_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_wallet_owner CHECK (
        (owner_type = 'SYSTEM' AND user_id IS NULL AND pharmacy_id IS NULL) OR
        (owner_type = 'DOCTOR' AND user_id IS NOT NULL AND pharmacy_id IS NULL) OR
        (owner_type = 'PHARMACY' AND pharmacy_id IS NOT NULL AND user_id IS NULL)
    )
);

CREATE UNIQUE INDEX uq_wallet_system ON wallets(owner_type) WHERE owner_type = 'SYSTEM';
CREATE UNIQUE INDEX uq_wallet_doctor ON wallets(user_id) WHERE owner_type = 'DOCTOR';
CREATE UNIQUE INDEX uq_wallet_pharmacy ON wallets(pharmacy_id) WHERE owner_type = 'PHARMACY';

CREATE TABLE wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    payment_id BIGINT REFERENCES payments(id),
    order_id BIGINT REFERENCES orders(id),
    consultation_id BIGINT REFERENCES consultations(id),
    transaction_type wallet_tx_type_enum NOT NULL,
    amount DECIMAL(15, 2) NOT NULL, -- Dương: cộng vào ví, âm: trừ khỏi ví
    balance_after DECIMAL(15, 2),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Đối tác rút tiền theo chu kỳ (Thứ 2 & Thứ 5 hoặc T+3)
CREATE TABLE payout_requests (
    id BIGSERIAL PRIMARY KEY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(id),
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    bank_name VARCHAR(100) NOT NULL,
    bank_account_number VARCHAR(50) NOT NULL,
    account_holder VARCHAR(150) NOT NULL,
    status payout_status_enum NOT NULL DEFAULT 'PENDING',
    processed_by_user_id BIGINT REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PHÂN HỆ 6: TRACKER, REVIEWS & SUBSCRIPTIONS DOMAIN
-- =============================================================================

CREATE TABLE medication_reminders (
    id BIGSERIAL PRIMARY KEY,
    patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id),
    prescription_id BIGINT REFERENCES prescriptions(id),
    prescription_item_id BIGINT REFERENCES prescription_items(id),
    drug_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    meal_note VARCHAR(50), -- 'Trước ăn', 'Sau ăn'
    pill_image_url VARCHAR(500), -- Ảnh chụp viên/vỉ thuốc trực quan cho Bố mẹ
    schedule_time TIME NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_reminder_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE medication_adherence_logs (
    id BIGSERIAL PRIMARY KEY,
    reminder_id BIGINT NOT NULL REFERENCES medication_reminders(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    status adherence_status_enum NOT NULL DEFAULT 'MISSED',
    confirmed_at TIMESTAMP WITH TIME ZONE,
    caregiver_notified_at TIMESTAMP WITH TIME ZONE, -- Thời điểm báo cho Con khi quá 30 phút chưa xác nhận
    CONSTRAINT uq_reminder_date UNIQUE(reminder_id, scheduled_date)
);

CREATE TABLE care_coin_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL, -- Dương: cộng xu, âm: dùng xu
    type VARCHAR(50) NOT NULL CHECK (type IN ('EARN_PURCHASE', 'EARN_ADHERENCE', 'REDEEM', 'EXPIRE')),
    order_id BIGINT REFERENCES orders(id),
    consultation_id BIGINT REFERENCES consultations(id),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE family_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type subscription_plan_enum NOT NULL DEFAULT 'MONTHLY_49K',
    price DECIMAL(12, 2) NOT NULL,
    payment_id BIGINT REFERENCES payments(id),
    status subscription_status_enum NOT NULL DEFAULT 'ACTIVE',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Gói Seller Pro của Nhà thuốc (299k - 499k/tháng)
CREATE TABLE seller_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    plan_name VARCHAR(50) NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    payment_id BIGINT REFERENCES payments(id),
    status subscription_status_enum NOT NULL DEFAULT 'ACTIVE',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Quảng cáo trong app: đấu thầu từ khóa (CPC) và banner
CREATE TABLE ad_campaigns (
    id BIGSERIAL PRIMARY KEY,
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    ad_type ad_type_enum NOT NULL,
    keyword VARCHAR(150), -- Với SPONSORED_SEARCH
    banner_image_url VARCHAR(500), -- Với BANNER
    cpc_bid DECIMAL(12, 2),
    budget DECIMAL(12, 2) NOT NULL,
    spent DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    status ad_status_enum NOT NULL DEFAULT 'DRAFT',
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinic_bookings (
    id BIGSERIAL PRIMARY KEY,
    buyer_user_id BIGINT NOT NULL REFERENCES users(id),
    patient_user_id BIGINT NOT NULL REFERENCES users(id),
    clinic_id BIGINT NOT NULL REFERENCES clinics(id),
    booking_time TIMESTAMP WITH TIME ZONE NOT NULL,
    symptom_note TEXT,
    status booking_status_enum NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mỗi đánh giá gắn đúng một đối tượng và một giao dịch đã hoàn thành
CREATE TABLE reviews (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    pharmacy_id BIGINT REFERENCES pharmacies(id),
    clinic_id BIGINT REFERENCES clinics(id),
    doctor_profile_id BIGINT REFERENCES professional_profiles(id),
    order_id BIGINT REFERENCES orders(id),
    consultation_id BIGINT REFERENCES consultations(id),
    clinic_booking_id BIGINT REFERENCES clinic_bookings(id),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    review_image_urls JSONB DEFAULT '[]'::jsonb, -- Ảnh thực tế từ đánh giá của khách hàng
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_review_one_target CHECK (num_nonnulls(pharmacy_id, clinic_id, doctor_profile_id) = 1),
    CONSTRAINT chk_review_one_source CHECK (num_nonnulls(order_id, consultation_id, clinic_booking_id) = 1)
);

-- =============================================================================
-- INDEXING FOR HIGH PERFORMANCE & GEOLOCATION SEARCH
-- =============================================================================

-- Spatial Indexes for GPS Radius Search (Haversine/GIST)
CREATE INDEX idx_pharmacies_geom ON pharmacies USING GIST (geom);
CREATE INDEX idx_user_addresses_geom ON user_addresses USING GIST (geom);
CREATE INDEX idx_clinics_geom ON clinics USING GIST (geom);

-- Foreign Key & Query Performance Indexes
CREATE INDEX idx_orders_buyer ON orders(buyer_user_id);
CREATE INDEX idx_orders_recipient ON orders(recipient_user_id);
CREATE INDEX idx_orders_pharmacy ON orders(pharmacy_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_master_drugs_name ON master_drugs(name);
CREATE INDEX idx_master_drugs_ingredient ON master_drugs(active_ingredient);
CREATE INDEX idx_inventories_drug ON pharmacy_inventories(master_drug_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_user_id);
CREATE INDEX idx_prescriptions_ai_status ON prescriptions(ai_validation_status);
CREATE INDEX idx_prescription_requests_pharmacy ON prescription_requests(pharmacy_id, status);
CREATE INDEX idx_consultations_doctor ON consultations(doctor_profile_id, status);
CREATE INDEX idx_consultations_patient ON consultations(patient_user_id);
CREATE INDEX idx_consultation_messages ON consultation_messages(consultation_id, created_at);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_consultation ON payments(consultation_id);
CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_reminders_patient ON medication_reminders(patient_user_id) WHERE is_active;
CREATE INDEX idx_family_links_dependent ON family_links(dependent_user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- Trigger to auto-update PostGIS Geometry from Lat/Lng
CREATE OR REPLACE FUNCTION update_geom_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_addresses_geom BEFORE INSERT OR UPDATE ON user_addresses FOR EACH ROW EXECUTE FUNCTION update_geom_column();
CREATE TRIGGER trg_pharmacies_geom BEFORE INSERT OR UPDATE ON pharmacies FOR EACH ROW EXECUTE FUNCTION update_geom_column();
CREATE TRIGGER trg_clinics_geom BEFORE INSERT OR UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION update_geom_column();

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_health_profiles_updated_at BEFORE UPDATE ON health_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pharmacies_updated_at BEFORE UPDATE ON pharmacies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventories_updated_at BEFORE UPDATE ON pharmacy_inventories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shipments_updated_at BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
