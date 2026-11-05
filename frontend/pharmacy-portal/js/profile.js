/* =============================================================================
   CareConnect Pharmacy Portal - Profile & GPP Management Logic
   ============================================================================= */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        // Khởi tạo layout chung (activeNav = 'profile')
        const pharmacyData = await initPortalLayout('profile', 'Thông tin nhà thuốc & Hồ sơ GPP');
        if (!pharmacyData) return;

        setupEventListeners();
        await loadProfileData();
    });

    function setupEventListeners() {
        // Lấy tọa độ GPS hiện tại từ trình duyệt
        CC.$('#btn-get-gps').addEventListener('click', () => {
            if (!navigator.geolocation) {
                CC.toast('Trình duyệt của bạn không hỗ trợ định vị GPS', 'warning');
                return;
            }
            CC.toast('Đang xác định tọa độ GPS...', 'info');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    CC.$('#prof-lat').value = pos.coords.latitude.toFixed(6);
                    CC.$('#prof-lng').value = pos.coords.longitude.toFixed(6);
                    CC.toast('Đã lấy tọa độ GPS thành công!', 'success');
                },
                (err) => {
                    console.warn('Lỗi lấy GPS:', err);
                    // Dự phòng vị trí mặc định tại Hà Nội
                    CC.$('#prof-lat').value = '21.028511';
                    CC.$('#prof-lng').value = '105.854444';
                    CC.toast('Đã gán tọa độ trung tâm (21.0285, 105.8544)', 'info');
                },
                { timeout: 8000 }
            );
        });

        // Submit cập nhật hồ sơ
        CC.$('#form-pharmacy-profile').addEventListener('submit', handleProfileSubmit);

        // Xem trước ảnh mặt tiền khi gõ URL
        CC.$('#prof-storefront-img').addEventListener('input', (e) => {
            updateStorefrontPreview(e.target.value.trim());
        });

        // Xử lý Upload ảnh quầy thuốc từ máy tính / điện thoại
        const triggerUpload = () => {
            const input = CC.$('#storefront-file-input');
            if (input) input.click();
        };

        const uploadBtn = CC.$('#btn-upload-storefront');
        if (uploadBtn) uploadBtn.addEventListener('click', triggerUpload);

        const uploadBtnLeft = CC.$('#btn-trigger-upload-left');
        if (uploadBtnLeft) uploadBtnLeft.addEventListener('click', triggerUpload);

        const fileInput = CC.$('#storefront-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    CC.toast('Vui lòng chọn tệp định dạng hình ảnh (.jpg, .png, .webp)', 'warning');
                    return;
                }

                if (file.size > 10 * 1024 * 1024) {
                    CC.toast('Kích thước ảnh vượt quá giới hạn 10MB', 'warning');
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (readEvt) => {
                    const base64Data = readEvt.target.result;
                    updateStorefrontPreview(base64Data);

                    const origText = uploadBtn ? uploadBtn.innerHTML : '';
                    if (uploadBtn) {
                        uploadBtn.disabled = true;
                        uploadBtn.innerHTML = '<span>⏳</span> Đang tải ảnh...';
                    }

                    try {
                        CC.toast('Đang tải ảnh quầy thuốc lên hệ thống...', 'info');
                        const res = await CC.api('/pharmacy/upload-storefront', {
                            method: 'POST',
                            body: { image_base64: base64Data, filename: file.name }
                        });

                        CC.$('#prof-storefront-img').value = res.url;
                        updateStorefrontPreview(res.url);
                        CC.toast('Đã tải và lưu ảnh quầy thuốc thành công!', 'success');
                    } catch (err) {
                        console.error('Lỗi tải ảnh quầy thuốc:', err);
                        CC.toast(err.message || 'Không thể tải ảnh quầy thuốc lên', 'danger');
                    } finally {
                        if (uploadBtn) {
                            uploadBtn.disabled = false;
                            uploadBtn.innerHTML = origText;
                        }
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // Nút gỡ ảnh quầy thuốc hiện tại
        const removeBtn = CC.$('#btn-remove-storefront');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                CC.$('#prof-storefront-img').value = '';
                if (fileInput) fileInput.value = '';
                updateStorefrontPreview('');
                CC.toast('Đã gỡ ảnh quầy thuốc. Hãy nhấn "Lưu thay đổi" để cập nhật.', 'info');
            });
        }
    }

    async function loadProfileData() {
        try {
            const data = await CC.api('/pharmacy/me');
            const p = data.pharmacy || {};
            const u = data.user || {};

            // Điền form
            CC.$('#prof-pharmacy-name').value = p.name || '';
            CC.$('#prof-gpp-cert').value = p.gpp_certificate || '';
            CC.$('#prof-biz-license').value = p.business_license_number || '';
            CC.$('#prof-pharmacy-phone').value = p.phone || '';
            CC.$('#prof-storefront-img').value = p.storefront_image_url || '';
            CC.$('#prof-pharmacy-address').value = p.address || '';
            CC.$('#prof-lat').value = p.latitude || '21.028511';
            CC.$('#prof-lng').value = p.longitude || '105.854444';

            CC.$('#prof-pharmacist-name').value = u.full_name || '';
            CC.$('#prof-pharmacist-email').value = u.email || '';
            CC.$('#prof-user-phone').value = u.phone || '';

            // Cập nhật thẻ xem trước
            updatePreviewCard(p);
        } catch (err) {
            console.error('Lỗi tải thông tin hồ sơ:', err);
            CC.toast('Không thể tải thông tin hồ sơ nhà thuốc', 'danger');
        }
    }

    function updatePreviewCard(p) {
        CC.$('#preview-name').textContent = p.name || 'Nhà thuốc CareConnect';
        CC.$('#preview-address').textContent = p.address || 'Hà Nội';
        CC.$('#preview-rating').textContent = `⭐ ${p.rating ? Number(p.rating).toFixed(1) : '5.0'}`;
        CC.$('#preview-rating-count').textContent = `${p.rating_count || 128} đơn`;

        if (p.is_pro_seller) {
            CC.$('#badge-pro-seller').style.display = 'inline-block';
        }

        updateStorefrontPreview(p.storefront_image_url);
    }

    function updateStorefrontPreview(url) {
        const box = CC.$('#storefront-box');
        const removeBtn = CC.$('#btn-remove-storefront');
        if (url) {
            box.innerHTML = `<img src="${CC.esc(url)}" alt="Mặt tiền nhà thuốc" style="width:100%;height:100%;object-fit:cover;border-radius:8px" onerror="this.parentElement.innerHTML='<span class=\'muted small\'>Không thể tải ảnh</span>'">`;
            if (removeBtn) removeBtn.style.display = 'inline-flex';
        } else {
            box.innerHTML = `<div style="text-align:center;color:#64748b"><span style="font-size:2.2rem;display:block;margin-bottom:4px">🏪</span><span class="small">Chưa có ảnh quầy thuốc</span></div>`;
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    async function handleProfileSubmit(e) {
        e.preventDefault();
        const saveBtn = CC.$('#btn-save-profile');

        const payload = {
            name: CC.$('#prof-pharmacy-name').value.trim(),
            gpp_certificate: CC.$('#prof-gpp-cert').value.trim(),
            business_license_number: CC.$('#prof-biz-license').value.trim(),
            phone: CC.$('#prof-pharmacy-phone').value.trim(),
            storefront_image_url: CC.$('#prof-storefront-img').value.trim(),
            address: CC.$('#prof-pharmacy-address').value.trim(),
            latitude: CC.$('#prof-lat').value ? parseFloat(CC.$('#prof-lat').value) : null,
            longitude: CC.$('#prof-lng').value ? parseFloat(CC.$('#prof-lng').value) : null,
            pharmacist_name: CC.$('#prof-pharmacist-name').value.trim(),
            email: CC.$('#prof-pharmacist-email').value.trim(),
        };

        if (!payload.name || !payload.address || !payload.gpp_certificate) {
            CC.toast('Vui lòng điền đầy đủ Tên nhà thuốc, Địa chỉ và Số chứng chỉ GPP', 'warning');
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Đang lưu...';

            const res = await CC.api('/pharmacy/profile', {
                method: 'PUT',
                body: payload,
            });

            CC.toast(res.message || 'Cập nhật hồ sơ nhà thuốc thành công!', 'success');
            if (res.pharmacy) {
                updatePreviewCard(res.pharmacy);
            }
        } catch (err) {
            console.error('Lỗi cập nhật hồ sơ:', err);
            CC.toast(err.message || 'Không thể lưu hồ sơ nhà thuốc', 'danger');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Lưu thay đổi';
        }
    }
})();
