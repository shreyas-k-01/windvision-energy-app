from __future__ import annotations

import asyncio
import time as clock
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .analysis import build_dashboard
from .config import ALLOWED_ORIGINS, CACHE_TTL_SECONDS, DEFAULT_CUTOFF_TIME, DEFAULT_DECISION_MONTH
from .elexon import ElexonAPIError, ElexonClient

app = FastAPI(
    title="WindVision API",
    description="Day-ahead UK wind forecast visibility and forecast accuracy analysis.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

_client = ElexonClient()
_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_cache_lock = asyncio.Lock()
LONDON = ZoneInfo("Europe/London")


def validate_month(value: str) -> tuple[int, int]:
    try:
        parsed = datetime.strptime(value, "%Y-%m")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="decision_month must use YYYY-MM format.") from exc
    return parsed.year, parsed.month


def validate_cutoff(value: str) -> None:
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="cutoff_time must use HH:MM (24-hour) format.") from exc


async def load_dashboard(decision_month: str, cutoff_time: str) -> dict:
    year, month = validate_month(decision_month)
    validate_cutoff(cutoff_time)
    first_decision = date(year, month, 1)
    next_month = date(year + (month == 12), month % 12 + 1, 1)
    last_decision = next_month - timedelta(days=1)
    first_delivery = first_decision + timedelta(days=1)
    last_delivery = last_decision + timedelta(days=1)

    cutoff_hour, cutoff_minute = (int(part) for part in cutoff_time.split(":"))
    publish_from_local = datetime.combine(first_decision, time.min, tzinfo=LONDON) - timedelta(days=7)
    publish_to_local = datetime.combine(last_decision, time(cutoff_hour, cutoff_minute), tzinfo=LONDON)
    publish_from = publish_from_local.astimezone(ZoneInfo("UTC"))
    publish_to = publish_to_local.astimezone(ZoneInfo("UTC"))

    actual_rows, forecast_rows = await asyncio.gather(
        _client.get_wind_actuals(first_delivery, last_delivery),
        _client.get_wind_forecasts(publish_from, publish_to),
    )
    if not actual_rows:
        raise HTTPException(
            status_code=502,
            detail="Elexon returned no FUELHH wind actuals for this delivery window. Try again or check the Elexon API.",
        )
    if not forecast_rows:
        raise HTTPException(
            status_code=502,
            detail="Elexon returned no WINDFOR forecasts for this publication window. Try again or check the Elexon API.",
        )
    return build_dashboard(decision_month, cutoff_time, actual_rows, forecast_rows)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "service": "WindVision API", "default_decision_month": DEFAULT_DECISION_MONTH}


@app.get("/api/dashboard")
async def dashboard(
    decision_month: str = Query(DEFAULT_DECISION_MONTH, description="Month in which day-ahead purchase decisions are made, YYYY-MM."),
    cutoff_time: str = Query(DEFAULT_CUTOFF_TIME, description="Latest forecast publication time allowed, UK local time HH:MM."),
    refresh: bool = Query(False, description="Bypass the short in-memory cache."),
) -> dict:
    validate_month(decision_month)
    validate_cutoff(cutoff_time)
    key = (decision_month, cutoff_time)

    async with _cache_lock:
        cached = _cache.get(key)
        if cached and not refresh and clock.monotonic() - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

    try:
        result = await load_dashboard(decision_month, cutoff_time)
    except ElexonAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # keep unexpected data-shape issues readable in the UI
        raise HTTPException(status_code=500, detail=f"WindVision could not process the Elexon response: {exc}") from exc

    async with _cache_lock:
        _cache[key] = (clock.monotonic(), result)
    return result
