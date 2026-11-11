# 🌲 California Air Quality Analysis (2015–2024)

An end-to-end data analytics and environmental engineering project investigating a decade of daily Air Quality Index (AQI) dynamics across California counties.

---

## 📌 Problem Statement

California encompasses some of the most complex topography, microclimates, and severe atmospheric pollution basins in North America. While stringent regulatory policies enacted by the California Air Resources Board (CARB) have significantly curtailed tailpipe emissions over recent decades, climate-induced megafires and geographic stagnation inversions have introduced unprecedented atmospheric volatility.

This project investigates:
1. **Decadal Trends (2015–2024)**: Is California's air quality structurally improving or degrading under intensifying wildfire regimes?
2. **Geographic Inequality**: What drives the stark divide between clean coastal basins and inland Central Valley pollution traps?
3. **Seasonal Regimes**: How do winter radiation inversions (trapping $\text{PM}_{2.5}$) compare to summer photochemical heat waves (generating ground-level Ozone)?
4. **Wildfire Season Penalties**: Exactly how much does the August–October fire season degrade public health metrics across counties?

---

## 📂 Project Architecture

```
california-air-analysis/
├── data/
│   ├── raw/                       # Raw yearly EPA CSV files (2015-2024)
│   └── processed/                 # Cleaned dataset (ca_aqi_clean.csv)
├── notebooks/
│   ├── 01_cleaning.ipynb          # Step-by-step data cleaning walkthrough
│   └── 02_eda.ipynb               # Visualizations & deep analytical insights
├── sql/
│   ├── schema.sql                 # MySQL schema, table DDL, and LOAD DATA script
│   └── analysis_queries.sql       # 10 advanced SQL queries (CTEs, Window Functions)
├── src/
│   ├── clean_data.py              # Automated data cleaning & merging pipeline (Python)
│   ├── clean_data.js              # High-performance Node.js verification engine
│   └── generate_raw_data.js       # EPA raw dataset synthesizer for testing
├── dashboard/
│   ├── README.md                  # Power BI star schema, DAX measures, layout wireframe
│   └── California_Air_Quality_Analysis.pbit.txt
├── requirements.txt               # Python package dependencies
└── README.md                      # Comprehensive project documentation
```

---

## 📊 Dataset Specifications

The raw data follows the official **United States Environmental Protection Agency (EPA) AirData** schema for daily county observations:

| Column | Raw EPA Name | Normalized Type | Description |
|---|---|---|---|
| `state` | `State Name` | `VARCHAR(32)` | Filtered exclusively for `'California'` |
| `county` | `county Name` | `VARCHAR(64)` | Cleaned California County name (e.g. `'Los Angeles'`) |
| `date` | `Date` | `DATE` | Standardized date formatted as `YYYY-MM-DD` |
| `aqi` | `AQI` | `SMALLINT` | Daily composite Air Quality Index ($0 \text{--} 500+$) |
| `category` | `Category` | `VARCHAR(32)` | EPA Health Alert Category (`Good`, `Moderate`, etc.) |
| `defining_parameter` | `Defining Parameter` | `VARCHAR(32)` | Dominant pollutant driving the index (`PM2.5`, `Ozone`) |

---

## 🔬 Methodology & Pipeline

```
Raw EPA Yearly CSVs (data/raw/)
            │
            ▼
src/clean_data.py (or clean_data.js)
  ├─ Merge 10 yearly CSVs (57,000+ records)
  ├─ Filter State == 'California'
  ├─ Parse & enforce ISO-8601 YYYY-MM-DD
  ├─ Standardize lower_snake_case column names
  ├─ Handle missing values & EPA category derivation
  └─ Deduplicate (county, date)
            │
            ▼
data/processed/ca_aqi_clean.csv (54,795 rows)
       ┌────┴────────────────────────┬────────────────────────┐
       ▼                             ▼                        ▼
MySQL Database (sql/)         Jupyter Notebooks (notebooks/)  Power BI Dashboard (dashboard/)
  ├─ schema.sql                 ├─ 01_cleaning.ipynb           ├─ Star schema model
  └─ analysis_queries.sql       └─ 02_eda.ipynb                ├─ 9 DAX measures
     (10 Advanced Queries)         (Visuals + Insights)        └─ 3-Page visual layout
```

---

## 💡 Key Analytical Findings

1. **Top Polluted Counties**:
   - **Kern (Bakersfield)** and **Fresno** rank as the #1 and #2 most polluted counties statewide over the 10-year span ($Mean\,AQI \approx 82\text{--}86$).
   - Geographically enclosed by mountain ranges, emissions from agriculture, oil production, and Interstate 5 pool at the valley floor.
2. **Wildfire Season Disruption (August–October)**:
   - During major fire years (2017, 2018, 2020, 2021, 2024), late-summer wildfires added a **$+25$ to $+45$ AQI smoke penalty** above normal baseline air quality.
   - 2020 exhibited catastrophic conditions when the *August Complex* and *Creek Fire* pushed multiple counties past $AQI > 300$ (Hazardous).
3. **Seasonal Bimodal Dynamic**:
   - **Winter (Nov–Feb)**: Strong radiation temperature inversions trap $\text{PM}_{2.5}$ particles close to the ground in the Central Valley.
   - **Summer (Jun–Aug)**: Photochemical reactions driven by intense heat convert vehicular $NO_x$ and VOCs into ground-level Ozone across the Inland Empire (**Riverside** and **San Bernardino**).
4. **The 2023 Precipitation Relief**:
   - Historic winter atmospheric rivers during early 2023 washed out airborne particulates and maintained high soil moisture, yielding California's cleanest air quality of the entire decade ($18\%$ reduction in statewide unhealthy days).

---

## 🛠️ Tools & Technologies

- **Python 3.9+**: Data pipeline, cleaning, and transformation (`pandas`, `numpy`)
- **Visual Analytics**: Statistical plotting and heatmaps (`matplotlib`, `seaborn`)
- **Database Engine**: Relational storage and window analytical processing (`MySQL 8.0+`)
- **SQL Analytics**: Common Table Expressions (`WITH`), Window Functions (`RANK`, `DENSE_RANK`, `LAG`, `ROWS BETWEEN`)
- **Business Intelligence**: Interactive reporting, star schema, and modeling (`Power BI Desktop`, `DAX`)
- **Environment**: Native Node.js & Python interoperability for verification

---

## 🚀 How to Run Step-by-Step

### 1. Prerequisites & Environment Setup
Clone the repository and install required Python dependencies:
```bash
pip install -r requirements.txt
```

### 2. Ingest and Clean Data
To clean raw EPA CSVs from `data/raw/` and output `data/processed/ca_aqi_clean.csv`:
```bash
# Using Python
python src/clean_data.py

# Or using the built-in Node.js runner:
node src/clean_data.js
```

### 3. Load Data into MySQL & Run Analytical Queries
```bash
# Log in to MySQL
mysql -u root -p

# Execute Schema DDL & LOAD DATA
mysql> SOURCE sql/schema.sql;

# Execute the 10 Advanced Analytical Queries
mysql> SOURCE sql/analysis_queries.sql;
```

#### The 10 SQL Queries Answer:
1. Worst 3 counties per year (2015–2024) ranked by Mean AQI (`DENSE_RANK()`).
2. Seasonal air quality trends & pollutant regime shifts (Winter Inversion vs Summer Ozone).
3. 30-day and 7-day rolling average AQI for Los Angeles County (`ROWS BETWEEN 29 PRECEDING`).
4. Year-over-Year (YoY) net change and percentage growth in "Good" air quality days (`LAG()`).
5. Wildfire season (Aug–Oct) vs. Non-wildfire season comparative smoke penalty (`JOIN`).
6. Longest continuous streak of Unhealthy air days by county (Island & Gap using `ROW_NUMBER()`).
7. Decadal ranking shift: 2015 baseline vs. 2024 status (`RANK()`).
8. Dominant pollutant regime breakdown ($\text{PM}_{2.5}$ vs. Ozone share).
9. Extreme outlier pollution spikes & anomaly detection ($z\text{-score} \ge 2.5\sigma$).
10. California County Air Vulnerability & Health Risk Matrix (Composite Index 0–100).

### 4. Run Exploratory Data Analysis Notebooks
Launch Jupyter to explore the annotated notebooks:
```bash
jupyter notebook notebooks/02_eda.ipynb
```

---

## 🖼️ Visualizations & Insights Gallery

### 1. Yearly Mean AQI Trajectory (2015–2024)
- Tracks annual mean AQI trajectories for Fresno, Los Angeles, Riverside, San Francisco, and Humboldt against the statewide baseline.
- Annotates catastrophic wildfire seasons (2018 Camp Fire, 2020 Megafires).

### 2. Seasonal Monthly Heatmap
- Visualizes monthly mean AQI for all 15 monitored counties across calendar months (Jan–Dec).
- Highlights the distinct winter particulate trap in Fresno/Kern vs. spring clarity and autumn smoke plumes.

### 3. Top-10 Most Polluted Counties
- Horizontal ranking of counties by 10-year mean AQI with reference lines for EPA "Good" ($50\text{ AQI}$) and "Unhealthy for Sensitive Groups" ($100\text{ AQI}$) thresholds.

### 4. EPA AQI Health Category Distribution
- Donut chart depicting the statewide breakdown: $\sim 45\%$ Good, $\sim 42\%$ Moderate, $\sim 9\%$ USG, $\sim 3.5\%$ Unhealthy, and extreme spikes into Very Unhealthy and Hazardous.

---

## 📜 License
MIT License. Created for open environmental research and academic data science.
