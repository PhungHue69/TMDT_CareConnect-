/* =============================================================================
   CareConnect Pharmacy Portal - Login Logic
   ============================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const phoneInput = document.getElementById('phone');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('btn-submit');

    // Nút đăng nhập nhanh demo
    document.querySelectorAll('.demo-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            phoneInput.value = btn.dataset.phone;
            passwordInput.value = btn.dataset.pass;
            await handleLogin();
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });

    async function handleLogin() {
        const phone = phoneInput.value.trim();
        const password = passwordInput.value;

        if (!phone) {
            CC.toast('Vui lòng nhập số điện thoại Dược sĩ', 'warning');
            phoneInput.focus();
            return;
        }
        if (!password) {
            CC.toast('Vui lòng nhập mật khẩu', 'warning');
            passwordInput.focus();
            return;
        }

        await CC.busy(submitBtn, async () => {
            try {
                const res = await CC.api('/auth/login', {
                    method: 'POST',
                    body: { phone, password }
                });

                if (res.user.role !== 'PHARMACIST') {
                    CC.toast('Tài khoản này không phải Dược sĩ / Quản lý nhà thuốc!', 'danger');
                    return;
                }

                // Lưu phiên đăng nhập
                CC.auth.save(res.token, res.user);
                CC.toast('Đăng nhập ca trực thành công!', 'success');

                setTimeout(() => {
                    location.href = 'index.html';
                }, 500);
            } catch (err) {
                CC.toast(err.message || 'Số điện thoại hoặc mật khẩu không chính xác', 'danger');
            }
        });
    }
});
