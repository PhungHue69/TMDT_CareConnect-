import test from "node:test";
import assert from "node:assert/strict";
import { BuyerApiError, buyerFetch, createOrder, loginUrl, personLabel } from "./buyerApi.ts";

function withStorage(token: string | null, fn: () => Promise<void>) {
  const store = { getItem: (k: string) => (k === "cc_token" ? token : null) } as Storage;
  const prev = { s: globalThis.sessionStorage, l: globalThis.localStorage };
  Object.defineProperty(globalThis, "sessionStorage", { value: store, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null } as unknown as Storage, configurable: true });
  return fn().finally(() => {
    Object.defineProperty(globalThis, "sessionStorage", { value: prev.s, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: prev.l, configurable: true });
  });
}

test("không có token thì báo cần đăng nhập, không gọi mạng", async () => {
  await withStorage(null, async () => {
    const previous = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
    try {
      await assert.rejects(buyerFetch("/buyer/orders"), (e: unknown) => e instanceof BuyerApiError && e.status === 401);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = previous;
    }
  });
});

test("đặt hàng gửi token chung với Family Care và mã nhà thuốc/thuốc của trang Mua thuốc", async () => {
  await withStorage("tok-123", async () => {
    const previous = globalThis.fetch;
    let url = "";
    let init: RequestInit | undefined;
    globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
      url = String(input);
      init = options;
      return new Response('{"order":{"id":5,"order_code":"CC-1"}}', { status: 201 });
    }) as typeof fetch;
    try {
      const r = await createOrder({ pharmacy_ref: 7, items: [{ drug_ref: 3, quantity: 2 }], recipient_user_id: 2, address_id: 9, payment_gateway: "MOMO" });
      assert.equal(url, "/api/buyer/orders");
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer tok-123");
      assert.deepEqual(JSON.parse(String(init?.body)).items, [{ drug_ref: 3, quantity: 2 }]);
      assert.equal(r.order.order_code, "CC-1");
    } finally {
      globalThis.fetch = previous;
    }
  });
});

test("lỗi từ máy chủ giữ thông báo và gợi ý chuyển sang khám bác sĩ", async () => {
  await withStorage("tok", async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{"error":"Đây không phải đơn thuốc","redirect":"DOCTOR"}', { status: 422 })) as typeof fetch;
    try {
      await assert.rejects(buyerFetch("/buyer/prescription-requests", { method: "POST", body: {} }), (e: unknown) =>
        e instanceof BuyerApiError && e.status === 422 && e.redirect === "DOCTOR" && e.message === "Đây không phải đơn thuốc");
    } finally {
      globalThis.fetch = previous;
    }
  });
});

test("link đăng nhập quay lại đúng trang và nhãn người nhận", () => {
  assert.equal(loginUrl("/shop/cart"), "/buyer-family/login.html?next=%2Fshop%2Fcart");
  assert.equal(personLabel({ id: 1, full_name: "Nam", phone: "", relationship: null }, 1), "Bản thân (Nam)");
  assert.equal(personLabel({ id: 2, full_name: "Lan", phone: "", relationship: "Mẹ" }, 1), "Mẹ · Lan");
});
