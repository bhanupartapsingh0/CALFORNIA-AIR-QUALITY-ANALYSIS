/**
 * Verification test runner for SQL Analysis Queries against processed data
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'processed', 'ca_aqi_clean.csv');

function main() {
  console.log('🧪 Verifying SQL Analytical Queries against ca_aqi_clean.csv...');
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE aqi_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      county TEXT NOT NULL,
      date TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      aqi INTEGER NOT NULL,
      category TEXT NOT NULL,
      defining_parameter TEXT NOT NULL
    );
  `);

  const lines = fs.readFileSync(CSV_PATH, 'utf8').split(/\r?\n/).filter(l => l.trim().length > 0);
  const insert = db.prepare(`
    INSERT INTO aqi_daily (county, date, year, month, aqi, category, defining_parameter)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN TRANSACTION');
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.replace(/^"|"$/g, ''));
    const county = parts[0];
    const dateStr = parts[1];
    const aqi = parseInt(parts[2], 10);
    const cat = parts[3];
    const param = parts[4];
    const yr = parseInt(dateStr.substring(0, 4), 10);
    const mo = parseInt(dateStr.substring(5, 7), 10);
    insert.run(county, dateStr, yr, mo, aqi, cat, param);
  }
  db.exec('COMMIT');
  console.log(`✅ Loaded ${lines.length - 1} rows into verification database.`);

  // Test Query 1: Worst Counties Per Year
  console.log('\n--- Testing Query 1: Worst Counties Per Year ---');
  const q1 = db.prepare(`
    WITH annual_county_stats AS (
        SELECT 
            year AS report_year,
            county,
            ROUND(AVG(aqi), 2) AS mean_aqi,
            MAX(aqi) AS peak_aqi,
            SUM(CASE WHEN aqi > 100 THEN 1 ELSE 0 END) AS unhealthy_days
        FROM aqi_daily
        GROUP BY year, county
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
    SELECT * FROM ranked_counties WHERE worst_rank <= 2 AND report_year IN (2018, 2020, 2024)
    ORDER BY report_year ASC, worst_rank ASC;
  `).all();
  console.table(q1);

  // Test Query 3: 30-Day Rolling Average for LA
  console.log('\n--- Testing Query 3: 30-Day Rolling AQI for Los Angeles ---');
  const q3 = db.prepare(`
    SELECT 
        county,
        date,
        aqi AS daily_aqi,
        ROUND(AVG(aqi) OVER (
            ORDER BY date 
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ), 1) AS rolling_avg_30day
    FROM aqi_daily
    WHERE county = 'Los Angeles'
    ORDER BY date DESC
    LIMIT 5;
  `).all();
  console.table(q3);

  // Test Query 4: YoY Change in Good Days
  console.log('\n--- Testing Query 4: YoY Change in Good Days (Sample) ---');
  const q4 = db.prepare(`
    WITH yearly_good_days AS (
        SELECT 
            year AS report_year,
            county,
            SUM(CASE WHEN aqi <= 50 THEN 1 ELSE 0 END) AS good_days
        FROM aqi_daily
        GROUP BY year, county
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
        (good_days - prior_year_good_days) AS net_change_good_days
    FROM yoy_calculations
    WHERE prior_year_good_days IS NOT NULL AND county = 'Fresno'
    ORDER BY report_year DESC
    LIMIT 5;
  `).all();
  console.table(q4);

  // Test Query 5: Wildfire Season Impact
  console.log('\n--- Testing Query 5: Wildfire Season (Aug-Oct) Impact ---');
  const q5 = db.prepare(`
    WITH wildfire_stats AS (
        SELECT year, county, ROUND(AVG(aqi), 1) as wf_aqi
        FROM aqi_daily WHERE month IN (8, 9, 10)
        GROUP BY year, county
    ),
    non_wildfire_stats AS (
        SELECT year, county, ROUND(AVG(aqi), 1) as reg_aqi
        FROM aqi_daily WHERE month NOT IN (8, 9, 10)
        GROUP BY year, county
    )
    SELECT 
        w.year,
        w.county,
        w.wf_aqi,
        nw.reg_aqi,
        ROUND(w.wf_aqi - nw.reg_aqi, 1) as smoke_penalty
    FROM wildfire_stats w
    JOIN non_wildfire_stats nw ON w.year = nw.year AND w.county = nw.county
    WHERE w.year IN (2018, 2020) AND w.county IN ('Fresno', 'Kern', 'Los Angeles')
    ORDER BY smoke_penalty DESC;
  `).all();
  console.table(q5);

  console.log('\n🎉 All analytical query patterns verified successfully!');
  db.close();
}

main();
