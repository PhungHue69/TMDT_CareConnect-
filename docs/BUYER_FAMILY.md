# Phân hệ Người mua - Family Care (Thành viên 1)

Web giả lập app, viết bằng HTML/CSS/JS thuần, tự co giãn theo điện thoại dọc/ngang và laptop. Backend dùng Node.js Express + PostgreSQL.

## Chạy thử

1. Dựng database theo [DATABASE.md](DATABASE.md), chạy đủ 4 file migration `001` → `004`.
2. Cài [Node.js 20 LTS](https://nodejs.org) (một lần).
3. Chạy backend:

```bash
cd backend
copy .env.example .env      # macOS/Linux: cp .env.example .env
# Sửa DB_PASSWORD, DATABASE_URL trong .env cho khớp database của bạn
npm install
npm run dev
```

4. Mở http://localhost:5000. Backend phục vụ luôn thư mục `frontend/`, nên không cần chạy server giao diện riêng.

**Demo trên 2 máy:** laptop và điện thoại dùng chung Wi-Fi. Xem IP của laptop (`ipconfig`, ví dụ `192.168.1.5`) rồi mở `http://192.168.1.5:5000` trên điện thoại. Nếu không vào được, cho phép Node.js qua Windows Firewall.

**Demo nhanh cảnh báo 30 phút:** đặt `MISSED_ALERT_MINUTES=1` trong `.env`. Khi đó Con sẽ nhận cảnh báo sau khoảng 1 phút nếu Bố mẹ chưa bấm "Đã uống".

## Màn hình

Mọi tài khoản người mua đều như nhau. Một người có thể vừa chăm sóc người khác (con chăm bố mẹ) vừa được chăm sóc. Liên kết gia đình chỉ là một tính năng. Giao diện Đầy đủ hay Đơn giản do từng người tự chọn trong Tài khoản, không giới hạn tính năng.


| Trang | Chức năng |
|---|---|
| `login.html`, `register.html` | Đăng nhập, đăng ký (chọn giao diện đơn giản cho người lớn tuổi) |
| `index.html` | Trang chủ người mua: tìm kiếm, ô dịch vụ (Mua thuốc, Gửi đơn thuốc, Khám bác sĩ, Đặt lịch phòng khám, Gia đình, Lịch thuốc), tình hình uống thuốc của người thân, đơn thuốc trong gia đình. Ai có người chăm sóc thì có thêm nút "Gọi" và "Nhờ mua thuốc". **Chế độ Đơn giản** đủ tính năng như trên, chỉ khác là chữ to và thuốc hôm nay (nút "Đã uống") lên đầu |
| `family.html` | Mời bằng mã QR/6 ký tự hoặc số điện thoại, nhập/quét mã trên máy bố mẹ, chấp nhận/từ chối/hủy liên kết. `?member=ID` xem hồ sơ sức khỏe và báo cáo 7 ngày của người thân |
| `reminders.html` | Lịch nhắc của mình hoặc của người thân: hôm nay, tuân thủ 7 ngày, thêm/sửa/xóa lịch (chọn nhanh từ đơn bác sĩ đã kê), nút "Thử chuông" |
| `notifications.html` | Chuông báo: danh sách, lọc chưa đọc, bấm để mở màn hình liên quan, bật thông báo trình duyệt |
| `profile.html` | Thông tin cá nhân, chế độ giao diện (Đầy đủ/Đơn giản), hồ sơ sức khỏe, sổ địa chỉ (tra tọa độ), đổi mật khẩu |

Chuông realtime hoạt động trên mọi trang: khi tới giờ uống thuốc, máy bố mẹ hiện màn hình chuông lớn kèm âm thanh. Nếu bố mẹ chưa bấm "Đã uống" sau 30 phút, máy con hiện cảnh báo kèm nút "Gọi ngay".

## Kịch bản demo

1. **Anh Nam** (laptop) → Gia đình → Thêm thành viên → chọn "Bố" → Tạo mã. Màn hình hiện mã QR và 6 ký tự.
2. **Ông Bình** (điện thoại) → Gia đình → nhập mã (hoặc quét QR bằng camera điện thoại) → Đồng ý. Máy anh Nam nhận thông báo "Liên kết gia đình thành công".
3. Anh Nam → Lịch thuốc → chọn Bố → Thêm lịch (ví dụ Losartan 50mg, 07:00 và 19:00). Máy ông Bình nhận thông báo "Con vừa cài lịch uống thuốc".
4. Anh Nam bấm **Thử chuông** → máy ông Bình đổ chuông → ông bấm **Đã uống** → máy anh Nam nhận "Bố đã uống thuốc".
5. Lần sau không bấm "Đã uống" → sau `MISSED_ALERT_MINUTES` phút, anh Nam nhận cảnh báo "Bố chưa uống thuốc".
6. Trang chủ anh Nam → đơn `CC-DEMO-0001` → **Giả lập: Nhà thuốc duyệt đơn** → **bà Lan** nhận chuông "Nhà thuốc đã duyệt đơn".

## API

Tất cả API (trừ đăng ký/đăng nhập) cần header `Authorization: Bearer <token>`.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Trả về `{ token, user }` |
| GET | `/api/auth/me` | Thông tin người đang đăng nhập |
| GET/PUT | `/api/profile` | Xem/sửa thông tin cá nhân (kèm hồ sơ sức khỏe, địa chỉ) |
| PUT | `/api/profile/ui-mode`, `/password`, `/health` | Đổi giao diện, mật khẩu, hồ sơ sức khỏe |
| GET/POST/PUT/DELETE | `/api/profile/addresses[/:id]` | Sổ địa chỉ |
| GET | `/api/family` | Người tôi chăm sóc (kèm tình hình hôm nay), người chăm sóc tôi, lời mời |
| POST | `/api/family/invites` | Tạo mã mời `{ relationship }` |
| GET | `/api/family/invites/:code` | Xem trước lời mời |
| POST | `/api/family/join` | Nhập mã `{ code }` để liên kết |
| POST | `/api/family/links/by-phone` | Mời bằng SĐT `{ phone, relationship }` |
| POST | `/api/family/links/:id/accept`, `/reject` | Đồng ý/từ chối lời mời |
| DELETE | `/api/family/links/:id` | Hủy liên kết |
| GET | `/api/family/members/:userId` | Hồ sơ người thân + báo cáo 7 ngày |
| PUT | `/api/family/members/:userId/health` | Con sửa hồ sơ sức khỏe của bố mẹ |
| POST | `/api/family/help-request` | Bố mẹ "Nhờ con mua thuốc" `{ message }` |
| GET | `/api/family/orders` | Đơn thuốc con đặt cho bố mẹ |
| GET | `/api/reminders?patient_id=` | Lịch nhắc đang bật (mặc định của mình) |
| GET | `/api/reminders/today`, `/history?days=7` | Liều hôm nay, báo cáo tuân thủ |
| GET | `/api/reminders/prescription-items` | Thuốc trong đơn đã kê/đã duyệt, để tạo lịch nhanh |
| POST | `/api/reminders` | Tạo lịch `{ patient_id, drug_name, dosage, meal_note, schedule_times: ["07:00"], start_date, end_date }` |
| PUT/DELETE | `/api/reminders/:id` | Sửa/xóa (xóa mềm) |
| POST | `/api/reminders/:id/confirm` | Bấm "Đã uống" `{ status: "TAKEN" \| "SKIPPED" }` |
| POST | `/api/reminders/:id/ring-now` | Đổ chuông ngay |
| GET | `/api/notifications`, POST `/:id/read`, `/read-all` | Chuông báo |
| GET | `/api/notifications/stream?token=` | Kênh realtime (Server-Sent Events) |

## Cho các phân hệ khác

**Dùng chung giao diện:** `frontend/shared/css/base.css` (màu, nút, form, card, modal, khung responsive) và `frontend/shared/js/api.js` (`CC.api`, `CC.auth`, `CC.toast`, `CC.modal`). Các phân hệ khác có thể dùng lại thay vì viết lại.

**Đăng nhập:** dùng chung `/api/auth/login`. Token có `{ id, role }`, middleware `requireAuth` nằm ở `backend/src/middleware/auth.js`.

**Gửi chuông báo cho người dùng:**

```js
const { notify, notifyOrderStatusChange } = require('../services/notifications');

// Gửi một thông báo bất kỳ (lưu DB + đẩy realtime)
await notify(userId, { type: 'SYSTEM', title: 'Tiêu đề', body: 'Nội dung', data: { kind: 'MY_KIND' } });

// Nhà thuốc (TV4): sau khi cập nhật orders.status, gọi hàm này
// để người mua và Bố mẹ (người nhận) nhận chuông báo
await notifyOrderStatusChange(orderId);
```

Khi phân hệ Nhà thuốc có API duyệt đơn thật, có thể bỏ API giả lập `/api/demo/orders/:id/status` (chỉ bật khi `NODE_ENV` khác `production`).
