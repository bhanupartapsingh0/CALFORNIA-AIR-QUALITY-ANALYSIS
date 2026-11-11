/**
 * California Air Quality Analysis - Database Seeder & CSV Generator
 * Uses native Node.js SQLite (DatabaseSync) and generates structured data for all major CARB Air Basins.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'air_quality.db');
const STATIONS_CSV = path.join(__dirname, 'california_stations.csv');
const HISTORICAL_CSV = path.join(__dirname, 'daily_aqi_historical.csv');
const WILDFIRE_CSV = path.join(__dirname, 'wildfire_impact_study.csv');

// EPA Breakpoints definition for PM2.5, Ozone (8hr ppm), and NO2 (1hr ppb)
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

function getAQICategory(aqi) {
  if (aqi <= 50) return { category: 'Good', color: '#10b981', advisory: 'Air quality is satisfactory; air pollution poses little or no risk.' };
  if (aqi <= 100) return { category: 'Moderate', color: '#f59e0b', advisory: 'Air quality is acceptable; sensitive individuals should consider limiting prolonged outdoor exertion.' };
  if (aqi <= 150) return { category: 'Unhealthy for Sensitive Groups', color: '#f97316', advisory: 'Members of sensitive groups (children, elderly, asthmatics) may experience health effects.' };
  if (aqi <= 200) return { category: 'Unhealthy', color: '#ef4444', advisory: 'Everyone may begin to experience health effects; members of sensitive groups may experience more serious effects.' };
  if (aqi <= 300) return { category: 'Very Unhealthy', color: '#8b5cf6', advisory: 'Health alert: The risk of health effects is increased for everyone. Avoid outdoor physical activity.' };
  return { category: 'Hazardous', color: '#881337', advisory: 'Health warning of emergency conditions: Everyone is more likely to be affected. Remain indoors.' };
}

// California Official Monitoring Stations
const STATIONS = [
  { id: '06-037-1103', name: 'Los Angeles - N Main St', county: 'Los Angeles', basin: 'South Coast', lat: 34.0665, lon: -118.2268, elevation_m: 87 },
  { id: '06-037-4004', name: 'Long Beach - Webster St', county: 'Los Angeles', basin: 'South Coast', lat: 33.7922, lon: -118.2163, elevation_m: 9 },
  { id: '06-059-0007', name: 'Anaheim - Pampas Lane', county: 'Orange', basin: 'South Coast', lat: 33.8306, lon: -117.9383, elevation_m: 48 },
  { id: '06-065-8001', name: 'Riverside - Rubidoux', county: 'Riverside', basin: 'South Coast', lat: 33.9996, lon: -117.4160, elevation_m: 248 },
  { id: '06-071-0005', name: 'San Bernardino - 4th St', county: 'San Bernardino', basin: 'South Coast', lat: 34.1067, lon: -117.2742, elevation_m: 326 },
  
  { id: '06-019-0011', name: 'Fresno - Garland', county: 'Fresno', basin: 'San Joaquin Valley', lat: 36.7854, lon: -119.7732, elevation_m: 97 },
  { id: '06-029-0014', name: 'Bakersfield - California Ave', county: 'Kern', basin: 'San Joaquin Valley', lat: 35.3589, lon: -119.0344, elevation_m: 119 },
  { id: '06-099-0005', name: 'Modesto - 14th St', county: 'Stanislaus', basin: 'San Joaquin Valley', lat: 37.6422, lon: -120.9942, elevation_m: 27 },
  { id: '06-077-1002', name: 'Stockton - Hazelton St', county: 'San Joaquin', basin: 'San Joaquin Valley', lat: 37.9522, lon: -121.2690, elevation_m: 6 },
  { id: '06-107-2002', name: 'Visalia - N Church St', county: 'Tulare', basin: 'San Joaquin Valley', lat: 36.3325, lon: -119.2908, elevation_m: 102 },

  { id: '06-075-0005', name: 'San Francisco - Arkansas St', county: 'San Francisco', basin: 'San Francisco Bay Area', lat: 37.7659, lon: -122.3990, elevation_m: 18 },
  { id: '06-001-0009', name: 'Oakland West - 7th St', county: 'Alameda', basin: 'San Francisco Bay Area', lat: 37.8049, lon: -122.2858, elevation_m: 4 },
  { id: '06-085-0005', name: 'San Jose - Jackson St', county: 'Santa Clara', basin: 'San Francisco Bay Area', lat: 37.3486, lon: -121.8949, elevation_m: 21 },
  { id: '06-001-0007', name: 'Berkeley - Aquatic Park', county: 'Alameda', basin: 'San Francisco Bay Area', lat: 37.8571, lon: -122.3015, elevation_m: 3 },
  { id: '06-095-0004', name: 'Vallejo - Tuolumne St', county: 'Solano', basin: 'San Francisco Bay Area', lat: 38.1025, lon: -122.2380, elevation_m: 15 },

  { id: '06-067-0010', name: 'Sacramento - T Street', county: 'Sacramento', basin: 'Sacramento Valley', lat: 38.5684, lon: -121.4931, elevation_m: 8 },
  { id: '06-061-0006', name: 'Roseville - N Sunrise Blvd', county: 'Placer', basin: 'Sacramento Valley', lat: 38.7483, lon: -121.2644, elevation_m: 51 },
  { id: '06-007-0008', name: 'Chico - East 20th St', county: 'Butte', basin: 'Sacramento Valley', lat: 39.7292, lon: -121.8028, elevation_m: 65 },

  { id: '06-073-1006', name: 'San Diego - Perkins Ave', county: 'San Diego', basin: 'San Diego County', lat: 32.6895, lon: -117.1306, elevation_m: 6 },
  { id: '06-073-0003', name: 'El Cajon - Lexington Ave', county: 'San Diego', basin: 'San Diego County', lat: 32.7915, lon: -116.9638, elevation_m: 132 },

  { id: '06-025-0005', name: 'Calexico - East 5th St', county: 'Imperial', basin: 'Salton Sea', lat: 32.6761, lon: -115.4839, elevation_m: 1 },
  { id: '06-023-1004', name: 'Eureka - H Street', county: 'Humboldt', basin: 'North Coast', lat: 40.7997, lon: -124.1611, elevation_m: 12 },
  { id: '06-051-0001', name: 'Mammoth Lakes - Sierra Park', county: 'Mono', basin: 'Great Basin Valleys', lat: 37.6497, lon: -118.9680, elevation_m: 2398 },
  { id: '06-053-0002', name: 'Salinas - Sanborn Rd', county: 'Monterey', basin: 'Monterey Bay', lat: 36.6719, lon: -121.6247, elevation_m: 21 },
  { id: '06-017-0010', name: 'South Lake Tahoe - Sandy Way', county: 'El Dorado', basin: 'Lake Tahoe', lat: 38.9372, lon: -119.9744, elevation_m: 1904 }
];

// Major California Wildfire events for temporal correlation
const WILDFIRE_SEASONS = [
  { year: 2020, name: 'August Complex & Creek Fire', peakMonth: 9, maxSmokeIndex: 9.8, acresBurned: 4397809 },
  { year: 2021, name: 'Dixie & Caldor Fires', peakMonth: 8, maxSmokeIndex: 8.9, acresBurned: 2568941 },
  { year: 2022, name: 'McKinney & Mosquito Fires', peakMonth: 9, maxSmokeIndex: 6.4, acresBurned: 362455 },
  { year: 2023, name: 'Smith River Complex (Wet Winter Year)', peakMonth: 8, maxSmokeIndex: 4.8, acresBurned: 324917 },
  { year: 2024, name: 'Park Fire & Southern CA Fires', peakMonth: 8, maxSmokeIndex: 8.4, acresBurned: 1042000 },
  { year: 2025, name: 'Late Summer Heatwave & Sierra Fires', peakMonth: 9, maxSmokeIndex: 7.2, acresBurned: 650000 },
  { year: 2026, name: 'Baseline Year (Early Fire Activity)', peakMonth: 7, maxSmokeIndex: 5.5, acresBurned: 410000 }
];

function seedDatabase() {
  console.log('🌱 Initializing California Air Quality Database...');
  
  if (fs.existsSync(DB_PATH)) {
    try { fs.unlinkSync(DB_PATH); } catch (e) {}
  }

  const db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for high performance
  db.exec(`
    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      county TEXT NOT NULL,
      basin TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      elevation_m REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      date TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      pm25_ugm3 REAL NOT NULL,
      ozone_ppm REAL NOT NULL,
      no2_ppb REAL NOT NULL,
      pm25_aqi INTEGER NOT NULL,
      ozone_aqi INTEGER NOT NULL,
      no2_aqi INTEGER NOT NULL,
      composite_aqi INTEGER NOT NULL,
      dominant_pollutant TEXT NOT NULL,
      aqi_category TEXT NOT NULL,
      temperature_c REAL NOT NULL,
      humidity_pct REAL NOT NULL,
      wildfire_smoke_index REAL NOT NULL,
      FOREIGN KEY (station_id) REFERENCES stations(id)
    );

    CREATE INDEX idx_measurements_station_date ON daily_measurements (station_id, date);
    CREATE INDEX idx_measurements_year_month ON daily_measurements (year, month);
    CREATE INDEX idx_measurements_aqi ON daily_measurements (composite_aqi);
    CREATE INDEX idx_measurements_basin ON daily_measurements (date);

    CREATE TABLE IF NOT EXISTS wildfire_impact (
      year INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      acres_burned INTEGER NOT NULL,
      peak_month INTEGER NOT NULL,
      max_smoke_index REAL NOT NULL,
      statewide_avg_wildfire_pm25 REAL NOT NULL,
      health_advisory_days INTEGER NOT NULL
    );
  `);

  // Insert stations
  const insertStation = db.prepare(`
    INSERT INTO stations (id, name, county, basin, lat, lon, elevation_m)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of STATIONS) {
    insertStation.run(s.id, s.name, s.county, s.basin, s.lat, s.lon, s.elevation_m);
  }
  console.log(`✅ Seeded ${STATIONS.length} monitoring stations.`);

  // Prepare statement for daily measurements
  const insertMeasurement = db.prepare(`
    INSERT INTO daily_measurements (
      station_id, date, year, month, day, day_of_week,
      pm25_ugm3, ozone_ppm, no2_ppb,
      pm25_aqi, ozone_aqi, no2_aqi, composite_aqi,
      dominant_pollutant, aqi_category,
      temperature_c, humidity_pct, wildfire_smoke_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Generate realistic historical daily records from 2021-01-01 to 2026-11-10 (approx 2,140 days)
  // To keep database nimble and fast, we seed key stations daily and remaining stations periodically (or all 25 stations sampled weekly + daily for 6 key index stations)
  // Let's seed complete daily records for representative stations from each basin, plus monthly aggregates
  const representativeStationIds = [
    '06-037-1103', // LA North Main (South Coast)
    '06-065-8001', // Riverside Rubidoux (Inland South Coast)
    '06-019-0011', // Fresno Garland (San Joaquin Valley)
    '06-029-0014', // Bakersfield California (Southern San Joaquin)
    '06-075-0005', // SF Arkansas (Bay Area)
    '06-085-0005', // San Jose Jackson (Bay Area Silicon Valley)
    '06-067-0010', // Sacramento T St (Sacramento Valley)
    '06-073-1006', // San Diego Perkins (San Diego)
    '06-023-1004', // Eureka (North Coast - pristine baseline)
    '06-025-0005', // Calexico (Salton Sea desert)
  ];

  const startDate = new Date('2021-01-01T00:00:00Z');
  const endDate = new Date('2026-11-10T00:00:00Z');
  const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));

  console.log(`⏳ Generating ${totalDays} days of environmental data across California basins...`);

  db.exec('BEGIN TRANSACTION');

  const historicalCsvRows = [
    'date,year,month,station_id,station_name,county,basin,pm25_ugm3,ozone_ppm,no2_ppb,composite_aqi,dominant_pollutant,aqi_category,wildfire_smoke_index'
  ];

  let recordCount = 0;

  for (let d = 0; d <= totalDays; d++) {
    const curDate = new Date(startDate.getTime() + d * 86400000);
    const dateStr = curDate.toISOString().split('T')[0];
    const year = curDate.getUTCFullYear();
    const month = curDate.getUTCMonth() + 1;
    const day = curDate.getUTCDate();
    const dayOfWeek = curDate.getUTCDay();

    // Wildfire event dynamics
    const wfYear = WILDFIRE_SEASONS.find(w => w.year === year);
    let wildfireWave = 0;
    if (wfYear && month >= 7 && month <= 10) {
      // Gaussian distribution centered around peak month
      const dist = Math.abs(month - wfYear.peakMonth) + (day / 30 - 0.5);
      wildfireWave = Math.max(0, wfYear.maxSmokeIndex * Math.exp(-dist * dist * 1.8));
      // Wildfire episode spikes on random dry windy days in peak
      if ((day >= 12 && day <= 24) && (month === wfYear.peakMonth || month === wfYear.peakMonth + 1)) {
        wildfireWave *= 1.45;
      }
    }

    // Determine stations to record for this day:
    // Every day for representative stations; every 5th day for other stations to ensure broad geographic coverage without huge file size
    const stationsForDay = STATIONS.filter(st => representativeStationIds.includes(st.id) || (d % 4 === 0));

    for (const st of stationsForDay) {
      // Basin-specific baseline characteristics:
      // 1. San Joaquin Valley: High winter PM2.5 inversion, high summer ozone, severe smoke pooling
      // 2. South Coast: High ozone (Riverside especially), steady traffic NO2, elevated PM2.5
      // 3. Bay Area: Marine layer cooling, moderate ozone, severe spikes during Diablo wind wildfire events
      // 4. North Coast (Eureka): Low baseline, clean maritime air, spikes during wildfires
      // 5. Desert/Salton Sea: High dust PM, high temperature, distinct diurnal swings

      let basePM25 = 8.5;
      let baseOzone = 0.035;
      let baseNO2 = 18;
      let baseTemp = 18;

      if (st.basin === 'San Joaquin Valley') {
        basePM25 = 15.0;
        baseOzone = 0.046;
        baseNO2 = 22;
        // Winter inversion boost for PM2.5 (Nov - Feb)
        if (month >= 11 || month <= 2) {
          basePM25 += 22.0 + Math.sin(day * 0.4) * 8.0;
        }
      } else if (st.basin === 'South Coast') {
        basePM25 = 12.5;
        baseOzone = 0.048;
        baseNO2 = 28;
        if (st.county === 'Riverside' || st.county === 'San Bernardino') {
          baseOzone += 0.018; // inland ozone buildup
        }
      } else if (st.basin === 'San Francisco Bay Area') {
        basePM25 = 7.5;
        baseOzone = 0.030;
        baseNO2 = 19;
      } else if (st.basin === 'Sacramento Valley') {
        basePM25 = 10.5;
        baseOzone = 0.042;
        baseNO2 = 17;
      } else if (st.basin === 'North Coast') {
        basePM25 = 4.5;
        baseOzone = 0.024;
        baseNO2 = 7;
      } else if (st.basin === 'Salton Sea') {
        basePM25 = 14.0;
        baseOzone = 0.045;
        baseNO2 = 14;
      }

      // Summer ozone photochemical effect (May to September)
      if (month >= 5 && month <= 9) {
        const summerFactor = Math.sin(((month - 5) / 4) * Math.PI);
        baseOzone += 0.020 * summerFactor;
        baseTemp += 12;
      } else if (month >= 12 || month <= 2) {
        baseTemp -= 8;
      }

      // Weather / atmospheric noise
      const pseudoNoise = (Math.sin(d * 13.7 + st.lat * 5.0) + Math.cos(d * 7.1 + st.lon * 3.0)) * 0.5;
      const smokeLocalMultiplier = st.basin === 'San Joaquin Valley' ? 1.6 :
                                  (st.basin === 'Sacramento Valley' ? 1.4 :
                                  (st.basin === 'San Francisco Bay Area' ? 1.1 : 0.8));

      const smokeEffect = wildfireWave * smokeLocalMultiplier;
      const finalPM25 = Math.max(1.2, +(basePM25 + pseudoNoise * 3.5 + smokeEffect * 11.2).toFixed(1));
      const finalOzone = Math.max(0.005, +(baseOzone + pseudoNoise * 0.007 + (smokeEffect > 3 ? 0.009 : 0)).toFixed(3));
      const finalNO2 = Math.max(2, Math.round(baseNO2 + pseudoNoise * 5.0 + (dayOfWeek >= 1 && dayOfWeek <= 5 ? 4 : -3)));
      const finalTemp = +(baseTemp + pseudoNoise * 3.0).toFixed(1);
      const finalHumidity = Math.max(15, Math.min(95, Math.round(55 - (baseTemp - 18) * 1.5 + pseudoNoise * 10)));
      const smokeIndex = +(smokeEffect).toFixed(2);

      const pm25AQI = calculatePM25AQI(finalPM25);
      const ozoneAQI = calculateOzoneAQI(finalOzone);
      const no2AQI = calculateNO2AQI(finalNO2);

      let compositeAQI = Math.max(pm25AQI, ozoneAQI, no2AQI);
      let dominant = 'PM2.5';
      if (compositeAQI === ozoneAQI && ozoneAQI > pm25AQI) dominant = 'Ozone';
      else if (compositeAQI === no2AQI && no2AQI > pm25AQI) dominant = 'NO2';

      const catInfo = getAQICategory(compositeAQI);

      insertMeasurement.run(
        st.id, dateStr, year, month, day, dayOfWeek,
        finalPM25, finalOzone, finalNO2,
        pm25AQI, ozoneAQI, no2AQI, compositeAQI,
        dominant, catInfo.category,
        finalTemp, finalHumidity, smokeIndex
      );

      recordCount++;

      // Save to CSV dataset (sample every 2nd day or during high AQI events)
      if (d % 2 === 0 || compositeAQI > 100) {
        historicalCsvRows.push(
          `${dateStr},${year},${month},${st.id},"${st.name}","${st.county}","${st.basin}",${finalPM25},${finalOzone},${finalNO2},${compositeAQI},${dominant},"${catInfo.category}",${smokeIndex}`
        );
      }
    }
  }

  db.exec('COMMIT');
  console.log(`✅ Stored ${recordCount.toLocaleString()} daily measurements.`);

  // Seed Wildfire Impact table
  const insertWildfire = db.prepare(`
    INSERT INTO wildfire_impact (year, name, acres_burned, peak_month, max_smoke_index, statewide_avg_wildfire_pm25, health_advisory_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const wildfireCsvRows = [
    'year,fire_name,acres_burned,peak_month,max_smoke_index,statewide_avg_wildfire_pm25,health_advisory_days'
  ];

  for (const wf of WILDFIRE_SEASONS) {
    const avgPM25 = +(wf.maxSmokeIndex * 7.4 + 14.2).toFixed(1);
    const advisoryDays = Math.round(wf.acresBurned / 85000) + 12;
    insertWildfire.run(wf.year, wf.name, wf.acresBurned, wf.peakMonth, wf.maxSmokeIndex, avgPM25, advisoryDays);
    wildfireCsvRows.push(`${wf.year},"${wf.name}",${wf.acresBurned},${wf.peakMonth},${wf.maxSmokeIndex},${avgPM25},${advisoryDays}`);
  }

  // Write CSV exports
  // 1. Stations CSV
  const stationsCsvRows = [
    'station_id,station_name,county,air_basin,latitude,longitude,elevation_meters',
    ...STATIONS.map(s => `${s.id},"${s.name}","${s.county}","${s.basin}",${s.lat},${s.lon},${s.elevation_m}`)
  ];
  fs.writeFileSync(STATIONS_CSV, stationsCsvRows.join('\n'), 'utf8');
  console.log(`✅ Exported ${STATIONS_CSV}`);

  // 2. Historical CSV
  fs.writeFileSync(HISTORICAL_CSV, historicalCsvRows.join('\n'), 'utf8');
  console.log(`✅ Exported ${HISTORICAL_CSV} (${historicalCsvRows.length.toLocaleString()} rows)`);

  // 3. Wildfire CSV
  fs.writeFileSync(WILDFIRE_CSV, wildfireCsvRows.join('\n'), 'utf8');
  console.log(`✅ Exported ${WILDFIRE_CSV}`);

  db.close();
  console.log('🎉 Seeding completed successfully!');
}

seedDatabase();
