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
import country_converter as coco

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

GATEWAY_CITIES = {
    "Attleboro",
    "Barnstable",
    "Barnstable Town",
    "Brockton",
    "Chelsea",
    "Chicopee",
    "Everett",
    "Fall River",
    "Fitchburg",
    "Haverhill",
    "Holyoke",
    "Lawrence",
    "Leominster",
    "Lowell",
    "Lynn",
    "Malden",
    "Methuen",
    "New Bedford",
    "Peabody",
    "Pittsfield",
    "Quincy",
    "Revere",
    "Salem",
    "Springfield",
    "Taunton",
    "Westfield",
    "Worcester",
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


# Census placeholder NAME patterns that are not real municipalities
JUNK_NAME_PATTERNS = r"^(County subdivisions not defined|Balance of|County subdivisions\b)"

def add_city_type(df: pd.DataFrame) -> pd.DataFrame:
    """Add city_type based on NAME if not already set. Drops Census placeholder rows."""
    # Drop placeholder rows like "County subdivisions not defined, Suffolk County, MA"
    if "NAME" in df.columns:
        df = df[~df["NAME"].astype(str).str.contains(JUNK_NAME_PATTERNS, regex=True, na=False)].copy()

    if "city_type" not in df.columns:
        df["city_type"] = "other"
    # Extract clean city name from NAME field e.g. "Lowell city, Massachusetts"
    if "city" not in df.columns:
        df["city"] = df["NAME"].str.replace(r"\s+(city|town|CDP).*", "", regex=True).str.strip()

    # Tag the statewide row first (GEO_ID starts with 0400000US) so it
    # won't be overwritten by the city-level loop below.
    state_mask = df["GEO_ID"].str.startswith("0400000US", na=False)
    df.loc[state_mask, "city_type"] = "state"
    df.loc[state_mask, "city"]      = "Massachusetts"

    df.loc[df["city"].isin(GATEWAY_CITIES), "city_type"] = "gateway"

    for city, ctype in CITY_TYPE_OVERRIDES.items():
        df.loc[df["city"] == city, "city_type"] = ctype
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


import requests

def get_country_map(year: int = 2023) -> dict:
    """Fetch B05006 variable labels from Census API — no hardcoding needed."""
    r = requests.get(
        f"https://api.census.gov/data/{year}/acs/acs5/variables.json",
        timeout=30
    )
    variables = r.json()["variables"]
    return {
        k: v["label"].split("!!")[-1].strip()
        for k, v in variables.items()
        if k.startswith("B05006_")
        and k.endswith("E")
        and v.get("label", "").count("!!") >= 2  # skips top-level aggregates/continents
    }


def build_country_of_origin(years):
    print("→ country_of_origin")

    print("  Fetching variable labels from Census API...")
    country_map = get_country_map()
    print(f"  Found {len(country_map)} country-level variables")

    frames = []
    for year in years:
        df = load_year("b05006", year)
        if df is None:
            continue
        meta = meta_cols(df)
        available = {k: v for k, v in country_map.items() if k in df.columns}
        for code, country in available.items():
            rows = df[meta].copy()
            rows["country"]  = country
            rows["estimate"] = num(df, code)
            frames.append(rows)

    if not frames:
        raise FileNotFoundError("No b05006 data found")

    out = pd.concat(frames, ignore_index=True)
    out = out[out["estimate"].notna()]
    out = add_city_type(out)

    # --- ADD THIS BLOCK ---
    print("  Tagging regions with coco...")
    cc = coco.CountryConverter()
    out["region"] = cc.pandas_convert(
        out["country"],
        to="continent",
        not_found=None
    )
    out["region"] = out["region"].apply(lambda x: x[0] if isinstance(x, list) else x)
    print("Region value counts:")
    print(out["region"].value_counts().head(10))
    print(f"Sample rows with Americas: {len(out[out['region'] == 'Americas'])}")


    print(f"  ✓ {out['region'].notna().sum()} rows tagged with region")
    # ----------------------

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

    out["total_25plus"]      = total
    out["hs_pct"]            = hs              / total * 100
    out["bachelors_pct"]     = (bach + adv)    / total * 100  # bachelor's OR higher
    out["bach_only_pct"]     = bach            / total * 100  # bachelor's only
    out["advanced_pct"]      = adv             / total * 100  # master's / prof / doctorate

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
    out["poverty_rate"]            = num(df, "DP03_0119PE")

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
