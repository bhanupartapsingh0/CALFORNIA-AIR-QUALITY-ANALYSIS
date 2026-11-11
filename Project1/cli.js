#!/usr/bin/env node
/**
 * California Air Quality Analysis - Command Line Interface (CLI)
 * Zero external dependencies, pure native Node.js
 */

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'data', 'air_quality.db');

// ANSI Color Helpers
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  orange: '\x1b[38;5;208m',
  red: '\x1b[31m',
  purple: '\x1b[35m',
  maroon: '\x1b[41m\x1b[37m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function formatAQI(aqi) {
  if (aqi <= 50) return `${C.green}${aqi} (Good)${C.reset}`;
  if (aqi <= 100) return `${C.yellow}${aqi} (Moderate)${C.reset}`;
  if (aqi <= 150) return `${C.orange}${aqi} (Unhealthy for Sensitive)${C.reset}`;
  if (aqi <= 200) return `${C.red}${aqi} (Unhealthy)${C.reset}`;
  if (aqi <= 300) return `${C.purple}${aqi} (Very Unhealthy)${C.reset}`;
  return `${C.maroon} ${aqi} (Hazardous) ${C.reset}`;
}

function printHeader(title) {
  console.log(`\n${C.bold}${C.cyan}╔════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   ${title.padEnd(67)}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'summary';

  const db = new DatabaseSync(DB_PATH);

  switch (command.toLowerCase()) {
    case 'summary': {
      printHeader('CALIFORNIA STATEWIDE AIR QUALITY SUMMARY');
      const latest = db.prepare('SELECT MAX(date) as date FROM daily_measurements').get().date;
      
      const stations = db.prepare(`
        SELECT s.name, s.county, s.basin, m.composite_aqi, m.dominant_pollutant, m.pm25_ugm3, m.ozone_ppm
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        WHERE m.date = ?
      `).all(latest);

      const avgAqi = Math.round(stations.reduce((a, b) => a + b.composite_aqi, 0) / stations.length);
      
      console.log(`${C.bold}📅 Latest Recorded Date:${C.reset} ${latest}`);
      console.log(`${C.bold}📡 Reporting Stations:${C.reset}   ${stations.length}`);
      console.log(`${C.bold}🌐 Statewide Average AQI:${C.reset} ${formatAQI(avgAqi)}`);

      // Basin snapshot
      console.log(`\n${C.bold}📍 Air Basin Overview:${C.reset}`);
      const basins = db.prepare(`
        SELECT s.basin, 
               ROUND(AVG(m.composite_aqi), 1) as avg_aqi,
               ROUND(AVG(m.pm25_ugm3), 1) as avg_pm25,
               ROUND(AVG(m.ozone_ppm), 3) as avg_ozone
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        WHERE m.date = ?
        GROUP BY s.basin
        ORDER BY avg_aqi DESC
      `).all(latest);

      console.log('┌─────────────────────────────┬───────────┬─────────────┬─────────────┐');
      console.log('│ Air Basin                   │ Avg AQI   │ PM2.5 µg/m³ │ Ozone ppm   │');
      console.log('├─────────────────────────────┼───────────┼─────────────┼─────────────┤');
      for (const b of basins) {
        const basinName = b.basin.padEnd(27);
        const aqiStr = String(b.avg_aqi).padStart(9);
        const pmStr = String(b.avg_pm25).padStart(11);
        const ozStr = String(b.avg_ozone).padStart(11);
        console.log(`│ ${basinName} │ ${aqiStr} │ ${pmStr} │ ${ozStr} │`);
      }
      console.log('└─────────────────────────────┴───────────┴─────────────┴─────────────┘');
      break;
    }

    case 'basins': {
      printHeader('MULTI-YEAR AIR BASIN COMPARISON (2021-2026)');
      const stats = db.prepare(`
        SELECT s.basin,
               ROUND(AVG(m.composite_aqi), 1) as avg_aqi,
               ROUND(MAX(m.composite_aqi), 0) as peak_aqi,
               ROUND(AVG(m.pm25_ugm3), 1) as avg_pm25,
               ROUND(AVG(m.ozone_ppm), 3) as avg_ozone,
               SUM(CASE WHEN m.composite_aqi > 100 THEN 1 ELSE 0 END) as unhealthy_days
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        GROUP BY s.basin
        ORDER BY avg_aqi DESC
      `).all();

      console.log('┌─────────────────────────────┬──────────┬──────────┬──────────┬─────────────────┐');
      console.log('│ Air Basin                   │ Mean AQI │ Peak AQI │ PM2.5    │ Unhealthy Days  │');
      console.log('├─────────────────────────────┼──────────┼──────────┼──────────┼─────────────────┤');
      for (const row of stats) {
        const name = row.basin.padEnd(27);
        const mean = String(row.avg_aqi).padStart(8);
        const peak = String(row.peak_aqi).padStart(8);
        const pm = String(row.avg_pm25).padStart(8);
        const days = String(row.unhealthy_days).padStart(15);
        console.log(`│ ${name} │ ${mean} │ ${peak} │ ${pm} │ ${days} │`);
      }
      console.log('└─────────────────────────────┴──────────┴──────────┴──────────┴─────────────────┘');
      break;
    }

    case 'stations': {
      const basinFilter = args[1];
      printHeader(`MONITORING STATIONS ${basinFilter ? `[Basin: ${basinFilter}]` : ''}`);
      const latest = db.prepare('SELECT MAX(date) as date FROM daily_measurements').get().date;

      let sql = `
        SELECT s.id, s.name, s.county, s.basin, m.composite_aqi, m.pm25_ugm3, m.ozone_ppm, m.dominant_pollutant
        FROM stations s
        LEFT JOIN daily_measurements m ON s.id = m.station_id AND m.date = ?
      `;
      const params = [latest];
      if (basinFilter) {
        sql += ` WHERE s.basin LIKE ?`;
        params.push(`%${basinFilter}%`);
      }
      sql += ` ORDER BY m.composite_aqi DESC`;

      const stations = db.prepare(sql).all(...params);

      console.log('┌──────────────────────────────┬──────────────────┬──────────┬───────────┬──────────────┐');
      console.log('│ Station Name                 │ County           │ AQI      │ PM2.5     │ Dominant     │');
      console.log('├──────────────────────────────┼──────────────────┼──────────┼───────────┼──────────────┤');
      for (const st of stations) {
        const name = st.name.padEnd(28);
        const county = st.county.padEnd(16);
        const aqi = String(st.composite_aqi || 0).padStart(8);
        const pm = String(st.pm25_ugm3 || 0).padStart(9);
        const dom = (st.dominant_pollutant || 'N/A').padEnd(12);
        console.log(`│ ${name} │ ${county} │ ${aqi} │ ${pm} │ ${dom} │`);
      }
      console.log('└──────────────────────────────┴──────────────────┴──────────┴───────────┴──────────────┘');
      break;
    }

    case 'wildfire': {
      printHeader('WILDFIRE SMOKE & PM2.5 POLLUTION IMPACT STUDY');
      const wf = db.prepare('SELECT * FROM wildfire_impact ORDER BY year ASC').all();
      
      console.log('┌──────┬───────────────────────────────────┬──────────────┬────────────┬──────────────┐');
      console.log('│ Year │ Incident / Complex                │ Acres Burned │ Smoke Idx  │ Avg PM2.5    │');
      console.log('├──────┼───────────────────────────────────┼──────────────┼────────────┼──────────────┤');
      for (const row of wf) {
        const yr = String(row.year).padStart(4);
        const nm = row.name.padEnd(33);
        const ac = Number(row.acres_burned).toLocaleString().padStart(12);
        const sm = String(row.max_smoke_index).padStart(10);
        const pm = `${row.statewide_avg_wildfire_pm25} µg/m³`.padStart(12);
        console.log(`│ ${yr} │ ${nm} │ ${ac} │ ${sm} │ ${pm} │`);
      }
      console.log('└──────┴───────────────────────────────────┴──────────────┴────────────┴──────────────┘');
      break;
    }

    case 'forecast': {
      const basin = args[1] || 'San Joaquin Valley';
      printHeader(`7-DAY AQI STATISTICAL FORECAST [${basin}]`);

      const recentDaily = db.prepare(`
        SELECT m.date, ROUND(AVG(m.composite_aqi), 1) as aqi
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        WHERE s.basin LIKE ?
        GROUP BY m.date
        ORDER BY m.date DESC
        LIMIT 30
      `).all(`%${basin}%`).reverse();

      if (recentDaily.length === 0) {
        console.log(`No data found for basin: ${basin}`);
        break;
      }

      // Exponential smoothing
      const alpha = 0.35;
      const beta = 0.15;
      let level = recentDaily[0].aqi;
      let trend = recentDaily[1].aqi - recentDaily[0].aqi;

      for (let i = 1; i < recentDaily.length; i++) {
        const val = recentDaily[i].aqi;
        const lastL = level;
        level = alpha * val + (1 - alpha) * (level + trend);
        trend = beta * (level - lastL) + (1 - beta) * trend;
      }

      const lastDate = new Date(recentDaily[recentDaily.length - 1].date);
      console.log(`Baseline Observed AQI: ${Math.round(level)} (Trend: ${trend >= 0 ? '+' : ''}${trend.toFixed(2)}/day)\n`);

      console.log('┌────────────┬───────────┬────────────────┬──────────────────────────────────────────┐');
      console.log('│ Date       │ Day       │ Projected AQI  │ Advisory Recommendation                  │');
      console.log('├────────────┼───────────┼────────────────┼──────────────────────────────────────────┤');
      for (let h = 1; h <= 7; h++) {
        const fDate = new Date(lastDate.getTime() + h * 86400000);
        const dateStr = fDate.toISOString().split('T')[0];
        const dayStr = fDate.toLocaleDateString('en-US', { weekday: 'short' }).padEnd(9);
        const projAqi = Math.max(20, Math.min(250, Math.round(level + h * trend)));
        const aqiStr = String(projAqi).padStart(14);
        let rec = 'Normal outdoor activities.';
        if (projAqi > 150) rec = 'Limit prolonged outdoor exertion!';
        else if (projAqi > 100) rec = 'Sensitive groups should reduce exertion.';
        else if (projAqi > 50) rec = 'Acceptable air quality for general public.';

        console.log(`│ ${dateStr} │ ${dayStr} │ ${aqiStr} │ ${rec.padEnd(40)} │`);
      }
      console.log('└────────────┴───────────┴────────────────┴──────────────────────────────────────────┘');
      break;
    }

    default:
      console.log(`
Usage: node cli.js <command> [options]

Commands:
  summary              Display California statewide overview and basin summary
  basins               Display comparative historical statistics for all air basins
  stations [basin]     Display monitoring station readings (optional basin filter)
  wildfire             Display wildfire impact analysis and smoke correlations
  forecast [basin]     Run 7-day statistical forecasting for a selected basin
      `);
  }

  db.close();
}

main();
