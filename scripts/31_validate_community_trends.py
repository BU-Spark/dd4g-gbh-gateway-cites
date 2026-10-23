"""Check city and statewide community comparisons against processed ACS data.

Usage:
  python scripts/31_validate_community_trends.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from services.data_store import get_community_trends  # noqa: E402

PROCESSED = ROOT / "data" / "processed" / "country_of_origin.parquet"


def fail(failures: list[str], message: str) -> None:
    failures.append(message)
    print(f"FAIL {message}")


def years_of(series: dict) -> list[int]:
    return [point["year"] for point in series["points"]]


def value_in(series: dict, year: int):
    for point in series["points"]:
        if point["year"] == year:
            return point["value"]
    return None


def main() -> int:
    failures: list[str] = []
    source = pd.read_parquet(PROCESSED)
    lowell = source[(source["city"] == "Lowell") & (source["year"] == 2024)]
    expected_top = (
        lowell.groupby("country")["estimate"]
        .sum()
        .sort_values(ascending=False)
        .head(5)
        .index.tolist()
    )
    expected_asia = int(lowell.loc[lowell["region"] == "Asia", "estimate"].sum())
    expected_cambodia = int(
        lowell.loc[lowell["country"] == "Cambodia", "estimate"].sum()
    )

    lowell_default = get_community_trends("Lowell")
    labels = [series["label"] for series in lowell_default["series"]]
    print("Lowell default:", ", ".join(labels))
    if labels != expected_top:
        fail(failures, f"Lowell top five were {labels}, expected {expected_top}")
    if not lowell_default["defaults"]:
        fail(failures, "Lowell default response was not marked as defaults")
    covered_years = sorted({year for series in lowell_default["series"] for year in years_of(series)})
    if covered_years[0] != 2012 or covered_years[-1] != 2024:
        fail(failures, f"Lowell community trends cover {covered_years[0]}-{covered_years[-1]}")
    for series in lowell_default["series"]:
        if any(point["moe"] is not None and point["moe"] < 0 for point in series["points"]):
            fail(failures, f"{series['label']} returned a negative margin")

    cambodia = next(series for series in lowell_default["series"] if series["label"] == "Cambodia")
    if value_in(cambodia, 2024) != expected_cambodia:
        fail(failures, f"Lowell Cambodia 2024 was {value_in(cambodia, 2024)}, expected {expected_cambodia}")
    cambodia_2024 = next(point for point in cambodia["points"] if point["year"] == 2024)
    if cambodia_2024["moe"] != 1001:
        fail(failures, f"Lowell Cambodia 2024 margin was {cambodia_2024['moe']}, expected 1001")

    mixed = get_community_trends("lowell", ["cambodia", "Asia"])
    mixed_labels = [(series["label"], series["type"]) for series in mixed["series"]]
    if mixed_labels != [("Cambodia", "country"), ("Asia", "region")]:
        fail(failures, f"Mixed community series were {mixed_labels}")
    asia = mixed["series"][1]
    if value_in(asia, 2024) != expected_asia:
        fail(failures, f"Lowell Asia 2024 was {value_in(asia, 2024)}, expected {expected_asia}")
    asia_2024 = next(point for point in asia["points"] if point["year"] == 2024)
    if asia_2024["moe"] != 1279:
        fail(failures, f"Lowell Asia 2024 margin was {asia_2024['moe']}, expected 1279")
    country_sum = int(lowell.loc[lowell["region"] == "Asia", "estimate"].sum())
    if value_in(asia, 2024) != country_sum:
        fail(failures, "Asia region series does not equal the sum of its leaf countries")

    statewide = get_community_trends("Statewide")
    print("Statewide default:", ", ".join(series["label"] for series in statewide["series"]))
    if statewide["geography"] != "Statewide" or len(statewide["series"]) != 5:
        fail(failures, "Statewide did not return five default communities")
    state_years = years_of(statewide["series"][0])
    if state_years[0] != 2012 or state_years[-1] != 2024:
        fail(failures, f"Statewide coverage was {state_years}")

    for geography in ("Nowhere",):
        try:
            get_community_trends(geography)
        except LookupError:
            pass
        else:
            fail(failures, "Unknown geography was accepted")

    try:
        get_community_trends("Lowell", ["Not A Country"])
    except LookupError:
        pass
    else:
        fail(failures, "Unknown community was accepted")

    try:
        get_community_trends("Lowell", [f"Country {index}" for index in range(9)])
    except ValueError:
        pass
    else:
        fail(failures, "Nine communities were accepted")

    try:
        get_community_trends("")
    except ValueError:
        pass
    else:
        fail(failures, "Blank geography was accepted")

    if failures:
        print(f"{len(failures)} check(s) failed")
        return 1
    print("community trend checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
