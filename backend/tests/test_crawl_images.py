import io
import json

import pytest
from PIL import Image

from scripts import crawl_images as ci

U = "https://cdn.nhathuoclongchau.com.vn/v1/static/"
SRC = U + "a.png"


def _img(mode="RGB", size=(900, 600), fmt="PNG", color=None):
    buf = io.BytesIO()
    if color is None:
        color = (200, 30, 30, 0) if mode == "RGBA" else (200, 30, 30)
    Image.new(mode, size, color).save(buf, fmt)
    return buf.getvalue()


def test_filename_stable_and_unique():
    a, b = "https://x/1", "https://x/2"
    assert ci.file_name(a) == ci.file_name(a)
    assert ci.file_name(a) != ci.file_name(b)
    assert ci.file_name(a).endswith(".webp") and "/" not in ci.file_name(a)


@pytest.mark.parametrize("data", [_img("RGB", fmt="PNG"), _img("RGB", fmt="JPEG"), _img("RGBA"), _img("P", fmt="PNG", color=3)])
def test_to_webp_valid_and_bounded(data):
    out = ci.to_webp(data)
    im = Image.open(io.BytesIO(out))
    assert im.format == "WEBP" and max(im.size) <= 400


def test_to_webp_keeps_aspect_and_never_upscales():
    im = Image.open(io.BytesIO(ci.to_webp(_img(size=(800, 400)))))
    assert im.size == (400, 200)
    im = Image.open(io.BytesIO(ci.to_webp(_img(size=(100, 50)))))
    assert im.size == (100, 50)


def test_to_webp_transparency_on_white():
    im = Image.open(io.BytesIO(ci.to_webp(_img("RGBA", (10, 10), color=(0, 0, 0, 0))))).convert("RGB")
    assert min(im.getpixel((5, 5))) > 240


def test_to_webp_junk_raises_valueerror():
    with pytest.raises(ValueError):
        ci.to_webp(b"<html>403</html>")


def _fetcher(calls, fail=()):
    def fetch(url):
        calls.append(url)
        if url in fail:
            raise RuntimeError("boom")
        return _img()
    return fetch


def test_download_all_writes_files_and_manifest_paths(tmp_path):
    calls = []
    res = ci.download_all({"s1": SRC}, "drugs", tmp_path, _fetcher(calls), sleep=lambda s: None)
    rel = res["s1"]
    assert rel == f"/static/images/drugs/{ci.file_name('s1')}"
    assert (tmp_path / "drugs" / ci.file_name("s1")).is_file()


def test_download_all_failure_is_null_and_continues(tmp_path):
    calls = []
    res = ci.download_all({"a": U + "1", "b": U + "2", "c": None}, "drugs", tmp_path, _fetcher(calls, fail={U + "1"}), sleep=lambda s: None)
    assert res["a"] is None and res["b"].endswith(".webp") and res["c"] is None
    assert calls == [U + "1", U + "2"]


def test_download_all_junk_bytes_is_null(tmp_path):
    res = ci.download_all({"a": U + "x"}, "drugs", tmp_path, lambda u: b"junk", sleep=lambda s: None)
    assert res == {"a": None}


def test_download_all_idempotent_skips_existing(tmp_path):
    ci.download_all({"a": U + "1"}, "drugs", tmp_path, _fetcher([]), sleep=lambda s: None)
    calls = []
    res = ci.download_all({"a": U + "1"}, "drugs", tmp_path, _fetcher(calls), sleep=lambda s: None)
    assert calls == [] and res["a"].endswith(".webp")


def test_download_all_cap_and_politeness(tmp_path):
    sleeps = []
    items = {f"s{i}": U + f"u{i}" for i in range(5)}
    calls = []
    res = ci.download_all(items, "drugs", tmp_path, _fetcher(calls), sleep=sleeps.append, cap=3)
    assert len(calls) == 3 and len(sleeps) == 3 and all(s >= 1 for s in sleeps)
    assert [res[f"s{i}"] for i in (3, 4)] == [None, None]


def test_shop_image_prefers_avatar_then_pictures():
    assert ci.shop_image({"avatar": "A", "pictures": ["P"]}) == "A"
    assert ci.shop_image({"avatar": None, "pictures": ["P"]}) == "P"
    assert ci.shop_image({"avatar": "", "pictures": []}) is None
    assert ci.shop_image({}) is None


def test_shop_sources_keyed_by_source_url():
    shops = [{"slugEcom": "he-thong-cua-hang/x", "avatar": "A"}, {"slugEcom": "he-thong-cua-hang/y"}, {"avatar": "Z"}]
    assert ci.shop_sources(shops) == {f"{ci.BASE}/he-thong-cua-hang/x": "A", f"{ci.BASE}/he-thong-cua-hang/y": None}


def _data(tmp_path, drugs=1):
    d = tmp_path / "data"
    d.mkdir()
    (d / "drugs.json").write_text(json.dumps([{"source_url": f"s{i}", "image_url": U + f"u{i}"} for i in range(drugs)]))
    (d / "pharmacies.json").write_text(json.dumps([{"source_url": "p0"}]))
    return d


def test_run_writes_manifest(tmp_path):
    d = _data(tmp_path, 2)
    rc = ci.run(d, tmp_path / "img", fetch=_fetcher([]), shop_sources=lambda: {"p0": U + "pu"}, sleep=lambda s: None)
    m = json.loads((d / "images.json").read_text())
    assert rc == 0 and set(m) == {"drugs", "pharmacies"}
    assert m["drugs"]["s0"].startswith("/static/images/drugs/") and m["pharmacies"]["p0"].startswith("/static/images/pharmacies/")


def test_run_empty_result_leaves_everything_untouched(tmp_path):
    d = _data(tmp_path, 2)
    (d / "images.json").write_text('{"keep": 1}')
    img = tmp_path / "img"
    rc = ci.run(d, img, fetch=_fetcher([], fail={U + "u0", U + "u1", U + "pu"}), shop_sources=lambda: {"p0": U + "pu"}, sleep=lambda s: None)
    assert rc != 0
    assert (d / "images.json").read_text() == '{"keep": 1}'
    assert not img.exists()


def test_run_pharmacy_source_failure_keeps_old_section(tmp_path):
    d = _data(tmp_path)
    (d / "images.json").write_text(json.dumps({"drugs": {}, "pharmacies": {"p0": "/static/images/pharmacies/old.webp"}}))

    def boom():
        raise RuntimeError("no playwright")

    rc = ci.run(d, tmp_path / "img", fetch=_fetcher([]), shop_sources=boom, sleep=lambda s: None)
    m = json.loads((d / "images.json").read_text())
    assert rc == 0 and m["pharmacies"] == {"p0": "/static/images/pharmacies/old.webp"}
    assert m["drugs"]["s0"].endswith(".webp")


def test_make_defaults(tmp_path):
    ci.make_defaults(tmp_path)
    for n in ("default-drug.webp", "default-pharmacy.webp"):
        im = Image.open(tmp_path / n)
        assert im.format == "WEBP" and im.size == (400, 400)
        assert im.convert("RGB").getpixel((2, 2)) == (217, 242, 227) or max(
            abs(a - b) for a, b in zip(im.convert("RGB").getpixel((2, 2)), (217, 242, 227))) < 6


# --- hardening: allowlist, size caps, atomic writes, no downgrade ---

@pytest.mark.parametrize("url,ok", [
    ("https://cdn.nhathuoclongchau.com.vn/a.png", True),
    ("https://nhathuoclongchau.com.vn/a.png", True),
    ("http://cdn.nhathuoclongchau.com.vn/a.png", False),
    ("https://evil.com/a.png", False),
    ("https://nhathuoclongchau.com.vn.evil.com/a.png", False),
    ("https://evilnhathuoclongchau.com.vn/a.png", False),
    ("https://nhathuoclongchau.com.vn@evil.com/a.png", False),
    ("file:///etc/passwd", False),
    ("", False),
])
def test_allowed_url(url, ok):
    assert ci.allowed_url(url) is ok


@pytest.mark.parametrize("url", ["https://evil.com/a.png", "http://cdn.nhathuoclongchau.com.vn/a.png"])
def test_download_all_rejects_bad_url_without_fetching(tmp_path, url):
    calls = []
    res = ci.download_all({"a": url}, "drugs", tmp_path, _fetcher(calls), sleep=lambda s: None)
    assert res == {"a": None} and calls == []


def test_to_webp_rejects_huge_dimensions_before_decode(monkeypatch):
    monkeypatch.setattr(ci, "MAX_PIXELS", 100)
    with pytest.raises(ValueError, match="too large"):
        ci.to_webp(_img(size=(50, 50)))
    assert ci.to_webp(_img(size=(10, 10)))  # under cap ok


def test_to_webp_decompression_bomb_is_valueerror(monkeypatch):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 10)
    with pytest.raises(ValueError):
        ci.to_webp(_img(size=(100, 100)))


def _transport(handler):
    import httpx

    return httpx.MockTransport(handler)


def test_http_fetch_ok_and_oversize(monkeypatch):
    import httpx

    body = _img()
    assert ci.http_fetch(U + "a.png", _transport(lambda r: httpx.Response(200, content=body))) == body
    monkeypatch.setattr(ci, "MAX_BYTES", 100)
    with pytest.raises(ValueError):  # streamed body over cap (no content-length)
        ci.http_fetch(U + "a.png", _transport(lambda r: httpx.Response(200, content=iter([b"x" * 60, b"x" * 60]))))
    with pytest.raises(ValueError):  # content-length over cap, checked early
        ci.http_fetch(U + "a.png", _transport(lambda r: httpx.Response(200, headers={"content-length": "999"}, content=b"x")))


def test_http_fetch_does_not_follow_redirect_to_other_host():
    import httpx

    seen = []

    def h(r):
        seen.append(str(r.url))
        if r.url.host == "evil.com":
            return httpx.Response(200, content=_img())
        return httpx.Response(302, headers={"location": "https://evil.com/a.png"})

    with pytest.raises(httpx.HTTPStatusError):
        ci.http_fetch(U + "a.png", _transport(h))
    assert seen == [U + "a.png"]


def test_atomic_write_leaves_no_tmp_and_truncated_file_is_redownloaded(tmp_path):
    ci.download_all({"a": U + "1"}, "drugs", tmp_path, _fetcher([]), sleep=lambda s: None)
    path = tmp_path / "drugs" / ci.file_name("a")
    assert not list((tmp_path / "drugs").glob("*.tmp"))
    path.write_bytes(path.read_bytes()[:20])  # simulate truncated file
    calls = []
    res = ci.download_all({"a": U + "1"}, "drugs", tmp_path, _fetcher(calls), sleep=lambda s: None)
    assert calls == [U + "1"] and res["a"] and Image.open(path).format == "WEBP"


def test_write_atomic_failure_keeps_old_content(tmp_path, monkeypatch):
    f = tmp_path / "images.json"
    f.write_text("old")

    def boom(*a):
        raise OSError("x")

    monkeypatch.setattr(ci.os, "replace", boom)
    with pytest.raises(OSError):
        ci._write_atomic(f, b"new")
    assert f.read_text() == "old"


def test_run_partial_failure_does_not_downgrade_old_pharmacy_entry(tmp_path):
    d = _data(tmp_path)
    img = tmp_path / "img"
    (img / "pharmacies").mkdir(parents=True)
    (img / "pharmacies" / "old.webp").write_bytes(ci.to_webp(_img()))
    (d / "images.json").write_text(json.dumps({"drugs": {}, "pharmacies": {"p0": "/static/images/pharmacies/old.webp"}}))
    rc = ci.run(d, img, fetch=_fetcher([], fail={U + "pu"}), shop_sources=lambda: {"p0": U + "pu"}, sleep=lambda s: None)
    m = json.loads((d / "images.json").read_text())
    assert rc == 0 and m["pharmacies"]["p0"] == "/static/images/pharmacies/old.webp"


def test_run_old_pharmacy_entry_dropped_if_file_gone(tmp_path):
    d = _data(tmp_path)
    (d / "images.json").write_text(json.dumps({"drugs": {}, "pharmacies": {"p0": "/static/images/pharmacies/gone.webp"}}))
    ci.run(d, tmp_path / "img", fetch=_fetcher([], fail={U + "pu"}), shop_sources=lambda: {"p0": U + "pu"}, sleep=lambda s: None)
    assert json.loads((d / "images.json").read_text())["pharmacies"]["p0"] is None
