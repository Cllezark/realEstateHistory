#!/usr/bin/env python3
"""Profile RP_OS_SALES.csv (historical PCPAO sales) for Phase 3.

Measures date coverage, qualification codes, parcel match rates against the
current property snapshot, overlap with RP_SALES.csv, and duplicates.

    .venv/bin/python scripts/profile_os_sales.py
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

print("=" * 70)
print("RP_OS_SALES.csv (historical sales) profile")
print("=" * 70)
os_sales = pd.read_csv(
    DATA / "RP_OS_SALES.csv",
    dtype={"STRAP": str, "QU": str, "MONTH_REAL": str, "DAY_REAL": str, "VI": str},
    parse_dates=["SALE_DATE"],
)
print(f"Total rows: {len(os_sales):,}")
print(f"Columns: {list(os_sales.columns)}")
print(f"Date range: {os_sales['SALE_DATE'].min()} → {os_sales['SALE_DATE'].max()}")
print(f"Null SALE_DATE: {os_sales['SALE_DATE'].isna().sum():,}")

os_sales["year"] = os_sales["SALE_DATE"].dt.year
price = pd.to_numeric(os_sales["PRICE"], errors="coerce")

print("\nQU (qualification) code distribution:")
print(os_sales["QU"].value_counts(dropna=False).to_string())
print("\nVI (vacant/improved) distribution:")
print(os_sales["VI"].value_counts(dropna=False).to_string())

by_year = os_sales.assign(price=price).groupby("year").agg(
    total=("STRAP", "size"),
    qualified=("QU", lambda s: s.isin(["Q", "M"]).sum()),
    valid_price=("price", lambda s: (s > 0).sum()),
    real_month=("MONTH_REAL", lambda s: (s == "Y").sum()),
    unique_parcels=("STRAP", "nunique"),
)
print("\nBy year (full table):")
print(by_year.to_string())

# Focus decade
decade = os_sales[os_sales["year"].between(2011, 2020)]
print(f"\n2011–2020 rows: {len(decade):,} "
      f"(qualified: {decade['QU'].isin(['Q', 'M']).sum():,})")

# STRAP hygiene
print(f"\nSTRAP length distribution: {os_sales['STRAP'].str.len().value_counts().to_dict()}")

# Parcel match against current snapshot
prop_straps = set(
    pd.read_csv(DATA / "RP_PROPERTY_INFO.csv", usecols=["STRAP"],
                dtype={"STRAP": str}, encoding="latin-1")["STRAP"].dropna()
)
os_sales["matched"] = os_sales["STRAP"].isin(prop_straps)
print("\nParcel match rate vs current (2026) snapshot, by year:")
print(os_sales.groupby("year")["matched"].agg(["mean", "size"])
      .assign(pct=lambda d: (100 * d["mean"]).round(2))[["size", "pct"]].to_string())

# Overlap with current RP_SALES (2021+)
cur = pd.read_csv(DATA / "RP_SALES.csv",
                  usecols=["STRAP", "SALE_DATE", "PRICE", "BOOK_PAGE"],
                  dtype={"STRAP": str}, parse_dates=["SALE_DATE"])
os_keys = set(zip(os_sales["STRAP"], os_sales["SALE_DATE"], price.fillna(-1)))
cur_price = pd.to_numeric(cur["PRICE"], errors="coerce").fillna(-1)
cur_keys = list(zip(cur["STRAP"], cur["SALE_DATE"], cur_price))
overlap = sum(1 for k in cur_keys if k in os_keys)
print(f"\nOverlap with RP_SALES.csv (STRAP+date+price key): "
      f"{overlap:,} of {len(cur):,} current rows also in OS file")
post2021 = (os_sales["SALE_DATE"] >= "2021-01-01").sum()
print(f"OS rows dated 2021 or later: {post2021:,}")

# Duplicates within OS file
dup_key = ["STRAP", "SALE_DATE", "PRICE", "BOOK_PAGE"]
dups = os_sales.duplicated(subset=dup_key, keep=False).sum()
print(f"Duplicate rows on {dup_key}: {dups:,}")
