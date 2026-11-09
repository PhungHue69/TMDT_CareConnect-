# CareConnect

Sàn Thương mại Điện tử Dược phẩm & Y tế đa bên kết hợp Hệ sinh thái Chăm sóc Sức khỏe Gia đình từ xa.

CareConnect kết nối Người dùng (Con cái & Bố mẹ), Bác sĩ và Nhà thuốc chuẩn GPP trên nền tảng O2O (Online-to-Offline): chăm sóc sức khỏe người lớn tuổi từ xa, kiểm soát bán thuốc kê đơn bằng AI Guardrail, giao thuốc hỏa tốc.

## Kiến trúc

| Cổng | Dịch vụ | Phân hệ |
|---|---|---|
| **5173** | **Cổng vào chung** (React/Vite): chọn phân hệ, trang Quản trị, chuyển tiếp tới các dịch vụ bên dưới | TV5 |
| 3001 | Mua thuốc, Khám bác sĩ, Phòng khám, Đơn hàng (Next.js, đường dẫn `/shop`) | TV2, TV3 |
| 8000 | Tìm nhà thuốc/thuốc, AI đọc đơn thuốc (Python FastAPI, SQLite riêng) | TV2 |
| 5000 | API chung + PostgreSQL: Family Care, Nhà thuốc, Bác sĩ, đơn hàng, ví Escrow | TV1, TV3, TV4 |
| 5001 | Đăng nhập trang Quản trị (dữ liệu giả lập) | TV5 |

Mọi giao dịch (đơn hàng, đơn thuốc, ca khám, lịch phòng khám, ví) nằm trong **PostgreSQL**, nên Nhà thuốc, Bác sĩ và Family Care cùng thấy một dữ liệu. Phần Python chỉ phục vụ tìm kiếm và AI. Nhà thuốc/thuốc của trang Mua thuốc được đưa vào PostgreSQL bằng migration `030_shop_catalog.sql`, cột `shop_ref` giữ id gốc.

**Ứng dụng Người dùng** (con cái và bố mẹ) là một ứng dụng duy nhất: Trang chủ, Mua thuốc, Khám bác sĩ, Đơn hàng, Lịch thuốc, Gia đình, Thông báo, Tài khoản. Các trang HTML (`frontend/buyer-family`) và các trang Next.js (`/shop`) dùng chung khung menu (`buyer-family/js/layout.js` và `buyer/components/UserShell.tsx`, phải giữ cùng thứ tự menu) và đăng nhập **một lần**. Cổng vào chung có 4 phân hệ: Người dùng, Bác sĩ, Nhà thuốc, Quản trị.

**Giao diện thống nhất:** cả hệ thống dùng một bộ màu trắng – xanh dương (`#2563eb`), cùng font và bộ icon nét mảnh. Bộ màu khai báo ở `frontend/shared/css/base.css`; icon ở `frontend/shared/js/api.js` (`CC.icon`). Trang Next.js lặp lại cùng giá trị trong `buyer/app/globals.css`.

## Cài đặt (Windows)

Cần: [Node.js 22 LTS](https://nodejs.org), [Python 3.11+](https://www.python.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/) (để chạy PostgreSQL + PostGIS).

```bash
# 1. Database (một lần)
docker run -d --name careconnect-db -e POSTGRES_PASSWORD=123456 -e POSTGRES_DB=careconnect_db -p 5432:5432 postgis/postgis:16-3.4

# 2. Backend
cd backend
copy .env.example .env          # sửa DB_PASSWORD, DATABASE_URL (mật khẩu 123456 ở bước 1), JWT_SECRET
npm install
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
npm run db:setup                 # tạo bảng + toàn bộ dữ liệu demo; chạy lại an toàn

# 3. Frontend
cd ..\frontend
npm install
npm --prefix buyer install

# 4. Chạy tất cả (Vite, Next.js, Python, Node, Admin)
npm run dev
```

Mở **http://localhost:5173**. Lần sau chỉ cần `docker start careconnect-db` rồi `npm run dev` trong `frontend`.

- **AI đọc đơn thuốc** cần khóa Gemini: điền `GEMINI_API_KEY` trong `backend/.env` (xin TV2, không commit khóa). Thiếu khóa thì gửi ảnh đơn sẽ báo "Không đọc được đơn thuốc"; các luồng khác vẫn chạy.
- **Demo nhanh cảnh báo quên uống thuốc**: đặt `MISSED_ALERT_MINUTES=1` trong `backend/.env`.
- **Database đã cài từ trước**: chạy lại `npm run db:setup`, lệnh sẽ tự bổ sung danh mục chung (030) nếu thiếu.
- **Điện thoại cùng Wi-Fi**: mở `http://<IP laptop>:5173`; nếu không vào được, cho phép Node.js qua Windows Firewall.

## Tài khoản demo

| Vai trò | Đăng nhập | Mật khẩu |
|---|---|---|
| Người mua – Anh Nam (con) | 0900000001 | 123456 |
| Người mua – Bà Lan (mẹ, giao diện đơn giản, đã liên kết với anh Nam) | 0900000002 | 123456 |
| Người mua – Ông Bình (bố, chưa liên kết) | 0900000003 | 123456 |
| Bác sĩ (19 tài khoản, ví dụ BS. Nguyễn Thị Hạnh) | 0912000001 | 12345 |
| Dược sĩ của nhà thuốc trên trang Mua thuốc | `093` + mã nhà thuốc 7 chữ số, ví dụ 0930000001 | 123456 |
| Dược sĩ nhà thuốc mẫu Minh Tâm / Phúc An | 0900000021 / 0900000022 | 123456 |
| Quản trị | admin@gmail.com | 123456 |

Mã nhà thuốc nằm trên đường dẫn trang nhà thuốc trong Mua thuốc (`/shop/pharmacies/<mã>`).

## Kịch bản demo 3 luồng chính

Mở 2 tab cạnh nhau (mỗi tab giữ một tài khoản riêng).

**Luồng 1 + 3 – Con đặt thuốc cho bố mẹ ở quê**
1. Anh Nam → Mua thuốc → chọn khu vực, chọn nhà thuốc → thêm thuốc không kê đơn vào giỏ.
2. Giỏ hàng → Người nhận: **Mẹ** → địa chỉ tự chuyển sang nhà mẹ → thanh toán (mô phỏng, tiền sàn tạm giữ) → Đặt hàng.
3. Bà Lan nhận chuông "Nguyễn Văn Nam vừa đặt thuốc cho bạn".
4. Dược sĩ của nhà thuốc đó (093xxxxxxx) → Cổng Nhà thuốc → Đơn hàng bán ra → Duyệt → Giao → Hoàn tất. Bà Lan và anh Nam nhận chuông theo từng bước; tiền Escrow chuyển vào ví nhà thuốc sau khi trừ hoa hồng.

**Luồng 2 – Khám bác sĩ, nhận đơn điện tử, mua thuốc**
1. Anh Nam → Bác sĩ → chọn bác sĩ → người được khám: Mẹ → mô tả triệu chứng → thanh toán phí khám.
2. Bác sĩ → Hàng chờ khám → Bắt đầu khám → Kê đơn điện tử. Phí khám vào ví bác sĩ; bà Lan và anh Nam nhận chuông "Bác sĩ đã kê đơn".
3. Anh Nam → Bác sĩ → Lịch khám của tôi → **Gửi đơn cho nhà thuốc** → chọn nhà thuốc gần nhà mẹ (ưu tiên nơi còn thuốc).
4. Dược sĩ → Báo giá đơn thuốc → gửi báo giá. Anh Nam → Đơn hàng → Đơn thuốc đã gửi → **Đồng ý báo giá & đặt hàng**.

**AI Guardrail** – Mua thuốc → chọn nhà thuốc → Gửi ảnh đơn thuốc. Ảnh đơn hợp lệ được chuyển cho dược sĩ báo giá; ảnh ghi triệu chứng/nhờ kê đơn bị chặn và gợi ý khám bác sĩ.

**Family Care** – liên kết gia đình bằng QR/SĐT, lịch nhắc uống thuốc, chuông "Đã uống", cảnh báo quên uống: xem [docs/BUYER_FAMILY.md](docs/BUYER_FAMILY.md).

Bác sĩ chỉ khám, thu phí và kê đơn, không bán thuốc. Người bệnh tự gửi đơn cho nhà thuốc; phí khám không được trừ vào tiền thuốc.

## Tài liệu

- [docs/DATABASE.md](docs/DATABASE.md) – cấu trúc database, migration
- [docs/BUYER_FAMILY.md](docs/BUYER_FAMILY.md) – Family Care (TV1), API người mua
- [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) – cổng vào chung, trang Quản trị (TV5)
- [README_TV2.md](README_TV2.md) – Mua thuốc & AI (TV2)

Bản mô phỏng phục vụ học tập: thanh toán, tồn kho, bác sĩ, phòng khám là dữ liệu mẫu, không dùng để tư vấn y tế thật.
