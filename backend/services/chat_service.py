from typing import Any, Dict, List
import os
from pathlib import Path

from google import genai

from . import data_store
from .rag import RagIndex, retrieve


INDEX_PATH = Path(__file__).parent.parent / "rag_index" / "index.json"

METRIC_HELP = {
  "fb_pct": "Foreign-born share of total population (percent).",
  "unemployment_rate": "Unemployment rate (percent).",
  "median_income": "Median household income (USD).",
  "poverty_rate": "Foreign-born poverty rate (percent).",
  "bachelors_pct": "Share with a bachelor's degree or higher (percent).",
  "homeownership_pct": "Homeownership rate (percent).",
  "fb_income": "Median income for foreign-born (USD).",
}


def _gemini_client() -> genai.Client:
  api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
  if not api_key:
    raise RuntimeError("Missing GEMINI_API_KEY (or GOOGLE_API_KEY).")
  return genai.Client(api_key=api_key)


def _gateway_cities_set() -> set[str]:
  """
  Derive the set of Gateway Cities from the processed cities_master data.
  Falls back to an empty set if the data isn't available.
  """
  try:
    rows = data_store.get_cities_master()
  except Exception:
    rows = []

  # Prefer explicit gateway flag from data if present.
  from_data = {
    r["city"]
    for r in rows
    if isinstance(r.get("city"), str) and r.get("city_type") == "gateway"
  }

  if from_data:
    return from_data

  # Fallback: hard-coded Gateway Cities list aligned with frontend.
  return {
    "Attleboro",
    "Barnstable",
    "Brockton",
    "Chelsea",
    "Chicopee",
    "Everett",
    "Fall River",
    "Fitchburg",
    "Framingham",
    "Haverhill",
    "Holyoke",
    "Lawrence",
    "Leominster",
    "Lowell",
    "Lynn",
    "Malden",
    "Methuen",
    "New Bedford",
    "Peabody",
    "Pittsfield",
    "Quincy",
    "Revere",
    "Salem",
    "Springfield",
    "Taunton",
    "Worcester",
  }


def _find_cities_in_text(text: str) -> List[str]:
  """
  Very simple city-name matcher based on exact substring.
  """
  try:
    cities_master = data_store.get_cities_master()
  except Exception:
    return []

  text_lower = text.lower()
  names = sorted({(row.get("city") or "") for row in cities_master})
  mentioned: List[str] = []
  for name in names:
    n_lower = name.lower()
    if n_lower and n_lower in text_lower:
      mentioned.append(name)
  return mentioned


def _format_pct(v: Any) -> str:
  try:
    return f"{float(v):.1f}%"
  except Exception:
    return "N/A"


def _format_dollar(v: Any) -> str:
  try:
    return f"${int(round(float(v))):,}"
  except Exception:
    return "N/A"


def _foreign_born_trend(city: str) -> Dict[str, Any]:
  rows = data_store.get_time_series(city=city, metric="fb_pct")
  if not rows:
    return {
      "answer": (
        f"I couldn't find a foreign-born time series for {city}. "
        "Try selecting this city in the Trends tab to confirm data availability.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  norm = [
    {
      "city": r.get("city"),
      "year": r.get("year"),
      "metric": r.get("metric"),
      "value": r.get("value"),
    }
    for r in rows
    if r.get("year") is not None and r.get("value") is not None
  ]
  norm = sorted(norm, key=lambda r: r["year"])

  start_year = norm[0]["year"]
  end_year = norm[-1]["year"]
  start_val = norm[0]["value"]
  end_val = norm[-1]["value"]

  if end_val > start_val:
    direction = "increased"
  elif end_val < start_val:
    direction = "decreased"
  else:
    direction = "remained roughly flat"

  answer = (
    f"In {city}, the foreign-born share {direction} from "
    f"{_format_pct(start_val)} in {start_year} to {_format_pct(end_val)} in {end_year}.\n\n"
    "You can see the full year-by-year trend in the chart below.\n\n"
    "Source: American Community Survey 5-year estimates, 2010–2024."
  )

  chart = {
    "type": "time_series",
    "title": f"Foreign-born share in {city}, {start_year}–{end_year}",
    "metric": "fb_pct",
    "city": city,
    "data": norm,
  }

  analysis = {
    "type": "trend",
    "city": city,
    "start_year": start_year,
    "end_year": end_year,
    "start_value": start_val,
    "end_value": end_val,
    "direction": direction,
  }

  return {"answer": answer, "chart": chart, "analysis": analysis}


def _statewide_averages() -> Dict[str, Any]:
  """Compute statewide averages across all places for the latest year."""
  fb_rows = data_store.get_foreign_born()
  emp_rows = data_store.get_employment_income()
  edu_rows = data_store.get_education()
  own_rows = data_store.get_homeownership()
  pov_rows = data_store.get_poverty()
  inc_rows = data_store.get_median_income()

  def _avg(rows, key):
    vals = [r[key] for r in rows if r.get(key) is not None]
    return sum(vals) / len(vals) if vals else None

  return {
    "fb_pct": _avg(fb_rows, "fb_pct"),
    "median_household_income": _avg(emp_rows, "median_household_income"),
    "unemployment_rate": _avg(emp_rows, "unemployment_rate"),
    "bachelors_pct": _avg(edu_rows, "bachelors_pct"),
    "homeownership_pct": _avg(own_rows, "homeownership_pct"),
    "fb_poverty_pct": _avg(pov_rows, "fb_poverty_pct"),
    "median_income_foreign_born": _avg(inc_rows, "median_income_foreign_born"),
  }


def _latest_snapshot(city: str) -> Dict[str, Any]:
  fb_rows = data_store.get_foreign_born(city=city)
  emp_rows = data_store.get_employment_income(city=city)
  edu_rows = data_store.get_education(city=city)
  own_rows = data_store.get_homeownership(city=city)

  fb = fb_rows[0] if fb_rows else {}
  emp = emp_rows[0] if emp_rows else {}
  edu = edu_rows[0] if edu_rows else {}
  own = own_rows[0] if own_rows else {}

  parts = [f"**{city} (latest ACS period)**"]
  if "fb_pct" in fb:
    parts.append(f"Foreign-born share: {_format_pct(fb['fb_pct'])}")
  if "median_household_income" in emp:
    parts.append(
      f"Median household income: {_format_dollar(emp['median_household_income'])}"
    )
  if "unemployment_rate" in emp:
    parts.append(f"Unemployment rate: {_format_pct(emp['unemployment_rate'])}")
  if "bachelors_pct" in edu:
    parts.append(f"Bachelor's degree or higher: {_format_pct(edu['bachelors_pct'])}")
  if "homeownership_pct" in own:
    parts.append(f"Homeownership rate: {_format_pct(own['homeownership_pct'])}")

  answer = "\n".join(parts) + (
    "\n\nSource: American Community Survey 5-year estimates, 2010–2024."
  )

  analysis = {
    "type": "snapshot",
    "city": city,
    "foreign_born_pct": fb.get("fb_pct"),
    "median_household_income": emp.get("median_household_income"),
    "unemployment_rate": emp.get("unemployment_rate"),
    "bachelors_pct": edu.get("bachelors_pct"),
    "homeownership_pct": own.get("homeownership_pct"),
  }

  return {"answer": answer, "chart": None, "analysis": analysis}


def _top_origins(city: str) -> Dict[str, Any]:
  rows = data_store.get_country_of_origin(city=city)
  rows = [r for r in rows if r.get("estimate") is not None]
  rows.sort(key=lambda r: r["estimate"], reverse=True)
  top = rows[:5]

  if not top:
    return {
      "answer": (
        f"I couldn't find detailed country-of-origin data for {city}.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  lines = [f"Top foreign-born origins in {city} (latest ACS period):"]
  total = sum(r["estimate"] for r in top)
  for r in top:
    pct = (r["estimate"] / total) * 100 if total else 0
    country = (r.get("country") or "").rstrip(":")
    lines.append(f"- {country}: {r['estimate']:,} ({pct:.1f}% of top 5)")

  answer = "\n".join(lines) + (
    "\n\nSource: American Community Survey 5-year estimates, 2010–2024."
  )
  analysis = {
    "type": "origins",
    "city": city,
    "top5": top,
  }
  return {"answer": answer, "chart": None, "analysis": analysis}


def _lowest_poverty_cities(limit: int = 5) -> Dict[str, Any]:
  """
  Find Gateway Cities with the lowest foreign-born poverty rates using
  the time-series metric 'poverty_rate' (fb_poverty_pct).
  """
  rows = data_store.get_time_series(metric="poverty_rate")
  if not rows:
    return {
      "answer": (
        "I couldn't find foreign-born poverty rate data across Gateway Cities. "
        "Try focusing on a specific city in the dashboard.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  gateway = _gateway_cities_set()

  latest_by_city: dict[str, Dict[str, Any]] = {}
  for r in rows:
    city = r.get("city")
    year = r.get("year")
    if not city or year is None:
      continue
    if gateway and city not in gateway:
      continue
    prev = latest_by_city.get(city)
    if prev is None or year > prev.get("year", -1):
      latest_by_city[city] = r

  clean = [
    (city, r["year"], r.get("value"))
    for city, r in latest_by_city.items()
    if r.get("value") is not None
  ]
  if not clean:
    return {
      "answer": (
        "I couldn't find usable foreign-born poverty rates for Gateway Cities.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  clean.sort(key=lambda x: x[2])  # sort by poverty rate ascending
  top = clean[: max(1, limit)]

  lines = [
    "Gateway Cities with the lowest foreign-born poverty rates (latest ACS period):"
  ]
  for city, year, value in top:
    lines.append(f"- {city} ({year}): {_format_pct(value)}")

  answer = "\n".join(lines) + (
    "\n\nSource: American Community Survey 5-year estimates, 2010–2024."
  )
  analysis = {
    "type": "poverty_ranking",
    "cities": [
      {"city": city, "year": year, "poverty_rate": value} for city, year, value in top
    ],
  }
  return {"answer": answer, "chart": None, "analysis": analysis}


def _greatest_fb_growth(limit: int = 5) -> Dict[str, Any]:
  """
  Find Gateway Cities with the greatest foreign-born population growth,
  reporting both percentage-point change and absolute change.
  """
  rows = data_store.get_time_series(metric="fb_pct")
  if not rows:
    return {
      "answer": (
        "I couldn't find foreign-born time-series data to compute growth.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  gateway = _gateway_cities_set()

  # Group rows by city, keeping earliest and latest year
  from collections import defaultdict
  by_city: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
  for r in rows:
    city = r.get("city")
    if not city or r.get("year") is None or r.get("value") is None:
      continue
    if gateway and city not in gateway:
      continue
    by_city[city].append(r)

  # Also get absolute foreign-born counts from foreign_born_core
  try:
    import pandas as pd
    from pathlib import Path
    fb_df = pd.read_parquet(
      Path(__file__).parent.parent.parent / "data" / "processed" / "foreign_born_core.parquet"
    )
    fb_df = fb_df[fb_df["city"].isin(gateway)] if gateway else fb_df
  except Exception:
    fb_df = None

  pct_growth: List[tuple] = []
  abs_growth: List[tuple] = []

  for city, city_rows in by_city.items():
    sorted_rows = sorted(city_rows, key=lambda r: r["year"])
    start_val = sorted_rows[0]["value"]
    end_val = sorted_rows[-1]["value"]
    start_year = sorted_rows[0]["year"]
    end_year = sorted_rows[-1]["year"]
    pp_change = end_val - start_val
    pct_growth.append((city, start_year, end_year, start_val, end_val, pp_change))

    # Absolute growth from the parquet
    if fb_df is not None:
      city_fb = fb_df[fb_df["city"] == city].sort_values("year")
      if len(city_fb) >= 2:
        fb_start = city_fb.iloc[0]["foreign_born"]
        fb_end = city_fb.iloc[-1]["foreign_born"]
        yr_start = int(city_fb.iloc[0]["year"])
        yr_end = int(city_fb.iloc[-1]["year"])
        if pd.notna(fb_start) and pd.notna(fb_end):
          abs_growth.append((city, yr_start, yr_end, int(fb_start), int(fb_end), int(fb_end - fb_start)))

  # Sort descending by growth
  pct_growth.sort(key=lambda x: x[5], reverse=True)
  abs_growth.sort(key=lambda x: x[5], reverse=True)

  top_pct = pct_growth[:limit]
  top_abs = abs_growth[:limit]

  lines = ["**Gateway Cities with greatest foreign-born population growth:**\n"]
  lines.append("*By percentage-point increase:*")
  for city, sy, ey, sv, ev, change in top_pct:
    lines.append(f"- {city}: {_format_pct(sv)} ({sy}) → {_format_pct(ev)} ({ey}), +{change:.1f} pp")

  if top_abs:
    lines.append("\n*By absolute population increase:*")
    for city, sy, ey, fb_s, fb_e, change in top_abs:
      lines.append(f"- {city}: {fb_s:,} ({sy}) → {fb_e:,} ({ey}), +{change:,}")

  answer = "\n".join(lines) + (
    "\n\nSource: American Community Survey 5-year estimates, 2010–2024."
  )

  analysis = {
    "type": "fb_growth_ranking",
    "top_by_pct_point": [
      {"city": c, "start_year": sy, "end_year": ey, "start_pct": sv, "end_pct": ev, "pp_change": ch}
      for c, sy, ey, sv, ev, ch in top_pct
    ],
    "top_by_absolute": [
      {"city": c, "start_year": sy, "end_year": ey, "start_count": fs, "end_count": fe, "abs_change": ch}
      for c, sy, ey, fs, fe, ch in top_abs
    ],
  }

  return {"answer": answer, "chart": None, "analysis": analysis}


def _city_profile_with_comparison(city: str) -> Dict[str, Any]:
  """
  Full city profile: foreign-born rates + per-capita metrics compared to
  statewide averages.
  """
  import pandas as pd
  from pathlib import Path

  PROC = Path(__file__).parent.parent.parent / "data" / "processed"

  fb_rows = data_store.get_foreign_born(city=city)
  emp_rows = data_store.get_employment_income(city=city)
  edu_rows = data_store.get_education(city=city)
  own_rows = data_store.get_homeownership(city=city)
  pov_rows = data_store.get_poverty(city=city)
  inc_rows = data_store.get_median_income(city=city)

  fb = fb_rows[0] if fb_rows else {}
  emp = emp_rows[0] if emp_rows else {}
  edu = edu_rows[0] if edu_rows else {}
  own = own_rows[0] if own_rows else {}
  pov = pov_rows[0] if pov_rows else {}
  inc = inc_rows[0] if inc_rows else {}

  state_avg = _statewide_averages()

  def _compare(label, city_val, state_val, fmt="pct"):
    if city_val is None:
      return None
    if fmt == "pct":
      cv, sv = _format_pct(city_val), _format_pct(state_val) if state_val else "N/A"
    else:
      cv, sv = _format_dollar(city_val), _format_dollar(state_val) if state_val else "N/A"
    return f"- {label}: {cv} (statewide avg: {sv})"

  # Trend data
  ts = data_store.get_time_series(city=city, metric="fb_pct")
  ts = sorted(ts, key=lambda r: r.get("year", 0))

  parts = [f"**{city} — City Profile (latest ACS period)**\n"]

  # Foreign-born section
  parts.append("*Foreign-born population:*")
  if fb.get("foreign_born") is not None and fb.get("total_pop"):
    parts.append(f"- Total population: {int(fb['total_pop']):,}")
    parts.append(f"- Foreign-born: {int(fb['foreign_born']):,}")
  line = _compare("Foreign-born share", fb.get("fb_pct"), state_avg.get("fb_pct"))
  if line:
    parts.append(line)
  if fb.get("fb_naturalized_pct") is not None:
    parts.append(f"- Naturalized citizens: {_format_pct(fb['fb_naturalized_pct'])}")
  if fb.get("fb_not_citizen_pct") is not None:
    parts.append(f"- Not a citizen: {_format_pct(fb['fb_not_citizen_pct'])}")

  if ts and len(ts) >= 2:
    sy, ey = ts[0], ts[-1]
    direction = "increased" if ey["value"] > sy["value"] else "decreased" if ey["value"] < sy["value"] else "remained flat"
    parts.append(f"- Trend: {direction} from {_format_pct(sy['value'])} ({sy['year']}) to {_format_pct(ey['value'])} ({ey['year']})")

  # Economic indicators
  parts.append("\n*Economic indicators:*")
  line = _compare("Median household income", emp.get("median_household_income"), state_avg.get("median_household_income"), "dollar")
  if line:
    parts.append(line)
  line = _compare("Foreign-born median income", inc.get("median_income_foreign_born"), state_avg.get("median_income_foreign_born"), "dollar")
  if line:
    parts.append(line)
  line = _compare("Unemployment rate", emp.get("unemployment_rate"), state_avg.get("unemployment_rate"))
  if line:
    parts.append(line)
  line = _compare("Foreign-born poverty rate", pov.get("fb_poverty_pct"), state_avg.get("fb_poverty_pct"))
  if line:
    parts.append(line)

  parts.append("\n*Education & housing:*")
  line = _compare("Bachelor's degree+", edu.get("bachelors_pct"), state_avg.get("bachelors_pct"))
  if line:
    parts.append(line)
  line = _compare("Homeownership rate", own.get("homeownership_pct"), state_avg.get("homeownership_pct"))
  if line:
    parts.append(line)

  answer = "\n".join(parts) + "\n\nSource: American Community Survey 5-year estimates, 2010–2024."

  analysis = {
    "type": "city_profile",
    "city": city,
    "foreign_born_pct": fb.get("fb_pct"),
    "foreign_born_count": fb.get("foreign_born"),
    "total_pop": fb.get("total_pop"),
    "median_household_income": emp.get("median_household_income"),
    "median_income_foreign_born": inc.get("median_income_foreign_born"),
    "unemployment_rate": emp.get("unemployment_rate"),
    "fb_poverty_pct": pov.get("fb_poverty_pct"),
    "bachelors_pct": edu.get("bachelors_pct"),
    "homeownership_pct": own.get("homeownership_pct"),
    "statewide_avg": state_avg,
  }

  chart = None
  if ts and len(ts) >= 2:
    chart = {
      "type": "time_series",
      "title": f"Foreign-born share in {city}",
      "metric": "fb_pct",
      "city": city,
      "data": ts,
    }

  return {"answer": answer, "chart": chart, "analysis": analysis}


def _granular_origins(city: str) -> Dict[str, Any]:
  """
  Full granular breakdown of foreign-born populations by specific country,
  grouped by region. Goes beyond top-level categories.
  """
  rows = data_store.get_country_of_origin(city=city)
  rows = [r for r in rows if r.get("estimate") is not None and r.get("estimate") > 0]
  rows.sort(key=lambda r: r["estimate"], reverse=True)

  if not rows:
    return {
      "answer": (
        f"I couldn't find detailed country-of-origin data for {city}.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  total_fb = sum(r["estimate"] for r in rows)
  top = rows[:15]

  lines = [f"**Foreign-born population in {city} by country of origin (latest ACS):**\n"]
  lines.append(f"Total foreign-born with country data: {total_fb:,}\n")

  # Group top entries by region
  from collections import defaultdict
  by_region: Dict[str, List] = defaultdict(list)
  for r in rows:
    region = (r.get("region") or "Other").rstrip(":")
    by_region[region].append(r)

  # Show top 15 individual countries first
  lines.append("*Top 15 countries:*")
  for r in top:
    country = (r.get("country") or "").rstrip(":")
    pct = (r["estimate"] / total_fb * 100) if total_fb else 0
    lines.append(f"- {country}: {r['estimate']:,} ({pct:.1f}%)")

  # Then show regional breakdown
  lines.append("\n*By region:*")
  region_totals = [(reg, sum(r["estimate"] for r in rlist)) for reg, rlist in by_region.items()]
  region_totals.sort(key=lambda x: x[1], reverse=True)
  for reg, tot in region_totals[:8]:
    pct = (tot / total_fb * 100) if total_fb else 0
    top_countries = sorted(by_region[reg], key=lambda r: r["estimate"], reverse=True)[:3]
    country_names = ", ".join((r.get("country") or "").rstrip(":") for r in top_countries)
    lines.append(f"- {reg}: {tot:,} ({pct:.1f}%) — top: {country_names}")

  answer = "\n".join(lines) + "\n\nSource: American Community Survey 5-year estimates, 2010–2024."

  analysis = {
    "type": "granular_origins",
    "city": city,
    "total_foreign_born": total_fb,
    "top15": [{
      "country": (r.get("country") or "").rstrip(":"),
      "estimate": r["estimate"],
      "region": r.get("region"),
      "pct_of_total": round(r["estimate"] / total_fb * 100, 1) if total_fb else 0,
    } for r in top],
  }

  return {"answer": answer, "chart": None, "analysis": analysis}


def _fastest_growing_subgroups(city: str = None, limit: int = 10) -> Dict[str, Any]:
  """
  Find the fastest-growing foreign-born subgroups (by country) across
  Gateway Cities, comparing earliest vs latest year in country_of_origin data.
  """
  import pandas as pd
  from pathlib import Path

  PROC = Path(__file__).parent.parent.parent / "data" / "processed"
  df = pd.read_parquet(PROC / "country_of_origin.parquet")

  # Filter out region labels
  df = df[
    ~df["country"].str.endswith(":") &
    ~df["country"].str.startswith("Other ") &
    ~df["country"].str.contains(", n.e.c.", regex=False)
  ]

  gateway = _gateway_cities_set()
  if city:
    df = df[df["city"] == city]
  elif gateway:
    df = df[df["city"].isin(gateway)]

  df["estimate"] = pd.to_numeric(df["estimate"], errors="coerce")
  df = df.dropna(subset=["estimate", "year"])

  min_year = int(df["year"].min())
  max_year = int(df["year"].max())

  early = df[df["year"] == min_year][["city", "country", "estimate"]].rename(columns={"estimate": "early_est"})
  late = df[df["year"] == max_year][["city", "country", "estimate"]].rename(columns={"estimate": "late_est"})

  merged = early.merge(late, on=["city", "country"], how="outer").fillna(0)
  merged["abs_change"] = merged["late_est"] - merged["early_est"]
  # Only consider subgroups with at least 50 people in the latest year
  merged = merged[merged["late_est"] >= 50]
  merged = merged.sort_values("abs_change", ascending=False)

  top = merged.head(limit)

  if top.empty:
    scope = city if city else "Gateway Cities"
    return {
      "answer": f"I couldn't find enough multi-year country-of-origin data for {scope}.\n\n"
                "Source: American Community Survey 5-year estimates, 2010–2024.",
      "chart": None,
    }

  scope = city if city else "Gateway Cities"
  lines = [f"**Fastest-growing foreign-born subgroups in {scope} ({min_year}–{max_year}):**\n"]

  entries = []
  for _, row in top.iterrows():
    c = row["city"]
    country = row["country"]
    e_early = int(row["early_est"])
    e_late = int(row["late_est"])
    change = int(row["abs_change"])
    pct_change = ((e_late - e_early) / e_early * 100) if e_early > 0 else float("inf")
    label = f"{country} in {c}" if not city else country
    if pct_change == float("inf"):
      lines.append(f"- {label}: {e_early:,} → {e_late:,} (+{change:,}, new group)")
    else:
      lines.append(f"- {label}: {e_early:,} → {e_late:,} (+{change:,}, +{pct_change:.0f}%)")
    entries.append({
      "city": c, "country": country,
      "early_est": e_early, "late_est": e_late,
      "abs_change": change,
    })

  answer = "\n".join(lines) + "\n\nSource: American Community Survey 5-year estimates, 2010–2024."

  analysis = {
    "type": "fastest_growing_subgroups",
    "scope": scope,
    "start_year": min_year,
    "end_year": max_year,
    "entries": entries,
  }

  return {"answer": answer, "chart": None, "analysis": analysis}


def _economic_assimilation(city: str) -> Dict[str, Any]:
  """
  Economic assimilation indicators for foreign-born populations in a city:
  income by nativity, homeownership, education, employment.
  """
  fb_rows = data_store.get_foreign_born(city=city)
  emp_rows = data_store.get_employment_income(city=city)
  edu_rows = data_store.get_education(city=city)
  own_rows = data_store.get_homeownership(city=city)
  pov_rows = data_store.get_poverty(city=city)
  inc_rows = data_store.get_median_income(city=city)

  fb = fb_rows[0] if fb_rows else {}
  emp = emp_rows[0] if emp_rows else {}
  edu = edu_rows[0] if edu_rows else {}
  own = own_rows[0] if own_rows else {}
  pov = pov_rows[0] if pov_rows else {}
  inc = inc_rows[0] if inc_rows else {}

  state_avg = _statewide_averages()

  parts = [f"**Economic assimilation indicators for foreign-born in {city}:**\n"]

  # Income
  parts.append("*Income:*")
  if inc.get("median_income_total") is not None:
    parts.append(f"- Overall median income: {_format_dollar(inc['median_income_total'])}")
  if inc.get("median_income_foreign_born") is not None:
    parts.append(f"- Foreign-born median income: {_format_dollar(inc['median_income_foreign_born'])}")
    if inc.get("median_income_total"):
      gap = float(inc["median_income_foreign_born"]) - float(inc["median_income_total"])
      gap_pct = (gap / float(inc["median_income_total"])) * 100 if float(inc["median_income_total"]) else 0
      direction = "above" if gap >= 0 else "below"
      parts.append(f"  → {abs(gap_pct):.1f}% {direction} overall median")
  if emp.get("median_household_income") is not None:
    parts.append(f"- Median household income: {_format_dollar(emp['median_household_income'])}")

  # Employment
  parts.append("\n*Employment:*")
  if emp.get("unemployment_rate") is not None:
    parts.append(f"- Unemployment rate: {_format_pct(emp['unemployment_rate'])} (statewide: {_format_pct(state_avg.get('unemployment_rate'))})")

  # Poverty
  parts.append("\n*Poverty:*")
  if pov.get("fb_poverty_pct") is not None:
    parts.append(f"- Foreign-born poverty rate: {_format_pct(pov['fb_poverty_pct'])} (statewide: {_format_pct(state_avg.get('fb_poverty_pct'))})")

  # Education
  parts.append("\n*Educational attainment:*")
  if edu.get("bachelors_pct") is not None:
    parts.append(f"- Bachelor's degree+: {_format_pct(edu['bachelors_pct'])} (statewide: {_format_pct(state_avg.get('bachelors_pct'))})")
  if edu.get("advanced_pct") is not None:
    parts.append(f"- Advanced degree: {_format_pct(edu['advanced_pct'])}")

  # Housing
  parts.append("\n*Housing:*")
  if own.get("homeownership_pct") is not None:
    parts.append(f"- Homeownership rate: {_format_pct(own['homeownership_pct'])} (statewide: {_format_pct(state_avg.get('homeownership_pct'))})")
  if fb.get("fb_naturalized_pct") is not None:
    parts.append(f"- Naturalization rate: {_format_pct(fb['fb_naturalized_pct'])}")

  answer = "\n".join(parts) + "\n\nSource: American Community Survey 5-year estimates, 2010–2024."

  analysis = {
    "type": "economic_assimilation",
    "city": city,
    "median_income_total": inc.get("median_income_total"),
    "median_income_foreign_born": inc.get("median_income_foreign_born"),
    "median_household_income": emp.get("median_household_income"),
    "unemployment_rate": emp.get("unemployment_rate"),
    "fb_poverty_pct": pov.get("fb_poverty_pct"),
    "bachelors_pct": edu.get("bachelors_pct"),
    "homeownership_pct": own.get("homeownership_pct"),
    "fb_naturalized_pct": fb.get("fb_naturalized_pct"),
    "statewide_avg": state_avg,
  }

  return {"answer": answer, "chart": None, "analysis": analysis}


def _economic_integration_ranking(limit: int = 5) -> Dict[str, Any]:
  """
  Rank Gateway Cities by strongest indicators of economic integration
  over time: improvement in income, homeownership, education, lower poverty.
  """
  gateway = _gateway_cities_set()
  metrics = {
    "median_income": ("Median income", True),
    "homeownership_pct": ("Homeownership", True),
    "bachelors_pct": ("Bachelor's degree+", True),
    "poverty_rate": ("FB poverty rate", False),
  }

  results: Dict[str, Dict[str, float]] = {}

  for metric_key, (label, higher_is_better) in metrics.items():
    rows = data_store.get_time_series(metric=metric_key)
    if not rows:
      continue
    from collections import defaultdict
    by_city: Dict[str, List] = defaultdict(list)
    for r in rows:
      c = r.get("city")
      if not c or c not in gateway or r.get("value") is None:
        continue
      by_city[c].append(r)

    for c, crows in by_city.items():
      crows.sort(key=lambda r: r["year"])
      if len(crows) < 2:
        continue
      start_v = crows[0]["value"]
      end_v = crows[-1]["value"]
      if start_v is None or end_v is None:
        continue
      change = end_v - start_v
      if not higher_is_better:
        change = -change  # flip so positive = improvement
      if c not in results:
        results[c] = {}
      results[c][metric_key] = change

  if not results:
    return {
      "answer": "I couldn't compute economic integration trends for Gateway Cities.\n\n"
                "Source: American Community Survey 5-year estimates, 2010–2024.",
      "chart": None,
    }

  # Composite score: average of normalized improvements across metrics
  all_changes: Dict[str, List[float]] = {mk: [] for mk in metrics}
  for c, changes in results.items():
    for mk, v in changes.items():
      all_changes[mk].append(v)

  # Simple ranking by number of metrics where the city improved the most
  scores: List[tuple] = []
  for c, changes in results.items():
    rank_sum = 0
    count = 0
    for mk in metrics:
      if mk in changes:
        all_vals = sorted(all_changes[mk], reverse=True)
        try:
          rank_sum += all_vals.index(changes[mk]) + 1
        except ValueError:
          pass
        count += 1
    avg_rank = rank_sum / count if count else 999
    scores.append((c, avg_rank, changes))

  scores.sort(key=lambda x: x[1])
  top = scores[:limit]

  lines = ["**Gateway Cities with strongest economic integration over time:**\n"]
  for c, avg_rank, changes in top:
    detail_parts = []
    for mk, (label, hib) in metrics.items():
      if mk in changes:
        raw = changes[mk]
        if mk == "median_income":
          detail_parts.append(f"{label}: {'+' if raw >= 0 else ''}{_format_dollar(abs(raw))}")
        else:
          detail_parts.append(f"{label}: {'+' if raw >= 0 else ''}{raw:.1f} pp")
    lines.append(f"- **{c}** — {'; '.join(detail_parts)}")

  answer = "\n".join(lines) + "\n\nSource: American Community Survey 5-year estimates, 2010–2024."

  analysis = {
    "type": "economic_integration_ranking",
    "cities": [{
      "city": c,
      "avg_rank": round(avg_rank, 1),
      "changes": changes,
    } for c, avg_rank, changes in top],
  }

  return {"answer": answer, "chart": None, "analysis": analysis}


def _compare_cities(cities_to_compare: List[str]) -> Dict[str, Any]:
  """
  Compare multiple cities side-by-side across key metrics.
  Automatically includes statewide averages.
  """
  gateway = _gateway_cities_set()
  state_avg = _statewide_averages()

  rows_data = []
  for city in cities_to_compare:
    fb = (data_store.get_foreign_born(city=city) or [{}])[0]
    emp = (data_store.get_employment_income(city=city) or [{}])[0]
    edu = (data_store.get_education(city=city) or [{}])[0]
    own = (data_store.get_homeownership(city=city) or [{}])[0]
    pov = (data_store.get_poverty(city=city) or [{}])[0]
    inc = (data_store.get_median_income(city=city) or [{}])[0]

    is_gw = city in gateway
    rows_data.append({
      "city": city,
      "type": "Gateway" if is_gw else "Comparison",
      "fb_pct": fb.get("fb_pct"),
      "foreign_born": fb.get("foreign_born"),
      "total_pop": fb.get("total_pop"),
      "median_household_income": emp.get("median_household_income"),
      "median_income_fb": inc.get("median_income_foreign_born"),
      "unemployment_rate": emp.get("unemployment_rate"),
      "fb_poverty_pct": pov.get("fb_poverty_pct"),
      "bachelors_pct": edu.get("bachelors_pct"),
      "homeownership_pct": own.get("homeownership_pct"),
    })

  if not rows_data:
    return {
      "answer": "I couldn't find data for the requested cities.\n\n"
                "Source: American Community Survey 5-year estimates, 2010–2024.",
      "chart": None,
    }

  lines = ["**City comparison (latest ACS period):**\n"]
  lines.append("| Metric | " + " | ".join(r["city"] for r in rows_data) + " | Statewide Avg |")
  lines.append("| --- | " + " | ".join("---" for _ in rows_data) + " | --- |")

  metric_rows = [
    ("Foreign-born %", "fb_pct", "pct", state_avg.get("fb_pct")),
    ("Median HH Income", "median_household_income", "dollar", state_avg.get("median_household_income")),
    ("FB Median Income", "median_income_fb", "dollar", state_avg.get("median_income_foreign_born")),
    ("Unemployment", "unemployment_rate", "pct", state_avg.get("unemployment_rate")),
    ("FB Poverty Rate", "fb_poverty_pct", "pct", state_avg.get("fb_poverty_pct")),
    ("Bachelor's+", "bachelors_pct", "pct", state_avg.get("bachelors_pct")),
    ("Homeownership", "homeownership_pct", "pct", state_avg.get("homeownership_pct")),
  ]

  for label, key, fmt, state_val in metric_rows:
    cells = []
    for r in rows_data:
      v = r.get(key)
      if v is None:
        cells.append("N/A")
      elif fmt == "pct":
        cells.append(_format_pct(v))
      else:
        cells.append(_format_dollar(v))
    sv = _format_pct(state_val) if fmt == "pct" else _format_dollar(state_val) if state_val else "N/A"
    lines.append(f"| {label} | " + " | ".join(cells) + f" | {sv} |")

  answer = "\n".join(lines) + "\n\nSource: American Community Survey 5-year estimates, 2010–2024."

  analysis = {
    "type": "city_comparison",
    "cities": rows_data,
    "statewide_avg": state_avg,
  }

  return {"answer": answer, "chart": None, "analysis": analysis}


def _lowest_foreign_born_cities(limit: int = 5) -> Dict[str, Any]:
  """
  Find Gateway Cities with the lowest foreign-born share (fb_pct) using the
  latest available year from foreign_born_core.
  """
  rows = data_store.get_foreign_born()
  if not rows:
    return {
      "answer": (
        "I couldn't find foreign-born share data across Massachusetts places.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  gateway = _gateway_cities_set()
  latest_by_city: dict[str, Dict[str, Any]] = {}

  for r in rows:
    city = r.get("city")
    year = r.get("year")
    if not city or year is None:
      continue
    if gateway and city not in gateway:
      continue
    prev = latest_by_city.get(city)
    if prev is None or year > prev.get("year", -1):
      latest_by_city[city] = r

  clean = [
    (city, r.get("year"), r.get("fb_pct"))
    for city, r in latest_by_city.items()
    if r.get("fb_pct") is not None
  ]
  if not clean:
    return {
      "answer": (
        "I couldn't find usable foreign-born shares for Gateway Cities.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
    }

  # Sort ascending by foreign-born share
  clean.sort(key=lambda x: x[2])
  top = clean[: max(1, limit)]

  lines = ["Gateway Cities with the lowest foreign-born share (latest ACS period):"]
  for city, year, value in top:
    lines.append(f"- {city} ({year}): {_format_pct(value)}")

  answer = "\n".join(lines) + (
    "\n\nSource: American Community Survey 5-year estimates, 2010–2024."
  )
  analysis = {
    "type": "fb_lowest_ranking",
    "cities": [
      {"city": city, "year": year, "fb_pct": value} for city, year, value in top
    ],
  }
  return {"answer": answer, "chart": None, "analysis": analysis}


def _offline_chat(message: str) -> Dict[str, Any]:
  """
  Deterministic intent + analysis without LLM.
  """
  text = (message or "").strip()
  if not text:
    return {
      "answer": "Please enter a question about Massachusetts Gateway Cities.",
      "chart": None,
    }

  lower = text.lower()
  cities = _find_cities_in_text(lower)

  # ── 1) Comparison questions (Boston, Cambridge, statewide, compare) ──
  comparison_keywords = ["compare", "comparison", "vs", "versus", "compared to"]
  comparison_cities_map = {
    "boston": "Boston",
    "cambridge": "Cambridge",
    "weymouth": "Weymouth Town",
    "marlborough": "Marlborough",
    "somerville": "Somerville",
  }
  if any(kw in lower for kw in comparison_keywords) or (
    "how do" in lower and "gateway" in lower
  ):
    # Build list of cities to compare
    compare_list = []
    # Add any explicitly mentioned cities
    for kw, cname in comparison_cities_map.items():
      if kw in lower:
        compare_list.append(cname)
    # If no specific comparison cities, use defaults
    if not compare_list:
      compare_list = ["Boston", "Cambridge", "Marlborough"]
    # Add a few representative Gateway Cities
    gateway = _gateway_cities_set()
    gw_sample = sorted(gateway)[:5]  # first 5 alphabetically
    # If user mentioned specific gateway cities, use those
    gw_mentioned = [c for c in cities if c in gateway]
    if gw_mentioned:
      gw_sample = gw_mentioned
    all_cities = gw_sample + [c for c in compare_list if c not in gw_sample]
    return _compare_cities(all_cities)

  # ── 2) Economic assimilation / integration questions ──
  econ_keywords = ["economic", "assimilation", "integration", "income by nativity",
                   "housing pattern", "economic indicator"]
  if any(kw in lower for kw in econ_keywords):
    # If asking about ranking/strongest integration across cities
    if any(kw in lower for kw in ["strongest", "which cities", "which city",
                                   "ranking", "best", "most integrated"]):
      return _economic_integration_ranking()
    # If a specific city is mentioned
    if cities:
      return _economic_assimilation(cities[0])
    # Default: ranking
    return _economic_integration_ranking()

  # ── 3) Fastest-growing subgroups ──
  if ("fastest" in lower or "growing" in lower or "growth" in lower) and (
    "subgroup" in lower or "country" in lower or "origin" in lower
    or "vietnamese" in lower or "brazilian" in lower or "dominican" in lower
    or "chinese" in lower or "indian" in lower
  ):
    if cities:
      return _fastest_growing_subgroups(city=cities[0])
    return _fastest_growing_subgroups()

  # ── 4) City profile / "how has ... changed" questions ──
  if cities and (
    "profile" in lower or "how has" in lower or "changed" in lower
    or "overview" in lower or ("population" in lower and "change" in lower)
  ):
    return _city_profile_with_comparison(cities[0])

  # ── 5) Trend questions ──
  if cities and ("trend" in lower or "over time" in lower or "since" in lower):
    city = cities[0]
    return _foreign_born_trend(city)

  # ── 6) Granular country-of-origin (breakdown, specific countries) ──
  granular_keywords = ["breakdown", "granular", "specific country", "by country",
                       "chinese", "vietnamese", "indian", "filipino", "korean",
                       "brazilian", "dominican", "guatemalan", "colombian",
                       "haitian", "salvadoran"]
  if any(kw in lower for kw in granular_keywords):
    if cities:
      return _granular_origins(cities[0])
    # If asking about origin/breakdown across all gateway cities
    if "origin" in lower or "breakdown" in lower:
      # Pick a representative gateway city or show the ask
      gateway = _gateway_cities_set()
      # Return for all gateway cities – pick the one most asked about
      return _fastest_growing_subgroups()

  # ── 7) Country-of-origin (simple) ──
  if cities and ("origin" in lower or "origins" in lower or "country" in lower
                 or "where" in lower):
    city = cities[0]
    return _granular_origins(city)

  # ── 8) Poverty ranking ──
  if ("poverty" in lower or "poor" in lower) and (
    "lowest" in lower or "low" in lower
  ):
    return _lowest_poverty_cities()

  # ── 9) Lowest foreign-born share ──
  if ("foreign-born" in lower or "foreign born" in lower) and (
    "lowest" in lower or "low" in lower
  ):
    return _lowest_foreign_born_cities()

  # ── 10) Foreign-born growth across Gateway Cities ──
  if ("foreign-born" in lower or "foreign born" in lower or "immigrant" in lower) and (
    "growth" in lower or "increase" in lower or "grew" in lower or "rising" in lower
    or "fastest" in lower or "greatest" in lower or "most" in lower
  ):
    return _greatest_fb_growth()

  # ── 11) "How has foreign-born population changed in each gateway city" ──
  if ("how" in lower and ("changed" in lower or "change" in lower)) and (
    "foreign" in lower or "immigrant" in lower
  ) and ("gateway" in lower or "each" in lower):
    return _greatest_fb_growth()

  # ── 12) Census tract question (acknowledge limitation) ──
  if "census tract" in lower or "tract level" in lower or "tract-level" in lower:
    return {
      "answer": (
        "Census tract-level data within cities is not currently available in this dashboard. "
        "The ACS data here covers place-level (city/town) geography. "
        "For sub-city analysis, consider using data.census.gov or NHGIS to download "
        "tract-level ACS tables (e.g., B05001 for nativity) for specific cities.\n\n"
        "Source: American Community Survey 5-year estimates, 2010–2024."
      ),
      "chart": None,
      "analysis": {"type": "limitation", "topic": "census_tract"},
    }

  # ── 13) Single-city snapshot (default for city mention) ──
  if cities:
    city = cities[0]
    return _city_profile_with_comparison(city)

  # ── 14) General overview: top foreign-born cities ──
  fb_rows = data_store.get_foreign_born()
  if fb_rows:
    avg = sum((r.get("fb_pct") or 0) for r in fb_rows) / max(len(fb_rows), 1)
    top = sorted(
      fb_rows,
      key=lambda r: (r.get("fb_pct") or 0),
      reverse=True,
    )[:5]
    lines = [
      f"Across {len(fb_rows)} Massachusetts places, the average foreign-born share is {_format_pct(avg)}.",
      "Top 5 by foreign-born share:",
    ]
    for r in top:
      lines.append(f"- {r.get('city')}: {_format_pct(r.get('fb_pct'))}")
    lines.append(
      "\nSource: American Community Survey 5-year estimates, 2010–2024."
    )
    return {"answer": "\n".join(lines), "chart": None}

  # Fallback.
  return {
    "answer": (
      "I couldn't load the ACS data. Please make sure the backend can read "
      "the processed parquet files in data/processed."
    ),
    "chart": None,
  }


def _llm_rewrite(message: str, base_answer: str, analysis: Dict[str, Any]) -> str:
  """
  Uses Gemini to rewrite/expand the deterministic answer in a more natural way,
  without changing any numeric values.
  """
  try:
    client = _gemini_client()
  except Exception:
    return base_answer

  model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

  # Retrieve RAG context about metrics / tools / project rules.
  try:
    index = RagIndex(INDEX_PATH)
    docs = retrieve(index=index, query=message, metric_help=METRIC_HELP, k=4)
    rag_context = "\n\n".join(f"[{d.id}]\n{d.text}" for d in docs)
  except Exception:
    rag_context = ""

  system = (
    "You are helping Massachusetts journalists interpret ACS data about Gateway Cities.\n"
    "You are given:\n"
    "- The user's original question.\n"
    "- A structured analysis dictionary (JSON).\n"
    "- A baseline answer string.\n\n"
    "You may also see RAG context describing the available metrics and tools.\n\n"
    "Rewrite the answer to be clear and journalistic, but DO NOT change any numeric values, years, or city names.\n"
    "Keep it concise (2–4 sentences) and always keep the ACS source line verbatim at the end.\n"
  )

  prompt = (
    f"User question:\n{message}\n\n"
    f"RAG context:\n{rag_context}\n\n"
    f"Analysis JSON:\n{analysis}\n\n"
    f"Baseline answer:\n{base_answer}\n\n"
    "Now rewrite the answer as instructed."
  )

  try:
    resp = client.models.generate_content(
      model=model,
      contents=[
        {"role": "user", "parts": [{"text": system}]},
        {"role": "user", "parts": [{"text": prompt}]},
      ],
    )
    text = (resp.text or "").strip()  # type: ignore[attr-defined]
    # Add a small marker so we can verify Gemini is active.
    if text:
      return f"Interpretation:\n\n{text}"
    return base_answer
  except Exception as e:
    # For now, surface Gemini errors in the answer so we can debug setup.
    return base_answer + f"\n\n[Gemini error: {e}]"


def _llm_general_answer(message: str, fallback: str) -> str:
  """
  Use Gemini to answer a general knowledge question scoped to ACS / Gateway Cities.
  Falls back to *fallback* if Gemini is unavailable.
  """
  try:
    client = _gemini_client()
  except Exception:
    return fallback

  model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

  try:
    index = RagIndex(INDEX_PATH)
    docs = retrieve(index=index, query=message, metric_help=METRIC_HELP, k=4)
    rag_context = "\n\n".join(f"[{d.id}]\n{d.text}" for d in docs)
  except Exception:
    rag_context = ""

  system = (
    "You are a helpful assistant for Massachusetts journalists working with "
    "American Community Survey (ACS) data about Gateway Cities.\n"
    "Answer the user's question clearly and concisely (one short paragraph).\n"
    "If the question is unrelated to ACS data, demographics, or Gateway Cities, "
    "politely say you can only help with those topics.\n"
  )

  prompt = (
    f"User question:\n{message}\n\n"
    f"RAG context:\n{rag_context}\n\n"
    "Answer the question as instructed."
  )

  try:
    resp = client.models.generate_content(
      model=model,
      contents=[
        {"role": "user", "parts": [{"text": system}]},
        {"role": "user", "parts": [{"text": prompt}]},
      ],
    )
    text = (resp.text or "").strip()  # type: ignore[attr-defined]
    if text:
      return text
    return fallback
  except Exception:
    return fallback


def _is_general_question(text: str) -> bool:
  """Return True when the message looks like a general/informational question
  rather than a data query about a specific city."""
  lower = text.lower()
  signals = [
    "what is", "what are", "what's", "explain", "define", "definition",
    "why do", "why are", "why is", "how do", "how does", "how is",
    "tell me about", "describe", "meaning of",
  ]
  return any(s in lower for s in signals)


def chat(message: str) -> Dict[str, Any]:
  """
  Main entrypoint: run deterministic analysis, then (optionally) let Gemini
  rewrite the answer in natural language if a valid API key/model are set.
  """
  base = _offline_chat(message)
  analysis = base.get("analysis")

  # If we have structured analysis, let Gemini rewrite it.
  if isinstance(analysis, dict):
    answer = _llm_rewrite(
      message=message,
      base_answer=base.get("answer", ""),
      analysis=analysis,
    )
    return {
      "answer": answer,
      "chart": base.get("chart"),
    }

  # No structured analysis — if it looks like a general question, ask Gemini directly.
  if _is_general_question(message):
    answer = _llm_general_answer(message, fallback=base.get("answer", ""))
    return {
      "answer": answer,
      "chart": base.get("chart"),
    }

  # Otherwise return the deterministic offline answer.
  return {
    "answer": base.get("answer", ""),
    "chart": base.get("chart"),
  }

