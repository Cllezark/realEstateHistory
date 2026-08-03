"""Stage 6: Determine whether a parcel is in the dashboard region.

The dashboard region (south Pinellas + Gulf beaches) is defined by:
  - latitude cutoff (parcel point at or below cutoff_latitude), or
  - point-in-polygon within any allowlist municipality, or
  - point within the Clearwater Beach island box.
St. Petersburg membership is kept separately for reconciliation reporting.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, box

from .utils import build_region_geometries, utc_now


def assign_city_membership(
    enriched_sales_path: Path,
    place_shp: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Spatially assign each parcel to the dashboard region and St. Pete city.

    Computes two flags:
    - ``inside_region``: membership in the south Pinellas dashboard region
      (latitude cutoff, allowlist municipalities, Clearwater Beach box).
    - ``inside_st_petersburg``: kept for reconciliation reporting only.

    Uses boundary-inclusive 'within' predicates.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load St. Pete boundary (reconciliation only)
    places = gpd.read_file(place_shp)
    place_fips = config["geography"]["city"]["place_fips"]
    st_pete = places[places["PLACEFP"] == place_fips].copy()

    if len(st_pete) == 0:
        raise ValueError(f"St. Petersburg (PLACEFP={place_fips}) not found in place file")

    st_pete = st_pete.to_crs("EPSG:4326")
    city_geom = st_pete.geometry.iloc[0]

    # Build region membership geometries (allowlist union + beach island box)
    places_4326 = places.to_crs("EPSG:4326")
    region_union, cw_island = build_region_geometries(places_4326, config)
    region_cutoff = float(config["geography"]["region"]["cutoff_latitude"])

    # Save boundary for dashboard
    st_pete[["GEOID", "NAME"]].to_parquet(output_dir / "dim_st_petersburg_boundary.parquet", index=False)

    # Load enriched sales - get unique parcel coordinates from property join
    sales = pd.read_parquet(enriched_sales_path)

    # Get unique parcels with coords
    parcels = sales[[
        "strap", "latitude", "longitude", "land_use_code",
        "tax_district", "tax_district_description", "pcpao_census_tract",
        "parcel_type", "site_city"
    ]].drop_duplicates(subset=["strap"]).copy()

    # Validate coordinate ranges
    cfg_spatial = config["geography"]["spatial"]
    lat_valid = parcels["latitude"].between(cfg_spatial["lat_min"], cfg_spatial["lat_max"])
    lon_valid = parcels["longitude"].between(cfg_spatial["lon_min"], cfg_spatial["lon_max"])
    parcels["_coord_valid"] = lat_valid & lon_valid
    parcels["_coord_missing"] = parcels["latitude"].isna() | parcels["longitude"].isna()

    # Create points for valid coordinates
    valid_coords = parcels[parcels["_coord_valid"] & ~parcels["_coord_missing"]].copy()
    geometry = [Point(lon, lat) for lon, lat in zip(valid_coords["longitude"], valid_coords["latitude"])]
    parcels_gdf = gpd.GeoDataFrame(valid_coords, geometry=geometry, crs="EPSG:4326")

    # Spatial join: point-in-polygon with 'within'
    # Note: gpd.sjoin predicate applies as LEFT.predicate(RIGHT),
    # so 'within' means the parcel point is within the city polygon.
    joined = gpd.sjoin(parcels_gdf, st_pete[["GEOID", "NAME", "geometry"]],
                       how="left", predicate="within")

    # Region membership: allowlist municipalities + Clearwater Beach island
    # (point-in-polygon). The latitude cutoff is applied to the parcel point.
    region_gdf = gpd.GeoDataFrame({"geometry": [region_union]}, crs="EPSG:4326")
    beach_gdf = gpd.GeoDataFrame({"geometry": [cw_island]}, crs="EPSG:4326")
    region_join = gpd.sjoin(parcels_gdf, region_gdf, how="left", predicate="within")
    beach_join = gpd.sjoin(parcels_gdf, beach_gdf, how="left", predicate="within")

    # Mark inside St. Pete
    parcels["inside_st_petersburg"] = False
    parcels["city_geoid"] = None
    parcels["city_assignment_method"] = None
    parcels["city_boundary_vintage"] = "2020"
    parcels["city_assignment_quality_flag"] = None

    # For spatially matched parcels
    matched_idx = joined[joined["index_right"].notna()]["strap"]
    parcels.loc[parcels["strap"].isin(matched_idx), "inside_st_petersburg"] = True
    parcels.loc[parcels["strap"].isin(matched_idx), "city_geoid"] = config["geography"]["city"]["place_geoid"]
    parcels.loc[parcels["strap"].isin(matched_idx), "city_assignment_method"] = "spatial_within"

    # Region membership: latitude cutoff (valid coords only), any allowlist
    # municipality, or the Clearwater Beach island box.
    parcels["inside_region"] = False
    parcels.loc[
        parcels["_coord_valid"] & (parcels["latitude"] <= region_cutoff),
        "inside_region",
    ] = True
    region_matched = region_join[region_join["index_right"].notna()]["strap"]
    parcels.loc[parcels["strap"].isin(region_matched), "inside_region"] = True
    beach_matched = beach_join[beach_join["index_right"].notna()]["strap"]
    parcels.loc[parcels["strap"].isin(beach_matched), "inside_region"] = True

    # For coord-missing parcels
    parcels.loc[parcels["_coord_missing"], "city_assignment_quality_flag"] = "MISSING_COORDS"

    # For invalid coords
    invalid_mask = ~parcels["_coord_valid"] & ~parcels["_coord_missing"]
    parcels.loc[invalid_mask, "city_assignment_quality_flag"] = "COORDS_OUT_OF_BOUNDS"

    # --- Reconciliation with tax district ---
    # SP = St. Petersburg tax district
    is_sp_tax = parcels["tax_district_description"].str.upper().str.contains("ST PETERSBURG", na=False)
    recon = pd.DataFrame({
        "category": [
            "spatial_in_tax_in",
            "spatial_in_tax_out",
            "spatial_out_tax_in",
            "spatial_out_tax_out",
            "missing_coords",
            "region_total",
            "region_in_st_pete",
            "region_out_st_pete",
        ],
        "count": [
            int((parcels["inside_st_petersburg"] & is_sp_tax).sum()),
            int((parcels["inside_st_petersburg"] & ~is_sp_tax).sum()),
            int((~parcels["inside_st_petersburg"] & is_sp_tax).sum()),
            int((~parcels["inside_st_petersburg"] & ~is_sp_tax).sum()),
            int(parcels["_coord_missing"].sum()),
            int(parcels["inside_region"].sum()),
            int((parcels["inside_region"] & parcels["inside_st_petersburg"]).sum()),
            int((parcels["inside_region"] & ~parcels["inside_st_petersburg"]).sum()),
        ],
    })
    recon_path = output_dir / "report_city_reconciliation.parquet"
    recon.to_parquet(recon_path, index=False)

    # Save parcel-city assignment
    city_cols = ["strap", "inside_st_petersburg", "inside_region", "city_geoid",
                 "city_assignment_method", "city_boundary_vintage",
                 "city_assignment_quality_flag"]
    parcels[city_cols].to_parquet(output_dir / "silver_parcel_city.parquet", index=False)

    # Merge city membership back to sales
    sales = sales.merge(parcels[city_cols], on="strap", how="left")

    # Update enriched sales file with city membership
    sales.to_parquet(enriched_sales_path, index=False)

    print(f"City membership: {int(parcels['inside_st_petersburg'].sum())} parcels inside St. Pete "
          f"(of {len(parcels)} with coords)")
    print(f"Region membership: {int(parcels['inside_region'].sum())} parcels inside region "
          f"(of {len(parcels)} with coords)")

    return {
        "reconciliation_report": str(recon_path),
        "parcels_inside_city": int(parcels["inside_st_petersburg"].sum()),
        "parcels_inside_region": int(parcels["inside_region"].sum()),
        "parcels_total": len(parcels),
        "parcels_missing_coords": int(parcels["_coord_missing"].sum()),
    }
