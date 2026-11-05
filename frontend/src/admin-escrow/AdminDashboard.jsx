import { useState } from "react";
import ProfileApproval from "./pages/ProfileApproval";
import EscrowTransactions from "./pages/EscrowTransactions";
import RevenueDashboard from "./pages/RevenueDashboard";
import PlansAndCoins from "./pages/PlansAndCoins";
import "./AdminDashboard.css";

const menus = [
  ["profiles", "Duyệt hồ sơ"],
  ["escrow", "Giao dịch Escrow"],
  ["revenue", "Doanh thu"],
  ["plans", "Gói Pro & CareCoin"],
];

export default function AdminDashboard() {
  const [active, setActive] = useState("profiles");

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <h2>CareConnect Admin</h2>

        {menus.map(([key, label]) => (
          <button
            key={key}
            className={active === key ? "active" : ""}
            onClick={() => setActive(key)}
          >
            {label}
          </button>
        ))}
      </aside>

      <main className="admin-content">
        {active === "profiles" && <ProfileApproval />}
        {active === "escrow" && <EscrowTransactions />}
        {active === "revenue" && <RevenueDashboard />}
        {active === "plans" && <PlansAndCoins />}
      </main>
    </div>
  );
}