"""Stage 3: Normalize PCPAO property records.

Creates a canonical property record per STRAP with explicit source-to-canonical
column mapping. Handles latin-1 encoding and preserves snapshot history.
"""

from pathlib import Path

import pandas as pd

from .utils import utc_now


CANONICAL_PROPERTY_COLS = [
    "strap",
    "parcel_number",
    "parcel_type",
    "property_use",
    "land_use_code",
    "site_address",
    "site_city_zip",
    "tax_district",
    "tax_district_description",
    "current_tax_district",
    "current_tax_district_description",
    "pcpao_census_tract",
    "latitude",
    "longitude",
    "living_area_sqft",
    "gross_area_sqft",
    "parcel_area_sqft",
    "living_units",
    "year_built",
    "parcel_status",
    "roll_year",
    "site_city",
    "site_zip",
    "subdivision",
]


def normalize_property(bronze_path: Path, output_dir: Path, run_id: str) -> dict:
    """Normalize PCPAO property records to canonical schema.

    Returns paths to the snapshot table and the current-record view.
    """
    df = pd.read_parquet(bronze_path)

    # Build canonical DataFrame
    canonical = pd.DataFrame()

    # Direct mappings
    canonical["strap"] = df["STRAP"].astype(str).str.strip().str.zfill(18)
    canonical["parcel_number"] = df["PARCEL_NUMBER"].astype(str).str.strip()
    canonical["parcel_type"] = df["PARCEL_TYPE"].astype(str).str.strip()
    canonical["property_use"] = df["PROPERTY_USE"].astype(str).str.strip()
    canonical["land_use_code"] = pd.to_numeric(df["LAND_USE_CD"], errors="coerce")
    canonical["site_address"] = df["SITE_ADDRESS"].astype(str).str.strip()
    canonical["site_city_zip"] = df["SITE_CITYZIP"].astype(str).str.strip()
    canonical["site_city"] = df["STR_CITY"].astype(str).str.strip()
    canonical["site_zip"] = df["STR_ZIP"].astype(str).str.strip()
    canonical["subdivision"] = df["SUBDIVISION"].astype(str).str.strip()

    # Tax district
    canonical["tax_district"] = df["TAX_DISTRICT"].astype(str).str.strip()
    canonical["tax_district_description"] = df["TAX_DIST_DSCR"].astype(str).str.strip()
    canonical["current_tax_district"] = df["CURRENT_TAX_DISTRICT"].astype(str).str.strip()
    canonical["current_tax_district_description"] = df["CURRENT_TAX_DIST_DSCR"].astype(str).str.strip()

    # Census tract from PCPAO (preserve as provided)
    canonical["pcpao_census_tract"] = df["CENSUS"].astype(str).str.strip()
    canonical.loc[canonical["pcpao_census_tract"].isin(["nan", "None", ""]), "pcpao_census_tract"] = None

    # Coordinates
    canonical["latitude"] = pd.to_numeric(df["LATITUDE"], errors="coerce")
    canonical["longitude"] = pd.to_numeric(df["LONGITUDE"], errors="coerce")

    # Property attributes
    canonical["living_area_sqft"] = pd.to_numeric(df["TOTAL_LIVING_SQFT"], errors="coerce")
    canonical["gross_area_sqft"] = pd.to_numeric(df["TOTAL_GROSS_SQFT"], errors="coerce")

    # PCPAO's bulk export has no native sqft parcel-area column - only acreage.
    # Derive sqft with the standard 1 acre = 43,560 sqft conversion. This is an
    # approximation; PCPAO's per-parcel web UI shows a computed "Land Area" in
    # sqft that isn't present in this export.
    _ACRE_TO_SQFT = 43560
    canonical["parcel_area_sqft"] = pd.to_numeric(df["ACREAGE"], errors="coerce") * _ACRE_TO_SQFT

    canonical["living_units"] = pd.to_numeric(df["TOTAL_LIVING_UNITS"], errors="coerce")

    # Handle duplicate YEAR_BUILT column (take first non-null)
    yb1 = pd.to_numeric(df["YEAR_BUILT"], errors="coerce")
    if "YEAR_BUILT.1" in df.columns:
        yb2 = pd.to_numeric(df["YEAR_BUILT.1"], errors="coerce")
        canonical["year_built"] = yb1.fillna(yb2)
    else:
        canonical["year_built"] = yb1

    canonical["parcel_status"] = df["STATUS"].astype(str).str.strip()
    canonical["roll_year"] = pd.to_numeric(df["ROLL_YEAR"], errors="coerce")

    # Lineage
    canonical["_source_file"] = df["_source_file"]
    canonical["_source_row_number"] = df["_source_row_number"]
    canonical["_source_sha256"] = df["_source_sha256"]
    canonical["_ingested_at_utc"] = df["_ingested_at_utc"]
    canonical["_pipeline_run_id"] = df["_pipeline_run_id"]
    canonical["_normalized_at_utc"] = utc_now()

    # Validate STRAP
    canonical["_strap_valid"] = canonical["strap"].str.len() == 18

    output_dir.mkdir(parents=True, exist_ok=True)

    # Snapshot table: all records
    snapshot_path = output_dir / "silver_property_snapshot.parquet"
    canonical.to_parquet(snapshot_path, index=False)

    # Current-record view: latest roll_year per STRAP
    current = canonical.sort_values(
        ["strap", "roll_year", "_source_row_number"],
        ascending=[True, False, False]
    ).drop_duplicates(subset=["strap"], keep="first")

    current_path = output_dir / "silver_property_current.parquet"
    current.to_parquet(current_path, index=False)

    print(f"Normalized property: {len(canonical)} snapshot records, {len(current)} current STRAPs")
    return {
        "snapshot": str(snapshot_path),
        "current": str(current_path),
        "total_records": len(canonical),
        "unique_straps": len(current),
        "invalid_straps": int((~canonical["_strap_valid"]).sum()),
    }
