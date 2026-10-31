# Thiết kế: Phân hệ Mua thuốc O2O & AI Guardrail

Ngày: 2026-10-20 · Phụ trách: Thành viên 2 (Mai)

## 1. Mục đích

Module nhỏ trong hệ thống nhà thuốc O2O. Người mua (web) có thể:

1. Tìm nhà thuốc gần mình theo GPS (tham khảo https://nhathuoclongchau.com.vn/he-thong-cua-hang).
2. Tự mua thuốc không kê đơn (OTC) và thực phẩm chức năng (TPCN) qua giỏ hàng.
3. Tải ảnh đơn thuốc hoặc nhập text. AI (Gemini) bóc tách thuốc thành JSON nếu là đơn hợp lệ; nếu là yêu cầu "kê đơn" trái phép (vd. "Sốt cao đau họng kê kháng sinh giúp em") thì **chặn** và chuyển sang Bác sĩ — tuân thủ Luật Dược (thuốc Rx chỉ bán theo đơn).

Ưu tiên: sản phẩm chạy được trước. Kịch bản demo/thuyết trình không nằm trong phạm vi.

## 2. Mục tiêu / Ngoài phạm vi / Thất bại

**Mục tiêu**
- Web người mua chạy end-to-end: tìm nhà thuốc → chọn thuốc → giỏ → đặt đơn.
- Cổng AI phân loại đúng 2 nhánh: `APPROVED` (đơn hợp lệ, có JSON thuốc) và `REJECTED_NOT_RX` (xin kê đơn trái phép).
- DB thật (SQLite), có ~100 nhà thuốc + ~100 thuốc crawl từ Long Châu.

**Ngoài phạm vi**
- App mobile, web Nhà thuốc/Bác sĩ/Admin.
- Thanh toán, giao vận, video call thật. "Chuyển Bác sĩ" = màn hình/nút giả lập.
- Đăng nhập/KYC thật (dùng 1 user demo cố định).
- Family_Links, Medication_Reminders, Care Coin.

**Thất bại dù chạy được**
- Thuốc Rx lọt vào giỏ mà không có đơn `APPROVED`.
- AI "kê đơn" thay vì chặn khi người dùng mô tả triệu chứng.

## 3. Quyết định đã chốt (từ người dùng)

- **Frontend:** web only.
- **Backend tách riêng**, giao tiếp qua REST API.
- **DB:** SQLite, phải chuyển được sang SQL server khác (Postgres/MySQL/SQL Server) khi cần.
- **Dữ liệu nhà thuốc & thuốc lưu trong DB**, nguồn crawl ~100 bản ghi từ nhathuoclongchau.com.vn.
- **Tuân thủ Luật Dược — Rx chỉ bán theo đơn:** chỉ prescription `input_type=IMAGE` + `APPROVED` mới mở khóa Rx. Input TEXT chỉ để bóc tách/chặn, **không bao giờ** mở khóa Rx (tránh gõ giả "đơn").

## 4. Lựa chọn của tôi (người dùng chưa phản đối, có thể đổi)

- **Backend:** Python FastAPI + SQLAlchemy (đổi DB = đổi `DATABASE_URL`). Lý do: cùng ngôn ngữ cho crawl, Gemini SDK, API.
- **Frontend:** Next.js + TailwindCSS (khớp tech stack mục 4.1).
- **Bản đồ:** Leaflet + OpenStreetMap (không cần API key).
- **OCR:** Gemini multimodal đọc ảnh trực tiếp — không dùng Google Vision/PaddleOCR riêng.
- **Gemini key:** đọc từ biến môi trường `GEMINI_API_KEY`.

## 5. Dữ liệu (theo mục 4.2 readme, rút gọn)

- `pharmacies`: id, name, address, latitude, longitude, phone, source_url.
- `master_drugs`: id, name, active_ingredient, category (`RX` / `OTC` / `TPCN`), unit, price, image_url, source_url.
- `prescriptions`: id, patient_id, input_type (`IMAGE`/`TEXT`), ocr_raw_text, ai_validation_status (`APPROVED` / `REJECTED_NOT_RX` / `UNREADABLE`), items_json, used_order_id (nullable — đơn dùng 1 lần), created_at.
- `orders`: id, buyer_id, pharmacy_id, prescription_id (nullable), items_json, total_amount, status, created_at.
- `users`: chỉ 1 user demo seed sẵn.

Giỏ hàng giữ phía client (localStorage), chỉ lưu DB khi đặt đơn.

## 6. Crawl dữ liệu

- Script chạy 1 lần: `crawl` → ghi JSON → `seed` vào DB.
- Nhà thuốc: ~100 cửa hàng có tọa độ (từ trang hệ thống cửa hàng / API công khai mà trang gọi).
- Thuốc: ~100 sản phẩm, trộn cả Rx, OTC, TPCN; lấy phân loại "thuốc kê đơn" từ trang sản phẩm.
- Crawl lịch sự: delay giữa request, giới hạn số lượng, chỉ dùng cho demo.
- Nếu trang chặn/đổi cấu trúc: builder tự chọn cách lấy (API JSON nội bộ của trang, hoặc Playwright). Dữ liệu seed JSON được commit để không phải crawl lại.

## 7. API

| Method | Path | Việc |
|---|---|---|
| GET | `/pharmacies/nearby?lat=&lng=&limit=` | Nhà thuốc gần nhất (haversine), kèm khoảng cách |
| GET | `/drugs?category=&q=` | Danh sách/tìm thuốc |
| POST | `/prescriptions/analyze` | multipart: ảnh **hoặc** text → gọi Gemini → lưu `prescriptions` → trả kết quả |
| POST | `/orders` | Tạo đơn. Nếu có thuốc `RX`, **server từ chối** trừ khi: kèm `prescription_id` có `input_type=IMAGE`, `APPROVED`, chưa dùng (`used_order_id` null); mỗi thuốc Rx khớp `matched_drug_id` trong đơn; số lượng ≤ số trên đơn. Đặt thành công → gán `used_order_id`. |

*(Lựa chọn của tôi: khớp từng thuốc, giới hạn số lượng, đơn dùng 1 lần.)*

Kết quả `/prescriptions/analyze`:

```json
{
  "id": 12,
  "status": "APPROVED",
  "items": [{"name": "Amoxicillin 500mg", "dosage": "1 viên x 3 lần/ngày", "quantity": 21, "matched_drug_id": 5}],
  "message": "..."
}
```
hoặc
```json
{ "id": 13, "status": "REJECTED_NOT_RX", "items": [], "redirect": "DOCTOR", "message": "Không thể kê đơn. Vui lòng tư vấn Bác sĩ." }
```

## 8. Prompt AI

- Gemini trả JSON theo schema cố định (dùng structured output / `response_mime_type=application/json`).
- Quy tắc: chỉ `APPROVED` khi input là đơn thuốc (có dấu hiệu đơn: tên thuốc + liều, bác sĩ/cơ sở khám). Mô tả triệu chứng + xin thuốc → `REJECTED_NOT_RX`. Không bao giờ gợi ý thuốc.
- Tên thuốc bóc ra được khớp với `master_drugs` (so tên gần đúng) để thêm vào giỏ.
- Ảnh mờ/không liên quan, lỗi Gemini, JSON hỏng → `UNREADABLE` (fail closed): báo "thử lại", không mở khóa Rx, không redirect Bác sĩ. *(Lựa chọn của tôi.)*
- Hỏi mua OTC kèm triệu chứng nhẹ (vd. "đau đầu mua Panadol") → vẫn `REJECTED_NOT_RX` về mặt kê đơn, nhưng `message` gợi ý xem danh mục OTC; không AI tự chọn thuốc. *(Lựa chọn của tôi.)*
- Input TEXT dù trông như đơn: có thể trả `APPROVED` + items để hiển thị, nhưng UI ghi rõ "Cần tải ảnh đơn để mua thuốc kê đơn".

## 9. Màn hình web

1. **Tìm nhà thuốc:** xin quyền GPS (fallback nhập tay/tọa độ mặc định HCM), bản đồ + danh sách có khoảng cách, chọn 1 nhà thuốc.
2. **Danh mục thuốc:** lọc OTC/TPCN/Rx; Rx hiện nhãn "Cần đơn" và nút thêm giỏ bị khóa.
3. **Cổng AI:** tab tải ảnh / nhập text → kết quả: danh sách thuốc + "Thêm vào giỏ", hoặc thông báo chặn + nút "Tư vấn Bác sĩ" (màn hình giả lập).
4. **Giỏ hàng & đặt đơn:** hiện nhà thuốc đã chọn, tổng tiền, đặt → trang xác nhận.

## 10. Dữ liệu test AI

Thư mục `testdata/`: 10 ảnh đơn thuốc thật (hợp lệ, do Data AI cung cấp) + 15 câu "triệu chứng đòi mua thuốc" (không hợp lệ). Script chạy cả 25 mẫu qua `/prescriptions/analyze` và in tỉ lệ đúng. Ảnh chưa có thì dùng chỗ trống, script bỏ qua. Mục tiêu: 15/15 câu xin kê đơn bị chặn (bắt buộc); 10 ảnh chỉ đo, không đặt ngưỡng. *(Lựa chọn của tôi.)*

## 11. Để builder quyết

Cấu trúc thư mục, thư viện crawl, cách khớp tên thuốc, UI chi tiết, model Gemini cụ thể (bản flash mới nhất là hợp lý).
