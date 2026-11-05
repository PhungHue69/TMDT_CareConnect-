import json
from pathlib import Path

from app.models import MasterDrug, Pharmacy

DATA = Path(__file__).parent.parent / "data"

def _load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))

def _fits(rows, model):
    for r in rows:
        for k, v in r.items():
            n = getattr(getattr(model, k).property.columns[0].type, "length", None)
            if isinstance(v, str) and n:
                assert len(v) <= n, (k, len(v), n)

def test_drugs_valid():
    rows = _load("drugs.json")
    assert len(rows) >= 1
    for r in rows:
        assert r["category"] in {"RX", "OTC", "TPCN"}
        assert isinstance(r["price"], int) and r["price"] >= 0
        if r["category"] == "RX":
            assert r["price"] == 0  # site hides Rx prices: 0 sentinel
    urls = [r["source_url"] for r in rows]
    assert len(urls) == len(set(urls))
    _fits(rows, MasterDrug)

def test_pharmacies_valid():
    rows = _load("pharmacies.json")
    assert len(rows) >= 1
    for r in rows:
        assert 8 <= r["latitude"] <= 24 and 102 <= r["longitude"] <= 110
    urls = [r["source_url"] for r in rows]
    assert len(urls) == len(set(urls))
    _fits(rows, Pharmacy)


def test_image_manifest_consistent():
    static = DATA.parent / "static"
    m = _load("images.json")
    assert {d["source_url"] for d in _load("drugs.json")} <= set(m["drugs"])
    assert {p["source_url"] for p in _load("pharmacies.json")} <= set(m["pharmacies"])
    for section in m.values():
        for path in filter(None, section.values()):
            assert path.startswith("/static/images/") and (static / path.removeprefix("/static/")).is_file(), path
    for n in ("default-drug.webp", "default-pharmacy.webp"):
        assert (static / "images" / n).is_file()
