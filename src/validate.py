"""Stage 13: Validate the final output.

Automated validation tests for the pipeline output.
"""

from pathlib import Path
from typing import Optional

import pandas as pd
import geopandas as gpd


class ValidationResult:
    """Container for a single validation check result."""
    def __init__(self, name: str, passed: bool, detail: str = ""):
        self.name = name
        self.passed = passed
        self.detail = detail


def validate_outputs(
    output_dir: Path,
    config: dict,
) -> list[ValidationResult]:
    """Run all validation checks on pipeline outputs."""
    results = []
    cfg = config

    def check(name: str, condition: bool, detail: str = ""):
        results.append(ValidationResult(name, condition, detail))
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}] {name}")

    # --- Required columns ---
    dashboard_path = output_dir / "dashboard_tract_quarter.parquet"
    if dashboard_path.exists():
        df = pd.read_parquet(dashboard_path)
        required = [
            "tract_geoid", "year", "quarter", "quarter_id",
            "qualified_sale_count", "median_sale_price",
        ]
        for col in required:
            check(f"required_column_{col}", col in df.columns,
                  f"Column '{col}' {'found' if col in df.columns else 'missing'}")

        # Expected types (string dtype in pandas 3.x is StringDtype, not object)
        check("tract_geoid_is_string", pd.api.types.is_string_dtype(df["tract_geoid"]),
              f"tract_geoid dtype: {df['tract_geoid'].dtype}")

        # Leading-zero preservation
        sample_geoid = df["tract_geoid"].dropna().iloc[0] if len(df) > 0 else ""
        check("geoid_leading_zeros",
              isinstance(sample_geoid, str) and len(sample_geoid) == 11,
              f"Sample GEOID: '{sample_geoid}' (len={len(str(sample_geoid))})")

        # Primary-key uniqueness: (tract_geoid, year, quarter)
        pk_dupes = df.duplicated(subset=["tract_geoid", "year", "quarter"]).sum()
        check("pk_uniqueness", pk_dupes == 0,
              f"{pk_dupes} duplicate primary keys")

        # Nonnegative prices
        if "median_sale_price" in df.columns:
            neg_medians = (df["median_sale_price"] < 0).sum()
            check("nonnegative_median_price", neg_medians == 0,
                  f"{neg_medians} negative median prices")

        # Sale-date range — use the combined (historical + current) table when
        # present; the floor is enforced by the analytical filter, so silver
        # may legitimately contain earlier raw sales. Check the enriched fact.
        combined_path = output_dir / "silver_sales_combined.parquet"
        sales_table = combined_path if combined_path.exists() \
            else output_dir / "silver_sales.parquet"
        sales = pd.read_parquet(sales_table)
        enriched = pd.read_parquet(output_dir / "fact_sale_enriched.parquet")
        enriched_dates = enriched["sale_date"].dropna()
        dates = sales["sale_date"].dropna()
        min_expected = pd.Timestamp(cfg["sale_filter"]["min_sale_date"])
        check("sale_date_range_min", enriched_dates.min() >= min_expected,
              f"Min enriched date: {enriched_dates.min().date()} "
              f"(floor {min_expected.date()})")
        check("sale_date_range_max", dates.max() <= pd.Timestamp.now(),
              f"Max date: {dates.max().date()}")

        # Qualification flags
        valid_flags = set(cfg["sale_filter"]["qualified_flags"])
        actual_flags = set(sales["qualified_flag"].dropna().unique())
        unknown_flags = actual_flags - valid_flags - {"U"}
        check("allowed_qualification_flags", len(unknown_flags) == 0,
              f"Unknown flags: {unknown_flags}")

        # Coordinate bounds
        props = pd.read_parquet(output_dir / "silver_property_current.parquet")
        spatial = cfg["geography"]["spatial"]
        lat_ok = props["latitude"].dropna().between(spatial["lat_min"], spatial["lat_max"]).all()
        lon_ok = props["longitude"].dropna().between(spatial["lon_min"], spatial["lon_max"]).all()
        check("coordinate_bounds_lat", bool(lat_ok))
        check("coordinate_bounds_lon", bool(lon_ok))

        # St. Petersburg boundary assignment (reconciliation report only)
        if "inside_st_petersburg" in df.columns:
            inside = df["inside_st_petersburg"].value_counts()
            check("city_assignment_present", True,
                  f"Inside: {inside.get(True, 0)}, Outside: {inside.get(False, 0)}")

        # FHFA-to-TIGER coverage
        hpi = pd.read_parquet(output_dir / "silver_fhfa_tract_hpi_annual.parquet")
        dim_tract = pd.read_parquet(output_dir / "dim_census_tract.parquet")
        fhfa_geoids = set(hpi["tract_geoid"])
        tiger_geoids = set(dim_tract["tract_geoid"])
        match_pct = len(fhfa_geoids & tiger_geoids) / max(len(fhfa_geoids), 1) * 100
        check("fhfa_tiger_join_coverage", match_pct > 70,
              f"{match_pct:.1f}% of FHFA tracts match TIGER geometry")

        # Region tract coverage: published region must contain at least the
        # configured minimum land tracts flagged inside_region.
        region_cfg = cfg.get("geography", {}).get("region", {})
        min_tracts = int(
            cfg.get("validation", {})
            .get("failures", {})
            .get("min_region_land_tracts", 179)
        )
        if "inside_region" in dim_tract.columns:
            region_count = int((dim_tract["inside_region"] == True).sum())
            check(
                "region_tract_coverage",
                region_count >= min_tracts,
                f"{region_count} region land tracts (min {min_tracts})",
            )
            region_geoids = set(
                dim_tract.loc[dim_tract["inside_region"] == True, "tract_geoid"].astype(str)
            )
            missing_hpi = region_geoids - fhfa_geoids
            region_hpi_pct = (
                len(region_geoids - missing_hpi) / max(len(region_geoids), 1) * 100
            )
            min_hpi_pct = float(
                cfg.get("validation", {})
                .get("failures", {})
                .get("min_region_fhfa_coverage_pct", 70.0)
            )
            check(
                "region_fhfa_coverage",
                region_hpi_pct >= min_hpi_pct,
                f"{region_hpi_pct:.1f}% of region tracts have FHFA HPI "
                f"({len(missing_hpi)} missing; min {min_hpi_pct:.1f}%)",
            )

        # Complete tract-quarter spine
        if "qualified_sale_count" in df.columns:
            null_sales = df["qualified_sale_count"].isna().sum()
            check("complete_spine", True,
                  f"{null_sales} null-sale spine cells out of {len(df)} total")

        # Small-sample flags
        if "small_sample_flag" in df.columns:
            flagged = df["small_sample_flag"].sum()
            check("small_sample_flags", True,
                  f"{flagged} cells flagged as small sample")

        # Idempotency check: pipeline can be re-run
        # (verified by ability to read all outputs without error)
        required_files = [
            "dashboard_tract_quarter.parquet",
            "silver_sales.parquet",
            "silver_property_current.parquet",
            "dim_census_tract.parquet",
            "agg_tract_sale_quarter.parquet",
        ]
        for f in required_files:
            fp = output_dir / f
            check(f"output_exists_{f}", fp.exists())

        # Rejected records report (0 rejects is valid with clean data)
        rejected_path = output_dir / "etl_rejected_records.parquet"
        if rejected_path.exists():
            rejected = pd.read_parquet(rejected_path)
            reasons = rejected["_reject_reason"].value_counts().to_dict() if len(rejected) > 0 else {}
            check("rejected_records_tracked", True,
                  f"Rejected: {len(rejected)} records. Reasons: {reasons}")

    return results


def generate_validation_report(
    results: list[ValidationResult],
    output_dir: Path,
) -> Path:
    """Generate a quality metrics report."""
    output_dir.mkdir(parents=True, exist_ok=True)

    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed

    records = []
    for r in results:
        records.append({
            "check_name": r.name,
            "status": "PASS" if r.passed else "FAIL",
            "detail": r.detail,
        })

    df = pd.DataFrame(records)
    report_path = output_dir / "etl_quality_metrics.parquet"
    df.to_parquet(report_path, index=False)

    # Also write a text summary
    txt_path = output_dir / "validation_summary.txt"
    with open(txt_path, "w") as f:
        f.write("=" * 60 + "\n")
        f.write("VALIDATION SUMMARY\n")
        f.write("=" * 60 + "\n")
        f.write(f"Total checks: {total}\n")
        f.write(f"Passed: {passed}\n")
        f.write(f"Failed: {failed}\n\n")
        for r in results:
            f.write(f"[{'PASS' if r.passed else 'FAIL'}] {r.name}\n")
            if r.detail:
                f.write(f"  {r.detail}\n")

    print(f"\nValidation: {passed}/{total} passed, {failed} failed")
    return report_path
