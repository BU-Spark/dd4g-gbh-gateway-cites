"""Check processed ACS files against the dashboard's geography and Census figures.

The city list should be Massachusetts towns and cities (county subdivisions),
with names like "Barnstable" rather than "Barnstable Town" or a CDP. Place of
birth for each year has to use that year's own B05006 labels, and foreign-born
education has to match the Census foreign-born bachelor's-or-higher share.

Usage:
  python scripts/30_validate_processed.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
INTERIM = ROOT / "data" / "interim"

LOWELL_GEO = "0600000US2501737000"
BROCKTON_GEO = "0600000US2502309000"
STATE_GEO = "0400000US25"
REGIONS = {"Europe", "Asia", "Africa", "Oceania", "Latin America", "Northern America"}


def _fetch_json(url: str) -> dict | list:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read())


def _table_row(table_id: str, geo: str) -> dict[str, str]:
    url = f"https://data.census.gov/api/access/data/table?id={table_id}&g={geo}"
    rows = _fetch_json(url)["response"]["data"]
    header, values = rows[0], rows[1]
    return dict(zip(header, values))


def _b05006_codes(year: int) -> dict[str, str]:
    url = f"https://api.census.gov/data/{year}/acs/acs5/groups/B05006.json"
    variables = _fetch_json(url)["variables"]
    codes = {}
    for code, info in variables.items():
        if not code.endswith("E") or code.endswith("EA"):
            continue
        label = str(info.get("label", ""))
        place = label.split("!!")[-1].strip()
        if place in {"Cambodia", "Indonesia"}:
            codes[place] = code
    return codes


def _number(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def check_places(failures: list[str]) -> None:
    path = PROCESSED / "cities_master.parquet"
    if not path.exists():
        failures.append("cities_master.parquet is missing")
        return
    df = pd.read_parquet(path)
    latest = df[df["year"] == df["year"].max()]
    places = latest[latest["city_type"] != "state"]
    names = places["city"].astype(str)
    geos = places["GEO_ID"].astype(str)
    print(f"places in {int(df['year'].max())}: {names.nunique()} unique names, {len(places)} rows")

    if not geos.str.startswith("060").all():
        failures.append(
            "city list is not county subdivisions "
            f"(GEO_ID prefixes: {geos.str[:3].value_counts().to_dict()})"
        )
    cdp_names = places.loc[places["NAME"].astype(str).str.contains("CDP", na=False), "NAME"]
    if len(cdp_names):
        failures.append(f"{cdp_names.nunique()} CDP / neighborhood geographies are still in the city list")
    town_suffix = sorted(name for name in names.unique() if name.endswith(" Town"))
    if town_suffix:
        failures.append(f"names still end with ' Town': {town_suffix[:8]}")
    if not 340 <= names.nunique() <= 360:
        failures.append(f"expected about 351 towns and cities, found {names.nunique()}")
    if "Barnstable" not in set(names) or "Barnstable Town" in set(names):
        failures.append("Barnstable should appear as 'Barnstable', not 'Barnstable Town'")
    if places.duplicated(subset=["city"]).any():
        failures.append("latest year has more than one row for a city name")
    state = latest[latest["GEO_ID"].astype(str).str.startswith("040")]
    if state.empty:
        failures.append("Massachusetts state row is missing from cities_master")


def check_regions(failures: list[str]) -> None:
    path = PROCESSED / "country_of_origin.parquet"
    if not path.exists():
        failures.append("country_of_origin.parquet is missing")
        return
    df = pd.read_parquet(path)
    regions = set(df["region"].dropna().astype(str))
    print("regions:", sorted(regions))
    if "Latin America" not in regions:
        failures.append(f"Latin America is missing from regions ({sorted(regions)[:12]})")
    if "America" in regions:
        failures.append("region 'America' is still used instead of Latin America / Northern America")
    headers = df["country"].astype(str).str.endswith(":")
    if headers.any():
        failures.append(f"{int(headers.sum())} place-of-birth rows are region headers, not countries")


def check_lowell(failures: list[str]) -> None:
    origin_path = PROCESSED / "country_of_origin.parquet"
    if not origin_path.exists():
        failures.append("cannot check Lowell without country_of_origin.parquet")
        return
    origin = pd.read_parquet(origin_path)
    lowell = origin[origin["city"].astype(str).eq("Lowell")]
    for year in (2019, 2020, 2021, 2022, 2023):
        codes = _b05006_codes(year)
        live = _table_row(f"ACSDT5Y{year}.B05006", LOWELL_GEO)
        cambodia_live = _number(live.get(codes.get("Cambodia", "")))
        indonesia_live = _number(live.get(codes.get("Indonesia", "")))
        stored = lowell[(lowell["year"] == year) & (lowell["country"].astype(str).eq("Cambodia"))]
        stored_value = None if stored.empty else float(stored["estimate"].sum())
        print(
            f"Lowell {year} Cambodia stored={stored_value} "
            f"census={cambodia_live} Indonesia census={indonesia_live}"
        )
        if cambodia_live is None:
            failures.append(f"Census did not return Lowell Cambodia for {year}")
            continue
        if stored_value is None or abs(stored_value - cambodia_live) > 1:
            failures.append(
                f"Lowell {year} Cambodia is {stored_value}, Census says {cambodia_live:.0f}"
            )
        if indonesia_live is not None and stored_value == indonesia_live and cambodia_live != indonesia_live:
            failures.append(f"Lowell {year} Cambodia is using the Indonesia count ({indonesia_live:.0f})")


def check_education(failures: list[str]) -> None:
    path = PROCESSED / "foreign_born_characteristics.parquet"
    stored = pd.read_parquet(path) if path.exists() else pd.DataFrame()

    def expect(geo: str, city: str, target: float) -> None:
        live = _table_row("ACSST5Y2024.S0501", geo)
        bachelors = _number(live.get("S0501_C03_042E"))
        graduate = _number(live.get("S0501_C03_043E"))
        if bachelors is None or graduate is None:
            failures.append(f"Census education values missing for {city}")
            return
        live_pct = round(bachelors + graduate, 1)
        print(f"{city} foreign-born BA or higher census={live_pct} (parts {bachelors}+{graduate})")
        if abs(live_pct - target) > 0.2:
            failures.append(f"{city} Census BA-or-higher is {live_pct}, expected about {target}")
        if stored.empty:
            if not any("foreign_born_characteristics.parquet is missing" in item for item in failures):
                failures.append("foreign_born_characteristics.parquet is missing")
            return
        row = stored[stored["city"].astype(str).eq(city)]
        if row.empty or pd.isna(row.iloc[-1]["fb_bachelors_pct"]):
            failures.append(f"{city} foreign-born bachelor's percent was not built")
            return
        built = float(row.iloc[-1]["fb_bachelors_pct"])
        if abs(built - live_pct) > 0.15:
            failures.append(f"{city} built BA-or-higher is {built}, Census says {live_pct}")

    expect(BROCKTON_GEO, "Brockton", 18.1)
    expect(STATE_GEO, "Massachusetts", 41.4)


def check_subtotals(failures: list[str]) -> None:
    """Leaf country estimates for one place should add up to each B05006 region total."""
    origin_path = PROCESSED / "country_of_origin.parquet"
    interim_path = INTERIM / "2024" / "b05006.parquet"
    if not origin_path.exists() or not interim_path.exists():
        print("subtotals: skipped (2024 b05006 interim file not built yet)")
        return
    variables = _fetch_json("https://api.census.gov/data/2024/acs/acs5/groups/B05006.json")["variables"]
    region_codes = {}
    for code, info in variables.items():
        if not code.endswith("E") or code.endswith("EA"):
            continue
        parts = [part.rstrip(":").strip() for part in str(info.get("label", "")).split("!!")[1:]]
        if parts in (["Total", "Europe"], ["Total", "Asia"], ["Total", "Africa"], ["Total", "Oceania"]):
            region_codes[parts[-1]] = code
        elif parts == ["Total", "Americas", "Latin America"]:
            region_codes["Latin America"] = code
        elif parts == ["Total", "Americas", "Northern America"]:
            region_codes["Northern America"] = code

    interim = pd.read_parquet(interim_path)
    lowell = interim[interim["GEO_ID"].astype(str).eq(LOWELL_GEO)]
    if lowell.empty:
        failures.append("2024 interim B05006 has no Lowell county subdivision row")
        return
    origin = pd.read_parquet(origin_path)
    leaves = origin[
        origin["city"].astype(str).eq("Lowell")
        & origin["year"].eq(2024)
        & ~origin["country"].astype(str).str.endswith(":")
    ]
    for region, code in region_codes.items():
        census_total = _number(lowell.iloc[0].get(code))
        built = float(pd.to_numeric(leaves.loc[leaves["region"].eq(region), "estimate"], errors="coerce").fillna(0).sum())
        print(f"Lowell 2024 {region}: leaves={built:.0f} census={census_total}")
        if census_total is None or abs(built - census_total) > 1:
            failures.append(
                f"Lowell 2024 {region} leaves sum to {built:.0f}, Census region total is {census_total}"
            )


def main() -> None:
    failures: list[str] = []
    check_places(failures)
    check_regions(failures)
    check_lowell(failures)
    check_education(failures)
    check_subtotals(failures)
    if failures:
        print(f"\n{len(failures)} check(s) failed:")
        for item in failures:
            print(f"  - {item}")
        sys.exit(1)
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
