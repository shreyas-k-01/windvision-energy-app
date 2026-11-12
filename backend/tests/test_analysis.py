import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.analysis import build_dashboard, calculate_metrics


class AnalysisTests(unittest.TestCase):
    def test_error_metrics(self):
        metrics = calculate_metrics([
            (5000, 4600),
            (5200, 5100),
            (5500, 5400),
            (5300, 4800),
            (5100, 5000),
        ])
        self.assertEqual(metrics["count"], 5)
        self.assertEqual(metrics["mae_mw"], 240.0)
        self.assertEqual(metrics["rmse_mw"], 296.65)
        self.assertEqual(metrics["bias_mw"], 240.0)

    def test_hourly_actual_is_average_of_two_half_hour_readings(self):
        actuals = []
        forecasts = []
        first_delivery = datetime(2026, 1, 2, tzinfo=timezone.utc)
        for day_offset in range(31):
            delivery = first_delivery + timedelta(days=day_offset)
            decision_day = delivery.date() - timedelta(days=1)
            publish_time = f"{decision_day.isoformat()}T09:30:00Z"
            for hour in range(24):
                hour_start = delivery + timedelta(hours=hour)
                forecasts.append({
                    "startTime": hour_start.isoformat().replace("+00:00", "Z"),
                    "publishTime": publish_time,
                    "generation": 1100,
                })
                for minute, generation in ((0, 1000), (30, 1200)):
                    start = hour_start + timedelta(minutes=minute)
                    actuals.append({
                        "fuelType": "WIND",
                        "startTime": start.isoformat().replace("+00:00", "Z"),
                        "generation": generation,
                    })

        result = build_dashboard("2026-01", "10:00", actuals, forecasts)
        jan14 = [row for row in result["records"] if row["delivery_date"] == "2026-01-14"]
        self.assertEqual(len(jan14), 24)
        self.assertTrue(all(row["forecast_mw"] == 1100 for row in jan14))
        self.assertTrue(all(row["actual_mw"] == 1100 for row in jan14))
        self.assertEqual(result["summary"]["expected_periods"], 31 * 24)
        self.assertEqual(result["summary"]["coverage_pct"], 100.0)

    def test_forecast_after_cutoff_is_not_selected(self):
        actuals = []
        forecasts = []
        delivery = datetime(2026, 1, 14, tzinfo=timezone.utc)
        for hour in range(24):
            start = delivery + timedelta(hours=hour)
            start_text = start.isoformat().replace("+00:00", "Z")
            actuals.extend([
                {"fuelType": "WIND", "startTime": start_text, "generation": 1000},
                {"fuelType": "WIND", "startTime": (start + timedelta(minutes=30)).isoformat().replace("+00:00", "Z"), "generation": 1000},
            ])
            forecasts.append({"startTime": start_text, "publishTime": "2026-01-13T09:00:00Z", "generation": 1100})
            forecasts.append({"startTime": start_text, "publishTime": "2026-01-13T11:00:00Z", "generation": 900})

        result = build_dashboard("2026-01", "10:00", actuals, forecasts)
        jan14 = [row for row in result["records"] if row["delivery_date"] == "2026-01-14"]
        self.assertEqual(len(jan14), 24)
        self.assertTrue(all(row["forecast_mw"] == 1100 for row in jan14))
        self.assertTrue(all(row["publish_time"] == "2026-01-13T09:00Z" for row in jan14))

    def test_january_decision_window_includes_february_first_delivery(self):
        result = build_dashboard("2026-01", "10:00", [], [])
        self.assertEqual(len(result["daily_metrics"]), 31)
        self.assertEqual(result["daily_metrics"][0]["delivery_date"], "2026-01-02")
        self.assertEqual(result["daily_metrics"][-1]["delivery_date"], "2026-02-01")
        self.assertEqual(result["summary"]["expected_periods"], 31 * 24)


if __name__ == "__main__":
    unittest.main()
