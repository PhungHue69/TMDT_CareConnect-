/* CareConnect Doctor Portal (TV3) - trang Tổng quan */
(async function () {
    const CC = window.CC;
    const FEE_MIN = 5000;
    const FEE_MAX = 30000;

    const me = await window.initDoctorLayout('dashboard', 'Tổng quan');
    if (!me) return;

    let doctor = me.doctor;
    const user = me.user;

    const STATUS = {
        APPROVED: { cls: 'ok', text: 'Đã duyệt' },
        PENDING: { cls: 'wait', text: 'Chờ duyệt' },
        REJECTED: { cls: 'no', text: 'Bị từ chối' },
    };

    function renderProfile() {
        const s = STATUS[doctor.verification_status] || STATUS.PENDING;
        const rating = doctor.rating_count > 0
            ? `${doctor.rating.toFixed(1)} (${doctor.rating_count} đánh giá)`
            : 'Chưa có đánh giá';
        CC.$('#profile-card').innerHTML = `
            ${CC.avatar(user, 'lg')}
            <div class="info">
                <div class="name">${CC.esc(user.full_name)}</div>
                <div>${CC.esc(doctor.specialty || 'Chưa cập nhật chuyên khoa')}
                    <span class="dr-badge ${s.cls}" style="margin-left:8px">${s.text}</span></div>
                <dl class="dr-facts">
                    <div><dt>Nơi công tác</dt><dd>${CC.esc(doctor.workplace || 'Chưa cập nhật')}</dd></div>
                    <div><dt>Số chứng chỉ hành nghề</dt><dd>${CC.esc(doctor.license_number)}</dd></div>
                    <div><dt>Kinh nghiệm</dt><dd>${doctor.years_of_experience ? doctor.years_of_experience + ' năm' : 'Chưa cập nhật'}</dd></div>
                    <div><dt>Đánh giá</dt><dd>${rating}</dd></div>
                </dl>
            </div>`;
    }

    function renderOnline() {
        const toggle = CC.$('#online-toggle');
        const approved = doctor.verification_status === 'APPROVED';
        toggle.checked = doctor.is_online;
        toggle.disabled = !approved;
        CC.$('#online-label').textContent = doctor.is_online ? 'Đang nhận khám' : 'Đang tắt nhận khám';
        CC.$('#online-hint').textContent = approved
            ? (doctor.is_online
                ? 'Bệnh nhân thấy bạn trong danh sách bác sĩ trực tuyến.'
                : 'Bật lên để bệnh nhân có thể gửi yêu cầu khám cho bạn.')
            : 'Hồ sơ chưa được Admin duyệt nên chưa thể bật nhận khám.';
    }

    function renderSettings() {
        const form = CC.$('#settings-form');
        form.elements.fee.value = doctor.consultation_fee === null ? '' : doctor.consultation_fee;
        CC.$$('input[name="modes"]', form).forEach((box) => {
            box.checked = doctor.consultation_modes.includes(box.value);
        });
        form.elements.bio.value = doctor.bio || '';
    }

    function renderAll() {
        renderProfile();
        renderOnline();
        renderSettings();
    }

    CC.$('#online-toggle').addEventListener('change', async (e) => {
        const wanted = e.target.checked;
        e.target.disabled = true;
        try {
            const res = await CC.api('/doctor/online', { method: 'PUT', body: { is_online: wanted } });
            doctor = res.doctor;
            CC.toast(wanted ? 'Đã bật nhận khám' : 'Đã tắt nhận khám', 'success');
        } catch (err) {
            CC.toast(err.message, 'danger');
        }
        renderOnline();
    });

    CC.$('#settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const errorBox = CC.$('#settings-error');
        errorBox.textContent = '';

        const fee = Number(form.elements.fee.value);
        const modes = CC.$$('input[name="modes"]:checked', form).map((box) => box.value);
        if (!Number.isInteger(fee) || fee < FEE_MIN || fee > FEE_MAX) {
            errorBox.textContent = 'Phí khám phải từ 5.000đ đến 30.000đ';
            return;
        }
        if (!modes.length) {
            errorBox.textContent = 'Hãy chọn ít nhất một hình thức khám';
            return;
        }
        try {
            await CC.busy(CC.$('button[type="submit"]', form), async () => {
                const res = await CC.api('/doctor/settings', {
                    method: 'PUT',
                    body: { consultation_fee: fee, consultation_modes: modes, bio: form.elements.bio.value },
                });
                doctor = res.doctor;
            });
            CC.toast('Đã lưu phí khám ' + CC.fmt.money(fee), 'success');
            renderAll();
        } catch (err) {
            errorBox.textContent = err.message;
        }
    });

    renderAll();
})();
