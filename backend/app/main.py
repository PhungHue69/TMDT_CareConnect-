import mimetypes
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import catalog, geocoding, models, orders, prescriptions, ratings  # noqa: F401  (models registers tables)
from app.db import Base, engine
from app.request_migration import ensure_request_retry_columns

mimetypes.add_type("image/webp", ".webp")  # not in every OS mime table (Windows registry)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    ensure_request_retry_columns(engine)
    yield


def allowed_origins() -> list[str]:
    """CORS origins from ALLOWED_ORIGINS (comma-separated); default: the Next dev server."""
    raw = os.getenv("ALLOWED_ORIGINS") or "http://localhost:3000"
    return [o.strip() for o in raw.split(",") if o.strip()]

app = FastAPI(title="O2O pharmacy", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)
STATIC_DIR.mkdir(exist_ok=True)  # StaticFiles raises if the dir is missing
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
for m in (catalog, geocoding, prescriptions, orders, ratings):
    app.include_router(m.router)
