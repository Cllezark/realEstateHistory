#!/usr/bin/env python3
"""Phase 3 historical source profiler.

Measures historical coverage of every pipeline input so the earliest
defensible dashboard quarter can be determined from evidence rather than
assumption. Run from the repository root:

    .venv/bin/python scripts/profile_historical_sources.py
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "output"


def profile_sales() -> pd.DataFrame:
    print("=" * 70)
    print("1. PCPAO SALES (RP_SALES.csv)")
    print("=" * 70)
    sales = pd.read_csv(
        DATA / "RP_SALES.csv",
        usecols=["STRAP", "SALE_DATE", "PRICE", "QUALIFIED_FLG",
                 "MONTH_REAL", "DAY_REAL", "MULTI_SALES_YN"],
        dtype={"STRAP": str, "QUALIFIED_FLG": str, "MONTH_REAL": str,
               "DAY_REAL": str, "MULTI_SALES_YN": str},
        parse_dates=["SALE_DATE"],
    )
    print(f"Total rows: {len(sales):,}")
    print(f"Min sale date: {sales['SALE_DATE'].min()}")
    print(f"Max sale date: {sales['SALE_DATE'].max()}")
    print(f"Sales before 2021-01-01: {(sales['SALE_DATE'] < '2021-01-01').sum()}")

    sales["year"] = sales["SALE_DATE"].dt.year
    by_year = sales.groupby("year").agg(
        total=("STRAP", "size"),
        qualified=("QUALIFIED_FLG", lambda s: s.isin(["Q", "M"]).sum()),
        valid_price=("PRICE", lambda s: (pd.to_numeric(s, errors="coerce") > 0).sum()),
        real_month=("MONTH_REAL", lambda s: (s == "Y").sum()),
        multi_parcel=("MULTI_SALES_YN", lambda s: (s == "Y").sum()),
    )
    print(by_year.to_string())
    return sales


def profile_property(sales: pd.DataFrame) -> None:
    print("\n" + "=" * 70)
    print("2. PROPERTY SNAPSHOT (RP_PROPERTY_INFO.csv)")
    print("=" * 70)
    prop = pd.read_csv(
        DATA / "RP_PROPERTY_INFO.csv",
        usecols=["STRAP", "LATITUDE", "LONGITUDE", "ROLL_YEAR", "STATUS"],
        dtype={"STRAP": str, "STATUS": str},
        encoding="latin-1",
    )
    print(f"Total property rows: {len(prop):,} (unique STRAPs: {prop['STRAP'].nunique():,})")
    print(f"ROLL_YEAR values: {sorted(prop['ROLL_YEAR'].dropna().unique())}")
    lat = pd.to_numeric(prop["LATITUDE"], errors="coerce")
    lon = pd.to_numeric(prop["LONGITUDE"], errors="coerce")
    valid = lat.between(24, 32) & lon.between(-88, -80)
    print(f"Valid FL coordinates: {valid.sum():,} ({100 * valid.mean():.2f}%)")

    matched = sales["STRAP"].isin(set(prop["STRAP"].dropna()))
    print(f"Sales→parcel match rate: {100 * matched.mean():.2f}%")
    print(sales.assign(matched=matched.values)
          .groupby("year")["matched"].mean().mul(100).round(2).to_string())


def profile_fhfa() -> None:
    print("\n" + "=" * 70)
    print("3. FHFA HPI (hpi_at_tract.csv) — Pinellas coverage + vintage check")
    print("=" * 70)
    hpi = pd.read_csv(DATA / "hpi_at_tract.csv", dtype={"tract": str})
    pin = hpi[hpi["tract"].str.startswith("12103")]
    print(f"Pinellas rows: {len(pin):,}, unique tracts: {pin['tract'].nunique()}")
    print(f"Year range: {pin['year'].min()}–{pin['year'].max()}")
    decade = pin[pin["year"].between(2011, 2020)]
    print(f"2011–2020 rows: {len(decade):,} "
          f"({decade[decade['hpi'].notna()].shape[0]:,} with non-null HPI, "
          f"{decade['tract'].nunique()} tracts)")

    dim_path = OUT / "dim_census_tract.parquet"
    if dim_path.exists():
        t2020 = set(pd.read_parquet(dim_path)["tract_geoid"].astype(str))
        fhfa_tracts = set(pin["tract"].unique())
        overlap = len(fhfa_tracts & t2020)
        print(f"FHFA tracts matching 2020 GEOIDs: {overlap}/{len(fhfa_tracts)} "
              f"({100 * overlap / len(fhfa_tracts):.1f}%)")
        print(f"2020 tracts with no FHFA series: {len(t2020 - fhfa_tracts)}")


def profile_fred() -> None:
    print("\n" + "=" * 70)
    print("4. FRED MORTGAGE30US")
    print("=" * 70)
    fred = pd.read_csv(DATA / "MORTGAGE30US.csv", parse_dates=["observation_date"])
    print(f"Rows: {len(fred)}, range: {fred['observation_date'].min().date()} "
          f"→ {fred['observation_date'].max().date()}")
    in_decade = fred["observation_date"].between("2011-01-01", "2020-12-31").sum()
    print(f"Weekly observations covering 2011–2020: {in_decade}")


def profile_dashboard() -> None:
    dash_path = OUT / "dashboard_tract_quarter.parquet"
    if not dash_path.exists():
        return
    print("\n" + "=" * 70)
    print("5. CURRENT DASHBOARD COVERAGE")
    print("=" * 70)
    dash = pd.read_parquet(dash_path)
    print(f"Quarter range: {dash['quarter_id'].min()} → {dash['quarter_id'].max()}")
    print(f"Tracts: {dash['tract_geoid'].nunique()}, rows: {len(dash):,}")


if __name__ == "__main__":
    sales = profile_sales()
    profile_property(sales)
    profile_fhfa()
    profile_fred()
    profile_dashboard()
