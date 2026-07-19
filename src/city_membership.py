"""Stage 6: Determine whether a parcel is in St. Petersburg.

Uses spatial point-in-polygon with the 2020 TIGER/Line place boundary.
Compares with PCPAO tax district and publishes a reconciliation report.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

from .utils import utc_now


def assign_city_membership(
    enriched_sales_path: Path,
    place_shp: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Spatially assign each parcel to St. Petersburg city boundary.

    Uses boundary-inclusive 'covers' predicate.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load St. Pete boundary
    places = gpd.read_file(place_shp)
    place_fips = config["geography"]["city"]["place_fips"]
    st_pete = places[places["PLACEFP"] == place_fips].copy()

    if len(st_pete) == 0:
        raise ValueError(f"St. Petersburg (PLACEFP={place_fips}) not found in place file")

    st_pete = st_pete.to_crs("EPSG:4326")
    city_geom = st_pete.geometry.iloc[0]

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

    # Spatial join: point-in-polygon with 'covers'
    joined = gpd.sjoin(parcels_gdf, st_pete[["GEOID", "NAME", "geometry"]],
                       how="left", predicate="covers")

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
    parcels.loc[parcels["strap"].isin(matched_idx), "city_assignment_method"] = "spatial_covers"

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
        ],
        "count": [
            int((parcels["inside_st_petersburg"] & is_sp_tax).sum()),
            int((parcels["inside_st_petersburg"] & ~is_sp_tax).sum()),
            int((~parcels["inside_st_petersburg"] & is_sp_tax).sum()),
            int((~parcels["inside_st_petersburg"] & ~is_sp_tax).sum()),
            int(parcels["_coord_missing"].sum()),
        ],
    })
    recon_path = output_dir / "report_city_reconciliation.parquet"
    recon.to_parquet(recon_path, index=False)

    # Save parcel-city assignment
    city_cols = ["strap", "inside_st_petersburg", "city_geoid",
                 "city_assignment_method", "city_boundary_vintage",
                 "city_assignment_quality_flag"]
    parcels[city_cols].to_parquet(output_dir / "silver_parcel_city.parquet", index=False)

    # Merge city membership back to sales
    sales = sales.merge(parcels[city_cols], on="strap", how="left")

    # Update enriched sales file with city membership
    sales.to_parquet(enriched_sales_path, index=False)

    print(f"City membership: {int(parcels['inside_st_petersburg'].sum())} parcels inside St. Pete "
          f"(of {len(parcels)} with coords)")

    return {
        "reconciliation_report": str(recon_path),
        "parcels_inside_city": int(parcels["inside_st_petersburg"].sum()),
        "parcels_total": len(parcels),
        "parcels_missing_coords": int(parcels["_coord_missing"].sum()),
    }
