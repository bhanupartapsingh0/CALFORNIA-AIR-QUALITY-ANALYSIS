/**
 * California Air Quality Analysis (2015-2024) - Node.js Cleaner & Verifier
 * Implements the exact same cleaning rules as src/clean_data.py
 */

const fs = require('node:fs');
const path = require('node:path');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const PROCESSED_DIR = path.join(__dirname, '..', 'data', 'processed');
const OUTPUT_FILE = path.join(PROCESSED_DIR, 'ca_aqi_clean.csv');

function deriveAQICategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function main() {
  console.log('=' .repeat(70));
  console.log('CALIFORNIA AIR QUALITY ANALYSIS (2015-2024): DATA CLEANING & MERGING');
  console.log('=' .repeat(70));

  const files = fs.readdirSync(RAW_DIR)
    .filter(f => f.endsWith('.csv'))
    .sort();

  if (files.length === 0) {
    console.error('❌ No CSV files found in data/raw');
    process.exit(1);
  }

  console.log(`📁 Found ${files.length} raw CSV files in data/raw:`);

  let totalRawRows = 0;
  let nonCARows = 0;
  let invalidRows = 0;
  const cleanRows = [];
  const seen = new Set();

  for (const filename of files) {
    const fullPath = path.join(RAW_DIR, filename);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (lines.length <= 1) continue;
    const header = parseCSVLine(lines[0]);
    const colIdx = {};
    header.forEach((h, i) => {
      const cleanH = h.replace(/^"|"$/g, '').toLowerCase().replace(/[\s-]+/g, '_');
      if (['state_name', 'state'].includes(cleanH)) colIdx.state = i;
      else if (['county_name', 'county'].includes(cleanH)) colIdx.county = i;
      else if (cleanH === 'date') colIdx.date = i;
      else if (cleanH === 'aqi') colIdx.aqi = i;
      else if (cleanH === 'category') colIdx.category = i;
      else if (['defining_parameter', 'defining_param', 'parameter'].includes(cleanH)) colIdx.param = i;
    });

    let yearCount = 0;
    for (let i = 1; i < lines.length; i++) {
      totalRawRows++;
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 5) {
        invalidRows++;
        continue;
      }

      // Check state
      const state = (cols[colIdx.state] || '').replace(/^"|"$/g, '').trim();
      if (state.toLowerCase() !== 'california' && state.toLowerCase() !== 'ca') {
        nonCARows++;
        continue;
      }

      // Clean county
      let county = (cols[colIdx.county] || '').replace(/^"|"$/g, '').trim();
      county = county.replace(/\s+county$/i, '').trim();
      if (!county) {
        invalidRows++;
        continue;
      }

      // Clean date
      const dateStr = (cols[colIdx.date] || '').replace(/^"|"$/g, '').trim();
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        invalidRows++;
        continue;
      }
      const isoDate = dateStr; // already YYYY-MM-DD

      // AQI
      const aqiStr = (cols[colIdx.aqi] || '').replace(/^"|"$/g, '').trim();
      const aqi = parseInt(aqiStr, 10);
      if (isNaN(aqi) || aqi < 0) {
        invalidRows++;
        continue;
      }

      // Category
      let cat = (cols[colIdx.category] || '').replace(/^"|"$/g, '').trim();
      if (!cat || cat.toLowerCase() === 'nan') {
        cat = deriveAQICategory(aqi);
      }

      // Defining Parameter
      let param = (cols[colIdx.param] || '').replace(/^"|"$/g, '').trim();
      if (!param || param.toLowerCase() === 'nan') {
        param = 'Unspecified';
      }

      // Deduplicate on (county, date)
      const dedupKey = `${county}|${isoDate}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      cleanRows.push({ county, date: isoDate, aqi, category: cat, defining_parameter: param });
      yearCount++;
    }

    console.log(`  📄 Processed ${filename}: ${yearCount.toLocaleString()} California records`);
  }

  // Sort by date, county
  cleanRows.sort((a, b) => a.date.localeCompare(b.date) || a.county.localeCompare(b.county));

  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  const outLines = ['county,date,aqi,category,defining_parameter'];
  for (const r of cleanRows) {
    outLines.push(`"${r.county}","${r.date}",${r.aqi},"${r.category}","${r.defining_parameter}"`);
  }

  fs.writeFileSync(OUTPUT_FILE, outLines.join('\n'), 'utf8');

  console.log('\n' + '='.repeat(70));
  console.log('CLEANING SUMMARY & VERIFICATION');
  console.log('='.repeat(70));
  console.log(`📊 Total Raw Records Scanned:     ${totalRawRows.toLocaleString()}`);
  console.log(`🚫 Non-California Rows Dropped:   ${nonCARows.toLocaleString()}`);
  console.log(`⚠️ Invalid Rows Discarded:        ${invalidRows.toLocaleString()}`);
  console.log(`✅ Clean Records Exported:        ${cleanRows.length.toLocaleString()}`);
  console.log(`📍 Unique California Counties:    ${new Set(cleanRows.map(r => r.county)).size}`);
  console.log(`📅 Date Span:                     ${cleanRows[0].date} to ${cleanRows[cleanRows.length - 1].date}`);
  console.log(`📁 Destination File:              ${OUTPUT_FILE}`);
  console.log('='.repeat(70));
}

main();
