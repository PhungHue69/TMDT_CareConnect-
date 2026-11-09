import re

_PACK = re.compile(r"(\d+)\s*[xX]\s*(\d+)")

# Hard cap on a "pack"-labelled quantity: the label comes from Gemini and one mislabel
# (e.g. "21 viên" tagged "pack") must not authorise a dozen boxes. Shared by UI (max_packs) and server.
MAX_PACKS = 10

def allowed_packs(item: dict, drug) -> int:
    """Max packs a prescription item authorises for `drug` (needs .name). Fail-safe:
    bad quantity -> 0; 'pack' -> quantity (a count >= pack size is really units; capped at MAX_PACKS);
    otherwise ceil(quantity / N*M from name), unparsable -> 1."""
    q = item.get("quantity")
    if isinstance(q, bool):
        return 0
    try:
        qty = max(int(q), 0)
    except (TypeError, ValueError, OverflowError):
        return 0
    if qty == 0:
        return 0
    m = _PACK.search(drug.name or "")
    per_pack = int(m[1]) * int(m[2]) if m else 0
    if item.get("quantity_unit") == "pack":
        if per_pack and qty >= per_pack:
            qty = -(-qty // per_pack)
        return min(qty, MAX_PACKS)
    # ponytail: pack size from name only; unparsable -> 1 pack. Add a catalog pack_size column if wrong often.
    return max(1, -(-qty // per_pack)) if per_pack else 1
