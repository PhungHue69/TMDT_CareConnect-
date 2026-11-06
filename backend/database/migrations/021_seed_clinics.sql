-- 004_seed_clinics.sql (TV3): them 9 phong kham mau (cong phong kham demo san co = 10)
-- Du lieu gia, dia chi minh hoa. Co the chay lai nhieu lan.
-- Chay SAU 001, 002, 003.
BEGIN;

SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));
SELECT setval('clinics_id_seq', (SELECT COALESCE(MAX(id), 1) FROM clinics));

WITH c (owner_phone, name, clinic_phone, license, address, lat, lng, status) AS (
  VALUES
  ('0913000001', 'Phòng khám Đa khoa Cầu Giấy (demo)',            '02439000001', 'GPHD-HN-0001', 'Số 12 Trần Thái Tông, Cầu Giấy, Hà Nội',       21.0333, 105.7906, 'APPROVED'),
  ('0913000002', 'Phòng khám Nội tiết Thanh Xuân (demo)',         '02439000002', 'GPHD-HN-0002', 'Số 85 Nguyễn Trãi, Thanh Xuân, Hà Nội',         20.9996, 105.8085, 'APPROVED'),
  ('0913000003', 'Phòng khám Tim mạch Đống Đa (demo)',            '02439000003', 'GPHD-HN-0003', 'Số 40 Tây Sơn, Đống Đa, Hà Nội',                21.0156, 105.8290, 'APPROVED'),
  ('0913000004', 'Phòng khám Nhi Hoàn Kiếm (demo)',               '02439000004', 'GPHD-HN-0004', 'Số 18 Hàng Bài, Hoàn Kiếm, Hà Nội',             21.0285, 105.8542, 'APPROVED'),
  ('0913000005', 'Phòng khám Lão khoa Hà Đông (demo)',            '02439000005', 'GPHD-HN-0005', 'Số 66 Quang Trung, Hà Đông, Hà Nội',            20.9614, 105.7686, 'APPROVED'),
  ('0913000006', 'Phòng khám Đa khoa Long Biên (demo)',           '02439000006', 'GPHD-HN-0006', 'Số 30 Nguyễn Văn Cừ, Long Biên, Hà Nội',        21.0453, 105.8890, 'APPROVED'),
  ('0913000007', 'Phòng khám Tai Mũi Họng Hai Bà Trưng (demo)',   '02439000007', 'GPHD-HN-0007', 'Số 52 Bạch Mai, Hai Bà Trưng, Hà Nội',          21.0069, 105.8561, 'APPROVED'),
  ('0913000008', 'Phòng khám Sản phụ khoa Tây Hồ (demo)',         '02439000008', 'GPHD-HN-0008', 'Số 24 Lạc Long Quân, Tây Hồ, Hà Nội',           21.0707, 105.8187, 'APPROVED'),
  ('0913000009', 'Phòng khám Da liễu Nam Từ Liêm (demo)',         '02439000009', 'GPHD-HN-0009', 'Số 9 Lê Đức Thọ, Nam Từ Liêm, Hà Nội',          21.0122, 105.7640, 'PENDING')
),
new_users AS (
  INSERT INTO users (phone, password_hash, full_name, role)
  SELECT owner_phone,
         (SELECT password_hash FROM users WHERE id = 4),
         name,
         'CLINIC'::user_role_enum
  FROM c
  ON CONFLICT (phone) DO NOTHING
  RETURNING id, phone
)
INSERT INTO clinics (owner_user_id, name, phone, operating_license, address, latitude, longitude, verification_status)
SELECT nu.id, c.name, c.clinic_phone, c.license, c.address, c.lat, c.lng, c.status::verification_status_enum
FROM new_users nu
JOIN c ON c.owner_phone = nu.phone;

COMMIT;

