# Thiết kế: Giao diện "Thuốc Gần Bạn" (bổ sung cho spec 2026-10-20-o2o-ai-guardrail-design.md)

Mockup: `docs/superpowers/specs/ui_design.png` (người dùng đã duyệt). Đây là phần bổ sung; các ràng buộc Luật Dược của spec gốc (Rx chỉ mở khóa bằng ẢNH đơn đã APPROVED, đơn text không mở khóa, fail closed) vẫn giữ nguyên.

## Quyết định đã chốt (người dùng)
- Tồn kho theo nhà thuốc: **sinh dữ liệu mẫu**, hạt giống cố định (seed 42), lưu DB bảng `pharmacy_stock`.
- Tỉnh/Phường: **lấy từ địa chỉ 100 nhà thuốc đã crawl**; chọn thì lấy tâm tọa độ các nhà thuốc trong khu làm vị trí. Ô nhập địa chỉ tự do chỉ để hiển thị (không geocode).
- Thay trang chủ `/` + header; giữ các trang `/drugs`, `/cart`, `/doctor`, `/ai` (đổi style cho khớp).

## Lựa chọn của tôi (người dùng giao quyền quyết)
- Giới hạn ảnh đơn 5MB ở frontend (backend vẫn 10MB).
- Banner demo ghi đúng sự thật: "Bản demo — tồn kho nhà thuốc là dữ liệu mẫu; danh sách nhà thuốc và thuốc lấy từ Long Châu."
- `/orders` KHÔNG kiểm tra tồn kho (ngoài phạm vi).
- LIFEDOVATE (clobetasone) chuyển sang RX (thận trọng).
- Giá Rx = 0 giữ nguyên (hiển thị "Giá tại nhà thuốc").
- Sửa lệch đơn vị số lượng đơn thuốc: xem mục 6.

## 1. Palette (hex trực tiếp)
- Xanh lá chính `#137c4a` (hover `#0f6a3e`), xanh nhạt nền chip/avatar `#d9f2e3`
- Nền trang `#f1f5f2`, thẻ trắng `#ffffff`, viền `#e5e7eb`, chữ chính `#1f2937`, chữ phụ `#6b7280`
- Cam điểm nhấn (tab TH1 chọn, vùng upload, badge giỏ) `#d97706`, nền cam nhạt `#fff3e3`, viền nét đứt cam `#e0a25a`
- Vàng cảnh báo nền `#fef3c7` chữ `#92400e`; đỏ lỗi nền `#fee2e2` chữ `#991b1b`
- Bo góc thẻ `rounded-2xl`, nút `rounded-xl`; nav đang chọn là pill xanh lá chữ trắng. Font system sans.

## 2. Header (mọi trang: `app/layout.tsx` + `components/Header.tsx`, client)
Logo (icon viên thuốc trong ô vuông xanh nhạt) + chữ "Thuốc Gần Bạn" xanh đậm; nav: **Trang chủ** (/), **Tìm thuốc** (/, pill xanh khi đang ở /), **Thực phẩm chức năng** (/drugs?category=TPCN), **Tư vấn / Kê đơn** (/doctor); bên phải: nút **Giỏ hàng** (pill xanh) với badge cam = tổng quantity trong giỏ (đọc localStorage `o2o_cart` qua useSyncExternalStore, nghe `storage` + `focus` + sự kiện đổi giỏ mà lib/cart.ts đã phát), avatar tròn chữ "H". Dưới header là dải vàng banner demo. Mobile: nav cuộn ngang, không tràn trang.

## 2b. Trang `/` — 2 cột (mobile: xếp dọc)
**Cột trái, thẻ "TÌM VỊ TRÍ / NHÀ THUỐC":**
- Ô "Nhập địa chỉ" (placeholder "Ví dụ: 12 Nguyễn Huệ, Quận 1"; chỉ hiển thị).
- Dropdown **Tỉnh / Thành** và **Xã / Phường** (dữ liệu `GET /locations`; Phường phụ thuộc Tỉnh; mặc định TP. Hồ Chí Minh nếu có, nếu không thì tỉnh đầu tiên).
- Nút xanh đặc "Sử dụng vị trí hiện tại (GPS)" (navigator.geolocation, timeout 10s; lỗi → thông báo vàng, không crash).
- Nút viền xanh "Áp dụng vị trí đã nhập": đặt vị trí = tâm Phường đã chọn (chưa chọn Phường thì tâm Tỉnh).
- Hộp trạng thái xám: "Chưa có vị trí nhận hàng. Hãy nhập địa chỉ hoặc bấm GPS." / khi đã có: tên khu hoặc "Vị trí GPS (lat, lng)".
- Tiêu đề "Danh sách nhà thuốc gần đó": gọi `/pharmacies/nearby` theo vị trí (chưa có vị trí thì chỉ hiện thông báo, không gọi). Mỗi dòng: tên, địa chỉ, khoảng cách (1 chữ số thập phân, "km"), nút "Chọn" (setPharmacy), dòng được chọn nổi bật. Có thể kèm bản đồ Leaflet nhỏ, tái dùng `components/PharmacyMap.tsx` (useMemo điểm để không fitBounds lại khi bấm Chọn).

**Cột phải, 2 tab thẻ lớn:**
- **TH1: TÌM THUỐC THEO ẢNH ĐƠN**, phụ đề "Tải ảnh đơn → AI đọc → nhà thuốc có đủ thuốc" (tab đang chọn: viền cam, nền cam nhạt).
- **TH2: SẢN PHẨM KHÔNG CẦN KÊ ĐƠN**, phụ đề "Chọn TPCN → nhà thuốc gần đó có hàng".

*TH1:* vùng upload nét đứt cam (icon camera, "Tải ảnh đơn thuốc", "Chọn ảnh từ máy hoặc điện thoại (JPG/PNG, tối đa 5MB)"; click hoặc kéo thả; preview và revoke object URL; kiểm tra type jpeg/png/webp và ≤ 5MB). Hai dòng cảnh báo vàng khi thiếu: "Chưa có vị trí — hãy nhập địa chỉ hoặc bấm GPS ở cột trái." và "Chưa có ảnh đơn — hãy tải ảnh đơn thuốc ở bước trên." Nút lớn "Tìm nhà thuốc có đủ thuốc": xám và khóa cho đến khi có vị trí + ảnh. Khi bấm: `POST /prescriptions/analyze` (field `image`), rồi hiển thị theo status:
- `APPROVED` + `can_unlock_rx` + `input_type === "IMAGE"`: bảng thuốc đọc được. Các thuốc có `matched_drug_id` → gọi `GET /pharmacies/with-stock?lat&lng&drug_ids=…` → danh sách nhà thuốc đủ HÀNG của TẤT CẢ thuốc khớp (sắp theo khoảng cách). Thuốc không khớp hiện "Không có trong hệ thống". Không nhà thuốc nào đủ → thông báo rõ. Nút "Chọn nhà thuốc này và thêm vào giỏ": `setPharmacy`, và cho từng thuốc khớp: nếu `cart.prescriptionId` khác đơn này thì xóa các dòng RX cũ (như trang /ai), `setPrescription(result.id)`, `addItem({drugId, name, price, category, quantity, maxQty})` với name/price/category lấy từ catalog theo `matched_drug_id` (không dùng tên OCR); quantity = maxQty = `max_packs` (mục 6). Sau đó link "Xem giỏ hàng". Chống race (request-id ref), chặn double-click.
- `REJECTED_NOT_RX`: khung đỏ + message + nút "Tư vấn Bác sĩ" → /doctor (thêm link OTC nếu `otc_hint`).
- `UNREADABLE`: message + nút thử lại.

*TH2:* lưới TPCN (`GET /drugs?category=TPCN`, ô tìm debounce), chọn nhiều sản phẩm kèm số lượng ≥ 1; cảnh báo vàng thiếu vị trí; nút "Tìm nhà thuốc có hàng" (khóa đến khi có vị trí + ít nhất 1 sản phẩm) → `with-stock` theo các `drug_id` đã chọn → danh sách nhà thuốc đủ hàng; "Chọn nhà thuốc này và thêm vào giỏ" → `setPharmacy` + `addItem` các sản phẩm đã chọn. Rx/OTC không xuất hiện ở TH2.

Giá 0 (Rx) luôn hiển thị "Giá tại nhà thuốc", không bao giờ "0đ".

## 3. Các trang giữ lại
Đổi style cho khớp (nền `#f1f5f2`, thẻ trắng bo 2xl, nút xanh lá, tab dạng pill): `/drugs`, `/cart`, `/ai`, `/doctor`. KHÔNG đổi hành vi hay hợp đồng API.

## 4. Backend: hợp đồng (JSON snake_case)
- Bảng `pharmacy_stock(id, pharmacy_id, drug_id, quantity)`, unique (pharmacy_id, drug_id), `quantity` int ≥ 1 (không lưu dòng 0). Seed idempotent bằng `random.Random(42)` duyệt theo id tăng dần: mỗi (nhà thuốc, thuốc) OTC/TPCN có hàng với xác suất 0.8, quantity 5–50; RX xác suất 0.35, quantity 1–20. Khi reseed xóa stock trước pharmacies/drugs.
- `GET /locations` → `[{"province": str, "lat": float, "lng": float, "wards": [{"ward": str, "lat": float, "lng": float}]}]`, suy ra từ `pharmacies.address`. Xem định dạng địa chỉ thật trong `backend/data/pharmacies.json`; tách Tỉnh/Thành và Phường/Xã/Thị trấn ở các đoạn cuối, chuẩn hóa tên, bỏ trùng; tâm = trung bình tọa độ các nhà thuốc trong khu. Nhà thuốc không tách được phường thì chỉ tính vào tỉnh; không tách được tỉnh thì bỏ khỏi danh sách (vẫn xuất hiện trong nearby). Sắp theo tên tỉnh; HCM (nếu có) đứng đầu.
- `GET /pharmacies/with-stock?lat&lng&drug_ids=1,2,3&limit=20` → như `/pharmacies/nearby` kèm `items: [{"drug_id": int, "quantity": int}]` (tồn kho các thuốc được yêu cầu). CHỈ trả nhà thuốc có đủ MỌI `drug_ids`; sắp tăng dần theo khoảng cách. Validate: `lat∈[-90,90]`, `lng∈[-180,180]`, `limit` 1–100, `drug_ids` bắt buộc, 1–20 id nguyên dương, không trùng (sai → 422); id không tồn tại trong catalog → 404. Có test cho mỗi trường hợp.
- `/orders` không đổi về kiểm tồn kho.

## 5. LIFEDOVATE
Trong `backend/data/drugs.json`, bản ghi LIFEDOVATE CREAM 0.05% (clobetasone) → `category: "RX"`, `price: 0` (giữ quy ước sentinel của Rx). Cập nhật test dữ liệu nếu cần.

## 6. Lệch đơn vị số lượng (Gemini trả số viên, catalog tính theo hộp)
Quy tắc fail-safe:
- Schema Gemini thêm `quantity_unit`: `"pack"` (hộp/lọ/tuýp/chai/vỉ, tức đơn vị bán), `"unit"` (viên/gói/ống/ml...), `"unknown"`. Prompt yêu cầu trả đúng đơn vị ghi trên đơn. `items_json` mỗi item thêm `quantity_unit`; dữ liệu cũ thiếu = `"unknown"`.
- Số pack tối đa cho một thuốc Rx: `quantity_unit == "pack"` → `quantity`. Ngược lại (`unit`/`unknown`/thiếu) → `ceil(quantity / units_per_pack)`, với `units_per_pack` = tích `N×M` parse từ tên catalog dạng `2X7`, `4X7`, `10X10` (regex `(\d+)\s*[xX]\s*(\d+)`); không parse được → tối đa **1** pack. Luôn ≥ 1.
- MỘT hàm dùng chung `allowed_packs(item: dict, drug) -> int` trong `backend/app/packs.py`, dùng ở cả `ai.py` (để trả `max_packs`) và `orders.py` (để kiểm tra), không nhân đôi logic.
- `/prescriptions/analyze` trả thêm `max_packs: int` cho mỗi item có `matched_drug_id` (null nếu không khớp). `lib/api.ts`: `AnalyzeResult.items[]` thêm `quantity_unit?` và `max_packs?: number | null`.

## 7. Thất bại (anti-goals) của đợt này
- Rx lọt vào giỏ/đơn không có đơn ẢNH APPROVED hợp lệ.
- Hiển thị "0đ" cho thuốc Rx.
- Gọi API ngoài hoặc geocode.
- Làm hỏng hợp đồng API cũ (các test hiện có phải còn chạy).

## 8. Ảnh sản phẩm và ảnh nhà thuốc (bổ sung, người dùng yêu cầu)
Quyết định (người dùng): tải ảnh về **lưu cục bộ**; ảnh nhà thuốc **crawl nếu có**, thiếu thì dùng **ảnh mặc định**.
- Crawl (mở rộng `backend/scripts/crawl.py`, KHÔNG bắt buộc chạy lại crawl đầy đủ): script riêng `backend/scripts/crawl_images.py` đọc `data/drugs.json` (đã có `image_url` CDN cho cả 100 thuốc) và `data/pharmacies.json`, tải ảnh, nén về WebP cạnh dài tối đa 400px (Pillow), lưu `backend/static/images/drugs/<id-ổn-định>.webp` và `backend/static/images/pharmacies/<id-ổn-định>.webp`. Tên file ổn định = slug từ `source_url` hoặc hash của `source_url` (không dùng id DB vì reseed đổi id). Ghi manifest `backend/data/images.json` ánh xạ `source_url` → đường dẫn tương đối (hoặc null nếu tải lỗi / không có ảnh). Lịch sự: ≥ 1s giữa các request tới site, UA như crawler hiện có, tối đa 100 ảnh mỗi loại, timeout, bỏ qua lỗi từng ảnh (không dừng cả script), idempotent (bỏ qua file đã có). Ảnh thuốc từ CDN công khai có thể tải bằng httpx không cần Playwright; ảnh nhà thuốc: kiểm tra payload `list-shop` (xem `scripts/crawl.py` `normalize_pharmacy` và báo cáo T2) tìm trường ảnh cửa hàng (ví dụ image/thumbnail/photos); nếu API không có ảnh cửa hàng, thử trang chi tiết cửa hàng (`slugEcom`) bằng Playwright headed như crawler hiện có, lấy ảnh og:image / ảnh cửa hàng; không tìm được thì manifest = null (frontend dùng ảnh mặc định). Dữ liệu ảnh + manifest được commit (repo nặng thêm vài chục MB: nén kỹ).
- Ảnh mặc định: `backend/static/images/default-drug.webp` và `backend/static/images/default-pharmacy.webp` (tạo bằng Pillow: nền `#d9f2e3`, biểu tượng đơn giản; không dùng logo thương hiệu thật).
- Backend: serve `backend/static/` qua `StaticFiles` mount ở `/static` (app/main.py). Seed đọc `data/images.json` và đặt `image_url` của thuốc thành đường dẫn tĩnh `/static/images/drugs/<file>.webp` (nếu có) — nếu không có thì giữ URL CDN gốc làm dự phòng; thêm cột `image_url` (nullable, Text) cho `Pharmacy` (models.py + seed) với `/static/images/pharmacies/<file>.webp` hoặc null. API: `GET /pharmacies/nearby` và `GET /pharmacies/with-stock` trả thêm `image_url: str | null` (đường dẫn tương đối `/static/...`, KHÔNG gắn host); `GET /drugs` vẫn trả `image_url` (đã có). Không đổi tên/kiểu các trường hiện có.
- Frontend: `lib/api.ts` thêm `image_url` vào `Pharmacy` (kiểu `string | null`), helper `imageUrl(path: string | null | undefined, kind: "drug" | "pharmacy"): string` trả `API + path` khi path bắt đầu bằng `/static/`, trả nguyên khi là URL `http(s)`, và ảnh mặc định (`API + "/static/images/default-<kind>.webp"`) khi null/rỗng; `<img>` dùng `loading="lazy"`, `alt` = tên, kích thước cố định để không nhảy bố cục, `onError` đổi sang ảnh mặc định một lần. Hiển thị: thẻ thuốc ở `/drugs` và lưới TH2 (ảnh vuông ~96px bên trái/trên), dòng giỏ hàng `/cart` (ảnh nhỏ 56px), bảng thuốc đọc được từ đơn (nếu có `matched_drug_id` thì ảnh từ catalog; tùy chọn), thẻ nhà thuốc ở danh sách trái và kết quả `with-stock` (ảnh ~64px). Không thêm thư viện mới. Next.js: dùng thẻ `<img>` thường (ảnh từ API ngoài) và tắt cảnh báo `@next/next/no-img-element` ở dòng đó nếu lint yêu cầu, không cấu hình `next/image` remotePatterns.
- Thất bại: tải ảnh của site nhưng ghi đè dữ liệu hiện có khi lỗi (không được); hiển thị ảnh vỡ khi thiếu; ảnh thuốc Rx hiển thị kèm nút thêm giỏ (hành vi khóa Rx không đổi); hotlink bắt buộc khi chạy demo.
