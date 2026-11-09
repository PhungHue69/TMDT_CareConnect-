from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.db import get_db
from app.demo_limits import check_demo_limit
from app.packs import allowed_packs
from app.models import MasterDrug, Order, Pharmacy, PharmacyStock, Prescription

router = APIRouter()

DEMO_BUYER_ID = 1  # ponytail: single demo user, no auth; add auth when real login exists


class OrderItemIn(BaseModel):
    drug_id: int
    quantity: int = Field(ge=1, le=1000)


class OrderIn(BaseModel):
    pharmacy_id: int
    prescription_id: int | None = None
    items: list[OrderItemIn] = Field(min_length=1)


def validate_rx(
    db: Session, prescription_id: int | None, rx_qty: dict[int, int]
) -> Prescription | None:
    """rx_qty: {drug_id: total packs} of Rx drugs in the order. Raises HTTPException."""
    if not rx_qty:
        return None
    if prescription_id is None:
        raise HTTPException(403, "Thuốc kê đơn (Rx) cần đơn thuốc hợp lệ (prescription_id).")
    rx = db.get(Prescription, prescription_id)
    if rx is None:
        raise HTTPException(404, "Không tìm thấy đơn thuốc.")
    if rx.input_type != "IMAGE":
        raise HTTPException(403, "Thuốc kê đơn chỉ được bán khi có ảnh đơn thuốc, không chấp nhận đơn nhập văn bản.")
    if rx.ai_validation_status != "APPROVED":
        raise HTTPException(403, "Đơn thuốc chưa được xác thực hợp lệ.")
    allowed: dict[int, int] = defaultdict(int)
    names = {d.id: d for d in db.query(MasterDrug).filter(MasterDrug.id.in_(rx_qty)).all()}
    for it in rx.items_json or []:
        d = names.get(it.get("matched_drug_id"))
        if d is not None:
            allowed[d.id] += allowed_packs(it, d)
    for drug_id, qty in rx_qty.items():
        if drug_id not in allowed:
            raise HTTPException(403, f"Thuốc kê đơn (id={drug_id}) không có trong đơn thuốc.")
        if qty > allowed[drug_id]:
            raise HTTPException(
                403, f"Số hộp thuốc (id={drug_id}) vượt quá số hộp tối đa theo đơn ({allowed[drug_id]})."
            )
    if rx.used_order_id is not None:
        raise HTTPException(409, "Đơn thuốc đã được sử dụng cho một đơn hàng khác.")
    return rx


@router.post("/orders", status_code=201)
def create_order(body: OrderIn, db: Session = Depends(get_db)):
    check_demo_limit("order")
    if db.get(Pharmacy, body.pharmacy_id) is None:
        raise HTTPException(404, "Không tìm thấy nhà thuốc.")
    qty: dict[int, int] = defaultdict(int)
    for it in body.items:
        qty[it.drug_id] += it.quantity
    drugs = {d.id: d for d in db.query(MasterDrug).filter(MasterDrug.id.in_(qty)).all()}
    missing = sorted(set(qty) - set(drugs))
    if missing:
        raise HTTPException(404, f"Không tìm thấy thuốc: {missing}")

    if any(drugs[i].category == "RX" for i in qty):
        raise HTTPException(403, "Thuốc kê đơn cần dược sĩ kiểm tra; không thể tạo đơn mua trực tiếp từ AI.")
    rx = validate_rx(db, body.prescription_id, {})
    available = {
        row.drug_id: row.quantity
        for row in db.query(PharmacyStock).filter(
            PharmacyStock.pharmacy_id == body.pharmacy_id,
            PharmacyStock.drug_id.in_(qty),
        )
    }
    if any(available.get(drug_id, 0) < quantity for drug_id, quantity in qty.items()):
        raise HTTPException(409, "Nhà thuốc không còn đủ số lượng sản phẩm này.")
    lines = [
        {"drug_id": i, "name": drugs[i].name, "quantity": q, "unit_price": drugs[i].price}
        for i, q in qty.items()
    ]
    order = Order(
        buyer_id=DEMO_BUYER_ID,
        pharmacy_id=body.pharmacy_id,
        prescription_id=rx.id if rx else None,
        items_json=lines,
        total_amount=sum(drugs[i].price * q for i, q in qty.items()),
        status="PLACED",
    )
    db.add(order)
    db.flush()  # need order.id
    if rx:
        res = db.execute(
            update(Prescription)
            .where(Prescription.id == rx.id, Prescription.used_order_id.is_(None))
            .values(used_order_id=order.id)
        )
        if res.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Đơn thuốc đã được sử dụng cho một đơn hàng khác.")
    db.commit()
    return {
        "id": order.id,
        "total_amount": order.total_amount,
        "status": order.status,
        "items": lines,
    }
