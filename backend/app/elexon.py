from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from typing import Any

import httpx

from .config import ELEXON_BASE_URL, REQUEST_TIMEOUT_SECONDS


class ElexonAPIError(RuntimeError):
    """Raised when Elexon's API cannot provide a usable response."""


def _extract_rows(payload: Any) -> list[dict[str, Any]]:
    """Support both stream arrays and the wrapped {data: [...]} JSON shape."""
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        # Some API responses can wrap data more than once.
        for value in payload.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value
    return []


def _iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class ElexonClient:
    def __init__(self) -> None:
        self.base_url = ELEXON_BASE_URL

    async def _get_rows(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = {"Accept": "application/json", "User-Agent": "WindVision/1.0"}
        last_error: Exception | None = None

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            for attempt in range(3):
                try:
                    response = await client.get(url, params=params, headers=headers)
                    if response.status_code == 429 or response.status_code >= 500:
                        response.raise_for_status()
                    response.raise_for_status()
                    rows = _extract_rows(response.json())
                    return rows
                except (httpx.HTTPError, ValueError) as exc:
                    last_error = exc
                    if attempt < 2:
                        await asyncio.sleep(1.2 * (attempt + 1))

        raise ElexonAPIError(
            f"Could not retrieve {path} from Elexon after 3 attempts. "
            f"Check your internet connection and the Elexon API. Details: {last_error}"
        ) from last_error

    async def get_wind_actuals(self, start_date: date, end_date: date) -> list[dict[str, Any]]:
        """Fetch WIND outturns for a settlement-date range (inclusive)."""
        return await self._get_rows(
            "datasets/FUELHH/stream",
            {
                "settlementDateFrom": start_date.isoformat(),
                "settlementDateTo": end_date.isoformat(),
                "fuelType": "WIND",
            },
        )

    async def get_wind_forecasts(
        self, publish_from: datetime, publish_to: datetime
    ) -> list[dict[str, Any]]:
        """Fetch forecast vintages by their publication-time range."""
        return await self._get_rows(
            "datasets/WINDFOR/stream",
            {
                "publishDateTimeFrom": _iso_utc(publish_from),
                "publishDateTimeTo": _iso_utc(publish_to),
            },
        )
