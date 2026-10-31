class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Bọc route async để lỗi được chuyển tới error handler của Express
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, next) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không đúng định dạng JSON' });
    if (err.code === '23505') return res.status(409).json({ error: 'Dữ liệu đã tồn tại' });
    if (['23514', '22P02', '22007', '22008', '23502'].includes(err.code)) {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại' });
}

module.exports = { HttpError, ah, errorHandler };
