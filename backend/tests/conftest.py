import importlib
import sys
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.db import Base, get_db
from app.main import app
from scripts.seed import seed

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    seed(session, FIXTURES)
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def fake_gemini(monkeypatch):
    """fake_gemini(result): patch app.ai.call_gemini to return result (dict) or raise it (Exception)."""

    def install(result):
        try:
            ai = importlib.import_module("app.ai")
        except ImportError:  # app.ai not created yet (Task 4): stub module
            ai = types.ModuleType("app.ai")
            monkeypatch.setitem(sys.modules, "app.ai", ai)

        def fake(*args, **kwargs):
            if isinstance(result, Exception):
                raise result
            return result

        monkeypatch.setattr(ai, "call_gemini", fake, raising=False)

    return install
