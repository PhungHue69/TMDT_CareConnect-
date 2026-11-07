import React from "react";
import ReactDOM from "react-dom/client";
import App from "./admin-escrow/App";
import "./portal.css";

function Portal() {
    const modules = [
        ["/admin", "Quản trị", "Duyệt hồ sơ, giao dịch Escrow, doanh thu và CareCoin."],
        ["/shop", "Mua thuốc", "Tìm nhà thuốc, tra cứu sản phẩm và gửi đơn thuốc."],
        ["/buyer-family/index.html", "Family Care", "Quản lý gia đình, hồ sơ sức khỏe và nhắc uống thuốc."],
        ["/pharmacy-portal/index.html", "Nhà thuốc", "Quản lý kho, đơn hàng, hồ sơ và ví nhà thuốc."],
    ];
    return <div className="cc-portal"><header><strong>CareConnect</strong><span>Chăm sóc sức khỏe gia đình</span></header><main><h1>Bạn muốn sử dụng phân hệ nào?</h1><p>Chọn chức năng để bắt đầu.</p><nav aria-label="Các phân hệ CareConnect">{modules.map(([href, title, description]) => <a key={href} href={href}><h2>{title}</h2><p>{description}</p><span>Mở phân hệ →</span></a>)}</nav></main></div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        {window.location.pathname.startsWith('/admin') ? <><a className="cc-home" href="/">← CareConnect</a><App /></> : <Portal />}
    </React.StrictMode>
);
