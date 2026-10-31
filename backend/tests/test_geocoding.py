import httpx
import pytest

from app import geocoding


@pytest.fixture
def fake_goong(monkeypatch):
    seen = []

    def install(responses):
        def handler(request):
            seen.append(request)
            return httpx.Response(200, json=responses.pop(0))

        monkeypatch.setattr(geocoding, "client", lambda: httpx.Client(transport=httpx.MockTransport(handler), timeout=5))
        monkeypatch.setenv("GOONG_API_KEY", "test-secret")
        return seen

    return install


def test_suggest_normalizes_predictions(client, fake_goong):
    seen = fake_goong([{"predictions": [{"place_id": "p-1", "description": "12 Nguyễn Huệ, TP HCM"}]}])
    response = client.get("/geocode/suggest", params={"q": "12 Nguyễn Huệ"})
    assert response.status_code == 200
    assert response.json() == {"suggestions": [{"place_id": "p-1", "description": "12 Nguyễn Huệ, TP HCM"}]}
    assert seen[0].url.path == "/place/autocomplete"
    assert seen[0].url.params["input"] == "12 Nguyễn Huệ"
    assert seen[0].url.params["api_key"] == "test-secret"


def test_resolve_returns_precise_location(client, fake_goong):
    seen = fake_goong([{"result": {"formatted_address": "12 Nguyễn Huệ, TP HCM", "geometry": {"location": {"lat": 10.77, "lng": 106.70}}}}])
    response = client.get("/geocode/resolve", params={"place_id": "p-1"})
    assert response.status_code == 200
    assert response.json() == {"lat": 10.77, "lng": 106.70, "label": "12 Nguyễn Huệ, TP HCM"}
    assert seen[0].url.path == "/Place/Detail"
    assert seen[0].url.params["placeid"] == "p-1"


def test_missing_key_does_not_guess_location(client, monkeypatch, tmp_path):
    monkeypatch.setattr(geocoding, "ENV_FILE", tmp_path / ".env")
    monkeypatch.delenv("GOONG_API_KEY", raising=False)
    response = client.get("/geocode/suggest", params={"q": "12 Nguyễn Huệ"})
    assert response.status_code == 503
    assert "GOONG_API_KEY" not in response.text


def test_key_can_be_loaded_from_backend_env_file(client, monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("GOONG_API_KEY=file-secret\n", encoding="utf-8")
    monkeypatch.setattr(geocoding, "ENV_FILE", env_file, raising=False)
    monkeypatch.delenv("GOONG_API_KEY", raising=False)
    monkeypatch.setattr(geocoding, "client", lambda: httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"predictions": []}))))
    response = client.get("/geocode/suggest", params={"q": "12 Nguyễn Huệ"})
    assert response.status_code == 200
    assert response.json() == {"suggestions": []}


def test_invalid_coordinates_are_rejected(client, fake_goong):
    fake_goong([{"result": {"formatted_address": "x", "geometry": {"location": {"lat": 91, "lng": 106}}}}])
    response = client.get("/geocode/resolve", params={"place_id": "p-1"})
    assert response.status_code == 502


def test_missing_result_does_not_crash(client, fake_goong):
    fake_goong([{"result": None}])
    response = client.get("/geocode/resolve", params={"place_id": "p-1"})
    assert response.status_code == 502


def test_short_address_does_not_call_provider(client, fake_goong):
    seen = fake_goong([])
    assert client.get("/geocode/suggest", params={"q": "a"}).status_code == 422
    assert client.get("/geocode/suggest", params={"q": "   "}).status_code == 422
    assert seen == []


def test_provider_error_with_http_200_is_not_reported_as_no_results(client, fake_goong):
    fake_goong([{"status": "INVALID_REQUEST", "error_message": "Invalid key", "predictions": []}])
    response = client.get("/geocode/suggest", params={"q": "12 Nguyễn Huệ"})
    assert response.status_code == 502
    assert "Invalid key" not in response.text


def test_provider_timeout_is_actionable_and_hides_key(client, monkeypatch):
    monkeypatch.setenv("GOONG_API_KEY", "test-secret")

    def timeout(request):
        raise httpx.ReadTimeout("test-secret", request=request)

    monkeypatch.setattr(geocoding, "client", lambda: httpx.Client(transport=httpx.MockTransport(timeout), timeout=5))
    response = client.get("/geocode/suggest", params={"q": "12 Nguyễn Huệ"})
    assert response.status_code == 502
    assert "test-secret" not in response.text
