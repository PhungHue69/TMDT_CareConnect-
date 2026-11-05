# Thiết kế giao diện tìm nhà thuốc và chi tiết nhà thuốc

## Mục đích
Thiết kế lại **giao diện hiện có** theo hai ảnh tham khảo do người dùng gửi: tìm nhà thuốc quanh vị trí trên bản đồ, sau đó xem trang chi tiết nhà thuốc riêng với hai lựa chọn mua hàng. Mục tiêu là dùng được trên desktop lẫn điện thoại, dễ thấy thao tác chính và không làm mất dữ liệu đang chọn khi quay lại bản đồ.

## Phạm vi và ranh giới
- Chỉ đổi màn hình **tìm nhà thuốc** và **chi tiết nhà thuốc** trong frontend Next.js hiện có. Không tạo app mobile native; điện thoại xem web responsive.
- Giữ backend/API và quy tắc đã có: Goong tra địa chỉ, GPS hoặc tỉnh/xã, danh sách nhà thuốc gần đó, tồn kho theo nhà thuốc, giỏ OTC+TPCN, tải/chụp ảnh đơn và AI sàng lọc trước khi lưu yêu cầu demo.
- Không tạo bottom navigation, đánh giá sao, giờ mở cửa hay trạng thái “Đang hoạt động”; dữ liệu thực tế hiện chưa có các trường ấy. Không sao chép logo, tên nhà thuốc, nội dung đánh giá giả hoặc ảnh nhận dạng từ mockup như thể là dữ liệu thật.

## Màn hình 1 — tìm nhà thuốc
- Thương hiệu **Thuốc Gần Bạn** dùng xanh dương như ảnh tham khảo; nền nhạt, chữ dễ đọc. Header/search/filter được sắp lại để ưu tiên tìm nhà thuốc, thay cho thẻ hai cột nhỏ hiện tại.
- Bộ chọn vị trí: tìm địa chỉ theo chữ, nút GPS và tỉnh/xã; sau khi chọn vị trí hợp lệ, bản đồ phóng đến khu vực. Không có vị trí thì bản đồ Việt Nam hiển thị tổng quan. Nếu địa chỉ trùng nhau, hiện gợi ý để chọn, không ghim bừa. GPS lỗi vẫn chọn tỉnh/xã được.
- Chấm **đỏ** thể hiện nhà thuốc; chấm vị trí khách khác màu. Bấm chấm hiện tên, địa chỉ và khoảng cách; chỉ khi bấm “Chọn nhà thuốc” mới chuyển sang trang chi tiết. Danh sách gần đó cũng có ảnh/tên/địa chỉ/khoảng cách/nút chọn, không hiển thị dữ liệu đánh giá hay trạng thái không có thật.
- Trên **desktop**, bản đồ và danh sách nằm cạnh nhau (bản đồ rộng hơn). Trên **điện thoại**, bản đồ ở trên, danh sách ở dưới, khoảng đệm/tap target đủ dùng bằng ngón tay và không cuộn ngang. Ảnh mẫu gợi ý tỷ lệ, không áp đặt kích thước pixel hoặc khung điện thoại giả.

## Màn hình 2 — chi tiết nhà thuốc
- Chọn nhà thuốc chuyển sang **trang riêng** có URL thể hiện ID nhà thuốc để mở/refresh đúng cửa hàng, ví dụ `/pharmacies/{id}`. Hiển thị tên, địa chỉ, khoảng cách (nếu còn biết vị trí khách) và nút “Về bản đồ” nổi bật.
- Có hai lựa chọn lớn: “Thuốc theo đơn” và “Thuốc không kê đơn”. Chọn lựa chọn nào thì nội dung tương ứng nằm ngay dưới; tương tác tab giữ trạng thái chưa hoàn tất. Không làm khung nổi đè bản đồ như thiết kế cũ.
- Thuốc không kê đơn: **OTC + TPCN chung một danh sách**, có nhãn loại, tìm theo tên và phân trang/xem thêm để không nhồi cả danh mục. Chỉ hiển thị sản phẩm còn hàng tại nhà thuốc đã chọn; thêm giỏ với đúng ID nhà thuốc. Dữ liệu tồn kho là dữ liệu demo, ghi rõ.
- Thuốc theo đơn: chụp ảnh trên điện thoại hoặc chọn ảnh từ thư viện/thiết bị, xem trước, gửi. AI chỉ sàng lọc ảnh có vẻ là đơn: giấy ghi triệu chứng/yêu cầu kê đơn bị chặn, ảnh mờ yêu cầu chụp lại, ảnh nhận ra là đơn (dù ngày cũ/chữ ký không rõ) lưu ảnh gốc kèm mã nhà thuốc vào yêu cầu để dược sĩ kiểm tra sau. Không hiện các thuốc AI trích xuất, không mua Rx trực tiếp và không khẳng định đơn hợp lệ pháp lý. Sau khi lưu được yêu cầu mới hiện “Gửi đơn thuốc thành công” cùng chú thích bản demo mới lưu, chưa chuyển sang phân hệ dược sĩ. Mỗi lần gửi tạo yêu cầu riêng.

## Quay lại và đổi nhà thuốc
- Nút “Về bản đồ” không xóa giỏ hoặc ảnh nháp khi vẫn ở cùng tab trình duyệt. Mở lại cùng nhà thuốc giữ cả hai; tải lại trang không cần giữ ảnh nháp vì ảnh sức khỏe nhạy cảm. Giỏ có thể dùng localStorage như code hiện có nhưng luôn gắn với ID nhà thuốc. Truy cập trực tiếp URL với ID nhà thuốc không tồn tại thì hiện trang không tìm thấy nhà thuốc kèm nút về bản đồ (lựa chọn của người triển khai).
- Chỉ khi chọn **nhà thuốc khác**, nếu giỏ/ảnh chưa gửi còn dữ liệu, hỏi xác nhận xóa cả giỏ lẫn ảnh trước khi chuyển. Hủy thì không thay đổi. Đổi vị trí/GPS khi đang có nhà thuốc đã chọn thì hỏi tìm gần vị trí mới hay giữ vị trí cũ; chọn giữ vị trí cũ thì bỏ vị trí mới hoàn toàn. Chưa xóa giỏ/ảnh cho đến khi thực sự đổi nhà thuốc.
- Mỗi lần chủ động gửi một ảnh khác tạo yêu cầu mới; khi một yêu cầu đang gửi thì khóa nút để tránh double-click. Nếu mất mạng trước khi biết server đã nhận hay chưa, bản demo nên dùng mã idempotency ổn định cho lần gửi đó để thử lại không vô tình lưu hai bản sao (lựa chọn kỹ thuật của người triển khai).

## Quyết định kỹ thuật giao cho người triển khai
- Sử dụng Next.js/React/Tailwind, Leaflet/React-Leaflet và FastAPI hiện có; không thêm framework hoặc bộ icon không cần thiết. Đổi màu qua các token trong `frontend/app/globals.css`, tránh sửa rải rác tất cả component không thuộc hai màn hình.
- Nếu Next router unmount trang chi tiết khi về bản đồ, dùng một nguồn state phía client đủ để giữ ảnh nháp **trong vòng đời tab** (không lưu vào localStorage hay backend khi chưa gửi), và giỏ theo store sẵn có. Địa chỉ vị trí được lưu theo phiên nếu cần để trang chi tiết hiển thị khoảng cách chính xác; không ghi tọa độ GPS lên URL.
- Giữ mô hình backend khoá RX khỏi `/orders`; trang chi tiết không gọi endpoint OCR/match thuốc cũ cho luồng gửi ảnh.

## Điều kiện đạt
1. Ở desktop, bản đồ/danh sách cạnh nhau; ở điện thoại, map trên/danh sách dưới, nút chọn/quay lại/tab có thể bấm và không tràn ngang.
2. Chọn tỉnh/xã/GPS/địa chỉ cập nhật map; bấm ghim chỉ xem thông tin, bấm chọn sang `/pharmacies/{id}`.
3. Quay lại bản đồ rồi vào cùng nhà thuốc giữ giỏ/ảnh chưa gửi; đổi nhà thuốc chỉ xóa sau xác nhận; đổi vị trí giữ giỏ/ảnh đến khi đổi nhà thuốc.
4. Danh sách OTC/TPCN đúng tồn kho nhà thuốc; ảnh đơn chỉ gửi khi lưu backend thành công; lời báo demo không hàm ý dược sĩ đã tiếp nhận.
5. Xác minh trong Chrome thực cả desktop và viewport điện thoại, không chỉ API trả 200: ô tỉnh/xã phải tải, tab chuyển được, không lỗi JS, danh sách/bản đồ và trang chi tiết chạy đúng. Chạy tests, lint, typecheck và build; báo trung thực những phần thiếu dịch vụ AI/khả năng camera do trình duyệt.
