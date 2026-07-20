# Phase 3 Discovery Report: Historical Source Coverage

**Date:** 2026-07-19 (updated same day after historical sources landed)
**Profilers:** `scripts/profile_historical_sources.py`,
`scripts/profile_os_sales.py`, `scripts/profile_geography_inputs.py`
(run from repo root with `.venv/bin/python` — note the venv is WSL-based)
**Purpose:** Determine the earliest defensible historical quarter before any Phase 3
implementation work begins.

## Verdict

**Phase 3 is unblocked.** All required 2011–2020 sources are now on disk and
profiled: historical PCPAO sales (`RP_OS_SALES.csv`), historical mortgage rates
(`MORTGAGE30US_2010s.csv`), 2010 TIGER tract geometry, and the official
2020↔2010 tract relationship file. The remaining work is schema mapping and
pipeline implementation, not data acquisition. Section "Historical sales"
below documents the schema differences that Phase 3 must bridge.

## Update: newly landed sources (second pass)

### Historical sales (`data/RP_OS_SALES.csv`, 180 MB)

| Measure | Value |
| --- | --- |
| Total rows | 1,566,377 |
| Date range | **1870-04-30 → 2026-07-09** (no null dates) |
| 2011–2020 rows | 322,353 (237,594 qualified `Q`+`M`) |
| STRAP format | 18 characters in 100% of rows |
| Parcel match vs current snapshot | **100.00% in every year** |
| Overlap with `RP_SALES.csv` | All 155,818 current rows present (strict superset on STRAP+date+price) |
| Duplicate rows (STRAP+date+price+book/page) | 150 (~0.01%) |

Annual volumes are stable through the target decade (23K–36K sales/year,
2011–2020), with the 2006–2009 trough consistent with the real housing crash
rather than missing data.

**Schema differences vs `RP_SALES.csv` (the bridge Phase 3 must build):**

| Current (`RP_SALES`) | Historical (`RP_OS_SALES`) | Mapping |
| --- | --- | --- |
| `QUALIFIED_FLG` | `QU` | Rename; same code set (`Q`/`U`/`M`, 30 nulls) |
| `VACANT_IMPROVED` | `VI` | Rename; 414K nulls + stray codes `U`/`9`/`C` (5 rows) need a versioned rule |
| `PARCEL_NUMBER` | — absent | Derivable from STRAP if needed |
| `SALE_ID` | — absent | Synthesize a deterministic surrogate key |
| `MULTI_SALES_YN` | — absent | **Derive**: group by `BOOK_PAGE`+`SALE_DATE`; >1 STRAP on one deed ⇒ multi-parcel (must be validated against 2021+ overlap where both files label the same sales) |

**Recommended source strategy:** keep `RP_SALES.csv` as the authoritative source
for 2021-forward (it is richer and already validated), and use `RP_OS_SALES.csv`
filtered to pre-2021 with a versioned schema mapping
(`source_schema_version = pcpao_os_v1`). This preserves acceptance criterion 15
(2021+ results unchanged).

**Survivorship caveat:** the 100% match rate to the *current* (2026) parcel
snapshot implies the file is keyed to surviving parcels. Sales on parcels later
retired/renumbered are likely absent from the file entirely rather than present
and unmatched. This cannot be measured from this file alone; the annual funnel
report should track year-over-year volume discontinuities as a proxy, and the
property-class join must be flagged as using *current* (not sale-era) attributes
(`property_class_rule_version = current_roll_v1`).

### Historical mortgage rates (`data/MORTGAGE30US_2010s.csv`)

522 weekly observations, 2011-01-06 → 2020-12-31. Perfect splice with the
existing file: 7-day boundary gap, zero overlapping dates, max 8-day gap in the
combined 811-row series (holiday weeks). No further FRED download needed.

### 2010 tract geometry (`data/tl_2010_12_tract10/`)

4,245 Florida tracts, EPSG:4269; **246 Pinellas tracts** (vs 275 in 2020 —
net tract splitting over the decade). Fields carry the `10` suffix
(`GEOID10`, `ALAND10`, …).

### 2020↔2010 relationship file (`data/tab20_tract20_tract10_natl.txt`, 18.7 MB)

Pipe-delimited with UTF-8 BOM; 126,450 national rows → **398 Pinellas rows**
(277 unique 2020 tracts × 246 unique 2010 tracts; 4 rows cross the county line).
Land-area parts sum to exactly 100% of each 2010 tract's land area.
Relationship classification of the Pinellas slice:

| Type | Rows |
| --- | --- |
| many_to_many | 177 |
| one_to_one | 105 |
| one_2010_to_many_2020 | 80 |
| many_2010_to_one_2020 | 36 |

The heavy many-to-many share confirms the Phase 3 architecture decision: direct
parcel-point → 2020-tract assignment is the only defensible way to get
comparable medians; crosswalking medians is not viable.

### Earliest defensible quarter (preliminary)

With stable qualified-sale volumes from well before 2011 and 100% parcel/
coordinate linkage, **2011-Q1 looks achievable**, pending the funnel analysis
(property-class filtering, city membership, per-tract small-sample rates) that
the pipeline itself will produce. The file would even support extending earlier
than 2011 if desired.

---

## Original findings (first pass, before historical sources landed)

The sections below are retained for provenance; the gaps they describe are
now closed except where noted.

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
