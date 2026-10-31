import math
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
GOONG_ORIGIN = "https://rsapi.goong.io"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def client() -> httpx.Client:
    return httpx.Client(timeout=5)


def key() -> str:
    load_dotenv(ENV_FILE, override=False)
    value = os.getenv("GOONG_API_KEY", "").strip()
    if not value:
        raise HTTPException(503, "Tìm địa chỉ chưa sẵn sàng. Hãy dùng GPS hoặc chọn Tỉnh / Phường.")
    return value


def request(path: str, params: dict[str, str | int]) -> dict:
    try:
        with client() as http:
            response = http.get(f"{GOONG_ORIGIN}{path}", params={**params, "api_key": key()})
            response.raise_for_status()
            body = response.json()
        if not isinstance(body, dict):
            raise ValueError("Invalid response")
        if body.get("error_message") or body.get("status") not in (None, "OK", "ZERO_RESULTS"):
            raise HTTPException(502, "Dịch vụ địa chỉ không xử lý được yêu cầu. Hãy thử lại hoặc dùng GPS.")
        return body
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "Không tra được địa chỉ lúc này. Hãy thử lại hoặc dùng GPS.") from exc


@router.get("/geocode/suggest")
def suggest(q: str = Query(min_length=2, max_length=200)):
    q = q.strip()
    if len(q) < 2:
        raise HTTPException(422, "Địa chỉ cần ít nhất 2 ký tự.")
    body = request("/place/autocomplete", {"input": q, "limit": 5})
    predictions = body.get("predictions")
    if not isinstance(predictions, list):
        raise HTTPException(502, "Dịch vụ địa chỉ trả về dữ liệu không hợp lệ.")
    return {
        "suggestions": [
            {"place_id": row["place_id"], "description": row["description"]}
            for row in predictions
            if isinstance(row, dict)
            and isinstance(row.get("place_id"), str)
            and row["place_id"]
            and isinstance(row.get("description"), str)
            and row["description"]
        ]
    }


@router.get("/geocode/resolve")
def resolve(place_id: str = Query(min_length=1, max_length=200)):
    body = request("/Place/Detail", {"placeid": place_id})
    try:
        result = body["result"]
        label = result["formatted_address"]
        location = result["geometry"]["location"]
        lat, lng = location["lat"], location["lng"]
        if not isinstance(label, str) or not label.strip():
            raise ValueError("Invalid label")
        if isinstance(lat, bool) or isinstance(lng, bool) or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in (lat, lng)):
            raise ValueError("Invalid coordinates")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError("Out-of-range coordinates")
    except (KeyError, TypeError, ValueError):
        raise HTTPException(502, "Không xác định được tọa độ của địa chỉ này.") from None
    return {"lat": lat, "lng": lng, "label": label}
