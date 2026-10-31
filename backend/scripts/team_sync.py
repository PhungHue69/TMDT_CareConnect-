"""Exchange data with the team's PostgreSQL schema without changing this app's tables.

  export:  python -m scripts.team_sync export [out.sql]
           Writes a PostgreSQL script (team table/column names) with this app's pharmacies, drugs and sample stock.
  import:  python -m scripts.team_sync import <team_rows.json>
           Adds team rows to this app's SQLite. The JSON has three lists:
           {"pharmacies": [...], "drugs": [...], "inventories": [...]} using the team's column names, plus
           pharmacy_name / drug_name on each inventory row (export them with psql, e.g. `COPY (SELECT ...) TO ...`).
"""
import json
import sys
from pathlib import Path

from app.db import SessionLocal
from app.team_schema import export_team_sql, import_team_rows

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "team_export.sql"
DEFAULT_OWNER_PHONE = "0900000021"  # pharmacist created by the team's 002_seed_data.sql


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in ("export", "import"):
        print(__doc__)
        return 2
    with SessionLocal() as session:
        if argv[1] == "export":
            out = Path(argv[2]) if len(argv) > 2 else DEFAULT_OUT
            out.write_text(export_team_sql(session, DEFAULT_OWNER_PHONE), encoding="utf-8")
            print(f"Da ghi {out}")
            return 0
        if len(argv) < 3:
            print("Thiếu đường dẫn tệp JSON.")
            return 2
        data = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        print(import_team_rows(session, data.get("pharmacies", []), data.get("drugs", []), data.get("inventories", [])))
        return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
