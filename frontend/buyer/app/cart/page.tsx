"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { addItem, clearCart, getCart, removeItem, subscribeCart, type Cart } from "@/lib/cart";
import { createOrder, type BuyerOrder, type PaymentGateway } from "@/lib/buyerApi";
import Thumb from "@/components/Thumb";
import { AddressPicker, LoginPrompt, PaymentPicker, RecipientPicker, useBuyerSession } from "@/components/BuyerSession";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
// price <= 0 is the "price on request" sentinel (Rx), not free
const price = (n: number) => (n > 0 ? vnd(n) : "Giá tại nhà thuốc");
const snapshot = () => JSON.stringify(getCart());
const serverSnapshot = () => null;

export default function Page() {
  const snap = useSyncExternalStore(subscribeCart, snapshot, serverSnapshot);
  const cart: Cart | null = useMemo(() => (snap ? JSON.parse(snap) : null), [snap]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BuyerOrder | null>(null);
  const [session] = useBuyerSession();
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [gateway, setGateway] = useState<PaymentGateway>("MOMO");

  if (!cart) return <p className="text-muted">Đang tải...</p>;

  const total = cart.items.reduce((s, i) => s + (i.price > 0 ? i.price * i.quantity : 0), 0);
  const hasUnpriced = cart.items.some((i) => i.price <= 0);
  const hasRx = cart.items.some((i) => i.category === "RX");
  const ready = session.status === "ready" ? session : null;
  const recipient = recipientId ?? ready?.meId ?? null;
  const canOrder = !busy && !hasRx && !!cart.pharmacy && cart.items.length > 0 && !!ready && !!addressId;

  function change(drugId: number, delta: number) {
    const it = cart!.items.find((i) => i.drugId === drugId);
    if (!it) return;
    if (delta < 0 && it.quantity <= 1) return; // quantity must stay >= 1
    addItem({ ...it, quantity: delta });
  }

  async function submit() {
    const c = getCart(); // fresh read, not the render closure
    if (!c.pharmacy || c.items.length === 0 || c.items.some((i) => i.category === "RX")) return;
    if (!recipient || !addressId) return;
    setBusy(true);
    setError(null);
    try {
      // Đơn ghi vào hệ thống chung: Nhà thuốc thấy ngay trong Cổng Nhà thuốc, người nhận (bố mẹ) nhận chuông báo
      const r = await createOrder({
        pharmacy_ref: c.pharmacy.id,
        items: c.items.map((i) => ({ drug_ref: i.drugId, quantity: Math.max(1, i.quantity) })),
        recipient_user_id: recipient,
        address_id: addressId,
        payment_gateway: gateway,
      });
      clearCart();
      setDone(r.order);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setError(!m ? "Đặt hàng thất bại" : m === "HTTP 422" ? "Dữ liệu đơn hàng không hợp lệ" : m);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-brand-dark">Đặt hàng thành công</h1>
        <p>Mã đơn <b>{done.order_code}</b> đã được gửi tới nhà thuốc. Bạn sẽ nhận chuông báo khi nhà thuốc xác nhận và giao hàng.</p>
        <p>
          Tiền thuốc {vnd(Number(done.subtotal_amount))} + phí giao {vnd(Number(done.shipping_fee))} ={" "}
          <b>{vnd(Number(done.total_amount))}</b>
          {done.payment_method === "COD" ? " (trả khi nhận hàng)" : " (sàn đang tạm giữ, chỉ chuyển cho nhà thuốc khi bạn nhận thuốc)"}
        </p>
        {done.distance_km !== undefined && done.distance_km > 20 && (
          <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
            Nhà thuốc cách địa chỉ nhận khoảng {done.distance_km} km. Lần sau nên chọn nhà thuốc gần địa chỉ nhận để giao nhanh hơn.
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <Link href="/orders" className="font-semibold text-brand underline">Theo dõi đơn hàng</Link>
          <Link href="/" onClick={() => setDone(null)} className="font-semibold text-brand underline">Tiếp tục mua thuốc</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">

      <p>
        Nhà thuốc:{" "}
        {cart.pharmacy ? (
          <b>{cart.pharmacy.name}</b>
        ) : (
          <Link href="/" className="font-semibold text-brand underline">
            Chọn nhà thuốc
          </Link>
        )}
      </p>

      {cart.items.length === 0 ? (
        <p>
          Giỏ hàng trống.{" "}
          <Link href="/" className="font-semibold text-brand underline">
            Xem danh mục thuốc
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          {cart.items.map((i) => (
            <li key={i.drugId} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 p-3 sm:flex sm:flex-wrap sm:items-center">
              <Thumb src={i.imageUrl} kind="drug" alt={i.name} size={56} />
              <div className="min-w-0 sm:flex-1">
                <p className="break-words font-medium">
                  {i.name} <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">{i.category}</span>
                </p>
                <p className="text-sm text-muted">{price(i.price)}</p>
              </div>
              <div className="col-span-2 flex items-center gap-2 sm:col-auto">
                <button
                  aria-label="Giảm"
                  disabled={i.quantity <= 1}
                  onClick={() => change(i.drugId, -1)}
                  className="h-10 w-10 rounded-xl border border-line bg-white hover:bg-brand-soft disabled:opacity-40"
                >
                  -
                </button>
                <span className="w-6 text-center">{i.quantity}</span>
                <button
                  aria-label="Tăng"
                  disabled={i.maxQty !== undefined && i.quantity >= i.maxQty}
                  onClick={() => change(i.drugId, 1)}
                  className="h-10 w-10 rounded-xl border border-line bg-white hover:bg-brand-soft disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <p className="min-w-0 text-right font-semibold sm:w-24">{i.price > 0 ? vnd(i.price * i.quantity) : price(i.price)}</p>
              <button
                aria-label={`Xóa ${i.name}`}
                onClick={() => {
                  removeItem(i.drugId);
                              }}
                className="justify-self-end text-sm font-semibold text-danger-ink underline sm:justify-self-auto"
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasRx && (
        <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">Giỏ có thuốc kê đơn từ luồng cũ. Hãy xóa thuốc kê đơn; ảnh đơn mới chỉ được gửi dược sĩ kiểm tra, không thể mua trực tiếp.</p>
      )}
      <p className="text-right font-semibold">
        Tạm tính{hasUnpriced ? " chưa gồm thuốc kê đơn (giá tại nhà thuốc)" : ""}: {vnd(total)}
      </p>
      {cart.items.length > 0 && !hasRx && (
        session.status === "guest" ? (
          <LoginPrompt text="Đăng nhập để đặt hàng và theo dõi đơn." />
        ) : session.status === "error" ? (
          <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-ink">{session.message}</p>
        ) : ready && recipient ? (
          <section className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Thông tin giao hàng</h2>
            <RecipientPicker ctx={ready.ctx} meId={ready.meId} value={recipient} onChange={setRecipientId} />
            <AddressPicker ctx={ready.ctx} meId={ready.meId} recipientId={recipient} value={addressId} onChange={setAddressId} />
            <PaymentPicker value={gateway} onChange={setGateway} />
            <p className="text-sm text-muted">Phí giao hỏa tốc tính theo khoảng cách từ nhà thuốc (từ 15.000đ).</p>
          </section>
        ) : null
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-ink">
          {error}
        </p>
      )}
      <button
        disabled={!canOrder}
        onClick={submit}
        className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
      >
        {busy ? "Đang đặt..." : "Đặt hàng"}
      </button>
    </div>
  );
}
