# Historical Data Quality

Companion to `reports/historical_quality_report.md` (regenerate with
`scripts/historical_quality_report.py` after any pipeline run).

## What the annual report measures

| Metric | Purpose |
| --- | --- |
| Source sales | Detect missing source periods |
| Qualified sales | Monitor filtering consistency across schema versions |
| Unique parcels | Detect duplicate or multi-parcel effects |
| Parcel match rate | Identify retired-parcel bias (see caveat below) |
| Coordinate coverage | Measure spatial usability |
| 2020 tract assignment rate | Validate fixed-geography coverage |
| Median of tract medians | Detect implausible jumps |
| Tract-quarters published | Measure map coverage |
| Tract-quarters suppressed | Explain missing map values |
| Discontinuity flag | YoY qualified-volume change beyond ±30% |

## Known quality characteristics of the historical decade

- **Coverage floor:** the dashboard starts at 2011-Q1 (`sale_filter.min_sale_date`).
  The source extends to the 1800s if the floor is ever lowered.
- **Survivorship bias:** the historical extract is keyed to parcels surviving
  on the current (2026) roll. The 100% parcel match rate is therefore *not*
  evidence of complete coverage — sales on retired/renumbered parcels are
  absent from the source. Volume discontinuities are the working proxy.
- **Current-roll property classes:** historical sales are filtered by the
  parcel's *current* land-use class, not its class at sale time
  (`property_class_rule_version: current_roll_v1`). A parcel redeveloped from
  commercial to residential contributes its historical sales to the housing
  universe; the reverse is excluded.
- **Derived multi-parcel flag:** validated at 99.6% agreement on the 2021+
  overlap; expect ±0.4% flag noise in historical quarters
  (`report_os_multiparcel_validation.parquet`).
- **Early-decade suppression:** in 2011-Q1 roughly half of active tracts meet
  the 5-sale publication threshold (market trough); coverage rises through
  the decade. Suppressed and missing cells display as such — never zero.
- **2006–2009 volume trough** in the source is consistent with the housing
  crash and predates the dashboard floor; it is not a data gap.

## Never zero-filled

Missing historical values are null at every layer (aggregate spine, dashboard
table, published JSON). Suppression (< 5 qualified sales) nulls the median and
sets `suppressMedian`. The frontend renders both with the existing
missing/suppressed styles.
