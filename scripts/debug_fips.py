import pandas as pd
from pathlib import Path

CITY_FIPS = {
    "Attleboro":   "1600000US2502690",
    "Barnstable":  "1600000US2503690",
    "Brockton":    "1600000US2509000",
    "Chelsea":     "1600000US2512205",
    "Chicopee":    "1600000US2512740",
    "Everett":     "1600000US2521990",
    "Fall River":  "1600000US2523000",
    "Fitchburg":   "1600000US2523875",
    "Framingham":  "1600000US2524960",
    "Haverhill":   "1600000US2529405",
    "Holyoke":     "1600000US2531000",
    "Lawrence":    "1600000US2534550",
    "Leominster":  "1600000US2534890",
    "Lowell":      "1600000US2537000",
    "Lynn":        "1600000US2537490",
    "Malden":      "1600000US2537875",
    "Methuen":     "1600000US2540710",
    "New Bedford": "1600000US2545000",
    "Peabody":     "1600000US2549875",
    "Pittsfield":  "1600000US2550840",
    "Quincy":      "1600000US2555745",
    "Revere":      "1600000US2557390",
    "Salem":       "1600000US2558785",
    "Springfield": "1600000US2567000",
    "Taunton":     "1600000US2570160",
    "Westfield":   "1600000US2574175",
    "Worcester":   "1600000US2582000",
    "Somerville":  "1600000US2562535",
    "Weymouth":    "1600000US2573440",
    "Marlborough": "1600000US2541050",
    "Boston":      "1600000US2507000",
    "Cambridge":   "1600000US2511000",
}

df = pd.read_csv(
    "data/raw/ACSDT5Y2024.B05002-Data.csv",
    header=0, skiprows=[1], encoding="utf-8-sig"
)
df.columns = df.columns.str.strip().str.replace('"', '')
actual_fips = set(df["GEO_ID"].str.strip())

print("MISSING from raw data:")
for city, fips in CITY_FIPS.items():
    if fips not in actual_fips:
        print(f"  {city}: {fips}")

print("\nSample GEO_IDs in raw file:")
print(df["GEO_ID"].head(10).tolist())
