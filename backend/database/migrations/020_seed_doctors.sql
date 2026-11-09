-- 003_seed_doctors.sql (TV3): 17 ho so bac si mau, co the chay lai nhieu lan
BEGIN;

SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));
SELECT setval('professional_profiles_id_seq', (SELECT COALESCE(MAX(id), 1) FROM professional_profiles));
SELECT setval('wallets_id_seq', (SELECT COALESCE(MAX(id), 1) FROM wallets));

WITH d (phone, full_name, specialty, workplace, years_exp, bio, fee, modes, is_online, rating, rating_count, status, license) AS (
  VALUES
  ('0912000001', 'BS. Nguyễn Thị Hạnh',    'Nội tổng quát',             'Bệnh viện Đa khoa Hà Đông',          12, 'Khám và tư vấn các bệnh nội khoa thường gặp, theo dõi bệnh mạn tính.',          10000, '{CHAT,AUDIO}',       true,  4.80, 124, 'APPROVED', 'CCHN-HN-004321'),
  ('0912000002', 'BS. Trần Quốc Bảo',      'Tim mạch',                  'Bệnh viện Tim Hà Nội',               18, 'Chuyên tăng huyết áp, suy tim, rối loạn nhịp. Tư vấn cho người cao tuổi.',     25000, '{CHAT,AUDIO,VIDEO}', true,  4.90, 210, 'APPROVED', 'CCHN-HN-004322'),
  ('0912000003', 'BS. Lê Thu Hương',       'Nội tiết - Đái tháo đường', 'Bệnh viện Nội tiết Trung ương',      15, 'Điều trị và theo dõi đái tháo đường, bệnh tuyến giáp, rối loạn chuyển hóa.',   20000, '{CHAT,VIDEO}',       true,  4.90, 187, 'APPROVED', 'CCHN-HN-004323'),
  ('0912000004', 'BS. Phạm Đức Minh',      'Nhi khoa',                  'Bệnh viện Nhi Trung ương',           10, 'Khám bệnh thường gặp ở trẻ em, tư vấn dinh dưỡng và tiêm chủng.',              15000, '{CHAT,AUDIO}',       true,  4.70,  96, 'APPROVED', 'CCHN-HN-004324'),
  ('0912000005', 'BS. Hoàng Thị Lan Anh',  'Hô hấp',                    'Bệnh viện Phổi Trung ương',           9, 'Tư vấn hen phế quản, viêm phổi, ho kéo dài.',                                  12000, '{CHAT}',             false, 4.60,  58, 'APPROVED', 'CCHN-HN-004325'),
  ('0912000006', 'BS. Vũ Văn Thành',       'Tiêu hóa',                  'Bệnh viện Bạch Mai',                 14, 'Chuyên dạ dày, gan mật, rối loạn tiêu hóa.',                                   18000, '{CHAT,VIDEO}',       true,  4.80, 143, 'APPROVED', 'CCHN-HN-004326'),
  ('0912000007', 'BS. Đặng Thị Bích',      'Cơ xương khớp',             'Bệnh viện Hữu nghị Việt Đức',        11, 'Tư vấn thoái hóa khớp, loãng xương, đau lưng mạn tính.',                       15000, '{CHAT,AUDIO}',       false, 4.50,  71, 'APPROVED', 'CCHN-HN-004327'),
  ('0912000008', 'BS. Bùi Quang Huy',      'Da liễu',                   'Bệnh viện Da liễu Trung ương',        8, 'Tư vấn mụn, viêm da, dị ứng và các bệnh da thường gặp.',                       10000, '{CHAT}',             true,  4.70,  89, 'APPROVED', 'CCHN-HN-004328'),
  ('0912000009', 'BS. Ngô Thị Phương',     'Tai Mũi Họng',              'Bệnh viện Tai Mũi Họng Trung ương',  13, 'Khám viêm họng, viêm xoang, viêm tai giữa.',                                   15000, '{CHAT,AUDIO}',       true,  4.60,  77, 'APPROVED', 'CCHN-HN-004329'),
  ('0912000010', 'BS. Đỗ Văn Khoa',        'Thần kinh',                 'Bệnh viện Bạch Mai',                 20, 'Tư vấn đau đầu, mất ngủ, sau đột quỵ, rối loạn tiền đình.',                    30000, '{CHAT,AUDIO,VIDEO}', false, 4.90, 165, 'APPROVED', 'CCHN-HN-004330'),
  ('0912000011', 'BS. Lý Thị Thanh Tâm',   'Lão khoa',                  'Bệnh viện Lão khoa Trung ương',      22, 'Chăm sóc người cao tuổi, quản lý bệnh nền huyết áp, tiểu đường.',              20000, '{CHAT,VIDEO}',       true,  5.00, 132, 'APPROVED', 'CCHN-HN-004331'),
  ('0912000012', 'BS. Trịnh Minh Châu',    'Sản phụ khoa',              'Bệnh viện Phụ sản Hà Nội',           12, 'Tư vấn thai kỳ, sức khỏe sinh sản, các bệnh phụ khoa.',                        20000, '{CHAT,AUDIO}',       true,  4.80, 118, 'APPROVED', 'CCHN-HN-004332'),
  ('0912000013', 'BS. Phan Văn Lộc',       'Y học gia đình',            'Phòng khám Đa khoa Cầu Giấy',         7, 'Khám tổng quát, tư vấn sức khỏe cho cả gia đình.',                              5000, '{CHAT}',             true,  4.40,  35, 'APPROVED', 'CCHN-HN-004333'),
  ('0912000014', 'BS. Mai Thị Ngọc',       'Thận - Tiết niệu',          'Bệnh viện Bạch Mai',                 10, 'Tư vấn sỏi thận, viêm đường tiết niệu, suy thận mạn.',                         15000, '{CHAT,AUDIO}',       false, 4.60,  52, 'APPROVED', 'CCHN-HN-004334'),
  ('0912000015', 'BS. Cao Văn Tuấn',       'Mắt',                       'Bệnh viện Mắt Trung ương',            9, 'Tư vấn tật khúc xạ, khô mắt, bệnh võng mạc đái tháo đường.',                   12000, '{CHAT}',             false, NULL,   0, 'PENDING',  'CCHN-HN-004335'),
  ('0912000016', 'BS. Đinh Thị Hoa',       'Răng Hàm Mặt',              'Bệnh viện Răng Hàm Mặt Trung ương',   6, 'Tư vấn chăm sóc răng miệng, niềng răng.',                                       8000, '{CHAT}',             false, NULL,   0, 'PENDING',  'CCHN-HN-004336'),
  ('0912000017', 'BS. Tạ Văn Long',        'Nội tổng quát',             'Phòng khám tư nhân (chưa xác minh)',  3, 'Hồ sơ chưa hợp lệ, dùng để demo trường hợp Admin từ chối.',                    10000, '{CHAT}',             false, NULL,   0, 'REJECTED', 'CCHN-HN-004337')
),
new_users AS (
  INSERT INTO users (phone, password_hash, full_name, role)
  SELECT phone,
         crypt('12345', gen_salt('bf', 10)),
         full_name,
         'DOCTOR'::user_role_enum
  FROM d
  ON CONFLICT (phone) DO NOTHING
  RETURNING id, phone
),
new_profiles AS (
  INSERT INTO professional_profiles
    (user_id, professional_type, license_number, specialty, workplace, years_of_experience,
     bio, consultation_fee, consultation_modes, is_online, rating, rating_count, verification_status)
  SELECT nu.id,
         'DOCTOR'::professional_type_enum,
         d.license, d.specialty, d.workplace, d.years_exp,
         d.bio, d.fee, d.modes::consultation_mode_enum[], d.is_online,
         d.rating, d.rating_count, d.status::verification_status_enum
  FROM new_users nu
  JOIN d ON d.phone = nu.phone
  RETURNING user_id
)
INSERT INTO wallets (owner_type, user_id)
SELECT 'DOCTOR'::wallet_owner_type_enum, user_id
FROM new_profiles
ON CONFLICT DO NOTHING;

COMMIT;
