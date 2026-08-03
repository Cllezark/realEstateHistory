"""Shared utilities for the South Pinellas & Gulf Beaches Real Estate ETL pipeline."""

import hashlib
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

import geopandas as gpd
import yaml
import duckdb
from shapely.geometry import box


def load_config(config_path: str | Path = "config.yaml") -> dict:
    """Load YAML configuration."""
    with open(config_path) as f:
        return yaml.safe_load(f)


def get_pipeline_run_id() -> str:
    """Generate or retrieve a pipeline run ID."""
    return uuid.uuid4().hex[:12]


def sha256_hex(filepath: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def utc_now() -> str:
    """Return current UTC timestamp as ISO string."""
    return datetime.now(timezone.utc).isoformat()


def get_duckdb_conn(output_dir: Path) -> duckdb.DuckDBPyConnection:
    """Create a DuckDB connection for the pipeline."""
    conn = duckdb.connect()
    conn.execute("INSTALL spatial; LOAD spatial;")
    return conn


def ensure_dir(path: Path) -> Path:
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_parquet(df, path: Path):
    """Write DataFrame to Parquet using DuckDB."""
    import pandas as pd
    conn = duckdb.connect()
    # DuckDB can write parquet directly from a relation
    if isinstance(df, pd.DataFrame):
        conn.execute("CREATE TEMP TABLE _tmp AS SELECT * FROM df")
    else:
        conn.execute("CREATE TEMP TABLE _tmp AS SELECT * FROM df")
    conn.execute(f"COPY _tmp TO '{path}' (FORMAT PARQUET)")
    conn.close()


def build_region_geometries(places: gpd.GeoDataFrame, config: dict):
    """Build region allowlist union and Clearwater Beach island geometry.

    Returns (region_union, cw_island) in EPSG:4326. `places` must already be
    in EPSG:4326. Mirrors the geography.region config block.
    """
    region_cfg = config["geography"]["region"]
    region_places = places[places["PLACEFP"].isin(region_cfg["place_fips"])]
    if len(region_places) == 0:
        raise ValueError("No region municipalities found in place file")
    region_union = region_places.geometry.union_all()

    cw_fp = region_cfg["clearwater_place_fips"]
    cw = places[places["PLACEFP"] == cw_fp]
    if len(cw) == 0:
        raise ValueError(f"Clearwater (PLACEFP={cw_fp}) not found in place file")
    beach = region_cfg["clearwater_beach"]
    beach_box = box(
        beach["lon_min"], beach["lat_min"],
        beach["lon_max"], beach["lat_max"],
    )
    cw_island = cw.geometry.union_all().intersection(beach_box)
    return region_union, cw_island


def pad_tract_geoid(geoid_raw) -> Optional[str]:
    """Zero-pad a tract GEOID to 11 characters."""
    if geoid_raw is None:
        return None
    s = str(geoid_raw).strip()
    if not s:
        return None
    return s.zfill(11)


def parse_date_safe(date_val):
    """Safely parse a date, returning None on failure."""
    import pandas as pd
    if pd.isna(date_val):
        return None
    try:
        return pd.Timestamp(date_val)
    except (ValueError, TypeError):
        return None
