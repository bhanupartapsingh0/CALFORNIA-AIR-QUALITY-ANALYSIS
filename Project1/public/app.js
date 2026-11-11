/**
 * California Air Quality Analysis - Interactive Frontend Engine
 * Manages Leaflet Map, Chart.js Visualizations, REST API Integration & Offline Fallback
 */

// Fallback dataset for instant preview if server isn't queried or offline
const MOCK_STATIONS = [
  { id: '06-037-1103', name: 'Los Angeles - N Main St', county: 'Los Angeles', basin: 'South Coast', lat: 34.0665, lon: -118.2268, composite_aqi: 78, pm25_ugm3: 13.2, ozone_ppm: 0.058, no2_ppb: 28, dominant_pollutant: 'Ozone' },
  { id: '06-065-8001', name: 'Riverside - Rubidoux', county: 'Riverside', basin: 'South Coast', lat: 33.9996, lon: -117.4160, composite_aqi: 86, pm25_ugm3: 14.5, ozone_ppm: 0.065, no2_ppb: 26, dominant_pollutant: 'Ozone' },
  { id: '06-019-0011', name: 'Fresno - Garland', county: 'Fresno', basin: 'San Joaquin Valley', lat: 36.7854, lon: -119.7732, composite_aqi: 98, pm25_ugm3: 34.6, ozone_ppm: 0.048, no2_ppb: 22, dominant_pollutant: 'PM2.5' },
  { id: '06-029-0014', name: 'Bakersfield - California Ave', county: 'Kern', basin: 'San Joaquin Valley', lat: 35.3589, lon: -119.0344, composite_aqi: 104, pm25_ugm3: 37.2, ozone_ppm: 0.052, no2_ppb: 25, dominant_pollutant: 'PM2.5' },
  { id: '06-075-0005', name: 'San Francisco - Arkansas St', county: 'San Francisco', basin: 'San Francisco Bay Area', lat: 37.7659, lon: -122.3990, composite_aqi: 36, pm25_ugm3: 6.5, ozone_ppm: 0.026, no2_ppb: 18, dominant_pollutant: 'PM2.5' },
  { id: '06-085-0005', name: 'San Jose - Jackson St', county: 'Santa Clara', basin: 'San Francisco Bay Area', lat: 37.3486, lon: -121.8949, composite_aqi: 44, pm25_ugm3: 7.9, ozone_ppm: 0.032, no2_ppb: 21, dominant_pollutant: 'PM2.5' },
  { id: '06-067-0010', name: 'Sacramento - T Street', county: 'Sacramento', basin: 'Sacramento Valley', lat: 38.5684, lon: -121.4931, composite_aqi: 56, pm25_ugm3: 11.2, ozone_ppm: 0.044, no2_ppb: 17, dominant_pollutant: 'Ozone' },
  { id: '06-073-1006', name: 'San Diego - Perkins Ave', county: 'San Diego', basin: 'San Diego County', lat: 32.6895, lon: -117.1306, composite_aqi: 48, pm25_ugm3: 8.8, ozone_ppm: 0.035, no2_ppb: 19, dominant_pollutant: 'PM2.5' },
  { id: '06-023-1004', name: 'Eureka - H Street', county: 'Humboldt', basin: 'North Coast', lat: 40.7997, lon: -124.1611, composite_aqi: 32, pm25_ugm3: 5.8, ozone_ppm: 0.025, no2_ppb: 7, dominant_pollutant: 'PM2.5' },
  { id: '06-025-0005', name: 'Calexico - East 5th St', county: 'Imperial', basin: 'Salton Sea', lat: 32.6761, lon: -115.4839, composite_aqi: 64, pm25_ugm3: 15.2, ozone_ppm: 0.046, no2_ppb: 14, dominant_pollutant: 'PM2.5' }
];

function getAQIColor(aqi) {
  if (aqi <= 50) return '#10b981'; // Good (Green)
  if (aqi <= 100) return '#f59e0b'; // Moderate (Yellow)
  if (aqi <= 150) return '#f97316'; // Sensitive (Orange)
  if (aqi <= 200) return '#ef4444'; // Unhealthy (Red)
  if (aqi <= 300) return '#8b5cf6'; // Very Unhealthy (Purple)
  return '#881337'; // Hazardous (Maroon)
}

function getAQICategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

let map = null;
let stationMarkers = [];
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initCalculator();
  loadData();
  setupEventListeners();
});

// 1. Initialize Map
function initMap() {
  const mapElement = document.getElementById('california-map');
  if (!mapElement) return;

  // Center on California coordinates
  map = L.map('california-map').setView([36.7783, -119.4179], 6);

  // CartoDB Dark Matter tile layer for high contrast styling
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>, CARB, EPA',
    maxZoom: 18,
  }).addTo(map);
}

// 2. Setup Event Listeners
function setupEventListeners() {
  document.getElementById('basin-select').addEventListener('change', () => loadData());
  document.getElementById('pollutant-select').addEventListener('change', () => updateMapMarkers());
  document.getElementById('year-select').addEventListener('change', () => loadHistoricalData());
  document.getElementById('btn-refresh').addEventListener('click', () => loadData());
}

// 3. Main Data Fetching Engine
let currentStations = [];

async function loadData() {
  const basin = document.getElementById('basin-select').value;
  
  try {
    // Summary
    const summaryRes = await fetch('/api/summary');
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      renderSummary(summary);
    }

    // Stations
    const stationsUrl = basin === 'All' ? '/api/stations' : `/api/stations?basin=${encodeURIComponent(basin)}`;
    const stationsRes = await fetch(stationsUrl);
    if (stationsRes.ok) {
      currentStations = await stationsRes.json();
    } else {
      currentStations = MOCK_STATIONS;
    }
  } catch (e) {
    console.warn('Backend API offline or unreachable, using integrated datasets:', e);
    currentStations = MOCK_STATIONS;
    renderSummaryFallback();
  }

  updateMapMarkers();
  renderStationList();
  loadHistoricalData();
  loadWildfireData();
  loadForecastData(basin);
}

// 4. Render Summary Metrics
function renderSummary(s) {
  const avgEl = document.getElementById('kpi-avg-aqi');
  const catEl = document.getElementById('kpi-avg-category');
  const worstEl = document.getElementById('kpi-worst-basin');
  const cleanestEl = document.getElementById('kpi-cleanest-county');

  if (avgEl) {
    avgEl.textContent = s.statewideAvgAQI;
    avgEl.style.color = s.overallCategory.color;
  }
  if (catEl) {
    catEl.textContent = `${s.overallCategory.category} (${s.latestDate})`;
  }
  if (worstEl && s.basinRankings && s.basinRankings[0]) {
    worstEl.textContent = s.basinRankings[0].basin;
    document.getElementById('kpi-worst-basin-desc').textContent = `Mean AQI ${s.basinRankings[0].avg_aqi} (${s.basinRankings[0].unhealthy_days} Unhealthy Days)`;
  }
  if (cleanestEl && s.cleanestCounty) {
    cleanestEl.textContent = `${s.cleanestCounty.county} County`;
    document.getElementById('kpi-cleanest-desc').textContent = `Mean AQI ${s.cleanestCounty.avg_aqi} (Cleanest in CA)`;
  }
}

function renderSummaryFallback() {
  document.getElementById('kpi-avg-aqi').textContent = '62';
  document.getElementById('kpi-avg-category').textContent = 'Moderate (CARB Aggregated)';
  document.getElementById('kpi-worst-basin').textContent = 'San Joaquin Valley';
  document.getElementById('kpi-cleanest-county').textContent = 'Humboldt County';
}

// 5. Update Map Markers
function updateMapMarkers() {
  if (!map) return;

  // Clear existing markers
  stationMarkers.forEach(m => map.removeLayer(m));
  stationMarkers = [];

  const pollutantKey = document.getElementById('pollutant-select').value;

  currentStations.forEach(st => {
    const aqi = st.composite_aqi || 50;
    const color = getAQIColor(aqi);

    // Marker radius proportional to pollution level
    const radius = Math.max(8, Math.min(22, 6 + aqi * 0.12));

    const marker = L.circleMarker([st.lat, st.lon], {
      radius: radius,
      fillColor: color,
      color: '#ffffff',
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.8
    }).addTo(map);

    const popupContent = `
      <div style="font-family: inherit; font-size: 0.85rem; min-width: 180px;">
        <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 4px; color: #f8fafc;">${st.name}</h4>
        <div style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 8px;">${st.basin} &bull; ${st.county} Co.</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span>EPA AQI:</span>
          <strong style="color: ${color}; font-size: 1.1rem;">${aqi}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #cbd5e1;">
          <span>PM2.5:</span>
          <span>${st.pm25_ugm3 || '--'} µg/m³</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #cbd5e1;">
          <span>Ozone (O₃):</span>
          <span>${st.ozone_ppm || '--'} ppm</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #cbd5e1;">
          <span>NO₂:</span>
          <span>${st.no2_ppb || '--'} ppb</span>
        </div>
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #334155; font-size: 0.75rem; text-align: center; color: ${color}; font-weight: 600;">
          ${getAQICategory(aqi)}
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    stationMarkers.push(marker);
  });
}

// 6. Render Station Scroll List
function renderStationList() {
  const container = document.getElementById('station-list-container');
  const countBadge = document.getElementById('station-count-badge');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${currentStations.length} Stations`;

  container.innerHTML = currentStations.map(st => {
    const aqi = st.composite_aqi || 50;
    const color = getAQIColor(aqi);

    return `
      <div class="station-item" onclick="zoomToStation(${st.lat}, ${st.lon})">
        <div>
          <div class="station-name">${st.name}</div>
          <div class="station-meta">${st.basin} &bull; PM2.5: ${st.pm25_ugm3} µg/m³</div>
        </div>
        <div class="aqi-pill" style="background: ${color}22; color: ${color}; border: 1px solid ${color}66;">
          ${aqi}
        </div>
      </div>
    `;
  }).join('');
}

window.zoomToStation = function(lat, lon) {
  if (map) {
    map.flyTo([lat, lon], 11, { duration: 1.2 });
  }
};

// 7. Load Historical Multi-Year Trends Chart
async function loadHistoricalData() {
  const basin = document.getElementById('basin-select').value;
  const year = document.getElementById('year-select').value;

  let labels = [];
  let aqiData = [];
  let pm25Data = [];
  let ozoneData = [];

  try {
    const res = await fetch(`/api/historical?basin=${encodeURIComponent(basin)}&year=${encodeURIComponent(year)}`);
    if (res.ok) {
      const data = await res.json();
      labels = data.monthly.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`);
      aqiData = data.monthly.map(m => m.avg_aqi);
      pm25Data = data.monthly.map(m => m.avg_pm25);
      ozoneData = data.monthly.map(m => m.avg_ozone * 1000); // scaled for visualization
      renderSeasonalChart(data.seasonal);
    }
  } catch (e) {
    // Fallback data
    labels = ['2021-01', '2021-06', '2021-09', '2022-01', '2022-07', '2023-01', '2023-08', '2024-01', '2024-08', '2025-01', '2025-09', '2026-06'];
    aqiData = [88, 62, 135, 78, 58, 65, 82, 84, 118, 76, 92, 54];
    pm25Data = [28.2, 9.4, 48.6, 24.1, 8.8, 18.2, 16.5, 26.4, 38.1, 23.5, 29.4, 9.8];
  }

  // Render Historical Trend Chart
  const ctx = document.getElementById('historicalChart');
  if (!ctx) return;

  if (charts.historical) charts.historical.destroy();

  charts.historical = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Average AQI',
          data: aqiData,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5
        },
        {
          label: 'PM2.5 (µg/m³)',
          data: pm25Data,
          borderColor: '#f97316',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      }
    }
  });

  loadBasinRankings();
}

// 8. Basin Comparison Chart
async function loadBasinRankings() {
  const ctx = document.getElementById('basinComparisonChart');
  if (!ctx) return;

  let basins = ['San Joaquin Valley', 'South Coast', 'Salton Sea', 'Sacramento Valley', 'SF Bay Area', 'San Diego', 'North Coast'];
  let avgAqi = [84.2, 76.5, 68.4, 58.9, 44.2, 42.1, 28.5];
  let unhealthyDays = [142, 118, 74, 52, 28, 14, 6];

  try {
    const res = await fetch('/api/summary');
    if (res.ok) {
      const data = await res.json();
      if (data.basinRankings) {
        basins = data.basinRankings.map(b => b.basin);
        avgAqi = data.basinRankings.map(b => b.avg_aqi);
        unhealthyDays = data.basinRankings.map(b => b.unhealthy_days);
      }
    }
  } catch (e) {}

  if (charts.basin) charts.basin.destroy();

  charts.basin = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: basins,
      datasets: [
        {
          label: 'Mean AQI',
          data: avgAqi,
          backgroundColor: avgAqi.map(a => getAQIColor(a)),
          borderRadius: 6
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

// 9. Wildfire Correlation Chart
async function loadWildfireData() {
  const ctx = document.getElementById('wildfireChart');
  if (!ctx) return;

  let years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];
  let acres = [4.39, 2.56, 0.36, 0.32, 1.04, 0.65, 0.41]; // Millions of acres
  let pm25 = [86.7, 80.1, 61.6, 49.7, 76.4, 67.5, 54.9];

  try {
    const res = await fetch('/api/wildfire');
    if (res.ok) {
      const data = await res.json();
      years = data.wildfires.map(w => w.year);
      acres = data.wildfires.map(w => (w.acres_burned / 1000000).toFixed(2));
      pm25 = data.wildfires.map(w => w.statewide_avg_wildfire_pm25);
    }
  } catch (e) {}

  if (charts.wildfire) charts.wildfire.destroy();

  charts.wildfire = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        {
          type: 'bar',
          label: 'Acres Burned (Millions)',
          data: acres,
          backgroundColor: 'rgba(239, 68, 68, 0.45)',
          borderColor: '#ef4444',
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Peak Smoke PM2.5 (µg/m³)',
          data: pm25,
          borderColor: '#fbbf24',
          backgroundColor: '#fbbf24',
          borderWidth: 3,
          tension: 0.2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Acres (M)', color: '#ef4444' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'PM2.5 (µg/m³)', color: '#fbbf24' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#fbbf24' }
        }
      }
    }
  });
}

// 10. Seasonal Stagnation Chart
function renderSeasonalChart(seasonalData) {
  const ctx = document.getElementById('seasonalChart');
  if (!ctx) return;

  let seasons = ['Winter (Dec-Feb)', 'Spring (Mar-May)', 'Summer (Jun-Aug)', 'Autumn (Sep-Nov)'];
  let pm25Vals = [28.4, 9.2, 12.8, 22.1];
  let ozoneVals = [32, 45, 68, 52];

  if (seasonalData && seasonalData.length > 0) {
    seasons = seasonalData.map(s => s.season);
    pm25Vals = seasonalData.map(s => s.avg_pm25);
    ozoneVals = seasonalData.map(s => Math.round(s.avg_ozone * 1000));
  }

  if (charts.seasonal) charts.seasonal.destroy();

  charts.seasonal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: seasons,
      datasets: [
        {
          label: 'Winter Stagnation PM2.5 (µg/m³)',
          data: pm25Vals,
          backgroundColor: '#38bdf8',
          borderRadius: 6
        },
        {
          label: 'Photochemical Ozone (ppb)',
          data: ozoneVals,
          backgroundColor: '#f59e0b',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

// 11. 7-Day Statistical Forecast
async function loadForecastData(basin) {
  const container = document.getElementById('forecast-container');
  if (!container) return;

  const targetBasin = basin === 'All' ? 'South Coast' : basin;

  try {
    const res = await fetch(`/api/forecast?basin=${encodeURIComponent(targetBasin)}`);
    if (res.ok) {
      const data = await res.json();
      container.innerHTML = data.forecast.slice(0, 7).map(f => `
        <div class="forecast-row">
          <div>
            <strong>${f.dayName}</strong> &bull; <span style="color: #94a3b8;">${f.date}</span>
          </div>
          <div>
            <span style="font-weight: 700; color: ${f.color}; font-size: 0.95rem;">
              AQI ${f.predictedAQI}
            </span>
            <span style="font-size: 0.75rem; color: #64748b; margin-left: 6px;">(${f.lowerCI}-${f.upperCI})</span>
          </div>
          <div style="font-size: 0.75rem; color: ${f.color}; background: ${f.color}15; padding: 2px 8px; border-radius: 4px;">
            ${f.category}
          </div>
        </div>
      `).join('');
      return;
    }
  } catch (e) {}

  // Fallback 7-day projection
  const days = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  container.innerHTML = days.map((d, i) => {
    const aqi = 68 + i * 4;
    const col = getAQIColor(aqi);
    return `
      <div class="forecast-row">
        <div><strong>${d}</strong> &bull; <span style="color: #94a3b8;">Next 7 Days</span></div>
        <div><strong style="color: ${col}; font-size: 0.95rem;">AQI ${aqi}</strong></div>
        <div style="font-size: 0.75rem; color: ${col}; background: ${col}15; padding: 2px 8px; border-radius: 4px;">${getAQICategory(aqi)}</div>
      </div>
    `;
  }).join('');
}

// 12. Interactive AQI Calculator
function initCalculator() {
  const pmInput = document.getElementById('input-pm25');
  const ozInput = document.getElementById('input-ozone');
  const no2Input = document.getElementById('input-no2');

  const recalc = () => {
    const pm = parseFloat(pmInput.value) || 0;
    const oz = parseFloat(ozInput.value) || 0;
    const no2 = parseFloat(no2Input.value) || 0;

    // PM2.5 AQI
    let pmAQI = 0;
    if (pm <= 9.0) pmAQI = Math.round((50 / 9.0) * pm);
    else if (pm <= 35.4) pmAQI = Math.round(51 + (49 / (35.4 - 9.1)) * (pm - 9.1));
    else if (pm <= 55.4) pmAQI = Math.round(101 + (49 / (55.4 - 35.5)) * (pm - 35.5));
    else if (pm <= 125.4) pmAQI = Math.round(151 + (49 / (125.4 - 55.5)) * (pm - 55.5));
    else if (pm <= 225.4) pmAQI = Math.round(201 + (99 / (225.4 - 125.5)) * (pm - 125.5));
    else pmAQI = Math.round(301 + (199 / (500.4 - 225.5)) * (pm - 225.5));

    // Ozone AQI
    let ozAQI = 0;
    if (oz <= 0.054) ozAQI = Math.round((50 / 0.054) * oz);
    else if (oz <= 0.070) ozAQI = Math.round(51 + (49 / 0.015) * (oz - 0.055));
    else if (oz <= 0.085) ozAQI = Math.round(101 + (49 / 0.014) * (oz - 0.071));
    else if (oz <= 0.105) ozAQI = Math.round(151 + (49 / 0.019) * (oz - 0.086));
    else ozAQI = Math.round(201 + (99 / 0.094) * (oz - 0.106));

    const finalAQI = Math.min(500, Math.max(pmAQI, ozAQI));
    let dominant = pmAQI >= ozAQI ? 'PM2.5' : 'Ozone (O₃)';

    const color = getAQIColor(finalAQI);
    const cat = getAQICategory(finalAQI);

    document.getElementById('calc-aqi-val').textContent = finalAQI;
    document.getElementById('calc-aqi-val').style.color = color;
    document.getElementById('calc-cat-text').textContent = cat;
    document.getElementById('calc-cat-text').style.color = color;
    document.getElementById('calc-dominant-text').textContent = `Dominant Pollutant: ${dominant}`;

    let advisory = 'Air quality is satisfactory; air pollution poses little or no risk.';
    if (finalAQI > 200) {
      advisory = 'Health alert: The risk of health effects is increased for everyone. Avoid outdoor exertion and keep indoor air filtered.';
    } else if (finalAQI > 150) {
      advisory = 'Everyone may begin to experience health effects; sensitive groups should avoid prolonged outdoor physical activity.';
    } else if (finalAQI > 100) {
      advisory = 'Members of sensitive groups (children, asthmatics, older adults) may experience health effects. Limit prolonged outdoor exertion.';
    } else if (finalAQI > 50) {
      advisory = 'Air quality is acceptable. Unusually sensitive people should consider limiting prolonged outdoor exertion.';
    }
    document.getElementById('calc-advisory-text').textContent = advisory;
  };

  pmInput.addEventListener('input', recalc);
  ozInput.addEventListener('input', recalc);
  no2Input.addEventListener('input', recalc);
}
