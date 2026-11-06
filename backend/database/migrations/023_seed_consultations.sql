WITH pat AS (
  SELECT id FROM users WHERE role <> 'DOCTOR' ORDER BY id LIMIT 3
), doc AS (
  SELECT pp.id FROM professional_profiles pp
  JOIN users u ON u.id = pp.user_id WHERE u.phone = '0912000002'
)
INSERT INTO consultations
  (booker_user_id, patient_user_id, doctor_profile_id, mode, fee_amount,
   commission_rate, commission_amount, status, symptom_description, scheduled_at)
SELECT pat.id, pat.id, doc.id, 'CHAT', 25000, 0.10, 2500, 'WAITING',
       'Huyết áp cao, hay chóng mặt buổi sáng, xin tư vấn thuốc.', NOW()
FROM pat, doc;
UPDATE consultations c
SET fee_amount = pp.consultation_fee,
    commission_amount = ROUND(pp.consultation_fee * c.commission_rate, 2)
FROM professional_profiles pp
WHERE pp.id = c.doctor_profile_id AND c.status = 'WAITING';