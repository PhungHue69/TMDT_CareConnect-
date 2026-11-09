from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Pharmacy(Base):
    __tablename__ = "pharmacies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str] = mapped_column(String(500))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)


class MasterDrug(Base):
    __tablename__ = "master_drugs"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    active_ingredient: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(8))  # RX | OTC | TPCN
    unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    price: Mapped[int] = mapped_column(Integer)  # VND
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)


class PharmacyStock(Base):
    __tablename__ = "pharmacy_stock"
    __table_args__ = (UniqueConstraint("pharmacy_id", "drug_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    pharmacy_id: Mapped[int] = mapped_column(ForeignKey("pharmacies.id"), index=True)
    drug_id: Mapped[int] = mapped_column(ForeignKey("master_drugs.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)  # >= 1; no zero rows stored

class Prescription(Base):
    __tablename__ = "prescriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    input_type: Mapped[str] = mapped_column(String(8))  # IMAGE | TEXT
    ocr_raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # APPROVED | REJECTED_NOT_RX | UNREADABLE
    ai_validation_status: Mapped[str] = mapped_column(String(32))
    # list of {name, dosage, quantity, matched_drug_id}
    items_json: Mapped[list] = mapped_column(JSON, default=list)
    # use-once marker; no FK (orders already FK to prescriptions, avoids cycle)
    used_order_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PrescriptionRequest(Base):
    __tablename__ = "prescription_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    pharmacy_id: Mapped[int] = mapped_column(ForeignKey("pharmacies.id"), index=True)
    image_path: Mapped[str] = mapped_column(String(1000))  # private file path, never exposed
    request_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    image_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING_PHARMACIST")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    pharmacy_id: Mapped[int] = mapped_column(ForeignKey("pharmacies.id"))
    prescription_id: Mapped[int | None] = mapped_column(
        ForeignKey("prescriptions.id"), nullable=True
    )
    items_json: Mapped[list] = mapped_column(JSON, default=list)
    total_amount: Mapped[int] = mapped_column(Integer)  # VND
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
