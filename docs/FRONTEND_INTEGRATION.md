# Frontend CareConnect

## Admin và dataset

Chọn Quản trị, đăng nhập `admin@gmail.com` / `123456`. Đây là tài khoản demo,
được kiểm tra ở dịch vụ Node riêng cổng 5001, phiên HttpOnly có hạn 8 giờ.
Đăng xuất hủy phiên. Không dùng tài khoản/mật khẩu demo khi triển khai thật.

Trong Admin chọn **Dataset & kết nối**, bấm **Nạp 100.000 đơn & danh mục thuốc**.
Các bảng giao dịch có tìm kiếm, lọc trạng thái và 25 dòng mỗi trang. Danh mục
thuốc có tìm kiếm và phân trang. Dashboard và ví dùng cùng dữ liệu đã nạp.
Các thao tác hoàn tất/rút tiền là giả lập trong bộ nhớ trình duyệt; tải lại mất thay đổi.
Dataset Kaggle không được đưa vào danh mục bán thuốc Việt Nam hoặc dùng làm
căn cứ kê đơn. Tên/hãng/hàm lượng từ Kaggle, giá và giao dịch là giả lập.

## Backend sau merge

`npm run dev` hiện chạy Vite, Next.js, Admin demo API, Node backend (nếu đã cài
thư viện), Python backend (nếu có backend/.venv). Python dùng SQLite riêng;
lần đầu tự nạp dữ liệu sẵn có trong backend/data, không ghi đè DB đã tồn tại.

Cài backend tại thư mục backend:
```
npm install
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Family Care và Nhà thuốc vẫn cần PostgreSQL/PostGIS. Sửa DATABASE_URL trong
backend/.env theo thông tin PostgreSQL trên máy, rồi chạy `npm run db:setup`
trong backend. Không commit .env hoặc gửi mật khẩu vào chat.
Nếu health trả HTTP 503, backend đã chạy nhưng kết nối DB bị lỗi.
Nếu offline, backend chưa chạy hoặc sai cổng. Dịch vụ Admin không thay thế API
nghiệp vụ của Family Care/Nhà thuốc.

## Cài đặt và chạy

Tại `frontend`, chạy `npm install`, sau đó `npm --prefix buyer install`.
Chạy `npm run dev`, mở http://localhost:5173.

| Đường dẫn | Chức năng | Công nghệ |
|---|---|---|
| / | Chọn phân hệ | React/Vite |
| /admin | Quản trị TV5 | React/Vite |
| /shop | Mua thuốc TV2 | Next.js, tiến trình nội bộ cổng 3001 |
| /buyer-family/index.html | Family Care TV1 | HTML/JS |
| /pharmacy-portal/index.html | Nhà thuốc TV4 | HTML/JS |

`npm run dev` khởi động cả Vite và Next.js. `npm run dev:admin` chỉ chạy
cổng chung và quản trị; lúc đó đường dẫn /shop cần Next.js chạy riêng.

Backend vẫn cần chạy riêng theo hướng dẫn của từng nhóm:
- `/api/*` chuyển tới Node.js cổng 5000, giữ nguyên tiền tố /api.
- `/demo-api/*` chuyển tới Python cổng 8000, bỏ tiền tố /demo-api.
- `/static/*` chuyển tới Python cổng 8000 để phục vụ ảnh thuốc.

Không nhập chung package.json của Vite và Next.js. Next.js nằm trong buyer
và cấu hình basePath=/shop. Giữ các Link/router của Next.js theo đường dẫn
nội bộ; Next tự thêm basePath. API dùng đường dẫn gốc /demo-api.

## Kiểm tra

- `npm run build:admin`: build cổng chung/quản trị, sao chép các portal HTML.
- `npm run build:buyer`: build Next.js.
- `npm run build`: build cả hai.
- `npm --prefix buyer run typecheck`
- `npm --prefix buyer test`
- `node --test src/admin-escrow/services/escrow.test.js`

## Khi triển khai

Đây là các frontend dùng chung cổng truy cập, chưa chuyển toàn bộ sang một
framework hoặc thống nhất đăng nhập. Các portal HTML dùng phiên của Node.js;
phần mua thuốc và quản trị giữ nguyên cơ chế dữ liệu hiện có.

Máy chủ production cần phục vụ dist, cho /admin fallback về dist/index.html,
chuyển /shop/* tới Next.js, và chuyển các API như trên. Không dùng riêng
`vite preview` để kiểm thử toàn hệ thống vì nó không thay cho gateway production.

Dữ liệu 100.000 đơn nằm ở data/demo; Admin có thể nạp qua API được bảo vệ
bằng phiên đăng nhập. Dữ liệu này không được tự động nhập vào DB nghiệp vụ.
