import pandas as pd
from pathlib import Path
from functools import lru_cache

PROCESSED = Path(__file__).parent.parent.parent / "data" / "processed"

@lru_cache(maxsize=None)
def _load(filename: str) -> pd.DataFrame:
    return pd.read_parquet(PROCESSED / filename)

def get_cities_master():
    return _load("cities_master.parquet").to_dict(orient="records")

def get_foreign_born(city: str = None, city_type: str = None):
    df = _load("foreign_born_core.parquet")
    if city:
        df = df[df["city"] == city]
    if city_type:
        df = df[df["city_type"] == city_type]
    return df.to_dict(orient="records")

def get_country_of_origin(city: str = None):
    df = _load("country_of_origin.parquet")
    if city:
        df = df[df["city"] == city]
    return df.to_dict(orient="records")

def get_education(city: str = None):
    df = _load("education.parquet")
    if city:
        df = df[df["city"] == city]
    return df.to_dict(orient="records")

def get_homeownership(city: str = None):
    df = _load("homeownership.parquet")
    if city:
        df = df[df["city"] == city]
    return df.to_dict(orient="records")

def get_employment_income(city: str = None):
    df = _load("employment_income.parquet")
    if city:
        df = df[df["city"] == city]
    return df.to_dict(orient="records")

def get_poverty(city: str = None):
    df = _load("poverty_by_nativity.parquet")
    if city:
        df = df[df["city"] == city]
    return df.to_dict(orient="records")

def get_median_income(city: str = None):
    df = _load("median_income.parquet")
    if city:
        df = df[df["city"] == city]
    return df.to_dict(orient="records")

def get_map_stats():
    df = _load("foreign_born_core.parquet")
    cols = [c for c in ["city", "geoid", "fb_pct", "fb_count", "total_pop", "city_type"] if c in df.columns]
    return df[cols].drop_duplicates(subset=["city"]).to_dict(orient="records")