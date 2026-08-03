"""Stage 7: Assign parcels to Census tracts.

Uses spatial point-in-polygon with 2020 TIGER/Line tracts (Pinellas only).
One tract per parcel point. Compares with PCPAO CENSUS field.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

from .utils import build_region_geometries, pad_tract_geoid, utc_now


def assign_tracts(
    enriched_sales_path: Path,
    tract_shp: Path,
    place_shp: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Spatially assign each valid region parcel point to one Census tract."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load and filter tracts to Pinellas County
    tracts = gpd.read_file(tract_shp)
    state_fp = config["geography"]["state_fips"]
    county_fp = config["geography"]["county_fips"]
    geoid_field = config["geography"]["tiger_fields"]["geoid"]

    pinellas_tracts = tracts[
        (tracts[config["geography"]["tiger_fields"]["state_fp"]] == state_fp) &
        (tracts[config["geography"]["tiger_fields"]["county_fp"]] == county_fp)
    ].copy()

    pinellas_tracts = pinellas_tracts.to_crs("EPSG:4326")
    pinellas_tracts["tract_geoid"] = pinellas_tracts[geoid_field].astype(str).str.strip().str.zfill(11)

    # Region membership (tract-level): land & (centroid_lat <= cutoff |
    # intersects allowlist place union | intersects Clearwater Beach box)
    places = gpd.read_file(place_shp).to_crs("EPSG:4326")
    region_union, cw_island = build_region_geometries(places, config)
    region_cutoff = float(config["geography"]["region"]["cutoff_latitude"])
    land_only = pinellas_tracts["ALAND"].astype(float) > 0
    centroid_lat = pinellas_tracts.geometry.centroid.y
    inside_region = (
        (centroid_lat <= region_cutoff)
        | pinellas_tracts.geometry.intersects(region_union)
        | pinellas_tracts.geometry.intersects(cw_island)
    ) & land_only
    pinellas_tracts["inside_region"] = inside_region

    # Save dim_census_tract (geometry)
    dim_tract = pinellas_tracts[["tract_geoid", "NAME", "ALAND", "AWATER", "inside_region", "geometry"]].copy()
    dim_tract = dim_tract.rename(columns={"NAME": "tract_name"})
    dim_tract["tract_boundary_vintage"] = "2020"
    dim_tract.to_parquet(output_dir / "dim_census_tract.parquet", index=False)

    # Load enriched sales
    sales = pd.read_parquet(enriched_sales_path)

    # Get unique region parcels with coordinates
    region_parcels = sales[
        (sales["inside_region"] == True) &
        sales["latitude"].notna() &
        sales["longitude"].notna()
    ][["strap", "latitude", "longitude", "pcpao_census_tract"]].drop_duplicates(subset=["strap"]).copy()

    if len(region_parcels) == 0:
        print("WARNING: No region parcels with coordinates for tract assignment")
        return {"tracts_assigned": 0}

    # Create point geometries
    geometry = [Point(lon, lat) for lon, lat in
                zip(region_parcels["longitude"], region_parcels["latitude"])]
    parcels_gdf = gpd.GeoDataFrame(region_parcels, geometry=geometry, crs="EPSG:4326")

    # Spatial join to tracts
    tract_fields = ["tract_geoid", "NAME", "geometry"]
    joined = gpd.sjoin(parcels_gdf, pinellas_tracts[tract_fields],
                       how="left", predicate="within")

    # Check for ambiguous matches (one parcel in multiple tracts)
    dupe_parcels = joined[joined.duplicated(subset=["strap"], keep=False)]
    ambiguous_count = dupe_parcels["strap"].nunique()

    # Deduplicate: keep first match per parcel
    joined = joined.drop_duplicates(subset=["strap"], keep="first")

    # Build assignment DataFrame
    assignment = joined[["strap", "tract_geoid", "NAME"]].copy()
    assignment = assignment.rename(columns={"NAME": "tract_name"})
    assignment["tract_assignment_method"] = "spatial_within"
    assignment["tract_boundary_vintage"] = "2020"
    # Phase 3 geography model: every parcel point (historical or current)
    # is assigned directly to fixed 2020 geography
    assignment["geography_method"] = "direct_point_to_2020_tract"
    assignment["tract_assignment_quality_flag"] = None
    assignment.loc[assignment["strap"].isin(dupe_parcels["strap"].unique()),
                   "tract_assignment_quality_flag"] = "AMBIGUOUS_MULTI_TRACT"

    # Mark parcels that didn't match a tract
    no_tract = set(region_parcels["strap"]) - set(assignment["strap"])
    if no_tract:
        no_tract_df = pd.DataFrame({
            "strap": list(no_tract),
            "tract_geoid": None,
            "tract_name": None,
            "tract_assignment_method": None,
            "tract_boundary_vintage": "2020",
            "geography_method": "unassigned",
            "tract_assignment_quality_flag": "NO_TRACT_MATCH",
        })
        assignment = pd.concat([assignment, no_tract_df], ignore_index=True)

    # --- PCPAO CENSUS comparison ---
    assignment = assignment.merge(
        region_parcels[["strap", "pcpao_census_tract"]], on="strap", how="left"
    )

    # Normalize PCPAO census tract to 11-char for comparison
    assignment["pcpao_census_normalized"] = assignment["pcpao_census_tract"].apply(
        lambda x: str(x).strip().zfill(11) if pd.notna(x) and str(x).strip() not in ("", "nan") else None
    )

    # Compare
    assignment["_tract_match"] = (
        assignment["tract_geoid"] == assignment["pcpao_census_normalized"]
    )
    matched = assignment["_tract_match"].sum()
    mismatched = (~assignment["_tract_match"]).sum() - assignment["pcpao_census_normalized"].isna().sum()
    no_pcpao = assignment["pcpao_census_normalized"].isna().sum()

    # Tract discrepancy report
    disc_report = pd.DataFrame({
        "category": [
            "tracts_match_pcpao",
            "tracts_differ_from_pcpao",
            "no_pcpao_tract_field",
            "ambiguous_multi_tract",
            "no_tract_match",
            "total_region_parcels",
        ],
        "count": [
            int(matched),
            int(mismatched),
            int(no_pcpao),
            int(ambiguous_count),
            int(len(no_tract)),
            int(len(region_parcels)),
        ],
    })
    disc_path = output_dir / "report_tract_discrepancy.parquet"
    disc_report.to_parquet(disc_path, index=False)

    # Save parcel-tract assignment
    assign_cols = ["strap", "tract_geoid", "tract_name", "tract_assignment_method",
                   "tract_boundary_vintage", "geography_method",
                   "tract_assignment_quality_flag"]
    assignment[assign_cols].to_parquet(output_dir / "silver_parcel_tract.parquet", index=False)

    # Merge tract assignment back to sales
    sales = sales.merge(assignment[assign_cols], on="strap", how="left")
    sales.to_parquet(enriched_sales_path, index=False)

    print(f"Tract assignment: {len(assignment)} parcels, {ambiguous_count} ambiguous, "
          f"{len(no_tract)} unmatched, {int(matched)} match PCPAO")
    return {
        "tracts_assigned": len(assignment) - len(no_tract),
        "ambiguous": int(ambiguous_count),
        "unmatched": len(no_tract),
        "pcpao_match": int(matched),
        "pcpao_mismatch": int(mismatched),
        "discrepancy_report": str(disc_path),
    }
