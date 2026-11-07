# Tìm chính xác địa chỉ người dùng

**Mục đích:** Người mua nhập địa chỉ nhận hàng cụ thể và nhìn thấy ghim đúng địa chỉ đó trên bản đồ nhà thuốc hiện có; danh sách nhà thuốc được tính lại theo tọa độ chính xác.

**Phạm vi:** Chỉ thay luồng định vị bên trái trang chủ. Giữ GPS và chọn Tỉnh/Xã làm cách dự phòng; không làm lại bản đồ, hai tab đơn thuốc/TPCN hoặc giỏ hàng. Hai cột tiếp tục hoạt động song song; nhập vị trí không xóa ảnh hoặc sản phẩm đã chọn.

**Hành vi đã chốt:** Người dùng gõ địa chỉ; sau khoảng 1 giây ngừng gõ, tự tìm địa chỉ, không yêu cầu bấm Áp dụng. Với một kết quả phù hợp rõ ràng, tự đặt ghim tại tọa độ địa chỉ, tải lại nhà thuốc quanh đó. Nếu có nhiều kết quả trùng/mơ hồ, hiển thị danh sách gợi ý để người dùng chọn trước khi di chuyển ghim. Khi đổi địa chỉ, kết quả vị trí cũ vẫn hiện cho đến khi có vị trí mới được xác nhận, nhưng giao diện cần báo rõ nó là vị trí cũ; không âm thầm sử dụng tâm Tỉnh/Xã làm địa chỉ cụ thể. Trường hợp không tìm thấy hoặc dịch vụ lỗi, giữ tọa độ cũ và cho dùng GPS hay Tỉnh/Xã.

**Quyết định triển khai của trợ lý:** Dùng dịch vụ Goong Maps phía FastAPI để tra địa chỉ Việt Nam và lấy tọa độ; API key chỉ ở biến môi trường backend `GOONG_API_KEY`. Frontend gọi endpoint nội bộ qua `/demo-api`. Tiếp tục dùng Leaflet/OpenStreetMap hiện tại để vẽ bản đồ. Ưu tiên Goong Autocomplete trả gợi ý và Goong Place Detail trả tọa độ chính xác; cần đối chiếu tên endpoint/trường phản hồi với tài liệu Goong hiện hành khi lập trình vì chưa truy cập được tài liệu trong phiên này. Không có API key thì báo định vị địa chỉ chưa sẵn sàng, không giả lập tọa độ.

**Điều kiện hoàn thành:** Địa chỉ cụ thể làm thay đổi ghim và khoảng cách nhà thuốc đúng tọa độ được nhà cung cấp trả về; trường hợp nhiều kết quả cần lựa chọn; yêu cầu cũ về sau không ghi đè địa chỉ mới; thất bại/từ chối GPS vẫn dùng được lựa chọn Tỉnh/Xã; ảnh đơn và chọn TPCN vẫn nguyên.
