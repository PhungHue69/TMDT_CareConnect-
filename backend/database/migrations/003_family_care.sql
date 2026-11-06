-- =============================================================================
-- PHÂN HỆ NGƯỜI MUA - FAMILY CARE (Thành viên 1)
-- Bổ sung cho liên kết gia đình bằng mã QR và chuông nhắc uống thuốc
-- =============================================================================

-- Mã mời liên kết: Con tạo mã (hiện kèm QR), Bố mẹ nhập/quét mã trên máy mình để liên kết
CREATE TABLE family_invites (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    caregiver_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL, -- Người được mời là gì của người tạo mã: 'Mẹ', 'Bố'...
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_by_user_id BIGINT REFERENCES users(id),
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_family_invites_caregiver ON family_invites(caregiver_user_id);

-- Thời điểm chuông đổ trên máy Bố mẹ. Quá 30 phút chưa xác nhận thì báo cho Con
ALTER TABLE medication_adherence_logs ADD COLUMN reminded_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_adherence_waiting ON medication_adherence_logs(reminded_at)
    WHERE confirmed_at IS NULL AND caregiver_notified_at IS NULL;
