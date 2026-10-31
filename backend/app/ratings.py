"""Google Maps star rating for a pharmacy, looked up server-side so the API key never reaches the browser."""
import math
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.geo import haversine_km
from app.models import Pharmacy

router = APIRouter()
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
FIELDS = "places.rating,places.userRatingCount,places.googleMapsUri,places.location"
MAX_DISTANCE_KM = 0.3  # a hit farther than this from the pharmacy is a different store
TTL_SECONDS = 24 * 3600
EMPTY = {"rating": None, "count": None, "url": None}
CACHE: dict[int, tuple[float, dict]] = {}


def client() -> httpx.Client:
    return httpx.Client(timeout=5)


def api_key() -> str:
    load_dotenv(ENV_FILE, override=False)
    return os.getenv("GOOGLE_MAPS_API_KEY", "").strip()


def lookup(pharmacy: Pharmacy, key: str) -> dict:
    body = {
        "textQuery": f"{pharmacy.name} {pharmacy.address}",
        "languageCode": "vi",
        "maxResultCount": 1,
        "locationBias": {"circle": {"center": {"latitude": pharmacy.latitude, "longitude": pharmacy.longitude}, "radius": 300.0}},
    }
    with client() as http:
        response = http.post(PLACES_URL, json=body, headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS})
        response.raise_for_status()
        places = response.json().get("places") or []
    if not places:
        return EMPTY
    place = places[0]
    where = place.get("location") or {}
    rating, count = place.get("rating"), place.get("userRatingCount")
    try:
        far = haversine_km(pharmacy.latitude, pharmacy.longitude, where["latitude"], where["longitude"]) > MAX_DISTANCE_KM
    except (KeyError, TypeError):
        far = True
    if far or isinstance(rating, bool) or not isinstance(rating, (int, float)) or not math.isfinite(rating):
        return EMPTY
    return {
        "rating": round(float(rating), 1),
        "count": count if isinstance(count, int) and not isinstance(count, bool) else None,
        "url": place.get("googleMapsUri") if isinstance(place.get("googleMapsUri"), str) else None,
    }


@router.get("/pharmacies/{pharmacy_id}/rating")
def pharmacy_rating(pharmacy_id: int, db: Session = Depends(get_db)):
    pharmacy = db.get(Pharmacy, pharmacy_id)
    if pharmacy is None:
        raise HTTPException(404, "unknown pharmacy")
    cached = CACHE.get(pharmacy_id)
    if cached and time.monotonic() - cached[0] < TTL_SECONDS:
        return cached[1]
    key = api_key()
    if not key:
        return EMPTY
    try:
        result = lookup(pharmacy, key)
    except (httpx.HTTPError, ValueError):
        return EMPTY  # ratings are decoration; never break the page over them
    CACHE[pharmacy_id] = (time.monotonic(), result)
    return result
