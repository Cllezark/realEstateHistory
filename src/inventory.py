"""Stage 1: Inventory and profile source files.

Discovers all relevant CSV, SHP, and data files in the data directory,
recording metadata, schema, data types, date ranges, and null percentages.
"""

import json
from pathlib import Path
from datetime import datetime

import pandas as pd
import shapefile

from .utils import sha256_hex, utc_now


def discover_source_files(data_dir: Path) -> dict:
    """Walk the data directory and classify files by type."""
    files = {
        "csv": [],
        "shapefile": set(),
        "other": [],
    }

    for p in sorted(data_dir.iterdir()):
        if p.name.startswith("."):
            continue
        suffix = p.suffix.lower()
        if suffix == ".csv":
            files["csv"].append(p)
        elif suffix in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
            files["shapefile"].add(p.stem)
        elif suffix in (".zip",):
            continue  # already extracted
        elif suffix in (".xml",):
            continue  # metadata
        else:
            files["other"].append(p)

    return files


def profile_csv(filepath: Path) -> dict:
    """Profile a single CSV file."""
    stat = filepath.stat()
    profile = {
        "source_file": filepath.name,
        "relative_path": str(filepath),
        "file_size_bytes": stat.st_size,
        "sha256": sha256_hex(filepath),
        "modification_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "file_type": "csv",
    }

    # Try utf-8 first, then latin-1
    for enc in ["utf-8", "latin-1"]:
        try:
            df = pd.read_csv(filepath, encoding=enc, low_memory=False)
            profile["encoding"] = enc
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        profile["encoding"] = "unknown"
        return profile

    profile["row_count"] = len(df)
    profile["column_count"] = len(df.columns)
    profile["original_columns"] = list(df.columns)
    profile["inferred_types"] = {col: str(dtype) for col, dtype in df.dtypes.items()}

    # Date range detection
    date_cols = []
    for col in df.columns:
        try:
            parsed = pd.to_datetime(df[col], errors="coerce")
            if parsed.notna().sum() > 0:
                date_cols.append({
                    "column": col,
                    "min_date": str(parsed.min()),
                    "max_date": str(parsed.max()),
                    "non_null_pct": round(parsed.notna().mean() * 100, 2),
                })
        except Exception:
            pass
    profile["date_columns"] = date_cols

    # Null percentages
    null_pcts = {}
    for col in df.columns:
        null_pct = df[col].isna().mean() * 100
        if null_pct > 0:
            null_pcts[col] = round(null_pct, 2)
    profile["null_percentages"] = null_pcts

    # Duplicate detection (sample)
    profile["exact_duplicate_count"] = int(df.duplicated().sum())

    return profile


def profile_shapefile(stem: str, data_dir: Path) -> dict:
    """Profile a shapefile set."""
    shp_path = data_dir / f"{stem}.shp"
    if not shp_path.exists():
        return {"stem": stem, "error": "Missing .shp file"}

    stat = shp_path.stat()
    profile = {
        "source_file": stem,
        "relative_path": str(shp_path),
        "file_size_bytes": stat.st_size,
        "sha256": sha256_hex(shp_path),
        "modification_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "file_type": "shapefile",
    }

    try:
        sf = shapefile.Reader(str(shp_path))
        fields = [f[0] for f in sf.fields[1:]]
        profile["row_count"] = len(sf)
        profile["column_count"] = len(fields)
        profile["original_columns"] = fields
        profile["geometry_type"] = str(sf.shapeType)

        # Sample first record
        if len(sf) > 0:
            rec = sf.record(0)
            profile["sample_record"] = dict(zip(fields, [str(v) for v in rec]))

    except Exception as e:
        profile["error"] = str(e)

    return profile


def run_inventory(data_dir: str | Path, reports_dir: str | Path) -> dict:
    """Run the full inventory stage and produce profiling reports."""
    data_dir = Path(data_dir)
    reports_dir = Path(reports_dir)
    reports_dir.mkdir(parents=True, exist_ok=True)

    files = discover_source_files(data_dir)

    inventory = {
        "pipeline_run_at": utc_now(),
        "data_directory": str(data_dir),
        "profiles": [],
    }

    # Profile CSVs
    for csv_path in files["csv"]:
        profile = profile_csv(csv_path)
        inventory["profiles"].append(profile)

    # Profile shapefiles
    for stem in sorted(files["shapefile"]):
        profile = profile_shapefile(stem, data_dir)
        inventory["profiles"].append(profile)

    # Write inventory
    inventory_path = reports_dir / "source_inventory.json"
    with open(inventory_path, "w") as f:
        json.dump(inventory, f, indent=2, default=str)

    # Write human-readable report
    report_path = reports_dir / "profiling_report.txt"
    with open(report_path, "w") as f:
        f.write("=" * 72 + "\n")
        f.write("SOURCE FILE PROFILING REPORT\n")
        f.write(f"Generated: {inventory['pipeline_run_at']}\n")
        f.write("=" * 72 + "\n\n")

        for p in inventory["profiles"]:
            f.write(f"File: {p.get('source_file', 'unknown')}\n")
            f.write(f"  Type: {p.get('file_type', 'unknown')}\n")
            f.write(f"  Size: {p.get('file_size_bytes', 0):,} bytes\n")
            f.write(f"  SHA-256: {p.get('sha256', 'N/A')[:16]}...\n")
            f.write(f"  Rows: {p.get('row_count', 'N/A')}\n")
            f.write(f"  Columns ({p.get('column_count', 0)}): {p.get('original_columns', [])}\n")
            f.write(f"  Encoding: {p.get('encoding', 'N/A')}\n")

            if "date_columns" in p:
                for dc in p["date_columns"]:
                    f.write(f"  Date column '{dc['column']}': {dc['min_date']} to {dc['max_date']} "
                            f"({dc['non_null_pct']}% non-null)\n")

            nulls = p.get("null_percentages", {})
            if nulls:
                f.write(f"  Columns with nulls: {list(nulls.keys())[:10]}\n")

            if "geometry_type" in p:
                f.write(f"  Geometry type: {p['geometry_type']}\n")

            if "error" in p:
                f.write(f"  ERROR: {p['error']}\n")

            f.write("\n")

    print(f"Inventory written to {inventory_path}")
    print(f"Report written to {report_path}")
    return inventory
