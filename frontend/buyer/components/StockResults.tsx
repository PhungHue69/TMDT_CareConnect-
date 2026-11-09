"use client";

import Link from "next/link";
import Thumb from "./Thumb";
import type { StockPharmacy } from "@/lib/api";

import type { Need } from "./cartActions";

export default function StockResults({
  pharmacies,
  needs,
  busy,
  addedId,
  notice,
  onPick,
}: {
  pharmacies: StockPharmacy[];
  needs: Need[];
  busy: boolean;
  addedId: number | null;
  notice: string | null;
  onPick: (p: StockPharmacy) => void;
}) {
  if (pharmacies.length === 0) {
    return (
      <p role="status" className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
        Không có nhà thuốc nào gần bạn còn đủ tất cả sản phẩm này. Hãy thử đổi vị trí hoặc bỏ bớt sản phẩm.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <h3 className="font-bold">Nhà thuốc có đủ hàng ({pharmacies.length})</h3>
      {notice && (
        <p role="status" className="rounded-xl bg-warn-bg px-4 py-2 text-sm text-warn-ink">
          {notice}
        </p>
      )}
      <ul className="space-y-3">
        {pharmacies.map((p) => {
          const added = addedId === p.id;
          return (
            <li
              key={p.id}
              className={`rounded-xl border p-3 ${added ? "border-brand bg-brand-soft/40" : "border-line bg-white"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Thumb src={p.image_url} kind="pharmacy" alt={p.name} size={64} />
                  <div className="min-w-0">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-muted">{p.address}</div>
                    <div className="text-sm text-muted">{p.distance_km.toFixed(1)} km</div>
                  </div>
                </div>
                {added ? (
                  <Link
                    href="/cart"
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark"
                  >
                    Đã thêm — Xem giỏ hàng
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(p)}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Chọn nhà thuốc này và thêm vào giỏ
                  </button>
                )}
              </div>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                {needs.map((n) => (
                  <li key={n.drugId} className="rounded-full bg-page px-2 py-1">
                    {n.name} — tồn {p.items.find((i) => i.drug_id === n.drugId)?.quantity ?? 0}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
