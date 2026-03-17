import pandas as pd
import numpy as np
from pathlib import Path
from functools import lru_cache

PROCESSED = Path(__file__).parent.parent.parent / "data" / "processed"

BAD_VALUES = {-888888888, -666666666, -999999999}


def _sanitize(df: pd.DataFrame) -> pd.DataFrame:
    return df.astype(object).where(pd.notnull(df), other=None)


@lru_cache(maxsize=None)
def _load(filename: str) -> pd.DataFrame:
    return pd.read_parquet(PROCESSED / filename)


def _to_records(df: pd.DataFrame) -> list:
    return _sanitize(df).to_dict(orient="records")


def get_cities_master():
    df = _load("cities_master.parquet")
    df = df.sort_values("year").drop_duplicates(subset=["city"], keep="last")
    return _to_records(df)


def get_foreign_born(city: str = None, city_type: str = None):
    df = _load("foreign_born_core.parquet")
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


def get_country_of_origin(city: str = None):
    df = _load("country_of_origin.parquet")
    if city:
        df = df[df["city"] == city]
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    df = df[
        ~df["country"].str.endswith(":") &
        ~df["country"].str.startswith("Other ") &
        ~df["country"].str.contains(", n.e.c.", regex=False)
    ]
    cols = [c for c in ["city", "city_type", "country", "estimate", "region"] if c in df.columns]
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


def get_map_stats():
    df = _load("foreign_born_core.parquet")
    if "year" in df.columns:
        df = df[df["year"] == df["year"].max()]
    cols = [c for c in ["city", "city_type", "fb_pct", "foreign_born", "total_pop"] if c in df.columns]
    return _to_records(df[cols].drop_duplicates(subset=["city"]))


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

    keep = [c for c in ["city", "city_type", "year", col] if c in df.columns]
    df = df[keep].copy()

    df[col] = pd.to_numeric(df[col], errors="coerce").replace(list(BAD_VALUES), np.nan)
    df = df.dropna(subset=[col])
    df = df.rename(columns={col: "value"})
    df["metric"] = metric

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


def _find_state_row(df: pd.DataFrame) -> pd.DataFrame:
    if "city" not in df.columns:
        return df.iloc[0:0]
    # Common spellings that might appear in source data
    candidates = {
        "Massachusetts",
        "Commonwealth of Massachusetts",
        "Massachusetts State",
        "MA",
    }
    state_df = df[df["city"].astype(str).isin(candidates)]
    return state_df


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

    fb_state = _find_state_row(fb)
    emp_state = _find_state_row(emp)
    edu_state = _find_state_row(edu)
    own_state = _find_state_row(own)

    out: dict = {"city": "Massachusetts", "city_type": "state"}

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

    return out


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
    use_df = use_df[
        ~use_df["country"].astype(str).str.endswith(":") &
        ~use_df["country"].astype(str).str.startswith("Other ") &
        ~use_df["country"].astype(str).str.contains(", n.e.c.", regex=False)
    ]

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


