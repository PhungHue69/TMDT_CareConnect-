import React from "react";
import ReactDOM from "react-dom/client";
import App from "./admin-escrow/App";
import "./portal.css";

// Icon nét mảnh cùng kiểu với các phân hệ
const svg = (d) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;
const ICON = {
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    doctor: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
    store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5h16v1a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 13a3 3 0 0 1-2.7-1.6A3 3 0 0 1 4 10.5z"/><path d="M5.5 13v7h13v-7"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
};

function Portal() {
    // Người dùng (con cái, bố mẹ) dùng một ứng dụng: mua thuốc, khám bác sĩ, gia đình, lịch thuốc...
    const modules = [
        ["/buyer-family/index.html", "Người dùng", "Mua thuốc, gửi đơn thuốc, khám bác sĩ online, đặt lịch phòng khám, chăm sóc sức khỏe bố mẹ từ xa.", "users", true],
        ["/doctor-telehealth/index.html", "Bác sĩ", "Hàng chờ khám, kê đơn điện tử, thu nhập và đánh giá.", "doctor"],
        ["/pharmacy-portal/index.html", "Nhà thuốc", "Báo giá đơn thuốc, đơn hàng, kho thuốc và ví nhà thuốc.", "store"],
        ["/admin", "Quản trị", "Duyệt hồ sơ, giao dịch Escrow, doanh thu và CareCoin.", "chart"],
    ];
    return (
        <div className="cc-portal">
            <header><span className="cc-mark">{svg(ICON.heart)}</span><strong>CareConnect</strong><span>Chăm sóc sức khỏe gia đình</span></header>
            <main>
                <h1>Bạn là ai?</h1>
                <p>Chọn phân hệ để đăng nhập.</p>
                <nav aria-label="Các phân hệ CareConnect">
                    {modules.map(([href, title, description, icon, primary]) => (
                        <a key={href} href={href} className={primary ? "primary" : undefined}>
                            <span className="cc-icon">{svg(ICON[icon])}</span>
                            <h2>{title}</h2>
                            <p>{description}</p>
                            <span>Mở phân hệ →</span>
                        </a>
                    ))}
                </nav>
            </main>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        {window.location.pathname.startsWith('/admin') ? <><a className="cc-home" href="/">← CareConnect</a><App /></> : <Portal />}
    </React.StrictMode>
);
