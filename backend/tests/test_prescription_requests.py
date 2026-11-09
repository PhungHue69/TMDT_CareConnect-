from io import BytesIO
from pathlib import Path

from PIL import Image

from app.models import Pharmacy, PrescriptionRequest

URL = "/prescriptions/requests"


def png_image():
    out = BytesIO()
    Image.new("RGB", (120, 80), "white").save(out, format="PNG")
    return ("rx.png", out.getvalue(), "image/png")


def setup_classifier(monkeypatch, result="IDENTIFIABLE_RX"):
    from app import ai

    monkeypatch.setattr(ai, "classify_prescription_image", lambda data, mime: result)


def test_selected_pharmacy_request_saves_private_image_and_pending_row(client, db, monkeypatch, tmp_path):
    pharmacy = db.query(Pharmacy).first()
    setup_classifier(monkeypatch)
    from app import prescriptions

    monkeypatch.setattr(prescriptions, "PRESCRIPTION_STORAGE_DIR", tmp_path)
    response = client.post(URL, data={"pharmacy_id": str(pharmacy.id)}, files={"image": png_image()})
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "pharmacy_id", "status"}
    assert body["pharmacy_id"] == pharmacy.id and body["status"] == "PENDING_PHARMACIST"
    row = db.query(PrescriptionRequest).one()
    saved = Path(row.image_path)
    assert saved.exists() and saved.parent == tmp_path and saved.suffix == ".png"
    assert "/static/" not in str(saved)


def test_retry_same_request_id_does_not_create_duplicate_or_reclassify(client, db, monkeypatch, tmp_path):
    from app import prescriptions, ai
    pharmacy = db.query(Pharmacy).first()
    monkeypatch.setattr(prescriptions, "PRESCRIPTION_STORAGE_DIR", tmp_path)
    calls = []
    monkeypatch.setattr(ai, "classify_prescription_image", lambda data, mime: calls.append(1) or "IDENTIFIABLE_RX")
    form = {"pharmacy_id": str(pharmacy.id), "request_key": "retry-test-1"}
    first = client.post(URL, data=form, files={"image": png_image()})
    second = client.post(URL, data=form, files={"image": png_image()})
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert db.query(PrescriptionRequest).count() == 1
    assert len(list(tmp_path.iterdir())) == 1
    assert len(calls) == 1


def test_same_key_cannot_be_reused_for_a_different_pharmacy(client, db, monkeypatch, tmp_path):
    from app import prescriptions
    setup_classifier(monkeypatch)
    monkeypatch.setattr(prescriptions, "PRESCRIPTION_STORAGE_DIR", tmp_path)
    pharmacies = db.query(Pharmacy).limit(2).all()
    first = client.post(URL, data={"pharmacy_id": str(pharmacies[0].id), "request_key": "same-key"}, files={"image": png_image()})
    second = client.post(URL, data={"pharmacy_id": str(pharmacies[1].id), "request_key": "same-key"}, files={"image": png_image()})
    assert first.status_code == 201
    assert second.status_code == 409
    assert db.query(PrescriptionRequest).count() == 1


def test_rejected_image_not_persisted(client, db, monkeypatch, tmp_path):
    setup_classifier(monkeypatch, "SYMPTOM_NOTE")
    from app import prescriptions

    monkeypatch.setattr(prescriptions, "PRESCRIPTION_STORAGE_DIR", tmp_path)
    pharmacy = db.query(Pharmacy).first()
    response = client.post(URL, data={"pharmacy_id": str(pharmacy.id)}, files={"image": png_image()})
    assert response.status_code == 422
    assert response.json()["detail"] == "Đây không phải đơn thuốc"
    assert db.query(PrescriptionRequest).count() == 0
    assert list(tmp_path.iterdir()) == []


def test_unreadable_image_not_persisted(client, db, monkeypatch, tmp_path):
    setup_classifier(monkeypatch, "UNREADABLE")
    from app import prescriptions

    monkeypatch.setattr(prescriptions, "PRESCRIPTION_STORAGE_DIR", tmp_path)
    pharmacy = db.query(Pharmacy).first()
    response = client.post(URL, data={"pharmacy_id": str(pharmacy.id)}, files={"image": png_image()})
    assert response.status_code == 422
    assert response.json()["detail"] == "Ảnh không rõ. Vui lòng chụp lại đơn thuốc."
    assert db.query(PrescriptionRequest).count() == 0
    assert list(tmp_path.iterdir()) == []


def test_upload_must_be_valid_image_even_if_mime_claims_image(client, db, monkeypatch, tmp_path):
    setup_classifier(monkeypatch)
    pharmacy = db.query(Pharmacy).first()
    response = client.post(URL, data={"pharmacy_id": str(pharmacy.id)}, files={"image": ("fake.png", b"not an image", "image/png")})
    assert response.status_code == 400
    assert db.query(PrescriptionRequest).count() == 0


def test_unknown_pharmacy_rejected(client, db, monkeypatch, tmp_path):
    setup_classifier(monkeypatch)
    response = client.post(URL, data={"pharmacy_id": "999999"}, files={"image": png_image()})
    assert response.status_code == 404
    assert db.query(PrescriptionRequest).count() == 0


def test_storage_failure_leaves_no_request_row(client, db, monkeypatch, tmp_path):
    setup_classifier(monkeypatch)
    from app import prescriptions

    blocked_path = tmp_path / "not-a-directory"
    blocked_path.write_text("block", encoding="utf-8")
    monkeypatch.setattr(prescriptions, "PRESCRIPTION_STORAGE_DIR", blocked_path)
    pharmacy = db.query(Pharmacy).first()
    response = client.post(URL, data={"pharmacy_id": str(pharmacy.id)}, files={"image": png_image()})
    assert response.status_code >= 500
    assert db.query(PrescriptionRequest).count() == 0
