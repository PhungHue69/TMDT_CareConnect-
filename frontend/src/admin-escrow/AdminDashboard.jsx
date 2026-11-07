import { useState } from "react";

import ProfileApproval from "./pages/ProfileApproval";
import EscrowTransactions from "./pages/EscrowTransactions";
import RevenueDashboard from "./pages/RevenueDashboard";
import PartnerWallet from "./pages/PartnerWallet";
import PlansAndCoins from "./pages/PlansAndCoins";
import Dataset from './pages/Dataset';

import { initialOrders } from "./data/mockOrders";
import { hoanTatDon } from "./services/escrow";

import "./AdminDashboard.css";

const menus = [
    ['dataset', 'Dataset & kết nối'],
    ["profiles", "Duyệt hồ sơ"],
    ["escrow", "Giao dịch Escrow"],
    ["revenue", "Doanh thu"],
    ["wallet", "Ví đối tác"],
    ["plans", "Gói Pro & CareCoin"],
];

export default function AdminDashboard() {
    const [active, setActive] = useState("profiles");
    const [datasetLoaded, setDatasetLoaded] = useState(false);

    const [escrowState, setEscrowState] = useState({
        orders: initialOrders,
        wallets: {},
        withdrawalRequests: [],
    });

    function handleComplete(orderId) {
        setEscrowState(current => {
            const order = current.orders.find(item => item.id === orderId);

            if (!order || order.status !== "pending") {
                return current;
            }

            return hoanTatDon(current, orderId);
        });
    }

    function handleWithdraw(partnerId) {
        // Tạo ID và thời gian ngoài hàm cập nhật state.
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        setEscrowState(current => {
            const amount = current.wallets[partnerId] ?? 0;

            const hasPendingRequest = current.withdrawalRequests.some(
                request =>
                    request.partnerId === partnerId &&
                    request.status === "requested"
            );

            if (amount <= 0 || hasPendingRequest) {
                return current;
            }

            return {
                ...current,
                withdrawalRequests: [
                    ...current.withdrawalRequests,
                    {
                        id,
                        partnerId,
                        amount,
                        status: "requested",
                        createdAt,
                    },
                ],
            };
        });
    }

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <h2>CareConnect Admin</h2>

                {menus.map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        className={active === key ? "active" : ""}
                        onClick={() => setActive(key)}
                    >
                        {label}
                    </button>
                ))}
            </aside>

            <main className="admin-content">
                <div hidden={active !== 'dataset'}><Dataset loaded={datasetLoaded} onLoad={state => { setEscrowState(state); setDatasetLoaded(true); }} /></div>
                {active === "profiles" && <ProfileApproval />}

                {active === "escrow" && (
                    <EscrowTransactions
                        orders={escrowState.orders}
                        onComplete={handleComplete}
                    />
                )}

                {active === "revenue" && (
                    <RevenueDashboard orders={escrowState.orders} />
                )}

                {active === "wallet" && (
                    <PartnerWallet
                        orders={escrowState.orders}
                        wallets={escrowState.wallets}
                        withdrawalRequests={escrowState.withdrawalRequests}
                        onWithdraw={handleWithdraw}
                    />
                )}

                {active === "plans" && <PlansAndCoins />}
            </main>
        </div>
    );
}
