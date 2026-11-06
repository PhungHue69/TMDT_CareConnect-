/* CareConnect Doctor Portal (TV3) - đăng nhập Bác sĩ */
(function () {
    const CC = window.CC;
    CC.loginUrl = '/doctor-telehealth/login.html';

    // Đã đăng nhập bằng tài khoản bác sĩ thì vào thẳng trang tổng quan
    const current = CC.auth.user;
    if (CC.auth.token && current && current.role === 'DOCTOR') {
        location.replace('index.html');
        return;
    }

    const form = CC.$('#login-form');
    const errorBox = CC.$('#login-error');

    // Chỉ cho quay lại các trang trong cổng bác sĩ, tránh chuyển hướng sang trang lạ
    function nextUrl() {
        const next = CC.param('next');
        return next && next.startsWith('/doctor-telehealth/') ? next : 'index.html';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.textContent = '';
        const data = CC.formData(form);
        if (!data.phone || !data.password) {
            errorBox.textContent = 'Vui lòng nhập số điện thoại và mật khẩu';
            return;
        }
        try {
            await CC.busy(CC.$('button[type="submit"]', form), async () => {
                // Dùng fetch trực tiếp: nếu tab đang giữ token cũ, CC.api sẽ coi lỗi 401 là hết phiên và tải lại trang
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: data.phone, password: data.password }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error || 'Đăng nhập không thành công');
                if (!body.user || body.user.role !== 'DOCTOR') {
                    throw new Error('Đây không phải tài khoản Bác sĩ. Hãy dùng cổng đăng nhập phù hợp với vai trò của bạn.');
                }
                CC.auth.save(body.token, body.user);
                location.href = nextUrl();
            });
        } catch (err) {
            errorBox.textContent = err.message;
        }
    });
})();
