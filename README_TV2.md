1 module nhỏ
![alt text](image.png)
tham khảo : https://nhathuoclongchau.com.vn/he-thong-cua-hang

4.1. Công nghệ đề xuất (Tech Stack)
Frontend (Web & Mobile):
Mobile App (Buyer / Bố mẹ): Flutter hoặc React Native (phát triển đa nền tảng iOS/Android nhanh, hỗ trợ Push Notification và Call tốt).
Web Portal (Nhà thuốc, Bác sĩ, Admin): ReactJS / Next.js + TailwindCSS.
Backend & API: Node.js (NestJS) hoặc Python (FastAPI) – thuận tiện tích hợp các dịch vụ AI.
AI & OCR Engine: Kết hợp Google Cloud Vision API / PaddleOCR (nhận diện chữ viết/in trên đơn thuốc) + LLM/NLP (như Gemini API) để phân loại văn bản (Classification: Đơn thuốc hợp lệ vs. Yêu cầu kê đơn trái phép) và bóc tách JSON tên thuốc, liều lượng.
Dịch vụ bên thứ 3 (Third-party APIs):
Video/Audio Call & Chat: Agora SDK, Stringee hoặc WebRTC + Socket.io.
Bản đồ & Định vị: Google Maps API / Goong Maps.
Giao vận & Thanh toán: API Ahamove/GrabExpress, VNPay/VietQR.
4.2. Các bảng Cơ sở dữ liệu cốt lõi (Core Database Entities)
Users: id, role (BUYER, DOCTOR, PHARMACIST, CLINIC, ADMIN), phone, full_name, kyc_status, care_coin_balance.
Family_Links: id, caregiver_user_id (Con cái), dependent_user_id (Bố mẹ), relationship, permissions.
Professional_Profiles: user_id, license_number (Số CCHN), license_image_url, consultation_fee (5k-30k), free_fee_on_purchase (Boolean), linked_pharmacy_id.
Pharmacies: id, owner_id, name, gpp_certificate, latitude, longitude, is_pro_seller.
Master_Drugs (Thư viện thuốc): id, name, active_ingredient, is_prescription_only (Rx/OTC), unit.
Prescriptions (Đơn thuốc): id, patient_id, doctor_id (nullable nếu tải từ ngoài), ocr_raw_text, ai_validation_status (APPROVED / REJECTED_NOT_RX), items_json.
Orders: id, buyer_id, recipient_id (Bố mẹ), pharmacy_id, prescription_id, consultation_discount_amount, total_amount, shipping_status.
Medication_Reminders (Lịch uống thuốc): id, patient_id, prescription_id, drug_name, dosage, schedule_times, adherence_log (Đã uống/Bỏ lỡ).


---

## Chạy demo

Yêu cầu: Python 3.11+, Node 20+.

### Backend (FastAPI, cổng 8000)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed          # nạp nhà thuốc + thuốc từ backend/data/*.json (idempotent)
uvicorn app.main:app --reload
```

### Frontend (Next.js, cổng 3000)

```bash
cd frontend
npm i
cp .env.example .env.local      # NEXT_PUBLIC_API_URL
npm run dev
```

Mở http://localhost:3000. Frontend proxy `/demo-api` tới backend nội bộ `127.0.0.1:8000`; backend chỉ cho CORS từ `http://localhost:3000` theo mặc định khi gọi trực tiếp. Đổi `ALLOWED_ORIGINS` nếu cần origin khác. GPS và một số API trình duyệt chỉ chạy trên HTTPS. Để thử GPS/chụp ảnh trên điện thoại qua Wi‑Fi, tạo chứng chỉ tự ký cho IP máy trong `frontend/certificates/` (đã gitignore) rồi chạy `npx next dev --hostname 0.0.0.0 --experimental-https --experimental-https-key ./certificates/lan-key.pem --experimental-https-cert ./certificates/lan-cert.pem`, mở `https://<IP-LAN>:3000` và chấp nhận cảnh báo chứng chỉ một lần. Thêm IP đó vào `allowedDevOrigins` trong `next.config.ts`. Không mở cổng 8000 ra mạng khi demo. Trước khi chia sẻ rộng, thay API key đã từng lộ và thêm xác thực, giới hạn lượt tải ảnh, quy tắc lưu/xóa dữ liệu sức khỏe.

Giao diện xanh dương theo file HTML tham khảo nhưng co giãn trên điện thoại: ô chỉ tìm địa chỉ (không tìm tên nhà thuốc), GPS và chọn tỉnh/phường; bản đồ và danh sách nhà thuốc nằm cạnh nhau trên máy tính, xếp dọc trên điện thoại. Danh sách ban đầu hiện 3 nhà thuốc, nút “Xem thêm nhà thuốc” thêm từng nhóm; chỉ hiện tên, ảnh, địa chỉ, khoảng cách, không có giờ mở cửa, đánh giá, trạng thái hay bộ lọc giả. Thanh dưới trên điện thoại có mục Nhà thuốc hoạt động; Trang chủ, Đơn hàng và Tài khoản báo “Chưa có trong bản demo”. Bấm ghim đỏ để xem tên/khoảng cách rồi chọn nhà thuốc → trang chi tiết riêng `/pharmacies/{id}` với nút “Về bản đồ”, OTC+TPCN còn hàng, và chụp/tải ảnh đơn. Quay lại cùng nhà thuốc giữ giỏ/ảnh nháp trong tab; tải lại trang không giữ ảnh nháp. Đổi nhà thuốc khi đang có giỏ/ảnh cần xác nhận trước khi xóa. AI chỉ sàng lọc ảnh có vẻ là đơn thuốc; gửi thành công nghĩa là backend lưu ảnh riêng tư + mã nhà thuốc vào yêu cầu chờ kiểm tra, **chưa có dược sĩ thật nhận đơn**. Không hỗ trợ bán Rx trực tiếp từ AI; các trang danh mục cũ chỉ điều hướng về bản đồ để chọn nhà thuốc.

### Tạo khóa API của riêng bạn để chạy đủ chức năng

Khóa API là của từng người và **không có trong repo**. Mỗi thành viên tự tạo khóa của mình, không xin hay dùng chung khóa của người khác:

1. Sao chép `backend/.env.example` thành `backend/.env`.
2. Tạo khóa và điền vào `backend/.env`:
   - **`GEMINI_API_KEY`** (bắt buộc để gửi ảnh đơn thuốc): vào https://aistudio.google.com/apikey, đăng nhập tài khoản Google, bấm "Create API key" (gói miễn phí đủ để thử).
   - **`GOONG_API_KEY`** (tìm địa chỉ bằng chữ): tạo tài khoản tại https://account.goong.io rồi tạo API key (loại Places/REST). Tài khoản mới có thể phải chờ kích hoạt mới tạo được khóa.
   - **`GOOGLE_MAPS_API_KEY`** (tùy chọn, hiện sao đánh giá): Google Cloud Console, bật Places API (New) và tạo khóa; Google có thể tính phí.
3. Khởi động lại backend.

Không dán khóa vào commit, issue, ảnh chụp màn hình hay nhóm chat. `backend/.env` đã nằm trong `.gitignore`. Nếu lỡ lộ khóa, hãy xóa khóa đó trên trang quản lý và tạo khóa mới.

Thiếu khóa thì: không gửi được ảnh đơn (hệ thống từ chối an toàn, không gọi AI); ô tìm địa chỉ bằng chữ báo lỗi nhưng GPS và chọn Tỉnh/Phường vẫn dùng được; không có sao đánh giá. Mọi chức năng còn lại chạy bình thường.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `GEMINI_API_KEY` | (không có) | Bắt buộc cho sàng lọc ảnh đơn; thiếu key → không gửi yêu cầu (fail-closed). Không mở khóa mua thuốc Rx |
| `GOONG_API_KEY` | (không có) | Khóa Goong Places API đặt ở backend để tra địa chỉ cụ thể; thiếu khóa → báo lỗi, vẫn dùng GPS hoặc chọn Tỉnh/Phường |
| `GOOGLE_MAPS_API_KEY` | (không có) | Khóa Google Maps Platform (bật Places API (New)) để hiện sao đánh giá Google Maps ở trang nhà thuốc. Tra ở backend, cache 24 giờ, chỉ nhận kết quả cách nhà thuốc ≤300 m; thiếu khóa hoặc lỗi → ẩn dòng đánh giá, không ảnh hưởng chức năng khác. Phát sinh phí theo bảng giá Google |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model Gemini |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Origin CORS cho phép (phân tách bằng dấu phẩy) |
| `DATABASE_URL` | `sqlite:///./o2o.db` | DB của backend; là đường dẫn tương đối theo thư mục chạy lệnh, nên khi chạy ngoài `backend/` phải đặt URL tuyệt đối tới `backend/o2o.db` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL backend (frontend) |

### Đổi sang Postgres

```bash
pip install "psycopg[binary]"
export DATABASE_URL=postgresql+psycopg://user:pass@host/db
```

Bảng được tạo bằng `create_all` khi khởi động; riêng SQLite cũ có bảng `prescription_requests` được bổ sung cột khóa gửi lại/hash ảnh và chỉ mục duy nhất bởi `ensure_request_retry_columns`. Không có migration tổng quát cho schema khác. `python -m scripts.seed` xóa rồi nạp lại nhà thuốc/thuốc nên id đổi; chạy seed trước khi có đơn hàng/yêu cầu ảnh. Chưa kiểm tra trên Postgres thật.

### Test

```bash
cd backend && pytest
cd frontend && npm test
cd frontend && npm run lint && npm run typecheck && npm run build
```

### Đánh giá AI (cần `GEMINI_API_KEY`)

```bash
cd backend
python -m scripts.eval_ai
```

Mục tiêu: 15/15 yêu cầu kê đơn trái phép (`backend/testdata/invalid_requests.txt`) bị chặn. Ảnh đơn thật đặt ở `backend/testdata/images/` (chỉ để đo, không tính pass/fail). Chưa chạy (không có key trong môi trường kiểm tra).

### API chính

- `GET /locations`: Tỉnh/Phường (22 tỉnh, 89 phường, TP. HCM đầu danh sách) kèm toạ độ trung bình, suy ra từ địa chỉ nhà thuốc.
- `GET /geocode/suggest?q=...` và `GET /geocode/resolve?place_id=...`: proxy Goong Places qua backend. Trước khi chạy, đặt `GOONG_API_KEY` trong môi trường backend (hoặc trong `backend/.env` nếu dùng trình nạp `.env`); khởi động lại backend. Khi ngừng gõ địa chỉ khoảng 1 giây, một kết quả duy nhất sẽ tự cập nhật ghim và nhà thuốc gần đó; nhiều kết quả phải chọn từ danh sách. Không tìm thấy/lỗi/thiếu `GOONG_API_KEY` thì giữ vị trí cũ, dùng GPS hoặc chọn Tỉnh/Phường. Nội dung địa chỉ người dùng nhập được gửi đến Goong để tra cứu; API key không gửi tới frontend.
- `GET /pharmacies/nearby?lat&lng`: nhà thuốc gần nhất. `GET /pharmacies/with-stock?lat&lng&drug_ids=1,2,3[&limit]`: chỉ nhà thuốc còn hàng đủ mọi thuốc, sắp theo khoảng cách, kèm `items` (tồn kho); id lỗi/trùng/>20 → 422, id không tồn tại → 404.
- `GET /pharmacies/{id}/rating` trả `{rating, count, url}` từ Google Maps (đều `null` nếu không có dữ liệu hoặc chưa cấu hình khóa).
- `GET /pharmacies/{id}` trả thông tin nhà thuốc cho trang chi tiết (404 nếu không tồn tại); `GET /pharmacies/{id}/products?q=&page=&limit=` chỉ trả OTC/TPCN còn hàng ở nhà thuốc được chọn, có tồn kho và phân trang.
- `POST /prescriptions/requests` (multipart `pharmacy_id`, `image`, `request_key` tùy chọn) chỉ sàng lọc hình thức ảnh đơn, lưu ảnh gốc riêng tư ở `backend/private_prescriptions` và tạo từng yêu cầu `PENDING_PHARMACIST`; gửi lại cùng khóa/ảnh/nhà thuốc trả ID cũ, khóa dùng cho ảnh/nhà thuốc khác trả 409. Ảnh không phải đơn hoặc không rõ bị từ chối. Chưa nối phân hệ dược sĩ; không đưa ảnh thật có dữ liệu bệnh nhân vào repo hoặc gửi qua link demo công khai.
- `GET /drugs`, `POST /orders`. Endpoint `/prescriptions/analyze` cũ dành cho thử nghiệm kỹ thuật; không dùng để bán Rx, và `/orders` từ chối Rx trực tiếp kể cả AI báo `APPROVED`.

### Ghi chú dữ liệu

- `backend/data/*.json` là kết quả crawl từ nhathuoclongchau.com.vn, đã commit sẵn. Crawl lại: `pip install playwright` rồi `python -m scripts.crawl` (cần Chrome cài sẵn, chạy có giao diện; chưa kiểm tra).
- Ảnh thuốc/nhà thuốc đã tải sẵn (WebP ≤ 400px) ở `backend/static/images/`, manifest `backend/data/images.json`, phục vụ qua `/static`; nhà thuốc không có ảnh thì dùng `default-pharmacy.webp`. Tải lại: `python -m scripts.crawl_images` (ảnh thuốc dùng httpx; ảnh nhà thuốc lấy từ trường `avatar`/`pictures` của `list-shop`, cần `pip install playwright` + Chrome; bỏ qua file đã có). `o2o.db` có sẵn phải xóa rồi seed lại vì `create_all` không thêm cột `pharmacies.image_url`.
- Tồn kho nhà thuốc (`pharmacy_stock`) là dữ liệu mẫu do `python -m scripts.seed` sinh ngẫu nhiên với seed cố định 42 (không phải dữ liệu thật của Long Châu), nên chạy lại ra kết quả giống nhau.
- Quy tắc số lượng Rx theo hộp: số hộp tối đa cho một thuốc = `ceil(số lượng trong đơn / (N×M))` với N×M lấy từ tên thuốc (vd `2X7` = 14 viên/hộp; đơn 21 viên → 2 hộp). Đơn ghi đơn vị `pack` thì số hộp = số lượng; tên không có N×M hoặc đơn cũ không có đơn vị → tối đa 1 hộp. Vượt mức → 403.
- Thuốc Rx có `price = 0` nghĩa là "giá tại nhà thuốc" (UI hiển thị như vậy); phiên bản demo này không cho mua Rx trực tiếp, chỉ lưu yêu cầu kèm ảnh để dược sĩ kiểm tra khi nhóm nối phân hệ.
- Trang bác sĩ (`/doctor`) chỉ mô phỏng.
