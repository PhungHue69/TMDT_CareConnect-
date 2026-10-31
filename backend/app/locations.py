import re
import unicodedata
from collections import Counter
from typing import Iterable

HCM_KEY = "hồ chí minh"
_PROV_PREFIX = re.compile(r"^(?:TP\.?|Tỉnh|Thành phố)\s*", re.I)
_WARD_RE = re.compile(r"^(?:P\.|X\.|TT\.|Phường|Xã|Thị trấn)\s*\S", re.I)


def _clean(s: str) -> str:
    return " ".join(unicodedata.normalize("NFC", s).split())


def _sort_key(s: str) -> tuple[str, str]:
    """Vietnamese-aware: strip diacritics, đ/Đ -> d; original string breaks ties."""
    d = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in d if not unicodedata.combining(c)).casefold(), s


def _province_key(name: str) -> str:
    return _PROV_PREFIX.sub("", name).casefold()


def parse_address(address: str) -> tuple[str, str | None] | None:
    """'..., P. X, TP. Y' -> ('TP. Y', 'P. X'); ward None if absent; None if no province.
    Names kept as displayed (whitespace/NFC normalised)."""
    parts = [_clean(p) for p in (address or "").split(",")]
    parts = [p for p in parts if p]
    if len(parts) < 2:
        return None
    ward = parts[-2] if _WARD_RE.match(parts[-2]) else None
    return parts[-1], ward


def _mean(pts: list[tuple[float, float]]) -> tuple[float, float]:
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def build_locations(rows: Iterable[tuple[str, float, float]]) -> list[dict]:
    """rows: (address, lat, lng) -> [{province, lat, lng, wards:[{ward, lat, lng}]}].
    Provinces merge on name without TP./Tỉnh prefix; HCM first, rest alphabetical."""
    provs: dict[str, dict] = {}
    for address, lat, lng in rows:
        parsed = parse_address(address)
        if not parsed:
            continue
        pname, ward = parsed
        p = provs.setdefault(_province_key(pname), {"names": Counter(), "pts": [], "wards": {}})
        p["names"][pname] += 1
        p["pts"].append((lat, lng))
        if ward:
            w = p["wards"].setdefault(ward.casefold(), {"name": ward, "pts": []})
            w["pts"].append((lat, lng))

    out = []
    for key, p in provs.items():
        # prefer a prefixed display name (TP./Tỉnh), then most frequent
        name = max(p["names"], key=lambda n: (bool(_PROV_PREFIX.match(n)), p["names"][n]))
        if not _PROV_PREFIX.match(name) and key == HCM_KEY:
            name = "TP. Hồ Chí Minh"
        lat, lng = _mean(p["pts"])
        wards = sorted(p["wards"].values(), key=lambda w: _sort_key(w["name"]))
        out.append({
            "province": name, "lat": lat, "lng": lng,
            "wards": [{"ward": w["name"], "lat": _mean(w["pts"])[0], "lng": _mean(w["pts"])[1]} for w in wards],
            "_key": key,
        })
    out.sort(key=lambda o: (o["_key"] != HCM_KEY, _sort_key(o["_key"])))
    for o in out:
        del o["_key"]
    return out
