#!/usr/bin/env python3
"""Phase 3 regression check: 2021+ dashboard values must match the Phase 2
baseline, and the historical extension must be populated.

    .venv/bin/python scripts/phase3_regression_check.py <baseline_parquet>
"""

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
baseline_path = Path(sys.argv[1])

new = pd.read_parquet(ROOT / "output" / "dashboard_tract_quarter.parquet")
base = pd.read_parquet(baseline_path)

print("=" * 70)
print("1. Coverage")
print("=" * 70)
print(f"Baseline: {base['quarter_id'].min()} → {base['quarter_id'].max()} "
      f"({len(base):,} rows, {base['tract_geoid'].nunique()} tracts)")
print(f"New:      {new['quarter_id'].min()} → {new['quarter_id'].max()} "
      f"({len(new):,} rows, {new['tract_geoid'].nunique()} tracts)")

hist = new[new["year"] < 2021]
print(f"\nHistorical cells (pre-2021): {len(hist):,}, "
      f"with sales: {hist['qualified_sale_count'].notna().sum():,}")
hist_by_year = hist[hist["qualified_sale_count"].notna()].groupby("year").agg(
    cells=("tract_geoid", "size"),
    sales=("qualified_sale_count", "sum"),
    median_of_medians=("median_sale_price", "median"),
)
print(hist_by_year.to_string())

print()
print("=" * 70)
print("2. Regression: 2021+ metric values vs Phase 2 baseline")
print("=" * 70)
metrics = ["qualified_sale_count", "median_sale_price", "mean_sale_price",
           "p25_sale_price", "p75_sale_price", "min_sale_price",
           "max_sale_price", "average_rate_percent", "estimated_pi_payment"]
key = ["tract_geoid", "quarter_id"]

base_recent = base[base["year"] >= 2021][key + [m for m in metrics if m in base.columns]]
new_recent = new[new["year"] >= 2021][key + [m for m in metrics if m in new.columns]]

merged = base_recent.merge(new_recent, on=key, how="outer",
                           suffixes=("_base", "_new"), indicator=True)
print(f"Row alignment: {merged['_merge'].value_counts().to_dict()}")

mismatch_total = 0
for m in metrics:
    b, n = f"{m}_base", f"{m}_new"
    if b not in merged.columns or n not in merged.columns:
        continue
    both = merged[["_merge"]].assign(b=merged[b], n=merged[n])
    equal = (both["b"] == both["n"]) | (both["b"].isna() & both["n"].isna())
    bad = int((~equal).sum())
    mismatch_total += bad
    status = "OK " if bad == 0 else "DIFF"
    print(f"  [{status}] {m}: {bad} mismatched cells")

print()
if mismatch_total == 0 and set(merged["_merge"].unique()) == {"both"}:
    print("REGRESSION CHECK PASSED: 2021+ values identical to Phase 2 baseline")
else:
    print(f"REGRESSION CHECK: {mismatch_total} metric mismatches — inspect above")

print()
print("=" * 70)
print("3. Mortgage-rate quarterly coverage")
print("=" * 70)
rates = pd.read_parquet(ROOT / "output" / "fact_mortgage_rate_quarter.parquet")
print(f"Quarters: {rates['quarter_id'].min()} → {rates['quarter_id'].max()} "
      f"({len(rates)} quarters, partial: {int(rates['partial_quarter_flag'].sum())})")

print()
print("=" * 70)
print("4. Published web assets")
print("=" * 70)
import json
with open(ROOT / "frontend" / "public" / "data" / "metadata.json") as f:
    meta = json.load(f)
print(f"dateCoverageStart: {meta['dateCoverageStart']}")
print(f"dateCoverageEnd:   {meta['dateCoverageEnd']}")
with open(ROOT / "frontend" / "public" / "data" / "tract-quarter.json") as f:
    market = json.load(f)
quarters = sorted(market.keys())
print(f"tract-quarter.json quarters: {quarters[0]} → {quarters[-1]} ({len(quarters)} quarters)")
q1_2011 = market.get("2011-Q1", {})
with_data = sum(1 for v in q1_2011.values() if v.get("medianSalePrice") is not None)
print(f"2011-Q1 tracts with published median: {with_data} of {len(q1_2011)}")
