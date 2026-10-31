const { Pool, types } = require('pg');
const { DATABASE_URL } = require('./config');

// BIGINT/BIGSERIAL trả về số (id của dự án không vượt giới hạn số nguyên an toàn của JS)
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// NUMERIC/DECIMAL trả về số thay vì chuỗi
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// DATE giữ nguyên 'YYYY-MM-DD' để không bị lệch múi giờ
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: DATABASE_URL });

async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    withTransaction,
};
