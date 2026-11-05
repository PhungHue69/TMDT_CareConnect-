import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImageUrl } from "./imageUrl.ts";

const B = "http://api:8000";

test("/static path gets API prefix", () => {
  assert.equal(buildImageUrl(B, "/static/images/drugs/a.webp", "drug"), "http://api:8000/static/images/drugs/a.webp");
});
test("http(s) URL unchanged", () => {
  assert.equal(buildImageUrl(B, "https://cdn.x/a.jpg", "drug"), "https://cdn.x/a.jpg");
  assert.equal(buildImageUrl(B, "http://cdn.x/a.jpg", "pharmacy"), "http://cdn.x/a.jpg");
});
test("null/undefined/empty/unknown -> default per kind", () => {
  for (const v of [null, undefined, "", "foo/bar.png", "//cdn.x/a.png", "/other/a.png"]) {
    assert.equal(buildImageUrl(B, v, "drug"), "http://api:8000/static/images/default-drug.webp");
    assert.equal(buildImageUrl(B, v, "pharmacy"), "http://api:8000/static/images/default-pharmacy.webp");
  }
});
test("trailing slash in base handled", () => {
  assert.equal(buildImageUrl(B + "/", "/static/x.webp", "drug"), "http://api:8000/static/x.webp");
  assert.equal(buildImageUrl(B + "//", null, "pharmacy"), "http://api:8000/static/images/default-pharmacy.webp");
});
test("public demo images stay on the viewer's origin", () => {
  assert.equal(buildImageUrl("/demo-api", "/static/images/drugs/a.webp", "drug"), "/static/images/drugs/a.webp");
  assert.equal(buildImageUrl("/demo-api", null, "pharmacy"), "/static/images/default-pharmacy.webp");
  assert.equal(buildImageUrl("/demo-api", "https://cdn.x/a.jpg", "drug"), "https://cdn.x/a.jpg");
});
