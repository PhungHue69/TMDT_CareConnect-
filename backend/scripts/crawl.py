"""One-shot demo crawler for nhathuoclongchau.com.vn public JSON APIs -> data/*.json.

Cloudflare 403s plain httpx/curl (TLS fingerprint), so main() drives a real
Chrome via Playwright and calls the site's own public APIs from inside the page.
ponytail: Playwright is a dev-only extra (`pip install playwright`, needs local
Chrome, headed); normalize_* are pure and need nothing. Output is committed, so
re-crawling is rarely needed.
"""
import json
import time
from pathlib import Path

BASE = "https://nhathuoclongchau.com.vn"
API = "https://api.nhathuoclongchau.com.vn/lccus"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HOTLINE = "18006928"  # raw shop "phone" is an internal shop code, use hotline


def normalize_pharmacy(raw: dict) -> dict | None:
    loc = raw.get("location") or {}
    c = loc.get("coordinates") or {}
    name = (raw.get("shopNameDisplay") or raw.get("shopName") or "").strip()
    lat, lng = c.get("latitude"), c.get("longitude")
    if not name or not lat or not lng:
        return None
    slug = raw.get("slugEcom")
    return {
        "name": name,
        "address": (loc.get("address") or loc.get("addressDisplay") or name).strip(),
        "latitude": float(lat),
        "longitude": float(lng),
        "phone": HOTLINE,
        "source_url": f"{BASE}/{slug}" if slug else f"{BASE}/he-thong-cua-hang",
    }


def normalize_drug(raw: dict) -> dict | None:
    if "prescription" not in raw:
        return None  # fail closed: unknown Rx status must never become OTC
    name = (raw.get("name") or "").strip()
    cats = raw.get("category") or []
    root = next((c.get("slug") for c in cats if c.get("level") == 1), "")
    if raw.get("prescription"):
        category = "RX"
    elif root == "thuc-pham-chuc-nang":
        category = "TPCN"
    elif root == "thuoc":
        category = "OTC"
    else:
        return None
    p = raw.get("price") or {}
    price = p.get("price")
    if category == "RX" and price is None:
        price = 0  # ponytail: site hides Rx prices; 0 = "price on request" sentinel
    if not name or price is None:
        return None
    slug = raw.get("slug")
    return {
        "name": name,
        "active_ingredient": raw.get("ingredients") or None,
        "category": category,
        "unit": p.get("measureUnitName") or None,
        "price": int(price),
        "image_url": raw.get("image") or None,
        "source_url": f"{BASE}/{slug}" if slug else None,
    }


# (category slug, how many to try per request) per type
RX_CATS = ["thuoc/thuoc-khang-sinh-khang-nam", "thuoc/thuoc-da-lieu", "thuoc/thuoc-mat-tai-mui-hong",
           "thuoc/thuoc-ho-hap", "thuoc/thuoc-giam-dau-ha-sot-khang-viem", "thuoc/thuoc-than-kinh",
           "thuoc/thuoc-tiet-nieu-sinh-duc"]
OTC_CATS = RX_CATS + ["thuoc/thuoc-di-ung"]
TPCN_CATS = ["thuc-pham-chuc-nang/vitamin-khoang-chat", "thuc-pham-chuc-nang/ho-tro-mien-dich-tang-suc-de-khang",
             "thuc-pham-chuc-nang/ho-tro-tieu-hoa", "thuc-pham-chuc-nang/than-kinh-nao",
             "thuc-pham-chuc-nang/lam-dep", "thuc-pham-chuc-nang/tim-mach-huyet-ap",
             "thuc-pham-chuc-nang/co-xuong-khop", "thuc-pham-chuc-nang/gan-mat",
             "thuc-pham-chuc-nang/bao-ve-mat", "thuc-pham-chuc-nang/tieu-duong"]

_FETCH = """async ([url, body]) => {
  const r = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'},
                              body: JSON.stringify(body)});
  return r.ok ? await r.json() : {error: r.status};
}"""


def check_floor(pharmacies: list, drugs: dict | list, floor: int = 1) -> str | None:
    """Error message if the crawl is too thin to overwrite committed data, else None."""
    if len(pharmacies) < floor:
        return "no pharmacies crawled"
    counts = {k: 0 for k in ("RX", "OTC", "TPCN")}
    for d in drugs.values() if isinstance(drugs, dict) else drugs:
        counts[d["category"]] += 1
    low = [k for k, v in counts.items() if v < floor]
    return f"too few drugs for {low}" if low else None

def main(max_pharmacies: int = 100, per_type: dict | None = None) -> None:
    from playwright.sync_api import sync_playwright  # lazy: dev-only dependency

    per_type = per_type or {"RX": 25, "OTC": 45, "TPCN": 30}
    DATA_DIR.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        # headless is detected by Cloudflare; headed Chrome passes.
        browser = pw.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page()
        page.goto(f"{BASE}/he-thong-cua-hang", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)

        def post(path: str, body: dict) -> dict:
            time.sleep(1)  # polite: >=1s between requests
            return page.evaluate(_FETCH, [f"{API}/{path}", body])

        shops = post("ecom-prod/store-front/v3/order-promising/list-shop",
                     {"maxResult": max_pharmacies, "skipCount": 0,
                      "searchBy": {"byProvince": None, "byLocation": None}}).get("items", [])
        pharmacies = [n for n in map(normalize_pharmacy, shops) if n][:max_pharmacies]
        print(f"pharmacies: {len(pharmacies)}/{len(shops)} (skipped no coords: {len(shops) - len(pharmacies)})")

        search = "search-product-service/api/products/ecom/product/search/cate"
        drugs: dict[str, dict] = {}  # keyed by source_url to dedupe
        for kind, cats in (("RX", RX_CATS), ("OTC", OTC_CATS), ("TPCN", TPCN_CATS)):
            want, got = per_type[kind], 0
            per_cat = -(-want // len(cats)) + 2  # ceil + slack for unpriced rows
            for cat in cats:
                if got >= want:
                    break
                body = {"skipCount": 0, "maxResultCount": 24, "sortType": 4, "category": [cat]}
                if kind != "TPCN":
                    body["prescription"] = ["true" if kind == "RX" else "false"]
                taken = 0
                for raw in post(search, body).get("products", []):
                    if got >= want or taken >= per_cat:
                        break
                    raw["prescription"] = kind == "RX"
                    d = normalize_drug(raw)
                    if d and d["category"] == kind and d["source_url"] not in drugs:
                        drugs[d["source_url"]] = d
                        got += 1
                        taken += 1
            print(f"{kind}: {got}/{want}")
        browser.close()

    err = check_floor(pharmacies, drugs)
    if err:
        raise SystemExit(f"abort, committed data NOT overwritten: {err}")

    (DATA_DIR / "pharmacies.json").write_text(json.dumps(pharmacies, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA_DIR / "drugs.json").write_text(json.dumps(list(drugs.values()), ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
