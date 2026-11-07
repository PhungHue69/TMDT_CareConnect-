import { tinhThongKe } from "../services/escrow";
import { formatMoney } from "../services/format";

export default function RevenueDashboard({ orders }) {
    const stats = tinhThongKe(orders);

    const cards = [
        ["Đang giữ", stats.dangGiu],
        ["Hoa hồng ghi nhận", stats.hoaHongGhiNhan],
        ["Đã chi đối tác", stats.daChiDoiTac],
    ];

    return (
        <section>
            <h1>Dashboard doanh thu</h1>

            <div className="revenue-grid">
                {cards.map(([label, value]) => (
                    <article className="revenue-card" key={label}>
                        <h2>{label}</h2>
                        <p>{formatMoney(value)}</p>
                    </article>
                ))}
            </div>

            <p className="demo-note">
                Hoa hồng ghi nhận chưa phải lãi ròng.
                Yêu cầu rút tiền đang chờ không được tính là đã chi đối tác.
            </p>
        </section>
    );
}