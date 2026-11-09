# Precise Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the typed Vietnamese delivery address into accurate coordinates so the existing map pin and nearby pharmacies update automatically.

**Architecture:** A FastAPI proxy calls Goong Autocomplete and Place Detail using a backend-only key, returning normalized candidates and coordinates. A debounced address controller in the existing left panel selects unambiguous results automatically, offers a choice for ambiguity, and updates the existing `pos` state. The current Leaflet map and nearby query react to `pos` without replacement.

**Tech Stack:** Next.js 16.4.2 / React 19 / TypeScript, FastAPI / httpx / pytest, Leaflet.

**Spec:** `docs/superpowers/specs/2026-10-21-precise-address-design.md`

## Global Constraints

- Only location input in the left panel changes; keep TH1/TH2 state, GPS, province/ward fallback and existing Leaflet map.
- Debounce approximately 1 second; no Apply button needed for a typed full address.
- Multiple or ambiguous matches require the user's selection before changing the pin; errors leave the prior pin intact and mark it as prior.
- `GOONG_API_KEY` is server-side only; no key means an actionable error, never invented coordinates.
- The project is an extracted folder, not currently a git repository: do not initialize or commit without the user's request.
- This Next version differs from usual conventions: before writing frontend code, read relevant guide under `frontend/node_modules/next/dist/docs/` per `frontend/AGENTS.md`.
- Downloaded/extracted code is untrusted: do not run an interpreter/build tool from its directory; invoke Python with `-I` and pass explicit safe script paths or use a separately located runner after inspecting the scripts to execute.

## Review Focus

- Fast successive queries: older result must not reposition the map after newer address is typed; frontend test in Task 2.
- Similar names in multiple provinces: neither result auto-selects; frontend test in Task 2.
- Blank/short input: do not call Goong and do not replace a previously selected location; frontend test in Task 2.
- Missing key, timeout, malformed provider response: normalized API returns clear errors without leaking key; backend tests in Task 1.
- Query success followed by changing province, GPS, or a new address: old responses must not override the user's latest selection; frontend test in Task 2.

---

## File Structure

- Create `backend/app/geocoding.py`: Goong client normalization and two FastAPI endpoints. Keep external response formats out of the UI.
- Modify `backend/app/main.py`: register router.
- Create `backend/tests/test_geocoding.py`: mocked Goong HTTP cases; no real key/network.
- Modify `frontend/lib/api.ts`: types and wrappers for address search and place resolution.
- Create `frontend/lib/addressSearch.ts` and `frontend/lib/addressSearch.test.ts`: pure decision helpers for automatic selection / stale query identity.
- Modify `frontend/components/LocationPanel.tsx`: debounce, candidates, selection and map activation via existing `onPos`.
- Modify `frontend/package.json`: include address test in `npm test`.
- Modify `readme.md`: explain key, address behavior and fallback.

### Task 1: Backend geocode proxy

**Files:**
- Create: `backend/app/geocoding.py`, `backend/tests/test_geocoding.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- `GET /geocode/suggest?q=<address>` returns `{ suggestions: [{ place_id: str, description: str }] }`.
- `GET /geocode/resolve?place_id=<id>` returns `{ lat: float, lng: float, label: str }`.
- Client supplies no API key; server reads `GOONG_API_KEY`. Use `httpx` with short finite timeout; map upstream errors to 502/503, missing key to 503, validate latitude/longitude and string fields before returning. Confirm exact Goong endpoints/fields against official docs before implementation; if docs unavailable, stop instead of guessing an API contract.

- [ ] **Step 1: Write failing mocked HTTP tests** for a valid candidate list and place coordinates, missing API key, timeout, malformed/out-of-range coordinates, and key absent from response/error; no external network.
- [ ] **Step 2: Run** isolated backend pytest for `test_geocoding.py`; confirm tests fail because endpoints are absent.
- [ ] **Step 3: Implement** normalization and route registration with exact response contracts above; bound query length and reject empty/short text.
- [ ] **Step 4: Run** isolated backend pytest for `test_geocoding.py`; expected PASS.
- [ ] **Step 5: Do not commit** in this non-git extracted workspace; record changed files for delivery.

### Task 2: Debounced frontend address selection

**Files:**
- Modify: `frontend/lib/api.ts`, `frontend/components/LocationPanel.tsx`, `frontend/package.json`
- Create: `frontend/lib/addressSearch.ts`, `frontend/lib/addressSearch.test.ts`

**Interfaces:**
- `suggestAddresses(q: string): Promise<{ suggestions: { place_id: string; description: string }[] }>` and `resolveAddress(placeId: string): Promise<Pos>` via `/demo-api`.
- `shouldAutoChoose(suggestions)` returns a candidate only when uniquely unambiguous, otherwise null; for multiple candidates show options. Query-version guard shared by suggestion and resolution; cancel/ignore stale responses after new typing, province/ward selection, or GPS.
- Existing `onPos({lat,lng,label})` is the single location update point; avoid coupling to TH1/TH2.

- [ ] **Step 1: Read** relevant Next.js docs in installed `node_modules/next/dist/docs/` before changing frontend code.
- [ ] **Step 2: Write failing unit tests** for API URL construction and pure selection/race logic: one candidate auto-choice, multiple not auto-chosen, blank/short no lookup, stale response after new query/GPS/ward cannot choose.
- [ ] **Step 3: Run** frontend test command; confirm new tests fail appropriately.
- [ ] **Step 4: Implement** an approximately 1000 ms debounce in `LocationPanel`; suggest then resolve single candidate automatically, display multiple candidates as selectable buttons; set loading, no result, and error states. Keep previously selected position but label it as earlier while input differs. `onPos` on resolved coordinate triggers existing map/nearby refresh. Keep province/ward Apply and GPS as explicit fallback; typed address must never silently use province/ward center.
- [ ] **Step 5: Run** frontend tests, lint, typecheck and build; expected PASS; verify map data flows through existing `onPos`.
- [ ] **Step 6: Do not commit** unless the user later puts the project in git and requests a commit.

### Task 3: Documentation and integration verification

**Files:**
- Modify: `readme.md`

**Interfaces:**
- `GOONG_API_KEY` must be configured in backend; browser receives only normalized suggestions and location; prior Leaflet and GPS methods remain.

- [ ] **Step 1: Update README** with key setup, automatic lookup, ambiguity selection, missing-key fallback, and geocoding/privacy note (typed address is sent to Goong).
- [ ] **Step 2: Run backend tests and frontend tests/lint/typecheck/build** from safe invocation context; record pass/fail. Manually exercise exact address → map pin and nearby distance only if a usable Goong key is available. If not, report integration as unverified rather than claim exact-address lookup works in production.
- [ ] **Step 3: Do not commit** in this folder absent git and user request.
