"""
California Air Quality Analysis (2015-2024) - Data Cleaning Pipeline
=====================================================================
Script: src/clean_data.py

Tasks:
1. Merge all yearly EPA Daily AQI CSV files from data/raw/
2. Keep only records where State == 'California'
3. Parse and standardize dates to ISO-8601 (YYYY-MM-DD)
4. Standardize column names to lower snake_case:
   [county, date, aqi, category, defining_parameter]
5. Handle missing values, anomalies, and duplicates
6. Export cleaned dataset to data/processed/ca_aqi_clean.csv
"""

import os
import sys
import glob
from datetime import datetime

# Attempt to import pandas, with pure-Python fallback for maximum environment compatibility
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    import csv


# Project paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(BASE_DIR, 'data', 'raw')
PROCESSED_DIR = os.path.join(BASE_DIR, 'data', 'processed')
OUTPUT_FILE = os.path.join(PROCESSED_DIR, 'ca_aqi_clean.csv')

# EPA standard category thresholds for fallback imputation
def derive_aqi_category(aqi_val):
    """Assigns EPA standard AQI category if missing."""
    try:
        val = float(aqi_val)
    except (ValueError, TypeError):
        return 'Unknown'
    if val <= 50:
        return 'Good'
    elif val <= 100:
        return 'Moderate'
    elif val <= 150:
        return 'Unhealthy for Sensitive Groups'
    elif val <= 200:
        return 'Unhealthy'
    elif val <= 300:
        return 'Very Unhealthy'
    else:
        return 'Hazardous'


def clean_with_pandas(raw_files):
    """High-performance cleaning pipeline using Pandas."""
    print("🚀 Running cleaning pipeline with Pandas...")
    dfs = []
    total_raw_rows = 0

    for file_path in sorted(raw_files):
        filename = os.path.basename(file_path)
        try:
            df = pd.read_csv(file_path, low_memory=False)
            total_raw_rows += len(df)
            print(f"  📄 Read {filename}: {len(df):,} records")
            dfs.append(df)
        except Exception as e:
            print(f"  ⚠️ Warning: Could not read {filename}: {e}")

    if not dfs:
        raise ValueError("No valid CSV files could be read from data/raw/")

    combined_df = pd.concat(dfs, ignore_index=True)
    print(f"\n📊 Total raw records merged: {total_raw_rows:,}")

    # Standardize column names mapping
    col_map = {}
    for col in combined_df.columns:
        norm = col.strip().lower().replace(' ', '_').replace('-', '_')
        if norm in ['state_name', 'state']:
            col_map[col] = 'state'
        elif norm in ['county_name', 'county']:
            col_map[col] = 'county'
        elif norm == 'date':
            col_map[col] = 'date'
        elif norm == 'aqi':
            col_map[col] = 'aqi'
        elif norm == 'category':
            col_map[col] = 'category'
        elif norm in ['defining_parameter', 'defining_param', 'parameter']:
            col_map[col] = 'defining_parameter'

    combined_df.rename(columns=col_map, inplace=True)

    required_cols = ['county', 'date', 'aqi']
    for req in required_cols:
        if req not in combined_df.columns:
            raise KeyError(f"Missing essential column '{req}' after normalization.")

    # 1. Filter State == 'California'
    if 'state' in combined_df.columns:
        state_series = combined_df['state'].astype(str).str.strip().str.title()
        ca_mask = (state_series == 'California') | (state_series == 'Ca')
        non_ca_count = (~ca_mask).sum()
        df_clean = combined_df[ca_mask].copy()
        print(f"🌲 Filtered for California: Retained {len(df_clean):,} rows (Dropped {non_ca_count:,} out-of-state rows)")
    else:
        df_clean = combined_df.copy()

    # 2. Clean county names
    df_clean['county'] = (
        df_clean['county']
        .astype(str)
        .str.strip()
        .str.replace(r'\s+County$', '', regex=True)
        .str.title()
    )

    # 3. Parse and standardize dates to YYYY-MM-DD
    df_clean['date'] = pd.to_datetime(df_clean['date'], errors='coerce')
    null_dates = df_clean['date'].isna().sum()
    if null_dates > 0:
        print(f"  🧹 Dropping {null_dates} rows with invalid dates.")
        df_clean = df_clean.dropna(subset=['date'])
    df_clean['date'] = df_clean['date'].dt.strftime('%Y-%m-%d')

    # 4. Standardize AQI values
    df_clean['aqi'] = pd.to_numeric(df_clean['aqi'], errors='coerce')
    null_aqi = df_clean['aqi'].isna().sum()
    if null_aqi > 0:
        print(f"  🧹 Dropping {null_aqi} rows with invalid AQI values.")
        df_clean = df_clean.dropna(subset=['aqi'])
    df_clean['aqi'] = df_clean['aqi'].astype(int)

    # 5. Handle Category nulls or blanks
    if 'category' not in df_clean.columns:
        df_clean['category'] = df_clean['aqi'].apply(derive_aqi_category)
    else:
        df_clean['category'] = df_clean['category'].fillna('').astype(str).str.strip()
        missing_cat_mask = (df_clean['category'] == '') | (df_clean['category'].str.lower() == 'nan')
        if missing_cat_mask.sum() > 0:
            df_clean.loc[missing_cat_mask, 'category'] = df_clean.loc[missing_cat_mask, 'aqi'].apply(derive_aqi_category)

    # 6. Handle Defining Parameter nulls
    if 'defining_parameter' not in df_clean.columns:
        df_clean['defining_parameter'] = 'PM2.5'
    else:
        df_clean['defining_parameter'] = (
            df_clean['defining_parameter']
            .fillna('Unspecified')
            .astype(str)
            .str.strip()
            .replace({'': 'Unspecified', 'nan': 'Unspecified'})
        )

    # 7. Deduplicate county and date
    before_dedup = len(df_clean)
    df_clean = df_clean.sort_values(by=['county', 'date', 'aqi'], ascending=[True, True, False])
    df_clean = df_clean.drop_duplicates(subset=['county', 'date'], keep='first')
    dedup_dropped = before_dedup - len(df_clean)
    if dedup_dropped > 0:
        print(f"  🧹 Removed {dedup_dropped} duplicate records (retained highest daily AQI).")

    # Select final target columns in schema order
    target_columns = ['county', 'date', 'aqi', 'category', 'defining_parameter']
    final_df = df_clean[target_columns].sort_values(by=['date', 'county']).reset_index(drop=True)

    # Save to CSV
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    final_df.to_csv(OUTPUT_FILE, index=False)
    print(f"\n✅ Clean dataset saved to: {OUTPUT_FILE}")
    print(f"📊 Final Record Count: {len(final_df):,} rows")
    print(f"📅 Date Coverage: {final_df['date'].min()} to {final_df['date'].max()}")
    print(f"📍 Unique California Counties: {final_df['county'].nunique()}")
    print("\nCategory Distribution:")
    print(final_df['category'].value_counts().to_string())

    return final_df


def clean_with_standard_library(raw_files):
    """Fallback cleaning pipeline using Python standard library (no dependencies needed)."""
    print("🚀 Running cleaning pipeline with Python Standard Library (csv)...")
    cleaned_rows = []
    total_raw_rows = 0
    non_ca_count = 0
    seen_keys = set()

    for file_path in sorted(raw_files):
        filename = os.path.basename(file_path)
        with open(file_path, mode='r', encoding='utf-8', errors='replace') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                continue

            # Identify column indexes
            col_idx = {}
            for i, col in enumerate(header):
                norm = col.strip().strip('"').lower().replace(' ', '_').replace('-', '_')
                if norm in ['state_name', 'state']:
                    col_idx['state'] = i
                elif norm in ['county_name', 'county']:
                    col_idx['county'] = i
                elif norm == 'date':
                    col_idx['date'] = i
                elif norm == 'aqi':
                    col_idx['aqi'] = i
                elif norm == 'category':
                    col_idx['category'] = i
                elif norm in ['defining_parameter', 'defining_param', 'parameter']:
                    col_idx['defining_parameter'] = i

            for row in reader:
                total_raw_rows += 1
                if not row:
                    continue

                # Check state
                if 'state' in col_idx and col_idx['state'] < len(row):
                    state = row[col_idx['state']].strip().strip('"').title()
                    if state not in ['California', 'Ca']:
                        non_ca_count += 1
                        continue

                # County
                if 'county' not in col_idx or col_idx['county'] >= len(row):
                    continue
                county = row[col_idx['county']].strip().strip('"')
                if county.lower().endswith(' county'):
                    county = county[:-7].strip()
                county = county.title()
                if not county:
                    continue

                # Date
                if 'date' not in col_idx or col_idx['date'] >= len(row):
                    continue
                raw_date = row[col_idx['date']].strip().strip('"')
                try:
                    # Parse standard ISO or US format
                    if '-' in raw_date:
                        d_obj = datetime.strptime(raw_date, '%Y-%m-%d')
                    elif '/' in raw_date:
                        parts = raw_date.split('/')
                        if len(parts[0]) == 4:
                            d_obj = datetime.strptime(raw_date, '%Y/%m/%d')
                        else:
                            d_obj = datetime.strptime(raw_date, '%m/%d/%Y')
                    else:
                        continue
                    clean_date = d_obj.strftime('%Y-%m-%d')
                except ValueError:
                    continue

                # AQI
                if 'aqi' not in col_idx or col_idx['aqi'] >= len(row):
                    continue
                raw_aqi = row[col_idx['aqi']].strip().strip('"')
                try:
                    aqi_num = int(float(raw_aqi))
                except ValueError:
                    continue

                # Category
                category = ''
                if 'category' in col_idx and col_idx['category'] < len(row):
                    category = row[col_idx['category']].strip().strip('"')
                if not category or category.lower() == 'nan':
                    category = derive_aqi_category(aqi_num)

                # Defining Parameter
                param = 'PM2.5'
                if 'defining_parameter' in col_idx and col_idx['defining_parameter'] < len(row):
                    param = row[col_idx['defining_parameter']].strip().strip('"')
                if not param or param.lower() == 'nan':
                    param = 'Unspecified'

                key = (county, clean_date)
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                cleaned_rows.append([county, clean_date, aqi_num, category, param])

    # Sort by date, county
    cleaned_rows.sort(key=lambda x: (x[1], x[0]))

    os.makedirs(PROCESSED_DIR, exist_ok=True)
    with open(OUTPUT_FILE, mode='w', encoding='utf-8', newline='') as out_f:
        writer = csv.writer(out_f)
        writer.writerow(['county', 'date', 'aqi', 'category', 'defining_parameter'])
        writer.writerows(cleaned_rows)

    print(f"\n📊 Total raw records processed: {total_raw_rows:,}")
    print(f"🌲 Filtered for California: Dropped {non_ca_count:,} out-of-state rows")
    print(f"✅ Clean dataset saved to: {OUTPUT_FILE} ({len(cleaned_rows):,} rows)")


def main():
    print("=" * 70)
    print("CALIFORNIA AIR QUALITY ANALYSIS (2015-2024): DATA CLEANING")
    print("=" * 70)

    raw_files = glob.glob(os.path.join(RAW_DIR, '*.csv'))
    if not raw_files:
        print(f"❌ Error: No CSV files found in {RAW_DIR}")
        print("Please place EPA daily AQI CSV files (e.g., daily_aqi_by_county_YYYY.csv) in data/raw/")
        sys.exit(1)

    print(f"📁 Found {len(raw_files)} CSV files in data/raw/")

    if HAS_PANDAS:
        clean_with_pandas(raw_files)
    else:
        clean_with_standard_library(raw_files)


if __name__ == '__main__':
    main()
