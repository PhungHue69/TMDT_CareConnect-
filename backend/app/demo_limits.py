"""Single-process guardrails for a short-lived public demo."""

import os
import threading
import time
from collections import deque
from typing import Literal

from fastapi import HTTPException

_WINDOW = 24 * 60 * 60
_MAX = 30
_lock = threading.Lock()
_hits: dict[str, deque[float]] = {"analyze": deque(), "order": deque(), "prescription_request": deque()}


def check_demo_limit(action: Literal["analyze", "order", "prescription_request"]) -> None:
    if os.getenv("PUBLIC_DEMO") != "1":
        return
    now = time.monotonic()
    with _lock:
        hits = _hits[action]
        while hits and hits[0] <= now - _WINDOW:
            hits.popleft()
        if len(hits) >= _MAX:
            raise HTTPException(429, "Bản demo đã đạt giới hạn lượt thử hôm nay. Vui lòng quay lại sau.")
        hits.append(now)
