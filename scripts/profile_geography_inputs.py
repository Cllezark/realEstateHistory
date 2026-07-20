#!/usr/bin/env python3
"""Validate 2010 tract geometry and the 2020-2010 relationship file for Pinellas.

    .venv/bin/python scripts/profile_geography_inputs.py
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

print("=" * 70)
print("1. 2010 TIGER tracts (tl_2010_12_tract10)")
print("=" * 70)
t10 = gpd.read_file(DATA / "tl_2010_12_tract10" / "tl_2010_12_tract10.shp")
print(f"Florida 2010 tracts: {len(t10):,}")
print(f"Columns: {list(t10.columns)}")
pin10 = t10[(t10["STATEFP10"] == "12") & (t10["COUNTYFP10"] == "103")]
print(f"Pinellas 2010 tracts: {len(pin10)}")
print(f"CRS: {t10.crs}")
print(f"GEOID10 sample: {pin10['GEOID10'].head(3).tolist()}")

print()
print("=" * 70)
print("2. Relationship file (tab20_tract20_tract10_natl.txt) — Pinellas slice")
print("=" * 70)
rel = pd.read_csv(
    DATA / "tab20_tract20_tract10_natl.txt",
    sep="|",
    encoding="utf-8-sig",
    dtype={"GEOID_TRACT_20": str, "GEOID_TRACT_10": str},
)
pin_rel = rel[
    rel["GEOID_TRACT_20"].str.startswith("12103", na=False)
    | rel["GEOID_TRACT_10"].str.startswith("12103", na=False)
].copy()
print(f"National rows: {len(rel):,}; Pinellas rows: {len(pin_rel):,}")
print(f"Unique 2020 tracts: {pin_rel['GEOID_TRACT_20'].nunique()}")
print(f"Unique 2010 tracts: {pin_rel['GEOID_TRACT_10'].nunique()}")
cross_county = pin_rel[
    pin_rel["GEOID_TRACT_20"].str.startswith("12103", na=False)
    != pin_rel["GEOID_TRACT_10"].str.startswith("12103", na=False)
]
print(f"Rows crossing the county boundary: {len(cross_county)}")

# Classify relationship types from the Pinellas slice
n20_per_10 = pin_rel.groupby("GEOID_TRACT_10")["GEOID_TRACT_20"].nunique()
n10_per_20 = pin_rel.groupby("GEOID_TRACT_20")["GEOID_TRACT_10"].nunique()


def classify(row):
    many20 = n20_per_10.get(row["GEOID_TRACT_10"], 0) > 1
    many10 = n10_per_20.get(row["GEOID_TRACT_20"], 0) > 1
    if many20 and many10:
        return "many_to_many"
    if many20:
        return "one_2010_to_many_2020"
    if many10:
        return "many_2010_to_one_2020"
    return "one_to_one"


pin_rel["relationship_type"] = pin_rel.apply(classify, axis=1)
print("\nRelationship-type distribution (Pinellas rows):")
print(pin_rel["relationship_type"].value_counts().to_string())

# Land-share sanity: parts should sum to ~AREALAND_TRACT_10 per 2010 tract
share = pin_rel.groupby("GEOID_TRACT_10").agg(
    parts=("AREALAND_PART", "sum"),
    total=("AREALAND_TRACT_10", "first"),
)
share = share[share["total"] > 0]
ratio = share["parts"] / share["total"]
print(f"\nLand-part totals vs 2010 tract land area: "
      f"min={ratio.min():.4f}, max={ratio.max():.4f}, "
      f"within 1%: {(ratio.sub(1).abs() < 0.01).mean() * 100:.1f}%")

print()
print("=" * 70)
print("3. Mortgage-rate continuity (2010s file + current file)")
print("=" * 70)
old = pd.read_csv(DATA / "MORTGAGE30US_2010s.csv", parse_dates=["observation_date"])
cur = pd.read_csv(DATA / "MORTGAGE30US.csv", parse_dates=["observation_date"])
print(f"2010s file: {old['observation_date'].min().date()} → {old['observation_date'].max().date()} ({len(old)} rows)")
print(f"Current file: {cur['observation_date'].min().date()} → {cur['observation_date'].max().date()} ({len(cur)} rows)")
gap_days = (cur["observation_date"].min() - old["observation_date"].max()).days
print(f"Gap at boundary: {gap_days} days (weekly cadence = 7 expected)")
overlap = set(old["observation_date"]) & set(cur["observation_date"])
print(f"Overlapping observation dates: {len(overlap)}")
combined = pd.concat([old, cur]).sort_values("observation_date")
deltas = combined["observation_date"].diff().dt.days.dropna()
print(f"Combined series: {len(combined)} rows, max inter-observation gap: {deltas.max():.0f} days")
