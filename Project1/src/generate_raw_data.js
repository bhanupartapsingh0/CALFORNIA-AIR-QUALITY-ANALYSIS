/**
 * Generator for EPA Daily AQI By County (2015-2024) Raw CSV Datasets
 * Follows official EPA AirData schema:
 * "State Name","county Name","State Code","County Code","Date","AQI","Category","Defining Parameter","Defining Site","Number of Sites Reporting"
 */

const fs = require('node:fs');
const path = require('node:path');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');

// California counties to model accurately
const CA_COUNTIES = [
  { name: 'Los Angeles', code: '037', baseAqi: 75, ozoneSummer: true, winterInversion: false, fireRisk: 0.8 },
  { name: 'Fresno', code: '019', baseAqi: 82, ozoneSummer: true, winterInversion: true, fireRisk: 1.5 },
  { name: 'Kern', code: '029', baseAqi: 85, ozoneSummer: true, winterInversion: true, fireRisk: 1.4 },
  { name: 'Riverside', code: '065', baseAqi: 80, ozoneSummer: true, winterInversion: false, fireRisk: 1.1 },
  { name: 'San Bernardino', code: '071', baseAqi: 82, ozoneSummer: true, winterInversion: false, fireRisk: 1.2 },
  { name: 'Orange', code: '059', baseAqi: 56, ozoneSummer: false, winterInversion: false, fireRisk: 0.6 },
  { name: 'San Diego', code: '073', baseAqi: 52, ozoneSummer: false, winterInversion: false, fireRisk: 0.7 },
  { name: 'Sacramento', code: '067', baseAqi: 58, ozoneSummer: true, winterInversion: true, fireRisk: 1.3 },
  { name: 'San Francisco', code: '075', baseAqi: 38, ozoneSummer: false, winterInversion: false, fireRisk: 0.9 },
  { name: 'Alameda', code: '001', baseAqi: 42, ozoneSummer: false, winterInversion: false, fireRisk: 0.9 },
  { name: 'Santa Clara', code: '085', baseAqi: 46, ozoneSummer: false, winterInversion: false, fireRisk: 0.8 },
  { name: 'Humboldt', code: '023', baseAqi: 28, ozoneSummer: false, winterInversion: false, fireRisk: 0.6 },
  { name: 'Imperial', code: '025', baseAqi: 68, ozoneSummer: true, winterInversion: false, fireRisk: 0.5 },
  { name: 'Monterey', code: '053', baseAqi: 36, ozoneSummer: false, winterInversion: false, fireRisk: 0.7 },
  { name: 'Ventura', code: '111', baseAqi: 54, ozoneSummer: true, winterInversion: false, fireRisk: 0.9 }
];

// Non-California counties to test State filtering
const NON_CA_COUNTIES = [
  { state: 'Arizona', stateCode: '04', name: 'Maricopa', code: '013', baseAqi: 72 },
  { state: 'Nevada', stateCode: '32', name: 'Clark', code: '003', baseAqi: 64 },
  { state: 'Oregon', stateCode: '41', name: 'Multnomah', code: '051', baseAqi: 38 },
  { state: 'Washington', stateCode: '53', name: 'King', code: '033', baseAqi: 36 }
];

// Wildfire severity multiplier by year (e.g. 2017, 2018, 2020 were extreme fire years)
const WILDFIRE_YEAR_SEVERITY = {
  2015: 0.7,
  2016: 0.8,
  2017: 1.6, // Tubbs, Thomas Fires
  2018: 2.2, // Camp Fire, Mendocino Complex
  2019: 0.9,
  2020: 3.2, // August Complex, Creek Fire, Orange Skies
  2021: 2.0, // Dixie Fire, Caldor Fire
  2022: 1.1, // Mosquito, McKinney
  2023: 0.6, // Wet atmospheric rivers year
  2024: 1.5  // Park Fire
};

function getAQICategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function generateYearCsv(year) {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInYear = isLeap ? 366 : 365;
  const wfMult = WILDFIRE_YEAR_SEVERITY[year] || 1.0;

  const rows = [
    '"State Name","county Name","State Code","County Code","Date","AQI","Category","Defining Parameter","Defining Site","Number of Sites Reporting"'
  ];

  const startDate = new Date(`${year}-01-01T00:00:00Z`);

  for (let d = 0; d < daysInYear; d++) {
    const curDate = new Date(startDate.getTime() + d * 86400000);
    const dateStr = curDate.toISOString().split('T')[0];
    const month = curDate.getUTCMonth() + 1;
    const day = curDate.getUTCDate();

    // Wildfire wave in Aug-Oct (months 8, 9, 10)
    let wildfireSmoke = 0;
    if (month >= 8 && month <= 10) {
      const peakDay = month === 9 && day >= 5 && day <= 25;
      const baseWave = Math.sin(((month - 8) / 3) * Math.PI) * 22 * wfMult;
      wildfireSmoke = baseWave + (peakDay ? 35 * wfMult : 0);
    }

    // California Counties
    for (const c of CA_COUNTIES) {
      let aqi = c.baseAqi;

      // Summer ozone (May - Sept)
      if (c.ozoneSummer && month >= 5 && month <= 9) {
        aqi += 18 * Math.sin(((month - 5) / 4) * Math.PI);
      }

      // Winter stagnation inversion (Nov - Feb)
      if (c.winterInversion && (month >= 11 || month <= 2)) {
        aqi += 26;
      }

      // Wildfire addition
      aqi += wildfireSmoke * c.fireRisk;

      // Day noise
      const pseudoNoise = Math.sin(d * 11.3 + parseInt(c.code, 10)) * 9;
      aqi = Math.max(12, Math.round(aqi + pseudoNoise));

      let param = 'PM2.5';
      if (month >= 5 && month <= 9 && (c.name === 'Riverside' || c.name === 'San Bernardino' || c.name === 'Los Angeles')) {
        param = 'Ozone';
      } else if (wildfireSmoke > 10) {
        param = 'PM2.5';
      }

      const cat = getAQICategory(aqi);
      const site = `06-${c.code}-0001`;

      rows.push(`"California","${c.name}","06","${c.code}","${dateStr}",${aqi},"${cat}","${param}","${site}",4`);
    }

    // Add some Non-California counties every 5 days
    if (d % 5 === 0) {
      for (const nc of NON_CA_COUNTIES) {
        const aqi = Math.max(15, Math.round(nc.baseAqi + Math.sin(d * 7.7) * 8));
        const cat = getAQICategory(aqi);
        rows.push(`"${nc.state}","${nc.name}","${nc.stateCode}","${nc.code}","${dateStr}",${aqi},"${cat}","Ozone","${nc.stateCode}-${nc.code}-0001",3`);
      }
    }
  }

  const filePath = path.join(RAW_DIR, `daily_aqi_by_county_${year}.csv`);
  fs.writeFileSync(filePath, rows.join('\n'), 'utf8');
  console.log(`✅ Generated ${filePath} (${rows.length.toLocaleString()} rows)`);
}

function main() {
  console.log('📦 Generating EPA Daily AQI By County raw datasets (2015-2024)...');
  for (let year = 2015; year <= 2024; year++) {
    generateYearCsv(year);
  }
  console.log('🎉 All 10 raw yearly CSV files generated in data/raw/');
}

main();
