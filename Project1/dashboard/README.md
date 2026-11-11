# 📊 Power BI Analytics Dashboard: California Air Quality (2015–2024)

This folder contains the architectural design, DAX measures dictionary, data modeling specifications, and visual layout guides for creating the **California Air Quality Analysis (2015–2024)** Power BI Report.

---

## 🏗️ 1. Data Model (Star Schema)

Connect Power BI to either `data/processed/ca_aqi_clean.csv` or MySQL database `california_air_db.aqi_daily`.

```
        ┌────────────────────────┐
        │       DimDate          │
        ├────────────────────────┤
        │ Date (PK)              │
        │ Year, Quarter, Month   │
        │ MonthName, DayOfWeek   │
        │ IsWildfireSeason       │
        └──────────┬─────────────┘
                   │ 1
                   │
                   │ *
        ┌──────────┴─────────────┐         ┌────────────────────────┐
        │      FactAQIDaily      │ *     1 │       DimCounty        │
        ├────────────────────────┼─────────┤────────────────────────┤
        │ id (PK)                │         │ CountyName (PK)        │
        │ county (FK) ───────────┘         │ AirBasin               │
        │ date (FK)                        │ Region (North/Central/ │
        │ aqi                              │         South)         │
        │ category                         │ Latitude, Longitude    │
        │ defining_parameter               └────────────────────────┘
        └──────────┬─────────────┘
                   │ *
                   │
                   │ 1
        ┌──────────┴─────────────┐
        │   DimEPAThresholds     │
        ├────────────────────────┤
        │ Category (PK)          │
        │ MinAQI, MaxAQI         │
        │ HexColorCode           │
        │ HealthAdvisory         │
        └────────────────────────┘
```

---

## 🧮 2. Essential DAX Measures Library

Add these calculated measures to your `FactAQIDaily` table:

```dax
// 1. Average Daily AQI
Average AQI = 
AVERAGE(FactAQIDaily[aqi])

// 2. Maximum Single-Day Spike
Peak AQI = 
MAX(FactAQIDaily[aqi])

// 3. Clean Air Days (AQI <= 50)
Good Days Count = 
CALCULATE(
    COUNTROWS(FactAQIDaily), 
    FactAQIDaily[aqi] <= 50
)

// 4. Unhealthy Air Days (AQI > 100)
Unhealthy Days Count = 
CALCULATE(
    COUNTROWS(FactAQIDaily), 
    FactAQIDaily[aqi] > 100
)

// 5. Unhealthy Days Proportion (%)
% Unhealthy Days = 
DIVIDE([Unhealthy Days Count], COUNTROWS(FactAQIDaily), 0)

// 6. 30-Day Moving Average AQI (Smoothing Volatility)
30-Day Rolling AQI = 
CALCULATE(
    AVERAGE(FactAQIDaily[aqi]),
    DATESINPERIOD(DimDate[Date], LASTDATE(DimDate[Date]), -30, DAY)
)

// 7. Year-over-Year (YoY) Change in Average AQI
YoY AQI % Change = 
VAR CurrentYearAQI = [Average AQI]
VAR PriorYearAQI = CALCULATE([Average AQI], SAMEPERIODLASTYEAR(DimDate[Date]))
RETURN
DIVIDE(CurrentYearAQI - PriorYearAQI, PriorYearAQI, 0)

// 8. Wildfire Season Smoke Penalty (Aug-Oct vs Rest of Year)
Wildfire Smoke Penalty = 
VAR WildfireAQI = 
    CALCULATE([Average AQI], MONTH(FactAQIDaily[date]) IN {8, 9, 10})
VAR RegularAQI = 
    CALCULATE([Average AQI], NOT(MONTH(FactAQIDaily[date]) IN {8, 9, 10}))
RETURN
WildfireAQI - RegularAQI

// 9. Dynamic Hex Color for Conditional Formatting
AQI Color Code = 
VAR CurrentAQI = [Average AQI]
RETURN
SWITCH(
    TRUE(),
    CurrentAQI <= 50,  "#10b981", // Good (Green)
    CurrentAQI <= 100, "#f59e0b", // Moderate (Yellow)
    CurrentAQI <= 150, "#f97316", // Sensitive Groups (Orange)
    CurrentAQI <= 200, "#ef4444", // Unhealthy (Red)
    CurrentAQI <= 300, "#8b5cf6", // Very Unhealthy (Purple)
    "#881337"                     // Hazardous (Maroon)
)
```

---

## 🖥️ 3. Dashboard Wireframe & Layout Specifications

### Page 1: Executive Overview & Geographic Disparity
- **Top KPI Cards**: Statewide Average AQI, Peak AQI, Total Unhealthy Days, Cleanest County vs Most Polluted County.
- **Visual 1 (ArcGIS / Shape Map)**: California Map with county polygons or bubble markers colored by `[AQI Color Code]`.
- **Visual 2 (Clustered Bar Chart)**: Top-10 Counties ranked by `[Average AQI]` with reference lines at 50 and 100 AQI.
- **Visual 3 (Donut Chart)**: Distribution of EPA Categories (`Good`, `Moderate`, `Unhealthy for Sensitive Groups`, `Unhealthy`, etc.).
- **Slicers**: Year Range (2015–2024), Air Basin, Pollutant Filter.

### Page 2: Seasonal & Wildfire Impact Analysis
- **Visual 1 (Heatmap Matrix)**: Rows = `County`, Columns = `MonthName`, Values = `[Average AQI]` with gradient formatting from `#10b981` to `#ef4444`.
- **Visual 2 (Dual-Axis Line & Column)**: X-axis = `Year`, Column = `Wildfire Smoke Penalty`, Line = `Peak AQI`.
- **Visual 3 (Decomposition Tree)**: Root = `Unhealthy Days Count` explained by `Air Basin` $\to$ `Season` $\to$ `Defining Parameter`.

### Page 3: County Time-Series & 30-Day Moving Average
- **Visual 1 (Line Chart)**: Daily AQI vs `[30-Day Rolling AQI]` with zoom slider.
- **Visual 2 (Waterfall Chart)**: Year-over-Year Net Change in Good Days by county.
- **Visual 3 (Detail Table)**: Matrix view with drill-through capability down to individual measurement dates.

---

## 📌 4. How to Connect in Power BI Desktop

1. Open Power BI Desktop $\to$ **Get Data** $\to$ **Text/CSV**.
2. Select `data/processed/ca_aqi_clean.csv`.
3. In Power Query:
   - Ensure `date` is detected as **Date** data type.
   - Ensure `aqi` is detected as **Whole Number**.
   - Ensure `county`, `category`, and `defining_parameter` are **Text**.
4. Click **Close & Apply**.
5. Paste the DAX measures above into the modeling tab.
