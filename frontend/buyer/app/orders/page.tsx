"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  acceptQuote,
  cancelOrder,
  cancelRequest,
  myOrders,
  myRequests,
  type BuyerOrder,
  type PaymentGateway,
  type RxRequest,
} from "@/lib/buyerApi";
import { AddressPicker, LoginPrompt, PaymentPicker, useBuyerSession, type SessionState } from "@/components/BuyerSession";

const vnd = (n: number | string | null) => `${Number(n || 0).toLocaleString("vi-VN")}đ`;
const when = (s: string) => new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

const ORDER_STATUS: Record<string, [string, string]> = {
  PENDING_CONFIRM: ["Chờ nhà thuốc xác nhận", "bg-warn-bg text-warn-ink"],
  CONFIRMED: ["Nhà thuốc đã xác nhận", "bg-brand-soft text-brand-dark"],
  PREPARING: ["Đang chuẩn bị thuốc", "bg-brand-soft text-brand-dark"],
  SHIPPING: ["Đang giao", "bg-brand-soft text-brand-dark"],
  COMPLETED: ["Đã giao", "bg-[#dcfce7] text-[#14713A]"],
  CANCELLED: ["Đã hủy", "bg-danger-bg text-danger-ink"],
  RETURNED: ["Hoàn hàng", "bg-danger-bg text-danger-ink"],
};
const REQUEST_STATUS: Record<string, [string, string]> = {
  SENT: ["Chờ dược sĩ báo giá", "bg-warn-bg text-warn-ink"],
  QUOTED: ["Đã có báo giá", "bg-brand-soft text-brand-dark"],
  ACCEPTED: ["Đã đặt hàng", "bg-[#dcfce7] text-[#14713A]"],
  REJECTED: ["Nhà thuốc từ chối", "bg-danger-bg text-danger-ink"],
  EXPIRED: ["Báo giá hết hạn", "bg-danger-bg text-danger-ink"],
  CANCELLED: ["Đã hủy", "bg-danger-bg text-danger-ink"],
};

function Badge({ map, status }: { map: Record<string, [string, string]>; status: string }) {
  const [label, cls] = map[status] || [status, "bg-page text-muted"];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}

export default function Page() {
  const [session] = useBuyerSession();
  const [tab, setTab] = useState<"orders" | "requests">("orders");
  const [orders, setOrders] = useState<BuyerOrder[] | null>(null);
  const [requests, setRequests] = useState<RxRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([myOrders(), myRequests()])
      .then(([o, r]) => { setOrders(o.orders); setRequests(r.requests); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được đơn hàng"));
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    load();
    // Trạng thái đơn đổi khi nhà thuốc thao tác; làm mới định kỳ cho đơn giản
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [session.status, load]);

  if (session.status === "loading") return <p className="text-muted">Đang tải...</p>;
  if (session.status === "guest") return <div className="mx-auto max-w-md"><LoginPrompt text="Đăng nhập để xem đơn hàng và đơn thuốc đã gửi." /></div>;
  if (session.status === "error") return <p role="alert" className="text-danger-ink">{session.message}</p>;

  const quoted = (requests || []).filter((r) => r.status === "QUOTED").length;
  const tabCls = (active: boolean) => `flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${active ? "bg-white text-brand shadow-sm" : "text-muted"}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex gap-1 rounded-2xl bg-[#eaf0f7] p-1">
        <button className={tabCls(tab === "orders")} onClick={() => setTab("orders")}>Đơn mua thuốc</button>
        <button className={tabCls(tab === "requests")} onClick={() => setTab("requests")}>
          Đơn thuốc đã gửi{quoted ? ` (${quoted} báo giá mới)` : ""}
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-ink">{error}</p>}
      {tab === "orders"
        ? <OrderList orders={orders} meId={session.meId} onChange={load} />
        : <RequestList requests={requests} session={session} onChange={load} />}
    </div>
  );
}

function OrderList({ orders, meId, onChange }: { orders: BuyerOrder[] | null; meId: number; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  if (!orders) return <p className="text-muted">Đang tải...</p>;
  if (!orders.length) {
    return (
      <div className="rounded-2xl border border-line bg-white p-6 text-center">
        <p className="mb-2">Chưa có đơn hàng nào.</p>
        <Link href="/" className="font-semibold text-brand underline">Tìm nhà thuốc gần bạn</Link>
      </div>
    );
  }
  async function cancel(o: BuyerOrder) {
    if (!window.confirm(`Hủy đơn ${o.order_code}?`)) return;
    setBusy(o.id);
    try { await cancelOrder(o.id); onChange(); } catch (e) { window.alert(e instanceof Error ? e.message : "Không hủy được đơn"); } finally { setBusy(null); }
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id} className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold">{o.order_code}</p>
              <p className="text-sm text-muted">{when(o.created_at)} · {o.pharmacy_name}</p>
            </div>
            <Badge map={ORDER_STATUS} status={o.status} />
          </div>
          {o.buyer_user_id !== o.recipient_user_id && (
            <p className="text-sm">
              {o.buyer_user_id === meId ? <>Gửi cho <b>{o.recipient_name}</b></> : <><b>{o.buyer_name}</b> đặt cho bạn</>}
            </p>
          )}
          <p className="text-sm text-muted">Giao tới: {o.shipping_address_line}</p>
          <ul className="text-sm">
            {(o.items || []).map((i, k) => <li key={k}>• {i.name} × {i.quantity} <span className="text-muted">({vnd(i.unit_price)})</span></li>)}
          </ul>
          {o.status === "SHIPPING" && o.driver_name && (
            <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">Tài xế {o.driver_name} · {o.driver_phone}</p>
          )}
          {o.cancel_reason && <p className="text-sm text-danger-ink">Lý do hủy: {o.cancel_reason}</p>}
          <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-sm text-muted">
              {o.payment_method === "COD" ? "Trả khi nhận hàng" : o.payment_status === "HOLDING_ESCROW" ? "Đã thanh toán · sàn tạm giữ" : o.payment_status === "REFUNDED" ? "Đã hoàn tiền" : "Đã thanh toán"}
            </span>
            <span className="font-bold">{vnd(o.total_amount)}</span>
          </div>
          {o.status === "PENDING_CONFIRM" && o.buyer_user_id === meId && (
            <button disabled={busy === o.id} onClick={() => cancel(o)} className="text-sm font-semibold text-danger-ink underline disabled:opacity-50">Hủy đơn</button>
          )}
        </li>
      ))}
    </ul>
  );
}

function RequestList({ requests, session, onChange }: { requests: RxRequest[] | null; session: Extract<SessionState, { status: "ready" }>; onChange: () => void }) {
  if (!requests) return <p className="text-muted">Đang tải...</p>;
  if (!requests.length) {
    return (
      <div className="rounded-2xl border border-line bg-white p-6 text-center">
        <p className="mb-2">Chưa gửi đơn thuốc nào.</p>
        <p className="text-sm text-muted">Chọn một nhà thuốc → Gửi ảnh đơn thuốc, hoặc khám bác sĩ online để được kê đơn điện tử.</p>
      </div>
    );
  }
  return <ul className="space-y-3">{requests.map((r) => <RequestCard key={r.id} r={r} session={session} onChange={onChange} />)}</ul>;
}

function RequestCard({ r, session, onChange }: { r: RxRequest; session: Extract<SessionState, { status: "ready" }>; onChange: () => void }) {
  const [addressId, setAddressId] = useState<number | null>(null);
  const [gateway, setGateway] = useState<PaymentGateway>("MOMO");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const canAct = r.status === "QUOTED";

  async function accept() {
    if (!addressId) return;
    setBusy(true);
    setMsg(null);
    try {
      const { order } = await acceptQuote(r.id, { address_id: addressId, payment_gateway: gateway });
      setMsg(`Đã đặt hàng ${order.order_code}. Theo dõi ở thẻ Đơn mua thuốc.`);
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không đặt được hàng");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!window.confirm("Hủy đơn thuốc đã gửi?")) return;
    try { await cancelRequest(r.id); onChange(); } catch (e) { window.alert(e instanceof Error ? e.message : "Không hủy được"); }
  }

  return (
    <li className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{r.source === "E_PRESCRIPTION" ? "Đơn bác sĩ kê" : "Ảnh đơn thuốc"} · {r.patient_name}</p>
          <p className="text-sm text-muted">{when(r.created_at)} · {r.pharmacy_name}</p>
        </div>
        <Badge map={REQUEST_STATUS} status={r.status} />
      </div>
      {r.prescribed && (
        <p className="text-sm text-muted">Trong đơn: {r.prescribed.map((i) => `${i.name} × ${i.quantity}`).join(", ")}</p>
      )}
      {r.status === "REJECTED" && r.reject_reason && <p className="text-sm text-danger-ink">Lý do: {r.reject_reason}</p>}
      {r.quote && r.status !== "SENT" && (
        <div className="rounded-xl bg-page p-3 text-sm">
          <p className="mb-1 font-semibold">Báo giá của dược sĩ</p>
          <ul className="space-y-0.5">
            {r.quote.map((q, k) => (
              <li key={k} className={q.available ? "" : "text-muted line-through"}>
                • {q.name} × {q.quantity} — {vnd(q.unit_price)}{q.is_substitute ? " (thuốc thay thế cùng hoạt chất)" : ""}{q.available ? "" : " · hết hàng"}
              </li>
            ))}
          </ul>
          {r.pharmacist_note && <p className="mt-1 italic">Dược sĩ dặn: {r.pharmacist_note}</p>}
          <p className="mt-1 text-right font-bold">Tiền thuốc: {vnd(r.quoted_subtotal)}</p>
        </div>
      )}
      {canAct && (
        <div className="space-y-3 border-t border-line pt-3">
          <AddressPicker ctx={session.ctx} meId={session.meId} recipientId={r.patient_user_id} value={addressId} onChange={setAddressId} />
          <PaymentPicker value={gateway} onChange={setGateway} />
          <div className="flex flex-wrap gap-3">
            <button disabled={busy || !addressId} onClick={accept} className="rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark disabled:opacity-50">
              {busy ? "Đang đặt..." : "Đồng ý báo giá & đặt hàng"}
            </button>
            <button onClick={cancel} className="text-sm font-semibold text-danger-ink underline">Hủy</button>
          </div>
        </div>
      )}
      {r.status === "SENT" && <button onClick={cancel} className="text-sm font-semibold text-danger-ink underline">Hủy đơn đã gửi</button>}
      {r.order_code && <p className="text-sm">Đơn hàng: <b>{r.order_code}</b></p>}
      {msg && <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">{msg}</p>}
    </li>
  );
}
