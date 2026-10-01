"""Build margin-of-error values for the Trends chart.

The processed estimate files do not keep ACS margins. This reads the Census
summary files for the same tables and writes one margin, in the same units as
the chart, for each place and year.

Percent margins use the Census approximation for a ratio. Dollar margins for
median income are the published margins.
"""

from __future__ import annotations

import csv
import math
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
CACHE = ROOT / "data" / "interim" / "moe_cache"
OUT = PROCESSED / "trend_margins.parquet"

SEQ_YEARS = range(2012, 2021)
TABLE_YEARS = range(2021, 2025)
BAD = {None, "", ".", "-", "*", "*****", "-666666666", "-999999999", "-888888888", "-222222222", "-333333333"}

TABLES = {
    "B05002": {"lines": [1, 13]},
    "B05010": {"lines": [2, 3]},
    "B06011": {"lines": [5]},
    "B15002": {"lines": [1, 15, 16, 17, 18, 32, 33, 34, 35]},
    "B19013": {"lines": [1]},
    "B23025": {"lines": [4, 5]},
    "B25003": {"lines": [1, 2]},
}


def _download(url: str, dest: Path) -> Path:
    return _download_first([url], dest)


def _download_first(urls: list[str], dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    print(f"  download {dest.name}")
    last_error = None
    for url in urls:
        try:
            urllib.request.urlretrieve(url, dest)
            if dest.exists() and dest.stat().st_size > 0:
                return dest
        except Exception as exc:
            last_error = exc
            if dest.exists():
                dest.unlink()
    raise RuntimeError(f"Could not download {dest.name}") from last_error


def _num(value) -> float | None:
    text = str(value).strip()
    if text in BAD:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if not math.isfinite(number) or number < 0 or number > 50_000_000:
        return None
    return number


def _normalize_geoid(raw: str) -> str | None:
    geo = str(raw).strip().strip('"')
    if geo.startswith("1600000US25") or geo.startswith("0400000US25"):
        return geo
    if geo.startswith("16000US25"):
        return "1600000US" + geo[len("16000US"):]
    if geo.startswith("04000US25"):
        return "0400000US" + geo[len("04000US"):]
    return None


def _table_layout(lookup_path: Path) -> dict[str, tuple[str, int]]:
    layout = {}
    for line in lookup_path.read_text(encoding="latin1").splitlines()[1:]:
        parts = [part.strip().strip('"') for part in line.split(",")]
        if len(parts) < 5:
            continue
        table, sequence, line_number, start = parts[1], parts[2], parts[3], parts[4]
        if table in TABLES and line_number == "" and start.isdigit():
            layout[table] = (sequence.zfill(4), int(start))
    missing = [table for table in TABLES if table not in layout]
    if missing:
        raise RuntimeError(f"{lookup_path.name} is missing {missing}")
    return layout


def _geo_logrecno(path: Path) -> dict[str, str]:
    mapping = {}
    with path.open(encoding="latin1", newline="") as handle:
        for row in csv.reader(handle):
            if len(row) < 6 or not (row[4].isdigit() and len(row[4]) == 7):
                continue
            geo = next(
                (
                    cell
                    for cell in row
                    if cell.startswith(("16000US25", "04000US25", "1600000US25", "0400000US25"))
                ),
                None,
            )
            normalized = _normalize_geoid(geo) if geo else None
            if normalized:
                mapping[row[4]] = normalized
    return mapping


def _read_margin_cells(text: str, logrecnos: dict[str, str], positions: dict[str, int]) -> list[dict]:
    rows = []
    wanted = set(logrecnos)
    for line in text.splitlines():
        parts = line.split(",")
        if len(parts) < 6 or parts[5] not in wanted:
            continue
        record = {"GEO_ID": logrecnos[parts[5]]}
        for name, index in positions.items():
            record[name] = _num(parts[index]) if index < len(parts) else None
        rows.append(record)
    return rows


def _sequence_year(year: int) -> pd.DataFrame:
    base = (
        "https://www2.census.gov/programs-surveys/acs/summary_file/"
        f"{year}/data/5_year_seq_by_state/Massachusetts/All_Geographies_Not_Tracts_Block_Groups"
    )
    lookup = _download_first(
        [
            "https://www2.census.gov/programs-surveys/acs/summary_file/"
            f"{year}/documentation/user_tools/ACS_5yr_Seq_Table_Number_Lookup.txt",
            "https://www2.census.gov/programs-surveys/acs/summary_file/"
            f"{year}/documentation/5_year/user_tools/Sequence_Number_and_Table_Number_Lookup.txt",
        ],
        CACHE / f"lookup_{year}.txt",
    )
    geo = _download(f"{base}/g{year}5ma.csv", CACHE / f"g{year}5ma.csv")
    layout = _table_layout(lookup)
    logrecnos = _geo_logrecno(geo)
    frames = []
    for table, (sequence, start) in layout.items():
        positions = {
            f"{table.lower()}_m{line:03d}": start + line - 2
            for line in TABLES[table]["lines"]
        }
        archive = _download(f"{base}/{year}5ma{sequence}000.zip", CACHE / f"{year}_{sequence}.zip")
        with zipfile.ZipFile(archive) as bundle:
            margin_name = next(name for name in bundle.namelist() if name.startswith("m"))
            text = bundle.read(margin_name).decode("latin1")
        frames.append(pd.DataFrame(_read_margin_cells(text, logrecnos, positions)))
        print(f"  {year} {table}: {len(frames[-1])} places")
    merged = frames[0]
    for frame in frames[1:]:
        merged = merged.merge(frame, on="GEO_ID", how="outer")
    merged["year"] = year
    return merged


def _stream_table(year: int, table: str) -> pd.DataFrame:
    url = (
        "https://www2.census.gov/programs-surveys/acs/summary_file/"
        f"{year}/table-based-SF/data/5YRData/acsdt5y{year}-{table.lower()}.dat"
    )
    print(f"  stream {year} {table}")
    columns = [f"{table}_M{line:03d}" for line in TABLES[table]["lines"]]
    rename = {column: f"{table.lower()}_m{column[-3:]}" for column in columns}
    rows = []
    with urllib.request.urlopen(url, timeout=180) as response:
        header = response.readline().decode("latin1").rstrip("\n").split("|")
        indexes = {name: header.index(name) for name in columns}
        for raw in response:
            line = raw.decode("latin1")
            if not (line.startswith("1600000US25") or line.startswith("0400000US25")):
                continue
            parts = line.rstrip("\n").split("|")
            record = {"GEO_ID": parts[0], "year": year}
            for name, index in indexes.items():
                record[rename[name]] = _num(parts[index]) if index < len(parts) else None
            rows.append(record)
    print(f"    {len(rows)} places")
    return pd.DataFrame(rows)


def _table_year(year: int) -> pd.DataFrame:
    frames = [_stream_table(year, table) for table in TABLES]
    merged = frames[0]
    for frame in frames[1:]:
        merged = merged.merge(frame.drop(columns=["year"]), on="GEO_ID", how="outer")
    return merged


def _ratio_moe(numer, denom, moe_numer, moe_denom) -> float | None:
    if any(value is None or (isinstance(value, float) and math.isnan(value)) for value in (numer, denom, moe_numer, moe_denom)):
        return None
    if denom == 0:
        return None
    share = numer / denom
    inside = moe_numer ** 2 - (share ** 2) * (moe_denom ** 2)
    if inside < 0:
        inside = moe_numer ** 2 + (share ** 2) * (moe_denom ** 2)
    return math.sqrt(inside) / abs(denom) * 100


def _sum_moe(values) -> float | None:
    numbers = []
    for value in values:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return None
        numbers.append(value)
    return math.sqrt(sum(number ** 2 for number in numbers))


def _cell(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(pd.NA, index=frame.index, dtype="Float64")
    return pd.to_numeric(frame[column], errors="coerce")


def _build_metrics(margins: pd.DataFrame) -> pd.DataFrame:
    estimates = {
        "fb": pd.read_parquet(PROCESSED / "foreign_born_core.parquet", columns=["GEO_ID", "year", "foreign_born", "total_pop"]),
        "emp": pd.read_parquet(PROCESSED / "employment_income.parquet", columns=["GEO_ID", "year", "employed", "unemployed", "median_household_income"]),
        "edu": pd.read_parquet(PROCESSED / "education.parquet", columns=["GEO_ID", "year", "total_25plus", "bachelors_pct"]),
        "own": pd.read_parquet(PROCESSED / "homeownership.parquet", columns=["GEO_ID", "year", "total_housing_units", "owner_occupied"]),
        "pov": pd.read_parquet(PROCESSED / "poverty_by_nativity.parquet", columns=["GEO_ID", "year", "fb_poverty_universe", "fb_below_poverty"]),
    }
    for frame in estimates.values():
        frame["GEO_ID"] = frame["GEO_ID"].astype(str)
        frame["year"] = frame["year"].astype(int)
    margins["GEO_ID"] = margins["GEO_ID"].astype(str)
    margins["year"] = margins["year"].astype(int)

    records = []

    def add(metric, geo, year, moe):
        if moe is None or (isinstance(moe, float) and (math.isnan(moe) or moe < 0)):
            return
        rounded = round(moe) if metric in {"median_income", "fb_income"} else round(moe, 1)
        records.append({"GEO_ID": geo, "year": int(year), "metric": metric, "moe": rounded})

    fb = estimates["fb"].merge(margins, on=["GEO_ID", "year"], how="inner")
    for row in fb.itertuples(index=False):
        add("fb_pct", row.GEO_ID, row.year, _ratio_moe(row.foreign_born, row.total_pop, getattr(row, "b05002_m013", None), getattr(row, "b05002_m001", None)))

    emp = estimates["emp"].merge(margins, on=["GEO_ID", "year"], how="inner")
    for row in emp.itertuples(index=False):
        labor = None if pd.isna(row.employed) or pd.isna(row.unemployed) else row.employed + row.unemployed
        labor_moe = _sum_moe([getattr(row, "b23025_m004", None), getattr(row, "b23025_m005", None)])
        add("unemployment_rate", row.GEO_ID, row.year, _ratio_moe(row.unemployed, labor, getattr(row, "b23025_m005", None), labor_moe))
        income_moe = getattr(row, "b19013_m001", None)
        add("median_income", row.GEO_ID, row.year, None if pd.isna(income_moe) else float(income_moe))

    edu = estimates["edu"].merge(margins, on=["GEO_ID", "year"], how="inner")
    degree_cols = ["b15002_m015", "b15002_m016", "b15002_m017", "b15002_m018", "b15002_m032", "b15002_m033", "b15002_m034", "b15002_m035"]
    for row in edu.itertuples(index=False):
        if pd.isna(row.bachelors_pct) or pd.isna(row.total_25plus):
            continue
        numer = row.bachelors_pct / 100 * row.total_25plus
        numer_moe = _sum_moe([getattr(row, column, None) for column in degree_cols])
        add("bachelors_pct", row.GEO_ID, row.year, _ratio_moe(numer, row.total_25plus, numer_moe, getattr(row, "b15002_m001", None)))

    own = estimates["own"].merge(margins, on=["GEO_ID", "year"], how="inner")
    for row in own.itertuples(index=False):
        add("homeownership_pct", row.GEO_ID, row.year, _ratio_moe(row.owner_occupied, row.total_housing_units, getattr(row, "b25003_m002", None), getattr(row, "b25003_m001", None)))

    pov = estimates["pov"].merge(margins, on=["GEO_ID", "year"], how="inner")
    for row in pov.itertuples(index=False):
        add("poverty_rate", row.GEO_ID, row.year, _ratio_moe(row.fb_below_poverty, row.fb_poverty_universe, getattr(row, "b05010_m003", None), getattr(row, "b05010_m002", None)))

    income = margins[["GEO_ID", "year", "b06011_m005"]].dropna()
    for row in income.itertuples(index=False):
        add("fb_income", row.GEO_ID, row.year, float(row.b06011_m005))

    return pd.DataFrame(records)


def main():
    frames = []
    for year in SEQ_YEARS:
        print(f"sequence {year}")
        frames.append(_sequence_year(year))
    for year in TABLE_YEARS:
        print(f"table {year}")
        frames.append(_table_year(year))
    margins = pd.concat(frames, ignore_index=True)
    metrics = _build_metrics(margins)
    metrics.to_parquet(OUT, index=False)
    print(f"wrote {len(metrics)} margins -> {OUT}")
    print(metrics.groupby("metric").size())


if __name__ == "__main__":
    main()
