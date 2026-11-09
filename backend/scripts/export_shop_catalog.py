"""Sinh migration 030_shop_catalog.sql: đưa nhà thuốc / thuốc / tồn kho của trang Mua thuốc (SQLite) vào PostgreSQL.

Mỗi dòng giữ mã gốc ở cột shop_ref để API Node khớp được với id mà trang Mua thuốc đang dùng.
Mỗi nhà thuốc có một tài khoản dược sĩ demo: SĐT 093 + mã nhà thuốc (7 chữ số), mật khẩu 123456.

  python -m scripts.export_shop_catalog [đường_dẫn_file_sql]
"""
import os
import random
import sys
from datetime import date
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./o2o.db"  # luôn đọc dữ liệu của trang Mua thuốc

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import MasterDrug, Pharmacy, PharmacyStock  # noqa: E402
from app.team_schema import TO_TEAM_TYPE, sql_literal  # noqa: E402

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "database" / "migrations" / "030_shop_catalog.sql"
CATEGORY_ID = {"RX": 1, "OTC": 2, "SUPPLEMENT": 3}  # drug_categories gốc trong 002_seed_data.sql


def pharmacist_phone(ref: int) -> str:
    return f"093{ref:07d}"


def rx_sample_price(ref: int) -> int:
    """Giá mẫu cố định cho thuốc kê đơn (dữ liệu gốc để 0đ = giá tại nhà thuốc)."""
    return random.Random(ref).randrange(30, 251) * 1000


def values(rows: list[tuple]) -> str:
    return ",\n".join("(" + ", ".join(sql_literal(v) for v in row) + ")" for row in rows)


def build(session) -> str:
    pharmacies = session.scalars(select(Pharmacy).order_by(Pharmacy.id)).all()
    drugs = session.scalars(select(MasterDrug).order_by(MasterDrug.id)).all()
    stock = session.scalars(select(PharmacyStock).order_by(PharmacyStock.pharmacy_id, PharmacyStock.drug_id)).all()
    drug_price = {d.id: (rx_sample_price(d.id) if d.category == "RX" else d.price) for d in drugs}

    out = [
        "-- =============================================================================",
        "-- DANH MỤC CHUNG: nhà thuốc, thuốc, tồn kho của trang Mua thuốc (TV2) đưa vào PostgreSQL",
        f"-- Sinh tự động ngày {date.today().isoformat()} bằng: python -m scripts.export_shop_catalog",
        "-- Chạy SAU 001 → 025. Chạy lại nhiều lần không bị trùng.",
        "-- shop_ref = id của dòng tương ứng trong SQLite của trang Mua thuốc.",
        "-- Tồn kho và giá thuốc kê đơn (RX) là DỮ LIỆU MẪU, không phải số liệu thật của Long Châu.",
        "-- Tài khoản dược sĩ demo của từng nhà thuốc: 093 + shop_ref (7 chữ số), mật khẩu 123456.",
        "-- =============================================================================",
        "BEGIN;",
        "",
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS shop_ref INT UNIQUE;",
        "ALTER TABLE master_drugs ADD COLUMN IF NOT EXISTS shop_ref INT UNIQUE;",
        "",
        "-- Tài khoản dược sĩ (dùng chung một mã băm mật khẩu cho nhanh)",
        "WITH pw AS (SELECT crypt('123456', gen_salt('bf', 10)) AS h)",
        "INSERT INTO users (phone, password_hash, full_name, role, kyc_status)",
        "SELECT v.phone, pw.h, v.full_name, 'PHARMACIST', 'VERIFIED' FROM pw CROSS JOIN (VALUES",
        values([(pharmacist_phone(p.id), f"Dược sĩ phụ trách NT #{p.id}") for p in pharmacies]),
        ") AS v(phone, full_name)",
        "ON CONFLICT (phone) DO NOTHING;",
        "",
        "INSERT INTO pharmacies (owner_user_id, name, phone, business_license_number, gpp_certificate, storefront_image_url,",
        "                        address, latitude, longitude, opening_hours_json, verification_status, reviewed_at, shop_ref)",
        "SELECT u.id, v.name, v.phone, 'DKKD-DEMO-' || v.ref, 'GPP-DEMO-' || v.ref, v.img, v.address, v.lat, v.lng,",
        "       '{\"mon-sun\": \"07:00-22:00\"}'::jsonb, 'APPROVED', CURRENT_TIMESTAMP, v.ref",
        "FROM (VALUES",
        values([(p.id, p.name, p.phone, p.image_url, p.address, p.latitude, p.longitude, pharmacist_phone(p.id)) for p in pharmacies]),
        ") AS v(ref, name, phone, img, address, lat, lng, owner_phone)",
        "JOIN users u ON u.phone = v.owner_phone",
        "ON CONFLICT (shop_ref) DO NOTHING;",
        "",
        "INSERT INTO pharmacy_staff (pharmacy_id, user_id, staff_role)",
        "SELECT id, owner_user_id, 'OWNER' FROM pharmacies WHERE shop_ref IS NOT NULL",
        "ON CONFLICT (pharmacy_id, user_id) DO NOTHING;",
        "",
        "INSERT INTO wallets (owner_type, pharmacy_id)",
        "SELECT 'PHARMACY', p.id FROM pharmacies p",
        "WHERE p.shop_ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.owner_type = 'PHARMACY' AND w.pharmacy_id = p.id);",
        "",
        "INSERT INTO master_drugs (category_id, name, active_ingredient, product_type, unit, reference_price, image_url, shop_ref)",
        "SELECT v.category_id, v.name, v.active_ingredient, v.product_type::product_type_enum, v.unit, v.price, v.img, v.ref",
        "FROM (VALUES",
        values([
            # active_ingredient bên PostgreSQL tối đa 255 ký tự; vài thuốc phối hợp có danh sách dài hơn
            (CATEGORY_ID[TO_TEAM_TYPE[d.category]], d.name, (d.active_ingredient or "")[:255] or None, TO_TEAM_TYPE[d.category],
             d.unit or "Hộp", drug_price[d.id], d.image_url, d.id)
            for d in drugs
        ]),
        ") AS v(category_id, name, active_ingredient, product_type, unit, price, img, ref)",
        "ON CONFLICT (shop_ref) DO NOTHING;",
        "",
        "INSERT INTO pharmacy_inventories (pharmacy_id, master_drug_id, stock_quantity, price, nearest_expiry_date, status)",
        "SELECT p.id, d.id, v.qty, v.price, DATE '2027-12-31', 'IN_STOCK'",
        "FROM (VALUES",
        values([(s.pharmacy_id, s.drug_id, s.quantity, drug_price[s.drug_id]) for s in stock]),
        ") AS v(pharmacy_ref, drug_ref, qty, price)",
        "JOIN pharmacies p ON p.shop_ref = v.pharmacy_ref",
        "JOIN master_drugs d ON d.shop_ref = v.drug_ref",
        "ON CONFLICT (pharmacy_id, master_drug_id) DO NOTHING;",
        "",
        "COMMIT;",
        "",
    ]
    return "\n".join(out)


def main(argv: list[str]) -> int:
    out = Path(argv[1]) if len(argv) > 1 else DEFAULT_OUT
    with SessionLocal() as session:
        out.write_text(build(session), encoding="utf-8")
    print(f"Đã ghi {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
