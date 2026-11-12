from __future__ import annotations

import os

ELEXON_BASE_URL = os.getenv(
    "ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1"
).rstrip("/")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "60"))
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "600"))
DEFAULT_DECISION_MONTH = os.getenv("DEFAULT_DECISION_MONTH", "2026-01")
DEFAULT_CUTOFF_TIME = os.getenv("DEFAULT_CUTOFF_TIME", "10:00")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
