import assert from "node:assert/strict";
import { test } from "node:test";
import { AddressLookup, shouldAutoChoose } from "./addressSearch.ts";

const one = { place_id: "1", description: "12 Nguyễn Huệ, TP HCM" };
const other = { place_id: "2", description: "12 Nguyễn Huệ, Hà Nội" };

test("only a unique address is automatically selected", () => {
  assert.deepEqual(shouldAutoChoose([one]), one);
  assert.equal(shouldAutoChoose([one, other]), null);
  assert.equal(shouldAutoChoose([]), null);
});

test("short and empty addresses never start a lookup", () => {
  const lookup = new AddressLookup();
  assert.equal(lookup.start(" "), null);
  assert.equal(lookup.start("a"), null);
  assert.equal(lookup.start(" 12 Nguyễn Huệ "), 3);
});

test("typing a newer address invalidates an older response before debounce", () => {
  const lookup = new AddressLookup();
  const first = lookup.start("12 Nguyễn Huệ");
  lookup.invalidate();
  assert.equal(lookup.isCurrent(first), false);
});

test("selecting GPS or ward invalidates pending suggestion and detail results", () => {
  const lookup = new AddressLookup();
  const first = lookup.start("12 Nguyễn Huệ");
  lookup.invalidate();
  assert.equal(lookup.isCurrent(first), false);
  const second = lookup.start("12 Nguyễn Huệ");
  assert.equal(lookup.isCurrent(second), true);
  lookup.invalidate();
  assert.equal(lookup.isCurrent(second), false);
});
