# Temporary Demo Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer one temporary public URL for the existing Next.js demo, with working prescription-image analysis and demo order submission, without exposing the Gemini credential or silently sending orders to a real pharmacy.

**Architecture:** Keep FastAPI bound to loopback on port 8000 and Next.js on port 3000. Browser requests use relative `/demo-api` URLs; Next.js proxies those paths and `/static` image paths to FastAPI on loopback. Expose only the Next.js port through an ephemeral, stoppable HTTPS tunnel. Apply server-side rate limits to the two billable/state-changing endpoints before opening the tunnel; preserve the existing local app experience.

**Tech Stack:** FastAPI/Python, Next.js 16/TypeScript, pytest, Node test runner, Playwright/Chrome, Cloudflare Quick Tunnel (or equivalent temporary tunnel if unavailable).

**Spec:** [project scope](../../../readme.md) plus the user-approved conversation requirements (temporary link, anyone with link, real Gemini image analysis, demo-only orders, request limits).

## Global Constraints

- Gemini key remains only in `backend/.env`, which is gitignored; never log it, put it in `NEXT_PUBLIC_` values, or copy it into a URL.
- The existing API already creates only a local SQLite `Order`, with no pharmacy dispatch integration. The public UI must call it a **demo request**, not a real delivery confirmation.
- Apply limits on the backend, not only the browser: when `PUBLIC_DEMO=1`, cap all visitors together at 30 image analyses and 30 orders per rolling 24 hours; return HTTP 429 and explanatory retry text. Do not depend on client IP or untrusted forwarding headers. Bound request size before sending to Gemini; do not record submitted health images or prompts in logs. The limiter is in-memory and resets on backend restart, so report it as an ephemeral demo guardrail, not production protection.
- The tunnel ends when its process or the machine stops. Do not set up persistent hosting or a permanent domain.
- This directory has no `.git` repository; don't create commits without an explicit request.

## Review Focus

- A request forging `X-Forwarded-For` or arriving through a fresh browser must count against the same global demo limit; test both conditions.
- A valid image on a slow AI response must not accidentally count twice or leak a server exception; test success and failure paths with mocked Gemini.
- A requester with too many calls must receive 429 before any Gemini invocation or order insertion; test each endpoint.
- A remotely loaded browser must not call `localhost:8000` on the viewer's machine; test public-origin network requests and static images.
- A client retry after order submission must not be mistaken for a real pharmacy acknowledgement; inspect success copy and order status in the real UI.

---

### Task 1: Same-origin browser API and assets

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/imageUrl.ts`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/package.json`
- Test: `frontend/lib/imageUrl.test.ts`
- Test: `frontend/lib/api.test.ts`

**Interfaces:**
- `API` is a browser-visible relative prefix `/demo-api`; Next rewrite maps `/demo-api/:path*` to `http://127.0.0.1:8000/:path*`.
- Image paths under `/static/` resolve to same-origin `/static/...`; Next rewrite maps `/static/:path*` to loopback FastAPI. Preserve external image URLs and fallback images.

- [ ] **Step 1: Write failing tests** in `imageUrl.test.ts` and `api.test.ts` for relative API prefix and `/static` path, external URL, fallback, and the browser fetch target; check that generated URLs do not contain `localhost`. Add `api.test.ts` to the package test script.
- [ ] **Step 2: Run** `npm test --prefix frontend` and confirm the new assertions fail.
- [ ] **Step 3: Implement** the two Next rewrites and update API/image URL generation. Check the installed Next 16 `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md` first.
- [ ] **Step 4: Run** frontend tests, typecheck, and build. Verify the page and `/demo-api/locations`, `/static/images/default-drug.webp` through port 3000.

### Task 2: Server-side abuse limits on public actions

**Files:**
- Create: `backend/app/demo_limits.py`
- Modify: `backend/app/prescriptions.py`
- Modify: `backend/app/orders.py`
- Test: `backend/tests/test_demo_limits.py`

**Interfaces:**
- `check_demo_limit(action: Literal["analyze", "order"]) -> None`, called before Gemini use or order writes only when `PUBLIC_DEMO=1`; 429 with a safe Vietnamese detail on overflow. Use one lock-protected in-memory rolling 24-hour counter per action in the single-process local FastAPI instance; explicit reset for tests. Ignore IP and forwarding headers entirely.
- The shared limit is 30 analyses and 30 orders/24h. Invalid uploads should not consume an analysis slot; limit check occurs after shape/size validation but before the provider call. `PUBLIC_DEMO` is set only on the tunnel-serving backend process, not permanently in the checked-in configuration.

- [ ] **Step 1: Write failing tests** for disabled limiter without `PUBLIC_DEMO`, shared limits with `PUBLIC_DEMO=1`, forged forwarding headers, malformed image, and rejection before provider call/database commit.
- [ ] **Step 2: Run** `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_demo_limits.py -q`; confirm the tests fail for the missing behavior.
- [ ] **Step 3: Implement** a small lock-protected bounded in-memory counter and FastAPI dependencies; no request-derived identity is needed. Enable it only with `PUBLIC_DEMO=1` in the backend launch environment.
- [ ] **Step 4: Run** the focused tests and the full backend test suite; adjust existing tests only when their assumptions conflict with the explicitly chosen limits.

### Task 3: Make demo status explicit and exercise both flows

**Files:**
- Modify: `frontend/app/cart/page.tsx`
- Test: existing `frontend` tests plus a browser smoke script in an external scratch directory (not the repository)

**Interfaces:**
- After API order success, the UI says `Đã gửi yêu cầu demo — chờ nhà thuốc xác nhận (mô phỏng)` and shows the ID. It must state clearly that no real pharmacy receives it; API status remains the existing `PLACED` demo status, not a claim of delivery.

- [ ] **Step 1: Write a failing browser assertion** for the expected success wording with an intercepted 201 demo response (no real order created).
- [ ] **Step 2: Run it** and observe failure on `Đặt hàng thành công`.
- [ ] **Step 3: Change** success copy only; do not rename database states or imply a real shipment.
- [ ] **Step 4: Run** browser test and frontend typecheck/build. Separately drive one real demo order into the SQLite-backed endpoint with a TPCN item, confirm it creates a demo record and shows the new wording; do not use a real pharmacy service.

### Task 4: Open and verify the temporary tunnel

**Files:**
- No project files required; keep tunnel installation/download in a new isolated temporary directory, inspect the fetched binary/release before execution, and leave `.env` private.

**Interfaces:**
- One ephemeral `https://...` URL forwards to `http://127.0.0.1:3000`; only the Next.js port is exposed. Backend remains loopback-only and is reached through Next rewrites.

- [ ] **Step 1: Verify locally**: frontend and backend HTTP 200, `/demo-api/locations` and image path work through port 3000; image analysis and order flows pass, 429 tests pass. Never print `.env`.
- [ ] **Step 2: Start a temporary tunnel** to port 3000 in a background process; capture the generated HTTPS URL. Do not start one if the feature checks fail.
- [ ] **Step 3: Browse that HTTPS URL** with Chrome/Playwright from a fresh browser context; exercise catalog, a non-prescription sample image (Gemini returns a safe rejection), and a demo order. Inspect browser console/network for accidental `localhost:8000` requests and confirm no secret is sent to the client.
- [ ] **Step 4: Give the person** the working URL, the process/command to stop the tunnel, the fact that the link is accessible to anyone possessing it, and that it stops when the tunnel/machine stops. If tunnel establishment or remote checks fail, report that precisely instead of claiming public access.
