import pandas as pd
from pathlib import Path

RAW     = Path("data/raw")
INTERIM = Path("data/interim")
INTERIM.mkdir(exist_ok=True)

CITY_FIPS = {
    "Attleboro":   "1600000US2502690",
    "Barnstable":  "1600000US2503690",
    "Brockton":    "1600000US2509000",
    "Chelsea":     "1600000US2513205",
    "Chicopee":    "1600000US2513660",
    "Everett":     "1600000US2521990",
    "Fall River":  "1600000US2523000",
    "Fitchburg":   "1600000US2523875",
    "Framingham":  "1600000US2524960",
    "Haverhill":   "1600000US2529405",
    "Holyoke":     "1600000US2530840",
    "Lawrence":    "1600000US2534550",
    "Leominster":  "1600000US2535075",
    "Lowell":      "1600000US2537000",
    "Lynn":        "1600000US2537490",
    "Malden":      "1600000US2537875",
    "Methuen":     "1600000US2540675",
    "New Bedford": "1600000US2545000",
    "Peabody":     "1600000US2552490",
    "Pittsfield":  "1600000US2553960",
    "Quincy":      "1600000US2555745",
    "Revere":      "1600000US2556585",
    "Salem":       "1600000US2559105",
    "Springfield": "1600000US2567000",
    "Taunton":     "1600000US2569170",
    "Westfield":   "1600000US2576030",
    "Worcester":   "1600000US2582000",
    "Somerville":  "1600000US2562535",
    "Weymouth":    "1600000US2578972",
    "Marlborough": "1600000US2538715",
    "Boston":      "1600000US2507000",
    "Cambridge":   "1600000US2511000",
}

CITY_TYPE = {
    name: (
        "benchmark" if name in ["Boston", "Cambridge"]
        else "comparison" if name in ["Somerville", "Weymouth", "Marlborough"]
        else "gateway"
    )
    for name in CITY_FIPS
}

FILES = {
    "dp03":   "ACSDP5Y2024.DP03-Data.csv",
    "b05001": "ACSDT5Y2024.B05001-Data.csv",
    "b05002": "ACSDT5Y2024.B05002-Data.csv",
    "b05003": "ACSDT5Y2024.B05003-Data.csv",
    "b05006": "ACSDT5Y2024.B05006-Data.csv",
    "b05010": "ACSDT5Y2024.B05010-Data.csv",
    "b06011": "ACSDT5Y2024.B06011-Data.csv",
    "b15002": "ACSDT5Y2024.B15002-Data.csv",
    "b25003": "ACSDT5Y2024.B25003-Data.csv",
    "s0501":  "ACSST5Y2024.S0501-Data.csv",
}

fips_to_city = {v: k for k, v in CITY_FIPS.items()}
target_fips  = set(CITY_FIPS.values())

for table, fname in FILES.items():
    df = pd.read_csv(RAW / fname, header=0, skiprows=[1], encoding="utf-8-sig")
    df.columns = df.columns.str.strip().str.replace('"', '')
    df["GEO_ID"] = df["GEO_ID"].str.strip()
    df = df[df["GEO_ID"].isin(target_fips)].copy()
    margin_cols = [c for c in df.columns if c.endswith("M") and c != "NAME"]
    df = df.drop(columns=margin_cols)
    df["city"]      = df["GEO_ID"].map(fips_to_city)
    df["city_type"] = df["city"].map(CITY_TYPE)
    df["year"]      = 2024
    out = INTERIM / f"{table}.parquet"
    df.to_parquet(out, index=False)
    print(f"✓ {table}: {len(df)} cities → {out}")
    print(f"  cities: {sorted(df['city'].dropna().tolist())}")

print("\nDone. Check data/interim/")
