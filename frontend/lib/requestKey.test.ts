import assert from "node:assert/strict";
import { test } from "node:test";
import { newRequestKey } from "./requestKey.ts";

test("request key works without crypto.randomUUID (plain-HTTP LAN pages)", () => {
  const original = globalThis.crypto.randomUUID;
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const a = newRequestKey();
    const b = newRequestKey();
    assert.match(a, /^[a-f0-9]{32}$/);
    assert.notEqual(a, b);
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: original, configurable: true });
  }
});

test("request key matches the backend's allowed characters and length", () => {
  const key = newRequestKey();
  assert.match(key, /^[a-zA-Z0-9_-]{8,64}$/);
});
