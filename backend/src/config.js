const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.JWT_SECRET) {
    throw new Error('Thiếu JWT_SECRET trong backend/.env (xem backend/.env.example)');
}

module.exports = {
    PORT: Number(process.env.PORT) || 5000,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    // Lịch uống thuốc lưu theo giờ Việt Nam, máy chủ DB có thể chạy giờ UTC
    TIMEZONE: 'Asia/Ho_Chi_Minh',
    MISSED_ALERT_MINUTES: Number(process.env.MISSED_ALERT_MINUTES) || 30,
    // Bật các API giả lập (ví dụ: nhà thuốc duyệt đơn) khi chưa ghép phân hệ Nhà thuốc
    DEMO_MODE: process.env.NODE_ENV !== 'production',
};
