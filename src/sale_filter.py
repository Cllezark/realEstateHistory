"""Stage 5: Analytical sale filter.

Applies configurable inclusion rules and produces funnel metrics
showing record counts before and after each rule.
"""

from pathlib import Path
from typing import Optional

import pandas as pd
import yaml

from .utils import utc_now


def apply_sale_filter(
    sales_path: Path,
    property_current_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Apply analytical filter and produce the fact_sale_enriched table.

    Returns enriched sales and funnel metrics.
    """
    sales = pd.read_parquet(sales_path)
    properties = pd.read_parquet(property_current_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    cfg = config["sale_filter"]
    total_input = len(sales)

    # Pre-join property info
    sales = sales.merge(
        properties[["strap", "land_use_code", "parcel_type", "latitude", "longitude",
                     "site_city", "tax_district", "tax_district_description",
                     "pcpao_census_tract", "living_area_sqft", "living_units", "year_built",
                     "site_address", "site_city_zip"]],
        on="strap", how="left", suffixes=("", "_prop")
    )

    funnel = []
    current = sales.copy()

    def record_step(label: str, df: pd.DataFrame, reason_col: Optional[str] = None):
        count = len(df)
        excluded = total_input - count if len(funnel) == 0 else funnel[-1]["count"] - count
        funnel.append({"step": label, "count": count, "excluded": excluded, "reason": reason_col})
        print(f"  {label}: {count} records (excluded {excluded})")

    record_step("01_input", current)

    # Rule 1: Sale date on or after min date
    min_date = pd.Timestamp(cfg["min_sale_date"])
    mask_date = current["sale_date"] >= min_date
    current = current[mask_date].copy()
    record_step("02_valid_date", current, "INVALID_DATE")

    # Rule 2: Valid positive sale price
    mask_price = current["sale_price"].notna() & (current["sale_price"] > 0)
    current = current[mask_price].copy()
    record_step("03_valid_price", current, "INVALID_PRICE")

    # Rule 3: Qualified sale
    qf = cfg["qualified_flags"]
    mask_qualified = current["qualified_flag"].isin(qf)
    current = current[mask_qualified].copy()
    record_step("04_qualified_sale", current, "UNQUALIFIED_SALE")

    # Rule 4: Real month
    if cfg.get("require_real_month"):
        mask_month = current["month_real_flag"] == cfg.get("real_month_code", "Y")
        current = current[mask_month].copy()
        record_step("05_real_month", current, "UNREAL_MONTH")

    # Rule 5: Joined to property info
    mask_parcel = current["land_use_code"].notna()
    current = current[mask_parcel].copy()
    record_step("06_has_property", current, "MISSING_PARCEL_MATCH")

    # Rule 6: Supported property class
    use_codes = cfg.get("property_use_codes", [0, 1, 4, 8])
    mask_use = current["land_use_code"].isin(use_codes)
    current = current[mask_use].copy()
    record_step("07_property_class", current, "UNSUPPORTED_PROPERTY_CLASS")

    # Rule 7: Multi-parcel exclusions (flag, don't drop yet)
    multi_mask = current["multi_parcel_sale_flag"] == True
    multi_count = int(multi_mask.sum())
    current["_is_multi_parcel"] = multi_mask
    record_step("08_not_multi_parcel", current[~multi_mask], "MULTI_PARCEL")

    # Funnel metrics
    funnel_df = pd.DataFrame(funnel)
    funnel_df["pct_of_input"] = (funnel_df["count"] / total_input * 100).round(2)
    funnel_path = output_dir / "report_sale_filter_funnel.parquet"
    funnel_df.to_parquet(funnel_path, index=False)

    # Enriched sales table
    current["_pipeline_run_id"] = run_id
    current["_filtered_at_utc"] = utc_now()

    # Rename for fact table
    current = current.rename(columns={
        "sale_date": "sale_date",
        "sale_price": "sale_price",
    })

    enriched_path = output_dir / "fact_sale_enriched.parquet"
    current.to_parquet(enriched_path, index=False)

    print(f"\nFilter funnel: {total_input} input -> {len(current)} enriched sales")
    return {
        "enriched_sales": str(enriched_path),
        "funnel_metrics": str(funnel_path),
        "total_enriched": len(current),
        "multi_parcel_excluded_from_median": multi_count,
    }
