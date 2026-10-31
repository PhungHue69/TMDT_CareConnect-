/* Quản lý tài khoản cá nhân: thông tin, chế độ giao diện, hồ sơ sức khỏe, sổ địa chỉ, mật khẩu */
(async function () {
    const CC = window.CC;
    let user = await CC.layout.init({ active: 'profile', title: 'Tài khoản' });
    if (!user) return;

    const page = CC.$('#page');
    const GENDERS = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

    async function render() {
        const data = await CC.api('/profile');
        user = data.user;
        CC.auth.setUser(user);
        const hp = data.health_profile || {};
        const simple = user.ui_mode === 'SIMPLE';
        const age = CC.fmt.age(user.date_of_birth);

        page.innerHTML = `
            <div class="stack">
                <section class="card card-hero profile-head">
                    ${CC.avatar(user, 'lg')}
                    <div class="grow">
                        <h2>${CC.esc(user.full_name)}</h2>
                        <div class="muted small">${CC.esc(user.phone)}${age ? ` · ${age} tuổi` : ''}</div>
                    </div>
                    <span class="coin" title="CareCoin">${CC.icon('heart', 'icon-sm')} ${user.care_coin_balance} xu</span>
                </section>

                <div class="grid grid-2">
                    <section class="card">
                        <div class="card-head"><h2>Thông tin cá nhân</h2></div>
                        <form id="info-form" class="form-grid form-grid-2">
                            <div class="field span-2"><label>Họ và tên</label><input class="input" name="full_name" value="${CC.esc(user.full_name)}" required></div>
                            <div class="field"><label>Ngày sinh</label><input class="input" type="date" name="date_of_birth" value="${CC.esc(user.date_of_birth || '')}"></div>
                            <div class="field">
                                <label>Giới tính</label>
                                <select class="select" name="gender">
                                    <option value="">Chưa chọn</option>
                                    ${Object.entries(GENDERS).map(([k, v]) => `<option value="${k}" ${user.gender === k ? 'selected' : ''}>${v}</option>`).join('')}
                                </select>
                            </div>
                            <div class="field span-2"><label>Email</label><input class="input" type="email" name="email" value="${CC.esc(user.email || '')}" placeholder="Không bắt buộc"></div>
                            <div class="field span-2"><label>Link ảnh đại diện</label><input class="input" type="url" name="avatar_url" value="${CC.esc(user.avatar_url || '')}" placeholder="https://..."></div>
                            <div class="span-2"><button class="btn btn-primary" type="submit">Lưu thông tin</button></div>
                        </form>
                    </section>

                    <div class="stack">
                        <section class="card">
                            <div class="card-head"><h2>Chế độ giao diện</h2></div>
                            <div class="mode-options">
                                <button class="mode-option ${!simple ? 'active' : ''}" data-mode="STANDARD">
                                    ${CC.icon('users')}
                                    <span class="strong">Đầy đủ</span>
                                    <span class="small muted">Hiển thị nhiều thông tin trên một màn hình</span>
                                </button>
                                <button class="mode-option ${simple ? 'active' : ''}" data-mode="SIMPLE">
                                    <span class="preview-big">Aa</span>
                                    <span class="strong">Đơn giản</span>
                                    <span class="small muted">Chữ to, nút lớn, thuốc hôm nay lên đầu. Vẫn đủ tính năng</span>
                                </button>
                            </div>
                        </section>

                        <section class="card" id="health">
                            <div class="card-head">
                                <h2>Hồ sơ sức khỏe</h2>
                                <button class="btn btn-sm btn-outline" id="edit-health">${CC.icon('edit', 'icon-sm')} Sửa</button>
                            </div>
                            <div class="info-grid">
                                ${info('Nhóm máu', hp.blood_type)}
                                ${info('Cao / Nặng', hp.height_cm || hp.weight_kg ? `${hp.height_cm || '?'} cm / ${hp.weight_kg || '?'} kg` : '')}
                                ${info('Bệnh nền', hp.chronic_conditions, true)}
                                ${info('Dị ứng', hp.allergies, true)}
                            </div>
                        </section>
                    </div>
                </div>

                <section class="card">
                    <div class="card-head">
                        <h2>Sổ địa chỉ nhận thuốc</h2>
                        <button class="btn btn-sm btn-primary" id="add-address">${CC.icon('plus', 'icon-sm')} Thêm</button>
                    </div>
                    ${data.addresses.length ? data.addresses.map((a) => `
                        <div class="address-item">
                            ${CC.icon('map')}
                            <div class="grow">
                                <div class="row-wrap"><span class="strong">${CC.esc(a.label || 'Địa chỉ')}</span>${a.is_default ? '<span class="badge">Mặc định</span>' : ''}</div>
                                <div class="small">${CC.esc(a.recipient_name)} · ${CC.esc(a.recipient_phone)}</div>
                                <div class="small muted">${CC.esc(a.address_line)}</div>
                            </div>
                            <button class="btn btn-sm btn-ghost" data-edit-address="${a.id}" aria-label="Sửa">${CC.icon('edit', 'icon-sm')}</button>
                            <button class="btn btn-sm btn-ghost" data-delete-address="${a.id}" aria-label="Xóa" style="color:var(--danger)">${CC.icon('trash', 'icon-sm')}</button>
                        </div>`).join('') : `<p class="muted">Chưa có địa chỉ. Thêm địa chỉ nhà mình hoặc nhà bố mẹ để đặt thuốc giao tận nơi.</p>`}
                </section>

                <div class="grid grid-2">
                    <section class="card">
                        <div class="card-head"><h2>Đổi mật khẩu</h2></div>
                        <form id="password-form" class="stack-sm">
                            <input class="input" type="password" name="current_password" placeholder="Mật khẩu hiện tại" autocomplete="current-password" required>
                            <input class="input" type="password" name="new_password" placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" autocomplete="new-password" required>
                            <input class="input" type="password" name="new_password2" placeholder="Nhập lại mật khẩu mới" autocomplete="new-password" required>
                            <button class="btn btn-outline" type="submit">${CC.icon('lock', 'icon-sm')} Đổi mật khẩu</button>
                        </form>
                    </section>
                    <section class="card stack-sm" style="justify-content:center">
                        <button class="btn btn-danger btn-block" id="logout">${CC.icon('logout', 'icon-sm')} Đăng xuất</button>
                        <p class="small muted center">CareConnect · Phân hệ Người mua - Family Care</p>
                    </section>
                </div>
            </div>`;

        bind(data);
        if (location.hash === '#health') CC.$('#health').scrollIntoView({ behavior: 'smooth' });
    }

    function info(label, value, full = false) {
        return `<div class="info-item${full ? ' full' : ''}"><div class="label">${label}</div><div class="value">${value ? CC.esc(value) : '<span class="muted">Chưa có</span>'}</div></div>`;
    }

    function bind(data) {
        const infoForm = CC.$('#info-form');
        infoForm.addEventListener('submit', (e) => {
            e.preventDefault();
            CC.busy(infoForm.querySelector('[type=submit]'), async () => {
                try {
                    const res = await CC.api('/profile', { method: 'PUT', body: CC.formData(infoForm) });
                    CC.auth.setUser(res.user);
                    CC.toast('Đã lưu thông tin', 'success');
                    render();
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        });

        CC.$$('[data-mode]').forEach((b) => b.addEventListener('click', async () => {
            if (b.dataset.mode === user.ui_mode) return;
            try {
                const res = await CC.api('/profile/ui-mode', { method: 'PUT', body: { ui_mode: b.dataset.mode } });
                CC.auth.setUser(res.user);
                CC.layout.rerender();
                CC.toast(res.user.ui_mode === 'SIMPLE' ? 'Đã chuyển sang giao diện đơn giản' : 'Đã chuyển sang giao diện đầy đủ', 'success');
                render();
            } catch (err) {
                CC.toast(err.message, 'error');
            }
        }));

        CC.$('#edit-health').addEventListener('click', () => CC.openHealthForm(data.health_profile, '/profile/health', render));
        CC.$('#add-address').addEventListener('click', () => openAddress());
        CC.$$('[data-edit-address]').forEach((b) => b.addEventListener('click', () =>
            openAddress(data.addresses.find((a) => a.id === Number(b.dataset.editAddress)))
        ));
        CC.$$('[data-delete-address]').forEach((b) => b.addEventListener('click', async () => {
            if (!(await CC.confirm('Xóa địa chỉ này?', { okText: 'Xóa', danger: true }))) return;
            try {
                await CC.api(`/profile/addresses/${b.dataset.deleteAddress}`, { method: 'DELETE' });
                CC.toast('Đã xóa địa chỉ', 'success');
                render();
            } catch (err) {
                CC.toast(err.message, 'error');
            }
        }));

        const pwForm = CC.$('#password-form');
        pwForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const body = CC.formData(pwForm);
            if (body.new_password !== body.new_password2) return CC.toast('Mật khẩu mới nhập lại không khớp', 'error');
            CC.busy(pwForm.querySelector('[type=submit]'), async () => {
                try {
                    await CC.api('/profile/password', { method: 'PUT', body });
                    CC.toast('Đã đổi mật khẩu', 'success');
                    pwForm.reset();
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        });

        CC.$('#logout').addEventListener('click', async () => {
            if (await CC.confirm('Đăng xuất khỏi CareConnect?', { okText: 'Đăng xuất' })) CC.auth.logout();
        });
    }

    // ---------------------------------------------------------------- Địa chỉ
    function openAddress(a) {
        const editing = Boolean(a);
        const x = a || { recipient_name: user.full_name, recipient_phone: user.phone };
        const m = CC.modal(`
            <div class="modal-head"><h2>${editing ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}</h2><button class="icon-btn" data-close>${CC.icon('x')}</button></div>
            <form id="address-form" class="form-grid form-grid-2">
                <div class="field span-2">
                    <label>Tên gợi nhớ</label>
                    <div class="row-wrap" id="label-chips">${['Nhà riêng', 'Nhà Bố mẹ', 'Công ty'].map((l) => `<button type="button" class="chip ${x.label === l ? 'active' : ''}" data-label="${l}">${l}</button>`).join('')}</div>
                    <input class="input" name="label" value="${CC.esc(x.label || '')}" placeholder="Hoặc tự đặt tên">
                </div>
                <div class="field"><label>Người nhận</label><input class="input" name="recipient_name" value="${CC.esc(x.recipient_name || '')}" required></div>
                <div class="field"><label>SĐT người nhận</label><input class="input" name="recipient_phone" type="tel" value="${CC.esc(x.recipient_phone || '')}" required></div>
                <div class="field span-2"><label>Địa chỉ</label><textarea class="textarea" name="address_line" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" required>${CC.esc(x.address_line || '')}</textarea></div>
                <div class="span-2 row-wrap">
                    <button type="button" class="btn btn-sm btn-outline" id="geocode">${CC.icon('map', 'icon-sm')} Tìm tọa độ từ địa chỉ</button>
                    <button type="button" class="btn btn-sm btn-outline" id="locate">Dùng vị trí hiện tại</button>
                </div>
                <div class="field"><label>Vĩ độ</label><input class="input" name="latitude" inputmode="decimal" value="${CC.esc(x.latitude || '')}" required></div>
                <div class="field"><label>Kinh độ</label><input class="input" name="longitude" inputmode="decimal" value="${CC.esc(x.longitude || '')}" required></div>
                <p class="span-2 small muted" style="margin-top:-6px">Tọa độ dùng để tìm nhà thuốc gần địa chỉ nhận trong bán kính 1-5km.</p>
                <label class="check span-2"><input type="checkbox" name="is_default" value="1" ${x.is_default ? 'checked' : ''}> Đặt làm địa chỉ mặc định</label>
                <div class="modal-actions span-2" style="margin-top:0">
                    <button type="button" class="btn btn-outline" data-close>Hủy</button>
                    <button type="submit" class="btn btn-primary">Lưu địa chỉ</button>
                </div>
            </form>`);
        const form = CC.$('#address-form', m.el);

        CC.$$('[data-label]', m.el).forEach((c) => c.addEventListener('click', () => {
            form.label.value = c.dataset.label;
            CC.$$('[data-label]', m.el).forEach((o) => o.classList.toggle('active', o === c));
        }));

        // Tra tọa độ bằng OpenStreetMap Nominatim (miễn phí, không cần API key)
        CC.$('#geocode', m.el).addEventListener('click', (e) => {
            const q = form.address_line.value.trim();
            if (!q) return CC.toast('Nhập địa chỉ trước', 'error');
            CC.busy(e.currentTarget, async () => {
                try {
                    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&q=${encodeURIComponent(q)}`;
                    const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
                    const found = await res.json();
                    if (!found.length) return CC.toast('Không tìm thấy địa chỉ, hãy ghi rõ phường/quận/tỉnh hoặc dùng vị trí hiện tại', 'error');
                    form.latitude.value = Number(found[0].lat).toFixed(6);
                    form.longitude.value = Number(found[0].lon).toFixed(6);
                    CC.toast('Đã lấy tọa độ', 'success');
                } catch (err) {
                    CC.toast('Không tra được tọa độ (cần Internet)', 'error');
                }
            });
        });

        CC.$('#locate', m.el).addEventListener('click', () => {
            if (!navigator.geolocation) return CC.toast('Thiết bị không hỗ trợ định vị', 'error');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    form.latitude.value = pos.coords.latitude.toFixed(6);
                    form.longitude.value = pos.coords.longitude.toFixed(6);
                    CC.toast('Đã lấy vị trí hiện tại', 'success');
                },
                () => CC.toast('Không lấy được vị trí (cần cho phép định vị, trên localhost hoặc https)', 'error')
            );
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const body = CC.formData(form);
            body.is_default = Boolean(body.is_default);
            CC.busy(form.querySelector('[type=submit]'), async () => {
                try {
                    if (editing) await CC.api(`/profile/addresses/${a.id}`, { method: 'PUT', body });
                    else await CC.api('/profile/addresses', { method: 'POST', body });
                    CC.toast('Đã lưu địa chỉ', 'success');
                    m.close();
                    render();
                } catch (err) {
                    CC.toast(err.message, 'error');
                }
            });
        });
    }

    await render();
})();
