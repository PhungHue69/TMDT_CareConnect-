/* Form sửa hồ sơ sức khỏe, dùng ở trang Tài khoản (của mình) và Hồ sơ người thân */
(function () {
    const CC = window.CC;
    const BLOOD = ['', 'A', 'B', 'AB', 'O', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

    CC.openHealthForm = function (hp, endpoint, onSaved) {
        const h = hp || {};
        const v = (k) => CC.esc(h[k] === null || h[k] === undefined ? '' : h[k]);
        const m = CC.modal(`
            <div class="modal-head"><h2>Hồ sơ sức khỏe</h2><button class="icon-btn" data-close>${CC.icon('x')}</button></div>
            <form class="form-grid form-grid-2" id="health-form">
                <div class="field">
                    <label>Nhóm máu</label>
                    <select class="select" name="blood_type">${BLOOD.map((b) => `<option value="${b}" ${b === (h.blood_type || '') ? 'selected' : ''}>${b || 'Chưa rõ'}</option>`).join('')}</select>
                </div>
                <div class="row">
                    <div class="field grow"><label>Cao (cm)</label><input class="input" name="height_cm" type="number" min="50" max="250" step="0.1" value="${v('height_cm')}"></div>
                    <div class="field grow"><label>Nặng (kg)</label><input class="input" name="weight_kg" type="number" min="10" max="300" step="0.1" value="${v('weight_kg')}"></div>
                </div>
                <div class="field span-2"><label>Bệnh nền</label><input class="input" name="chronic_conditions" placeholder="Tăng huyết áp, tiểu đường..." value="${v('chronic_conditions')}"></div>
                <div class="field span-2"><label>Dị ứng thuốc / thực phẩm</label><input class="input" name="allergies" placeholder="Ví dụ: Penicillin" value="${v('allergies')}"></div>
                <div class="field span-2"><label>Thuốc đang dùng</label><input class="input" name="current_medications" value="${v('current_medications')}"></div>
                <div class="field"><label>Người liên hệ khẩn cấp</label><input class="input" name="emergency_contact_name" value="${v('emergency_contact_name')}"></div>
                <div class="field"><label>SĐT khẩn cấp</label><input class="input" name="emergency_contact_phone" type="tel" value="${v('emergency_contact_phone')}"></div>
                <div class="field span-2"><label>Ghi chú</label><textarea class="textarea" name="notes">${v('notes')}</textarea></div>
                <div class="modal-actions span-2" style="margin-top:0">
                    <button type="button" class="btn btn-outline" data-close>Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu hồ sơ</button>
                </div>
            </form>`);
        const form = CC.$('#health-form', m.el);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            CC.busy(form.querySelector('[type=submit]'), async () => {
                try {
                    const { health_profile } = await CC.api(endpoint, { method: 'PUT', body: CC.formData(form) });
                    CC.toast('Đã lưu hồ sơ sức khỏe', 'success');
                    m.close();
                    if (onSaved) onSaved(health_profile);
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        });
    };
})();
