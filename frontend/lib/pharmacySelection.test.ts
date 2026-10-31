import assert from "node:assert/strict";
import { test } from "node:test";
import { decidePharmacySelection } from "./pharmacySelection.ts";

test("first selection opens shopping without clearing a cart", () => {
  assert.equal(decidePharmacySelection(null, 7, false), "select");
});

test("same pharmacy reopens shopping without clearing a draft image", () => {
  assert.equal(decidePharmacySelection(7, 7, true), "reopen");
});

test("different pharmacy asks before discarding any cart or draft image", () => {
  assert.equal(decidePharmacySelection(7, 8, true), "confirm");
  assert.equal(decidePharmacySelection(7, 8, false), "select");
});

