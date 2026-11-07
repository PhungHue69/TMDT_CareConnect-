const path = require('path');
const express = require('express');
const { PORT, DEMO_MODE, MISSED_ALERT_MINUTES } = require('./config');
const { requireAuth, requirePharmacist } = require('./middleware/auth');
const { errorHandler } = require('./utils/http');
const { startReminderScheduler } = require('./jobs/reminderScheduler');
const { requireDoctor } = require('./middleware/doctorAuth');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.get('/api/config', (req, res) => {
    res.json({ demo_mode: DEMO_MODE, missed_alert_minutes: MISSED_ALERT_MINUTES });
});

// Health check endpoint cho toàn hệ thống
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected', time: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
    }
});

app.use('/api/auth', require('./routes/auth'));

// Phân hệ Người mua - Family Care (TV1)
app.use('/api/profile', requireAuth, require('./routes/profile'));
app.use('/api/family', requireAuth, require('./routes/family'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/notifications', requireAuth, require('./routes/notifications'));
app.use('/api/notifications', requireAuth, require('./routes/notifications'));

// Phân hệ Bác sĩ - Doctor Portal (TV3)
app.use('/api/doctor', requireAuth, requireDoctor, require('./routes/doctor'));

if (DEMO_MODE) app.use('/api/demo', requireAuth, require('./routes/demo'));

// Phân hệ Nhà thuốc - Pharmacy Portal (TV4)
app.use('/api/pharmacy', requireAuth, requirePharmacist, require('./routes/pharmacy'));

if (DEMO_MODE) app.use('/api/demo', requireAuth, require('./routes/demo'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));
app.use(errorHandler);

// Phục vụ giao diện web trong thư mục frontend/ (cùng địa chỉ với API)
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
app.get('/', (req, res) => res.redirect('/buyer-family/'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`CareConnect đang chạy tại http://localhost:${PORT}`);
    startReminderScheduler();
});


