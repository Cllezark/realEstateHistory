# St. Petersburg Real Estate ETL Pipeline

Reproducible local ETL pipeline producing quarterly, Census-tract-level
housing-market records for parcels inside St. Petersburg, Florida.

## Prerequisites

- Python 3.12
- Virtual environment with dependencies installed

## Setup

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install duckdb polars geopandas pyogrio pytest pyarrow pyyaml pyshp openpyxl
```

## Data Requirements

Place the following files in the `data/` directory:

| File | Source |
|------|--------|
| `RP_SALES.csv` | PCPAO sales data (authoritative 2021+) |
| `RP_OS_SALES.csv` | PCPAO historical official-record sales (authoritative pre-2021) |
| `RP_PROPERTY_INFO.csv` | PCPAO property info |
| `hpi_at_tract.csv` | FHFA annual tract HPI |
| `MORTGAGE30US.csv` | FRED weekly 30-year mortgage rates (2021+) |
| `MORTGAGE30US_2010s.csv` | FRED weekly mortgage rates (2011–2020) |
| `tl_2020_12_tract.*` | 2020 TIGER/Line Florida Census tracts |
| `tl_2010_12_tract10/` | 2010 TIGER/Line Florida Census tracts (audit layer) |
| `tl_2020_12_place.*` | 2020 TIGER/Line Florida incorporated places |
| `tab20_tract20_tract10_natl.txt` | Census 2020↔2010 tract relationship file |

Source data files are immutable. The pipeline reads them and writes
transformed output to `output/`.

## Usage

### Complete rebuild (one command)

```bash
python pipeline.py
```

### Run a single stage

```bash
python pipeline.py --stage normalize_sales
python pipeline.py --stage tract_assignment
```

### Skip validation

```bash
python pipeline.py --skip-validation
```

### Run tests

```bash
pytest tests/ -v
```

## Pipeline Architecture

```mermaid
graph TD
    A[Raw Source Files] --> B[Stage 1: Inventory]
    B --> C[Stage 2: Raw Manifest]
    C --> D[Stage 3: Normalize Property]
    C --> E[Stage 4: Normalize Sales]
    D --> F[Stage 5: Sale Filter]
    E --> F
    F --> G[Stage 6: City Membership]
    G --> G2[fact_sale_enriched]
    G2 --> H[Stage 7: Tract Assignment]
    H --> I[Stage 10: Tract-Quarter Aggregate]
    K[Stage 8: FHFA HPI] --> K2[fact_tract_hpi_annual]
    L[Stage 9: FRED Mortgage] --> L2[fact_mortgage_rate_quarter]
    I --> M[Stage 11: Mortgage Payment]
    L2 --> M
    M --> N[Stage 12: Publish]
    K2 --> N
    N --> O[Stage 13: Validate]
```

## Output Tables

| Table | Type | Description |
|-------|------|-------------|
| `bronze_source_manifest` | Parquet | Source file inventory with hashes |
| `silver_property_snapshot` | Parquet | All property snapshots |
| `silver_property_current` | Parquet | Current property per STRAP |
| `silver_sales` | Parquet | Cleaned, deduplicated sales |
| `silver_fhfa_tract_hpi_annual` | Parquet | Pinellas FHFA HPI |
| `silver_fred_mortgage_weekly` | Parquet | Weekly mortgage rates |
| `dim_st_petersburg_boundary` | Parquet | City boundary metadata |
| `dim_census_tract` | GeoParquet | Tract geometry + attributes |
| `fact_sale_enriched` | Parquet | Sales with city/tract assignment |
| `fact_mortgage_rate_quarter` | Parquet | Quarterly mortgage rates |
| `fact_tract_hpi_annual` | Parquet | Tract-year HPI values |
| `agg_tract_sale_quarter` | Parquet | Tract-quarter aggregates |
| `dashboard_tract_quarter` | Parquet | Final dashboard table |
| `etl_rejected_records` | Parquet | Rejected sales with reason codes |
| `etl_quality_metrics` | Parquet | Validation check results |
| `pinellas_tracts_dashboard.geojson` | GeoJSON | Web map geometry |

## Configuration

Edit `config.yaml` to adjust:
- Sale filter thresholds and qualification codes
- Property use code inclusion list
- Mortgage payment assumptions (down payment, loan term)
- Small-sample publication threshold (default: 5)
- Coordinate validation bounds
- Geographic vintage selection

## Phase 2: Interactive Map Dashboard

A React+TypeScript+Vite frontend application provides an interactive
choropleth map of St. Petersburg housing market data by Census tract.

```bash
# Generate web assets from pipeline data
python pipeline.py --stage publish

# Start development server
cd frontend
npm install
npm run dev

# Run tests
npm test

# Production build
npm run build
```

### Frontend Architecture

See [docs/map-mvp-architecture.md](docs/map-mvp-architecture.md) for the full
system overview, component tree, and data flow documentation.

### Features

- **Choropleth map** (MapLibre GL JS) with per-tract coloring by 10+ metrics
- **Quarter timeline** with range slider, keyboard navigation, and play animation
- **Tract details panel** with full quarterly metrics, warnings, and trend chart
- **Appreciation comparison mode** with start/end quarter diverging color scale
- **URL state sync** for shareable views (?tract=...&quarter=...&metric=...)
- **Accessibility**: WCAG 2.1 AA keyboard navigation, focus indicators, reduced motion

## Key Design Decisions

1. **2020 TIGER/Line geometry** — Uses 2020 vintage to match FHFA tract HPI
   boundaries (2020 Census tracts).

2. **Spatial city membership** — Parcels are assigned to St. Petersburg using
   spatial point-in-polygon with the 2020 incorporated-place boundary, not
   tax district fields alone.

3. **Complete tract-quarter spine** — Missing periods appear as null rows
   rather than disappearing, ensuring consistent dashboard layout.

4. **Small-sample flagging** — Tract-quarter cells with fewer than 5 sales
   are flagged rather than deleted (configurable threshold).

5. **Observed timeline from 2011** — Quarter-by-quarter median prices begin
   at 2011-Q1. Historical sales (pre-2021) come from `RP_OS_SALES.csv`
   through a versioned schema adapter and are assigned to the same fixed
   2020 tract geography by parcel point — never crosswalked. See
   [docs/historical-geography-methodology.md](docs/historical-geography-methodology.md).
   FHFA annual HPI is shown separately on its native tract codes.

6. **Immutable source data** — The pipeline never modifies source files in
   `data/`. Lineage fields (`source_file`, `source_row_number`,
   `source_sha256`) are preserved through all stages.

## Phase 3: Historical Coverage (2011–2020)

The dashboard timeline extends back to 2011-Q1 using PCPAO's historical
official-record sales, on the same fixed 2020 tract geography. Key documents:

- [docs/historical-data-sources.md](docs/historical-data-sources.md) — sources, schema bridge, survivorship caveat
- [docs/historical-geography-methodology.md](docs/historical-geography-methodology.md) — why parcel points, not crosswalks
- [docs/tract-vintage-transition.md](docs/tract-vintage-transition.md) — 2010↔2020 bridge audit
- [docs/fhfa-hpi-vintage.md](docs/fhfa-hpi-vintage.md) — FHFA vintage determination
- [docs/historical-data-quality.md](docs/historical-data-quality.md) — quality characteristics
- `reports/historical_quality_report.md` — per-year metrics (regenerated by
  `scripts/historical_quality_report.py`)

Regression guarantee: 2021+ dashboard values are unchanged from Phase 2
(verified by `scripts/phase3_regression_check.py`).

## Assumptions and Limitations

- **Observed medians begin 2011-Q1**: earlier sales exist in the source but
  sit below the configured analytical floor (`sale_filter.min_sale_date`).
  FHFA HPI (annual) is available from 1975 but measures index values, not
  observed prices.
- **Historical survivorship**: pre-2021 sales are keyed to parcels surviving
  on the current roll; sales on retired/renumbered parcels are absent from
  the source (see docs/historical-data-quality.md).
- **2020 boundary applied retroactively**: All sales are classified
  against the 2020 St. Petersburg city boundary, regardless of sale date.
- **Property snapshot date**: Current property attributes (ROLL_YEAR=2026)
  describe the parcel as it exists now, not necessarily as it existed
  on the historical sale date.
- **Single-tract assignment**: Parcels assigned to multiple tracts
  are flagged and de-duplicated to one tract.
- **Payment estimate**: Monthly P&I is an estimate only. It excludes
  taxes, insurance, HOA fees, PMI, closing costs, and maintenance.
