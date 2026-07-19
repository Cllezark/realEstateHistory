"""Stage 2: Raw manifest and immutable snapshot preservation.

Creates a raw manifest recording every source file with its hash and
adds lineage fields (source_file, source_row_number, source_sha256,
ingested_at_utc, pipeline_run_id) to staged records.
"""

from pathlib import Path
from typing import Optional

import pandas as pd
import duckdb

from .utils import sha256_hex, utc_now


def build_raw_manifest(data_dir: Path, output_dir: Path, run_id: str) -> pd.DataFrame:
    """Build a bronze source manifest of all tracked input files."""
    records = []
    files_to_track = [
        ("RP_SALES.csv", "pcpao_sales"),
        ("RP_PROPERTY_INFO.csv", "pcpao_property_info"),
        ("hpi_at_tract.csv", "fhfa_tract_hpi"),
        ("MORTGAGE30US.csv", "fred_mortgage"),
        ("tl_2020_12_tract.shp", "tiger_tract"),
        ("tl_2020_12_place.shp", "tiger_place"),
    ]

    for filename, source_class in files_to_track:
        filepath = data_dir / filename
        if not filepath.exists():
            continue
        stat = filepath.stat()
        records.append({
            "source_file": filename,
            "source_class": source_class,
            "file_size_bytes": stat.st_size,
            "source_sha256": sha256_hex(filepath),
            "modification_time_utc": pd.Timestamp(stat.st_mtime, unit="s", tz="UTC"),
            "ingested_at_utc": utc_now(),
            "pipeline_run_id": run_id,
        })

    manifest = pd.DataFrame(records)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest.to_parquet(output_dir / "bronze_source_manifest.parquet", index=False)
    print(f"Raw manifest: {len(manifest)} source files tracked")
    return manifest


def stage_sales_raw(data_dir: Path, output_dir: Path, run_id: str, manifest_sha: str) -> Path:
    """Stage raw PCPAO sales with lineage fields."""
    filepath = data_dir / "RP_SALES.csv"
    if not filepath.exists():
        raise FileNotFoundError(f"Sales source not found: {filepath}")

    df = pd.read_csv(filepath)
    df["_source_file"] = "RP_SALES.csv"
    df["_source_row_number"] = range(1, len(df) + 1)
    df["_source_sha256"] = manifest_sha
    df["_ingested_at_utc"] = utc_now()
    df["_pipeline_run_id"] = run_id

    # Ensure STRAP is string with leading zeros
    df["STRAP"] = df["STRAP"].astype(str).str.strip().str.zfill(18)
    df["SALE_ID"] = df["SALE_ID"].astype(str).str.strip()

    out_path = output_dir / "bronze_sales.parquet"
    df.to_parquet(out_path, index=False)
    print(f"Staged {len(df)} raw sales records")
    return out_path


def stage_property_raw(data_dir: Path, output_dir: Path, run_id: str, manifest_sha: str) -> Path:
    """Stage raw PCPAO property info with lineage fields."""
    filepath = data_dir / "RP_PROPERTY_INFO.csv"
    if not filepath.exists():
        raise FileNotFoundError(f"Property info source not found: {filepath}")

    df = pd.read_csv(filepath, encoding="latin-1", low_memory=False)
    df["_source_file"] = "RP_PROPERTY_INFO.csv"
    df["_source_row_number"] = range(1, len(df) + 1)
    df["_source_sha256"] = manifest_sha
    df["_ingested_at_utc"] = utc_now()
    df["_pipeline_run_id"] = run_id

    # Ensure STRAP as 18-char string
    df["STRAP"] = df["STRAP"].astype(str).str.strip().str.zfill(18)

    out_path = output_dir / "bronze_property.parquet"
    df.to_parquet(out_path, index=False)
    print(f"Staged {len(df)} raw property records")
    return out_path


def stage_fhfa_raw(data_dir: Path, output_dir: Path, run_id: str, manifest_sha: str) -> Path:
    """Stage raw FHFA HPI data with lineage fields."""
    filepath = data_dir / "hpi_at_tract.csv"
    if not filepath.exists():
        raise FileNotFoundError(f"FHFA HPI source not found: {filepath}")

    df = pd.read_csv(filepath)
    df["_source_file"] = "hpi_at_tract.csv"
    df["_source_row_number"] = range(1, len(df) + 1)
    df["_source_sha256"] = manifest_sha
    df["_ingested_at_utc"] = utc_now()
    df["_pipeline_run_id"] = run_id

    out_path = output_dir / "bronze_fhfa_hpi.parquet"
    df.to_parquet(out_path, index=False)
    print(f"Staged {len(df)} raw FHFA HPI records")
    return out_path


def stage_fred_raw(data_dir: Path, output_dir: Path, run_id: str, manifest_sha: str) -> Path:
    """Stage raw FRED mortgage data with lineage fields."""
    filepath = data_dir / "MORTGAGE30US.csv"
    if not filepath.exists():
        raise FileNotFoundError(f"FRED mortgage source not found: {filepath}")

    df = pd.read_csv(filepath)
    df["_source_file"] = "MORTGAGE30US.csv"
    df["_source_row_number"] = range(1, len(df) + 1)
    df["_source_sha256"] = manifest_sha
    df["_ingested_at_utc"] = utc_now()
    df["_pipeline_run_id"] = run_id

    out_path = output_dir / "bronze_fred_mortgage.parquet"
    df.to_parquet(out_path, index=False)
    print(f"Staged {len(df)} raw FRED mortgage records")
    return out_path


def run_raw_layer(data_dir: str | Path, output_dir: str | Path, run_id: str) -> dict:
    """Run Stage 2: Build raw manifest and stage all source data."""
    data_dir = Path(data_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = build_raw_manifest(data_dir, output_dir, run_id)
    # Use sales file hash as representative manifest hash
    manifest_sha = manifest.loc[manifest["source_file"] == "RP_SALES.csv", "source_sha256"].values[0]

    results = {
        "manifest": str(output_dir / "bronze_source_manifest.parquet"),
        "sales": str(stage_sales_raw(data_dir, output_dir, run_id, manifest_sha)),
        "property": str(stage_property_raw(data_dir, output_dir, run_id, manifest_sha)),
        "fhfa": str(stage_fhfa_raw(data_dir, output_dir, run_id, manifest_sha)),
        "fred": str(stage_fred_raw(data_dir, output_dir, run_id, manifest_sha)),
    }
    return results
