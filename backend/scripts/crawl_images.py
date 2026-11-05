"""Download product + pharmacy images -> static/images/*.webp + data/images.json.

Drug images: public CDN, plain httpx. Pharmacy images: list-shop payload fields
`avatar`/`pictures` (CDN urls), fetched via headed Playwright Chrome like crawl.py
(Cloudflare). Never fabricates images: no image -> null (frontend shows default).
ponytail: Playwright only needed for the pharmacy list; one pass, <=100 per type.
Run: python -m scripts.crawl_images
"""
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

from PIL import Image

from scripts.crawl import API, BASE, DATA_DIR, _FETCH

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "images"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
CAP = 100
DELAY = 1.0  # >=1s between requests (CDN is the same operator as the site)
MAX_SIDE = 400
MAX_BYTES = 5_000_000  # download cap per image
MAX_PIXELS = 40_000_000  # decode cap (decompression-bomb guard)
ALLOWED_DOMAIN = "nhathuoclongchau.com.vn"  # all 100 drug image hosts: cdn.nhathuoclongchau.com.vn


def allowed_url(url: str) -> bool:
    """https only, host = ALLOWED_DOMAIN or a subdomain. URLs come from external data."""
    try:
        u = urlparse(url)
        host = (u.hostname or "").lower()
    except ValueError:
        return False
    return u.scheme == "https" and (host == ALLOWED_DOMAIN or host.endswith("." + ALLOWED_DOMAIN))


def _write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _valid_webp(path: Path) -> bool:
    try:
        with Image.open(path) as im:
            return im.format == "WEBP"
    except Exception:
        return False


def file_name(source_url: str) -> str:
    """Stable per source_url (DB ids change on reseed)."""
    return hashlib.sha1(source_url.encode("utf-8")).hexdigest()[:12] + ".webp"


def to_webp(data: bytes, max_side: int = MAX_SIDE) -> bytes:
    """Any Pillow-readable image -> WebP, longest side <= max_side. Junk -> ValueError."""
    try:
        im = Image.open(io.BytesIO(data))  # lazy: header only
        if im.size[0] * im.size[1] > MAX_PIXELS:
            raise ValueError(f"image too large: {im.size}")
        im.load()
    except ValueError:
        raise
    except Exception as e:  # PIL raises several types (incl. DecompressionBombError) for bad input
        raise ValueError(f"not an image: {e}") from e
    im = im.convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    im = Image.alpha_composite(bg, im).convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)  # keeps ratio, never upscales
    out = io.BytesIO()
    im.save(out, "WEBP", quality=80, method=6)
    return out.getvalue()


def download_all(items: dict[str, str | None], kind: str, root: Path, fetch: Callable[[str], bytes],
                 sleep: Callable[[float], None] = time.sleep, cap: int = CAP) -> dict[str, str | None]:
    """items: {source_url: image_url|None} -> {source_url: '/static/images/<kind>/x.webp'|None}.
    Existing files are reused (idempotent); per-image failure -> None + warning."""
    result: dict[str, str | None] = {}
    for n, (key, url) in enumerate(items.items()):
        if n >= cap or not url:
            result[key] = None
            continue
        name = file_name(key)
        path = root / kind / name
        if not _valid_webp(path):  # missing or truncated -> (re)download
            try:
                if not allowed_url(url):
                    raise ValueError("url not allowed (need https + allowlisted host)")
                sleep(DELAY)
                blob = to_webp(fetch(url))
                _write_atomic(path, blob)
            except Exception as e:
                print(f"warn: {kind} {url}: {e}", file=sys.stderr)
                result[key] = None
                continue
        result[key] = f"/static/images/{kind}/{name}"
    return result


def make_defaults(root: Path = STATIC_DIR) -> None:
    """default-drug.webp (pill capsule) + default-pharmacy.webp (cross in box); 400x400, #d9f2e3 / #137c4a."""
    from PIL import ImageDraw

    bg, fg = "#d9f2e3", "#137c4a"
    root.mkdir(parents=True, exist_ok=True)
    drug = Image.new("RGB", (400, 400), bg)
    caps = Image.new("L", (400, 400), 0)
    ImageDraw.Draw(caps).rounded_rectangle((60, 140, 340, 260), radius=60, fill=255)
    caps = caps.rotate(35, resample=Image.BICUBIC)
    drug.paste(fg, mask=caps)
    drug.save(root / "default-drug.webp", "WEBP", quality=80)
    ph = Image.new("RGB", (400, 400), bg)
    d = ImageDraw.Draw(ph)
    d.rounded_rectangle((90, 90, 310, 310), radius=24, outline=fg, width=14)
    d.rectangle((185, 140, 215, 260), fill=fg)
    d.rectangle((140, 185, 260, 215), fill=fg)
    ph.save(root / "default-pharmacy.webp", "WEBP", quality=80)


def shop_image(shop: dict) -> str | None:
    pics = shop.get("pictures") or []
    return shop.get("avatar") or (pics[0] if pics else None) or None


def shop_sources(shops: list[dict]) -> dict[str, str | None]:
    """list-shop items -> {source_url: image_url|None}; source_url as in crawl.normalize_pharmacy."""
    return {f"{BASE}/{s['slugEcom']}": shop_image(s) for s in shops if s.get("slugEcom")}


def live_shop_sources() -> dict[str, str | None]:
    from playwright.sync_api import sync_playwright  # lazy: dev-only dependency

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)  # headless gets 403
        page = browser.new_page()
        page.goto(f"{BASE}/he-thong-cua-hang", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        time.sleep(1)
        r = page.evaluate(_FETCH, [f"{API}/ecom-prod/store-front/v3/order-promising/list-shop",
                                   {"maxResult": CAP, "skipCount": 0,
                                    "searchBy": {"byProvince": None, "byLocation": None}}])
        browser.close()
    return shop_sources(r.get("items", []))


def http_fetch(url: str, transport=None) -> bytes:
    """GET with size cap. Redirects are NOT followed (a 3xx raises): CDN urls are direct."""
    import httpx

    with httpx.Client(timeout=20, headers={"User-Agent": UA}, follow_redirects=False, transport=transport) as c:
        with c.stream("GET", url) as r:
            r.raise_for_status()
            if int(r.headers.get("content-length") or 0) > MAX_BYTES:
                raise ValueError("response too large")
            buf = bytearray()
            for chunk in r.iter_bytes():
                buf += chunk
                if len(buf) > MAX_BYTES:
                    raise ValueError("response too large")
    return bytes(buf)


def run(data_dir: Path = DATA_DIR, root: Path = STATIC_DIR, fetch: Callable[[str], bytes] = http_fetch,
        shop_sources: Callable[[], dict[str, str | None]] = live_shop_sources,
        sleep: Callable[[float], None] = time.sleep) -> int:
    data_dir = Path(data_dir)
    load = lambda n: json.loads((data_dir / n).read_text(encoding="utf-8"))  # noqa: E731
    manifest_path = data_dir / "images.json"
    old = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}

    drugs = {d["source_url"]: d.get("image_url") for d in load("drugs.json") if d.get("source_url")}
    drug_res = download_all(drugs, "drugs", root, fetch, sleep)

    try:
        found = shop_sources()
    except Exception as e:  # no Playwright/Chrome/blocked: keep what we had
        print(f"warn: pharmacy image sources unavailable: {e}", file=sys.stderr)
        pharm_res = old.get("pharmacies", {})
    else:
        ph = {p["source_url"]: found.get(p["source_url"]) for p in load("pharmacies.json") if p.get("source_url")}
        pharm_res = download_all(ph, "pharmacies", root, fetch, sleep)

    for key, rel in old.get("pharmacies", {}).items():  # partial failure must not downgrade
        if rel and not pharm_res.get(key) and (root / "pharmacies" / Path(rel).name).is_file():
            pharm_res[key] = rel
    if not any(drug_res.values()) and not any(pharm_res.values()):
        print("error: no images downloaded; leaving manifest and static dir untouched", file=sys.stderr)
        return 1
    _write_atomic(manifest_path, (
        json.dumps({"drugs": drug_res, "pharmacies": pharm_res}, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
    print(f"drugs: {sum(map(bool, drug_res.values()))}/{len(drug_res)}; "
          f"pharmacies: {sum(map(bool, pharm_res.values()))}/{len(pharm_res)}")
    return 0


if __name__ == "__main__":
    make_defaults()
    sys.exit(run())
