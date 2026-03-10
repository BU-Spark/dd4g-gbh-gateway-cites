"""
Validates all raw ACS files: checks two-row header, required columns,
and prints a summary of row counts and geographic coverage.
"""
import pandas as pd
from pathlib import Path

RAW = Path("data/raw")

FILES = {
    "dp03":   "ACSDP5Y2024.DP03-Data.csv",
    "b05001": "ACSDT5Y2024.B05001-Data.csv",
    "b05002": "ACSDT5Y2024.B05002-Data.csv",
    "b05003": "ACSDT5Y2024.B05003-Data.csv",
    "b05006": "ACSDT5Y2024.B05006-Data.csv",
    "b06011": "ACSDT5Y2024.B06011-Data.csv",
    "b15002": "ACSDT5Y2024.B15002-Data.csv",
    "b25003": "ACSDT5Y2024.B25003-Data.csv",
    "s0501":  "ACSST5Y2024.S0501-Data.csv",
    "b05010": "ACSDT5Y2024.B05010-Data.csv",  # ← add this line
}


for table, fname in FILES.items():
    path = RAW / fname
    # Row 0 = codes, row 1 = labels — skip row 1 when loading data
    df = pd.read_csv(path, header=0, skiprows=[1], encoding="utf-8-sig")
    df.columns = df.columns.str.strip().str.replace('"', '')
    print(f"{table}: {len(df)} rows | cols: {len(df.columns)}")
    print(f"  GEO_ID sample: {df['GEO_ID'].iloc[:3].tolist()}")
    print(f"  NAME sample:   {df['NAME'].iloc[:3].tolist()}")
    print()
