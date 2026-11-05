# Frontend CareConnect

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

Dữ liệu 100.000 đơn nằm ở data/demo; chưa được tự động nhập vào frontend hay DB.
Xung đột backend/.env.example cần được giải quyết riêng trước khi hoàn tất merge.
