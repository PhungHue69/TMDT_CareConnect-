"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { pharmacyProducts, type InStockDrug, type Pharmacy, type PharmacyProducts } from "@/lib/api";
import { addItem, getCart, setQuantity, subscribeCart } from "@/lib/cart";
import { formatPrice } from "./cartActions";
import { ArrowRightIcon, InfoIcon, MinusIcon, PlusIcon, SearchIcon, StoreIcon } from "./icons";
import Thumb from "./Thumb";

type Category = "" | "OTC" | "TPCN";
type Catalog = { key: string; data: PharmacyProducts; error: string | null };

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "", label: "Tất cả" },
  { id: "TPCN", label: "Thực phẩm chức năng" },
  { id: "OTC", label: "Thuốc không kê đơn" },
];
const cartSnapshot = () => JSON.stringify(getCart());

export default function SupplementFlow({ pharmacy }: { pharmacy: Pharmacy }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<Category>("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cartText = useSyncExternalStore(subscribeCart, cartSnapshot, () => '{"items":[]}');
  const cart = JSON.parse(cartText) as ReturnType<typeof getCart>;
  const ownCart = cart.pharmacy?.id === pharmacy.id;
  const lines = ownCart ? cart.items.filter((i) => i.category !== "RX") : [];
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const key = `${pharmacy.id}|${debounced}|${category}|${page}`;

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let active = true;
    pharmacyProducts(pharmacy.id, debounced, page, category || undefined)
      .then((data) => { if (active) setCatalog({ key, data, error: null }); })
      .catch((e) => {
        if (active) setCatalog({ key, data: { items: [], total: 0, page, limit: 12 }, error: e instanceof Error ? e.message : "Không tải được sản phẩm." });
      });
    return () => { active = false; };
  }, [pharmacy.id, debounced, page, category, key]);

  const current = catalog?.key === key ? catalog : null;
  const products = current && !current.error ? current.data.items.filter((p) => p.category === "OTC" || p.category === "TPCN") : [];

  function qtyOf(id: number) {
    return lines.find((line) => line.drugId === id)?.quantity ?? 0;
  }

  function add(product: InStockDrug) {
    if (getCart().pharmacy?.id !== pharmacy.id) {
      setNotice("Giỏ hàng thuộc nhà thuốc khác. Hãy chọn lại nhà thuốc trên bản đồ.");
      return;
    }
    if (qtyOf(product.id) >= product.stock_quantity) return;
    addItem({ drugId: product.id, name: product.name, category: product.category, imageUrl: product.image_url, price: product.price, quantity: 1, maxQty: product.stock_quantity });
    setNotice(null);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-labelledby="prod-title" className="min-w-0 space-y-2.5 sm:space-y-3.5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 id="prod-title" className="text-base font-bold text-brand sm:text-lg">Sản phẩm còn hàng tại nhà thuốc</h2>
            <p className="text-xs text-muted sm:text-sm">Thuốc không kê đơn và thực phẩm chức năng · tồn kho là dữ liệu mẫu</p>
          </div>
          <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-[#D5DCE8] bg-white px-3 sm:h-11 sm:gap-2.5 sm:rounded-xl sm:px-3.5 text-muted focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 sm:w-[18.75rem]">
            <SearchIcon className="h-[1.125rem] w-[1.125rem] shrink-0" />
            <input id="products-q" type="search" aria-label="Tìm sản phẩm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm sản phẩm…" className="min-w-0 flex-1 bg-transparent text-sm sm:text-[0.9375rem] text-ink outline-none" />
          </label>
        </div>

        <div role="group" aria-label="Nhóm sản phẩm" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-2.5 sm:px-0">
          {CATEGORIES.map((c) => {
            const on = c.id === category;
            return (
              <button
                key={c.id || "all"}
                type="button"
                aria-pressed={on}
                onClick={() => { setCategory(c.id); setPage(1); }}
                className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold sm:h-[2.625rem] sm:px-[1.125rem] sm:text-[0.9375rem] ${on ? "border-brand bg-brand text-white" : "border-[#D5DCE8] bg-white text-ink hover:border-brand"}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {notice && <p role="alert" className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">{notice}</p>}
        {!current && <p role="status" className="text-muted">Đang tải sản phẩm…</p>}
        {current?.error && <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-danger-ink">{current.error}</p>}
        {current && !current.error && products.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[#B9C8E6] bg-white p-6 text-center text-muted">Nhà thuốc chưa có sản phẩm phù hợp.</p>
        )}

        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
          {products.map((product) => {
            const qty = qtyOf(product.id);
            return (
              <li key={product.id}>
                <article className="flex h-full flex-col gap-1.5 rounded-xl border border-line bg-white p-1.5 sm:gap-3 sm:rounded-[1.125rem] sm:p-3.5">
                  <div className="flex aspect-square items-center justify-center rounded-lg bg-[#F4F7FC] sm:aspect-auto sm:h-[9.375rem] sm:rounded-xl">
                    <Thumb src={product.image_url} kind="drug" alt={product.name} size={110} className="h-[78%] w-[78%] bg-transparent sm:h-[6.875rem] sm:w-[6.875rem]" />
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 sm:gap-1">
                    <h3 title={product.name} className="line-clamp-2 text-[0.6875rem] font-bold leading-tight text-brand sm:text-base sm:leading-snug">{product.name}</h3>
                    <span className="hidden text-[0.8125rem] text-muted sm:block">{product.category === "OTC" ? "Thuốc không kê đơn" : "Thực phẩm chức năng"}</span>
                    <span className="text-[0.625rem] text-muted sm:hidden">{product.category === "OTC" ? "Không kê đơn" : "TPCN"} · Còn {product.stock_quantity}</span>
                    <span className="mt-1 hidden self-start rounded-full bg-[#E6F6EC] px-2.5 py-0.5 text-xs font-semibold text-[#14713A] sm:inline">Còn {product.stock_quantity}</span>
                  </div>
                  <strong className="text-xs font-bold tabular-nums text-brand sm:text-[1.0625rem]">{formatPrice(product.price)}</strong>
                  {qty === 0 ? (
                    <button type="button" aria-label={`Thêm ${product.name} vào giỏ`} onClick={() => add(product)} className="flex h-7 w-full items-center justify-center gap-1 rounded-full border-[0.0938rem] border-brand bg-white text-[0.6875rem] font-semibold text-brand hover:bg-[#EAF1FE] sm:h-11 sm:gap-1.5 sm:text-sm">
                      <PlusIcon className="h-3 w-3 sm:h-4 sm:w-4" /><span className="sm:hidden">Thêm</span><span className="hidden sm:inline">Thêm vào giỏ</span>
                    </button>
                  ) : (
                    <div className="flex h-7 w-full items-center justify-between rounded-full bg-brand px-0.5 text-white sm:h-11 sm:px-1">
                      <button type="button" aria-label={`Bớt ${product.name}`} onClick={() => setQuantity(product.id, qty - 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 sm:h-9 sm:w-9"><MinusIcon className="h-3 w-3 sm:h-4 sm:w-4" /></button>
                      <span className="text-xs font-bold tabular-nums sm:text-[0.9375rem]">{qty}</span>
                      <button type="button" aria-label={`Thêm ${product.name}`} disabled={qty >= product.stock_quantity} onClick={() => add(product)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 disabled:opacity-40 sm:h-9 sm:w-9"><PlusIcon className="h-3 w-3 sm:h-4 sm:w-4" /></button>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>

        {current && !current.error && current.data.total > current.data.limit && (
          <div className="flex items-center justify-between gap-3">
            <button type="button" disabled={page <= 1} onClick={() => setPage((v) => v - 1)} className="h-11 rounded-xl border border-[#D5DCE8] bg-white px-4 font-semibold text-brand disabled:opacity-40">Trang trước</button>
            <span className="text-sm text-muted">Trang {page} / {Math.ceil(current.data.total / current.data.limit)}</span>
            <button type="button" disabled={page * current.data.limit >= current.data.total} onClick={() => setPage((v) => v + 1)} className="h-11 rounded-xl border border-[#D5DCE8] bg-white px-4 font-semibold text-brand disabled:opacity-40">Trang sau</button>
          </div>
        )}
      </section>

      <aside aria-labelledby="cart-title" className="min-w-0 space-y-4 lg:sticky lg:top-4">
        <div className="space-y-4 rounded-[1.25rem] border border-line bg-white p-[1.375rem]">
          <div className="flex items-center justify-between gap-2">
            <h2 id="cart-title" className="text-lg font-bold text-brand">Giỏ hàng</h2>
            <span className="text-sm text-muted">{count} sản phẩm</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-page px-3 py-2.5 text-sm text-ink">
            <StoreIcon className="h-[1.125rem] w-[1.125rem] shrink-0 text-brand" />
            <span className="min-w-0">Nhận tại <strong className="font-semibold text-brand">{pharmacy.name}</strong></span>
          </div>
          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Chưa có sản phẩm nào. Nhấn “Thêm vào giỏ” để bắt đầu.</p>
          ) : (
            <ul className="max-h-72 space-y-3 overflow-y-auto">
              {lines.map((line) => (
                <li key={line.drugId} className="flex items-center gap-3">
                  <Thumb src={line.imageUrl} kind="drug" alt="" size={44} className="rounded-[0.625rem]" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[0.9375rem] font-semibold text-brand">{line.name}</strong>
                    <span className="text-[0.8125rem] text-muted">Số lượng: {line.quantity}</span>
                  </span>
                  <strong className="whitespace-nowrap text-[0.9375rem] font-semibold tabular-nums text-brand">{formatPrice(line.price * line.quantity)}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="h-px bg-line" />
          <div className="flex items-center justify-between">
            <span className="text-muted">Tạm tính</span>
            <strong className="text-xl font-bold tabular-nums text-brand">{formatPrice(total)}</strong>
          </div>
          <Link
            href="/cart"
            aria-disabled={lines.length === 0}
            className={`flex h-[3.375rem] items-center justify-center gap-2.5 rounded-[0.875rem] text-base font-semibold text-white shadow-[0_8px_20px_rgba(26,86,219,0.25)] ${lines.length === 0 ? "pointer-events-none bg-brand/50 shadow-none" : "bg-brand hover:bg-brand-dark"}`}
          >
            Tiếp tục đặt hàng<ArrowRightIcon />
          </Link>
        </div>
        <div className="flex gap-3 rounded-2xl bg-[#EAF1FE] px-[1.125rem] py-4 text-sm leading-relaxed text-ink">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <span>Thực phẩm chức năng không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.</span>
        </div>
      </aside>
    </div>
  );
}
