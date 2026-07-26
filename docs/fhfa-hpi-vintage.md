# FHFA Tract HPI Vintage

## Measured evidence

The pipeline's FHFA file (`data/hpi_at_tract.csv`) contains 232 Pinellas
County tract series (annual, 1975–2025). Comparing its tract identifiers with
TIGER geometry:

- **232 / 232 (100%)** of FHFA Pinellas tract IDs are valid **2020** TIGER
  GEOIDs; zero IDs fall outside the 2020 set.
- 43 of the 275 Pinellas 2020 tracts have no FHFA series (FHFA requires
  sufficient repeat-sales transactions per tract).

A 2010-vintage file would be expected to contain 2010-only GEOIDs (from the
80 split relationships) that do not exist in the 2020 set; this file contains
none. The measured evidence therefore strongly indicates 2020-vintage tract
codes.

## Status: measured, pending release-documentation confirmation

Per the Phase 3 specification, vintage is **not inferred from observation
years**, and set membership alone is treated as strong evidence rather than
proof (unchanged tracts share GEOIDs across vintages). The
`fhfa_tract_vintage` field is populated from `config.yaml`
(`fhfa.vintage_expected: "2020"`) and should be confirmed against the
documentation accompanying the FHFA release
(https://www.fhfa.gov/data/hpi/datasets; historical working paper WP 21-01
used 2010 GEOIDs, so the downloadable file's docs govern).

## Display and provenance rules

FHFA HPI is preserved on its **source tract codes**
(`fhfa_geography_method: source_tract_code`) and is never crosswalked. In the
application it must be:

- Labeled annual, not seasonally adjusted
- Never described as a median home price
- Never quarterly-filled as if measured quarterly; if repeated across
  quarters for display, marked as an annual value carried for presentation

Fact-table fields: `fhfa_tract_vintage`, `fhfa_geography_method`,
`fhfa_source_release`, plus the file's SHA-256 in the source manifest.
