import assert from "node:assert/strict";
import { test } from "node:test";
import { API, nearby, pharmacyDetail, pharmacyRating, pharmacyProducts, resolveAddress, submitPrescriptionRequest, suggestAddresses } from "./api.ts";

test("browser API requests use the same origin", async () => {
  const requests: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await nearby(10.1, 106.2);
    assert.equal(API, "/demo-api");
    assert.equal(requests.length, 1);
    assert.match(requests[0], /^\/demo-api\/pharmacies\/nearby\?/);
    assert.doesNotMatch(requests[0], /localhost|127\.0\.0\.1/);
  } finally {
    globalThis.fetch = previous;
  }
});

test("pharmacy detail fetches by stable ID rather than nearby coordinates", async () => {
  const previous = globalThis.fetch;
  let url = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    url = String(input);
    return new Response('{"id":17,"name":"A","address":"12 Phố A","latitude":21.02,"longitude":105.84,"phone":null,"image_url":null}', { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal((await pharmacyDetail(17)).name, "A");
    assert.equal(url, "/demo-api/pharmacies/17");
  } finally { globalThis.fetch = previous; }
});

test("pharmacy rating is fetched by pharmacy id and tolerates missing data", async () => {
  const previous = globalThis.fetch;
  let url = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    url = String(input);
    return new Response('{"rating":4.6,"count":98,"url":"https://maps.google.com/?cid=1"}', { status: 200 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await pharmacyRating(17), { rating: 4.6, count: 98, url: "https://maps.google.com/?cid=1" });
    assert.equal(url, "/demo-api/pharmacies/17/rating");
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    assert.deepEqual(await pharmacyRating(17), { rating: null, count: null, url: null });
  } finally { globalThis.fetch = previous; }
});

test("pharmacy catalog request stays scoped to selected pharmacy", async () => {
  const previous = globalThis.fetch;
  let url = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    url = String(input);
    return new Response('{"items":[],"total":0,"page":2,"limit":12}', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await pharmacyProducts(17, "vitamin C", 2);
    assert.deepEqual(result.items, []);
    assert.equal(new URL(url, "http://example.test").pathname, "/demo-api/pharmacies/17/products");
    assert.equal(new URL(url, "http://example.test").searchParams.get("q"), "vitamin C");
    assert.equal(new URL(url, "http://example.test").searchParams.get("page"), "2");
    assert.equal(new URL(url, "http://example.test").searchParams.get("category"), null);
    await pharmacyProducts(17, "", 1, "TPCN");
    assert.equal(new URL(url, "http://example.test").searchParams.get("category"), "TPCN");
  } finally {
    globalThis.fetch = previous;
  }
});

test("prescription image request includes the chosen pharmacy and original image", async () => {
  const previous = globalThis.fetch;
  let submitted: FormData | undefined;
  let url = "";
  globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    submitted = options?.body as FormData;
    return new Response('{"id":12,"pharmacy_id":17,"status":"PENDING_PHARMACIST"}', { status: 201 });
  }) as typeof fetch;
  try {
    const image = new File(["image"], "sample.png", { type: "image/png" });
    const result = await submitPrescriptionRequest(17, image, "test-attempt-123");
    assert.equal(url, "/demo-api/prescriptions/requests");
    assert.equal(submitted?.get("request_key"), "test-attempt-123");
    assert.equal(submitted?.get("pharmacy_id"), "17");
    assert.equal(submitted?.get("image"), image);
    assert.equal(result.status, "PENDING_PHARMACIST");
  } finally {
    globalThis.fetch = previous;
  }
});

test("address lookups use internal routes with encoded query parameters", async () => {
  const requests: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(requests.length === 1 ? '{"suggestions":[]}' : '{"lat":10.77,"lng":106.7,"label":"12 Nguyễn Huệ"}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await suggestAddresses("12 Nguyễn Huệ");
    assert.deepEqual(await resolveAddress("a/b?"), { lat: 10.77, lng: 106.7, label: "12 Nguyễn Huệ" });
    assert.equal(new URL(requests[0], "http://example.test").searchParams.get("q"), "12 Nguyễn Huệ");
    assert.equal(new URL(requests[1], "http://example.test").searchParams.get("place_id"), "a/b?");
    assert.ok(requests.every((request) => request.startsWith("/demo-api/geocode/")));
  } finally {
    globalThis.fetch = previous;
  }
});
