"""Live AI guardrail eval. Run from backend/: python -m scripts.eval_ai
Exit: 0 all invalid samples blocked, 1 some not blocked, 2 no GEMINI_API_KEY.
Images (testdata/images/*) are measure-only."""
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import ai, models  # noqa: F401  (models registers tables)
from app.db import Base
from scripts.seed import seed

ROOT = Path(__file__).resolve().parent.parent
INVALID = ROOT / "testdata" / "invalid_requests.txt"
IMAGES_DIR = ROOT / "testdata" / "images"
FIXTURES = ROOT / "tests" / "fixtures"
MIMES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

def _session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=False)()
    seed(db, FIXTURES)
    return db

def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set; cannot run live eval.")
        return 2

    db = _session()
    lines = [x.strip() for x in INVALID.read_text(encoding="utf-8").splitlines() if x.strip()]
    blocked = 0
    for i, line in enumerate(lines, 1):
        status = ai.analyze_input(db, text=line, image=None, mime=None)["status"]
        ok = status == "REJECTED_NOT_RX"
        blocked += ok
        tag = "OK" if ok else ("ERROR" if status == "UNREADABLE" else "FAIL")  # UNREADABLE = API/key failure
        print(f"[{tag}] {i:2d}. {status:16s} {line}")
    print(f"invalid blocked: {blocked}/{len(lines)}")

    images = sorted(p for p in IMAGES_DIR.glob("*") if p.suffix.lower() in MIMES) if IMAGES_DIR.is_dir() else []
    if not images:
        print("images: skipped")
    else:
        approved = 0
        for p in images:
            r = ai.analyze_input(db, text=None, image=p.read_bytes(), mime=MIMES[p.suffix.lower()])
            ok = r["status"] == "APPROVED" and r["can_unlock_rx"]
            approved += ok
            print(f"[{'OK' if ok else 'FAIL'}] {p.name}: {r['status']}")
        print(f"images approved: {approved}/{len(images)}")
    return 0 if blocked == len(lines) else 1

if __name__ == "__main__":
    sys.exit(main())
