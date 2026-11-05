"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { addItem, clearCart, getCart, removeItem, subscribeCart, type Cart } from "@/lib/cart";
import { placeOrder, type OrderResult } from "@/lib/api";
import Thumb from "@/components/Thumb";

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
  const [done, setDone] = useState<(OrderResult & { unpriced: boolean }) | null>(null);

  if (!cart) return <p className="text-muted">Đang tải...</p>;

  const total = cart.items.reduce((s, i) => s + (i.price > 0 ? i.price * i.quantity : 0), 0);
  const hasUnpriced = cart.items.some((i) => i.price <= 0);
  const hasRx = cart.items.some((i) => i.category === "RX");
  const canOrder = !busy && !hasRx && !!cart.pharmacy && cart.items.length > 0;

  function change(drugId: number, delta: number) {
    const it = cart!.items.find((i) => i.drugId === drugId);
    if (!it) return;
    if (delta < 0 && it.quantity <= 1) return; // quantity must stay >= 1
    addItem({ ...it, quantity: delta });
  }

  async function submit() {
    const c = getCart(); // fresh read, not the render closure
    if (!c.pharmacy || c.items.length === 0 || c.items.some((i) => i.category === "RX")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await placeOrder({
        pharmacy_id: c.pharmacy.id,
        prescription_id: null,
        items: c.items.map((i) => ({ drug_id: i.drugId, quantity: Math.max(1, i.quantity) })),
      });
      const unpriced = c.items.some((i) => i.price <= 0); // capture before clearCart
      clearCart();
      setDone({ ...r, unpriced });
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
        <h1 className="text-2xl font-bold text-brand-dark">Đã gửi yêu cầu demo — chờ nhà thuốc xác nhận (mô phỏng)</h1>
        <p>Không có nhà thuốc thật nào nhận yêu cầu này.</p>
        <p>Mã đơn: #{done.id}</p>
        <p>
          Tổng tiền{done.unpriced ? " chưa gồm thuốc kê đơn (giá tại nhà thuốc)" : ""}: {vnd(done.total_amount)}
        </p>
        <Link href="/" onClick={() => setDone(null)} className="font-semibold text-brand underline">
          Tiếp tục mua thuốc
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Giỏ hàng</h1>

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
