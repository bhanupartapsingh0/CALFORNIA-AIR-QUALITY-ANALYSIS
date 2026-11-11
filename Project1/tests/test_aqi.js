/**
 * Unit & Integration Tests for California Air Quality Analysis
 * Uses native node:test and node:assert (Node.js 24+)
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'air_quality.db');

// EPA Breakpoint definitions to test
function calculatePM25AQI(cp) {
  if (cp < 0) return 0;
  const bp = [
    { cLo: 0.0, cHi: 9.0, iLo: 0, iHi: 50 },
    { cLo: 9.1, cHi: 35.4, iLo: 51, iHi: 100 },
    { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150 },
    { cLo: 55.5, cHi: 125.4, iLo: 151, iHi: 200 },
    { cLo: 125.5, cHi: 225.4, iLo: 201, iHi: 300 },
    { cLo: 225.5, cHi: 500.4, iLo: 301, iHi: 500 },
  ];
  const item = bp.find(b => cp <= b.cHi) || bp[bp.length - 1];
  const aqi = Math.round(((item.iHi - item.iLo) / (item.cHi - item.cLo)) * (cp - item.cLo) + item.iLo);
  return Math.min(500, Math.max(0, aqi));
}

function calculateOzoneAQI(cp) {
  if (cp < 0) return 0;
  const bp = [
    { cLo: 0.000, cHi: 0.054, iLo: 0, iHi: 50 },
    { cLo: 0.055, cHi: 0.070, iLo: 51, iHi: 100 },
    { cLo: 0.071, cHi: 0.085, iLo: 101, iHi: 150 },
    { cLo: 0.086, cHi: 0.105, iLo: 151, iHi: 200 },
    { cLo: 0.106, cHi: 0.200, iLo: 201, iHi: 300 },
    { cLo: 0.201, cHi: 0.600, iLo: 301, iHi: 500 },
  ];
  const item = bp.find(b => cp <= b.cHi) || bp[bp.length - 1];
  const aqi = Math.round(((item.iHi - item.iLo) / (item.cHi - item.cLo)) * (cp - item.cLo) + item.iLo);
  return Math.min(500, Math.max(0, aqi));
}

test('EPA AQI Breakpoints Calculation', (t) => {
  // Test PM2.5 standard calculations
  assert.strictEqual(calculatePM25AQI(0.0), 0);
  assert.strictEqual(calculatePM25AQI(9.0), 50);
  assert.strictEqual(calculatePM25AQI(12.0), 56);
  assert.strictEqual(calculatePM25AQI(35.4), 100);
  assert.strictEqual(calculatePM25AQI(55.4), 150);
  assert.strictEqual(calculatePM25AQI(125.4), 200);
  assert.strictEqual(calculatePM25AQI(250.0), 319);

  // Test Ozone standard calculations
  assert.strictEqual(calculateOzoneAQI(0.025), 23);
  assert.strictEqual(calculateOzoneAQI(0.054), 50);
  assert.strictEqual(calculateOzoneAQI(0.070), 100);
  assert.strictEqual(calculateOzoneAQI(0.085), 150);
});

test('SQLite Database Schema & Records Verification', (t) => {
  const db = new DatabaseSync(DB_PATH);
  
  // Verify Stations
  const stationCount = db.prepare('SELECT COUNT(*) as count FROM stations').get();
  assert.ok(stationCount.count >= 25, 'Should have at least 25 California stations');

  // Verify Daily Measurements
  const measurementCount = db.prepare('SELECT COUNT(*) as count FROM daily_measurements').get();
  assert.ok(measurementCount.count > 20000, 'Should have over 20,000 daily measurements');

  // Verify Air Basins represented
  const basins = db.prepare('SELECT DISTINCT basin FROM stations').all().map(b => b.basin);
  assert.ok(basins.includes('South Coast'), 'Must contain South Coast basin');
  assert.ok(basins.includes('San Joaquin Valley'), 'Must contain San Joaquin Valley basin');
  assert.ok(basins.includes('San Francisco Bay Area'), 'Must contain SF Bay Area basin');
  assert.ok(basins.includes('Sacramento Valley'), 'Must contain Sacramento Valley basin');

  // Verify Wildfire Impact records
  const wfCount = db.prepare('SELECT COUNT(*) as count FROM wildfire_impact').get();
  assert.strictEqual(wfCount.count, 7, 'Should track 7 wildfire seasons');

  db.close();
});

test('Air Basin Comparative Analysis Metrics', (t) => {
  const db = new DatabaseSync(DB_PATH);
  
  const stats = db.prepare(`
    SELECT s.basin, 
           AVG(m.composite_aqi) as avg_aqi,
           MAX(m.composite_aqi) as peak_aqi,
           AVG(m.pm25_ugm3) as avg_pm25
    FROM daily_measurements m
    JOIN stations s ON m.station_id = s.id
    GROUP BY s.basin
    ORDER BY avg_aqi DESC
  `).all();

  assert.ok(stats.length >= 6, 'Should rank all major basins');
  // San Joaquin Valley or South Coast should be highest in historical pollution
  const topBasin = stats[0].basin;
  assert.ok(
    topBasin === 'San Joaquin Valley' || topBasin === 'South Coast',
    `Top basin expected to be SJ Valley or South Coast, got: ${topBasin}`
  );

  db.close();
});

console.log('✨ All test suites registered successfully.');
