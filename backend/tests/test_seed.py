from pathlib import Path

import pytest

from app.models import MasterDrug, Pharmacy, User
from scripts.seed import seed

DATA_DIR = Path(__file__).parent / "fixtures"


def test_seed_loads_fixture(db):
    assert db.query(Pharmacy).count() == 3
    assert {d.category for d in db.query(MasterDrug)} == {"RX", "OTC", "TPCN"}
    assert db.get(User, 1) is not None


def test_seed_is_idempotent(db):
    seed(db, DATA_DIR)
    seed(db, DATA_DIR)
    assert db.query(Pharmacy).count() == 3
    assert db.query(MasterDrug).count() == 4
    assert db.query(User).count() == 1


def test_fake_gemini(fake_gemini):
    fake_gemini({"ok": 1})
    import app.ai as ai

    assert ai.call_gemini() == {"ok": 1}
    fake_gemini(RuntimeError("x"))
    with pytest.raises(RuntimeError):
        ai.call_gemini()


def test_app_mounts(client):
    assert client.get("/openapi.json").status_code == 200


def test_seed_applies_image_manifest(tmp_path):
    import json
    import shutil

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.db import Base

    d = tmp_path / "d"
    shutil.copytree(DATA_DIR, d)
    drugs = json.loads((d / "drugs.json").read_text(encoding="utf-8"))
    pharm = json.loads((d / "pharmacies.json").read_text(encoding="utf-8"))
    (d / "images.json").write_text(json.dumps({
        "drugs": {drugs[0]["source_url"]: "/static/images/drugs/a.webp", drugs[1]["source_url"]: None},
        "pharmacies": {pharm[0]["source_url"]: "/static/images/pharmacies/p.webp"},
    }), encoding="utf-8")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    seed(s, d)
    seed(s, d)  # idempotent
    by_name = {x.name: x for x in s.query(MasterDrug)}
    assert by_name[drugs[0]["name"]].image_url == "/static/images/drugs/a.webp"
    assert by_name[drugs[1]["name"]].image_url == drugs[1]["image_url"]  # null entry keeps CDN fallback
    assert by_name[drugs[2]["name"]].image_url == drugs[2]["image_url"]  # missing entry keeps CDN
    ph = {x.name: x.image_url for x in s.query(Pharmacy)}
    assert ph[pharm[0]["name"]] == "/static/images/pharmacies/p.webp"
    assert ph[pharm[1]["name"]] is None
    assert s.query(Pharmacy).count() == 3


def test_seed_without_manifest_pharmacy_image_none(db):
    assert all(p.image_url is None for p in db.query(Pharmacy))
