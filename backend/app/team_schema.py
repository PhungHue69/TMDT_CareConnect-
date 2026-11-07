"""Translation layer between this app's SQLite tables and the team's PostgreSQL schema (docs/DATABASE.md in the team repo).

Nothing here changes this app's own tables. It only maps names/values:

  mine                          team
  pharmacies.image_url          pharmacies.storefront_image_url
  master_drugs.category TPCN    master_drugs.product_type SUPPLEMENT (RX and OTC are identical)
  master_drugs.price (int VND)  master_drugs.reference_price (decimal)
  pharmacy_stock.drug_id        pharmacy_inventories.master_drug_id
  pharmacy_stock.quantity       pharmacy_inventories.stock_quantity (+ price copied from the drug)
"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MasterDrug, Pharmacy, PharmacyStock

TO_TEAM_TYPE = {"RX": "RX", "OTC": "OTC", "TPCN": "SUPPLEMENT"}
FROM_TEAM_TYPE = {team: mine for mine, team in TO_TEAM_TYPE.items()}  # DEVICE/COSMETIC intentionally absent


def drug_from_team(row: dict) -> dict | None:
    """Team master_drugs row -> my columns, or None for product types this app does not model."""
    category = FROM_TEAM_TYPE.get(row.get("product_type"))
    if category is None:
        return None
    return {
        "name": row["name"],
        "active_ingredient": row.get("active_ingredient"),
        "category": category,
        "unit": row.get("unit"),
        "price": int(round(float(row.get("reference_price") or 0))),
        "image_url": row.get("image_url"),
    }


def drug_to_team(row: dict) -> dict:
    return {
        "name": row["name"],
        "active_ingredient": row.get("active_ingredient"),
        "product_type": TO_TEAM_TYPE[row["category"]],
        "unit": row.get("unit") or "Hộp",
        "reference_price": row["price"],
        "image_url": row.get("image_url"),
    }


def import_team_rows(session: Session, pharmacies: list[dict], drugs: list[dict], inventories: list[dict]) -> dict:
    """Add team rows to this app's tables. Matches by name/address so reruns do not duplicate; never deletes."""
    report = {"pharmacies": 0, "drugs": 0, "stock": 0, "skipped_drugs": 0}

    for row in pharmacies:
        exists = session.scalar(select(Pharmacy.id).where(Pharmacy.name == row["name"], Pharmacy.address == row["address"]))
        if exists is None:
            session.add(Pharmacy(
                name=row["name"], address=row["address"], latitude=float(row["latitude"]), longitude=float(row["longitude"]),
                phone=row.get("phone"), image_url=row.get("storefront_image_url"),
            ))
            report["pharmacies"] += 1

    for row in drugs:
        mine = drug_from_team(row)
        if mine is None:
            report["skipped_drugs"] += 1
            continue
        if session.scalar(select(MasterDrug.id).where(MasterDrug.name == mine["name"])) is None:
            session.add(MasterDrug(**mine))
            report["drugs"] += 1
    session.flush()

    for row in inventories:
        quantity = int(row["stock_quantity"])
        if quantity < 1:  # this app stores no zero rows
            continue
        pharmacy_id = session.scalar(select(Pharmacy.id).where(Pharmacy.name == row["pharmacy_name"]).order_by(Pharmacy.id.desc()))
        drug_id = session.scalar(select(MasterDrug.id).where(MasterDrug.name == row["drug_name"]).order_by(MasterDrug.id.desc()))
        if pharmacy_id is None or drug_id is None:
            continue
        stock = session.scalar(select(PharmacyStock).where(PharmacyStock.pharmacy_id == pharmacy_id, PharmacyStock.drug_id == drug_id))
        if stock is None:
            session.add(PharmacyStock(pharmacy_id=pharmacy_id, drug_id=drug_id, quantity=quantity))
            report["stock"] += 1
    session.commit()
    return report


def sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def export_team_sql(session: Session, owner_user_phone: str) -> str:
    """PostgreSQL script (team schema) that adds this app's pharmacies, drugs and stock.

    The team's pharmacies.owner_user_id is NOT NULL, so every pharmacy is attached to the existing team user with
    `owner_user_phone` (run 002_seed_data.sql first, which creates 0900000021). gpp_certificate is NOT NULL too and the
    crawled data has none, so a visible placeholder is written instead of inventing a certificate number.
    Inventory rows are matched by (name, address) / name, so the script can be re-run without duplicating anything.
    """
    out = [
        "-- Dữ liệu nhà thuốc / thuốc / tồn kho của TV2, đã đổi tên theo schema nhóm (001_init_schema.sql).",
        f"-- Sinh ngày {date.today().isoformat()}. Chạy SAU 001_init_schema.sql và 002_seed_data.sql.",
        "-- Tồn kho là dữ liệu mẫu (seed cố định), không phải số liệu thật của Long Châu.",
        "-- Thuốc kê đơn (RX) có giá 0 nghĩa là \"giá tại nhà thuốc\"; schema nhóm cho phép price >= 0.",
        "BEGIN;",
        "",
    ]
    owner = sql_literal(owner_user_phone)

    for p in session.scalars(select(Pharmacy).order_by(Pharmacy.id)):
        out.append(
            "INSERT INTO pharmacies (owner_user_id, name, phone, gpp_certificate, storefront_image_url, address, latitude, longitude, verification_status)\n"
            f"SELECT u.id, {sql_literal(p.name)}, {sql_literal(p.phone)}, 'CHUA-XAC-MINH-GPP', {sql_literal(p.image_url)}, {sql_literal(p.address)}, "
            f"{p.latitude}, {p.longitude}, 'PENDING'\n"
            f"FROM users u WHERE u.phone = {owner}\n"
            f"AND NOT EXISTS (SELECT 1 FROM pharmacies x WHERE x.name = {sql_literal(p.name)} AND x.address = {sql_literal(p.address)});"
        )
    out.append("")

    for d in session.scalars(select(MasterDrug).order_by(MasterDrug.id)):
        t = drug_to_team({"name": d.name, "active_ingredient": d.active_ingredient, "category": d.category, "unit": d.unit, "price": d.price, "image_url": d.image_url})
        out.append(
            "INSERT INTO master_drugs (name, active_ingredient, product_type, unit, reference_price, image_url)\n"
            f"SELECT {sql_literal(t['name'])}, {sql_literal(t['active_ingredient'])}, '{t['product_type']}', {sql_literal(t['unit'])}, "
            f"{t['reference_price']}, {sql_literal(t['image_url'])}\n"
            f"WHERE NOT EXISTS (SELECT 1 FROM master_drugs x WHERE x.name = {sql_literal(t['name'])});"
        )
    out.append("")

    rows = session.execute(
        select(Pharmacy.name, Pharmacy.address, MasterDrug.name, MasterDrug.price, PharmacyStock.quantity)
        .join(Pharmacy, Pharmacy.id == PharmacyStock.pharmacy_id)
        .join(MasterDrug, MasterDrug.id == PharmacyStock.drug_id)
        .order_by(PharmacyStock.pharmacy_id, PharmacyStock.drug_id)
    )
    for pharmacy_name, address, drug_name, price, quantity in rows:
        out.append(
            "INSERT INTO pharmacy_inventories (pharmacy_id, master_drug_id, stock_quantity, price)\n"
            f"SELECT p.id, m.id, {quantity}, {price} FROM pharmacies p, master_drugs m\n"
            f"WHERE p.name = {sql_literal(pharmacy_name)} AND p.address = {sql_literal(address)} AND m.name = {sql_literal(drug_name)}\n"
            "ON CONFLICT (pharmacy_id, master_drug_id) DO NOTHING;"
        )
    out += ["", "COMMIT;", ""]
    return "\n".join(out)
