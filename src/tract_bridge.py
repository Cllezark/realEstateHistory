"""Stage 7b: 2010 Census tract dimension and the 2010↔2020 bridge (audit layer).

Loads native 2010 TIGER tract geometry for Pinellas County and the official
Census 2020↔2010 tract relationship file, classifies every boundary
relationship, and persists a crosswalk audit table.

IMPORTANT: the bridge is an AUDIT and VALIDATION layer only. Land-area shares
must never be used to redistribute medians, percentiles, rates, or other
non-additive housing-market values (see docs/historical-geography-methodology.md).
The dashboard's historical series is built by assigning parcel points directly
to 2020 tracts, not by crosswalking.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

from .utils import utc_now

# Land-part share below which a relationship row is a boundary sliver rather
# than a substantive overlap
SLIVER_SHARE = 0.01


def classify_relationships(rel: pd.DataFrame) -> pd.Series:
    """Classify each relationship row by split/merge topology."""
    n20_per_10 = rel.groupby("tract_geoid_2010")["tract_geoid_2020"].transform("nunique")
    n10_per_20 = rel.groupby("tract_geoid_2020")["tract_geoid_2010"].transform("nunique")

    out = pd.Series("one_to_one", index=rel.index)
    out[(n20_per_10 > 1) & (n10_per_20 > 1)] = "many_to_many"
    out[(n20_per_10 > 1) & (n10_per_20 <= 1)] = "one_2010_to_many_2020"
    out[(n20_per_10 <= 1) & (n10_per_20 > 1)] = "many_2010_to_one_2020"
    return out


def build_tract_bridge(
    tract10_shp: Path,
    relationship_path: Path,
    dim_tract_2020_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Build dim_census_tract_2010 and bridge_tract_2010_2020."""
    output_dir.mkdir(parents=True, exist_ok=True)
    geo = config["geography"]

    # --- 1. Native 2010 tract dimension ---
    t10 = gpd.read_file(tract10_shp)
    pin10 = t10[
        (t10["STATEFP10"] == geo["state_fips"])
        & (t10["COUNTYFP10"] == geo["county_fips"])
    ].copy()
    pin10 = pin10.to_crs("EPSG:4326")

    dim10 = pin10[["GEOID10", "NAME10", "ALAND10", "AWATER10", "geometry"]].rename(
        columns={
            "GEOID10": "tract_geoid_2010",
            "NAME10": "tract_name",
            "ALAND10": "land_area",
            "AWATER10": "water_area",
        }
    )
    dim10["tract_geoid_2010"] = dim10["tract_geoid_2010"].astype(str).str.zfill(11)
    dim10["tract_boundary_vintage"] = "2010"
    dim10["_pipeline_run_id"] = run_id
    dim10["_built_at_utc"] = utc_now()

    dim10_path = output_dir / "dim_census_tract_2010.parquet"
    dim10.to_parquet(dim10_path, index=False)
    print(f"dim_census_tract_2010: {len(dim10)} Pinellas tracts")

    # --- 2. Relationship file → bridge ---
    rel_raw = pd.read_csv(
        relationship_path,
        sep="|",
        encoding="utf-8-sig",
        dtype={"GEOID_TRACT_20": str, "GEOID_TRACT_10": str},
    )
    prefix = geo["state_fips"] + geo["county_fips"]
    rel = rel_raw[
        rel_raw["GEOID_TRACT_20"].str.startswith(prefix, na=False)
        | rel_raw["GEOID_TRACT_10"].str.startswith(prefix, na=False)
    ].copy()

    src_land = rel["AREALAND_TRACT_10"].where(rel["AREALAND_TRACT_10"] != 0)
    tgt_land = rel["AREALAND_TRACT_20"].where(rel["AREALAND_TRACT_20"] != 0)
    bridge = pd.DataFrame({
        "tract_geoid_2010": rel["GEOID_TRACT_10"].str.zfill(11),
        "tract_geoid_2020": rel["GEOID_TRACT_20"].str.zfill(11),
        "land_overlap": rel["AREALAND_PART"],
        "source_land_share": (rel["AREALAND_PART"] / src_land).round(6),
        "target_land_share": (rel["AREALAND_PART"] / tgt_land).round(6),
    })
    bridge["relationship_type"] = classify_relationships(bridge)

    # Quality flags: slivers and county-boundary crossers are audit-relevant
    flags = pd.Series(None, index=bridge.index, dtype="object")
    sliver = (
        bridge["source_land_share"].fillna(0).lt(SLIVER_SHARE)
        & bridge["target_land_share"].fillna(0).lt(SLIVER_SHARE)
    )
    flags[sliver] = "SLIVER_OVERLAP"
    crosses = (
        bridge["tract_geoid_2010"].str.startswith(prefix)
        != bridge["tract_geoid_2020"].str.startswith(prefix)
    )
    flags[crosses] = "CROSSES_COUNTY_BOUNDARY"
    bridge["crosswalk_quality_flag"] = flags

    bridge["crosswalk_release"] = "tab20_tract20_tract10_natl.txt (Census rel2020)"
    bridge["_pipeline_run_id"] = run_id
    bridge["_built_at_utc"] = utc_now()

    bridge_path = output_dir / "bridge_tract_2010_2020.parquet"
    bridge.to_parquet(bridge_path, index=False)

    # --- 3. Audit checks ---
    errors = []

    # Land parts must reconstruct each 2010 tract's land area (all-water
    # tracts have ALAND=0 and legitimately no land shares to reconstruct)
    share_sum = bridge.groupby("tract_geoid_2010")["source_land_share"].sum()
    land_tracts = share_sum[share_sum > 0]
    off = land_tracts[(land_tracts - 1).abs() > 0.01]
    if len(off) > 0:
        errors.append(f"{len(off)} 2010 tracts whose land parts do not sum to 100%")

    # Every 2020 dashboard tract must appear in the bridge
    dim20 = pd.read_parquet(dim_tract_2020_path)
    missing_2020 = set(dim20["tract_geoid"]) - set(bridge["tract_geoid_2020"])
    if missing_2020:
        errors.append(f"{len(missing_2020)} 2020 tracts absent from bridge")

    # Every native 2010 tract must appear
    missing_2010 = set(dim10["tract_geoid_2010"]) - set(bridge["tract_geoid_2010"])
    if missing_2010:
        errors.append(f"{len(missing_2010)} 2010 tracts absent from bridge")

    type_counts = bridge["relationship_type"].value_counts().to_dict()
    audit = pd.DataFrame([{
        "bridge_rows": len(bridge),
        "tracts_2010": bridge["tract_geoid_2010"].nunique(),
        "tracts_2020": bridge["tract_geoid_2020"].nunique(),
        **{f"type_{k}": v for k, v in type_counts.items()},
        "sliver_rows": int(sliver.sum()),
        "county_crossing_rows": int(crosses.sum()),
        "audit_errors": "; ".join(errors) if errors else None,
    }])
    audit_path = output_dir / "report_tract_bridge_audit.parquet"
    audit.to_parquet(audit_path, index=False)

    for e in errors:
        print(f"BRIDGE AUDIT WARNING: {e}")
    print(f"Bridge: {len(bridge)} rows, types {type_counts}")

    return {
        "dim_2010": str(dim10_path),
        "bridge": str(bridge_path),
        "audit_report": str(audit_path),
        "relationship_types": type_counts,
        "audit_errors": errors,
    }
