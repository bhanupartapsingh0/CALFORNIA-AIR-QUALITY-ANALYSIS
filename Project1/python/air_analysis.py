"""
California Air Quality & Atmospheric Pollution Analysis
======================================================
Comprehensive Environmental Data Science Pipeline:
1. Multi-Year Historical Analysis across CARB Air Basins (2021-2026)
2. Seasonal Meteorological Inversion vs Photochemical Heat Waves
3. Wildfire Acres Burned vs PM2.5 Inhalation Risk Correlation
4. EPA Standard AQI Calculation & Exceedance Frequency
"""

import os
import sys
import pandas as pd
import numpy as np

# Base paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')

HISTORICAL_CSV = os.path.join(DATA_DIR, 'daily_aqi_historical.csv')
STATIONS_CSV = os.path.join(DATA_DIR, 'california_stations.csv')
WILDFIRE_CSV = os.path.join(DATA_DIR, 'wildfire_impact_study.csv')


def load_datasets():
    """Loads and validates California environmental datasets."""
    print("=" * 70)
    print("🌲 CALIFORNIA AIR QUALITY & ATMOSPHERIC ANALYSIS PIPELINE")
    print("=" * 70)

    if not os.path.exists(HISTORICAL_CSV):
        print(f"❌ Error: Dataset {HISTORICAL_CSV} not found. Please run seed script first.")
        sys.exit(1)

    df_hist = pd.read_csv(HISTORICAL_CSV, parse_dates=['date'])
    df_stations = pd.read_csv(STATIONS_CSV)
    df_wildfire = pd.read_csv(WILDFIRE_CSV)

    print(f"✅ Loaded {len(df_hist):,} daily air quality observations.")
    print(f"✅ Loaded {len(df_stations)} CARB monitoring stations.")
    print(f"✅ Loaded {len(df_wildfire)} wildfire incident records.")
    return df_hist, df_stations, df_wildfire


def analyze_basin_rankings(df):
    """Computes mean, median, peak AQI, and unhealthy days by California air basin."""
    print("\n" + "-" * 70)
    print("📊 1. AIR BASIN POLLUTION RANKINGS (CARB Standards)")
    print("-" * 70)

    basin_summary = df.groupby('basin').agg(
        Mean_AQI=('composite_aqi', 'mean'),
        Peak_AQI=('composite_aqi', 'max'),
        Mean_PM25=('pm25_ugm3', 'mean'),
        Mean_Ozone=('ozone_ppm', 'mean'),
        Total_Observations=('composite_aqi', 'count'),
        Unhealthy_Days=('composite_aqi', lambda x: (x > 100).sum())
    ).reset_index()

    basin_summary['Unhealthy_Pct'] = (basin_summary['Unhealthy_Days'] / basin_summary['Total_Observations'] * 100).round(2)
    basin_summary = basin_summary.sort_values(by='Mean_AQI', ascending=False)

    print(basin_summary.to_string(index=False))
    return basin_summary


def analyze_seasonal_patterns(df):
    """Analyzes winter stagnation (PM2.5 inversion) vs summer photochemical smog (Ozone)."""
    print("\n" + "-" * 70)
    print("❄️☀️ 2. SEASONAL AIR DYNAMICS & POLLUTANT REGIMES")
    print("-" * 70)

    # Define seasons
    def get_season(month):
        if month in [12, 1, 2]:
            return 'Winter (Stagnation & Inversions)'
        elif month in [3, 4, 5]:
            return 'Spring (Pacific Weather Fronts)'
        elif month in [6, 7, 8]:
            return 'Summer (Photochemical Smog & Heat)'
        else:
            return 'Autumn (Wildfire Smoke Trapping)'

    df['season'] = df['month'].apply(get_season)

    seasonal_stats = df.groupby(['basin', 'season']).agg(
        Mean_PM25=('pm25_ugm3', 'mean'),
        Mean_Ozone=('ozone_ppm', 'mean'),
        Mean_AQI=('composite_aqi', 'mean')
    ).round(3).reset_index()

    # Compare San Joaquin Valley vs SF Bay Area
    comparison = seasonal_stats[seasonal_stats['basin'].isin(['San Joaquin Valley', 'South Coast', 'San Francisco Bay Area'])]
    print(comparison.to_string(index=False))
    return seasonal_stats


def analyze_wildfire_correlation(df_hist, df_wildfire):
    """Analyzes statistical correlation between wildfire smoke and particulate matter."""
    print("\n" + "-" * 70)
    print("🔥 3. WILDFIRE INCIDENT & SMOKE CORRELATION STUDY")
    print("-" * 70)

    # Correlation between wildfire smoke index and PM2.5 in daily data
    corr_pm25 = df_hist['wildfire_smoke_index'].corr(df_hist['pm25_ugm3'])
    corr_aqi = df_hist['wildfire_smoke_index'].corr(df_hist['composite_aqi'])

    print(f"📈 Pearson Correlation (Smoke Index vs PM2.5 Concentration): r = {corr_pm25:.4f}")
    print(f"📈 Pearson Correlation (Smoke Index vs Composite AQI):       r = {corr_aqi:.4f}")

    print("\nAnnual Wildfire Severity vs Smoke Particulate Levels:")
    print(df_wildfire[['year', 'fire_name', 'acres_burned', 'max_smoke_index', 'statewide_avg_wildfire_pm25', 'health_advisory_days']].to_string(index=False))

    acres_corr = df_wildfire['acres_burned'].corr(df_wildfire['statewide_avg_wildfire_pm25'])
    print(f"\n🔥 Annual Acres Burned vs Avg Wildfire PM2.5 Correlation: r = {acres_corr:.4f}")


def run_pipeline():
    df_hist, df_stations, df_wildfire = load_datasets()
    analyze_basin_rankings(df_hist)
    analyze_seasonal_patterns(df_hist)
    analyze_wildfire_correlation(df_hist, df_wildfire)

    print("\n" + "=" * 70)
    print("✅ California Air Quality Pipeline execution completed.")
    print("=" * 70)


if __name__ == '__main__':
    run_pipeline()
