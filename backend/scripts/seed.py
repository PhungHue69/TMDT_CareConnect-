import json
import random
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MasterDrug, Pharmacy, PharmacyStock, User

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def seed(session: Session, data_dir: Path) -> None:
    """Idempotent: wipe + reinsert pharmacies/drugs, upsert demo user 1.
    ponytail: ids regenerate on reseed; rerun before orders exist (demo only)."""
    data_dir = Path(data_dir)

    def load(name: str) -> list[dict]:
        return json.loads((data_dir / name).read_text(encoding="utf-8"))

    session.query(PharmacyStock).delete()
    session.query(Pharmacy).delete()
    session.query(MasterDrug).delete()
    manifest = json.loads((data_dir / "images.json").read_text(encoding="utf-8")) if (data_dir / "images.json").is_file() else {}
    pimg, dimg = manifest.get("pharmacies", {}), manifest.get("drugs", {})
    session.add_all(Pharmacy(**{**p, "image_url": pimg.get(p.get("source_url"))}) for p in load("pharmacies.json"))
    # drug: local path if manifest has one, else keep the CDN url as fallback
    session.add_all(MasterDrug(**{**d, "image_url": dimg.get(d.get("source_url")) or d.get("image_url")}) for d in load("drugs.json"))
    session.flush()
    # sample stock: fixed seed, ids ascending -> identical result every run
    rng = random.Random(42)
    drugs = session.execute(select(MasterDrug.id, MasterDrug.category).order_by(MasterDrug.id)).all()
    for pid in session.scalars(select(Pharmacy.id).order_by(Pharmacy.id)).all():
        for did, cat in drugs:
            p, lo, hi = (0.35, 1, 20) if cat == "RX" else (0.8, 5, 50)
            if rng.random() < p:
                session.add(PharmacyStock(pharmacy_id=pid, drug_id=did, quantity=rng.randint(lo, hi)))
    session.merge(User(id=1, full_name="Nguyễn Văn Demo", phone="0900000000"))
    session.commit()


if __name__ == "__main__":
    from app.db import Base, SessionLocal, engine

    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        seed(s, Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA_DIR)
