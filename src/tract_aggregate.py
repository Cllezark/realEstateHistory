"""Stage 10: Build the tract-quarter sale aggregate.

Derives calendar quarter from each valid sale date and calculates
median, mean, percentiles, and counts per tract-quarter cell.
Generates a complete tract-quarter spine so missing periods appear
as null observations.
"""

from pathlib import Path

import pandas as pd

from .utils import utc_now


def build_tract_quarter_aggregate(
    enriched_sales_path: Path,
    dim_tract_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Build quarterly sale statistics per Census tract."""
    output_dir.mkdir(parents=True, exist_ok=True)

    sales = pd.read_parquet(enriched_sales_path)

    # Filter to St. Pete parcels with tract assignment
    valid_sales = sales[
        (sales["inside_st_petersburg"] == True) &
        sales["tract_geoid"].notna()
    ].copy()

    # Derive quarter
    valid_sales["year"] = valid_sales["sale_date"].dt.year
    valid_sales["quarter"] = valid_sales["sale_date"].dt.quarter
    valid_sales["quarter_id"] = (
        valid_sales["year"].astype(str) + "-Q" + valid_sales["quarter"].astype(str)
    )

    # Separate single-parcel vs multi-parcel for median calculations
    single_parcel = valid_sales[valid_sales["_is_multi_parcel"] == False]
    multi_parcel = valid_sales[valid_sales["_is_multi_parcel"] == True]

    # Aggregate single-parcel sales per tract-quarter
    agg = single_parcel.groupby(["tract_geoid", "year", "quarter", "quarter_id"]).agg(
        qualified_sale_count=("sale_price", "count"),
        median_sale_price=("sale_price", "median"),
        mean_sale_price=("sale_price", "mean"),
        p25_sale_price=("sale_price", lambda x: x.quantile(0.25)),
        p75_sale_price=("sale_price", lambda x: x.quantile(0.75)),
        min_sale_price=("sale_price", "min"),
        max_sale_price=("sale_price", "max"),
    ).reset_index()

    # Round aggregates
    for col in ["median_sale_price", "mean_sale_price", "p25_sale_price",
                "p75_sale_price", "min_sale_price", "max_sale_price"]:
        agg[col] = agg[col].round(2)

    # Multi-parcel exclusion count per tract-quarter
    multi_counts = multi_parcel.groupby(["tract_geoid", "year", "quarter"]).size().reset_index(name="excluded_multi_parcel_count")
    agg = agg.merge(multi_counts, on=["tract_geoid", "year", "quarter"], how="left")
    agg["excluded_multi_parcel_count"] = agg["excluded_multi_parcel_count"].fillna(0).astype(int)

    # --- Complete tract-quarter spine ---
    dim_tract = pd.read_parquet(dim_tract_path)
    tract_geoids = dim_tract["tract_geoid"].unique()

    # Determine full quarter range
    all_years = sorted(valid_sales["year"].dropna().unique())
    if len(all_years) == 0:
        all_years = [2021]
    year_range = range(int(min(all_years)), int(max(all_years)) + 1)
    quarters = [1, 2, 3, 4]

    spine_rows = []
    for geoid in tract_geoids:
        for yr in year_range:
            for q in quarters:
                spine_rows.append({
                    "tract_geoid": geoid,
                    "year": yr,
                    "quarter": q,
                    "quarter_id": f"{yr}-Q{q}",
                })
    spine = pd.DataFrame(spine_rows)

    # Full outer join: spine LEFT JOIN agg
    agg_full = spine.merge(agg, on=["tract_geoid", "year", "quarter", "quarter_id"], how="left")

    # Determine current/latest quarter for partial flag
    latest_date = valid_sales["sale_date"].max()
    current_yr = latest_date.year
    current_q = latest_date.quarter
    agg_full["is_current_partial_quarter"] = (
        (agg_full["year"] == current_yr) & (agg_full["quarter"] == current_q)
    )

    # Small-sample flags
    threshold = config["sale_filter"]["small_sample_threshold"]
    agg_full["small_sample_flag"] = (
        agg_full["qualified_sale_count"].notna() &
        (agg_full["qualified_sale_count"] < threshold)
    )

    # Pipeline metadata
    agg_full["_pipeline_run_id"] = run_id
    agg_full["_aggregated_at_utc"] = utc_now()

    # Save
    agg_path = output_dir / "agg_tract_sale_quarter.parquet"
    agg_full.to_parquet(agg_path, index=False)

    # Counts
    cells_with_sales = agg_full["qualified_sale_count"].notna().sum()
    cells_flagged_small = agg_full["small_sample_flag"].sum()

    print(f"Tract-quarter aggregate: {len(agg_full)} spine cells, "
          f"{int(cells_with_sales)} with sales, {int(cells_flagged_small)} small-sample flagged")

    return {
        "aggregate_path": str(agg_path),
        "spine_cells": len(agg_full),
        "cells_with_sales": int(cells_with_sales),
        "cells_small_sample": int(cells_flagged_small),
        "unique_tracts_with_sales": int(agg["tract_geoid"].nunique()),
    }
