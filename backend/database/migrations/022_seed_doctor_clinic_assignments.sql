
BEGIN;

INSERT INTO doctor_clinic_assignments (doctor_profile_id, clinic_id, schedule_json)
SELECT p.id, c.id, a.sched::jsonb
FROM (
  VALUES
  ('BS. Lê Văn Hùng',       'Phòng khám Đa khoa An Bình (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,2,3,4,5],"from":"08:00","to":"11:30"},{"days":[1,2,3,4,5],"from":"14:00","to":"17:30"}]}'),
  ('BS. Phạm Thị Mai',      'Phòng khám Đa khoa An Bình (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[6],"from":"08:00","to":"11:30"}]}'),
  ('BS. Nguyễn Thị Hạnh',   'Phòng khám Đa khoa Cầu Giấy (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,2,3,4,5],"from":"08:00","to":"11:30"}]}'),
  ('BS. Trần Quốc Bảo',     'Phòng khám Tim mạch Đống Đa (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,3,5],"from":"14:00","to":"17:30"}]}'),
  ('BS. Lê Thu Hương',      'Phòng khám Nội tiết Thanh Xuân (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[2,4],"from":"08:00","to":"11:30"}]}'),
  ('BS. Lê Thu Hương',      'Phòng khám Đa khoa An Bình (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[6],"from":"14:00","to":"17:30"}]}'),
  ('BS. Phạm Đức Minh',     'Phòng khám Nhi Hoàn Kiếm (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,2,3,4,5],"from":"14:00","to":"17:30"}]}'),
  ('BS. Hoàng Thị Lan Anh', 'Phòng khám Lão khoa Hà Đông (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[3],"from":"08:00","to":"11:30"}]}'),
  ('BS. Vũ Văn Thành',      'Phòng khám Đa khoa Long Biên (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[2,4],"from":"14:00","to":"17:30"}]}'),
  ('BS. Đặng Thị Bích',     'Phòng khám Đa khoa Cầu Giấy (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[6],"from":"08:00","to":"11:30"}]}'),
  ('BS. Bùi Quang Huy',     'Phòng khám Đa khoa Long Biên (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[3],"from":"14:00","to":"17:30"}]}'),
  ('BS. Ngô Thị Phương',    'Phòng khám Tai Mũi Họng Hai Bà Trưng (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,2,3,4,5],"from":"08:00","to":"11:30"}]}'),
  ('BS. Đỗ Văn Khoa',       'Phòng khám Tim mạch Đống Đa (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[6],"from":"08:00","to":"11:30"}]}'),
  ('BS. Lý Thị Thanh Tâm',  'Phòng khám Lão khoa Hà Đông (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,2,4],"from":"08:00","to":"11:30"}]}'),
  ('BS. Trịnh Minh Châu',   'Phòng khám Sản phụ khoa Tây Hồ (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,2,3,4,5],"from":"14:00","to":"17:30"}]}'),
  ('BS. Phan Văn Lộc',      'Phòng khám Đa khoa Cầu Giấy (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[1,2,3,4,5],"from":"14:00","to":"17:30"}]}'),
  ('BS. Mai Thị Ngọc',      'Phòng khám Nội tiết Thanh Xuân (demo)',
    '{"slot_minutes":30,"weekly":[{"days":[5],"from":"14:00","to":"17:30"}]}')
) AS a (doctor_name, clinic_name, sched)
JOIN users u                 ON u.full_name = a.doctor_name AND u.role = 'DOCTOR'::user_role_enum
JOIN professional_profiles p ON p.user_id = u.id
JOIN clinics c               ON c.name = a.clinic_name
ON CONFLICT (doctor_profile_id, clinic_id) DO NOTHING;

COMMIT;