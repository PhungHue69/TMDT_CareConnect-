import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getCart } from "./cart.ts";
import { buildNeeds, commitToCart, onlyCategory, packsOf } from "../components/cartActions.ts";

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const vitC = { drugId: 1, name: "Vitamin C", price: 5000, category: "TPCN" as const, quantity: 3 };
const rx = { drugId: 2, name: "Rx drug", price: 0, category: "RX" as const, quantity: 1, maxQty: 1 };

test("re-picking another pharmacy does not double quantity", () => {
  commitToCart({ id: 1, name: "A" }, [vitC]);
  commitToCart({ id: 2, name: "B" }, [vitC]);
  assert.equal(getCart().items.length, 1);
  assert.equal(getCart().items[0].quantity, 3);
  assert.deepEqual(getCart().pharmacy, { id: 2, name: "B" });
});

test("RX line is never added without a prescription id", () => {
  commitToCart({ id: 1, name: "A" }, [vitC, rx]);
  assert.deepEqual(getCart().items.map((i) => i.drugId), [1]);
  assert.equal(getCart().prescriptionId, undefined);
});

test("RX line is added with a prescription id; old-prescription RX is dropped", () => {
  commitToCart({ id: 1, name: "A" }, [rx], 7);
  assert.equal(getCart().prescriptionId, 7);
  assert.equal(getCart().items.length, 1);
  const notice = commitToCart({ id: 1, name: "A" }, [{ ...rx, drugId: 3 }], 8);
  assert.ok(notice);
  assert.deepEqual(getCart().items.map((i) => i.drugId), [3]);
});

test("onlyCategory filters; packsOf is at least 1", () => {
  assert.deepEqual(onlyCategory([{ category: "TPCN" }, { category: "RX" }, { category: "OTC" }], "TPCN"), [{ category: "TPCN" }]);
  assert.equal(packsOf({}), 1);
  assert.equal(packsOf({ max_packs: 0 }), 1);
  assert.equal(packsOf({ max_packs: 4 }), 4);
});

test("buildNeeds sums packs per drug across lines and skips unmatched", () => {
  const needs = buildNeeds(
    [
      { name: "a", matched_drug_id: 1, max_packs: 2 },
      { name: "a2", matched_drug_id: 1, max_packs: 1 },
      { name: "b", matched_drug_id: 2 },
      { name: "c", matched_drug_id: null },
    ],
    (id, ocr) => (id === 1 ? "Catalog A" : ocr),
  );
  assert.deepEqual(needs, [
    { drugId: 1, name: "Catalog A", quantity: 3 },
    { drugId: 2, name: "b", quantity: 1 },
  ]);
});
