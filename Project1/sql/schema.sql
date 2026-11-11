-- =====================================================================
-- California Air Quality Analysis (2015-2024)
-- Database: MySQL 8.0+
-- File: sql/schema.sql
-- Description: DDL table definition for aqi_daily and automated LOAD DATA script
-- =====================================================================

-- Step 1: Create Database if needed
CREATE DATABASE IF NOT EXISTS california_air_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE california_air_db;

-- Step 2: Drop existing table to ensure idempotent runs
DROP TABLE IF EXISTS aqi_daily;

-- Step 3: Create aqi_daily table
CREATE TABLE aqi_daily (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Surrogate primary key',
    county               VARCHAR(64)  NOT NULL COMMENT 'California County name',
    date                 DATE         NOT NULL COMMENT 'Measurement date (YYYY-MM-DD)',
    aqi                  SMALLINT UNSIGNED NOT NULL COMMENT 'Air Quality Index value (0 to 500+)',
    category             VARCHAR(32)  NOT NULL COMMENT 'EPA AQI Category (e.g. Good, Moderate, Unhealthy)',
    defining_parameter   VARCHAR(32)  NOT NULL COMMENT 'Primary pollutant driving AQI (e.g. PM2.5, Ozone)',
    created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP COMMENT 'Audit timestamp',
    
    -- Integrity Constraints
    CONSTRAINT uq_county_date UNIQUE (county, date),
    CONSTRAINT chk_aqi_range CHECK (aqi >= 0 AND aqi <= 1000)
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_unicode_ci 
  COMMENT='Cleaned daily EPA AQI records for California counties (2015-2024)';

-- Step 4: High-Performance Composite & Slicing Indexes
-- Index for date-range window queries and time-series aggregations
CREATE INDEX idx_aqi_date ON aqi_daily (date);

-- Index for county-specific queries
CREATE INDEX idx_aqi_county ON aqi_daily (county);

-- Covering composite index for window functions (LAG, RANK, Rolling Average)
CREATE INDEX idx_aqi_county_date_aqi ON aqi_daily (county, date, aqi);

-- Index for category and pollutant driver distribution queries
CREATE INDEX idx_aqi_category_param ON aqi_daily (category, defining_parameter);


-- =====================================================================
-- Step 5: Data Ingestion Script (LOAD DATA INFILE)
-- =====================================================================
-- Note: Replace '/path/to/data/processed/ca_aqi_clean.csv' with your absolute path.
-- On Windows: Use forward slashes (e.g. 'C:/project/data/processed/ca_aqi_clean.csv')
-- If using MySQL Workbench or CLI with local file permissions:
-- Ensure `local_infile = 1` is enabled on both client and server:
--   SET GLOBAL local_infile = 1;

LOAD DATA LOCAL INFILE 'C:/Users/makha/.gemini/antigravity/scratch/california-air-analysis/data/processed/ca_aqi_clean.csv'
INTO TABLE aqi_daily
FIELDS TERMINATED BY ',' 
OPTIONALLY ENCLOSED BY '"' 
ESCAPED BY '\\'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(@col_county, @col_date, @col_aqi, @col_category, @col_param)
SET
    county             = TRIM(@col_county),
    date               = STR_TO_DATE(TRIM(@col_date), '%Y-%m-%d'),
    aqi                = CAST(TRIM(@col_aqi) AS UNSIGNED),
    category           = TRIM(@col_category),
    defining_parameter = TRIM(@col_param);

-- Step 6: Verify Ingestion Results
SELECT 
    COUNT(*) AS total_rows_loaded,
    MIN(date) AS earliest_date,
    MAX(date) AS latest_date,
    COUNT(DISTINCT county) AS unique_counties,
    ROUND(AVG(aqi), 1) AS overall_avg_aqi
FROM aqi_daily;
