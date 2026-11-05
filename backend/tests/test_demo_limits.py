import pytest

from app.models import MasterDrug, Order


@pytest.fixture(autouse=True)
def fresh_demo_limits():
    from app.demo_limits import _hits, _lock
    with _lock:
        for hits in _hits.values():
            hits.clear()
    yield
    with _lock:
        for hits in _hits.values():
            hits.clear()


def test_public_demo_analysis_limit_is_shared_and_stops_before_gemini(client, fake_gemini, monkeypatch):
    monkeypatch.setenv("PUBLIC_DEMO", "1")
    calls = []
    def fake(_text, _image, _mime):
        calls.append(1)
        return {"status": "REJECTED_NOT_RX", "raw_text": "", "items": []}
    fake_gemini(ValueError("unexpected Gemini request"))
    from app import ai
    monkeypatch.setattr(ai, "call_gemini", fake)
    for i in range(30):
        r = client.post("/prescriptions/analyze", files={"image": ("sample.png", b"image", "image/png")}, headers={"X-Forwarded-For": f"203.0.113.{i}"})
        assert r.status_code == 200
    blocked = client.post("/prescriptions/analyze", files={"image": ("sample.png", b"image", "image/png")}, headers={"X-Forwarded-For": "198.51.100.1"})
    assert blocked.status_code == 429
    assert "demo" in blocked.json()["detail"].lower()
    assert len(calls) == 30


def test_public_demo_rejects_bad_image_without_using_quota(client, fake_gemini, monkeypatch):
    monkeypatch.setenv("PUBLIC_DEMO", "1")
    fake_gemini({"status": "UNREADABLE", "raw_text": "", "items": []})
    for _ in range(31):
        assert client.post("/prescriptions/analyze", files={"image": ("x.gif", b"GIF", "image/gif")}).status_code == 400
    assert client.post("/prescriptions/analyze", files={"image": ("x.png", b"image", "image/png")}).status_code == 200


def test_public_demo_order_limit_stops_insertion(client, db, monkeypatch):
    monkeypatch.setenv("PUBLIC_DEMO", "1")
    item = db.query(MasterDrug).filter_by(name="Vitamin C 1000mg").one()
    body = {"pharmacy_id": 1, "items": [{"drug_id": item.id, "quantity": 1}]}
    for i in range(30):
        assert client.post("/orders", json=body, headers={"X-Forwarded-For": f"192.0.2.{i}"}).status_code == 201
    r = client.post("/orders", json=body, headers={"X-Forwarded-For": "198.51.100.22"})
    assert r.status_code == 429
    assert db.query(Order).count() == 30


def test_local_mode_does_not_limit_orders(client, db, monkeypatch):
    monkeypatch.delenv("PUBLIC_DEMO", raising=False)
    item = db.query(MasterDrug).filter_by(name="Vitamin C 1000mg").one()
    body = {"pharmacy_id": 1, "items": [{"drug_id": item.id, "quantity": 1}]}
    assert all(client.post("/orders", json=body).status_code == 201 for _ in range(31))
