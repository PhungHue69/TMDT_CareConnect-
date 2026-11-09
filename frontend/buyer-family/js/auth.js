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

    // Đã có phiên đăng nhập: cho tiếp tục, hoặc đăng nhập tài khoản khác ngay trong tab này
    // (tab khác vẫn giữ tài khoản của nó, tiện khi demo Con và Bố mẹ trên cùng máy)
    const current = CC.auth.token && CC.auth.user;
    const formEl = CC.$('#login-form') || CC.$('#register-form');
    if (current && formEl) {
        formEl.insertAdjacentHTML('beforebegin', `
            <div class="card card-soft row" style="margin-bottom:16px">
                ${CC.avatar(current)}
                <div class="grow"><div class="small muted">Đang đăng nhập</div><div class="strong">${CC.esc(current.full_name)}</div></div>
                <a class="btn btn-sm btn-primary" href="${CC.esc(target)}">Tiếp tục</a>
            </div>`);
    }

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
