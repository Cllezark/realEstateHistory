"""Stage 12: Publish analytical tables.

Produces the final dashboard_tract_quarter table merging all data sources,
writes GeoParquet for tract geometry, and generates browser-ready web assets
for the frontend application.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd

from .utils import utc_now

# --- Column name mapping for camelCase JSON keys ---
_SNAKE_TO_CAMEL = {
    "median_sale_price": "medianSalePrice",
    "qualified_sale_count": "qualifiedSaleCount",
    "mean_sale_price": "meanSalePrice",
    "p25_sale_price": "p25SalePrice",
    "p75_sale_price": "p75SalePrice",
    "min_sale_price": "minSalePrice",
    "max_sale_price": "maxSalePrice",
    "average_rate_percent": "averageRatePercent",
    "estimated_pi_payment": "estimatedMonthlyPrincipalInterest",
    "hpi": "hpi",
    "annual_change": "annualChange",
    "small_sample_flag": "smallSampleFlag",
    "suppress_median": "suppressMedian",
    "partial_quarter_flag": "partialQuarterFlag",
}

# Columns in the dashboard that represent publishable metrics
_METRIC_COLUMNS = [
    "qualified_sale_count",
    "median_sale_price",
    "mean_sale_price",
    "p25_sale_price",
    "p75_sale_price",
    "min_sale_price",
    "max_sale_price",
    "average_rate_percent",
    "estimated_pi_payment",
    "hpi",
    "annual_change",
    "small_sample_flag",
    "suppress_median",
    "is_current_partial_quarter",
    "partial_quarter_flag",
]

_QUARTER_ID_RE = re.compile(r"^\d{4}-Q[1-4]$")


def _safe_json_value(val):
    """Convert a numpy/pandas value to a JSON-serializable Python type.

    Returns None for NaN/NaT, preserves int/float/bool types.
    """
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, (bool,)):
        return bool(val)
    if hasattr(val, "item"):
        val = val.item()
    if isinstance(val, float):
        if val != val:  # NaN check
            return None
    return val


def _require_input(path: Path, description: str) -> None:
    """Validate that a required input file exists and is non-empty."""
    if not path.exists():
        raise FileNotFoundError(
            f"Required input {description} not found: {path}"
        )
    if path.stat().st_size == 0:
        raise ValueError(
            f"Required input {description} is empty: {path}"
        )


def validate_publication_assets(
    geojson_path: Path,
    market_json_path: Path,
    metadata_path: Path,
    df: pd.DataFrame,
    dim_tract: gpd.GeoDataFrame,
) -> list[str]:
    """Validate generated web assets for correctness.

    Checks:
      - GeoJSON has unique tract_geoid per feature
      - Every market-data tract_geoid exists in the geometry
      - Quarter IDs follow canonical format "YYYY-QN"
      - (tract_geoid, quarter_id) is unique in dashboard data
      - Suppressed cells do not contain publishable median values
      - Date coverage agrees between metadata and data
      - Required fields are present in the dashboard

    Returns a list of error messages (empty list means all checks passed).
    """
    errors: list[str] = []

    # --- 1. GeoJSON: unique tract_geoid per feature ---
    if geojson_path.exists():
        stp_geojson = gpd.read_file(geojson_path)
        geoids_in_geojson = stp_geojson["tract_geoid"].tolist()
        if len(geoids_in_geojson) != len(set(geoids_in_geojson)):
            dupes = [g for g in geoids_in_geojson if geoids_in_geojson.count(g) > 1]
            errors.append(
                f"GeoJSON contains duplicate tract_geoid values: "
                f"{sorted(set(dupes))}"
            )
    else:
        errors.append(f"GeoJSON file not found: {geojson_path}")

    # --- 2. Every tract in market data exists in geometry ---
    st_pete_geoids = set(
        df.loc[df["qualified_sale_count"].notna(), "tract_geoid"].unique()
    )
    geometry_geoids = set(dim_tract["tract_geoid"].unique()) if dim_tract is not None else set()
    if geometry_geoids:
        missing = st_pete_geoids - geometry_geoids
        if missing:
            errors.append(
                f"Market-data tract GEOIDs not found in census tract geometry: "
                f"{sorted(missing)}"
            )

    # --- 3. Quarter IDs follow canonical format ---
    dashboard_quarters = df["quarter_id"].dropna().unique()
    bad_quarters = [
        q for q in dashboard_quarters
        if not _QUARTER_ID_RE.match(str(q))
    ]
    if bad_quarters:
        errors.append(
            f"Quarter IDs do not match canonical YYYY-QN format: "
            f"{sorted(set(str(q) for q in bad_quarters))}"
        )

    # --- 4. (tract_geoid, quarter_id) uniqueness ---
    dup_mask = df.duplicated(subset=["tract_geoid", "quarter_id"], keep=False)
    if dup_mask.any():
        dup_pairs = (
            df.loc[dup_mask, ["tract_geoid", "quarter_id"]]
            .drop_duplicates()
            .values.tolist()
        )
        errors.append(
            f"Duplicate (tract_geoid, quarter_id) records: "
            f"{dup_pairs[:10]}{'...' if len(dup_pairs) > 10 else ''}"
        )

    # --- 5. Suppressed cells must not have publishable medians ---
    suppressed = df[df["suppress_median"] == True]
    bad_suppressed = suppressed[
        suppressed["median_sale_price"].notna()
    ]
    if len(bad_suppressed) > 0:
        errors.append(
            f"Suppressed cells have non-null median_sale_price: "
            f"{len(bad_suppressed)} records"
        )

    # --- 6. Date coverage agrees between metadata and data ---
    if metadata_path.exists():
        with open(metadata_path) as f:
            meta = json.load(f)
        meta_start = meta.get("dateCoverageStart")
        meta_end = meta.get("dateCoverageEnd")
        data_start = str(df["quarter_id"].min())
        # Coverage end: use the last quarter with actual data (not trailing
        # empty spine quarters that have null median_sale_price)
        data_quarters = sorted(
            df.loc[df["median_sale_price"].notna(), "quarter_id"].dropna().unique()
        )
        data_end = str(data_quarters[-1]) if len(data_quarters) > 0 else str(df["quarter_id"].max())
        if meta_start != data_start:
            errors.append(
                f"Metadata dateCoverageStart '{meta_start}' does not match "
                f"data min quarter '{data_start}'"
            )
        if meta_end != data_end:
            errors.append(
                f"Metadata dateCoverageEnd '{meta_end}' does not match "
                f"data coverage end '{data_end}'"
            )

    # --- 7. Required fields in dashboard ---
    required = [
        "tract_geoid", "year", "quarter", "quarter_id",
        "qualified_sale_count", "median_sale_price",
        "suppress_median", "partial_quarter_flag",
        "small_sample_flag",
    ]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        errors.append(
            f"Required dashboard columns missing: {missing_cols}"
        )

    return errors


def _build_tracts_geojson(
    dim_tract: gpd.GeoDataFrame,
    st_pete_geoids: list[str],
    web_assets_dir: Path,
) -> Path:
    """Write a filtered, simplified GeoJSON containing only St. Pete tracts."""
    web_assets_dir.mkdir(parents=True, exist_ok=True)

    stp_tracts = dim_tract[dim_tract["tract_geoid"].isin(st_pete_geoids)].copy()

    if "geometry" not in stp_tracts.columns:
        raise ValueError("dim_census_tract missing geometry column")

    stp_tracts = stp_tracts.to_crs("EPSG:4326")
    stp_tracts["geometry"] = stp_tracts["geometry"].simplify(
        0.0001, preserve_topology=True
    )

    # Select only the properties we want to expose; map TIGER field names
    # to friendly names if needed (ALAND → land_area, AWATER → water_area)
    geo_props = ["tract_geoid", "tract_name"]
    area_cols = {}
    for friendly, raw in [("land_area", "ALAND"), ("water_area", "AWATER")]:
        if friendly in stp_tracts.columns:
            area_cols[friendly] = friendly
        elif raw in stp_tracts.columns:
            stp_tracts[friendly] = stp_tracts[raw]
            area_cols[friendly] = friendly

    geo_props.extend(area_cols.keys())

    geojson_path = web_assets_dir / "tracts.geojson"
    stp_tracts[geo_props + ["geometry"]].to_file(geojson_path, driver="GeoJSON", RFC7946=True)
    print(f"St. Pete tracts GeoJSON: {geojson_path} ({len(stp_tracts)} tracts)")
    return geojson_path


def _build_market_json(
    df: pd.DataFrame,
    st_pete_geoids: list[str],
    web_assets_dir: Path,
) -> Path:
    """Write the tract-quarter market data as a JSON file.

    Structure: { quarter_id: { tract_geoid: { ...metrics... } } }

    Includes all St. Pete tracts for every quarter (even those with no
    sales), so the frontend can display tracts consistently across time.
    """
    web_assets_dir.mkdir(parents=True, exist_ok=True)

    # Suppression threshold for null-ing medians
    threshold = df["qualified_sale_count"].notna() & df["suppress_median"]

    # Build a spine of all (quarter_id, tract_geoid) combos for St. Pete
    all_quarters = sorted(df["quarter_id"].unique())
    spine = pd.DataFrame(
        [(q, g) for q in all_quarters for g in st_pete_geoids],
        columns=["quarter_id", "tract_geoid"],
    )

    # Merge actual data onto the spine
    merge_cols = (
        ["tract_geoid", "quarter_id"]
        + list(_SNAKE_TO_CAMEL.keys())
        + (["is_current_partial_quarter"] if "is_current_partial_quarter" in df.columns else [])
    )
    available = [c for c in merge_cols if c in df.columns]
    merged = spine.merge(df[available], on=["tract_geoid", "quarter_id"], how="left")

    # Build the nested dict
    result: dict = {}
    for quarter, group in merged.groupby("quarter_id", sort=True):
        quarter_key = str(quarter)
        result[quarter_key] = {}
        for _, row in group.iterrows():
            tract_key = str(row["tract_geoid"])
            entry: dict = {}

            for snake_key, camel_key in _SNAKE_TO_CAMEL.items():
                if snake_key not in merged.columns:
                    continue
                val = row[snake_key]
                # Suppressed medians: set to null regardless of stored value
                if snake_key == "median_sale_price" and row.get("suppress_median") is True:
                    entry[camel_key] = None
                else:
                    entry[camel_key] = _safe_json_value(val)

            result[quarter_key][tract_key] = entry

    json_path = web_assets_dir / "tract-quarter.json"
    with open(json_path, "w") as f:
        json.dump(result, f, separators=(",", ":"), sort_keys=True)

    print(f"Market data JSON: {json_path}")
    return json_path


def _build_metadata(
    df: pd.DataFrame,
    config: dict,
    web_assets_dir: Path,
) -> Path:
    """Write metadata.json with build info, coverage, and assumptions."""
    web_assets_dir.mkdir(parents=True, exist_ok=True)

    cfg_mortgage = config.get("mortgage", {})
    cfg_sale = config.get("sale_filter", {})
    cfg_geo = config.get("geography", {}).get("census_tract", {})

    # Determine coverage end: last quarter that has at least one tract
    # with a non-null median_sale_price (skip empty trailing quarters
    # that exist only as spine rows with no sales data).
    coverage_quarters = (
        df.loc[df["median_sale_price"].notna(), "quarter_id"]
        .dropna()
        .unique()
    )
    if len(coverage_quarters) > 0:
        data_coverage_end = str(sorted(coverage_quarters)[-1])
    else:
        data_coverage_end = str(df["quarter_id"].max())

    metadata = {
        "buildDate": datetime.now().astimezone().isoformat(),
        "dataSource": "pcpao",
        "boundaryVintage": cfg_geo.get("vintage", "2020"),
        "boundaryDescription": cfg_geo.get(
            "vintage_description",
            "2020 TIGER/Line Census tracts (effective January 1, 2020)",
        ),
        "dateCoverageStart": str(df["quarter_id"].min()),
        "dateCoverageEnd": data_coverage_end,
        "metrics": [c for c in _METRIC_COLUMNS if c in df.columns],
        "mortgageAssumptions": {
            "downPaymentPercent": float(cfg_mortgage.get("down_payment_percent", 20.0)),
            "loanTermYears": int(cfg_mortgage.get("loan_term_years", 30)),
            "paymentComponents": str(cfg_mortgage.get(
                "payment_components", "principal_and_interest"
            )),
        },
        "smallSampleThreshold": int(cfg_sale.get("small_sample_threshold", 5)),
        "suppressionThreshold": int(cfg_sale.get("small_sample_threshold", 5)),
        "attributions": {
            "salesAndProperty": "Pinellas County Property Appraiser (PCPAO)",
            "hpi": "FHFA Tract HPI",
            "mortgageRate": "FRED / Freddie Mac 30-Year Fixed Rate Mortgage Average",
        },
        "pipelineVersion": str(config.get("pipeline", {}).get("version", "1.0.0")),
    }

    meta_path = web_assets_dir / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"Metadata: {meta_path}")
    return meta_path


def publish_dashboard(
    dashboard_path: Path,
    fhfa_fact_path: Path,
    dim_tract_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
    web_assets_dir: Optional[Path] = None,
) -> dict:
    """Merge FHFA HPI into dashboard and produce final outputs.

    Saves the final dashboard table, generates a simplified GeoJSON for
    the web application (all Pinellas tracts), and produces browser-ready
    assets for the frontend:
      - frontend/public/data/tracts.geojson   (St. Pete tracts only)
      - frontend/public/data/tract-quarter.json
      - frontend/public/data/metadata.json
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # --- Pre-flight: validate required inputs exist and are non-empty ---
    for path, desc in [
        (dashboard_path, "dashboard_tract_quarter.parquet"),
        (dim_tract_path, "dim_census_tract.parquet"),
    ]:
        _require_input(path, desc)

    df = pd.read_parquet(dashboard_path)

    if len(df) == 0:
        raise ValueError("dashboard_tract_quarter.parquet is empty (0 rows)")

    # --- Validate dashboard structural integrity ---
    dup_mask = df.duplicated(subset=["tract_geoid", "quarter_id"], keep=False)
    if dup_mask.any():
        dup_count = dup_mask.sum()
        raise ValueError(
            f"Duplicate (tract_geoid, quarter_id) records in dashboard: "
            f"{dup_count} rows"
        )

    # --- Required columns check ---
    # (suppress_median is intentionally absent: this stage computes it below,
    # so requiring it as input would create a dependency on a prior publish
    # run's output rather than on the mortgage-payment stage's actual product)
    required_cols = [
        "tract_geoid", "year", "quarter", "quarter_id",
        "qualified_sale_count", "median_sale_price",
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Required dashboard columns missing: {missing}")

    # --- Merge FHFA annual HPI (join on tract_geoid + year) ---
    if fhfa_fact_path.exists():
        fhfa = pd.read_parquet(fhfa_fact_path)
        fhfa_cols = ["tract_geoid", "year", "annual_change", "hpi", "hpi1990", "hpi2000"]
        available = [c for c in fhfa_cols if c in fhfa.columns]
        # Drop FHFA columns that may already exist from a previous publish run
        drop_cols = [c for c in ["annual_change", "hpi", "hpi1990", "hpi2000"] if c in df.columns]
        if drop_cols:
            df = df.drop(columns=drop_cols)
        df = df.merge(fhfa[available], on=["tract_geoid", "year"], how="left")

    # Data-quality flags
    df["data_quality_note"] = None

    # Suppression flags
    threshold = config["sale_filter"]["small_sample_threshold"]
    df["suppress_median"] = (
        df["qualified_sale_count"].notna()
        & (df["qualified_sale_count"] < threshold)
    )

    # Null out median_sale_price for suppressed cells so no leak into exports
    df.loc[df["suppress_median"] == True, "median_sale_price"] = None

    # --- Validate: suppressed cells must not leak medians ---
    bad_suppressed = df[
        (df["suppress_median"] == True)
        & df["median_sale_price"].notna()
    ]
    if len(bad_suppressed) > 0:
        raise ValueError(
            f"Suppressed cells have non-null median_sale_price: "
            f"{len(bad_suppressed)} records"
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

    # --- Derive web assets dir if not explicitly provided ---
    if web_assets_dir is None:
        web_assets_dir = output_dir.parent / "frontend" / "public" / "data"

    # --- Load and prepare census tract geometry ---
    dim_tract = gpd.read_parquet(dim_tract_path)
    if len(dim_tract) == 0:
        raise ValueError("dim_census_tract.parquet is empty (0 rows)")

    if "geometry" not in dim_tract.columns:
        raise ValueError("dim_census_tract.parquet is missing the geometry column")

    # Identify St. Pete tracts: any tract with >=1 qualified sale in any quarter
    st_pete_geoids = sorted(
        df.loc[df["qualified_sale_count"].notna(), "tract_geoid"].unique()
    )
    print(f"St. Petersburg tracts (with sales): {len(st_pete_geoids)}")

    # --- Generate simplified GeoJSON for web (ALL Pinellas, existing behavior) ---
    dim_tract_4326 = dim_tract.to_crs("EPSG:4326")
    dim_tract_4326["geometry"] = dim_tract_4326["geometry"].simplify(
        0.0001, preserve_topology=True
    )

    tract_summary = df.groupby("tract_geoid").agg(
        total_qualified_sales=("qualified_sale_count", "sum"),
        latest_median=("median_sale_price", "last"),
    ).reset_index()

    geojson_tracts = dim_tract_4326.merge(
        tract_summary, on="tract_geoid", how="left"
    )

    # Validate: no duplicate tract GEOIDs in the full GeoJSON
    geojson_geoids = geojson_tracts["tract_geoid"].tolist()
    if len(geojson_geoids) != len(set(geojson_geoids)):
        raise ValueError(
            "Full GeoJSON contains duplicate tract_geoid values"
        )

    geojson_path = output_dir / "pinellas_tracts_dashboard.geojson"
    geojson_tracts.to_file(geojson_path, driver="GeoJSON")
    print(f"GeoJSON (all Pinellas): {geojson_path}")

    # --- NEW: Browser-ready web assets ---
    # 1. St. Pete filtered tracts GeoJSON
    stp_geojson_path = _build_tracts_geojson(dim_tract, st_pete_geoids, web_assets_dir)

    # 2. Tract-quarter market data JSON
    market_json_path = _build_market_json(df, st_pete_geoids, web_assets_dir)

    # 3. Metadata JSON
    metadata_path = _build_metadata(df, config, web_assets_dir)

    # --- Validate generated assets ---
    validation_errors = validate_publication_assets(
        stp_geojson_path, market_json_path, metadata_path, df, dim_tract
    )
    if validation_errors:
        for err in validation_errors:
            print(f"VALIDATION ERROR: {err}")
        raise ValueError(
            f"Publication asset validation failed with "
            f"{len(validation_errors)} error(s)"
        )

    # --- Summary ---
    cells = len(df)
    cells_with_sales = int(df["qualified_sale_count"].notna().sum())
    print(f"Dashboard published: {cells} cells, {cells_with_sales} with sales")
    print(f"  Columns: {list(df.columns)[:12]}...")

    return {
        "dashboard_path": str(final_path),
        "total_cells": cells,
        "cells_with_sales": cells_with_sales,
        "st_pete_tracts": len(st_pete_geoids),
        "web_assets": {
            "tracts_geojson": str(stp_geojson_path),
            "market_json": str(market_json_path),
            "metadata_json": str(metadata_path),
        },
    }
