from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Any

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc


def parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC).replace(second=0, microsecond=0)
    except (TypeError, ValueError):
        return None


def as_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def iso(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat(timespec="minutes").replace("+00:00", "Z") if value else None


def calculate_metrics(pairs: list[tuple[float, float]]) -> dict[str, float | int | None]:
    """Calculate errors where error = forecast MW - actual MW."""
    if not pairs:
        return {
            "count": 0,
            "mae_mw": None,
            "rmse_mw": None,
            "mape_pct": None,
            "bias_mw": None,
        }

    errors = [forecast - actual for forecast, actual in pairs]
    absolute_errors = [abs(error) for error in errors]
    percentage_errors = [
        abs(forecast - actual) / abs(actual) * 100
        for forecast, actual in pairs
        if abs(actual) > 1e-9
    ]
    return {
        "count": len(pairs),
        "mae_mw": round(sum(absolute_errors) / len(absolute_errors), 2),
        "rmse_mw": round(math.sqrt(sum(error * error for error in errors) / len(errors)), 2),
        "mape_pct": round(sum(percentage_errors) / len(percentage_errors), 2) if percentage_errors else None,
        "bias_mw": round(sum(errors) / len(errors), 2),
    }


def _actual_start(row: dict[str, Any]) -> datetime | None:
    start = parse_datetime(row.get("startTime"))
    if start:
        return start
    try:
        day = date.fromisoformat(str(row["settlementDate"])[:10])
        period = int(row["settlementPeriod"])
        return datetime.combine(day, time.min, tzinfo=UTC) + timedelta(minutes=(period - 1) * 30)
    except (KeyError, TypeError, ValueError):
        return None


def _build_actual_map(rows: list[dict[str, Any]]) -> dict[datetime, float]:
    """Average the two FUELHH half-hour readings into one UTC-hour value."""
    grouped: dict[datetime, list[float]] = defaultdict(list)
    for row in rows:
        if str(row.get("fuelType", "")).upper() != "WIND":
            continue
        start = _actual_start(row)
        generation = as_number(row.get("generation"))
        if start is not None and generation is not None:
            hour_start = start.replace(minute=0)
            grouped[hour_start].append(generation)
    return {
        hour: sum(values) / len(values)
        for hour, values in grouped.items()
        if values
    }


def build_dashboard(
    decision_month: str,
    cutoff_time: str,
    actual_rows: list[dict[str, Any]],
    forecast_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a decision-month dataset using hourly WINDFOR forecasts.

    Each decision date targets the following delivery day. For every delivery
    hour, use the latest forecast publication available at or before the
    selected decision cutoff in Europe/London. FUELHH actuals are half-hourly,
    so they are averaged into hourly values before forecast comparison.
    """
    year, month = (int(part) for part in decision_month.split("-"))
    first_decision = date(year, month, 1)
    next_month = date(year + (month == 12), month % 12 + 1, 1)
    last_decision = next_month - timedelta(days=1)
    first_delivery = first_decision + timedelta(days=1)
    last_delivery = last_decision + timedelta(days=1)
    cutoff_hour, cutoff_minute = (int(part) for part in cutoff_time.split(":"))

    actual_map = _build_actual_map(actual_rows)
    latest_forecasts: dict[datetime, tuple[datetime, float]] = {}
    versions: dict[tuple[date, datetime], list[float]] = defaultdict(list)

    for row in forecast_rows:
        start = parse_datetime(row.get("startTime"))
        published = parse_datetime(row.get("publishTime"))
        generation = as_number(row.get("generation"))
        if start is None or published is None or generation is None:
            continue

        delivery_day = start.astimezone(LONDON).date()
        if delivery_day < first_delivery or delivery_day > last_delivery:
            continue

        decision_day = delivery_day - timedelta(days=1)
        cutoff_local = datetime.combine(
            decision_day,
            time(cutoff_hour, cutoff_minute),
            tzinfo=LONDON,
        )
        if published > cutoff_local.astimezone(UTC):
            continue

        versions[(delivery_day, published)].append(generation)
        current = latest_forecasts.get(start)
        if current is None or published > current[0]:
            latest_forecasts[start] = (published, generation)

    records: list[dict[str, Any]] = []
    daily_pairs: dict[date, list[tuple[float, float]]] = defaultdict(list)
    all_pairs: list[tuple[float, float]] = []
    daily_forecast_values: dict[date, list[float]] = defaultdict(list)
    daily_actual_values: dict[date, list[float]] = defaultdict(list)

    delivery_day = first_delivery
    while delivery_day <= last_delivery:
        decision_day = delivery_day - timedelta(days=1)
        for hour_period in range(1, 25):
            start = datetime.combine(delivery_day, time.min, tzinfo=UTC) + timedelta(hours=hour_period - 1)
            actual = actual_map.get(start)
            chosen = latest_forecasts.get(start)
            forecast = chosen[1] if chosen else None
            published = chosen[0] if chosen else None
            error = forecast - actual if forecast is not None and actual is not None else None

            record = {
                "decision_date": decision_day.isoformat(),
                "delivery_date": delivery_day.isoformat(),
                "start_time": iso(start),
                "settlement_period": hour_period,
                "publish_time": iso(published),
                "forecast_mw": round(forecast, 2) if forecast is not None else None,
                "actual_mw": round(actual, 2) if actual is not None else None,
                "error_mw": round(error, 2) if error is not None else None,
            }
            records.append(record)

            if forecast is not None:
                daily_forecast_values[delivery_day].append(forecast)
            if actual is not None:
                daily_actual_values[delivery_day].append(actual)
            if forecast is not None and actual is not None:
                pair = (forecast, actual)
                daily_pairs[delivery_day].append(pair)
                all_pairs.append(pair)
        delivery_day += timedelta(days=1)

    daily_metrics: list[dict[str, Any]] = []
    delivery_day = first_delivery
    while delivery_day <= last_delivery:
        metrics = calculate_metrics(daily_pairs[delivery_day])
        forecast_values = daily_forecast_values[delivery_day]
        actual_values = daily_actual_values[delivery_day]
        daily_metrics.append({
            "decision_date": (delivery_day - timedelta(days=1)).isoformat(),
            "delivery_date": delivery_day.isoformat(),
            **metrics,
            "forecast_periods": len(forecast_values),
            "actual_periods": len(actual_values),
            "average_forecast_mw": round(sum(forecast_values) / len(forecast_values), 2) if forecast_values else None,
            "average_actual_mw": round(sum(actual_values) / len(actual_values), 2) if actual_values else None,
        })
        delivery_day += timedelta(days=1)

    forecast_versions: list[dict[str, Any]] = []
    for (delivery_day, publish_time), values in sorted(
        versions.items(), key=lambda item: (item[0][0], item[0][1])
    ):
        forecast_versions.append({
            "decision_date": (delivery_day - timedelta(days=1)).isoformat(),
            "delivery_date": delivery_day.isoformat(),
            "publish_time": iso(publish_time),
            "average_generation_mw": round(sum(values) / len(values), 2),
            "periods_available": len(values),
        })

    summary = calculate_metrics(all_pairs)
    expected_periods = ((last_decision - first_decision).days + 1) * 24
    forecast_values_all = [row["forecast_mw"] for row in records if row["forecast_mw"] is not None]
    actual_values_all = [row["actual_mw"] for row in records if row["actual_mw"] is not None]
    summary.update({
        "expected_periods": expected_periods,
        "coverage_pct": round(len(all_pairs) / expected_periods * 100, 2) if expected_periods else 0,
        "forecast_periods": len(forecast_values_all),
        "actual_periods": len(actual_values_all),
        "average_forecast_mw": round(sum(forecast_values_all) / len(forecast_values_all), 2) if forecast_values_all else None,
        "average_actual_mw": round(sum(actual_values_all) / len(actual_values_all), 2) if actual_values_all else None,
    })

    return {
        "meta": {
            "source": "Elexon BMRS",
            "decision_month": decision_month,
            "decision_date_start": first_decision.isoformat(),
            "decision_date_end": last_decision.isoformat(),
            "delivery_date_start": first_delivery.isoformat(),
            "delivery_date_end": last_delivery.isoformat(),
            "cutoff_time_uk": cutoff_time,
            "timezone": "Europe/London",
            "actual_dataset": "FUELHH (fuelType=WIND), hourly averages",
            "forecast_dataset": "WINDFOR, hourly",
            "selection_rule": "Latest forecast publication at or before the configured decision cutoff, selected per hourly period.",
            "comparison_resolution": "Hourly",
            "note": "January decision dates run from 1–31 January; each decision targets the following delivery day, so the delivery window includes 1 February. Actuals are averaged from half-hourly readings for hourly comparison.",
        },
        "summary": summary,
        "daily_metrics": daily_metrics,
        "records": records,
        "forecast_versions": forecast_versions,
    }
