import httpx
import pytest

from app import ratings
from app.models import Pharmacy


@pytest.fixture(autouse=True)
def clean_cache():
    ratings.CACHE.clear()


@pytest.fixture
def fake_google(monkeypatch):
    seen = []

    def install(body, status=200):
        def handler(request):
            seen.append(request)
            return httpx.Response(status, json=body)

        monkeypatch.setattr(ratings, "client", lambda: httpx.Client(transport=httpx.MockTransport(handler), timeout=5))
        monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test-google-key")
        return seen

    return install


def place_near(pharmacy, rating=4.6, count=98, dlat=0.0):
    return {
        "places": [
            {
                "rating": rating,
                "userRatingCount": count,
                "googleMapsUri": "https://maps.google.com/?cid=1",
                "location": {"latitude": pharmacy.latitude + dlat, "longitude": pharmacy.longitude},
            }
        ]
    }


def test_rating_returns_google_data_for_a_matching_place(client, db, fake_google):
    pharmacy = db.query(Pharmacy).first()
    seen = fake_google(place_near(pharmacy))
    response = client.get(f"/pharmacies/{pharmacy.id}/rating")
    assert response.status_code == 200
    assert response.json() == {"rating": 4.6, "count": 98, "url": "https://maps.google.com/?cid=1"}
    assert seen[0].headers["X-Goog-Api-Key"] == "test-google-key"
    assert "places.rating" in seen[0].headers["X-Goog-FieldMask"]


def test_rating_ignores_a_result_far_from_the_pharmacy(client, db, fake_google):
    pharmacy = db.query(Pharmacy).first()
    fake_google(place_near(pharmacy, dlat=0.05))  # ~5 km away: a different store
    assert client.get(f"/pharmacies/{pharmacy.id}/rating").json() == {"rating": None, "count": None, "url": None}


def test_rating_is_empty_without_an_api_key(client, db, monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.setattr(ratings, "ENV_FILE", ratings.ENV_FILE.with_name("missing.env"))
    pharmacy = db.query(Pharmacy).first()
    assert client.get(f"/pharmacies/{pharmacy.id}/rating").json() == {"rating": None, "count": None, "url": None}


def test_rating_survives_a_google_error(client, db, fake_google):
    pharmacy = db.query(Pharmacy).first()
    fake_google({"error": {"message": "denied"}}, status=403)
    assert client.get(f"/pharmacies/{pharmacy.id}/rating").json() == {"rating": None, "count": None, "url": None}


def test_rating_is_cached_per_pharmacy(client, db, fake_google):
    pharmacy = db.query(Pharmacy).first()
    seen = fake_google(place_near(pharmacy))
    client.get(f"/pharmacies/{pharmacy.id}/rating")
    client.get(f"/pharmacies/{pharmacy.id}/rating")
    assert len(seen) == 1


def test_rating_unknown_pharmacy_is_404(client):
    assert client.get("/pharmacies/999999/rating").status_code == 404
