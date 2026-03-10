"""
Build processed parquets from interim ACS data.
Outputs long-format files (one row per city+year) to data/processed/

Usage:
  python scripts/20_build_per_capita_metrics.py
  python scripts/20_build_per_capita_metrics.py --year 2024
"""

from __future__ import annotations
import argparse
from pathlib import Path
import pandas as pd
import numpy as np

INTERIM   = Path("data/interim")
PROCESSED = Path("data/processed")
PROCESSED.mkdir(exist_ok=True)

YEARS = list(range(2012, 2025))

CITY_TYPE_OVERRIDES = {
    "Boston":      "benchmark",
    "Cambridge":   "benchmark",
    "Somerville":  "comparison",
    "Weymouth":    "comparison",
    "Marlborough": "comparison",
}


def load_year(table: str, year: int) -> pd.DataFrame | None:
    path = INTERIM / str(year) / f"{table}.parquet"
    if not path.exists():
        return None
    df = pd.read_parquet(path)
    df["year"] = year
    return df


def load_all_years(table: str, years: list[int]) -> pd.DataFrame:
    frames = [load_year(table, y) for y in years]
    frames = [f for f in frames if f is not None]
    if not frames:
        raise FileNotFoundError(f"No interim files found for table {table}")
    return pd.concat(frames, ignore_index=True)


def num(df: pd.DataFrame, col: str) -> pd.Series:
    """Safe numeric conversion."""
    if col not in df.columns:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[col], errors="coerce").replace(-666666666, np.nan)


def add_city_type(df: pd.DataFrame) -> pd.DataFrame:
    """Add city_type based on NAME if not already set."""
    if "city_type" not in df.columns:
        df["city_type"] = "other"
    # Extract clean city name from NAME field e.g. "Lowell city, Massachusetts"
    if "city" not in df.columns:
        df["city"] = df["NAME"].str.replace(r"\s+(city|town|CDP).*", "", regex=True).str.strip()
    for city, ctype in CITY_TYPE_OVERRIDES.items():
        df.loc[df["city"] == city, "city_type"] = ctype
    # Default unset gateway cities (MA places not in overrides)
    df["city_type"] = df["city_type"].fillna("other")
    return df


def meta_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in ["GEO_ID", "NAME", "city", "city_type", "year", "data_note"] if c in df.columns]


def build_foreign_born_core(years):
    print("→ foreign_born_core")
    df = load_all_years("b05002", years)
    meta = meta_cols(df)

    out = df[meta].copy()
    out["total_pop"]         = num(df, "B05002_001E")
    out["foreign_born"]      = num(df, "B05002_013E")
    out["fb_naturalized"]    = num(df, "B05002_014E")
    out["fb_not_citizen"]    = num(df, "B05002_021E")
    out["fb_pct"]            = out["foreign_born"]   / out["total_pop"] * 100
    out["fb_naturalized_pct"]= out["fb_naturalized"] / out["foreign_born"] * 100
    out["fb_not_citizen_pct"]= out["fb_not_citizen"] / out["foreign_born"] * 100

    out = add_city_type(out)
    out.to_parquet(PROCESSED / "foreign_born_core.parquet", index=False)
    print(f"  ✓ {len(out)} rows ({out['year'].nunique()} years, {out['GEO_ID'].nunique()} places)")
    return out


def build_country_of_origin(years):
    print("→ country_of_origin")
    frames = []

    # B05006 structure differs by year — melt to long format (city, year, country, estimate)
    COUNTRY_MAP = {
        # Stable variable codes that exist across all years
        # Format: variable_code → country label
        "B05006_002E": "Europe",
        "B05006_015E": "Asia",
        "B05006_047E": "Africa",
        "B05006_057E": "Oceania",
        "B05006_060E": "Americas",
        "B05006_061E": "Latin America",
        "B05006_069E": "Caribbean",
        "B05006_097E": "Central America",
        "B05006_107E": "South America",
        # Key individual countries stable across 2012-2024
        "B05006_016E": "China (excl. HK & Taiwan)",
        "B05006_017E": "Hong Kong",
        "B05006_019E": "India",
        "B05006_020E": "Iran",
        "B05006_021E": "Iraq",
        "B05006_025E": "Japan",
        "B05006_026E": "Jordan",
        "B05006_027E": "Korea",
        "B05006_029E": "Lebanon",
        "B05006_035E": "Philippines",
        "B05006_036E": "Taiwan",
        "B05006_038E": "Vietnam",
        "B05006_040E": "Afghanistan",
        "B05006_044E": "Bangladesh",
        "B05006_048E": "Ethiopia",
        "B05006_049E": "Egypt",
        "B05006_053E": "Nigeria",
        "B05006_054E": "Somalia",
        "B05006_070E": "Cuba",
        "B05006_071E": "Dominican Republic",
        "B05006_075E": "Haiti",
        "B05006_076E": "Jamaica",
        "B05006_083E": "Trinidad and Tobago",
        "B05006_098E": "El Salvador",
        "B05006_099E": "Guatemala",
        "B05006_100E": "Honduras",
        "B05006_101E": "Mexico",
        "B05006_108E": "Brazil",
        "B05006_109E": "Colombia",
        "B05006_110E": "Ecuador",
        "B05006_112E": "Peru",
        "B05006_003E": "United Kingdom",
        "B05006_007E": "Greece",
        "B05006_008E": "Italy",
        "B05006_011E": "Poland",
        "B05006_013E": "Portugal",
        "B05006_114E": "Cambodia",
        "B05006_115E": "Laos",
    }

    for year in years:
        df = load_year("b05006", year)
        if df is None:
            continue
        meta = meta_cols(df)
        available = {k: v for k, v in COUNTRY_MAP.items() if k in df.columns}
        for code, country in available.items():
            rows = df[meta].copy()
            rows["country"]  = country
            rows["estimate"] = num(df, code)
            frames.append(rows)

    if not frames:
        raise FileNotFoundError("No b05006 data found")

    out = pd.concat(frames, ignore_index=True)
    out = out[out["estimate"].notna() & (out["estimate"] > 0)]
    out = add_city_type(out)
    out.to_parquet(PROCESSED / "country_of_origin.parquet", index=False)
    print(f"  ✓ {len(out)} rows ({out['year'].nunique()} years, {out['country'].nunique()} countries)")


def build_education(years):
    print("→ education")
    df = load_all_years("b15002", years)
    meta = meta_cols(df)
    out = df[meta].copy()

    total   = num(df, "B15002_001E")
    hs      = num(df, "B15002_011E") + num(df, "B15002_028E")
    bach    = num(df, "B15002_015E") + num(df, "B15002_032E")
    adv     = (num(df, "B15002_016E") + num(df, "B15002_017E") +
               num(df, "B15002_033E") + num(df, "B15002_034E"))

    out["total_25plus"]   = total
    out["hs_pct"]         = hs   / total * 100
    out["bachelors_pct"]  = bach / total * 100
    out["advanced_pct"]   = adv  / total * 100

    out = add_city_type(out)
    out.to_parquet(PROCESSED / "education.parquet", index=False)
    print(f"  ✓ {len(out)} rows")


def build_homeownership(years):
    print("→ homeownership")
    df = load_all_years("b25003", years)
    meta = meta_cols(df)
    out = df[meta].copy()

    total = num(df, "B25003_001E")
    owned = num(df, "B25003_002E")

    out["total_housing_units"] = total
    out["owner_occupied"]      = owned
    out["renter_occupied"]     = num(df, "B25003_003E")
    out["homeownership_pct"]   = owned / total * 100

    out = add_city_type(out)
    out.to_parquet(PROCESSED / "homeownership.parquet", index=False)
    print(f"  ✓ {len(out)} rows")


def build_employment_income(years):
    print("→ employment_income")
    df = load_all_years("dp03", years)
    meta = meta_cols(df)
    out = df[meta].copy()

    employed   = num(df, "DP03_0004E")
    unemployed = num(df, "DP03_0005E")
    total_lf   = employed + unemployed

    out["employed"]                = employed
    out["unemployed"]              = unemployed
    out["unemployment_rate"]       = unemployed / total_lf * 100
    out["median_household_income"] = num(df, "DP03_0062E")
    out["mean_household_income"]   = num(df, "DP03_0063E")
    out["poverty_rate"]            = num(df, "DP03_0119E")

    out = add_city_type(out)
    out.to_parquet(PROCESSED / "employment_income.parquet", index=False)
    print(f"  ✓ {len(out)} rows")


def build_median_income(years):
    print("→ median_income")
    df = load_all_years("b06011", years)
    meta = meta_cols(df)
    out = df[meta].copy()

    out["median_income_total"]        = num(df, "B06011_001E")
    out["median_income_foreign_born"] = num(df, "B06011_005E")

    out = add_city_type(out)
    out.to_parquet(PROCESSED / "median_income.parquet", index=False)
    print(f"  ✓ {len(out)} rows")


def build_poverty(years):
    print("→ poverty_by_nativity")
    df = load_all_years("b05010", years)
    meta = meta_cols(df)
    out = df[meta].copy()

    universe = num(df, "B05010_002E")
    below    = num(df, "B05010_003E")
    out["fb_poverty_universe"] = universe
    out["fb_below_poverty"]    = below
    out["fb_poverty_pct"]      = below / universe * 100

    out = add_city_type(out)
    out.to_parquet(PROCESSED / "poverty_by_nativity.parquet", index=False)
    print(f"  ✓ {len(out)} rows")


def build_cities_master(fb_df: pd.DataFrame):
    print("→ cities_master")
    # One row per (city, year) with key metrics joined
    out = fb_df[["GEO_ID", "NAME", "city", "city_type", "year",
                 "total_pop", "foreign_born", "fb_pct", "data_note"]].copy()
    out.to_parquet(PROCESSED / "cities_master.parquet", index=False)
    print(f"  ✓ {len(out)} rows")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Process a single year only")
    args = parser.parse_args()

    years = [args.year] if args.year else YEARS
    print(f"Building processed files for years: {years[0]}–{years[-1]}\n")

    fb = build_foreign_born_core(years)
    build_country_of_origin(years)
    build_education(years)
    build_homeownership(years)
    build_employment_income(years)
    build_median_income(years)
    build_poverty(years)
    build_cities_master(fb)

    print("\n✅ All processed files written to data/processed/")
    print("Next: restart backend → python backend/app.py")


if __name__ == "__main__":
    main()
