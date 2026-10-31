/* Đăng nhập / Đăng ký */
(function () {
    const CC = window.CC;
    const next = CC.param('next');
    // Chỉ cho chuyển hướng nội bộ
    const target = next && next.startsWith('/') && !next.startsWith('//') ? next : 'index.html';

    CC.$('#brand-icon').innerHTML = CC.icon('heart');

    // Giữ tham số next khi chuyển qua lại giữa đăng nhập và đăng ký (ví dụ khi bố mẹ quét QR mà chưa có tài khoản)
    const suffix = next ? '?next=' + encodeURIComponent(next) : '';
    const reg = CC.$('#register-link');
    const log = CC.$('#login-link');
    if (reg) reg.href += suffix;
    if (log) log.href += suffix;

    if (CC.auth.token) location.replace(target);

    function finish(data) {
        CC.auth.save(data.token, data.user);
        location.replace(target);
    }

    const loginForm = CC.$('#login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const body = CC.formData(loginForm);
            CC.busy(loginForm.querySelector('[type=submit]'), async () => {
                try {
                    finish(await CC.api('/auth/login', { method: 'POST', body }));
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        });
        CC.$$('[data-demo]').forEach((btn) =>
            btn.addEventListener('click', () => {
                loginForm.phone.value = btn.dataset.demo;
                loginForm.password.value = '123456';
                loginForm.requestSubmit();
            })
        );
    }

    const registerForm = CC.$('#register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const body = CC.formData(registerForm);
            if (body.password !== body.password2) return CC.toast('Mật khẩu nhập lại không khớp', 'error');
            body.ui_mode = body.simple ? 'SIMPLE' : 'STANDARD';
            delete body.password2;
            delete body.simple;
            CC.busy(registerForm.querySelector('[type=submit]'), async () => {
                try {
                    finish(await CC.api('/auth/register', { method: 'POST', body }));
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        });
    }
})();
