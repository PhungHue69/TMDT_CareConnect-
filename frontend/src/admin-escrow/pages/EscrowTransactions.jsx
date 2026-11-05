import { tinhHoaHong, tinhTienDoiTac } from "../services/escrow";
import { formatMoney } from "../services/format";

const statusLabels = {
    pending: "Đang giữ tiền",
    completed: "Đã hoàn tất",
    paid_out: "Đã chi đối tác",
    refunded: "Đã hoàn tiền",
};

export default function EscrowTransactions({ orders, onComplete }) {
    return (
        <section>
            <h1>Giao dịch Escrow</h1>

            <p className="demo-note">
                Dữ liệu demo. Hoàn tất đơn sẽ ghi nhận hoa hồng và cộng ví
                đối tác. Dữ liệu sẽ mất khi tải lại trang.
            </p>

            <div className="finance-table-wrapper">
                <table className="finance-table">
                    <thead>
                        <tr>
                            <th>Mã đơn</th>
                            <th>Đối tác</th>
                            <th>Tổng khách trả</th>
                            <th>Hoa hồng</th>
                            <th>Tiền đối tác</th>
                            <th>Trạng thái</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>

                    <tbody>
                        {orders.map(order => {
                            const total = order.subtotal + order.shippingCharged;

                            const commission =
                                order.hoaHong ??
                                tinhHoaHong(order.subtotal, order.commissionRate);

                            const partnerAmount =
                                order.tienDoiTac ?? tinhTienDoiTac(order);

                            return (
                                <tr key={order.id}>
                                    <td>{order.id}</td>
                                    <td>{order.partnerId}</td>
                                    <td>{formatMoney(total)}</td>
                                    <td>{formatMoney(commission)}</td>
                                    <td>{formatMoney(partnerAmount)}</td>
                                    <td>
                                        <span className={`finance-status ${order.status}`}>
                                            {statusLabels[order.status]}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            disabled={order.status !== "pending"}
                                            onClick={() => onComplete(order.id)}
                                        >
                                            Hoàn tất
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="demo-note">
                Hoa hồng và tiền đối tác của đơn đang giữ là số dự kiến.
                Đơn đã hoàn tiền không được cộng vào doanh thu.
            </p>
        </section>
    );
}