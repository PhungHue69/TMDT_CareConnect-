const path = require('path');
const express = require('express');
const { PORT, DEMO_MODE, MISSED_ALERT_MINUTES } = require('./config');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./utils/http');
const { startReminderScheduler } = require('./jobs/reminderScheduler');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (req, res) => {
    res.json({ demo_mode: DEMO_MODE, missed_alert_minutes: MISSED_ALERT_MINUTES });
});

app.use('/api/auth', require('./routes/auth'));

// Phân hệ Người mua - Family Care (TV1)
app.use('/api/profile', requireAuth, require('./routes/profile'));
app.use('/api/family', requireAuth, require('./routes/family'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/notifications', requireAuth, require('./routes/notifications'));

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
