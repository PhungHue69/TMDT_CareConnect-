import { tinhHoaHong, tinhTienDoiTac } from "../services/escrow";
import { formatMoney } from "../services/format";
import { useState } from 'react';

const statusLabels = {
    pending: "Đang giữ tiền",
    completed: "Đã hoàn tất",
    paid_out: "Đã chi đối tác",
    refunded: "Đã hoàn tiền",
};

export default function EscrowTransactions({ orders, onComplete }) {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);
    const filtered = orders.filter(o => (!status || o.status === status) && `${o.id} ${o.partnerId} ${o.name}`.toLowerCase().includes(query.toLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / 25));
    const currentPage = Math.min(page, pages);
    return (
        <section>
            <h1>Giao dịch Escrow</h1>

            <p className="demo-note">
                Dữ liệu demo. Hoàn tất đơn sẽ ghi nhận hoa hồng và cộng ví
                đối tác. Dữ liệu sẽ mất khi tải lại trang.
            </p>

            <div className="data-pagination"><label>Tìm mã đơn, đối tác, thuốc<input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><label>Trạng thái<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tất cả</option>{Object.entries(statusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label></div>
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
                        {filtered.slice((currentPage - 1) * 25, currentPage * 25).map(order => {
                            const total = order.subtotal + order.shippingCharged;

                            const commission =
                                order.hoaHong ??
                                tinhHoaHong(order.subtotal, order.commissionRate);

                            const partnerAmount =
                                order.tienDoiTac ?? tinhTienDoiTac(order);

                            return (
                                <tr key={order.id}>
                                    <td>{order.id}<small style={{ display: 'block' }}>{order.name}</small></td>
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
            <div className="data-pagination"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trước</button><span>Trang {currentPage}/{pages} · {filtered.length.toLocaleString('vi-VN')} kết quả</span><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Sau</button></div>

            <p className="demo-note">
                Hoa hồng và tiền đối tác của đơn đang giữ là số dự kiến.
                Đơn đã hoàn tiền không được cộng vào doanh thu.
            </p>
        </section>
    );
}
