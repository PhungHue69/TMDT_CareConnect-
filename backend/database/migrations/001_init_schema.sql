-- Kích hoạt tiện ích mở rộng tạo UUID tự động và PostGIS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- ENUM TYPES DEFINITION
-- -----------------------------------------------------------------------------
CREATE TYPE user_role_enum AS ENUM ('BUYER', 'DOCTOR', 'PHARMACIST', 'CLINIC', 'ADMIN');
CREATE TYPE kyc_status_enum AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE family_link_status_enum AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');
CREATE TYPE verification_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE ai_validation_status_enum AS ENUM ('APPROVED', 'REJECTED_NOT_RX', 'PENDING_HUMAN');
CREATE TYPE consultation_status_enum AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE payment_method_enum AS ENUM ('ONLINE_ESCROW', 'COD');
CREATE TYPE payment_status_enum AS ENUM ('PENDING', 'HOLDING_ESCROW', 'RELEASED', 'REFUNDED');
CREATE TYPE shipping_status_enum AS ENUM ('PREPARING', 'PICKED_UP', 'DELIVERED', 'CANCELLED');
CREATE TYPE shipping_provider_enum AS ENUM ('AHAMOVE', 'GRAB_EXPRESS', 'LALAMOVE', 'SHOPEE_FOOD', 'INTERNAL_SHIPPER');
CREATE TYPE shipment_status_enum AS ENUM ('PENDING', 'ASSIGNING_DRIVER', 'DRIVER_ACCEPTED', 'PICKING_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED');
CREATE TYPE wallet_owner_type_enum AS ENUM ('SYSTEM', 'DOCTOR', 'PHARMACY');
CREATE TYPE wallet_tx_type_enum AS ENUM ('ESCROW_HOLD', 'COMMISSION_DEDUCT', 'SHIPPING_SPREAD', 'PAYOUT_RELEASE');
CREATE TYPE adherence_status_enum AS ENUM ('TAKEN', 'MISSED', 'SKIPPED');
CREATE TYPE subscription_plan_enum AS ENUM ('MONTHLY_49K', 'ANNUAL_499K');
CREATE TYPE booking_status_enum AS ENUM ('CONFIRMED', 'COMPLETED', 'CANCELLED');

-- =============================================================================
-- PHÂN HỆ 1: USER & FAMILY DOMAIN (TÀI KHOẢN & LIÊN KẾT GIA ĐÌNH)
-- =============================================================================

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    avatar_url VARCHAR(500), -- Ảnh đại diện cá nhân
    role user_role_enum NOT NULL DEFAULT 'BUYER',
    kyc_status kyc_status_enum NOT NULL DEFAULT 'PENDING',
    care_coin_balance INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    caregiver_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dependent_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL,
    permissions_json JSONB,
    status family_link_status_enum NOT NULL DEFAULT 'PENDING',
    invite_code VARCHAR(20) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_different_users CHECK (caregiver_user_id <> dependent_user_id)
);

CREATE TABLE care_coin_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'EARN_PURCHASE', 'EARN_ADHERENCE', 'REDEEM'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PHÂN HỆ 2: PROVIDER & MERCHANT DOMAIN (ĐỐI TÁC Y TẾ & GIAN HÀNG O2O)
-- =============================================================================

CREATE TABLE professional_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(100) UNIQUE NOT NULL,
    avatar_url VARCHAR(500), -- Ảnh chân dung Bác sĩ
    license_image_url VARCHAR(500), -- Ảnh chụp Giấy chứng chỉ hành nghề (CCHN)
    consultation_fee DECIMAL(12, 2) NOT NULL DEFAULT 15000.00,
    free_fee_on_purchase BOOLEAN NOT NULL DEFAULT TRUE,
    verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pharmacies (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    gpp_certificate VARCHAR(100) NOT NULL,
    storefront_image_url VARCHAR(500), -- Ảnh chụp mặt tiền Nhà thuốc
    gpp_certificate_image_url VARCHAR(500), -- Ảnh chụp Giấy chứng nhận đạt chuẩn GPP
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(Point, 4326),
    is_pro_seller BOOLEAN NOT NULL DEFAULT FALSE,
    rating DECIMAL(3,2) DEFAULT 5.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinics (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    operating_license VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(Point, 4326),
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
    active_ingredient VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100),
    is_prescription_only BOOLEAN NOT NULL DEFAULT FALSE,
    unit VARCHAR(50) NOT NULL,
    image_url VARCHAR(500), -- Ảnh đại diện bao bì chính của sản phẩm
    gallery_images JSONB DEFAULT '[]'::jsonb, -- Danh sách ảnh chi tiết (mặt trước, mặt sau, viên)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pharmacy_inventories (
    id BIGSERIAL PRIMARY KEY,
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    master_drug_id BIGINT NOT NULL REFERENCES master_drugs(id) ON DELETE CASCADE,
    stock_quantity INT NOT NULL DEFAULT 0,
    price DECIMAL(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'IN_STOCK',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pharmacy_drug UNIQUE(pharmacy_id, master_drug_id)
);

-- =============================================================================
-- PHÂN HỆ 4: TELEHEALTH & AI DOMAIN (KHÁM BỆNH & ĐƠN THUỐC AI GUARDRAIL)
-- =============================================================================

CREATE TABLE consultations (
    id BIGSERIAL PRIMARY KEY,
    patient_user_id BIGINT NOT NULL REFERENCES users(id),
    doctor_profile_id BIGINT NOT NULL REFERENCES professional_profiles(id),
    fee_amount DECIMAL(12, 2) NOT NULL,
    status consultation_status_enum NOT NULL DEFAULT 'WAITING',
    diagnosis TEXT,
    symptom_image_urls JSONB DEFAULT '[]'::jsonb, -- Ảnh chụp triệu chứng/phát ban ngoài da
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescriptions (
    id BIGSERIAL PRIMARY KEY,
    patient_user_id BIGINT NOT NULL REFERENCES users(id),
    doctor_id BIGINT REFERENCES users(id),
    consultation_id BIGINT REFERENCES consultations(id),
    prescription_image_url VARCHAR(500), -- Ảnh chụp đơn thuốc gốc phục vụ AI OCR
    ocr_raw_text TEXT,
    ai_validation_status ai_validation_status_enum NOT NULL DEFAULT 'APPROVED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescription_items (
    id BIGSERIAL PRIMARY KEY,
    prescription_id BIGINT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    master_drug_id BIGINT REFERENCES master_drugs(id),
    drug_name_raw VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    quantity INT NOT NULL DEFAULT 1,
    usage_instructions TEXT
);

CREATE TABLE prescription_ai_logs (
    id BIGSERIAL PRIMARY KEY,
    prescription_id BIGINT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    input_payload TEXT NOT NULL,
    ai_response_json JSONB NOT NULL,
    flagged_reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PHÂN HỆ 5: ORDER & FINANCIAL LEDGER DOMAIN (ĐƠN HÀNG & SỔ CÁI ESCROW)
-- =============================================================================

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    buyer_user_id BIGINT NOT NULL REFERENCES users(id),
    recipient_user_id BIGINT NOT NULL REFERENCES users(id),
    pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id),
    prescription_id BIGINT REFERENCES prescriptions(id),
    subtotal_amount DECIMAL(12, 2) NOT NULL,
    consultation_discount_amount DECIMAL(12, 2) DEFAULT 0.00,
    shipping_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(12, 2) NOT NULL,
    payment_method payment_method_enum NOT NULL DEFAULT 'ONLINE_ESCROW',
    payment_status payment_status_enum NOT NULL DEFAULT 'PENDING',
    shipping_status shipping_status_enum NOT NULL DEFAULT 'PREPARING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    pharmacy_inventory_id BIGINT NOT NULL REFERENCES pharmacy_inventories(id),
    unit_price DECIMAL(12, 2) NOT NULL,
    quantity INT NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL
);

CREATE TABLE order_status_logs (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
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

CREATE TABLE wallets (
    id BIGSERIAL PRIMARY KEY,
    owner_type wallet_owner_type_enum NOT NULL,
    owner_id BIGINT NOT NULL,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    pending_escrow_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_wallet_owner UNIQUE(owner_type, owner_id)
);

CREATE TABLE wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    order_id BIGINT REFERENCES orders(id),
    consultation_id BIGINT REFERENCES consultations(id),
    transaction_type wallet_tx_type_enum NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
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
    drug_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    pill_image_url VARCHAR(500), -- Ảnh chụp viên/vỉ thuốc trực quan cho Bố mẹ
    schedule_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE medication_adherence_logs (
    id BIGSERIAL PRIMARY KEY,
    reminder_id BIGINT NOT NULL REFERENCES medication_reminders(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    status adherence_status_enum NOT NULL DEFAULT 'MISSED',
    confirmed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_reminder_date UNIQUE(reminder_id, scheduled_date)
);

CREATE TABLE family_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type subscription_plan_enum NOT NULL DEFAULT 'MONTHLY_49K',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinic_bookings (
    id BIGSERIAL PRIMARY KEY,
    buyer_user_id BIGINT NOT NULL REFERENCES users(id),
    patient_user_id BIGINT NOT NULL REFERENCES users(id),
    clinic_id BIGINT NOT NULL REFERENCES clinics(id),
    booking_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status booking_status_enum NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reviews (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    pharmacy_id BIGINT REFERENCES pharmacies(id),
    clinic_id BIGINT REFERENCES clinics(id),
    doctor_profile_id BIGINT REFERENCES professional_profiles(id),
    rating INT CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    review_image_urls JSONB DEFAULT '[]'::jsonb, -- Ảnh thực tế từ đánh giá của khách hàng
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX idx_orders_pharmacy ON orders(pharmacy_id);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_inventories_pharmacy_drug ON pharmacy_inventories(pharmacy_id, master_drug_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_user_id);
CREATE INDEX idx_prescriptions_ai_status ON prescriptions(ai_validation_status);
CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_adherence_reminder_date ON medication_adherence_logs(reminder_id, scheduled_date);
CREATE INDEX idx_family_links_caregiver ON family_links(caregiver_user_id);
CREATE INDEX idx_family_links_dependent ON family_links(dependent_user_id);

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