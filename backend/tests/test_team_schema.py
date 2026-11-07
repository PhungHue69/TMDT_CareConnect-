from sqlalchemy.orm import Session

from app.models import MasterDrug, Pharmacy, PharmacyStock
from app.team_schema import (
    drug_from_team,
    drug_to_team,
    export_team_sql,
    import_team_rows,
    sql_literal,
)

TEAM_DRUG = {
    "name": "Kẽm Gluconat 70mg (nhóm)",
    "active_ingredient": "Zinc gluconate",
    "product_type": "SUPPLEMENT",
    "unit": "Hộp 10 viên",
    "reference_price": 120000.00,
    "image_url": "https://example.test/c.png",
}


def test_team_supplement_becomes_tpcn_with_integer_price():
    mine = drug_from_team(TEAM_DRUG)
    assert mine["category"] == "TPCN"
    assert mine["price"] == 120000 and isinstance(mine["price"], int)
    assert "product_type" not in mine and "reference_price" not in mine


def test_my_tpcn_becomes_team_supplement_and_back():
    mine = {"name": "Panadol", "active_ingredient": None, "category": "OTC", "unit": "Hộp", "price": 15000, "image_url": None}
    team = drug_to_team(mine)
    assert team["product_type"] == "OTC" and team["reference_price"] == 15000
    assert drug_to_team({**mine, "category": "TPCN"})["product_type"] == "SUPPLEMENT"
    assert drug_from_team(drug_to_team({**mine, "category": "TPCN"}))["category"] == "TPCN"


def test_team_only_types_are_rejected_not_guessed():
    # DEVICE and COSMETIC have no equivalent in this app's RX/OTC/TPCN model
    for kind in ("DEVICE", "COSMETIC"):
        assert drug_from_team({**TEAM_DRUG, "product_type": kind}) is None


def test_import_adds_team_rows_without_touching_existing_data(db: Session):
    before = db.query(Pharmacy).count(), db.query(MasterDrug).count(), db.query(PharmacyStock).count()
    pharmacies = [{"name": "Nhà thuốc Minh Tâm (demo)", "address": "120 Cầu Giấy, Hà Nội", "latitude": 21.0331, "longitude": 105.7986, "phone": "0900000021", "storefront_image_url": None}]
    drugs = [TEAM_DRUG, {**TEAM_DRUG, "name": "Máy đo huyết áp", "product_type": "DEVICE"}]
    inventories = [{"pharmacy_name": "Nhà thuốc Minh Tâm (demo)", "drug_name": "Kẽm Gluconat 70mg (nhóm)", "stock_quantity": 7}]

    report = import_team_rows(db, pharmacies, drugs, inventories)

    assert report == {"pharmacies": 1, "drugs": 1, "stock": 1, "skipped_drugs": 1}
    assert (db.query(Pharmacy).count(), db.query(MasterDrug).count(), db.query(PharmacyStock).count()) == (before[0] + 1, before[1] + 1, before[2] + 1)
    stock = db.query(PharmacyStock).order_by(PharmacyStock.id.desc()).first()
    assert stock.quantity == 7


def test_import_is_idempotent(db: Session):
    pharmacies = [{"name": "Nhà thuốc Minh Tâm (demo)", "address": "120 Cầu Giấy, Hà Nội", "latitude": 21.0331, "longitude": 105.7986, "phone": None, "storefront_image_url": None}]
    inventories = [{"pharmacy_name": "Nhà thuốc Minh Tâm (demo)", "drug_name": "Kẽm Gluconat 70mg (nhóm)", "stock_quantity": 7}]
    import_team_rows(db, pharmacies, [TEAM_DRUG], inventories)
    counts = db.query(Pharmacy).count(), db.query(MasterDrug).count(), db.query(PharmacyStock).count()
    import_team_rows(db, pharmacies, [TEAM_DRUG], inventories)
    assert (db.query(Pharmacy).count(), db.query(MasterDrug).count(), db.query(PharmacyStock).count()) == counts


def test_zero_or_negative_stock_is_not_imported(db: Session):
    pharmacies = [{"name": "Hết hàng", "address": "1 Phố A", "latitude": 21.0, "longitude": 105.8, "phone": None, "storefront_image_url": None}]
    inventories = [{"pharmacy_name": "Hết hàng", "drug_name": "Kẽm Gluconat 70mg (nhóm)", "stock_quantity": 0}]
    assert import_team_rows(db, pharmacies, [TEAM_DRUG], inventories)["stock"] == 0


def test_sql_literal_escapes_quotes_and_handles_null():
    assert sql_literal("Nhà thuốc O'Neil") == "'Nhà thuốc O''Neil'"
    assert sql_literal(None) == "NULL"
    assert sql_literal(12) == "12"
    assert sql_literal(1.5) == "1.5"


def test_export_uses_team_table_and_column_names(db: Session):
    sql = export_team_sql(db, owner_user_phone="0900000021")
    assert "INSERT INTO pharmacies" in sql and "storefront_image_url" in sql
    assert "INSERT INTO master_drugs" in sql and "product_type" in sql and "reference_price" in sql
    assert "INSERT INTO pharmacy_inventories" in sql and "stock_quantity" in sql and "master_drug_id" in sql
    assert "TPCN" not in sql and "SUPPLEMENT" in sql
    # pharmacies need an owner (NOT NULL FK in the team schema) and a GPP certificate
    assert "0900000021" in sql and "gpp_certificate" in sql
    assert sql.lstrip().startswith("--")  # header explaining what the file is
    assert "BEGIN;" in sql and "COMMIT;" in sql


def test_export_has_no_private_prescription_data(db: Session):
    sql = export_team_sql(db, owner_user_phone="0900000021").lower()
    for word in ("prescription", "image_path", "request_key", "sha256"):
        assert word not in sql
