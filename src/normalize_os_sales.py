"""Stage 4b: Normalize historical PCPAO sales (RP_OS_SALES.csv).

Schema adapter bridging the historical official-record sales extract to the
canonical sales schema. The historical file differs from RP_SALES.csv:

    QU  -> qualified_flag        (same code set: Q / U / M)
    VI  -> vacant_improved_flag  (large null share; stray legacy codes)
    PARCEL_NUMBER, SALE_ID, MULTI_SALES_YN are absent

Because MULTI_SALES_YN is absent, multi_parcel_sale_flag is DERIVED: sales
sharing one deed (same BOOK_PAGE + SALE_DATE) across more than one parcel
are flagged multi-parcel. The derivation is validated against the 2021+
overlap where both files describe the same transactions, and the agreement
report is persisted for audit.

Historical rows are filtered to before the cutover date (RP_SALES.csv stays
authoritative from the cutover forward) and unioned with silver_sales into
silver_sales_combined.parquet, stamped with source_schema_version.
"""

from pathlib import Path

import pandas as pd

from .utils import utc_now


def _derive_multi_parcel(df: pd.DataFrame) -> pd.Series:
    """Flag deed-level multi-parcel sales: same BOOK_PAGE + SALE_DATE on >1 STRAP.

    Rows without a usable book/page reference cannot be classified and
    return <NA> rather than False.
    """
    book_page = df["book_page"].astype(str).str.strip()
    usable = book_page.notna() & (book_page != "") & (book_page.str.lower() != "nan")

    parcels_per_deed = (
        df.loc[usable]
        .groupby([book_page[usable], df.loc[usable, "sale_date"]])["strap"]
        .transform("nunique")
    )
    flag = pd.Series(pd.NA, index=df.index, dtype="boolean")
    flag.loc[usable] = parcels_per_deed > 1
    return flag


def _validate_derivation_against_current(
    canonical: pd.DataFrame,
    silver_current: pd.DataFrame,
    cutover: pd.Timestamp,
    output_dir: Path,
) -> dict:
    """Compare the derived multi-parcel flag with MULTI_SALES_YN on the
    post-cutover overlap, where both files label the same transactions."""
    os_recent = canonical[canonical["sale_date"] >= cutover]
    key = ["strap", "sale_date", "sale_price"]

    os_dedup = os_recent.drop_duplicates(subset=key)[key + ["multi_parcel_sale_flag"]]
    cur_dedup = silver_current.drop_duplicates(subset=key)[key + ["multi_parcel_sale_flag"]]

    joined = cur_dedup.merge(
        os_dedup, on=key, how="inner", suffixes=("_current", "_derived")
    )
    comparable = joined[
        joined["multi_parcel_sale_flag_current"].notna()
        & joined["multi_parcel_sale_flag_derived"].notna()
    ]
    agree = (
        comparable["multi_parcel_sale_flag_current"].astype(bool)
        == comparable["multi_parcel_sale_flag_derived"].astype(bool)
    )

    report = pd.DataFrame([{
        "overlap_rows": len(joined),
        "comparable_rows": len(comparable),
        "agreement_pct": round(100 * agree.mean(), 2) if len(comparable) else None,
        "current_true_derived_false": int(
            (comparable["multi_parcel_sale_flag_current"].astype(bool)
             & ~comparable["multi_parcel_sale_flag_derived"].astype(bool)).sum()
        ),
        "current_false_derived_true": int(
            (~comparable["multi_parcel_sale_flag_current"].astype(bool)
             & comparable["multi_parcel_sale_flag_derived"].astype(bool)).sum()
        ),
    }])
    report_path = output_dir / "report_os_multiparcel_validation.parquet"
    report.to_parquet(report_path, index=False)

    stats = report.iloc[0].to_dict()
    print(f"  Multi-parcel derivation validation: {stats['comparable_rows']:,} "
          f"comparable overlap rows, {stats['agreement_pct']}% agreement")
    return stats


def normalize_os_sales(
    bronze_os_path: Path,
    silver_sales_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Normalize historical sales and union with current silver sales.

    Writes silver_sales_combined.parquet (the downstream sale-filter input),
    silver_os_sales.parquet (historical rows only), the multi-parcel
    derivation validation report, and historical rejections.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    hist_cfg = config.get("historical", {})
    cutover = pd.Timestamp(hist_cfg.get("cutover_date", "2021-01-01"))
    schema_version_hist = hist_cfg.get("source_schema_version_historical", "pcpao_os_v1")
    schema_version_cur = hist_cfg.get("source_schema_version_current", "pcpao_current_v1")
    multi_rule = hist_cfg.get("multi_parcel_rule_version", "derived_book_page_v1")

    silver_current = pd.read_parquet(silver_sales_path)

    if not Path(bronze_os_path).exists():
        # No historical source: pass current silver through unchanged
        combined = silver_current.copy()
        combined["source_schema_version"] = schema_version_cur
        combined_path = output_dir / "silver_sales_combined.parquet"
        combined.to_parquet(combined_path, index=False)
        print("No historical sales staged — combined silver equals current silver")
        return {"combined": str(combined_path), "historical_accepted": 0}

    df = pd.read_parquet(bronze_os_path)

    # --- Map historical schema to canonical ---
    canonical = pd.DataFrame()
    canonical["strap"] = df["STRAP"].astype(str).str.strip().str.zfill(18)
    canonical["parcel_number"] = None  # absent in historical schema
    # Deterministic surrogate key: source is immutable and hashed, so the
    # source row number is stable across runs
    canonical["sale_id"] = "OS" + df["_source_row_number"].astype(str).str.zfill(9)
    canonical["book_page"] = df["BOOK_PAGE"].astype(str).str.strip()
    # Null-safe code mapping: historical file has ~30 null QU and ~414K null VI
    canonical["qualified_flag"] = df["QU"].str.strip().where(df["QU"].notna(), None)
    canonical["vacant_improved_flag"] = df["VI"].str.strip().where(df["VI"].notna(), None)
    canonical["month_real_flag"] = df["MONTH_REAL"].astype(str).str.strip()
    canonical["day_real_flag"] = df["DAY_REAL"].astype(str).str.strip()
    canonical["grantee"] = df["GRANTEE"].astype(str).str.strip()
    canonical["grantor"] = df["GRANTOR"].astype(str).str.strip()
    canonical["sale_price"] = pd.to_numeric(df["PRICE"], errors="coerce")
    canonical["sale_date_raw"] = df["SALE_DATE"].astype(str).str.strip()
    canonical["sale_date"] = pd.to_datetime(df["SALE_DATE"], errors="coerce")
    canonical["qualification_reason_code"] = None
    canonical["transaction_code"] = None

    # Derived multi-parcel flag (documented rule, versioned)
    canonical["multi_parcel_sale_flag"] = _derive_multi_parcel(canonical)
    canonical["multi_parcel_rule_version"] = multi_rule

    # Lineage
    for col in ["_source_file", "_source_row_number", "_source_sha256",
                "_ingested_at_utc", "_pipeline_run_id"]:
        canonical[col] = df[col]
    canonical["_normalized_at_utc"] = utc_now()

    # --- Validate the derivation against the 2021+ overlap BEFORE cutover filter ---
    validation = _validate_derivation_against_current(
        canonical, silver_current, cutover, output_dir
    )

    # --- Rejection rules (same as current normalization) ---
    canonical["_reject_reason"] = None
    canonical.loc[canonical["sale_date"].isna(), "_reject_reason"] = "INVALID_DATE"
    bad_price = canonical["sale_price"].isna() | (canonical["sale_price"] <= 0)
    canonical.loc[bad_price & canonical["_reject_reason"].isna(), "_reject_reason"] = "INVALID_PRICE"

    rejected = canonical[canonical["_reject_reason"].notna()].copy()
    accepted = canonical[canonical["_reject_reason"].isna()].drop(columns=["_reject_reason"])

    # --- Historical scope: rows strictly before the cutover ---
    historical = accepted[accepted["sale_date"] < cutover].copy()
    dropped_recent = len(accepted) - len(historical)

    # Deduplicate exact repeats (same parcel, date, price, deed)
    dedup_key = ["strap", "sale_date", "sale_price", "book_page"]
    before_dedup = len(historical)
    historical = historical.sort_values("_source_row_number").drop_duplicates(
        subset=dedup_key, keep="first"
    )
    dupes_removed = before_dedup - len(historical)

    historical["source_schema_version"] = schema_version_hist

    hist_path = output_dir / "silver_os_sales.parquet"
    historical.to_parquet(hist_path, index=False)

    rejected_path = output_dir / "etl_rejected_records_historical.parquet"
    rejected.to_parquet(rejected_path, index=False)

    # --- Union with current silver ---
    current = silver_current.copy()
    current["source_schema_version"] = schema_version_cur
    current["multi_parcel_rule_version"] = "source_flag_v1"

    combined = pd.concat([historical, current], ignore_index=True, sort=False)
    combined_path = output_dir / "silver_sales_combined.parquet"
    combined.to_parquet(combined_path, index=False)

    print(f"Historical sales: {len(historical):,} accepted pre-{cutover.date()} "
          f"({len(rejected):,} rejected, {dupes_removed} exact dupes, "
          f"{dropped_recent:,} post-cutover rows deferred to RP_SALES)")
    print(f"Combined silver sales: {len(combined):,} rows "
          f"({len(historical):,} historical + {len(current):,} current)")

    return {
        "combined": str(combined_path),
        "historical": str(hist_path),
        "rejected": str(rejected_path),
        "historical_accepted": len(historical),
        "historical_rejected": len(rejected),
        "multi_parcel_validation": validation,
    }
