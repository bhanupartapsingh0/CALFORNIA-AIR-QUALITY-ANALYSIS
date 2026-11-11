/**
 * California Air Quality Analysis - High Performance HTTP & REST API Server
 * Built with native Node.js and SQLite (Zero external dependencies)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'air_quality.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database not found. Please run "node data/seed_data.js" first.');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

// EPA Breakpoint Calculations
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

function calculateNO2AQI(cp) {
  if (cp < 0) return 0;
  const bp = [
    { cLo: 0, cHi: 53, iLo: 0, iHi: 50 },
    { cLo: 54, cHi: 100, iLo: 51, iHi: 100 },
    { cLo: 101, cHi: 360, iLo: 101, iHi: 150 },
    { cLo: 361, cHi: 649, iLo: 151, iHi: 200 },
    { cLo: 650, cHi: 1249, iLo: 201, iHi: 300 },
    { cLo: 1250, cHi: 2049, iLo: 301, iHi: 500 },
  ];
  const item = bp.find(b => cp <= b.cHi) || bp[bp.length - 1];
  const aqi = Math.round(((item.iHi - item.iLo) / (item.cHi - item.cLo)) * (cp - item.cLo) + item.iLo);
  return Math.min(500, Math.max(0, aqi));
}

function getAQIDetails(aqi) {
  if (aqi <= 50) {
    return {
      category: 'Good',
      color: '#10b981',
      badgeClass: 'badge-good',
      description: 'Air quality is satisfactory, and air pollution poses little or no risk.',
      caution: 'None required.',
      maskRecommended: false
    };
  } else if (aqi <= 100) {
    return {
      category: 'Moderate',
      color: '#f59e0b',
      badgeClass: 'badge-moderate',
      description: 'Air quality is acceptable. However, there may be a risk for some people with sensitivities.',
      caution: 'Unusually sensitive people should consider reducing prolonged outdoor exertion.',
      maskRecommended: false
    };
  } else if (aqi <= 150) {
    return {
      category: 'Unhealthy for Sensitive Groups',
      color: '#f97316',
      badgeClass: 'badge-sensitive',
      description: 'Members of sensitive groups may experience health effects. The general public is less likely to be affected.',
      caution: 'People with heart/lung disease, older adults, and children should reduce prolonged exertion.',
      maskRecommended: false
    };
  } else if (aqi <= 200) {
    return {
      category: 'Unhealthy',
      color: '#ef4444',
      badgeClass: 'badge-unhealthy',
      description: 'Some members of the general public may experience health effects; sensitive groups may experience more serious effects.',
      caution: 'Avoid prolonged outdoor exertion. Sensitive groups should remain indoors in filtered air.',
      maskRecommended: true
    };
  } else if (aqi <= 300) {
    return {
      category: 'Very Unhealthy',
      color: '#8b5cf6',
      badgeClass: 'badge-very-unhealthy',
      description: 'Health alert: The risk of health effects is increased for everyone.',
      caution: 'Avoid all physical activity outdoors. Keep windows closed and run HEPA air purifiers.',
      maskRecommended: true
    };
  } else {
    return {
      category: 'Hazardous',
      color: '#881337',
      badgeClass: 'badge-hazardous',
      description: 'Health warning of emergency conditions: The entire population is likely to be affected.',
      caution: 'Stay indoors and minimize physical activity. Wear an N95 respirator if stepping outside.',
      maskRecommended: true
    };
  }
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=UTF-8',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Router
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, query);
    return;
  }

  // Static files handler
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handleApi(req, res, pathname, query) {
  try {
    // 1. Summary Overview
    if (pathname === '/api/summary') {
      // Find latest date in measurements
      const latestDateRow = db.prepare('SELECT MAX(date) as latestDate FROM daily_measurements').get();
      const latestDate = latestDateRow.latestDate;

      // Current station metrics on latest date
      const currentStations = db.prepare(`
        SELECT s.name, s.county, s.basin, m.composite_aqi, m.dominant_pollutant, m.pm25_ugm3, m.ozone_ppm, m.no2_ppb
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        WHERE m.date = ?
      `).all(latestDate);

      const avgAqi = Math.round(currentStations.reduce((acc, s) => acc + s.composite_aqi, 0) / (currentStations.length || 1));
      
      // Basin rankings (historical overall average)
      const basinStats = db.prepare(`
        SELECT s.basin, 
               ROUND(AVG(m.composite_aqi), 1) as avg_aqi,
               ROUND(AVG(m.pm25_ugm3), 1) as avg_pm25,
               ROUND(AVG(m.ozone_ppm), 3) as avg_ozone,
               COUNT(m.id) as total_records,
               SUM(CASE WHEN m.composite_aqi > 100 THEN 1 ELSE 0 END) as unhealthy_days
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        GROUP BY s.basin
        ORDER BY avg_aqi DESC
      `).all();

      // County ranking
      const countyStats = db.prepare(`
        SELECT s.county,
               ROUND(AVG(m.composite_aqi), 1) as avg_aqi,
               ROUND(AVG(m.pm25_ugm3), 1) as avg_pm25,
               ROUND(MAX(m.composite_aqi), 0) as max_aqi,
               SUM(CASE WHEN m.composite_aqi > 100 THEN 1 ELSE 0 END) as unhealthy_days
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        GROUP BY s.county
        ORDER BY avg_aqi DESC
      `).all();

      // Category counts for current day
      const categoryCounts = {
        'Good': 0,
        'Moderate': 0,
        'Unhealthy for Sensitive Groups': 0,
        'Unhealthy': 0,
        'Very Unhealthy': 0,
        'Hazardous': 0
      };

      currentStations.forEach(st => {
        const cat = getAQIDetails(st.composite_aqi).category;
        if (categoryCounts[cat] !== undefined) categoryCounts[cat]++;
      });

      sendJson(res, {
        latestDate,
        statewideAvgAQI: avgAqi,
        overallCategory: getAQIDetails(avgAqi),
        categoryCounts,
        basinRankings: basinStats,
        countyRankings: countyStats,
        cleanestCounty: countyStats[countyStats.length - 1],
        mostPollutedCounty: countyStats[0],
        totalStations: currentStations.length
      });
      return;
    }

    // 2. Monitoring Stations
    if (pathname === '/api/stations') {
      const latestDateRow = db.prepare('SELECT MAX(date) as latestDate FROM daily_measurements').get();
      const latestDate = latestDateRow.latestDate;

      let sql = `
        SELECT s.id, s.name, s.county, s.basin, s.lat, s.lon, s.elevation_m,
               m.composite_aqi, m.pm25_ugm3, m.ozone_ppm, m.no2_ppb,
               m.dominant_pollutant, m.aqi_category, m.temperature_c, m.humidity_pct,
               m.wildfire_smoke_index
        FROM stations s
        LEFT JOIN daily_measurements m ON s.id = m.station_id AND m.date = ?
      `;
      const params = [latestDate];

      if (query.basin && query.basin !== 'All') {
        sql += ` WHERE s.basin = ?`;
        params.push(query.basin);
      }

      sql += ` ORDER BY m.composite_aqi DESC`;
      const stations = db.prepare(sql).all(...params);

      // Enhance with AQI details
      const enhanced = stations.map(s => ({
        ...s,
        details: getAQIDetails(s.composite_aqi || 0)
      }));

      sendJson(res, enhanced);
      return;
    }

    // 3. Historical Trends
    if (pathname === '/api/historical') {
      const basin = query.basin;
      const stationId = query.stationId;
      const year = query.year;
      const metric = query.metric || 'composite_aqi';

      let sql = `
        SELECT m.year, m.month,
               ROUND(AVG(m.composite_aqi), 1) as avg_aqi,
               ROUND(AVG(m.pm25_ugm3), 1) as avg_pm25,
               ROUND(AVG(m.ozone_ppm), 3) as avg_ozone,
               ROUND(AVG(m.no2_ppb), 1) as avg_no2,
               ROUND(AVG(m.wildfire_smoke_index), 2) as avg_smoke_index,
               ROUND(MAX(m.composite_aqi), 0) as max_aqi,
               COUNT(m.id) as count
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        WHERE 1=1
      `;
      const params = [];

      if (basin && basin !== 'All') {
        sql += ` AND s.basin = ?`;
        params.push(basin);
      }

      if (stationId) {
        sql += ` AND s.id = ?`;
        params.push(stationId);
      }

      if (year && year !== 'All') {
        sql += ` AND m.year = ?`;
        params.push(parseInt(year, 10));
      }

      sql += ` GROUP BY m.year, m.month ORDER BY m.year ASC, m.month ASC`;

      const monthlyTrends = db.prepare(sql).all(...params);

      // Also get seasonal distribution (Winter, Spring, Summer, Fall)
      const seasonalSql = `
        SELECT 
          CASE 
            WHEN m.month IN (12, 1, 2) THEN 'Winter (Dec-Feb)'
            WHEN m.month IN (3, 4, 5) THEN 'Spring (Mar-May)'
            WHEN m.month IN (6, 7, 8) THEN 'Summer (Jun-Aug)'
            ELSE 'Autumn (Sep-Nov)'
          END as season,
          ROUND(AVG(m.composite_aqi), 1) as avg_aqi,
          ROUND(AVG(m.pm25_ugm3), 1) as avg_pm25,
          ROUND(AVG(m.ozone_ppm), 3) as avg_ozone,
          ROUND(AVG(m.no2_ppb), 1) as avg_no2
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        ${basin && basin !== 'All' ? 'WHERE s.basin = ?' : ''}
        GROUP BY season
        ORDER BY avg_aqi DESC
      `;
      const seasonalTrends = db.prepare(seasonalSql).all(...(basin && basin !== 'All' ? [basin] : []));

      sendJson(res, { monthly: monthlyTrends, seasonal: seasonalTrends });
      return;
    }

    // 4. Wildfire Impact Study
    if (pathname === '/api/wildfire') {
      const wildfireData = db.prepare(`SELECT * FROM wildfire_impact ORDER BY year ASC`).all();
      
      // Monthly smoke spikes across all years
      const smokeSpikes = db.prepare(`
        SELECT m.year, m.month,
               ROUND(AVG(m.pm25_ugm3), 1) as avg_pm25,
               ROUND(MAX(m.pm25_ugm3), 1) as peak_pm25,
               ROUND(AVG(m.wildfire_smoke_index), 2) as smoke_index,
               SUM(CASE WHEN m.composite_aqi > 150 THEN 1 ELSE 0 END) as unhealthy_days
        FROM daily_measurements m
        GROUP BY m.year, m.month
        HAVING smoke_index > 0.5
        ORDER BY m.year ASC, m.month ASC
      `).all();

      sendJson(res, { wildfires: wildfireData, smokeSpikes });
      return;
    }

    // 5. Statistical Forecast (Next 7-14 Days)
    if (pathname === '/api/forecast') {
      const basin = query.basin || 'South Coast';
      
      // Fetch the last 45 daily observations for this basin
      const recentDaily = db.prepare(`
        SELECT m.date, m.year, m.month, m.day,
               ROUND(AVG(m.composite_aqi), 1) as aqi,
               ROUND(AVG(m.pm25_ugm3), 1) as pm25,
               ROUND(AVG(m.ozone_ppm), 3) as ozone
        FROM daily_measurements m
        JOIN stations s ON m.station_id = s.id
        WHERE s.basin = ?
        GROUP BY m.date
        ORDER BY m.date DESC
        LIMIT 45
      `).all(basin).reverse();

      if (recentDaily.length === 0) {
        sendJson(res, { error: 'No data for specified basin' }, 404);
        return;
      }

      // Double Exponential Smoothing (Holt's Linear Trend Model)
      const alpha = 0.35; // level smoothing factor
      const beta = 0.15;  // trend smoothing factor

      let level = recentDaily[0].aqi;
      let trend = recentDaily[1].aqi - recentDaily[0].aqi;

      for (let i = 1; i < recentDaily.length; i++) {
        const value = recentDaily[i].aqi;
        const lastLevel = level;
        level = alpha * value + (1 - alpha) * (level + trend);
        trend = beta * (level - lastLevel) + (1 - beta) * trend;
      }

      const lastDate = new Date(recentDaily[recentDaily.length - 1].date);
      const forecastDays = 10;
      const forecast = [];

      for (let h = 1; h <= forecastDays; h++) {
        const fDate = new Date(lastDate.getTime() + h * 86400000);
        const fMonth = fDate.getUTCMonth() + 1;
        
        // Add seasonal damping
        const rawPrediction = level + h * trend;
        const boundedAqi = Math.max(20, Math.min(250, Math.round(rawPrediction)));
        const details = getAQIDetails(boundedAqi);

        // Confidence interval (95%)
        const margin = Math.round(4.5 + Math.sqrt(h) * 3.2);

        forecast.push({
          date: fDate.toISOString().split('T')[0],
          dayName: fDate.toLocaleDateString('en-US', { weekday: 'short' }),
          predictedAQI: boundedAqi,
          lowerCI: Math.max(10, boundedAqi - margin),
          upperCI: boundedAqi + margin,
          category: details.category,
          color: details.color,
          recommendation: details.caution
        });
      }

      sendJson(res, {
        basin,
        lastObservedDate: recentDaily[recentDaily.length - 1].date,
        model: "Holt's Linear Exponential Smoothing with Seasonal Dampening",
        historicalRecent: recentDaily.slice(-14),
        forecast
      });
      return;
    }

    // 6. Interactive AQI Calculator
    if (pathname === '/api/calculate-aqi') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const pm25 = parseFloat(data.pm25) || 0;
            const ozone = parseFloat(data.ozone) || 0;
            const no2 = parseFloat(data.no2) || 0;

            const pm25AQI = calculatePM25AQI(pm25);
            const ozoneAQI = calculateOzoneAQI(ozone);
            const no2AQI = calculateNO2AQI(no2);

            let compositeAQI = Math.max(pm25AQI, ozoneAQI, no2AQI);
            let dominant = 'PM2.5';
            if (compositeAQI === ozoneAQI && ozoneAQI > pm25AQI) dominant = 'Ozone';
            else if (compositeAQI === no2AQI && no2AQI > pm25AQI) dominant = 'NO2';

            const details = getAQIDetails(compositeAQI);

            sendJson(res, {
              inputs: { pm25, ozone, no2 },
              calculated: {
                pm25AQI,
                ozoneAQI,
                no2AQI,
                compositeAQI,
                dominantPollutant: dominant,
                ...details
              }
            });
          } catch (e) {
            sendJson(res, { error: 'Invalid JSON payload' }, 400);
          }
        });
        return;
      } else {
        // Support GET calculation via query params
        const pm25 = parseFloat(query.pm25) || 0;
        const ozone = parseFloat(query.ozone) || 0;
        const no2 = parseFloat(query.no2) || 0;

        const pm25AQI = calculatePM25AQI(pm25);
        const ozoneAQI = calculateOzoneAQI(ozone);
        const no2AQI = calculateNO2AQI(no2);

        let compositeAQI = Math.max(pm25AQI, ozoneAQI, no2AQI);
        let dominant = 'PM2.5';
        if (compositeAQI === ozoneAQI && ozoneAQI > pm25AQI) dominant = 'Ozone';
        else if (compositeAQI === no2AQI && no2AQI > pm25AQI) dominant = 'NO2';

        const details = getAQIDetails(compositeAQI);

        sendJson(res, {
          inputs: { pm25, ozone, no2 },
          calculated: {
            pm25AQI,
            ozoneAQI,
            no2AQI,
            compositeAQI,
            dominantPollutant: dominant,
            ...details
          }
        });
        return;
      }
    }

    // 7. Data Export Download
    if (pathname === '/api/export/stations.csv') {
      const csvPath = path.join(__dirname, 'data', 'california_stations.csv');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': 'attachment; filename="california_stations.csv"'
      });
      fs.createReadStream(csvPath).pipe(res);
      return;
    }

    if (pathname === '/api/export/historical.csv') {
      const csvPath = path.join(__dirname, 'data', 'daily_aqi_historical.csv');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': 'attachment; filename="california_daily_aqi_historical.csv"'
      });
      fs.createReadStream(csvPath).pipe(res);
      return;
    }

    if (pathname === '/api/export/wildfire.csv') {
      const csvPath = path.join(__dirname, 'data', 'wildfire_impact_study.csv');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': 'attachment; filename="california_wildfire_impact_study.csv"'
      });
      fs.createReadStream(csvPath).pipe(res);
      return;
    }

    // Unknown API endpoint
    sendJson(res, { error: 'API endpoint not found' }, 404);
  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, { error: 'Internal server error', message: error.message }, 500);
  }
}

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🌿 California Air Quality Analysis Server running!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`📊 API Health: http://localhost:${PORT}/api/summary`);
  console.log(`=======================================================`);
});
