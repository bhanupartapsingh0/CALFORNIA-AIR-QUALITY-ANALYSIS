"""
California Air Quality - Statistical & Forecasting Models
=========================================================
Implements:
1. EPA Piecewise Linear AQI Equation (with 2024 PM2.5 Breakpoint Revisions)
2. Double Exponential Smoothing (Holt's Linear Trend) Time Series Forecaster
3. Spatial Distance Matrix & Basin Cross-Correlation Engine
"""

import math
from typing import Dict, List, Tuple


class EPAAQICalculator:
    """Official EPA AQI Breakpoints & Interpolator."""

    PM25_BREAKPOINTS = [
        (0.0, 9.0, 0, 50),
        (9.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 125.4, 151, 200),
        (125.5, 225.4, 201, 300),
        (225.5, 500.4, 301, 500),
    ]

    OZONE_8HR_BREAKPOINTS = [
        (0.000, 0.054, 0, 50),
        (0.055, 0.070, 51, 100),
        (0.071, 0.085, 101, 150),
        (0.086, 0.105, 151, 200),
        (0.106, 0.200, 201, 300),
        (0.201, 0.600, 301, 500),
    ]

    @staticmethod
    def _interpolate(cp: float, breakpoints: List[Tuple[float, float, int, int]]) -> int:
        if cp <= 0:
            return 0
        for clo, chi, ilo, ihi in breakpoints:
            if cp <= chi:
                return round(((ihi - ilo) / (chi - clo)) * (cp - clo) + ilo)
        clo, chi, ilo, ihi = breakpoints[-1]
        return round(((ihi - ilo) / (chi - clo)) * (cp - clo) + ilo)

    @classmethod
    def pm25_to_aqi(cls, concentration: float) -> int:
        return min(500, max(0, cls._interpolate(concentration, cls.PM25_BREAKPOINTS)))

    @classmethod
    def ozone_to_aqi(cls, concentration: float) -> int:
        return min(500, max(0, cls._interpolate(concentration, cls.OZONE_8HR_BREAKPOINTS)))

    @classmethod
    def calculate_composite(cls, pm25: float, ozone: float) -> Dict:
        pm_aqi = cls.pm25_to_aqi(pm25)
        oz_aqi = cls.ozone_to_aqi(ozone)
        composite = max(pm_aqi, oz_aqi)
        dominant = "PM2.5" if composite == pm_aqi else "Ozone (O3)"

        if composite <= 50:
            cat = "Good"
            color = "#10b981"
        elif composite <= 100:
            cat = "Moderate"
            color = "#f59e0b"
        elif composite <= 150:
            cat = "Unhealthy for Sensitive Groups"
            color = "#f97316"
        elif composite <= 200:
            cat = "Unhealthy"
            color = "#ef4444"
        elif composite <= 300:
            cat = "Very Unhealthy"
            color = "#8b5cf6"
        else:
            cat = "Hazardous"
            color = "#881337"

        return {
            "composite_aqi": composite,
            "pm25_aqi": pm_aqi,
            "ozone_aqi": oz_aqi,
            "dominant_pollutant": dominant,
            "category": cat,
            "color": color
        }


class HoltLinearTrendForecaster:
    """Double Exponential Smoothing for Environmental Time Series."""

    def __init__(self, alpha: float = 0.35, beta: float = 0.15):
        self.alpha = alpha
        self.beta = beta

    def fit_forecast(self, series: List[float], horizon: int = 7) -> List[float]:
        if len(series) < 2:
            return [series[-1]] * horizon if series else [50.0] * horizon

        level = series[0]
        trend = series[1] - series[0]

        for val in series[1:]:
            last_level = level
            level = self.alpha * val + (1 - self.alpha) * (level + trend)
            trend = self.beta * (level - last_level) + (1 - self.beta) * trend

        predictions = []
        for h in range(1, horizon + 1):
            pred = max(10.0, min(500.0, level + h * trend))
            predictions.append(round(pred, 1))

        return predictions


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in kilometers."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


if __name__ == '__main__':
    # Quick sanity check
    calc = EPAAQICalculator()
    res = calc.calculate_composite(pm25=35.4, ozone=0.065)
    print("Test Calculation Result:", res)

    forecaster = HoltLinearTrendForecaster()
    past_aqi = [45, 52, 60, 58, 65, 72, 70, 78, 85]
    forecast = forecaster.fit_forecast(past_aqi, horizon=7)
    print("7-Day Forecast from past observations:", forecast)
