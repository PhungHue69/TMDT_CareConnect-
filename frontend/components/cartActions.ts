// relative .ts import so `node --test` can load this file (see lib/cartActions.test.ts)
import { addItem, getCart, removeItem, setPharmacy, setPrescription, type CartItem } from "../lib/cart.ts";

export type Pos = { lat: number; lng: number; label: string };

export type Need = { drugId: number; name: string; quantity: number };

/** Backend returns pharmacies stocking every drug; also require enough quantity. */
export function fullyStocked<P extends { items: { drug_id: number; quantity: number }[] }>(
  list: P[],
  needs: Need[],
): P[] {
  return list.filter((p) =>
    needs.every((n) => (p.items.find((i) => i.drug_id === n.drugId)?.quantity ?? 0) >= n.quantity),
  );
}

/** Price 0 is the Rx sentinel: never show "0đ". */
export function formatPrice(price: number): string {
  return price > 0 ? `${price.toLocaleString("vi-VN")}đ` : "Giá tại nhà thuốc";
}

/** Max packs the cart may hold for a matched Rx item (spec §6): max_packs, at least 1. */
export const packsOf = (it: { max_packs?: number | null }) => Math.max(1, it.max_packs ?? 1);

/** Distinct matched drugs with packs SUMMED across prescription lines (as the server does). */
export function buildNeeds(
  items: { name: string; matched_drug_id?: number | null; max_packs?: number | null }[],
  nameOf: (drugId: number, ocrName: string) => string,
): Need[] {
  const needs: Need[] = [];
  for (const it of items) {
    if (it.matched_drug_id == null) continue;
    const q = packsOf(it);
    const ex = needs.find((n) => n.drugId === it.matched_drug_id);
    if (ex) ex.quantity += q;
    else needs.push({ drugId: it.matched_drug_id, name: nameOf(it.matched_drug_id, it.name), quantity: q });
  }
  return needs;
}

/** Defence in depth: keep only the given category even if the API returns more. */
export const onlyCategory = <T extends { category: string }>(list: T[], category: string): T[] =>
  list.filter((d) => d.category === category);

/**
 * Put `lines` in the cart for `pharmacy`. With `prescriptionId`, RX lines left over from a
 * different prescription are dropped first (same rule as /ai). Returns an optional notice.
 * RX lines are never added without a prescriptionId. Each line REPLACES any existing cart
 * line for that drug (re-picking another pharmacy must not double the quantity).
 */
export function commitToCart(
  pharmacy: { id: number; name: string },
  lines: CartItem[],
  prescriptionId?: number,
): string | null {
  let notice: string | null = null;
  if (prescriptionId !== undefined) {
    const c = getCart();
    if (c.prescriptionId && c.prescriptionId !== prescriptionId) {
      c.items.filter((i) => i.category === "RX").forEach((i) => removeItem(i.drugId));
      notice = "Đã xóa thuốc kê đơn từ đơn trước khỏi giỏ.";
    }
    setPrescription(prescriptionId);
  }
  setPharmacy({ id: pharmacy.id, name: pharmacy.name });
  for (const l of lines) {
    if (l.category === "RX" && prescriptionId === undefined) continue;
    removeItem(l.drugId);
    addItem(l);
  }
  return notice;
}
