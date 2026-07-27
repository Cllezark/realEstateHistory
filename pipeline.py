#!/usr/bin/env python3
"""St. Petersburg Real Estate ETL Pipeline.

Usage:
    python pipeline.py [--config CONFIG] [--stage STAGE] [--skip-validation]

One-command rebuild:
    python pipeline.py

Tests:
    pytest tests/
"""

import argparse
import sys
from pathlib import Path

import yaml

from src.utils import load_config, get_pipeline_run_id, ensure_dir
from src.inventory import run_inventory
from src.raw_manifest import run_raw_layer
from src.normalize_property import normalize_property
from src.normalize_sales import normalize_sales
from src.normalize_os_sales import normalize_os_sales
from src.sale_filter import apply_sale_filter
from src.city_membership import assign_city_membership
from src.tract_assignment import assign_tracts
from src.tract_bridge import build_tract_bridge
from src.fhfa_hpi import normalize_fhfa_hpi
from src.fred_mortgage import normalize_fred_mortgage
from src.tract_aggregate import build_tract_quarter_aggregate
from src.mortgage_payment import calculate_mortgage_payment
from src.publish import publish_dashboard
from src.validate import validate_outputs, generate_validation_report


STAGES = [
    "inventory",
    "raw_manifest",
    "normalize_property",
    "normalize_sales",
    "normalize_os_sales",
    "sale_filter",
    "city_membership",
    "tract_assignment",
    "tract_bridge",
    "fhfa_hpi",
    "fred_mortgage",
    "tract_aggregate",
    "mortgage_payment",
    "publish",
    "validate",
]


def main():
    parser = argparse.ArgumentParser(
        description="St. Petersburg Real Estate ETL Pipeline"
    )
    parser.add_argument("--config", default="config.yaml", help="Path to config YAML")
    parser.add_argument("--stage", choices=STAGES, help="Run a single stage")
    parser.add_argument("--skip-validation", action="store_true",
                        help="Skip final validation")
    args = parser.parse_args()

    config = load_config(args.config)
    run_id = get_pipeline_run_id()

    data_dir = Path(config["paths"]["data_dir"])
    output_dir = ensure_dir(Path(config["paths"]["output_dir"]))
    reports_dir = ensure_dir(Path(config["paths"]["reports_dir"]))

    print(f"Pipeline run ID: {run_id}")
    print(f"Data dir: {data_dir}")
    print(f"Output dir: {output_dir}")
    print()

    # Determine which stages to run
    if args.stage:
        stage_index = STAGES.index(args.stage)
        stages_to_run = [STAGES[stage_index]]
        print(f"Running single stage: {args.stage}")
    else:
        stages_to_run = STAGES
        if args.skip_validation:
            stages_to_run = [s for s in stages_to_run if s != "validate"]

    results = {}

    # Shared intermediate paths — defined up front so every stage can run
    # standalone via --stage without depending on an earlier block's locals
    enriched_path = output_dir / "fact_sale_enriched.parquet"
    dim_tract = output_dir / "dim_census_tract.parquet"

    # --- Stage 1: Inventory ---
    if "inventory" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 1: Inventory and Profile Inputs")
        print("=" * 60)
        results["inventory"] = run_inventory(data_dir, reports_dir)

    # --- Stage 2: Raw Manifest ---
    if "raw_manifest" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 2: Raw Manifest")
        print("=" * 60)
        results["raw"] = run_raw_layer(data_dir, output_dir, run_id)

    # --- Stage 3: Normalize Property ---
    if "normalize_property" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 3: Normalize Property Records")
        print("=" * 60)
        bronze_prop = output_dir / "bronze_property.parquet"
        results["property"] = normalize_property(bronze_prop, output_dir, run_id)

    # --- Stage 4: Normalize Sales ---
    if "normalize_sales" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 4: Normalize Sales Records")
        print("=" * 60)
        bronze_sales = output_dir / "bronze_sales.parquet"
        results["sales"] = normalize_sales(bronze_sales, output_dir, run_id)

    # --- Stage 4b: Normalize Historical Sales (Phase 3) ---
    if "normalize_os_sales" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 4b: Normalize Historical Sales (RP_OS_SALES)")
        print("=" * 60)
        bronze_os = output_dir / "bronze_os_sales.parquet"
        silver_sales = output_dir / "silver_sales.parquet"
        results["os_sales"] = normalize_os_sales(
            bronze_os, silver_sales, output_dir, config, run_id
        )

    # --- Stage 5: Sale Filter ---
    if "sale_filter" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 5: Analytical Sale Filter")
        print("=" * 60)
        sales_path = output_dir / "silver_sales_combined.parquet"
        prop_path = output_dir / "silver_property_current.parquet"
        results["filter"] = apply_sale_filter(
            sales_path, prop_path, output_dir, config, run_id
        )

    # --- Stage 6: City Membership ---
    if "city_membership" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 6: St. Petersburg Membership (Spatial)")
        print("=" * 60)
        place_shp = data_dir / config["paths"]["sources"]["tiger_place"]
        results["city"] = assign_city_membership(
            enriched_path, place_shp, output_dir, config, run_id
        )

    # --- Stage 7: Tract Assignment ---
    if "tract_assignment" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 7: Census Tract Assignment (Spatial)")
        print("=" * 60)
        tract_shp = data_dir / config["paths"]["sources"]["tiger_tract"]
        results["tract"] = assign_tracts(
            enriched_path, tract_shp, output_dir, config, run_id
        )

    # --- Stage 7b: 2010 Tract Dimension + 2010-2020 Bridge (audit layer) ---
    if "tract_bridge" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 7b: 2010 Tract Dimension + 2010-2020 Bridge")
        print("=" * 60)
        tract10_shp = data_dir / config["paths"]["sources"]["tiger_tract_2010"]
        relationship = data_dir / config["paths"]["sources"]["tract_relationship"]
        if tract10_shp.exists() and relationship.exists():
            results["bridge"] = build_tract_bridge(
                tract10_shp, relationship,
                output_dir / "dim_census_tract.parquet",
                output_dir, config, run_id,
            )
        else:
            print("2010 tract shapefile or relationship file missing — skipping")

    # --- Stage 8: FHFA HPI ---
    if "fhfa_hpi" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 8: FHFA Tract HPI")
        print("=" * 60)
        bronze_fhfa = output_dir / "bronze_fhfa_hpi.parquet"
        results["fhfa"] = normalize_fhfa_hpi(
            bronze_fhfa, dim_tract, output_dir, config, run_id
        )

    # --- Stage 9: FRED Mortgage ---
    if "fred_mortgage" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 9: FRED Mortgage Rates")
        print("=" * 60)
        bronze_fred = output_dir / "bronze_fred_mortgage.parquet"
        results["fred"] = normalize_fred_mortgage(
            bronze_fred, output_dir, config, run_id
        )

    # --- Stage 10: Tract-Quarter Aggregate ---
    if "tract_aggregate" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 10: Tract-Quarter Sale Aggregate")
        print("=" * 60)
        results["aggregate"] = build_tract_quarter_aggregate(
            enriched_path, dim_tract, output_dir, config, run_id
        )

    # --- Stage 11: Mortgage Payment ---
    if "mortgage_payment" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 11: Mortgage Payment Calculation")
        print("=" * 60)
        agg_path = output_dir / "agg_tract_sale_quarter.parquet"
        rate_path = output_dir / "fact_mortgage_rate_quarter.parquet"
        dashboard_path = calculate_mortgage_payment(
            agg_path, rate_path, output_dir, config, run_id
        )
        results["payment"] = {"dashboard_path": str(dashboard_path)}

    # --- Stage 12: Publish ---
    if "publish" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 12: Publish Analytical Tables")
        print("=" * 60)
        fhfa_fact = output_dir / "fact_tract_hpi_annual.parquet"
        dim_tract = output_dir / "dim_census_tract.parquet"
        web_assets_dir = output_dir.parent / "frontend" / "public" / "data"

        # Resolve dashboard_path: prefer results from stage 11, fall back to default
        try:
            resolved_dashboard = dashboard_path
        except NameError:
            resolved_dashboard = output_dir / "dashboard_tract_quarter.parquet"

        results["publish"] = publish_dashboard(
            resolved_dashboard,
            fhfa_fact,
            dim_tract,
            output_dir,
            config,
            run_id,
            web_assets_dir=web_assets_dir,
            enriched_sales_path=enriched_path,
        )

    # --- Stage 13: Validate ---
    if "validate" in stages_to_run:
        print("\n" + "=" * 60)
        print("STAGE 13: Validation")
        print("=" * 60)
        validation_results = validate_outputs(output_dir, config)
        generate_validation_report(validation_results, output_dir)
        results["validation"] = {
            "total": len(validation_results),
            "passed": sum(1 for r in validation_results if r.passed),
            "failed": sum(1 for r in validation_results if not r.passed),
        }
        if any(not r.passed for r in validation_results):
            print("\nWARNING: Some validation checks failed!")
            sys.exit(1)

    print(f"\n{'=' * 60}")
    print("PIPELINE COMPLETE")
    print(f"{'=' * 60}")
    print(f"Run ID: {run_id}")
    print(f"Output: {output_dir}")

    return results


if __name__ == "__main__":
    main()
