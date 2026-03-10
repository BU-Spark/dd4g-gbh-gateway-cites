import pandas as pd
from pathlib import Path

INTERIM   = Path("data/interim")
PROCESSED = Path("data/processed")
PROCESSED.mkdir(exist_ok=True)

# ── Load base tables ──────────────────────────────────────────────────────────
b05002 = pd.read_parquet(INTERIM / "b05002.parquet")
b05006 = pd.read_parquet(INTERIM / "b05006.parquet")
b05010 = pd.read_parquet(INTERIM / "b05010.parquet")
b06011 = pd.read_parquet(INTERIM / "b06011.parquet")
b15002 = pd.read_parquet(INTERIM / "b15002.parquet")
b25003 = pd.read_parquet(INTERIM / "b25003.parquet")
dp03   = pd.read_parquet(INTERIM / "dp03.parquet")
s0501  = pd.read_parquet(INTERIM / "s0501.parquet")

META = ["GEO_ID", "NAME", "city", "city_type", "year"]

# ── 1. Core foreign-born metrics (B05002) ────────────────────────────────────
fb = b05002[META + ["B05002_001E", "B05002_013E", "B05002_014E", "B05002_021E"]].copy()
fb.columns = META + ["total_pop", "foreign_born", "fb_naturalized", "fb_not_citizen"]
fb["fb_pct"]             = fb["foreign_born"]    / fb["total_pop"] * 100
fb["fb_naturalized_pct"] = fb["fb_naturalized"]  / fb["foreign_born"] * 100
fb["fb_not_citizen_pct"] = fb["fb_not_citizen"]  / fb["foreign_born"] * 100

fb.to_parquet(PROCESSED / "foreign_born_core.parquet", index=False)
print(f"✓ foreign_born_core: {len(fb)} rows")

# ── 2. Country of origin (B05006) ────────────────────────────────────────────
# Keep only estimate columns + META
origin_cols = [c for c in b05006.columns if c.endswith("E") and c not in ("NAME",)]
origin = b05006[META + [c for c in origin_cols if c not in META]].copy()
origin.to_parquet(PROCESSED / "country_of_origin.parquet", index=False)
print(f"✓ country_of_origin: {len(origin)} rows, {len(origin.columns)} cols")

# ── 3. Poverty by nativity (B05010) ──────────────────────────────────────────
pov = b05010[META].copy()
pov_cols = [c for c in b05010.columns if c.endswith("E") and c not in META]
pov = b05010[META + pov_cols].copy()
# B05010_002E = total foreign-born for poverty calc, B05010_003E = below poverty
pov["fb_poverty_pct"] = pd.to_numeric(b05010.get("B05010_003E"), errors="coerce") / \
                        pd.to_numeric(b05010.get("B05010_002E"), errors="coerce") * 100
pov.to_parquet(PROCESSED / "poverty_by_nativity.parquet", index=False)
print(f"✓ poverty_by_nativity: {len(pov)} rows")

# ── 4. Median income by nativity (B06011) ────────────────────────────────────
inc = b06011[META + [c for c in b06011.columns if c.endswith("E") and c not in META]].copy()
# B06011_001E = overall median, B06011_005E = foreign-born median
inc = inc.rename(columns={
    "B06011_001E": "median_income_total",
    "B06011_005E": "median_income_foreign_born",
})
inc.to_parquet(PROCESSED / "median_income.parquet", index=False)
print(f"✓ median_income: {len(inc)} rows")

# ── 5. Education by nativity (B15002) ────────────────────────────────────────
edu_cols = [c for c in b15002.columns if c.endswith("E") and c not in META]
edu = b15002[META + edu_cols].copy()
# B15002_001E = total 25+
# High school: B15002_011E (male) + B15002_028E (female)
# Bachelor's:  B15002_015E (male) + B15002_032E (female)
# Advanced:    B15002_016E + B15002_017E + B15002_033E + B15002_034E
total_25plus = pd.to_numeric(edu.get("B15002_001E"), errors="coerce")
hs    = pd.to_numeric(edu.get("B15002_011E"), errors="coerce") + \
        pd.to_numeric(edu.get("B15002_028E"), errors="coerce")
bach  = pd.to_numeric(edu.get("B15002_015E"), errors="coerce") + \
        pd.to_numeric(edu.get("B15002_032E"), errors="coerce")
adv   = pd.to_numeric(edu.get("B15002_016E"), errors="coerce") + \
        pd.to_numeric(edu.get("B15002_017E"), errors="coerce") + \
        pd.to_numeric(edu.get("B15002_033E"), errors="coerce") + \
        pd.to_numeric(edu.get("B15002_034E"), errors="coerce")

edu["hs_pct"]       = hs   / total_25plus * 100
edu["bachelors_pct"] = bach / total_25plus * 100
edu["advanced_pct"] = adv  / total_25plus * 100
edu.to_parquet(PROCESSED / "education.parquet", index=False)
print(f"✓ education: {len(edu)} rows")

# ── 6. Homeownership (B25003) ─────────────────────────────────────────────────
own = b25003[META + [c for c in b25003.columns if c.endswith("E") and c not in META]].copy()
own = own.rename(columns={
    "B25003_001E": "total_housing_units",
    "B25003_002E": "owner_occupied",
    "B25003_003E": "renter_occupied",
})
own["homeownership_pct"] = pd.to_numeric(own["owner_occupied"], errors="coerce") / \
                           pd.to_numeric(own["total_housing_units"], errors="coerce") * 100
own.to_parquet(PROCESSED / "homeownership.parquet", index=False)
print(f"✓ homeownership: {len(own)} rows")

# ── 7. Employment / income (DP03) ─────────────────────────────────────────────
emp_cols = {
    "DP03_0004E": "employed",
    "DP03_0005E": "unemployed",
    "DP03_0062E": "median_household_income",
    "DP03_0063E": "mean_household_income",
    "DP03_0119E": "poverty_rate",
}
available = {k: v for k, v in emp_cols.items() if k in dp03.columns}
emp = dp03[META + list(available.keys())].copy()
emp = emp.rename(columns=available)
if "employed" in emp.columns and "unemployed" in emp.columns:
    total_lf = pd.to_numeric(emp["employed"], errors="coerce") + \
               pd.to_numeric(emp["unemployed"], errors="coerce")
    emp["unemployment_rate"] = pd.to_numeric(emp["unemployed"], errors="coerce") / total_lf * 100
emp.to_parquet(PROCESSED / "employment_income.parquet", index=False)
print(f"✓ employment_income: {len(emp)} rows")

# ── 8. Master city reference ──────────────────────────────────────────────────
cities = fb[["GEO_ID", "NAME", "city", "city_type", "year",
             "total_pop", "foreign_born", "fb_pct"]].copy()
cities.to_parquet(PROCESSED / "cities_master.parquet", index=False)
print(f"✓ cities_master: {len(cities)} rows")

print("\n✅ All processed files written to data/processed/")
