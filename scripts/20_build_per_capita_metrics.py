"""
Build processed parquets from interim ACS data.
Outputs long-format files (one row per city+year) to data/processed/

Usage:
  python scripts/20_build_per_capita_metrics.py
  python scripts/20_build_per_capita_metrics.py --year 2024
"""

from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
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

GATEWAY_CITIES = {
    "Attleboro",
    "Barnstable",
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
    frames = []
    missing = []
    for year in years:
        frame = load_year(table, year)
        if frame is None:
            missing.append(year)
        else:
            frames.append(frame)
    if missing:
        raise FileNotFoundError(f"No interim file for {table} in {missing}")
    return pd.concat(frames, ignore_index=True)


def num(df: pd.DataFrame, col: str) -> pd.Series:
    """Safe numeric conversion."""
    if col not in df.columns:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[col], errors="coerce").replace(-666666666, np.nan)


# Census placeholder NAME patterns that are not real municipalities
JUNK_NAME_PATTERNS = r"^(?:County subdivisions not defined|Balance of|County subdivisions\b)"

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
        # "Barnstable Town city, ..." leaves the word Town behind. The town is Barnstable.
        df["city"] = df["city"].str.replace(r" Town$", "", regex=True)

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


def _census_api_key() -> str:
    if os.environ.get("CENSUS_API_KEY"):
        return os.environ["CENSUS_API_KEY"]
    env_path = Path(".env")
    if not env_path.exists():
        return ""
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == "CENSUS_API_KEY":
            return value.strip().strip('"').strip("'")
    return ""


def _get_json(url: str) -> dict:
    api_key = _census_api_key()
    if api_key:
        url = f"{url}?key={api_key}"
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def _label_path(label: str) -> tuple[str, ...]:
    return tuple(str(label or "").split("!!")[1:])


def _clean_origin_label(label: str) -> str:
    return str(label or "").rstrip(":").strip()


def _origin_region_from_path(path: tuple[str, ...]) -> str:
    parts = [_clean_origin_label(p) for p in path]
    if len(parts) < 2:
        return "Other"

    continent = parts[1]
    if continent == "Americas":
        if "Northern America" in parts:
            return "Northern America"
        if "Latin America" in parts:
            return "Latin America"
        return "Americas"

    if continent in {"Africa", "Asia", "Europe", "Oceania"}:
        return continent

    return "Other"


def get_country_map(year: int = 2024) -> dict:
    """Fetch non-overlapping B05006 place-of-birth variables for this year.

    Variable numbers change between ACS releases (Cambodia is B05006_069E in
    2021 and B05006_070E from 2022 on). Labels have to come from the same
    year as the estimates.
    """
    payload = _get_json(f"https://api.census.gov/data/{year}/acs/acs5/groups/B05006.json")
    if "variables" not in payload:
        raise RuntimeError(f"B05006 variable list for {year} did not include labels")
    variables = payload["variables"]
    candidates = {
        k: _label_path(v.get("label", ""))
        for k, v in variables.items()
        if k.startswith("B05006_")
        and k.endswith("E")
        and k != "B05006_001E"
        and v.get("label", "").count("!!") >= 2
    }

    country_parent_paths = {
        path
        for path in candidates.values()
        if len(path) == 4
        and path[1] != "Americas:"
        and any(len(other) > len(path) and other[:len(path)] == path for other in candidates.values())
    }

    out = {}
    for code, path in candidates.items():
        if any(len(path) > len(parent) and path[:len(parent)] == parent for parent in country_parent_paths):
            continue

        has_children = any(
            len(other) > len(path) and other[:len(path)] == path
            for other in candidates.values()
        )
        if path not in country_parent_paths and (has_children or path[-1].endswith(":")):
            continue

        out[code] = {
            "country": _clean_origin_label(path[-1]),
            "region": _origin_region_from_path(path),
            "path": "!!".join(path),
        }

    return out


def build_country_of_origin(years):
    print("→ country_of_origin")

    print("  Fetching variable labels from Census API...")
    frames = []
    for year in years:
        df = load_year("b05006", year)
        if df is None:
            raise FileNotFoundError(f"No interim b05006 file for {year}")
        country_map = get_country_map(year)
        if not country_map:
            raise RuntimeError(f"{year}: B05006 label list was empty")
        print(f"  {year}: found {len(country_map)} non-overlapping place-of-birth variables")
        meta = meta_cols(df)
        available = {k: v for k, v in country_map.items() if k in df.columns}
        for code, info in available.items():
            rows = df[meta].copy()
            rows["country"]  = info["country"]
            rows["estimate"] = num(df, code)
            rows["region"]   = info["region"]
            rows["acs_path"] = info["path"]
            frames.append(rows)

    if not frames:
        raise FileNotFoundError("No b05006 data found")

    out = pd.concat(frames, ignore_index=True)
    out = out[out["estimate"].notna()]
    out = add_city_type(out)

    print("Region value counts:")
    print(out["region"].value_counts().head(10))


    print(f"  ✓ {out['region'].notna().sum()} rows tagged with region")

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
               num(df, "B15002_018E") + num(df, "B15002_033E") +
               num(df, "B15002_034E") + num(df, "B15002_035E"))

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


def _s0501_labels(year: int) -> dict[str, str]:
    variables = _get_json(
        f"https://api.census.gov/data/{year}/acs/acs5/subject/groups/S0501.json"
    )["variables"]
    return {
        code: str(info.get("label", ""))
        for code, info in variables.items()
        if code.endswith("E") and not code.endswith("EA")
    }


def _is_foreign_born_estimate(label: str) -> bool:
    parts = [part.strip() for part in label.split("!!")]
    return len(parts) >= 2 and parts[0] == "Estimate" and parts[1] == "Foreign-born"


def _one_column(labels: dict[str, str], columns: set[str], description: str, predicate) -> str:
    matches = [
        code for code, label in labels.items()
        if code in columns and _is_foreign_born_estimate(label) and predicate(label)
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one S0501 column for {description}, found {matches}")
    return matches[0]


def build_foreign_born_characteristics(years):
    """Foreign-born education, tenure, and household income from S0501.

    Educational attainment and housing tenure are published as percents in
    S0501. If a release ever publishes counts instead, divide by the universe.
    """
    print("→ foreign_born_characteristics")
    year = 2024 if 2024 in years else years[-1]
    path = INTERIM / str(year) / "s0501.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Fetch S0501 before building characteristics.")

    df = pd.read_parquet(path)
    labels = _s0501_labels(year)
    columns = set(df.columns)
    bachelors_col = _one_column(
        labels, columns, "bachelor's degree",
        lambda label: label.endswith("Bachelor's degree") and "EDUCATIONAL ATTAINMENT" in label,
    )
    graduate_col = _one_column(
        labels, columns, "graduate degree",
        lambda label: label.endswith("Graduate or professional degree") and "EDUCATIONAL ATTAINMENT" in label,
    )
    educated_col = _one_column(
        labels, columns, "population 25 and over",
        lambda label: label.endswith("Population 25 years and over") and "EDUCATIONAL ATTAINMENT" in label,
    )
    owner_col = _one_column(
        labels, columns, "owner-occupied",
        lambda label: label.endswith("Owner-occupied housing units") and "HOUSING TENURE" in label,
    )
    occupied_col = _one_column(
        labels, columns, "occupied housing units",
        lambda label: label.endswith("Occupied housing units"),
    )
    income_col = _one_column(
        labels, columns, "median household income",
        lambda label: "Median Household income" in label,
    )

    meta = meta_cols(df)
    out = df[meta].copy()
    bachelors = num(df, bachelors_col)
    graduate = num(df, graduate_col)
    educated = num(df, educated_col)
    owners = num(df, owner_col)
    occupied = num(df, occupied_col)
    state = df["GEO_ID"].astype(str).str.startswith("040")

    if state.any() and pd.notna(bachelors[state].iloc[0]) and float(bachelors[state].iloc[0]) > 100:
        out["fb_bachelors_pct"] = (bachelors + graduate) / educated * 100
    else:
        out["fb_bachelors_pct"] = bachelors + graduate

    if state.any() and pd.notna(owners[state].iloc[0]) and float(owners[state].iloc[0]) > 100:
        out["fb_homeownership_pct"] = owners / occupied * 100
    else:
        out["fb_homeownership_pct"] = owners

    out["fb_median_household_income"] = num(df, income_col)
    out = add_city_type(out)
    out["fb_bachelors_pct"] = out["fb_bachelors_pct"].round(1)
    out["fb_homeownership_pct"] = out["fb_homeownership_pct"].round(1)
    out["fb_median_household_income"] = out["fb_median_household_income"].round(0)
    keep = [c for c in [
        "GEO_ID", "NAME", "city", "city_type", "year",
        "fb_bachelors_pct", "fb_homeownership_pct", "fb_median_household_income",
    ] if c in out.columns]
    out[keep].to_parquet(PROCESSED / "foreign_born_characteristics.parquet", index=False)
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
    build_foreign_born_characteristics(years)
    build_cities_master(fb)

    print("\n✅ All processed files written to data/processed/")
    print("Next: restart backend → python backend/app.py")


if __name__ == "__main__":
    main()
