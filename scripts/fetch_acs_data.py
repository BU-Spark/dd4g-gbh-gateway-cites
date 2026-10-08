"""
Fetch ACS 5-year estimates from Census API for all MA county subdivisions, 2012-2024.
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
from urllib.request import Request, urlopen
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
        "DP03_0119PE",                 # poverty rate
    ],
}

# Years where certain tables have known issues — flagged in output but not skipped
KNOWN_ISSUES: dict[int, str] = {
    2020: "COVID-19 nonresponse bias; interpret with caution",
}

# Some tables not available before certain years.
# S0501 is only used for the latest foreign-born characteristics.
TABLE_MIN_YEAR: dict[str, int] = {
    "s0501": 2024,
}

# data.census.gov table ids. Used when CENSUS_API_KEY is not set, because the
# Census data API now rejects keyless requests. These downloads are Massachusetts
# county subdivisions only, which is the geography the dashboard shows.
DATA_CENSUS_IDS = {
    "b05001": "ACSDT5Y{year}.B05001",
    "b05002": "ACSDT5Y{year}.B05002",
    "b05003": "ACSDT5Y{year}.B05003",
    "b05006": "ACSDT5Y{year}.B05006",
    "b05010": "ACSDT5Y{year}.B05010",
    "b06011": "ACSDT5Y{year}.B06011",
    "b15002": "ACSDT5Y{year}.B15002",
    "b19013": "ACSDT5Y{year}.B19013",
    "b23025": "ACSDT5Y{year}.B23025",
    "b25003": "ACSDT5Y{year}.B25003",
    "dp03": "ACSDP5Y{year}.DP03",
    "s0501": "ACSST5Y{year}.S0501",
}

# Margin-of-error inputs that are not already part of the dashboard tables.
MARGIN_TABLES = ("b19013", "b23025")


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
            "for": "county subdivision:*",        
            "in":  f"state:{state}&in=county:*", 
        }
        if api_key:
            params["key"] = api_key

        base_params = urlencode({k: v for k, v in params.items() if k != "in"})
        url = f"{base}?{base_params}&in={params['in']}"

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
            county_fips = record.get("county", "")
            cousub_fips = record.get("county subdivision", "")
            geo_id = f"0600000US{state}{county_fips}{cousub_fips}"
            record["GEO_ID"] = geo_id
            if geo_id not in merged:
                merged[geo_id] = record
            else:
                merged[geo_id].update(record)

        time.sleep(0.15)

        # Fetch the matching statewide row for this chunk so metrics.py
        # can display MA as a benchmark alongside individual places.
        state_params: dict[str, str] = {
            "get": ",".join(core + chunk),
            "for": f"state:{state}",
        }
        if api_key:
            state_params["key"] = api_key

        state_url = f"{base}?{urlencode(state_params)}"
        try:
            with urlopen(state_url, timeout=30) as r:
                state_payload = json.loads(r.read())
        except HTTPError as exc:
            raise RuntimeError(f"Census API HTTP {exc.code} → {state_url}")

        if isinstance(state_payload, list) and len(state_payload) >= 2:
            state_header = state_payload[0]
            for row in state_payload[1:]:
                record = dict(zip(state_header, row))
                geo_id = f"0400000US{state}"  
                record["GEO_ID"] = geo_id
                record.setdefault("NAME", "Massachusetts")
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

    # Drop annotation columns, but keep estimate and margin columns so
    # trend margins can be built without a second Census download.
    annotations = [c for c in df.columns if c.endswith(("EA", "MA", "AA"))]
    df = df.drop(columns=annotations, errors="ignore")

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
    print(f"    saved {len(df)} places to {out}")
    return df


def _data_census_frame(table_id: str, geo: str) -> pd.DataFrame:
    url = f"https://data.census.gov/api/access/data/table?id={table_id}&g={geo}"
    print(f"    get {table_id} {geo}", flush=True)
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=180) as response:
                payload = json.loads(response.read())
            rows = payload["response"]["data"]
            frame = pd.DataFrame(rows[1:], columns=rows[0])
            keep = [
                column for column in frame.columns
                if column in {"GEO_ID", "NAME"} or (
                    not str(column).endswith(("EA", "MA", "AA"))
                    and str(column).endswith(("E", "M"))
                )
            ]
            return frame[keep]
        except Exception as exc:
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{table_id} {geo}: {last_error}")


def fetch_from_data_census(table_key: str, year: int) -> None:
    table_id = DATA_CENSUS_IDS[table_key].format(year=year)
    state = _data_census_frame(table_id, "0400000US25")
    towns = _data_census_frame(table_id, f"0400000US{MA_STATE}$0600000")
    frame = pd.concat([state, towns], ignore_index=True)
    frame = frame.drop_duplicates(subset=["GEO_ID"], keep="last")
    frame["GEO_ID"] = frame["GEO_ID"].astype(str)
    to_interim(frame.to_dict(orient="records"), table_key, year)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year",    type=int, help="Fetch a single year only")
    parser.add_argument("--table",   help="Fetch a single table only, e.g. b05002")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env = load_env()
    api_key = os.environ.get("CENSUS_API_KEY") or env.get("CENSUS_API_KEY", "")

    years  = [args.year] if args.year else YEARS
    tables = {args.table: TABLES[args.table]} if args.table else dict(TABLES)
    if not args.table:
        for table_key in MARGIN_TABLES:
            tables.setdefault(table_key, ("acs/acs5", table_key.upper()))

    if args.dry_run:
        for year in years:
            for key, (ds, grp) in tables.items():
                min_yr = TABLE_MIN_YEAR.get(key, 2012)
                status = "SKIP" if year < min_yr else "fetch"
                note   = f" ⚠️  {KNOWN_ISSUES[year]}" if year in KNOWN_ISSUES else ""
                source = "data.census.gov" if not api_key else f"{ds}/{grp}"
                print(f"  [{status}] {year} / {key} ({source}){note}")
        return

    if not api_key:
        print("No CENSUS_API_KEY — downloading Massachusetts county subdivisions from data.census.gov\n")
        errors: list[str] = []
        for year in years:
            print(f"\n-- {year}")
            for table_key in tables:
                min_yr = TABLE_MIN_YEAR.get(table_key, 2012)
                if year < min_yr:
                    print(f"  SKIP {table_key} (not used before {min_yr})")
                    continue
                if table_key not in DATA_CENSUS_IDS:
                    print(f"  SKIP {table_key} (no data.census.gov table id)")
                    continue
                print(f"  > {table_key}")
                try:
                    fetch_from_data_census(table_key, year)
                except Exception as exc:
                    message = f"{year}/{table_key}: {exc}"
                    print(f"    x FAILED: {exc}")
                    errors.append(message)
                time.sleep(0.2)
        print(f"\n{'Done' if not errors else 'Done with errors'}.")
        if errors:
            for item in errors:
                print(f"  x {item}")
            raise SystemExit(1)
        print("Next: python scripts/20_build_per_capita_metrics.py")
        return

    total = len(years) * len(tables)
    print(f"Plan: {len(tables)} tables × {len(years)} years = {total} fetches\n")

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
