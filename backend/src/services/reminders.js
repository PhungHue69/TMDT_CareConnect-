const db = require('../db');
const { TIMEZONE, MISSED_ALERT_MINUTES } = require('../config');
const { notify } = require('./notifications');
const { getActiveCaregivers } = require('./family');

/*
 * Trạng thái một liều trong ngày (today_status):
 *   UPCOMING - chưa tới giờ
 *   DUE      - chuông đã đổ, đang chờ bấm "Đã uống" (trong MISSED_ALERT_MINUTES phút)
 *   TAKEN / SKIPPED - đã xác nhận
 *   MISSED   - quá hạn mà chưa xác nhận
 *   NEW      - lịch vừa tạo sau giờ uống hôm nay, bắt đầu tính từ ngày mai
 */
const TODAY_SQL = `
WITH t AS (SELECT (now() AT TIME ZONE $2) AS local_now)
SELECT r.id, r.patient_user_id, r.drug_name, r.dosage, r.meal_note, r.pill_image_url, r.prescription_id,
       to_char(r.schedule_time, 'HH24:MI') AS schedule_time,
       l.status AS log_status, l.confirmed_at, l.reminded_at, l.caregiver_notified_at,
       CASE
           WHEN l.status IN ('TAKEN', 'SKIPPED') THEN l.status::text
           WHEN l.reminded_at IS NOT NULL THEN
               CASE WHEN l.reminded_at + make_interval(mins => $3) > now() THEN 'DUE' ELSE 'MISSED' END
           WHEN (t.local_now::date + r.schedule_time) > t.local_now THEN 'UPCOMING'
           WHEN (t.local_now::date + r.schedule_time) < (r.created_at AT TIME ZONE $2) THEN 'NEW'
           WHEN (t.local_now::date + r.schedule_time) + make_interval(mins => $3) > t.local_now THEN 'DUE'
           ELSE 'MISSED'
       END AS today_status
FROM medication_reminders r
CROSS JOIN t
LEFT JOIN medication_adherence_logs l ON l.reminder_id = r.id AND l.scheduled_date = t.local_now::date
WHERE r.patient_user_id = ANY($1::bigint[]) AND r.is_active
  AND r.start_date <= t.local_now::date AND (r.end_date IS NULL OR r.end_date >= t.local_now::date)
ORDER BY r.schedule_time, r.drug_name`;

async function getTodayDoses(patientIds) {
    const { rows } = await db.query(TODAY_SQL, [patientIds, TIMEZONE, MISSED_ALERT_MINUTES]);
    return rows;
}

function summarize(doses) {
    const s = { total: doses.length, taken: 0, skipped: 0, missed: 0, due: 0, upcoming: 0 };
    for (const d of doses) {
        if (d.today_status === 'TAKEN') s.taken++;
        else if (d.today_status === 'SKIPPED') s.skipped++;
        else if (d.today_status === 'MISSED') s.missed++;
        else if (d.today_status === 'DUE') s.due++;
        else s.upcoming++;
    }
    return s;
}

// Báo cáo tuân thủ N ngày gần nhất (gồm hôm nay)
async function getHistory(patientId, days = 7) {
    const { rows } = await db.query(
        `WITH t AS (SELECT (now() AT TIME ZONE $2) AS local_now),
         d AS (
             SELECT generate_series(t.local_now::date - ($3::int - 1), t.local_now::date, interval '1 day')::date AS day
             FROM t
         )
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day, r.id AS reminder_id, r.drug_name, r.dosage,
                to_char(r.schedule_time, 'HH24:MI') AS schedule_time, l.confirmed_at,
                CASE
                    WHEN l.status IN ('TAKEN', 'SKIPPED') THEN l.status::text
                    WHEN (d.day + r.schedule_time) > t.local_now THEN 'UPCOMING'
                    WHEN l.reminded_at IS NOT NULL AND l.reminded_at + make_interval(mins => $4) > now() THEN 'DUE'
                    WHEN l.id IS NULL AND (d.day + r.schedule_time) + make_interval(mins => $4) > t.local_now THEN 'DUE'
                    ELSE 'MISSED'
                END AS status
         FROM d
         CROSS JOIN t
         JOIN medication_reminders r ON r.patient_user_id = $1
              AND r.start_date <= d.day AND (r.end_date IS NULL OR r.end_date >= d.day)
         LEFT JOIN medication_adherence_logs l ON l.reminder_id = r.id AND l.scheduled_date = d.day
         WHERE (l.id IS NOT NULL OR (r.is_active AND (d.day + r.schedule_time) >= (r.created_at AT TIME ZONE $2)))
         ORDER BY d.day DESC, r.schedule_time`,
        [patientId, TIMEZONE, days, MISSED_ALERT_MINUTES]
    );

    const byDay = new Map();
    for (const row of rows) {
        if (!byDay.has(row.day)) byDay.set(row.day, { date: row.day, total: 0, taken: 0, skipped: 0, missed: 0, items: [] });
        const day = byDay.get(row.day);
        day.items.push(row);
        if (row.status === 'UPCOMING' || row.status === 'DUE') continue;
        day.total++;
        if (row.status === 'TAKEN') day.taken++;
        else if (row.status === 'SKIPPED') day.skipped++;
        else day.missed++;
    }
    const list = [...byDay.values()];
    const total = list.reduce((a, d) => a + d.total, 0);
    const taken = list.reduce((a, d) => a + d.taken, 0);
    return { days: list, total, taken, adherence_rate: total ? Math.round((taken / total) * 100) : null };
}

const formatTime = (date) =>
    new Date(date).toLocaleTimeString('vi-VN', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });

const shortTime = (t) => String(t).slice(0, 5);

// Chuông đổ trên máy người uống thuốc
async function ringPatient(reminder, scheduledDate) {
    const meal = reminder.meal_note ? ` (${reminder.meal_note})` : '';
    await notify(reminder.patient_user_id, {
        type: 'MEDICATION_REMINDER',
        title: 'Đến giờ uống thuốc',
        body: `${reminder.drug_name} - ${reminder.dosage}${meal} · lịch ${shortTime(reminder.schedule_time)}`,
        data: {
            kind: 'RING',
            reminder_id: reminder.id,
            scheduled_date: scheduledDate,
            drug_name: reminder.drug_name,
            dosage: reminder.dosage,
            meal_note: reminder.meal_note,
            schedule_time: shortTime(reminder.schedule_time),
            pill_image_url: reminder.pill_image_url,
        },
    });
}

// Quá hạn chưa bấm "Đã uống" -> báo cho tất cả Con đang chăm sóc
async function alertCaregiversMissed(reminder) {
    const { rows } = await db.query('SELECT full_name, phone FROM users WHERE id = $1', [reminder.patient_user_id]);
    const patient = rows[0];
    for (const c of await getActiveCaregivers(reminder.patient_user_id)) {
        await notify(c.id, {
            type: 'MISSED_DOSE_ALERT',
            title: `${c.relationship} chưa uống thuốc`,
            body: `${patient.full_name} chưa bấm "Đã uống" ${reminder.drug_name} (lịch ${shortTime(reminder.schedule_time)}) sau ${MISSED_ALERT_MINUTES} phút. Hãy gọi nhắc ${c.relationship.toLowerCase()} nhé.`,
            data: {
                kind: 'MISSED_DOSE',
                reminder_id: reminder.id,
                patient_id: reminder.patient_user_id,
                patient_name: patient.full_name,
                patient_phone: patient.phone,
                relationship: c.relationship,
            },
        });
    }
}

// Bố mẹ xác nhận Đã uống/Bỏ qua -> báo cho các Con (trừ người vừa thao tác hộ)
async function notifyCaregiversConfirmed(reminder, status, actorId, confirmedAt) {
    const { rows } = await db.query('SELECT full_name FROM users WHERE id = $1', [reminder.patient_user_id]);
    const patientName = rows[0].full_name;
    const time = shortTime(reminder.schedule_time);
    for (const c of await getActiveCaregivers(reminder.patient_user_id)) {
        if (c.id === Number(actorId)) continue;
        const taken = status === 'TAKEN';
        await notify(c.id, {
            type: 'MEDICATION_REMINDER',
            title: taken ? `${c.relationship} đã uống thuốc` : `${c.relationship} bỏ qua một liều thuốc`,
            body: taken
                ? `${patientName} đã uống ${reminder.drug_name} (${reminder.dosage}) - lịch ${time}, xác nhận lúc ${formatTime(confirmedAt)}.`
                : `${patientName} đã bấm bỏ qua ${reminder.drug_name} (lịch ${time}).`,
            data: { kind: taken ? 'DOSE_TAKEN' : 'DOSE_SKIPPED', reminder_id: reminder.id, patient_id: reminder.patient_user_id },
        });
    }
}

module.exports = {
    getTodayDoses,
    summarize,
    getHistory,
    ringPatient,
    alertCaregiversMissed,
    notifyCaregiversConfirmed,
};
