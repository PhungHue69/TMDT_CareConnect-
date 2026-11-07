import { formatMoney } from "../services/format";

export default function PartnerWallet({
    orders,
    wallets,
    withdrawalRequests,
    onWithdraw,
}) {
    const partnerIds = [
        ...new Set([
            ...orders.map(order => order.partnerId),
            ...Object.keys(wallets),
        ]),
    ];

    return (
        <section>
            <h1>Ví đối tác</h1>

            <p className="demo-note">
                Chức năng rút tiền chỉ tạo yêu cầu giả lập.
                Chưa có giao dịch chuyển khoản thực tế.
            </p>

            <div className="finance-table-wrapper">
                <table className="finance-table">
                    <thead>
                        <tr>
                            <th>Mã đối tác</th>
                            <th>Số dư khả dụng</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>

                    <tbody>
                        {partnerIds.map(partnerId => {
                            const balance = wallets[partnerId] ?? 0;

                            const hasPendingRequest = withdrawalRequests.some(
                                request =>
                                    request.partnerId === partnerId &&
                                    request.status === "requested"
                            );

                            return (
                                <tr key={partnerId}>
                                    <td>{partnerId}</td>
                                    <td>{formatMoney(balance)}</td>
                                    <td>
                                        <button
                                            type="button"
                                            disabled={balance <= 0 || hasPendingRequest}
                                            onClick={() => onWithdraw(partnerId)}
                                        >
                                            {hasPendingRequest
                                                ? "Đã tạo yêu cầu"
                                                : "Rút tiền (giả lập)"}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <h2>Yêu cầu rút tiền</h2>

            {withdrawalRequests.length === 0 ? (
                <p>Chưa có yêu cầu rút tiền.</p>
            ) : (
                <div className="finance-table-wrapper">
                    <table className="finance-table">
                        <thead>
                            <tr>
                                <th>Đối tác</th>
                                <th>Số tiền yêu cầu</th>
                                <th>Thời gian</th>
                                <th>Trạng thái</th>
                            </tr>
                        </thead>

                        <tbody>
                            {withdrawalRequests.map(request => (
                                <tr key={request.id}>
                                    <td>{request.partnerId}</td>
                                    <td>{formatMoney(request.amount)}</td>
                                    <td>
                                        {new Date(request.createdAt).toLocaleString("vi-VN")}
                                    </td>
                                    <td>Chờ xử lý — giả lập</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}