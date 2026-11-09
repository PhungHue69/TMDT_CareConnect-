// Chạy nền mỗi 30 giây: đổ chuông khi tới giờ uống thuốc, báo cho Con khi Bố mẹ quá hạn chưa xác nhận
const db = require('../db');
const { TIMEZONE, MISSED_ALERT_MINUTES } = require('../config');
const { ringPatient, alertCaregiversMissed } = require('../services/reminders');

const TICK_MS = 30 * 1000;
// Chỉ đổ chuông cho các liều trong 30 phút vừa qua, tránh dồn chuông khi máy chủ mới bật lại
const RING_WINDOW_MINUTES = 30;

async function ringDueReminders() {
    const { rows } = await db.query(
        `WITH t AS (SELECT (now() AT TIME ZONE $1) AS local_now),
         due AS (
             INSERT INTO medication_adherence_logs (reminder_id, scheduled_date, status, reminded_at)
             SELECT r.id, t.local_now::date, 'MISSED', now()
             FROM medication_reminders r CROSS JOIN t
             WHERE r.is_active
               AND r.start_date <= t.local_now::date AND (r.end_date IS NULL OR r.end_date >= t.local_now::date)
               AND (t.local_now::date + r.schedule_time) <= t.local_now
               AND (t.local_now::date + r.schedule_time) > t.local_now - make_interval(mins => $2)
               AND (t.local_now::date + r.schedule_time) >= (r.created_at AT TIME ZONE $1)
             ON CONFLICT (reminder_id, scheduled_date) DO NOTHING
             RETURNING reminder_id, scheduled_date
         )
         SELECT r.*, to_char(due.scheduled_date, 'YYYY-MM-DD') AS scheduled_date
         FROM due JOIN medication_reminders r ON r.id = due.reminder_id`,
        [TIMEZONE, RING_WINDOW_MINUTES]
    );
    for (const reminder of rows) await ringPatient(reminder, reminder.scheduled_date);
}

async function alertMissedDoses() {
    const { rows } = await db.query(
        `UPDATE medication_adherence_logs l SET caregiver_notified_at = now()
         FROM medication_reminders r
         WHERE l.reminder_id = r.id
           AND l.status = 'MISSED' AND l.confirmed_at IS NULL
           AND l.reminded_at IS NOT NULL AND l.caregiver_notified_at IS NULL
           AND l.reminded_at + make_interval(mins => $1) <= now()
         RETURNING r.*`,
        [MISSED_ALERT_MINUTES]
    );
    for (const reminder of rows) await alertCaregiversMissed(reminder);
}

let running = false;
async function tick() {
    if (running) return;
    running = true;
    try {
        await ringDueReminders();
        await alertMissedDoses();
    } catch (err) {
        console.error('[reminderScheduler]', err.message);
    } finally {
        running = false;
    }
}

function startReminderScheduler() {
    tick();
    return setInterval(tick, TICK_MS);
}

module.exports = { startReminderScheduler, tick };
