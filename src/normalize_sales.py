"""Stage 4: Normalize PCPAO sales records.

Parses sale dates, quarantines invalid records, creates duplicate
and conflict reports. Uses (STRAP, SALE_ID) as business key.
"""

from pathlib import Path

import pandas as pd

from .utils import utc_now


CANONICAL_SALES_COLS = [
    "strap",
    "sale_id",
    "sale_date",
    "sale_price",
    "qualified_flag",
    "qualification_reason_code",
    "book_page",
    "transaction_code",
    "multi_parcel_sale_flag",
    "vacant_improved_flag",
    "month_real_flag",
    "day_real_flag",
    "parcel_number",
    "grantee",
    "grantor",
]


def normalize_sales(bronze_path: Path, output_dir: Path, run_id: str) -> dict:
    """Normalize PCPAO sales to canonical schema.

    Returns paths to silver_sales, duplicate report, conflict report, and rejected table.
    """
    df = pd.read_parquet(bronze_path)

    canonical = pd.DataFrame()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Direct mappings
    canonical["strap"] = df["STRAP"].astype(str).str.strip().str.zfill(18)
    canonical["parcel_number"] = df["PARCEL_NUMBER"].astype(str).str.strip()
    canonical["sale_id"] = df["SALE_ID"].astype(str).str.strip()
    canonical["book_page"] = df["BOOK_PAGE"].astype(str).str.strip()
    canonical["qualified_flag"] = df["QUALIFIED_FLG"].astype(str).str.strip()
    canonical["vacant_improved_flag"] = df["VACANT_IMPROVED"].astype(str).str.strip()
    canonical["month_real_flag"] = df["MONTH_REAL"].astype(str).str.strip()
    canonical["day_real_flag"] = df["DAY_REAL"].astype(str).str.strip()
    canonical["grantee"] = df["GRANTEE"].astype(str).str.strip()
    canonical["grantor"] = df["GRANTOR"].astype(str).str.strip()

    # Multi-parcel sale flag
    multi_raw = df["MULTI_SALES_YN"].astype(str).str.strip().str.upper()
    canonical["multi_parcel_sale_flag"] = multi_raw.map({"Y": True, "N": False, "": None})

    # Sale price
    canonical["sale_price"] = pd.to_numeric(df["PRICE"], errors="coerce")

    # Sale date - parse strictly
    sale_date_raw = df["SALE_DATE"]
    canonical["sale_date_raw"] = sale_date_raw.astype(str).str.strip()
    canonical["sale_date"] = pd.to_datetime(sale_date_raw, errors="coerce")

    # Qualification reason code (not present in current schema, set None)
    canonical["qualification_reason_code"] = None
    canonical["transaction_code"] = None

    # Lineage
    canonical["_source_file"] = df["_source_file"]
    canonical["_source_row_number"] = df["_source_row_number"]
    canonical["_source_sha256"] = df["_source_sha256"]
    canonical["_ingested_at_utc"] = df["_ingested_at_utc"]
    canonical["_pipeline_run_id"] = df["_pipeline_run_id"]
    canonical["_normalized_at_utc"] = utc_now()

    # --- Rejection rules ---
    canonical["_reject_reason"] = None

    # Invalid date
    mask_bad_date = canonical["sale_date"].isna()
    canonical.loc[mask_bad_date, "_reject_reason"] = "INVALID_DATE"

    # Invalid or missing price
    mask_bad_price = canonical["sale_price"].isna() | (canonical["sale_price"] <= 0)
    canonical.loc[mask_bad_price & canonical["_reject_reason"].isna(), "_reject_reason"] = "INVALID_PRICE"

    # Split accepted vs rejected
    rejected = canonical[canonical["_reject_reason"].notna()].copy()
    accepted = canonical[canonical["_reject_reason"].isna()].copy()
    accepted = accepted.drop(columns=["_reject_reason"])

    # --- Duplicate detection ---
    # Exact duplicates (all columns)
    exact_dupes = accepted[accepted.duplicated(subset=CANONICAL_SALES_COLS, keep=False)]
    exact_dupe_count = len(exact_dupes)

    # Business-key duplicates (STRAP, SALE_ID)
    has_sale_id = accepted["sale_id"].notna() & (accepted["sale_id"] != "") & (accepted["sale_id"] != "nan")
    biz_key_dupes = accepted[has_sale_id].duplicated(subset=["strap", "sale_id"], keep=False)
    biz_dupe_count = int(biz_key_dupes.sum())

    # Conflicting records: same (STRAP, SALE_ID) but different price/date
    if biz_dupe_count > 0:
        conflict_mask = accepted[has_sale_id].duplicated(subset=["strap", "sale_id"], keep=False)
        conflict_records = accepted[has_sale_id][conflict_mask].copy()
        conflict_path = output_dir / "report_sales_conflicts.parquet"
        conflict_records.to_parquet(conflict_path, index=False)
    else:
        conflict_path = None

    # De-duplicate: keep first by row number for each (strap, sale_id)
    accepted = accepted.sort_values("_source_row_number")
    # For records with SALE_ID, deduplicate on (strap, sale_id)
    with_id = accepted[has_sale_id].drop_duplicates(subset=["strap", "sale_id"], keep="first")
    without_id = accepted[~has_sale_id]
    accepted_deduped = pd.concat([with_id, without_id], ignore_index=True)

    # Save
    sales_path = output_dir / "silver_sales.parquet"
    accepted_deduped.to_parquet(sales_path, index=False)

    rejected_path = output_dir / "etl_rejected_records.parquet"
    rejected.to_parquet(rejected_path, index=False)

    # Duplicate report
    dup_report = pd.DataFrame([{
        "exact_duplicates": exact_dupe_count,
        "business_key_duplicates": biz_dupe_count,
        "total_accepted": len(accepted_deduped),
        "total_rejected": len(rejected),
        "total_input": len(canonical),
    }])
    dup_path = output_dir / "report_sales_duplicates.parquet"
    dup_report.to_parquet(dup_path, index=False)

    print(f"Sales: {len(accepted_deduped)} accepted, {len(rejected)} rejected "
          f"({exact_dupe_count} exact dupes, {biz_dupe_count} biz-key dupes)")

    return {
        "sales": str(sales_path),
        "rejected": str(rejected_path),
        "duplicate_report": str(dup_path),
        "conflict_report": str(conflict_path) if conflict_path else None,
        "total_accepted": len(accepted_deduped),
        "total_rejected": len(rejected),
    }
