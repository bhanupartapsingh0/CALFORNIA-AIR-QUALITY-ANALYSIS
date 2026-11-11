-- =====================================================================
-- California Air Quality Analysis (2015-2024)
-- Database: MySQL 8.0+
-- File: sql/analysis_queries.sql
-- Description: 10 Analytical Queries using JOINs, GROUP BY, CTEs, and Window Functions
-- =====================================================================

USE california_air_db;


-- =====================================================================
-- QUERY 1: Worst Counties Per Year (Ranked by Mean AQI)
-- Technique: CTE, Window Function DENSE_RANK() OVER (PARTITION BY ... ORDER BY ...)
-- Answers: Which counties had the most severe air quality in each year from 2015 to 2024?
-- =====================================================================
WITH annual_county_stats AS (
    SELECT 
        EXTRACT(YEAR FROM date) AS report_year,
        county,
        ROUND(AVG(aqi), 2) AS mean_aqi,
        MAX(aqi) AS peak_aqi,
        SUM(CASE WHEN aqi > 100 THEN 1 ELSE 0 END) AS unhealthy_days,
        COUNT(*) AS total_monitored_days
    FROM aqi_daily
    GROUP BY EXTRACT(YEAR FROM date), county
),
ranked_counties AS (
    SELECT 
        report_year,
        county,
        mean_aqi,
        peak_aqi,
        unhealthy_days,
        DENSE_RANK() OVER (
            PARTITION BY report_year 
            ORDER BY mean_aqi DESC
        ) AS worst_rank
    FROM annual_county_stats
)
SELECT 
    report_year,
    worst_rank,
    county,
    mean_aqi,
    peak_aqi,
    unhealthy_days
FROM ranked_counties
WHERE worst_rank <= 3
ORDER BY report_year ASC, worst_rank ASC;



-- =====================================================================
-- QUERY 2: Seasonal Air Quality Trends & Pollutant Regime Dynamics
-- Technique: CASE statement grouping, Multi-Dimensional GROUP BY, Aggregate Percentages
-- Answers: How does California air quality change across seasons, and how does the primary pollutant shift?
-- =====================================================================
SELECT 
    CASE 
        WHEN MONTH(date) IN (12, 1, 2) THEN 'Winter (Dec-Feb): Radiation Inversions'
        WHEN MONTH(date) IN (3, 4, 5)  THEN 'Spring (Mar-May): Atmospheric Dispersion'
        WHEN MONTH(date) IN (6, 7)     THEN 'Early Summer (Jun-Jul): Heat & Ozone'
        ELSE 'Autumn (Aug-Nov): Peak Wildfire & Stagnation'
    END AS meteorological_season,
    COUNT(*) AS total_daily_records,
    ROUND(AVG(aqi), 1) AS avg_aqi,
    MAX(aqi) AS max_recorded_aqi,
    ROUND(SUM(CASE WHEN aqi > 100 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS pct_unhealthy_days,
    ROUND(SUM(CASE WHEN defining_parameter = 'PM2.5' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS pct_pm25_driven,
    ROUND(SUM(CASE WHEN defining_parameter = 'Ozone' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS pct_ozone_driven
FROM aqi_daily
GROUP BY 
    CASE 
        WHEN MONTH(date) IN (12, 1, 2) THEN 'Winter (Dec-Feb): Radiation Inversions'
        WHEN MONTH(date) IN (3, 4, 5)  THEN 'Spring (Mar-May): Atmospheric Dispersion'
        WHEN MONTH(date) IN (6, 7)     THEN 'Early Summer (Jun-Jul): Heat & Ozone'
        ELSE 'Autumn (Aug-Nov): Peak Wildfire & Stagnation'
    END
ORDER BY avg_aqi DESC;



-- =====================================================================
-- QUERY 3: 30-Day Rolling Average AQI for Los Angeles County
-- Technique: Sliding Window Frame (ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
-- Answers: How did long-term smoothed air quality trend in LA over time, smoothing daily volatility?
-- =====================================================================
SELECT 
    county,
    date,
    aqi AS daily_aqi,
    category,
    defining_parameter,
    -- 7-Day short-term moving average
    ROUND(AVG(aqi) OVER (
        ORDER BY date 
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ), 1) AS rolling_avg_7day,
    -- 30-Day medium-term moving average
    ROUND(AVG(aqi) OVER (
        ORDER BY date 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ), 1) AS rolling_avg_30day,
    -- Difference from 30-day baseline
    ROUND(aqi - AVG(aqi) OVER (
        ORDER BY date 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ), 1) AS deviation_from_30day_trend
FROM aqi_daily
WHERE county = 'Los Angeles'
ORDER BY date DESC
LIMIT 120;



-- =====================================================================
-- QUERY 4: Year-over-Year (YoY) Change in "Good" AQI Days by County
-- Technique: CTE, Window Function LAG() OVER (PARTITION BY ... ORDER BY ...), Percentage Delta
-- Answers: Did California counties gain or lose clean air days year over year?
-- =====================================================================
WITH yearly_good_days AS (
    SELECT 
        EXTRACT(YEAR FROM date) AS report_year,
        county,
        SUM(CASE WHEN aqi <= 50 THEN 1 ELSE 0 END) AS good_days,
        COUNT(*) AS total_days
    FROM aqi_daily
    GROUP BY EXTRACT(YEAR FROM date), county
),
yoy_calculations AS (
    SELECT 
        report_year,
        county,
        good_days,
        LAG(good_days, 1) OVER (
            PARTITION BY county 
            ORDER BY report_year
        ) AS prior_year_good_days
    FROM yearly_good_days
)
SELECT 
    report_year,
    county,
    good_days,
    prior_year_good_days,
    (good_days - prior_year_good_days) AS net_change_good_days,
    ROUND(
        ((good_days - prior_year_good_days) * 100.0 / NULLIF(prior_year_good_days, 0)), 
        2
    ) AS pct_change_good_days
FROM yoy_calculations
WHERE prior_year_good_days IS NOT NULL
ORDER BY report_year DESC, pct_change_good_days ASC;



-- =====================================================================
-- QUERY 5: Wildfire Season (Aug-Oct) vs. Non-Wildfire Season Impact
-- Technique: CTE, Self-JOIN on County & Year, Multiplier & Percentage Metrics
-- Answers: Exactly how much does the August-October wildfire season degrade air quality compared to the rest of the year?
-- =====================================================================
WITH wildfire_season_stats AS (
    SELECT 
        EXTRACT(YEAR FROM date) AS report_year,
        county,
        ROUND(AVG(aqi), 1) AS wildfire_avg_aqi,
        MAX(aqi) AS wildfire_peak_aqi,
        SUM(CASE WHEN aqi > 100 THEN 1 ELSE 0 END) AS wildfire_unhealthy_days,
        COUNT(*) AS wildfire_days
    FROM aqi_daily
    WHERE MONTH(date) IN (8, 9, 10)
    GROUP BY EXTRACT(YEAR FROM date), county
),
non_wildfire_season_stats AS (
    SELECT 
        EXTRACT(YEAR FROM date) AS report_year,
        county,
        ROUND(AVG(aqi), 1) AS regular_avg_aqi,
        MAX(aqi) AS regular_peak_aqi,
        SUM(CASE WHEN aqi > 100 THEN 1 ELSE 0 END) AS regular_unhealthy_days,
        COUNT(*) AS regular_days
    FROM aqi_daily
    WHERE MONTH(date) NOT IN (8, 9, 10)
    GROUP BY EXTRACT(YEAR FROM date), county
)
SELECT 
    w.report_year,
    w.county,
    w.wildfire_avg_aqi,
    nw.regular_avg_aqi,
    ROUND(w.wildfire_avg_aqi - nw.regular_avg_aqi, 1) AS smoke_penalty_aqi,
    ROUND(w.wildfire_avg_aqi / nw.regular_avg_aqi, 2) AS pollution_multiplier,
    w.wildfire_unhealthy_days,
    nw.regular_unhealthy_days
FROM wildfire_season_stats w
JOIN non_wildfire_season_stats nw 
  ON w.report_year = nw.report_year 
 AND w.county = nw.county
WHERE w.report_year IN (2018, 2020, 2021, 2024) -- Landmark historic California fire seasons
ORDER BY smoke_penalty_aqi DESC
LIMIT 20;



-- =====================================================================
-- QUERY 6: Longest Consecutive Streak of Unhealthy Days (Island & Gap Analysis)
-- Technique: Double ROW_NUMBER() Window Functions to detect contiguous island sequences
-- Answers: Which counties experienced the longest unbroken spells of hazardous or unhealthy air?
-- =====================================================================
WITH unhealthy_flags AS (
    SELECT 
        county,
        date,
        aqi,
        CASE WHEN aqi > 100 THEN 1 ELSE 0 END AS is_unhealthy
    FROM aqi_daily
),
grouped_streaks AS (
    SELECT 
        county,
        date,
        aqi,
        is_unhealthy,
        ROW_NUMBER() OVER (PARTITION BY county ORDER BY date) -
        ROW_NUMBER() OVER (PARTITION BY county, is_unhealthy ORDER BY date) AS streak_group_id
    FROM unhealthy_flags
    WHERE is_unhealthy = 1
),
streak_aggregates AS (
    SELECT 
        county,
        MIN(date) AS streak_start_date,
        MAX(date) AS streak_end_date,
        COUNT(*) AS streak_duration_days,
        ROUND(AVG(aqi), 1) AS avg_aqi_during_streak,
        MAX(aqi) AS max_aqi_during_streak
    FROM grouped_streaks
    GROUP BY county, streak_group_id
)
SELECT 
    county,
    streak_duration_days,
    streak_start_date,
    streak_end_date,
    avg_aqi_during_streak,
    max_aqi_during_streak
FROM streak_aggregates
ORDER BY streak_duration_days DESC
LIMIT 15;



-- =====================================================================
-- QUERY 7: Decadal Air Quality Trajectory (2015 vs. 2024 Rank Shift)
-- Technique: CTE, Self-JOIN, Window Function RANK() OVER (ORDER BY ...)
-- Answers: Over the 10-year period (2015-2024), which counties showed structural improvement vs degradation?
-- =====================================================================
WITH stats_2015 AS (
    SELECT 
        county,
        ROUND(AVG(aqi), 1) AS avg_aqi_2015,
        RANK() OVER (ORDER BY AVG(aqi) DESC) AS rank_2015
    FROM aqi_daily
    WHERE EXTRACT(YEAR FROM date) = 2015
    GROUP BY county
),
stats_2024 AS (
    SELECT 
        county,
        ROUND(AVG(aqi), 1) AS avg_aqi_2024,
        RANK() OVER (ORDER BY AVG(aqi) DESC) AS rank_2024
    FROM aqi_daily
    WHERE EXTRACT(YEAR FROM date) = 2024
    GROUP BY county
)
SELECT 
    s15.county,
    s15.avg_aqi_2015,
    s24.avg_aqi_2024,
    ROUND(s24.avg_aqi_2024 - s15.avg_aqi_2015, 1) AS aqi_10yr_change,
    s15.rank_2015 AS rank_in_2015,
    s24.rank_2024 AS rank_in_2024,
    -- Positive shift means county got cleaner relative to peers (rank dropped down the worst list)
    (s24.rank_2024 - s15.rank_2015) AS relative_rank_shift
FROM stats_2015 s15
JOIN stats_2024 s24 ON s15.county = s24.county
ORDER BY aqi_10yr_change ASC;



-- =====================================================================
-- QUERY 8: Dominant Pollutant Regime Shift (PM2.5 vs Ozone Analysis)
-- Technique: Conditional aggregation, Pivot percentages, Group By County
-- Answers: What is the primary environmental threat driving air quality alerts in each county?
-- =====================================================================
SELECT 
    county,
    COUNT(*) AS total_monitored_days,
    ROUND(SUM(CASE WHEN defining_parameter = 'PM2.5' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS pct_pm25_days,
    ROUND(SUM(CASE WHEN defining_parameter = 'Ozone' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS pct_ozone_days,
    ROUND(SUM(CASE WHEN defining_parameter NOT IN ('PM2.5', 'Ozone') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS pct_other_pollutant_days,
    CASE 
        WHEN SUM(CASE WHEN defining_parameter = 'PM2.5' THEN 1 ELSE 0 END) > SUM(CASE WHEN defining_parameter = 'Ozone' THEN 1 ELSE 0 END)
        THEN 'Particulate-Dominated (PM2.5 Smoke/Dust Trap)'
        ELSE 'Photochemical-Dominated (Ozone Smog)'
    END AS atmospheric_regime
FROM aqi_daily
GROUP BY county
ORDER BY pct_pm25_days DESC;



-- =====================================================================
-- QUERY 9: Extreme Outlier Pollution Spikes & Smoke Anomaly Detection
-- Technique: Window functions AVG() and STDDEV() to detect z-score anomalies (> 2.5 SD)
-- Answers: On which specific dates did catastrophic smoke plume events spike AQI beyond 2.5 sigma above the annual baseline?
-- =====================================================================
WITH annual_baselines AS (
    SELECT 
        county,
        date,
        aqi,
        category,
        defining_parameter,
        ROUND(AVG(aqi) OVER (
            PARTITION BY county, EXTRACT(YEAR FROM date)
        ), 1) AS county_year_mean,
        ROUND(STDDEV(aqi) OVER (
            PARTITION BY county, EXTRACT(YEAR FROM date)
        ), 1) AS county_year_stddev
    FROM aqi_daily
),
anomalies AS (
    SELECT 
        county,
        date,
        aqi,
        category,
        defining_parameter,
        county_year_mean,
        county_year_stddev,
        ROUND((aqi - county_year_mean) / NULLIF(county_year_stddev, 0), 2) AS z_score
    FROM annual_baselines
)
SELECT 
    county,
    date,
    aqi AS spike_aqi,
    county_year_mean AS baseline_mean,
    z_score,
    category,
    defining_parameter
FROM anomalies
WHERE z_score >= 2.5 AND aqi >= 150
ORDER BY z_score DESC
LIMIT 20;



-- =====================================================================
-- QUERY 10: California County Air Vulnerability & Health Risk Matrix
-- Technique: Multi-metric CTE, Composite Vulnerability Index calculation
-- Answers: Across the full 10-year span, what is the comprehensive health vulnerability ranking for all monitored counties?
-- =====================================================================
WITH county_profile AS (
    SELECT 
        county,
        COUNT(*) AS total_days,
        ROUND(AVG(aqi), 1) AS mean_aqi,
        MAX(aqi) AS peak_aqi,
        SUM(CASE WHEN aqi <= 50 THEN 1 ELSE 0 END) AS good_days,
        SUM(CASE WHEN aqi > 100 THEN 1 ELSE 0 END) AS unhealthy_days,
        SUM(CASE WHEN aqi > 200 THEN 1 ELSE 0 END) AS severe_days,
        SUM(CASE WHEN aqi > 300 THEN 1 ELSE 0 END) AS hazardous_days
    FROM aqi_daily
    GROUP BY county
)
SELECT 
    county,
    mean_aqi,
    peak_aqi,
    ROUND(good_days * 100.0 / total_days, 1) AS pct_clean_air_days,
    ROUND(unhealthy_days * 100.0 / total_days, 1) AS pct_unhealthy_days,
    severe_days,
    hazardous_days,
    -- Composite Risk Score (Scale 0 - 100)
    ROUND(
        (mean_aqi * 0.4) + 
        ((unhealthy_days * 100.0 / total_days) * 0.4) + 
        ((severe_days * 100.0 / total_days) * 0.2), 
        1
    ) AS vulnerability_risk_score,
    DENSE_RANK() OVER (
        ORDER BY (
            (mean_aqi * 0.4) + 
            ((unhealthy_days * 100.0 / total_days) * 0.4) + 
            ((severe_days * 100.0 / total_days) * 0.2)
        ) DESC
    ) AS vulnerability_rank
FROM county_profile
ORDER BY vulnerability_risk_score DESC;
