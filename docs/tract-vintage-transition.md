# Tract Vintage Transition (2010 ↔ 2020)

## Summary: the dashboard does not switch vintages

The map displays **2020 Census tracts for every quarter**, including
2011–2019. Historical sales are assigned to 2020 tracts by parcel point (see
docs/historical-geography-methodology.md), so there is no boundary transition
in the user-facing timeline and no cross-vintage comparison hazard in the
default experience.

The materials below exist for audit and for a potential future
native-geography mode.

## Pinellas County boundary changes, 2010 → 2020

From the official Census relationship file
(`output/bridge_tract_2010_2020.parquet`, source
`tab20_tract20_tract10_natl.txt`):

| Relationship | Rows |
| --- | --- |
| many_to_many | 177 |
| one_to_one | 105 |
| one_2010_to_many_2020 (splits) | 80 |
| many_2010_to_one_2020 (merges) | 36 |

246 Pinellas tracts (2010) became 275 (2020) — net splitting. Quality flags:
`SLIVER_OVERLAP` (land-part share < 1% on both sides — boundary
digitization noise, not a real relationship) and `CROSSES_COUNTY_BOUNDARY`
(4 rows).

Land-part totals reconstruct each 2010 tract's land area to within rounding
(audited every run in `output/report_tract_bridge_audit.parquet`).

## Rules if a native-geography mode is ever implemented

1. 2011–2019 displays 2010 tracts; the transition follows the source
   dataset's documented geography, not an assumed cutoff.
2. A visible notice at the transition: *"Boundary definitions changed at this
   point. Tracts before and after the transition may not represent the same
   geographic areas."*
3. Tract-level appreciation comparisons across vintages are disabled unless
   the bridge classifies the pair `one_to_one`.
4. GEOID string equality across vintages does **not** imply the same
   geographic area — always consult the bridge.
5. Native values stay separate from reassigned values; both geographies are
   preserved in details and exports.
6. No polygon morphing animation across the transition.

## Weight sources

If housing-unit-based allocation of *additive* measures is ever required,
prefer the IPUMS NHGIS geographic crosswalks (housing-unit and
population-weighted) over land-area shares, and record the exact crosswalk
release. Medians, percentiles, rates, and HPI levels are never allocated —
they are recomputed from parcel-level records or left on native geography.
