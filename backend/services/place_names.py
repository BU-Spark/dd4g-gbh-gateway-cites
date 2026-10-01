"""Merge Census place names that refer to the same municipality.

Some Massachusetts places change label between ACS releases, for example
"Amesbury Town" in earlier years and "Amesbury" later. Those series do not
overlap, so they can be combined under one name without dropping a year.

A census designated place (CDP) that is much smaller than the municipality
with a similar name is kept as its own series, labeled "(CDP)", so the two
are not treated as duplicates.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

PROCESSED = Path(__file__).parent.parent.parent / "data" / "processed"
_SUFFIXES = (" Town", " City", " CDP")
_POP_RATIO_MIN = 0.7
_POP_RATIO_MAX = 1.4

_aliases: dict[str, str] | None = None


def _stem(name: str) -> str:
    for suffix in _SUFFIXES:
        if name.endswith(suffix):
            return name[: -len(suffix)].strip()
    return name


def _boundary_population_ratio(df: pd.DataFrame, left: str, right: str) -> float | None:
    """Ratio of the later series' first population to the earlier series' last.

    Returns None when the years overlap or a population is missing. Overlap
    would mean the rows are not a simple rename.
    """
    pieces = []
    for name in (left, right):
        sub = df.loc[df["city"] == name, ["year", "total_pop"]].dropna()
        if sub.empty:
            return None
        pieces.append(sub)
    pieces.sort(key=lambda frame: frame["year"].max())
    earlier, later = pieces
    if set(earlier["year"]).intersection(set(later["year"])):
        return None
    earlier_pop = earlier.loc[earlier["year"].idxmax(), "total_pop"]
    later_pop = later.loc[later["year"].idxmin(), "total_pop"]
    if not earlier_pop or not later_pop:
        return None
    return float(later_pop) / float(earlier_pop)


def _is_cdp(df: pd.DataFrame, name: str) -> bool:
    if "NAME" not in df.columns:
        return name.endswith(" CDP")
    labels = df.loc[df["city"] == name, "NAME"].astype(str)
    return bool(labels.str.contains("CDP", na=False).any())


def build_place_aliases(df: pd.DataFrame) -> dict[str, str]:
    grouped: dict[str, list[str]] = {}
    for raw in df["city"].dropna().unique():
        name = str(raw)
        grouped.setdefault(_stem(name), []).append(name)

    aliases: dict[str, str] = {}
    for stem, names in grouped.items():
        unique = sorted(set(names))
        if len(unique) < 2 or "total_pop" not in df.columns:
            continue
        if len(unique) == 2:
            ratio = _boundary_population_ratio(df, unique[0], unique[1])
            if ratio is not None and _POP_RATIO_MIN <= ratio <= _POP_RATIO_MAX:
                preferred = stem if stem in unique else unique[0]
                for name in unique:
                    if name != preferred:
                        aliases[name] = preferred
                continue

        for name in unique:
            if _is_cdp(df, name):
                aliases[name] = f"{stem} (CDP)"
            elif name != stem:
                aliases[name] = stem
    return aliases


def place_aliases() -> dict[str, str]:
    global _aliases
    if _aliases is None:
        master = PROCESSED / "cities_master.parquet"
        if not master.exists():
            _aliases = {}
        else:
            df = pd.read_parquet(master)
            _aliases = build_place_aliases(df) if "city" in df.columns else {}
    return _aliases


def apply_place_aliases(df: pd.DataFrame) -> pd.DataFrame:
    aliases = place_aliases()
    if not aliases or "city" not in df.columns:
        return df
    out = df.copy()
    out["city"] = out["city"].replace(aliases)
    return out
