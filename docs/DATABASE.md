# Database CareConnect

PostgreSQL 16 + PostGIS. Schema gồm 38 bảng, chia 6 phân hệ.

## Cài đặt nhanh

Cách dễ nhất là dùng Docker (không cần cài PostgreSQL/PostGIS):

```bash
docker run -d --name careconnect-db -e POSTGRES_PASSWORD=your_password_here -e POSTGRES_DB=careconnect_db -p 5432:5432 postgis/postgis:16-3.4

# Chạy lần lượt từ thư mục backend/database/migrations
docker exec -i careconnect-db psql -U postgres -d careconnect_db < 001_init_schema.sql
docker exec -i careconnect-db psql -U postgres -d careconnect_db < 002_seed_data.sql
docker exec -i careconnect-db psql -U postgres -d careconnect_db < 003_family_care.sql
docker exec -i careconnect-db psql -U postgres -d careconnect_db < 004_seed_family_demo.sql
```

| File | Nội dung |
|---|---|
| `001_init_schema.sql` | Toàn bộ bảng, enum, index, trigger |
| `002_seed_data.sql` | Danh mục, sản phẩm, tài khoản demo, nhà thuốc |
| `003_family_care.sql` | Bảng `family_invites` (mã mời QR), cột `medication_adherence_logs.reminded_at` |
| `004_seed_family_demo.sql` | Ông Bình (chưa liên kết), đơn thuốc và lịch uống thuốc của bà Lan, 1 đơn hàng chờ duyệt |

Sau đó copy `backend/.env.example` thành `backend/.env` và sửa mật khẩu.

Muốn làm lại từ đầu: `docker rm -f careconnect-db` rồi chạy lại các lệnh trên.

## Tài khoản demo (mật khẩu: `123456`)

| SĐT | Vai trò | Ghi chú |
|---|---|---|
| 0900000000 | ADMIN | |
| 0900000001 | BUYER | Anh Nam, ở Hà Nội. Người chăm sóc (Con) |
| 0900000002 | BUYER | Bà Lan, mẹ anh Nam, ở Nam Định. Giao diện `SIMPLE`, đã liên kết với anh Nam |
| 0900000003 | BUYER | Ông Bình, bố anh Nam. Giao diện `SIMPLE`, **chưa liên kết** (để demo liên kết bằng QR) |
| 0900000011 | DOCTOR | BS. Hùng, Nội tổng quát, phí khám 20k, đang online |
| 0900000012 | DOCTOR | BS. Mai, Nhi khoa, phí khám 15k |
| 0900000021 | PHARMACIST | Chủ Nhà thuốc Minh Tâm (Hà Nội, gói Pro) |
| 0900000022 | PHARMACIST | Chủ Nhà thuốc Phúc An (Nam Định, cách nhà bà Lan khoảng 500m) |
| 0900000031 | CLINIC | Phòng khám An Bình |

Mật khẩu được hash bằng bcrypt (`$2a$`), backend kiểm tra được bằng `bcrypt`/`bcryptjs` (Node) hoặc `passlib` (Python).

## Mô hình nghiệp vụ trong schema

- **Bác sĩ chỉ khám và thu phí (5k–30k), không bán thuốc.** Sau khi khám, bác sĩ tạo `prescriptions` với `source = 'E_PRESCRIPTION'`. Người dùng tự chọn nhà thuốc để mua.
- **Luồng mua theo đơn:** `prescriptions` → `prescription_requests` (gửi tới 1 hoặc nhiều nhà thuốc) → dược sĩ báo giá trong `prescription_request_items` → khách chấp nhận → `orders`.
- **AI Guardrail:** đơn tải ảnh/dán chữ có `ai_validation_status` mặc định là `PENDING`. Chỉ đơn `APPROVED` mới được gửi cho nhà thuốc. Mỗi lần gọi AI ghi vào `prescription_ai_logs`.
- **Chống mua vượt đơn:** mỗi `prescription_items` có `dispensed_quantity`. Thuốc `RX` trong `order_items` phải gắn `prescription_item_id` (backend kiểm tra).
- **Family Care:** `family_links` (Con → Bố mẹ). Đơn hàng có `buyer_user_id` (người trả tiền) và `recipient_user_id` (người nhận), địa chỉ giao được lưu bản chụp ngay trên `orders`.
- **Hoa hồng:** lấy theo `commission_rules` (RX 5%, OTC 7%, TPCN 10%, khám 20%...) và chốt vào `order_items.commission_rate` / `consultations.commission_rate` lúc đặt, để đổi tỷ lệ sau này không làm sai đơn cũ.
- **Dòng tiền:** mọi khoản thu qua cổng thanh toán ghi vào `payments`. Tiền chia vào ví (`wallets`, 1 ví hệ thống + ví bác sĩ + ví nhà thuốc) qua `wallet_transactions`. Đối tác rút tiền qua `payout_requests`.
- **Trạng thái giao hàng** chỉ nằm ở `shipments.status`. `orders.status` là trạng thái tổng của đơn.

## Thêm dữ liệu thật

- Sản phẩm: import CSV vào `master_drugs`. Cột bắt buộc: `name`, `product_type` (`RX/OTC/SUPPLEMENT/DEVICE/COSMETIC`), `unit`. Không cần nhập `is_prescription_only`, cột này tự tính từ `product_type = 'RX'`.
- Đơn thuốc dùng để test AI nên là đơn **tự tạo**, không dùng đơn thật của người thân (dữ liệu sức khỏe là dữ liệu cá nhân nhạy cảm theo Nghị định 13/2023).
- Thay đổi schema sau này: tạo file mới `003_...sql` thay vì sửa `001`, để máy của các thành viên khác không bị lệch.
