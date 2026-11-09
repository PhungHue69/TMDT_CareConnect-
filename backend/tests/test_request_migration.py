from sqlalchemy import create_engine, inspect, text

from app.request_migration import ensure_request_retry_columns


def test_existing_sqlite_requests_gain_retry_columns_without_losing_rows(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE prescription_requests (id INTEGER PRIMARY KEY, pharmacy_id INTEGER NOT NULL, image_path VARCHAR(1000) NOT NULL, status VARCHAR(32) NOT NULL, created_at DATETIME NOT NULL)"))
        conn.execute(text("INSERT INTO prescription_requests (id, pharmacy_id, image_path, status, created_at) VALUES (1, 2, 'private/a.png', 'PENDING_PHARMACIST', '2026-10-20')"))
    ensure_request_retry_columns(engine)
    ensure_request_retry_columns(engine)
    assert {"request_key", "image_sha256"}.issubset({column["name"] for column in inspect(engine).get_columns("prescription_requests")})
    with engine.connect() as conn:
        assert conn.execute(text("SELECT id, pharmacy_id FROM prescription_requests")).all() == [(1, 2)]
    engine.dispose()
