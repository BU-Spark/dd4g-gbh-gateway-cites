"""
Fetch ACS 5-year estimates from Census API for all MA places, 2012-2024.
Outputs one parquet per table per year into data/interim/{year}/

Usage:
  python scripts/fetch_acs_data.py
  python scripts/fetch_acs_data.py --year 2024
  python scripts/fetch_acs_data.py --table b05002 --year 2024
  python scripts/fetch_acs_data.py --dry-run
"""

from __future__ import annotations
import argparse
import json
import os
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError
import pandas as pd

INTERIM = Path("data/interim")
MA_STATE = "25"
YEARS = list(range(2012, 2025))  # 2012-2024 inclusive

# Tables: key → (dataset_path, group_name)
TABLES = {
    "b05001": ("acs/acs5",         "B05001"),
    "b05002": ("acs/acs5",         "B05002"),
    "b05003": ("acs/acs5",         "B05003"),
    "b05006": ("acs/acs5",         "B05006"),
    "b05010": ("acs/acs5",         "B05010"),
    "b06011": ("acs/acs5",         "B06011"),
    "b15002": ("acs/acs5",         "B15002"),
    "b25003": ("acs/acs5",         "B25003"),
    "dp03":   ("acs/acs5/profile", "DP03"),
    "s0501":  ("acs/acs5/subject", "S0501"),
}

# For large tables, only fetch the specific variables we need
# to avoid hitting the 50-var API limit unnecessarily
VARIABLE_OVERRIDES: dict[str, list[str]] = {
    "dp03": [
        "NAME", "GEO_ID",
        "DP03_0004E", "DP03_0005E",   # employed, unemployed
        "DP03_0062E", "DP03_0063E",   # median/mean household income
        "DP03_0119E",                  # poverty rate
    ],
}

# Years where certain tables have known issues — flagged in output but not skipped
KNOWN_ISSUES: dict[int, str] = {
    2020: "COVID-19 nonresponse bias; interpret with caution",
}

# Some tables not available before certain years
TABLE_MIN_YEAR: dict[str, int] = {
    "s0501": 2013,   # S0501 place-level unreliable before 2013
}


def load_env(path: Path = Path(".env")) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def fetch_group_variables(dataset: str, group: str, year: int, api_key: str) -> list[str]:
    url = f"https://api.census.gov/data/{year}/{dataset}/groups/{group}.json"
    try:
        with urlopen(url, timeout=45) as r:
            data = json.loads(r.read())
        return [
            k for k in data.get("variables", {})
            if k.endswith("E") and not k.endswith("MA") and k not in ("NAME", "GEO_ID")
        ]
    except Exception as e:
        raise RuntimeError(f"Variable list fetch failed for {group} {year}: {e}")


def fetch_table(
    *,
    dataset: str,
    variables: list[str],
    year: int,
    state: str,
    api_key: str,
) -> list[dict]:
    base = f"https://api.census.gov/data/{year}/{dataset}"
    core = ["NAME", "GEO_ID"]
    data_vars = [v for v in variables if v not in core]

    CHUNK = 45
    chunks = [data_vars[i:i + CHUNK] for i in range(0, len(data_vars), CHUNK)]
    merged: dict[str, dict] = {}

    for chunk in chunks:
        params: dict[str, str] = {
            "get": ",".join(core + chunk),
            "for": "place:*",
            "in":  f"state:{state}",
        }
        if api_key:
            params["key"] = api_key

        url = f"{base}?{urlencode(params)}"
        try:
            with urlopen(url, timeout=30) as r:
                payload = json.loads(r.read())
        except HTTPError as exc:
            raise RuntimeError(f"Census API HTTP {exc.code} → {url}")

        if not isinstance(payload, list) or len(payload) < 2:
            continue

        header = payload[0]
        for row in payload[1:]:
            record = dict(zip(header, row))
            place_fips = record.get("place", "")
            geo_id = f"1600000US{state}{place_fips}"
            record["GEO_ID"] = geo_id
            if geo_id not in merged:
                merged[geo_id] = record
            else:
                merged[geo_id].update(record)

        time.sleep(0.15)

    return list(merged.values())


def to_interim(rows: list[dict], table_key: str, year: int) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        raise ValueError(f"Empty response for {table_key} {year}")

    df["GEO_ID"] = df["GEO_ID"].astype(str).str.strip()

    # Drop MOE columns
    moe_cols = [c for c in df.columns if c.endswith("M") and not c.endswith("MA")]
    df = df.drop(columns=moe_cols, errors="ignore")

    # Add year + data quality flag
    df["year"] = year
    if year in KNOWN_ISSUES:
        df["data_note"] = KNOWN_ISSUES[year]
    else:
        df["data_note"] = None

    out_dir = INTERIM / str(year)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{table_key}.parquet"
    df.to_parquet(out, index=False)
    print(f"    saved {len(df)} places → {out}")
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year",    type=int, help="Fetch a single year only")
    parser.add_argument("--table",   help="Fetch a single table only, e.g. b05002")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env = load_env()
    api_key = os.environ.get("CENSUS_API_KEY") or env.get("CENSUS_API_KEY", "")
    if not api_key:
        print("⚠️  No CENSUS_API_KEY — proceeding without key (rate limited to 500 req/day)")

    years  = [args.year] if args.year else YEARS
    tables = {args.table: TABLES[args.table]} if args.table else TABLES

    total = len(years) * len(tables)
    print(f"Plan: {len(tables)} tables × {len(years)} years = {total} fetches\n")

    if args.dry_run:
        for year in years:
            for key, (ds, grp) in tables.items():
                min_yr = TABLE_MIN_YEAR.get(key, 2012)
                status = "SKIP" if year < min_yr else "fetch"
                note   = f" ⚠️  {KNOWN_ISSUES[year]}" if year in KNOWN_ISSUES else ""
                print(f"  [{status}] {year} / {key} ({ds}/{grp}){note}")
        return

    errors: list[str] = []

    for year in years:
        print(f"\n── {year} {'⚠️  ' + KNOWN_ISSUES[year] if year in KNOWN_ISSUES else ''}")
        for table_key, (dataset, group) in tables.items():
            min_yr = TABLE_MIN_YEAR.get(table_key, 2012)
            if year < min_yr:
                print(f"  SKIP {table_key} (not available before {min_yr})")
                continue

            print(f"  → {table_key} ({group})")
            try:
                if table_key in VARIABLE_OVERRIDES:
                    variables = VARIABLE_OVERRIDES[table_key]
                else:
                    variables = fetch_group_variables(dataset, group, year, api_key)
                    print(f"    {len(variables)} variables")

                rows = fetch_table(
                    dataset=dataset,
                    variables=variables,
                    year=year,
                    state=MA_STATE,
                    api_key=api_key,
                )
                to_interim(rows, table_key, year)

            except Exception as e:
                msg = f"{year}/{table_key}: {e}"
                print(f"    ✗ FAILED: {e}")
                errors.append(msg)

    print(f"\n{'✅ Done' if not errors else '⚠️  Done with errors'}.")
    print(f"Interim files → data/interim/{{year}}/{{table}}.parquet")
    if errors:
        print("\nFailed fetches:")
        for e in errors:
            print(f"  ✗ {e}")
    print("\nNext: python scripts/20_build_per_capita_metrics.py")


if __name__ == "__main__":
    main()
