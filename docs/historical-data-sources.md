# Historical Data Sources

All sources are immutable inputs under `data/`, hashed into
`output/bronze_source_manifest.parquet` on every run and echoed (with SHA-256)
into the published `metadata.json`.

## Sales

| File | Coverage | Role |
| --- | --- | --- |
| `RP_SALES.csv` | 2021-01-02 → present | **Authoritative from 2021-01-01** (cutover) |
| `RP_OS_SALES.csv` | 1870-04-30 → present | **Authoritative before 2021-01-01**; post-cutover rows discarded (strict superset of `RP_SALES.csv` — verified 155,818/155,818 overlap) |

### Historical schema (`pcpao_os_v1`) vs current (`pcpao_current_v1`)

| Current column | Historical column | Handling |
| --- | --- | --- |
| `QUALIFIED_FLG` | `QU` | Rename; identical code set (`Q`/`U`/`M`) |
| `VACANT_IMPROVED` | `VI` | Rename; ~26% null plus 5 stray legacy codes |
| `SALE_ID` | — | Synthesized: `OS` + zero-padded source row number (deterministic; source file is immutable and hashed) |
| `PARCEL_NUMBER` | — | Left null |
| `MULTI_SALES_YN` | — | **Derived** by deed grouping — see below |

### Derived multi-parcel rule (`derived_book_page_v1`)

Sales sharing one deed (same `BOOK_PAGE` + `SALE_DATE`) across more than one
parcel are flagged multi-parcel. Validated against the 155,670-row 2021+
overlap where both files label the same transactions: **99.6% agreement**
(326 under-flagged, 297 over-flagged). Report:
`output/report_os_multiparcel_validation.parquet`.

### Survivorship caveat

`RP_OS_SALES.csv` matches the current (2026) parcel roll at 100% in every
year, which means it is keyed to *surviving* parcels. Sales on parcels later
retired, split, or renumbered are absent from the source rather than present
and unmatched. Consequences:

- The per-year parcel match rate (100%) cannot detect this bias.
- Year-over-year volume discontinuities are the working proxy — see
  `reports/historical_quality_report.md`.
- Property-class filtering joins **current-roll** attributes
  (`property_class_rule_version: current_roll_v1`); a parcel's class at sale
  time is not available historically.

## Property

| Field | Source column | Handling |
| --- | --- | --- |
| `living_area_sqft` | `TOTAL_LIVING_SQFT` (`RP_PROPERTY_INFO.csv`) | Direct mapping — heated/cooled living area |
| `gross_area_sqft` | `TOTAL_GROSS_SQFT` (`RP_PROPERTY_INFO.csv`) | Direct mapping — total building gross area |
| `parcel_area_sqft` | `ACREAGE` (`RP_PROPERTY_INFO.csv`) | **Derived/approximate**: `ACREAGE * 43560`. PCPAO's bulk export has no native sqft parcel-area column; their per-parcel web UI shows a computed "Land Area" in sqft that isn't exposed in bulk downloads. |

**Bedrooms/bathrooms are explicitly out of scope.** PCPAO does not track bedroom
counts at all — their mass-appraisal methodology values property from exterior
measurements, not room counts (confirmed via PCPAO FAQ). Bathrooms have no
clean count either; the only proxy is a per-building "Fixtures" tally (mixes
toilets, sinks, tubs, water heaters) visible solely on PCPAO's individual
per-parcel web pages, not present in any bulk export. Neither field should be
re-proposed without a new paid data source (e.g. ATTOM, CoreLogic, an MLS-
affiliated Zillow Bridge feed) — Zillow/Redfin have no viable free/bulk API
and would only reflect present-day property state, not the state at each
historical sale date.

## Mortgage rates

| File | Coverage |
| --- | --- |
| `MORTGAGE30US_2010s.csv` | 2011-01-06 → 2020-12-31 (weekly) |
| `MORTGAGE30US.csv` | 2021-01-07 → present (weekly) |

Perfect splice: 7-day boundary gap, zero overlapping observations, max 8-day
gap (holiday weeks). Note the files use different date formats (ISO vs
M/D/YYYY); dates are parsed **per file** at staging. Known break: Freddie Mac
survey methodology change 2022-11-17 (flagged in the weekly silver table and
in `metadata.json` `knownBreaks`).

## Geometry and crosswalk

| File | Content |
| --- | --- |
| `tl_2020_12_tract.shp` | 2020 TIGER Florida tracts — the dashboard geography (275 Pinellas) |
| `tl_2010_12_tract10/` | 2010 TIGER Florida tracts (246 Pinellas) — native/audit geography |
| `tab20_tract20_tract10_natl.txt` | Official Census 2020↔2010 tract relationship file (398 Pinellas rows) |
| `tl_2020_12_place.shp` | 2020 TIGER places — region boundaries (Gulfport, Pinellas Park, beach towns, Belleair, Clearwater) |

## FHFA HPI

`hpi_at_tract.csv`: annual tract HPI, 1975–2025, 232 Pinellas tracts. See
docs/fhfa-hpi-vintage.md for the vintage determination.
