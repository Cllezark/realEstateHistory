# Phase 3 Discovery Report: Historical Source Coverage

**Date:** 2026-07-19
**Profiler:** `scripts/profile_historical_sources.py` (run from repo root with `.venv/bin/python`)
**Purpose:** Determine the earliest defensible historical quarter before any Phase 3
implementation work begins.

## Verdict

**Phase 3 is currently blocked on source data.** The repository contains no sales,
property-roll, or mortgage-rate observations before 2021. Every 2011–2020 market
metric requires acquiring new source files. The only input that already covers the
target decade is FHFA tract HPI.

## Source-by-source findings

### 1. PCPAO sales (`data/RP_SALES.csv`)

| Measure | Value |
| --- | --- |
| Total rows | 155,818 |
| Earliest valid sale date | **2021-01-02** |
| Latest valid sale date | 2026-07-09 |
| Sales before 2021-01-01 | **0** |
| Parcel (STRAP) match rate | 100.00% (all years) |
| Valid price / real-month coverage | 100% |

Sale counts by year (total / qualified `Q`+`M` / multi-parcel):

| Year | Total | Qualified | Multi-parcel |
| --- | --- | --- | --- |
| 2021 | 39,599 | 35,386 | 3,573 |
| 2022 | 30,434 | 26,322 | 1,859 |
| 2023 | 26,084 | 22,287 | 2,091 |
| 2024 | 23,266 | 19,974 | 1,245 |
| 2025 | 23,809 | 19,953 | 1,127 |
| 2026 (partial) | 12,626 | 10,827 | 474 |

No `RP_SALES_HISTORY` or equivalent historical extract exists anywhere in the
repository (searched case-insensitively for `*histor*` and all CSVs).

### 2. PCPAO property snapshot (`data/RP_PROPERTY_INFO.csv`)

| Measure | Value |
| --- | --- |
| Rows / unique STRAPs | 437,548 / 437,548 |
| Roll years present | **2026 only** (current roll — no historical rolls) |
| Valid Florida coordinates | 99.89% |

The snapshot is a single current-year roll. Parcels retired, split, merged, or
renumbered before 2026 are absent, which is the expected driver of parcel-match
loss once historical sales are acquired. Historical Final NAL rolls (FDOR,
2002 onward) are the remedy.

### 3. FHFA tract HPI (`data/hpi_at_tract.csv`)

| Measure | Value |
| --- | --- |
| Pinellas (12103) tracts | 232 |
| Year range | 1975–2025 (annual) |
| 2011–2020 coverage | 2,310 rows; 2,191 with non-null HPI across 231 tracts |
| Tract IDs matching 2020 TIGER GEOIDs | **232 / 232 (100%)** |
| 2020 tracts with no FHFA series | 43 |

**Vintage note:** every Pinellas FHFA tract ID is a valid 2020 GEOID with zero
mismatches, which strongly suggests the file is published on 2020-vintage tract
codes. This must still be confirmed against the documentation accompanying the
actual FHFA release before the `fhfa_tract_vintage` field is populated —
2010 and 2020 GEOIDs overlap for unchanged tracts, so set membership alone is
suggestive, not proof. (Per spec: do not infer vintage from observation year.)

### 4. FRED mortgage rates (`data/MORTGAGE30US.csv`)

| Measure | Value |
| --- | --- |
| Coverage | 2021-01-07 → 2026-07-16 (weekly) |
| 2011–2020 observations | **0** |

The full `MORTGAGE30US` series extends back to 1971 and is freely downloadable
from FRED; this gap is trivial to close.

### 5. Geometry and crosswalk inputs

| Input | Status |
| --- | --- |
| 2020 TIGER Pinellas tracts (`tl_2020_12_tract.shp`) | Present (dashboard geography) |
| 2020 TIGER place boundaries (`tl_2020_12_place.shp`) | Present |
| 2025 TIGER tracts (`tl_2025_12_tract.shp`) | Present (unused by pipeline) |
| 2010 TIGER tracts | **Missing** (needed only for native-geography/audit mode) |
| 2020↔2010 tract relationship file | **Missing** (audit layer) |

### 6. Current dashboard baseline

`output/dashboard_tract_quarter.parquet`: 275 tracts × quarters 2021-Q1 → 2026-Q4
(6,600 rows). This is the regression baseline Phase 3 must leave unchanged.

## Blocking data gaps (in priority order)

1. **Historical sales, 2011–2020 — hard blocker.** Options:
   - Request a historical extract from PCPAO (same schema as `RP_SALES.csv` would
     minimize rule-version divergence), or
   - Florida DOR SDF sales files (available 2009 onward; older years may require a
     request via the [FDOR property-data portal](https://floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx)).
2. **Historical property rolls (FDOR Final NAL, 2002+)** — required to match
   historical sales to sale-era parcels and coordinates; the current snapshot only
   covers the 2026 roll.
3. **Historical FRED `MORTGAGE30US`** — freely downloadable; needed for
   quarterly rate aggregation and P&I estimates before 2021.
4. **2010 TIGER Pinellas tracts + 2020↔2010 relationship file** — not blocking for
   the preferred fixed-2020-geography method; required for the audit layer and the
   optional native-geography mode.

## Geography assessment for the preferred method

The preferred pipeline (historical sale → parcel point → direct 2020-tract
assignment) is architecturally ready: the existing Stage 6/7 spatial machinery
already assigns points to 2020 tracts, and current-roll coordinate coverage is
99.89%. The open risk is parcel-match coverage for retired parcels, which cannot
be measured until historical sales are in hand. Match rates by year must be
reported before the earliest defensible quarter is declared.

## What can proceed now vs. what must wait

**Can proceed without new sales data:**
- Backfilling FRED mortgage rates to 2011 (or earlier)
- Acquiring 2010 TIGER tracts and the relationship file; building
  `dim_census_tract_2010` and `bridge_tract_2010_2020`
- Confirming the FHFA release vintage from its documentation
- Schema/rule-version scaffolding (`geography_method`, `source_schema_version`, …)

**Must wait for historical sales:**
- Everything else: parcel matching, tract assignment, quarterly aggregation,
  frontend timeline extension, coverage reporting, and the determination of the
  earliest defensible quarter.

## Recommended next actions

1. Decide the acquisition path for 2011–2020 sales (PCPAO extract vs. FDOR SDF)
   and place the request — this has the longest lead time.
2. In parallel, download the freely available gap-fillers (historical
   `MORTGAGE30US`, 2010 TIGER tracts, relationship file) once approved.
3. Re-run `scripts/profile_historical_sources.py` after each new source lands and
   extend it with the annual funnel metrics required by the Phase 3 spec.
