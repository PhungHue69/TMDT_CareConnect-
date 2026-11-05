import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.locations import _province_key as _pk
from app.locations import _sort_key
from app.locations import build_locations, parse_address
from app.main import app
from app.models import MasterDrug, Pharmacy, PharmacyStock
from scripts.seed import DEFAULT_DATA_DIR, seed


def _snapshot(db):
    return sorted((s.pharmacy_id, s.drug_id, s.quantity) for s in db.query(PharmacyStock))


def _set_stock(db, rows):
    """rows: [(pharmacy_id, drug_id, qty)] replaces all stock."""
    db.query(PharmacyStock).delete()
    db.add_all(PharmacyStock(pharmacy_id=p, drug_id=d, quantity=q) for p, d, q in rows)
    db.commit()


@pytest.fixture(scope="module")
def real_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, autoflush=False)()
    seed(s, DEFAULT_DATA_DIR)
    yield s
    s.close()
    engine.dispose()


@pytest.fixture
def real_client(real_db):
    app.dependency_overrides[get_db] = lambda: real_db
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------- seed ----------

def test_seed_stock_rules(db):
    cat = {d.id: d.category for d in db.query(MasterDrug)}
    rows = db.query(PharmacyStock).all()
    assert rows
    for r in rows:
        assert r.quantity >= 1
        assert (1 <= r.quantity <= 20) if cat[r.drug_id] == "RX" else (5 <= r.quantity <= 50)
    pairs = [(r.pharmacy_id, r.drug_id) for r in rows]
    assert len(pairs) == len(set(pairs))


def test_seed_stock_idempotent_and_deterministic(db):
    before = _snapshot(db)
    seed(db, DEFAULT_DATA_DIR.parent / "tests" / "fixtures")
    assert _snapshot(db) == before


def test_real_seed_stock_distribution(real_db):
    cat = {d.id: d.category for d in real_db.query(MasterDrug)}
    n_ph = real_db.query(Pharmacy).count()
    rows = real_db.query(PharmacyStock).all()
    rx = [r for r in rows if cat[r.drug_id] == "RX"]
    other = [r for r in rows if cat[r.drug_id] != "RX"]
    n_rx = sum(1 for c in cat.values() if c == "RX")
    n_other = len(cat) - n_rx
    assert 0.25 < len(rx) / (n_ph * n_rx) < 0.45
    assert 0.7 < len(other) / (n_ph * n_other) < 0.9


def test_lifedovate_is_rx():
    d = next(x for x in json.loads((DEFAULT_DATA_DIR / "drugs.json").read_text(encoding="utf-8"))
             if x["name"].startswith("LIFEDOVATE"))
    assert d["category"] == "RX" and d["price"] == 0


# ---------- locations: pure ----------

def test_parse_address():
    assert parse_address("831 Cách Mạng Tháng Tám, P. Thủ Dầu Một, TP. Hồ Chí Minh") == ("TP. Hồ Chí Minh", "P. Thủ Dầu Một")
    assert parse_address("Khu Đoàn Kết, X. Kim Bôi, Tỉnh Phú Thọ") == ("Tỉnh Phú Thọ", "X. Kim Bôi")
    assert parse_address("x, P.  Kinh Bắc, Tỉnh Bắc Ninh") == ("Tỉnh Bắc Ninh", "P. Kinh Bắc")
    assert parse_address("12 Foo, Q1, TP.HCM") == ("TP.HCM", None)  # not a ward-like part
    assert parse_address("nowhere") is None
    assert parse_address("") is None


def test_build_locations_basic():
    rows = [
        ("a, P. B, Tỉnh Z", 10.0, 100.0),
        ("a, P. B, Tỉnh Z", 12.0, 102.0),
        ("a, X. A, Tỉnh Z", 11.0, 101.0),
        ("a, X. Q, TP. Hồ Chí Minh", 5.0, 50.0),
        ("a, P. Gia Định, Hồ Chí Minh", 7.0, 70.0),  # prefix-less variant merges into HCM
        ("garbage", 1.0, 1.0),
    ]
    out = build_locations(rows)
    assert [o["province"] for o in out] == ["TP. Hồ Chí Minh", "Tỉnh Z"]
    hcm, z = out
    assert [w["ward"] for w in hcm["wards"]] == ["P. Gia Định", "X. Q"]
    assert (hcm["lat"], hcm["lng"]) == (6.0, 60.0)
    assert [w["ward"] for w in z["wards"]] == ["P. B", "X. A"]
    assert z["wards"][0]["lat"] == 11.0 and z["wards"][0]["lng"] == 101.0
    assert (z["lat"], z["lng"]) == (11.0, 101.0)


def test_build_locations_vietnamese_sort():
    rows = [(f"a, {w}, {p}", 10.0, 106.0) for w, p in [
        ("P. Đông Sơn", "TP. Đà Nẵng"), ("P. Ba", "Tỉnh Đồng Tháp"), ("P. Điện", "Tỉnh Đồng Tháp"),
        ("P. Cẩm", "Tỉnh Đồng Tháp"), ("P. An", "Tỉnh Cao Bằng"), ("P. X", "Tỉnh Bắc Ninh"),
        ("P. Y", "TP. Hồ Chí Minh"), ("P. Z", "TP. Hà Nội"),
    ]]
    out = build_locations(rows)
    names = [o["province"] for o in out]
    assert names[0] == "TP. Hồ Chí Minh"
    # keys: bac ninh, cao bang, da nang, dong thap, ha noi
    assert names[1:] == ["Tỉnh Bắc Ninh", "Tỉnh Cao Bằng", "TP. Đà Nẵng", "Tỉnh Đồng Tháp", "TP. Hà Nội"]
    dt = next(o for o in out if o["province"] == "Tỉnh Đồng Tháp")
    assert [w["ward"] for w in dt["wards"]] == ["P. Ba", "P. Cẩm", "P. Điện"]


def test_build_locations_ward_less_counts_for_province_only():
    out = build_locations([("1 Lê Lợi, Q1, TP.HCM", 10.0, 106.0)])
    assert out[0]["wards"] == [] and out[0]["lat"] == 10.0


# ---------- locations: real data ----------

def _real_rows():
    ps = json.loads((DEFAULT_DATA_DIR / "pharmacies.json").read_text(encoding="utf-8"))
    return ps, [(p["address"], p["latitude"], p["longitude"]) for p in ps]


def test_real_locations():
    ps, rows = _real_rows()
    out = build_locations(rows)
    assert out[0]["province"] == "TP. Hồ Chí Minh"
    names = [o["province"] for o in out]
    assert len(names) == len(set(names))
    assert sum(1 for p in ps if parse_address(p["address"])) / len(ps) >= 0.95
    by_ward: dict = {}
    by_prov: dict = {}
    for addr, lat, lng in rows:
        parsed = parse_address(addr)
        if not parsed:
            continue
        by_prov.setdefault(parsed[0], []).append((lat, lng))
        if parsed[1]:
            by_ward.setdefault((parsed[0], parsed[1]), []).append((lat, lng))
    for o in out:
        assert [w["ward"] for w in o["wards"]] == sorted((w["ward"] for w in o["wards"]), key=_sort_key)
        assert o["wards"]
        # province bbox: members may use prefix variants; look up by suffix-insensitive name
        pts = [pt for k, v in by_prov.items() if _pk(k) == _pk(o["province"]) for pt in v]
        assert min(p[0] for p in pts) <= o["lat"] <= max(p[0] for p in pts)
        assert min(p[1] for p in pts) <= o["lng"] <= max(p[1] for p in pts)
        for w in o["wards"]:
            wp = [pt for (k, wn), v in by_ward.items() if wn == w["ward"]
                  and _pk(k) == _pk(o["province"]) for pt in v]
            assert wp
            assert min(p[0] for p in wp) - 1e-9 <= w["lat"] <= max(p[0] for p in wp) + 1e-9
            assert min(p[1] for p in wp) - 1e-9 <= w["lng"] <= max(p[1] for p in wp) + 1e-9


def test_locations_endpoint(real_client):
    r = real_client.get("/locations")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["province"] == "TP. Hồ Chí Minh"
    assert set(body[0]) == {"province", "lat", "lng", "wards"}
    assert set(body[0]["wards"][0]) == {"ward", "lat", "lng"}


# ---------- pharmacy detail ----------

def test_pharmacy_detail_returns_real_data_and_unknown_id_is_404(client, db):
    pharmacy = db.query(Pharmacy).filter_by(name="Nhà thuốc A").one()
    response = client.get(f"/pharmacies/{pharmacy.id}")
    assert response.status_code == 200
    assert response.json()["id"] == pharmacy.id
    assert response.json()["name"] == pharmacy.name
    assert response.json()["address"] == pharmacy.address
    assert client.get("/pharmacies/999999").status_code == 404


# ---------- pharmacy products ----------

def test_pharmacy_products_filters_and_paginates_deterministically(client, db):
    pharmacy = db.query(Pharmacy).filter_by(name="Nhà thuốc A").one()
    drugs = db.query(MasterDrug).order_by(MasterDrug.id).all()
    otc = next(d for d in drugs if d.category == "OTC")
    tpcn = next(d for d in drugs if d.category == "TPCN")
    rx = next(d for d in drugs if d.category == "RX")
    _set_stock(db, [(pharmacy.id, otc.id, 4), (pharmacy.id, tpcn.id, 6), (pharmacy.id, rx.id, 9)])

    response = client.get(f"/pharmacies/{pharmacy.id}/products?page=1&limit=1")

    assert response.status_code == 200
    result = response.json()
    assert result["total"] == 2
    assert (result["page"], result["limit"]) == (1, 1)
    assert len(result["items"]) == 1
    assert result["items"][0]["id"] == min(otc.id, tpcn.id)
    assert result["items"][0]["stock_quantity"] == (4 if otc.id < tpcn.id else 6)
    assert set(result["items"][0]) == {
        "id", "name", "active_ingredient", "category", "unit", "price", "image_url", "stock_quantity"
    }


def test_pharmacy_products_category_filter_counts_only_that_group(client, db):
    pharmacy = db.query(Pharmacy).filter_by(name="Nhà thuốc A").one()
    drugs = db.query(MasterDrug).order_by(MasterDrug.id).all()
    otc = next(d for d in drugs if d.category == "OTC")
    tpcn = next(d for d in drugs if d.category == "TPCN")
    _set_stock(db, [(pharmacy.id, otc.id, 4), (pharmacy.id, tpcn.id, 6)])

    only_tpcn = client.get(f"/pharmacies/{pharmacy.id}/products?category=TPCN").json()
    assert [item["id"] for item in only_tpcn["items"]] == [tpcn.id]
    assert only_tpcn["total"] == 1
    assert client.get(f"/pharmacies/{pharmacy.id}/products?category=RX").status_code == 422


def test_pharmacy_products_unknown_pharmacy_returns_404(client):
    assert client.get("/pharmacies/999999/products").status_code == 404


def test_pharmacy_products_search_filters_name_and_only_keeps_in_stock_nonrx(client, db):
    pharmacy = db.query(Pharmacy).filter_by(name="Nhà thuốc A").one()
    otc = db.query(MasterDrug).filter_by(name="Paracetamol 500mg").one()
    rx = db.query(MasterDrug).filter_by(name="Amoxicillin 500mg").one()
    _set_stock(db, [(pharmacy.id, otc.id, 3), (pharmacy.id, rx.id, 5)])
    r = client.get(f"/pharmacies/{pharmacy.id}/products?q=Paracetamol")
    assert r.status_code == 200
    assert [item["id"] for item in r.json()["items"]] == [otc.id]
    assert client.get(f"/pharmacies/{pharmacy.id}/products?q=Amoxicillin").json()["items"] == []


# ---------- with-stock ----------

def test_with_stock_fixture_all_drugs(client, db):
    ph = {p.name: p.id for p in db.query(Pharmacy)}
    dr = {d.name: d.id for d in db.query(MasterDrug)}
    a, b, c = ph["Nhà thuốc A"], ph["Nhà thuốc B"], ph["Nhà thuốc C"]
    d1, d2 = dr["Paracetamol 500mg"], dr["Loratadin 10mg"]
    _set_stock(db, [(a, d1, 5), (a, d2, 7), (b, d1, 9), (c, d1, 3), (c, d2, 4)])
    r = client.get(f"/pharmacies/with-stock?lat=10.7769&lng=106.7009&drug_ids={d1},{d2}")
    assert r.status_code == 200
    body = r.json()
    assert [p["id"] for p in body] == [a, c]  # B lacks d2; sorted by distance
    assert set(body[0]) == {"id", "name", "address", "latitude", "longitude", "phone", "distance_km", "image_url", "items"}
    assert body[0]["distance_km"] <= body[1]["distance_km"]
    assert sorted((i["drug_id"], i["quantity"]) for i in body[0]["items"]) == sorted([(d1, 5), (d2, 7)])
    # single drug: all three
    r = client.get(f"/pharmacies/with-stock?lat=10.7769&lng=106.7009&drug_ids={d1}")
    assert sorted(p["id"] for p in r.json()) == sorted([a, b, c])
    assert [p["distance_km"] for p in r.json()] == sorted(p["distance_km"] for p in r.json())


def test_with_stock_nobody_stocks(client, db):
    d = db.query(MasterDrug).first().id
    _set_stock(db, [])
    r = client.get(f"/pharmacies/with-stock?lat=10&lng=106&drug_ids={d}")
    assert r.status_code == 200 and r.json() == []


def test_with_stock_limit(client, db):
    d = db.query(MasterDrug).first().id
    _set_stock(db, [(p.id, d, 5) for p in db.query(Pharmacy)])
    r = client.get(f"/pharmacies/with-stock?lat=10&lng=106&drug_ids={d}&limit=2")
    assert len(r.json()) == 2


def test_with_stock_int32_max_is_unknown_404(client):
    assert client.get(f"/pharmacies/with-stock?lat=10&lng=106&drug_ids={2**31 - 1}").status_code == 404


@pytest.mark.parametrize("big", [str(2**31), str(2**63), "9" * 30, "9" * 5000, "0" * 5000 + "1"])
def test_with_stock_huge_id_422_not_500(client, big):
    assert client.get(f"/pharmacies/with-stock?lat=10&lng=106&drug_ids={big}").status_code == 422
    assert client.get(f"/pharmacies/with-stock?lat=10&lng=106&drug_ids=1,{big}").status_code == 422


def test_with_stock_unknown_drug_404(client, db):
    d = db.query(MasterDrug).first().id
    assert client.get(f"/pharmacies/with-stock?lat=10&lng=106&drug_ids={d},99999").status_code == 404


@pytest.mark.parametrize("qs", [
    "lat=10&lng=106",  # drug_ids missing
    "lat=10&lng=106&drug_ids=",
    "lat=10&lng=106&drug_ids=abc",
    "lat=10&lng=106&drug_ids=1,,2",
    "lat=10&lng=106&drug_ids=0",
    "lat=10&lng=106&drug_ids=-1",
    "lat=10&lng=106&drug_ids=1.5",
    "lat=10&lng=106&drug_ids=1,1",
    "lat=10&lng=106&drug_ids=" + ",".join(str(i) for i in range(1, 22)),
    "lat=91&lng=106&drug_ids=1",
    "lat=-91&lng=106&drug_ids=1",
    "lat=10&lng=181&drug_ids=1",
    "lat=10&lng=-181&drug_ids=1",
    "lat=10&lng=106&drug_ids=1&limit=0",
    "lat=10&lng=106&drug_ids=1&limit=101",
    "lng=106&drug_ids=1",
    "lat=10&drug_ids=1",
])
def test_with_stock_422(client, qs):
    assert client.get(f"/pharmacies/with-stock?{qs}").status_code == 422


def test_with_stock_real_data(real_client, real_db):
    otc = [d.id for d in real_db.query(MasterDrug).filter(MasterDrug.category == "OTC").order_by(MasterDrug.id).limit(3)]
    r = real_client.get(f"/pharmacies/with-stock?lat=10.97&lng=106.66&drug_ids={','.join(map(str, otc))}&limit=100")
    assert r.status_code == 200
    body = r.json()
    assert body  # 0.8**3 * 100 pharmacies ~ 51
    stock = {(s.pharmacy_id, s.drug_id): s.quantity for s in real_db.query(PharmacyStock)}
    for p in body:
        assert {i["drug_id"] for i in p["items"]} == set(otc)
        for i in p["items"]:
            assert stock[(p["id"], i["drug_id"])] == i["quantity"] >= 1
    expected = {p.id for p in real_db.query(Pharmacy) if all((p.id, d) in stock for d in otc)}
    assert {p["id"] for p in body} == expected
    assert [p["distance_km"] for p in body] == sorted(p["distance_km"] for p in body)


def test_nearby_unchanged(client):
    r = client.get("/pharmacies/nearby?lat=10.7769&lng=106.7009")
    assert r.status_code == 200 and "items" not in r.json()[0]
