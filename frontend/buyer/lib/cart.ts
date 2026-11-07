// Self-contained (no imports) so it runs under `node --experimental-strip-types`.
const KEY = "o2o_cart";
export const CART_EVENT = "o2o-cart-change";

function notify(): void {
  // same-tab change signal (the `storage` event only fires in other tabs)
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_EVENT));
}

/** Subscribe to cart changes (this tab, other tabs, tab focus). For useSyncExternalStore. */
export function subscribeCart(cb: () => void): () => void {
  window.addEventListener(CART_EVENT, cb);
  window.addEventListener("storage", cb);
  window.addEventListener("focus", cb);
  return () => {
    window.removeEventListener(CART_EVENT, cb);
    window.removeEventListener("storage", cb);
    window.removeEventListener("focus", cb);
  };
}

export function cartCount(c: Cart = getCart()): number {
  return c.items.reduce((n, i) => n + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
}

export type CartItem = {
  drugId: number;
  name: string;
  price: number;
  category: "RX" | "OTC" | "TPCN";
  quantity: number;
  maxQty?: number;
  imageUrl?: string | null; // display only; absent in older carts -> default image
};

export type Cart = {
  pharmacy?: { id: number; name: string };
  prescriptionId?: number;
  items: CartItem[];
};

export function getCart(): Cart {
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (!raw) return { items: [] };
    const c = JSON.parse(raw);
    return c && Array.isArray(c.items) ? c : { items: [] };
  } catch {
    return { items: [] };
  }
}

function save(c: Cart): Cart {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // storage unavailable: cart just doesn't persist
  }
  notify();
  return c;
}

export function setPharmacy(p: { id: number; name: string }): Cart {
  return save({ ...getCart(), pharmacy: p });
}

export function addItem(item: CartItem): Cart {
  const c = getCart();
  const cap = (q: number, max?: number) => (max !== undefined ? Math.min(q, max) : q);
  const ex = c.items.find((i) => i.drugId === item.drugId);
  if (ex) {
    ex.maxQty = item.maxQty ?? ex.maxQty;
    ex.quantity = cap(ex.quantity + item.quantity, ex.maxQty);
  } else {
    c.items.push({ ...item, quantity: cap(item.quantity, item.maxQty) });
  }
  return save(c);
}

export function removeItem(drugId: number): Cart {
  const c = getCart();
  return save({ ...c, items: c.items.filter((i) => i.drugId !== drugId) });
}

/** Set a line's quantity (capped at maxQty); 0 or less removes it. Unknown drugs are ignored. */
export function setQuantity(drugId: number, quantity: number): Cart {
  const c = getCart();
  const line = c.items.find((i) => i.drugId === drugId);
  if (!line) return c;
  if (quantity <= 0) return removeItem(drugId);
  line.quantity = line.maxQty !== undefined ? Math.min(quantity, line.maxQty) : quantity;
  return save(c);
}

export function setPrescription(id: number | undefined): Cart {
  return save({ ...getCart(), prescriptionId: id });
}

export function clearCart(): void {
  try {
    globalThis.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  notify();
}
