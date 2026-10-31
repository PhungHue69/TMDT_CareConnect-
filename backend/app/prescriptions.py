import hashlib
import secrets
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app import ai
from app.db import get_db
from app.demo_limits import check_demo_limit
from app.models import Pharmacy, PrescriptionRequest

router = APIRouter()

MAX_IMAGE = 10 * 1024 * 1024
MAX_REQUEST_IMAGE = 5 * 1024 * 1024
PRESCRIPTION_STORAGE_DIR = Path(__file__).resolve().parent.parent / "private_prescriptions"
MAX_TEXT = 4000
MIMES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/prescriptions/analyze")
def analyze(
    text: str | None = Form(None),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    data, mime = None, None
    if image is not None and image.filename:
        if image.content_type not in MIMES:
            raise HTTPException(400, "Chỉ chấp nhận ảnh jpeg/png/webp.")
        data = image.file.read(MAX_IMAGE + 1)
        if len(data) > MAX_IMAGE:
            raise HTTPException(400, "Ảnh quá lớn (tối đa 10MB).")
        if not data:
            raise HTTPException(400, "Ảnh rỗng.")
        mime = image.content_type
    text = (text or "").strip() or None
    if text and len(text) > MAX_TEXT:
        raise HTTPException(400, f"Văn bản quá dài (tối đa {MAX_TEXT} ký tự).")
    if not data and not text:
        raise HTTPException(400, "Cần nhập văn bản hoặc tải ảnh đơn thuốc.")
    check_demo_limit("analyze")
    return ai.analyze_input(db, text, data, mime)


@router.post("/prescriptions/requests", status_code=status.HTTP_201_CREATED)
def submit_prescription_request(
    pharmacy_id: int = Form(...),
    request_key: str | None = Form(None, min_length=8, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    pharmacy = db.get(Pharmacy, pharmacy_id)
    if pharmacy is None:
        raise HTTPException(404, "Nhà thuốc không tồn tại.")
    if image.content_type not in MIMES:
        raise HTTPException(400, "Chỉ chấp nhận ảnh jpeg/png/webp.")
    data = image.file.read(MAX_REQUEST_IMAGE + 1)
    if not data:
        raise HTTPException(400, "Ảnh rỗng.")
    if len(data) > MAX_REQUEST_IMAGE:
        raise HTTPException(400, "Ảnh quá lớn (tối đa 5MB).")
    try:
        detected = Image.open(BytesIO(data))
        detected.verify()
        format_mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(detected.format)
        if format_mime != image.content_type:
            raise ValueError("image format mismatch")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(400, "Ảnh không hợp lệ.") from None

    digest = hashlib.sha256(data).hexdigest()
    if request_key:
        previous = db.query(PrescriptionRequest).filter_by(request_key=request_key).first()
        if previous:
            if previous.pharmacy_id != pharmacy_id or previous.image_sha256 != digest:
                raise HTTPException(409, "Mã gửi này đã được dùng cho ảnh hoặc nhà thuốc khác.")
            return {"id": previous.id, "pharmacy_id": previous.pharmacy_id, "status": previous.status}

    check_demo_limit("prescription_request")
    classification = ai.classify_prescription_image(data, image.content_type)
    if classification != "IDENTIFIABLE_RX":
        detail = "Đây không phải đơn thuốc" if classification == "SYMPTOM_NOTE" else "Ảnh không rõ. Vui lòng chụp lại đơn thuốc."
        raise HTTPException(422, detail)

    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[image.content_type]
    filename = secrets.token_hex(24) + suffix
    path = PRESCRIPTION_STORAGE_DIR / filename
    try:
        PRESCRIPTION_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as target:
            target.write(data)
        row = PrescriptionRequest(pharmacy_id=pharmacy_id, image_path=str(path), request_key=request_key, image_sha256=digest, status="PENDING_PHARMACIST")
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        raise HTTPException(500, "Không thể lưu yêu cầu.") from None
    return {"id": row.id, "pharmacy_id": row.pharmacy_id, "status": row.status}
