import pandas as pd
import numpy as np
from pathlib import Path
from functools import lru_cache

from .place_names import apply_place_aliases

PROCESSED = Path(__file__).parent.parent.parent / "data" / "processed"

BAD_VALUES = {-888888888, -666666666, -999999999}


def _sanitize(df: pd.DataFrame) -> pd.DataFrame:
    return df.astype(object).where(pd.notnull(df), other=None)


@lru_cache(maxsize=None)
def _load(filename: str) -> pd.DataFrame:
    df = apply_place_aliases(pd.read_parquet(PROCESSED / filename))
    if "city" in df.columns and "city_type" in df.columns:
        gateway = df["city"].isin(GATEWAY_CITY_NAMES) & df["city_type"].ne("state")
        if gateway.any():
            df = df.copy()
            df.loc[gateway, "city_type"] = "gateway"
    return df

def _find_state_row(df: pd.DataFrame) -> pd.DataFrame:
    # Try GEO_ID first (most reliable — set in fetch step)
    if "GEO_ID" in df.columns:
        geo_mask = df["GEO_ID"].astype(str).str.startswith("0400000US", na=False)
        if geo_mask.any():
            return df[geo_mask]
    # Fallback: match by city name
    if "city" not in df.columns:
        return df.iloc[0:0]
    candidates = {
        "Massachusetts",
        "Commonwealth of Massachusetts",
        "Massachusetts State",
        "MA",
    }
    return df[df["city"].astype(str).isin(candidates)]

def _to_records(df: pd.DataFrame) -> list:
    return _sanitize(df).to_dict(orient="records")


def get_cities_master():
    df = _load("cities_master.parquet")
    df = df.sort_values("year").drop_duplicates(subset=["city"], keep="last")
    df = df[df["city_type"] != "state"]
    return _to_records(df)


def get_foreign_born(city: str = None, city_type: str = None):
    df = _load("foreign_born_core.parquet")
    df = df[df["city_type"] != "state"]
    if city:
        df = df[df["city"] == city]
    if city_type:
        df = df[df["city_type"] == city_type]
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    return _to_records(df)

REGION_LABELS = {
    # Continents
    "Africa:", "Americas:", "Asia:", "Europe:", "Oceania:",
    "Latin America:", "South America:",
    # Subregions with colon
    "Caribbean:", "Central America:", "Northern America:",
    "Eastern Africa:", "Eastern Asia:", "Eastern Europe:",
    "Northern Africa:", "Northern Europe:", "Southern Africa:",
    "Southern Europe:", "Western Africa:", "Western Asia:", "Western Europe:",
    "South Central Asia:", "South Eastern Asia:", "Australia and New Zealand Subregion:",
    "Middle Africa:",
    # n.e.c. entries
    "Africa, n.e.c.", "Asia, n.e.c.", "Europe, n.e.c.", "Oceania, n.e.c.",
    # "Other ..." entries
    "Other Caribbean", "Other Central America", "Other Eastern Africa",
    "Other Eastern Asia", "Other Eastern Europe", "Other Middle Africa",
    "Other Northern Africa", "Other Northern America", "Other Northern Europe",
    "Other South America", "Other South Central Asia", "Other South Eastern Asia",
    "Other Southern Africa", "Other Southern Europe", "Other Western Africa",
    "Other Western Asia", "Other Western Europe",
    "Other Australian and New Zealand Subregion",
}


GATEWAY_CITY_NAMES = {
    "Attleboro", "Barnstable", "Brockton", "Chelsea", "Chicopee",
    "Everett", "Fall River", "Fitchburg", "Haverhill",
    "Holyoke", "Lawrence", "Leominster", "Lowell", "Lynn", "Malden",
    "Methuen", "New Bedford", "Peabody", "Pittsfield", "Quincy",
    "Revere", "Salem", "Springfield", "Taunton", "Westfield", "Worcester",
}


def get_country_of_origin_trend(scope: str = "state"):
    """Return country-of-origin rows for all years, aggregated for state or gateway scope."""
    df = _load("country_of_origin.parquet")
    if scope == "gateway":
        df = df[df["city"].isin(GATEWAY_CITY_NAMES)]
    df = df[~df["country"].astype(str).str.endswith(":")].copy()
    df["estimate"] = (
        pd.to_numeric(df["estimate"], errors="coerce")
        .replace(list(BAD_VALUES), np.nan)
        .fillna(0)
    )
    group_cols = [c for c in ["year", "country", "region"] if c in df.columns]
    grouped = (
        df.groupby(group_cols, dropna=False)["estimate"]
        .sum()
        .reset_index()
        .sort_values(group_cols)
    )
    return _to_records(grouped)


def _country_rows() -> pd.DataFrame:
    df = _load("country_of_origin.parquet")
    df = df[~df["country"].astype(str).str.endswith(":")].copy()
    df["country"] = df["country"].astype(str).str.strip()
    df["estimate"] = (
        pd.to_numeric(df["estimate"], errors="coerce")
        .replace(list(BAD_VALUES), np.nan)
    )
    return df


@lru_cache(maxsize=1)
def get_country_names():
    names = _country_rows()["country"].dropna()
    names = sorted({name for name in names if name})
    return names


def _count_trend(df: pd.DataFrame, value_col: str) -> list:
    if df.empty or value_col not in df.columns:
        return []
    trend = df[df["city_type"] != "state"] if "city_type" in df.columns else df
    grouped = (
        trend.groupby(["city", "year"], dropna=False)[value_col]
        .sum()
        .reset_index()
        .rename(columns={value_col: "value"})
    )
    grouped = grouped[grouped["value"].notna()]
    return _to_records(grouped.sort_values(["city", "year"]))


def get_origin_trend(country: str = None, region: str = None):
    """People born in a country or region, or the total foreign-born population.

    Counts are one row per town/city and year. The state total is left out so
    the 'all towns' chart is not dominated by Massachusetts as a whole.
    """
    target_country = str(country or "").strip()
    target_region = str(region or "").strip()
    if target_country:
        df = _country_rows()
        df = df[df["country"].str.casefold() == target_country.casefold()]
        return _count_trend(df, "estimate")
    if target_region:
        df = _country_rows()
        if "region" not in df.columns:
            return []
        df = df[df["region"].astype(str).str.casefold() == target_region.casefold()]
        return _count_trend(df, "estimate")

    df = _load("foreign_born_core.parquet")
    df = df.copy()
    df["foreign_born"] = (
        pd.to_numeric(df["foreign_born"], errors="coerce")
        .replace(list(BAD_VALUES), np.nan)
    )
    return _count_trend(df, "foreign_born")


def get_country_trend(country: str):
    """Population born in one country, for every place and year."""
    return get_origin_trend(country=country)


COMMUNITY_REGIONS = (
    "Africa",
    "Asia",
    "Europe",
    "Latin America",
    "Northern America",
    "Oceania",
)
MAX_COMMUNITIES = 8
TOP_COMMUNITIES = 5


def _json_number(value):
    if value is None or pd.isna(value):
        return None
    number = float(value)
    if number.is_integer():
        return int(number)
    return number


def _community_points(frame: pd.DataFrame, moe_by_year: dict | None = None) -> list:
    """Annual estimates for one community. Leaf rows are already non-overlapping."""
    if frame.empty:
        return []
    grouped = (
        frame.groupby("year", dropna=False)["estimate"]
        .sum()
        .sort_index()
    )
    margins = moe_by_year or {}
    return [
        {
            "year": int(year),
            "value": _json_number(value),
            "moe": _json_number(margins.get(int(year))),
        }
        for year, value in grouped.items()
        if pd.notna(year)
    ]


def _margin_number(value):
    number = pd.to_numeric(value, errors="coerce")
    if pd.isna(number) or float(number) in BAD_VALUES or float(number) < 0:
        return None
    return float(number)


@lru_cache(maxsize=64)
def _origin_margins(geo_id: str) -> dict:
    """Map country and estimate values to margins when a B05006 column is unique."""
    interim_root = PROCESSED.parent / "interim"
    frame = _country_rows()
    frame = frame[frame["GEO_ID"].astype(str) == str(geo_id)]
    by_country = {}
    by_value = {}
    for year, year_rows in frame.groupby("year"):
        path = interim_root / str(int(year)) / "b05006.parquet"
        if not path.exists():
            continue
        raw = pd.read_parquet(path)
        matched = raw[raw["GEO_ID"].astype(str) == str(geo_id)]
        if matched.empty:
            continue
        raw_row = matched.iloc[0]
        margins_for_value = {}
        for column in raw.columns:
            code = str(column)
            if not code.startswith("B05006_") or not code.endswith("E") or code.endswith("EA"):
                continue
            estimate = _margin_number(raw_row[column])
            margin_column = code[:-1] + "M"
            if estimate is None or margin_column not in raw.columns:
                continue
            margins_for_value.setdefault(estimate, []).append(_margin_number(raw_row[margin_column]))
        for estimate, margins in margins_for_value.items():
            if len(margins) == 1:
                by_value[(int(year), estimate)] = margins[0]
        for _, origin in year_rows.iterrows():
            estimate = _margin_number(origin["estimate"])
            margins = margins_for_value.get(estimate, [])
            margin = margins[0] if len(margins) == 1 else None
            by_country[(int(year), str(origin["country"]).casefold())] = margin
    return {"countries": by_country, "values": by_value}


def _region_margins(frame: pd.DataFrame, lookup: dict, value_lookup: dict | None = None) -> dict:
    """Approximate a region's margin from its leaf-country margins."""
    margins = {}
    if frame.empty:
        return margins
    for year, year_rows in frame.groupby("year"):
        squares = []
        for country in year_rows["country"].astype(str):
            margin = lookup.get((int(year), country.casefold()))
            if margin is None:
                squares = None
                break
            squares.append(float(margin) ** 2)
        approximate = None if not squares else round(sum(squares) ** 0.5)
        total = _margin_number(year_rows["estimate"].sum())
        official = (value_lookup or {}).get((int(year), total))
        margins[int(year)] = official if official is not None else approximate
    return margins


def get_community_trends(geography: str, communities: list[str] | None = None):
    """Compare several origin communities inside one city or statewide.

    With no communities, the series are the five largest countries of origin
    in the latest year. A region series is the sum of that region's leaf
    countries, which do not overlap in the processed place-of-birth file.
    """
    requested = str(geography or "").strip()
    if not requested:
        raise ValueError("A city or Statewide is required")

    df = _country_rows()
    if requested.casefold() in {"statewide", "massachusetts"}:
        frame = df[df["city_type"] == "state"] if "city_type" in df.columns else df.iloc[0:0]
        if frame.empty:
            frame = df[df["city"].str.casefold() == "massachusetts"]
        geography_name = "Statewide"
    else:
        frame = df[df["city"].str.casefold() == requested.casefold()]
        if frame.empty:
            raise LookupError(f"Unknown geography: {requested}")
        geography_name = str(frame["city"].iloc[0])

    if frame.empty:
        raise LookupError(f"Unknown geography: {requested}")

    known_countries = {
        str(name).casefold(): str(name)
        for name in df["country"].dropna().unique()
        if str(name).strip()
    }
    known_regions = {name.casefold(): name for name in COMMUNITY_REGIONS}
    using_defaults = not communities
    selected = []
    if using_defaults:
        latest_year = frame["year"].max()
        ranked = (
            frame[frame["year"] == latest_year]
            .groupby("country", dropna=False)["estimate"]
            .sum()
            .reset_index()
            .sort_values(["estimate", "country"], ascending=[False, True])
        )
        selected = [
            (str(name), "country")
            for name in ranked["country"].head(TOP_COMMUNITIES).tolist()
            if str(name).strip()
        ]
    else:
        unknown = []
        seen = set()
        for raw in communities:
            label = str(raw or "").strip()
            key = label.casefold()
            if not key or key in seen:
                continue
            seen.add(key)
            if key in known_regions:
                selected.append((known_regions[key], "region"))
            elif key in known_countries:
                selected.append((known_countries[key], "country"))
            else:
                unknown.append(label)
        if len(seen) > MAX_COMMUNITIES:
            raise ValueError(f"Select at most {MAX_COMMUNITIES} communities")
        if unknown:
            raise LookupError("Unknown communities: " + ", ".join(unknown))

    geo_ids = frame["GEO_ID"].astype(str).dropna().unique().tolist() if "GEO_ID" in frame.columns else []
    margin_index = _origin_margins(geo_ids[0]) if len(geo_ids) == 1 else {"countries": {}, "values": {}}
    lookup = margin_index["countries"]

    series = []
    for label, kind in selected:
        if kind == "region":
            subset = frame[frame["region"].astype(str).str.casefold() == label.casefold()]
            margins = _region_margins(subset, lookup, margin_index["values"])
        else:
            subset = frame[frame["country"].str.casefold() == label.casefold()]
            margins = {
                year: lookup.get((year, label.casefold()))
                for year in subset["year"].dropna().astype(int).unique()
            }
        series.append({
            "label": label,
            "type": kind,
            "points": _community_points(subset, margins),
        })

    return {
        "geography": geography_name,
        "defaults": using_defaults,
        "series": series,
    }


def get_country_of_origin(city: str = None, latest_only: bool = True):
    df = _load("country_of_origin.parquet")
    if city:
        df = df[df["city"] == city]
    if latest_only and "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    df = df[~df["country"].str.endswith(":")]
    cols = [c for c in ["city", "city_type", "year", "country", "estimate", "region"] if c in df.columns]
    return _to_records(df[cols])



def get_education(city: str = None):
    df = _load("education.parquet")
    if city:
        df = df[df["city"] == city]
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    return _to_records(df)


def get_homeownership(city: str = None):
    df = _load("homeownership.parquet")
    if city:
        df = df[df["city"] == city]
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    return _to_records(df)


def get_employment_income(city: str = None):
    df = _load("employment_income.parquet")
    if city:
        df = df[df["city"] == city]
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    return _to_records(df)


def get_poverty(city: str = None):
    df = _load("poverty_by_nativity.parquet")
    if city:
        df = df[df["city"] == city]
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    return _to_records(df)


def get_median_income(city: str = None):
    df = _load("median_income.parquet")
    if city:
        df = df[df["city"] == city]
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    return _to_records(df)


@lru_cache(maxsize=1)
def _foreign_born_characteristics_frame() -> pd.DataFrame:
    """Foreign-born education, tenure, and household income from ACS S0501."""
    columns = [
        "city", "city_type", "year",
        "fb_bachelors_pct", "fb_homeownership_pct", "fb_median_household_income",
    ]
    path = PROCESSED / "foreign_born_characteristics.parquet"
    if not path.exists():
        return pd.DataFrame(columns=columns)
    df = _load("foreign_born_characteristics.parquet")
    keep = [column for column in columns if column in df.columns]
    return df[keep]


def get_foreign_born_characteristics(city: str = None):
    df = _foreign_born_characteristics_frame()
    df = df[df["city_type"] != "state"]
    if city:
        df = df[df["city"] == city]
    return _to_records(df)


def get_map_stats():
    df = _load("foreign_born_core.parquet")
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    df = df[df["city_type"] != "state"]
    cols = [c for c in ["city", "city_type", "fb_pct", "foreign_born", "total_pop"] if c in df.columns]
    return _to_records(df[cols].drop_duplicates(subset=["city"]))

def get_statewide_foreign_born():
    """Return the real ACS statewide row for foreign_born_core, all years."""
    df = _load("foreign_born_core.parquet")
    state_df = _find_state_row(df)
    if state_df.empty:
        return []
    return _to_records(state_df.sort_values("year"))

@lru_cache(maxsize=1)
def _trend_margins() -> pd.DataFrame:
    path = PROCESSED / "trend_margins.parquet"
    if not path.exists():
        return pd.DataFrame(columns=["GEO_ID", "year", "metric", "moe"])
    df = pd.read_parquet(path)
    df["GEO_ID"] = df["GEO_ID"].astype(str)
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    return df


def get_time_series(city: str = None, metric: str = "fb_pct"):
    METRIC_MAP = {
        "fb_pct":            ("foreign_born_core.parquet",    "fb_pct"),
        "unemployment_rate": ("employment_income.parquet",    "unemployment_rate"),
        "median_income":     ("employment_income.parquet",    "median_household_income"),
        "poverty_rate":      ("poverty_by_nativity.parquet",  "fb_poverty_pct"),
        "bachelors_pct":     ("education.parquet",            "bachelors_pct"),
        "homeownership_pct": ("homeownership.parquet",        "homeownership_pct"),
        "fb_income":         ("median_income.parquet",        "median_income_foreign_born"),
    }

    if metric not in METRIC_MAP:
        return []

    filename, col = METRIC_MAP[metric]
    df = _load(filename)

    if city:
        df = df[df["city"] == city]

    keep = [c for c in ["GEO_ID", "city", "city_type", "year", col] if c in df.columns]
    df = df[keep].copy()

    df[col] = pd.to_numeric(df[col], errors="coerce").replace(list(BAD_VALUES), np.nan)
    df = df.dropna(subset=[col])
    df = df.rename(columns={col: "value"})
    df["metric"] = metric

    margins = _trend_margins()
    margins = margins[margins["metric"] == metric][["GEO_ID", "year", "moe"]]
    if "GEO_ID" in df.columns and not margins.empty:
        df["GEO_ID"] = df["GEO_ID"].astype(str)
        df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
        margins = margins.copy()
        margins["year"] = margins["year"].astype("Int64")
        df = df.merge(margins, on=["GEO_ID", "year"], how="left")
    else:
        df["moe"] = pd.NA
    df = df.drop(columns=["GEO_ID"], errors="ignore")

    return _to_records(df.sort_values(["city", "year"]))


def _latest(df: pd.DataFrame) -> pd.DataFrame:
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    return df


def _weighted_avg(df: pd.DataFrame, value_col: str, weight_cols: list[str]) -> float | None:
    if value_col not in df.columns:
        return None
    values = pd.to_numeric(df[value_col], errors="coerce").replace(list(BAD_VALUES), np.nan)

    weights = None
    for wc in weight_cols:
        if wc in df.columns:
            weights = pd.to_numeric(df[wc], errors="coerce").replace(list(BAD_VALUES), np.nan)
            break

    if weights is None:
        vals = values.dropna()
        if vals.empty:
            return None
        return float(vals.mean())

    mask = values.notna() & weights.notna() & (weights > 0)
    if not mask.any():
        return None
    v = values[mask]
    w = weights[mask]
    return float((v * w).sum() / w.sum())

def get_state_profile():
    """
    Returns a single statewide profile row for Massachusetts, using a real
    Massachusetts row if present; otherwise derives a statewide aggregate from
    city-level rows.
    """
    fb = _latest(_load("foreign_born_core.parquet"))
    emp = _latest(_load("employment_income.parquet"))
    edu = _latest(_load("education.parquet"))
    own = _latest(_load("homeownership.parquet"))
    med = _latest(_load("median_income.parquet"))

    fb_state = _find_state_row(fb)
    emp_state = _find_state_row(emp)
    edu_state = _find_state_row(edu)
    own_state = _find_state_row(own)
    med_state = _find_state_row(med)

    out: dict = {"city": "Statewide", "city_type": "state"}

    # Foreign-born % (prefer explicit state row; else compute from totals if available)
    if not fb_state.empty:
        row = fb_state.iloc[-1]
        out["fb_pct"] = row.get("fb_pct")
        out["foreign_born"] = row.get("foreign_born")
        out["total_pop"] = row.get("total_pop")
        if "year" in fb_state.columns:
            out["year"] = row.get("year")
    else:
        if "foreign_born" in fb.columns and "total_pop" in fb.columns:
            foreign_born = pd.to_numeric(fb["foreign_born"], errors="coerce").replace(list(BAD_VALUES), np.nan)
            total_pop = pd.to_numeric(fb["total_pop"], errors="coerce").replace(list(BAD_VALUES), np.nan)
            mask = foreign_born.notna() & total_pop.notna() & (total_pop > 0)
            if mask.any():
                fb_sum = float(foreign_born[mask].sum())
                pop_sum = float(total_pop[mask].sum())
                out["foreign_born"] = fb_sum
                out["total_pop"] = pop_sum
                out["fb_pct"] = (fb_sum / pop_sum) * 100 if pop_sum else None
        if "year" in fb.columns:
            out["year"] = int(fb["year"].max())

    # Employment/income (rates need weighting; income is best-effort weighting)
    if not emp_state.empty:
        row = emp_state.iloc[-1]
        out["unemployment_rate"] = row.get("unemployment_rate")
        out["median_household_income"] = row.get("median_household_income")
        if "year" in emp_state.columns and "year" not in out:
            out["year"] = row.get("year")
    else:
        out["unemployment_rate"] = _weighted_avg(
            emp,
            "unemployment_rate",
            ["labor_force", "population_16_over", "total_pop"],
        )
        out["median_household_income"] = _weighted_avg(
            emp,
            "median_household_income",
            ["households", "total_pop"],
        )

    # Education (percent)
    if not edu_state.empty:
        row = edu_state.iloc[-1]
        out["bachelors_pct"] = row.get("bachelors_pct")
        if "year" in edu_state.columns and "year" not in out:
            out["year"] = row.get("year")
    else:
        out["bachelors_pct"] = _weighted_avg(
            edu,
            "bachelors_pct",
            ["population_25_over", "total_pop"],
        )

    # Homeownership (percent)
    if not own_state.empty:
        row = own_state.iloc[-1]
        out["homeownership_pct"] = row.get("homeownership_pct")
        if "year" in own_state.columns and "year" not in out:
            out["year"] = row.get("year")
    else:
        out["homeownership_pct"] = _weighted_avg(
            own,
            "homeownership_pct",
            ["housing_units", "households", "total_pop"],
        )

    if not med_state.empty:
        row = med_state.iloc[-1]
        out["median_income_foreign_born"] = row.get("median_income_foreign_born")
    else:
        out["median_income_foreign_born"] = _weighted_avg(
            med, "median_income_foreign_born", ["median_income_total"]
        )

    fb_chars = _foreign_born_characteristics_frame()
    fb_state = fb_chars[fb_chars["city_type"] == "state"] if "city_type" in fb_chars.columns else fb_chars.iloc[0:0]
    if not fb_state.empty:
        row = fb_state.iloc[-1]
        out["fb_bachelors_pct"] = row.get("fb_bachelors_pct")
        out["fb_homeownership_pct"] = row.get("fb_homeownership_pct")
        out["fb_median_household_income"] = row.get("fb_median_household_income")

    return {
        k: (
            None if v is None or (isinstance(v, float) and np.isnan(v))
            else int(v) if isinstance(v, (np.integer,))
            else float(v) if isinstance(v, (np.floating,))
            else v
        )
        for k, v in out.items()
    }


def get_state_averages():
    """Compatibility alias for clients that ask for statewide averages."""
    return get_state_profile()



def get_state_country_of_origin():
    """
    Returns statewide totals by country, derived by summing city estimates.
    (If a Massachusetts row exists, it is used instead.)
    """
    df = _latest(_load("country_of_origin.parquet"))
    state_df = _find_state_row(df)

    use_df = state_df if not state_df.empty else df

    if "estimate" in use_df.columns:
        use_df = use_df.copy()
        use_df["estimate"] = (
            pd.to_numeric(use_df["estimate"], errors="coerce")
            .replace(list(BAD_VALUES), np.nan)
            .fillna(0)
        )

    # Filter to country rows (skip region headers etc.) similar to get_country_of_origin
    use_df = use_df[~use_df["country"].astype(str).str.endswith(":")]

    cols = [c for c in ["country", "estimate", "region"] if c in use_df.columns]
    use_df = use_df[cols]

    if "estimate" not in use_df.columns or "country" not in use_df.columns:
        return []

    grouped = (
        use_df.groupby(["country", "region"], dropna=False)["estimate"]
        .sum()
        .reset_index()
        .sort_values("estimate", ascending=False)
    )
    return _to_records(grouped)
