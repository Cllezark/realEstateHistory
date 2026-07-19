"""Stage 12: Publish analytical tables.

Produces the final dashboard_tract_quarter table merging all data sources
and writes GeoParquet for tract geometry.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

from .utils import utc_now


def publish_dashboard(
    dashboard_path: Path,
    fhfa_fact_path: Path,
    dim_tract_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Merge FHFA HPI into dashboard and produce final outputs.

    Saves the final dashboard table and generates a simplified GeoJSON
    for the web application.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_parquet(dashboard_path)

    # Merge FHFA annual HPI (join on tract_geoid + year)
    if fhfa_fact_path.exists():
        fhfa = pd.read_parquet(fhfa_fact_path)
        fhfa_cols = ["tract_geoid", "year", "annual_change", "hpi", "hpi1990", "hpi2000"]
        available = [c for c in fhfa_cols if c in fhfa.columns]
        df = df.merge(fhfa[available], on=["tract_geoid", "year"], how="left")

    # Data-quality flags
    df["data_quality_note"] = None

    # Flag cells where FHFA HPI is available but represents an index, not a price
    # (Already handled by column naming - hpi vs sale_price)

    # Suppression flags
    threshold = config["sale_filter"]["small_sample_threshold"]
    df["suppress_median"] = (
        df["qualified_sale_count"].notna() &
        (df["qualified_sale_count"] < threshold)
    )

    # Reorder columns for dashboard consumption
    priority_cols = [
        "tract_geoid", "year", "quarter", "quarter_id",
        "qualified_sale_count", "median_sale_price", "mean_sale_price",
        "p25_sale_price", "p75_sale_price",
        "min_sale_price", "max_sale_price",
        "average_rate_percent", "estimated_pi_payment",
        "hpi", "annual_change",
        "small_sample_flag", "suppress_median",
        "is_current_partial_quarter", "partial_quarter_flag",
    ]
    existing_priority = [c for c in priority_cols if c in df.columns]
    other_cols = [c for c in df.columns if c not in existing_priority]
    df = df[existing_priority + other_cols]

    # Add pipeline metadata
    df["_published_at_utc"] = utc_now()

    # Save final dashboard
    final_path = output_dir / "dashboard_tract_quarter.parquet"
    df.to_parquet(final_path, index=False)

    # --- Generate simplified GeoJSON for web ---
    if dim_tract_path.exists():
        dim_tract = gpd.read_parquet(dim_tract_path)
        if "geometry" in dim_tract.columns:
            dim_tract = dim_tract.to_crs("EPSG:4326")
            # Simplify geometry for web (small tolerance)
            dim_tract["geometry"] = dim_tract["geometry"].simplify(0.0001, preserve_topology=True)

            # Join to dashboard summary for tooltip
            tract_summary = df.groupby("tract_geoid").agg(
                total_qualified_sales=("qualified_sale_count", "sum"),
                latest_median=("median_sale_price", "last"),
            ).reset_index()

            geojson_tracts = dim_tract.merge(tract_summary, on="tract_geoid", how="left")
            geojson_path = output_dir / "pinellas_tracts_dashboard.geojson"
            geojson_tracts.to_file(geojson_path, driver="GeoJSON")
            print(f"GeoJSON: {geojson_path}")

    cells = len(df)
    cells_with_sales = df["qualified_sale_count"].notna().sum()
    print(f"Dashboard published: {cells} cells, {int(cells_with_sales)} with sales")
    print(f"  Columns: {list(df.columns)[:12]}...")

    return {
        "dashboard_path": str(final_path),
        "total_cells": cells,
        "cells_with_sales": int(cells_with_sales),
    }
