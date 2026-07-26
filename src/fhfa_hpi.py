"""Stage 8: Filter and normalize FHFA tract HPI.

Filters national FHFA file to Pinellas County (12103 prefix),
zero-pads tract GEOIDs, validates uniqueness, and joins to TIGER geometry.
"""

from pathlib import Path

import pandas as pd

from .utils import utc_now, pad_tract_geoid


def normalize_fhfa_hpi(
    bronze_path: Path,
    dim_tract_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Normalize FHFA annual tract HPI data for Pinellas County."""
    output_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_parquet(bronze_path)
    cfg = config["fhfa"]
    prefix = cfg["tract_id_prefix"]

    # Convert tract to zero-padded string
    df["tract_geoid"] = df[cfg["fields"]["tract_geoid"]].apply(pad_tract_geoid)

    # Filter to Pinellas County (state 12 + county 103)
    pinellas_hpi = df[df["tract_geoid"].str.startswith(prefix, na=False)].copy()

    # Rename fields
    pinellas_hpi = pinellas_hpi.rename(columns={
        cfg["fields"]["state_abbr"]: "state_abbr",
        cfg["fields"]["year"]: "year",
        cfg["fields"]["annual_change"]: "annual_change",
        cfg["fields"]["hpi"]: "hpi",
        cfg["fields"]["hpi1990"]: "hpi1990",
        cfg["fields"]["hpi2000"]: "hpi2000",
    })

    # Select canonical columns
    cols = ["tract_geoid", "state_abbr", "year", "annual_change",
            "hpi", "hpi1990", "hpi2000"]
    available_cols = [c for c in cols if c in pinellas_hpi.columns]
    pinellas_hpi = pinellas_hpi[available_cols].copy()

    # Ensure HPI values are null (never zero)
    for col in ["hpi", "hpi1990", "hpi2000"]:
        if col in pinellas_hpi.columns:
            pinellas_hpi[col] = pd.to_numeric(pinellas_hpi[col], errors="coerce")
            pinellas_hpi.loc[pinellas_hpi[col] == 0, col] = None

    # Phase 3 geography provenance: HPI is preserved on its source tract
    # codes, never crosswalked. The measured GEOID set matches 2020 TIGER
    # 100% (see docs/fhfa-hpi-vintage.md); vintage_expected comes from config
    # and must be confirmed against the FHFA release documentation.
    pinellas_hpi["fhfa_tract_vintage"] = cfg.get("vintage_expected", "unconfirmed")
    pinellas_hpi["fhfa_geography_method"] = "source_tract_code"
    pinellas_hpi["fhfa_source_release"] = "hpi_at_tract.csv"

    # Lineage
    pinellas_hpi["_pipeline_run_id"] = run_id
    pinellas_hpi["_normalized_at_utc"] = utc_now()

    # --- Validate uniqueness on (tract_geoid, year) ---
    dupes = pinellas_hpi.duplicated(subset=["tract_geoid", "year"], keep=False)
    dupe_count = int(dupes.sum())
    if dupe_count > 0:
        print(f"WARNING: {dupe_count} duplicate tract-year records in FHFA HPI")
        pinellas_hpi = pinellas_hpi.drop_duplicates(
            subset=["tract_geoid", "year"], keep="first"
        )

    # Save silver FHFA HPI
    hpi_path = output_dir / "silver_fhfa_tract_hpi_annual.parquet"
    pinellas_hpi.to_parquet(hpi_path, index=False)

    # Save fact table (same data, different naming)
    fact_path = output_dir / "fact_tract_hpi_annual.parquet"
    pinellas_hpi.to_parquet(fact_path, index=False)

    # --- Join validation with TIGER tracts ---
    if dim_tract_path.exists():
        dim_tract = pd.read_parquet(dim_tract_path)
        tiger_geoids = set(dim_tract["tract_geoid"])
        fhfa_geoids = set(pinellas_hpi["tract_geoid"])

        fhfa_matched = fhfa_geoids & tiger_geoids
        fhfa_no_geom = fhfa_geoids - tiger_geoids
        tracts_no_hpi = tiger_geoids - fhfa_geoids

        coverage = pd.DataFrame({
            "category": [
                "fhfa_matched_to_geometry",
                "fhfa_no_matching_geometry",
                "tracts_with_geometry_no_fhfa",
                "duplicate_tract_year",
            ],
            "count": [
                len(fhfa_matched),
                len(fhfa_no_geom),
                len(tracts_no_hpi),
                dupe_count,
            ],
        })

        if len(fhfa_no_geom) > 0:
            print(f"WARNING: {len(fhfa_no_geom)} FHFA tracts with no matching TIGER geometry")
        if len(tracts_no_hpi) > 0:
            print(f"WARNING: {len(tracts_no_hpi)} TIGER tracts with no FHFA HPI data")
    else:
        coverage = pd.DataFrame({
            "category": ["dim_tract_not_available"],
            "count": [0],
        })

    coverage_path = output_dir / "report_fhfa_tiger_coverage.parquet"
    coverage.to_parquet(coverage_path, index=False)

    print(f"FHFA HPI: {len(pinellas_hpi)} Pinellas records, "
          f"{pinellas_hpi['tract_geoid'].nunique()} unique tracts, "
          f"years {pinellas_hpi['year'].min()}-{pinellas_hpi['year'].max()}")

    return {
        "hpi_path": str(hpi_path),
        "fact_path": str(fact_path),
        "coverage_report": str(coverage_path),
        "total_records": len(pinellas_hpi),
        "unique_tracts": pinellas_hpi["tract_geoid"].nunique(),
        "duplicate_tract_years": dupe_count,
    }
