from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_request_retry_columns(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    if not inspect(engine).has_table("prescription_requests"):
        return
    columns = {column["name"] for column in inspect(engine).get_columns("prescription_requests")}
    with engine.begin() as connection:
        if "request_key" not in columns:
            connection.execute(text("ALTER TABLE prescription_requests ADD COLUMN request_key VARCHAR(64)"))
        if "image_sha256" not in columns:
            connection.execute(text("ALTER TABLE prescription_requests ADD COLUMN image_sha256 VARCHAR(64)"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_prescription_requests_request_key ON prescription_requests (request_key)"))
