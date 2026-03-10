import pandas as pd

df = pd.read_csv(
    "data/raw/ACSDT5Y2024.B05002-Data.csv",
    header=0, skiprows=[1], encoding="utf-8-sig"
)
df.columns = df.columns.str.strip().str.replace('"', '')
df["GEO_ID"] = df["GEO_ID"].str.strip()

target = "1600000US2562535"
row = df[df["NAME"].str.contains("Somerville", case=False, na=False)]

print("Somerville row:")
print(row[["GEO_ID", "NAME"]].to_string())

print("\nExact GEO_ID from file:")
actual = row["GEO_ID"].values[0]
print(repr(actual))

print("\nOur target:")
print(repr(target))

print("\nMatch:", actual == target)
print("Lengths:", len(actual), "vs", len(target))

print("\nChar-by-char diff:")
for i, (a, b) in enumerate(zip(actual, target)):
    if a != b:
        print(f"  pos {i}: file={repr(a)} vs target={repr(b)}")
