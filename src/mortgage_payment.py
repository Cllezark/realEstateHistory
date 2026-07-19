"""Stage 11: Calculate representative mortgage payment.

Computes estimated P&I payment from median sale price and quarterly
mortgage rate. Assumptions are configurable (down payment, term).
"""

from pathlib import Path

import numpy as np
import pandas as pd

from .utils import utc_now


def calculate_mortgage_payment(
    agg_tract_path: Path,
    quarterly_rate_path: Path,
    output_dir: Path,
    config: dict,
    run_id: str,
) -> Path:
    """Calculate estimated P&I payment for each tract-quarter cell."""
    output_dir.mkdir(parents=True, exist_ok=True)

    agg = pd.read_parquet(agg_tract_path)
    rates = pd.read_parquet(quarterly_rate_path)

    # Merge quarterly mortgage rate onto tract-quarter aggregate
    df = agg.merge(
        rates[["year", "quarter", "average_rate_percent", "partial_quarter_flag"]],
        on=["year", "quarter"],
        how="left",
        suffixes=("", "_mortgage")
    )

    cfg = config["mortgage"]
    down_pct = cfg["down_payment_percent"] / 100.0
    term_years = cfg["loan_term_years"]
    num_payments = term_years * 12

    def calc_pi(median_price, rate_pct):
        """Calculate monthly P&I payment."""
        if pd.isna(median_price) or pd.isna(rate_pct) or median_price <= 0:
            return None

        loan_amount = median_price * (1.0 - down_pct)
        monthly_rate = rate_pct / 100.0 / 12.0

        if monthly_rate == 0:
            return round(loan_amount / num_payments, 2)

        factor = (1 + monthly_rate) ** num_payments
        payment = loan_amount * (monthly_rate * factor) / (factor - 1)
        return round(payment, 2)

    df["estimated_pi_payment"] = df.apply(
        lambda row: calc_pi(row["median_sale_price"], row["average_rate_percent"]),
        axis=1
    )

    # Assumptions as columns
    df["payment_down_payment_pct"] = cfg["down_payment_percent"]
    df["payment_loan_term_years"] = term_years
    df["payment_components"] = "principal_and_interest"
    df["payment_calculation_note"] = (
        "Estimated P&I only. Excludes taxes, insurance, HOA, PMI, closing costs."
    )

    # Merge FHFA annual HPI (Stage 12 handles this, but pre-join for dashboard)
    df["_pipeline_run_id"] = run_id
    df["_payment_calculated_at_utc"] = utc_now()

    dashboard_path = output_dir / "dashboard_tract_quarter.parquet"
    df.to_parquet(dashboard_path, index=False)

    cells_with_payment = df["estimated_pi_payment"].notna().sum()
    print(f"Mortgage payment: {int(cells_with_payment)} cells with P&I payment calculated")

    return dashboard_path
