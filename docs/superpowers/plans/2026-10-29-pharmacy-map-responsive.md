# Responsive Pharmacy Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the approved blue map/list and pharmacy-detail mobile references while keeping the existing shopping, AI image-screening, and pharmacy-switch safeguards intact.

**Architecture:** The homepage remains a map-first selection screen; choosing a pharmacy navigates to `/pharmacies/[id]` rather than opening a modal. A client context mounted above both pages stores selected location, pharmacy and unsent image in memory for same-tab navigation; cart remains in the existing `localStorage` store. Backend provides an ID lookup if needed and idempotent image submission so retries cannot silently duplicate requests.

**Tech Stack:** Next.js 16.4.2 (App Router), React 19, Tailwind 4, Leaflet/React-Leaflet, FastAPI/SQLAlchemy; existing test stacks Node `node:test` and pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-pharmacy-map-responsive-design.md`

## Global Constraints

- Build only the two approved screens; no new bottom nav, fabricated ratings/hours/open-state, or third-party map/logo assets from the mockup.
- Desktop map/list side-by-side; phone map above list. Blue is the visual accent; existing demo warning and data labels remain truthful.
- OTC and TPCN share the in-stock list for the selected pharmacy; Rx is image request only, no direct cart/order flow.
- A photo draft survives route changes in the same tab, never browser reload; it is not saved before submission. Switching pharmacies clears draft/cart only after confirmation.
- Server success for Rx means durable local save, not pharmacist receipt; no real patient photos in fixtures or public URLs.
- Read `frontend/AGENTS.md` and relevant `frontend/node_modules/next/dist/docs/` before modifying Next code, notably dynamic route params (Promise) and client components.
- The extracted folder has no git repository: do not initialize, commit, push, or publish. Launch Python with `-I` using explicit app-dir; keep the seeded DB path absolute when running outside backend.

## Review Focus

- Refreshing a valid `/pharmacies/17` URL should show pharmacy 17, while unknown ID shows an actionable not-found state; Task 2 browser test.
- Browser back/forward between map and detail must not discard an unsent photo or silently switch the cart pharmacy; Task 2 navigation test.
- A lost response after a saved prescription upload must not create a duplicate on retry; Task 3 API test.
- A photo upload still in flight when navigating away or selecting a different shop must not show success on the wrong pharmacy; Task 2 browser test.
- On a small phone viewport, no horizontal scrolling, clipped search controls or inaccessible return button; Task 1 and Task 2 screenshots/interaction checks.

---

## Files and interfaces

- Rework `frontend/app/page.tsx`, `frontend/components/LocationPanel.tsx`, `frontend/components/PharmacyMap.tsx`: map-first home and explicit pharmacy navigation. Retain `nearby`, `locations`, `suggestAddresses`, `resolveAddress`, `locationForWard`, `baseMap`.
- Create `frontend/components/PharmacySession.tsx`: client provider in `frontend/app/layout.tsx`; exposes `{pos, selectedPharmacy, draftImage}` plus setters and a guarded pharmacy transition. Never put the `File` in localStorage or URL. Reuse `getCart`, `clearCart`, `setPharmacy` in `frontend/lib/cart.ts`.
- Create `frontend/app/pharmacies/[id]/page.tsx` (server route awaits params per Next 16 docs) and `frontend/components/PharmacyDetail.tsx` (client tab UI) with URL-based lookup, back action, image and in-stock list. Reuse `PrescriptionFlow`, `SupplementFlow`, `pharmacyProducts`.
- Extend `backend/app/catalog.py` and `frontend/lib/api.ts` only as necessary for `GET /pharmacies/{id}`; do not infer detail by fetching all pharmacies near arbitrary coordinates.
- Extend `backend/app/prescriptions.py`, `backend/app/models.py`, `frontend/lib/api.ts`, `PrescriptionFlow.tsx` only for idempotent retries with stable attempt key, keeping private storage and status semantics.
- Update `frontend/app/globals.css`, `frontend/components/Header.tsx` for scoped blue treatment and responsive header; update `readme.md` with actual behavior and security constraints.

### Task 1: Map/list layout and blue tokens

**Files:** Modify `frontend/app/globals.css`, `frontend/components/LocationPanel.tsx`, `frontend/components/PharmacyMap.tsx`, `frontend/components/Header.tsx`, `frontend/app/page.tsx`; test existing `frontend/lib/mapTiles.test.ts`, `frontend/lib/wardLocation.test.ts` plus new focused UI/integration test if test harness permits.

**Interfaces:** `LocationPanel` continues to accept `pos`, `onPos`, selected pharmacy and `onChoosePharmacy(Pharmacy)`. Popup click shows name/address/distance; selection action calls callback. Existing `PharmacyMap` stays `ssr:false`.

- [ ] **Step 1: Write failing browser/layout assertions** for 390px stacking and desktop side-by-side; map on top at phone size, five nearby items with explicit choose actions, no page-width overflow. Check marker popup shows name/distance without selecting. Run and see failure on old layout.
- [ ] **Step 2: Implement layout/tokens** using the existing Tailwind theme and blue accent; preserve data, background tile attribution, accessibility and empty/error states. Remove old inline sidebar framing; do not add mockup ratings/hours.
- [ ] **Step 3: Run frontend tests/lint/typecheck and browser viewport checks**; expect passing assertions and working province/ward/GPS path, map zoom and red markers on both widths. Do not commit in this folder.

### Task 2: Routable pharmacy detail with session-only draft

**Files:** Create `frontend/components/PharmacySession.tsx`, `frontend/app/pharmacies/[id]/page.tsx`, `frontend/components/PharmacyDetail.tsx`; modify `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/components/PrescriptionFlow.tsx`, `frontend/components/SupplementFlow.tsx`, `frontend/lib/api.ts`, backend `app/catalog.py` if ID lookup missing; test `frontend/lib/pharmacySelection.test.ts`, `frontend/lib/api.test.ts`, backend `tests/test_stock_locations.py` and browser route tests.

**Interfaces:** `GET /pharmacies/{id}` returns `{id,name,address,latitude,longitude,phone,image_url}` (distance comes only from known client location); unknown ID 404. `PharmacySession` keeps `pos: Pos|null`, `selectedPharmacy: Pharmacy|null`, `draftImage: File|null` through client route transitions, and `selectPharmacy(p)` returns `selected|same|confirmation-needed`. Existing cart remains pharmacy-bound; changing pharmacy after confirmation clears cart and draft. Valid detail URL can reload, draft does not persist reload.

- [ ] **Step 1: Write failing tests** for ID lookup 200/404, home→detail→back→same detail retaining draft/cart, switch-confirm/cancel semantics, invalid URL and in-flight upload navigation. Observe expected failure.
- [ ] **Step 2: Implement provider above routes, page navigation, detail fetch and responsive page UI.** Choose with URL route; back with `Link` to `/`; show name/address/distance only with known location. Two tabs show existing classify-only Rx and pharmacy-scoped OTC+TPCN. Do not move File into browser storage; do not invent missing data.
- [ ] **Step 3: Run frontend/backend targeted and complete tests plus real desktop/mobile browser interactions.** Verify refresh and history behavior; invalid pharmacy returns clear back link; pending requests never update a different pharmacy view. Do not commit.

### Task 3: Safe retry semantics and documentation

**Files:** Modify `backend/app/prescriptions.py`, `backend/app/models.py`, `frontend/lib/api.ts`, `frontend/components/PrescriptionFlow.tsx`, `backend/tests/test_prescription_requests.py`, `readme.md`.

**Interfaces:** `POST /prescriptions/requests` accepts `image`, `pharmacy_id`, and opaque per-attempt idempotency key; one accepted request per key for the same pharmacy, repeated success returns same ID/status without re-calling AI or writing a second file; a different image/selected pharmacy must get a fresh key. Do not expose saved image, and keep the existing meaning of `PENDING_PHARMACIST` and demo disclaimer. If a compatible unique key column needs a migration, add an explicit migration path: `create_all` does not alter existing tables.

- [ ] **Step 1: Write failing backend tests**: duplicate key→same saved row, different key→new row, same key with a different pharmacy/image→error; verify storage failure leaves no success, missing/invalid input remains rejected. Add frontend API test for sending same key on retry. Watch fail.
- [ ] **Step 2: Implement transactional idempotency and migration** for existing SQLite, plus retry behavior in the image form. Do not claim pharmacist receipt; redact/avoid sensitive logs. Update README with true limitations, no public exposure without auth/retention policies and secret rotation.
- [ ] **Step 3: Run full backend pytest, frontend tests/lint/typecheck, production build, then Chrome desktop + phone-width smoke.** Exercise map selection, detail route, cart, synthetic image failure, mocked-success UI, and retry. Record exactly what was not tested live (e.g. real Gemini verification or phone camera). No commit.

## Self-review

Spec coverage: screen layout/task 1, route/session/cart/task 2, retry/task 3. All review-focus cases are pinned to a task. Choices left to implementer: which browser harness and how to structure Tailwind classes; fixed decisions above: route shape, data shape, state lifetime and idempotency behavior. Do not infer successful pharmacist delivery from saved request.
