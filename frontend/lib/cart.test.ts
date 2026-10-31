import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getCart, cartCount, addItem, removeItem, setPharmacy, setPrescription, setQuantity, clearCart } from "./cart.ts";

const store: Record<string, string> = {};
function mock(broken = false) {
  (globalThis as unknown as { localStorage: unknown }).localStorage = broken
    ? { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } }
    : {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
      };
}
beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; mock(); });

const para = { drugId: 1, name: "Paracetamol", price: 5000, category: "OTC" as const, quantity: 1 };

test("adding same drug twice accumulates quantity", () => {
  addItem(para); addItem(para);
  assert.equal(getCart().items.length, 1);
  assert.equal(getCart().items[0].quantity, 2);
});

test("maxQty caps quantity", () => {
  addItem({ ...para, quantity: 2, maxQty: 3 });
  addItem({ ...para, quantity: 5, maxQty: 3 });
  assert.equal(getCart().items[0].quantity, 3);
});

test("removeItem, setPharmacy, setPrescription, clearCart", () => {
  addItem(para); setPharmacy({ id: 9, name: "A" }); setPrescription(7);
  assert.deepEqual(getCart().pharmacy, { id: 9, name: "A" });
  assert.equal(getCart().prescriptionId, 7);
  removeItem(1);
  assert.equal(getCart().items.length, 0);
  clearCart();
  assert.deepEqual(getCart(), { items: [] });
});

test("throwing localStorage yields empty cart, writes don't throw", () => {
  mock(true);
  assert.deepEqual(getCart(), { items: [] });
  assert.doesNotThrow(() => addItem(para));
});

test("corrupt JSON yields empty cart", () => {
  store["o2o_cart"] = "{not json";
  assert.deepEqual(getCart(), { items: [] });
});

test("setPrescription(undefined) clears prescriptionId", () => {
  setPrescription(7); setPrescription(undefined);
  assert.equal(getCart().prescriptionId, undefined);
});

test("cartCount sums quantities and is 0 for an empty cart", () => {
  assert.equal(cartCount(), 0);
  addItem(para); addItem({ ...para, drugId: 2, quantity: 3 });
  assert.equal(cartCount(), 4);
});

test("setQuantity changes an existing line, caps at maxQty and removes at zero", () => {
  addItem({ ...para, quantity: 2, maxQty: 4 });
  setQuantity(1, 3);
  assert.equal(getCart().items[0].quantity, 3);
  setQuantity(1, 9);
  assert.equal(getCart().items[0].quantity, 4);
  setQuantity(1, 0);
  assert.equal(getCart().items.length, 0);
  setQuantity(42, 2);
  assert.equal(getCart().items.length, 0);
});
