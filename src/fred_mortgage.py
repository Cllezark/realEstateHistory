"""Stage 9: Normalize FRED mortgage rates.

Parses MORTGAGE30US weekly data, flags the Freddie Mac methodology break
(Nov 2022), and creates a quarterly rate table with coverage flags.
"""

from pathlib import Path

import pandas as pd

from .utils import utc_now


def normalize_fred_mortgage(
    bronze_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> dict:
    """Normalize FRED weekly mortgage rate data to quarterly averages."""
    output_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_parquet(bronze_path)
    cfg = config["fred"]

    # Parse observation date
    date_col = cfg["fields"]["observation_date"]
    rate_col = cfg["fields"]["rate"]
    df["observation_date"] = pd.to_datetime(df[date_col], errors="coerce")
    df["rate_percent"] = pd.to_numeric(df[rate_col], errors="coerce")

    # Drop rows with missing dates or rates
    df = df.dropna(subset=["observation_date", "rate_percent"]).copy()

    # Save weekly silver table
    weekly = df[["observation_date", "rate_percent",
                 "_source_file", "_source_row_number",
                 "_source_sha256", "_ingested_at_utc"]].copy()
    weekly["_pipeline_run_id"] = run_id
    weekly["_normalized_at_utc"] = utc_now()

    # Methodology break flag
    break_date = pd.Timestamp(cfg["methodology_break_date"])
    weekly["methodology_break_flag"] = weekly["observation_date"] >= break_date

    weekly_path = output_dir / "silver_fred_mortgage_weekly.parquet"
    weekly.to_parquet(weekly_path, index=False)

    # --- Build quarterly table ---
    weekly["year"] = weekly["observation_date"].dt.year
    weekly["quarter"] = weekly["observation_date"].dt.quarter
    weekly["quarter_id"] = weekly["year"].astype(str) + "-Q" + weekly["quarter"].astype(str)

    quarterly = weekly.groupby(["year", "quarter", "quarter_id"]).agg(
        average_rate_percent=("rate_percent", "mean"),
        weekly_observation_count=("rate_percent", "count"),
        first_observation_date=("observation_date", "min"),
        last_observation_date=("observation_date", "max"),
        minimum_rate_percent=("rate_percent", "min"),
        maximum_rate_percent=("rate_percent", "max"),
    ).reset_index()

    # Partial quarter flag: fewer than 12 weeks (some quarters have 13)
    quarterly["partial_quarter_flag"] = quarterly["weekly_observation_count"] < 10
    quarterly["_pipeline_run_id"] = run_id
    quarterly["_normalized_at_utc"] = utc_now()

    quarterly_path = output_dir / "fact_mortgage_rate_quarter.parquet"
    quarterly.to_parquet(quarterly_path, index=False)

    # --- Reconciliation: weekly to quarterly ---
    recon = pd.DataFrame({
        "metric": [
            "weekly_observations_input",
            "weekly_observations_valid",
            "quarterly_periods",
            "first_week",
            "last_week",
        ],
        "value": [
            len(df),
            len(weekly),
            len(quarterly),
            str(weekly["observation_date"].min().date()),
            str(weekly["observation_date"].max().date()),
        ],
    })
    recon_path = output_dir / "report_fred_reconciliation.parquet"
    recon.to_parquet(recon_path, index=False)

    print(f"FRED: {len(weekly)} weekly observations -> {len(quarterly)} quarterly periods "
          f"({weekly['observation_date'].min().date()} to {weekly['observation_date'].max().date()})")

    return {
        "weekly_path": str(weekly_path),
        "quarterly_path": str(quarterly_path),
        "reconciliation_report": str(recon_path),
        "weekly_count": len(weekly),
        "quarterly_count": len(quarterly),
    }
