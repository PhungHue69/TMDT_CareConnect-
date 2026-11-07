from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.geo import haversine_km
from app.locations import build_locations
from app.models import MasterDrug, Pharmacy, PharmacyStock

router = APIRouter()


class PharmacyNearby(BaseModel):
    id: int
    name: str
    address: str
    latitude: float
    longitude: float
    phone: str | None
    distance_km: float
    image_url: str | None = None


class StockItem(BaseModel):
    drug_id: int
    quantity: int

class PharmacyWithStock(PharmacyNearby):
    items: list[StockItem]

class WardOut(BaseModel):
    ward: str
    lat: float
    lng: float

class LocationOut(BaseModel):
    province: str
    lat: float
    lng: float
    wards: list[WardOut]

class DrugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    active_ingredient: str | None
    category: str
    unit: str | None
    price: int
    image_url: str | None


class PharmacyDrugOut(DrugOut):
    stock_quantity: int


@router.get("/pharmacies/nearby", response_model=list[PharmacyNearby])
def nearby(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    # ponytail: sort in Python; use bounding-box SQL filter when pharmacies > ~10k
    rows = [
        PharmacyNearby(
            id=p.id, name=p.name, address=p.address, latitude=p.latitude,
            longitude=p.longitude, phone=p.phone, image_url=p.image_url,
            distance_km=haversine_km(lat, lng, p.latitude, p.longitude),
        )
        for p in db.scalars(select(Pharmacy))
    ]
    rows.sort(key=lambda r: r.distance_km)
    return rows[:limit]


class PharmacyDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str
    latitude: float
    longitude: float
    phone: str | None
    image_url: str | None


class PharmacyProductsOut(BaseModel):
    items: list[PharmacyDrugOut]
    total: int
    page: int
    limit: int


@router.get("/pharmacies/{pharmacy_id}/products", response_model=PharmacyProductsOut)
def pharmacy_products(
    pharmacy_id: int,
    q: str | None = Query(None, max_length=200),
    category: Literal["OTC", "TPCN"] | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if db.get(Pharmacy, pharmacy_id) is None:
        raise HTTPException(404, "unknown pharmacy")

    stmt = (
        select(MasterDrug, PharmacyStock.quantity.label("stock_quantity"))
        .join(PharmacyStock, PharmacyStock.drug_id == MasterDrug.id)
        .where(
            PharmacyStock.pharmacy_id == pharmacy_id,
            PharmacyStock.quantity > 0,
            MasterDrug.category.in_((category,) if category else ("OTC", "TPCN")),
        )
    )
    if q:
        stmt = stmt.where(MasterDrug.name.icontains(q.strip(), autoescape=True))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(
        stmt.order_by(MasterDrug.name, MasterDrug.id)
        .offset((page - 1) * limit)
        .limit(limit)
    ).all()
    return PharmacyProductsOut(
        items=[DrugOut.model_validate(drug).model_copy(update={"stock_quantity": quantity})
               for drug, quantity in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/drugs", response_model=list[DrugOut])
def drugs(category: Literal["RX", "OTC", "TPCN"] | None = None, q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(MasterDrug).order_by(MasterDrug.id)
    if category:
        stmt = stmt.where(MasterDrug.category == category)
    if q:
        stmt = stmt.where(MasterDrug.name.icontains(q, autoescape=True))
    return db.scalars(stmt).all()

@router.get("/locations", response_model=list[LocationOut])
def locations(db: Session = Depends(get_db)):
    return build_locations(
        (p.address, p.latitude, p.longitude) for p in db.scalars(select(Pharmacy).order_by(Pharmacy.id))
    )

def _parse_drug_ids(raw: str) -> list[int]:
    parts = raw.split(",")
    # length check first: int() on a huge digit string is slow/overflows the DB bind
    if not 1 <= len(parts) <= 20 or not all(
        p.isascii() and p.isdigit() and len(p) <= 10 and 0 < int(p) <= 2**31 - 1 for p in parts
    ):
        raise HTTPException(422, "drug_ids: 1-20 comma-separated positive integers")
    ids = [int(p) for p in parts]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "drug_ids: duplicates not allowed")
    return ids

@router.get("/pharmacies/with-stock", response_model=list[PharmacyWithStock])
def with_stock(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    drug_ids: str = Query(),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    ids = _parse_drug_ids(drug_ids)
    known = set(db.scalars(select(MasterDrug.id).where(MasterDrug.id.in_(ids))))
    if known != set(ids):
        raise HTTPException(404, "unknown drug id")
    covered = (
        select(PharmacyStock.pharmacy_id)
        .where(PharmacyStock.drug_id.in_(ids), PharmacyStock.quantity >= 1)
        .group_by(PharmacyStock.pharmacy_id)
        .having(func.count() == len(ids))  # unique (pharmacy, drug) => count == all drugs
    )
    items: dict[int, list[StockItem]] = {}
    for s in db.scalars(
        select(PharmacyStock)
        .where(PharmacyStock.pharmacy_id.in_(covered), PharmacyStock.drug_id.in_(ids))
        .order_by(PharmacyStock.pharmacy_id, PharmacyStock.drug_id)
    ):
        items.setdefault(s.pharmacy_id, []).append(StockItem(drug_id=s.drug_id, quantity=s.quantity))
    rows = [
        PharmacyWithStock(
            id=p.id, name=p.name, address=p.address, latitude=p.latitude,
            longitude=p.longitude, phone=p.phone, image_url=p.image_url,
            distance_km=haversine_km(lat, lng, p.latitude, p.longitude), items=items[p.id],
        )
        # ponytail: IN-list unbounded; SQL Server caps ~2100 params, fine at a few thousand pharmacies; upgrade: join on `covered`
        for p in db.scalars(select(Pharmacy).where(Pharmacy.id.in_(list(items))))
    ]
    rows.sort(key=lambda r: (r.distance_km, r.id))
    return rows[:limit]


@router.get("/pharmacies/{pharmacy_id}", response_model=PharmacyDetail)
def pharmacy_detail(pharmacy_id: int, db: Session = Depends(get_db)):
    pharmacy = db.get(Pharmacy, pharmacy_id)
    if pharmacy is None:
        raise HTTPException(404, "unknown pharmacy")
    return pharmacy
