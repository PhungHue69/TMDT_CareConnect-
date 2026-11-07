import pytest

from app.geo import haversine_km


def test_allowed_origins_env(monkeypatch):
    from app.main import allowed_origins

    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    assert allowed_origins() == ["http://localhost:3000"]
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://a.com, http://b.com:3001,")
    assert allowed_origins() == ["http://a.com", "http://b.com:3001"]


def test_haversine_hcm_hanoi():
    assert 1130 < haversine_km(10.7769, 106.7009, 21.0285, 105.8542) < 1150


def test_nearby_sorted(client):
    r = client.get("/pharmacies/nearby", params={"lat": 10.7769, "lng": 106.7009}).json()
    assert len(r) == 3
    assert [p["distance_km"] for p in r] == sorted(p["distance_km"] for p in r)
    assert set(r[0]) == {"id", "name", "address", "latitude", "longitude", "phone", "distance_km", "image_url"}


def test_nearby_limit(client):
    r = client.get("/pharmacies/nearby", params={"lat": 10.7769, "lng": 106.7009, "limit": 1}).json()
    assert len(r) == 1


@pytest.mark.parametrize(
    "params",
    [
        {"lat": 200, "lng": 0},
        {"lat": -91, "lng": 0},
        {"lat": 0, "lng": 181},
        {"lat": 0, "lng": 0, "limit": 0},
        {"lat": 0, "lng": 0, "limit": 101},
    ],
)
def test_nearby_bad_params(client, params):
    assert client.get("/pharmacies/nearby", params=params).status_code == 422


def test_drugs_all(client):
    r = client.get("/drugs").json()
    assert len(r) == 4
    assert set(r[0]) == {"id", "name", "active_ingredient", "category", "unit", "price", "image_url"}


def test_drugs_filter(client):
    r = client.get("/drugs?category=OTC").json()
    assert r and all(d["category"] == "OTC" for d in r)


def test_drugs_q_case_insensitive(client):
    name = client.get("/drugs").json()[0]["name"]
    r = client.get("/drugs", params={"q": name.upper()}).json()
    assert any(d["name"] == name for d in r)
    assert client.get("/drugs", params={"q": "zzz-no-such"}).json() == []

def test_invalid_category_422(client):
    assert client.get("/drugs", params={"category": "BOGUS"}).status_code == 422

def test_category_and_q_combined(client):
    r = client.get("/drugs", params={"category": "OTC", "q": "para"}).json()
    assert [d["name"] for d in r] == ["Paracetamol 500mg"]
    assert client.get("/drugs", params={"category": "RX", "q": "para"}).json() == []

def test_allowed_origins_env(monkeypatch):
    from app.main import allowed_origins
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    assert allowed_origins() == ["http://localhost:3000"]
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://a.com, http://b.com:3001,")
    assert allowed_origins() == ["http://a.com", "http://b.com:3001"]


def test_static_default_images(client):
    for kind in ("drug", "pharmacy"):
        r = client.get(f"/static/images/default-{kind}.webp")
        assert r.status_code == 200 and r.headers["content-type"] == "image/webp"

def test_pharmacy_image_url_in_nearby_and_with_stock(client, db):
    from app.models import Pharmacy

    first = db.query(Pharmacy).order_by(Pharmacy.id).first()
    first.image_url = "/static/images/pharmacies/x.webp"
    db.commit()
    r = client.get("/pharmacies/nearby", params={"lat": 10.7769, "lng": 106.7009}).json()
    imgs = {p["id"]: p["image_url"] for p in r}
    assert imgs[first.id] == "/static/images/pharmacies/x.webp"
    assert [v for k, v in imgs.items() if k != first.id] == [None, None]
    ws = client.get("/pharmacies/with-stock", params={"lat": 10.7769, "lng": 106.7009, "drug_ids": "2"}).json()
    assert ws and all("image_url" in p for p in ws)
