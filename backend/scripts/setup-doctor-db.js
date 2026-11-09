const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function setup() {
    const client = await db.pool.connect();
    try {
        // Các file này có thể chạy lại, không xóa dữ liệu đang có.
        for (const file of [
            '020_seed_doctors.sql',
            '024_consultation_fee_credit.sql',
            '025_doctor_wallet_earning.sql',
        ]) {
            await client.query(fs.readFileSync(path.join(__dirname, '../database/migrations', file), 'utf8'));
            console.log(`Đã áp dụng: ${file}`);
        }
        console.log('PostgreSQL đã sẵn sàng cho TV3. Tài khoản mẫu mới: 0912000001 / 12345.');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

setup().catch(error => {
    console.error('Không thể thiết lập database bác sĩ:', error.message);
    process.exitCode = 1;
}).finally(() => db.pool.end());
