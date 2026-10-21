-- Kích hoạt tiện ích mở rộng tạo UUID tự động và PostGIS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ==========================================
-- 1. TẠO CÁC ENUMS
-- ==========================================
CREATE TYPE user_role AS ENUM ('BUYER', 'DOCTOR', 'PHARMACIST', 'ADMIN');
CREATE TYPE consultation_channel AS ENUM ('VIDEO', 'CHAT');
CREATE TYPE consultation_status AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE prescription_type AS ENUM ('INTERNAL_DOCTOR', 'UPLOADED_PHYSICAL');
CREATE TYPE ai_validation_status AS ENUM ('PENDING', 'APPROVED', 'BLOCKED_SYMPTOM_ONLY');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPING', 'DELIVERED', 'CANCELLED');
CREATE TYPE payment_method AS ENUM ('VIETQR', 'VNPAY', 'MOMO', 'COD');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
CREATE TYPE shipping_provider AS ENUM ('AHAMOVE', 'GRAB_EXPRESS', 'LALAMOVE');
CREATE TYPE shipment_status AS ENUM (
  'IDLE', 'SEARCHING_DRIVER', 'DRIVER_ACCEPTED', 'ARRIVED_AT_PHARMACY', 
  'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'
);

-- ==========================================
-- 2. NHÓM ĐỊNH DANH & NGƯỜI DÙNG (USERS CORE)
-- ==========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role user_role NOT NULL DEFAULT 'BUYER',
    phone VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    fcm_device_token TEXT,
    care_coin_balance INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE delivery_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_name VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    google_place_id VARCHAR(255),
    formatted_address TEXT NOT NULL,
    address_detail VARCHAR(255),
    ward VARCHAR(100),
    district VARCHAR(100),
    city VARCHAR(100),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    is_parent_address BOOLEAN DEFAULT FALSE
);

CREATE TABLE family_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caregiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dependent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(50),
    has_full_control BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pharmacy_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pharmacy_name VARCHAR(255) NOT NULL,
    gpp_license VARCHAR(100) NOT NULL,
    google_place_id VARCHAR(255),
    formatted_address TEXT NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    is_pro_seller BOOLEAN DEFAULT FALSE
);

CREATE TABLE doctor_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(100) NOT NULL,
    consultation_fee DECIMAL(10, 2) DEFAULT 15000,
    free_fee_on_purchase BOOLEAN DEFAULT TRUE,
    linked_pharmacy_id UUID REFERENCES pharmacy_profiles(id) ON DELETE SET NULL
);

-- ==========================================
-- 3. NHÓM DƯỢC PHẨM & KHO HÀNG
-- ==========================================
CREATE TABLE drug_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL
);

CREATE TABLE master_drugs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES drug_categories(id) ON DELETE SET NULL,
    drug_name VARCHAR(255) NOT NULL,
    active_ingredient VARCHAR(255),
    manufacturer VARCHAR(255),
    administration_route VARCHAR(100),
    unit VARCHAR(50),
    is_rx BOOLEAN DEFAULT FALSE
);

CREATE TABLE pharmacy_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacy_profiles(id) ON DELETE CASCADE,
    drug_id UUID NOT NULL REFERENCES master_drugs(id) ON DELETE RESTRICT,
    unit_price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- ==========================================
-- 4. NHÓM KHÁM BỆNH & TOA THUỐC
-- ==========================================
CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id),
    booker_id UUID NOT NULL REFERENCES users(id),
    doctor_id UUID NOT NULL REFERENCES doctor_profiles(id),
    channel consultation_channel DEFAULT 'CHAT',
    fee_amount DECIMAL(10, 2) DEFAULT 15000,
    status consultation_status DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES users(id),
    prescription_type prescription_type NOT NULL,
    raw_image_url TEXT,
    ai_validation_status ai_validation_status DEFAULT 'PENDING',
    ai_extracted_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescription_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    drug_id UUID REFERENCES master_drugs(id) ON DELETE SET NULL,
    raw_drug_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1
);

-- ==========================================
-- 5. NHÓM ĐƠN HÀNG, VẬN CHUYỂN & THANH TOÁN
-- ==========================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_code VARCHAR(30) UNIQUE NOT NULL,
    buyer_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID NOT NULL REFERENCES users(id),
    delivery_address_id UUID NOT NULL REFERENCES delivery_addresses(id),
    pharmacy_id UUID NOT NULL REFERENCES pharmacy_profiles(id),
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    original_drug_total DECIMAL(10, 2) NOT NULL,
    consultation_deduction DECIMAL(10, 2) DEFAULT 0,
    shipping_fee DECIMAL(10, 2) DEFAULT 0,
    final_amount DECIMAL(10, 2) NOT NULL,
    order_status order_status DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    inventory_id UUID NOT NULL REFERENCES pharmacy_inventory(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE third_party_shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider shipping_provider NOT NULL,
    third_party_order_id VARCHAR(100) NOT NULL,
    tracking_code VARCHAR(100),
    tracking_url TEXT,
    driver_name VARCHAR(255),
    driver_phone VARCHAR(20),
    driver_plate_number VARCHAR(30),
    driver_photo_url TEXT,
    actual_distance_km DECIMAL(5, 2),
    third_party_fee_actual DECIMAL(10, 2),
    status shipment_status DEFAULT 'IDLE',
    proof_of_delivery_url TEXT,
    failure_reason TEXT,
    driver_assigned_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
    method payment_method NOT NULL,
    transaction_ref VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    status payment_status DEFAULT 'PENDING',
    paid_at TIMESTAMP WITH TIME ZONE
);

-- ==========================================
-- 6. NHẮC UỐNG THUỐC GIA ĐÌNH
-- ==========================================
CREATE TABLE medication_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caregiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    drug_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(255),
    reminder_times TEXT[] NOT NULL,
    is_taken BOOLEAN DEFAULT FALSE,
    last_taken_at TIMESTAMP WITH TIME ZONE
);