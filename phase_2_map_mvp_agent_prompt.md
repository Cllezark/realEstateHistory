# Phase 2: St. Petersburg Real Estate Map MVP

## Prompt for the implementation agent

You are implementing Phase 2 of an interactive St. Petersburg, Florida real-estate dashboard. Phase 1 produced cleaned, validated analytical data from Pinellas County Property Appraiser sales and property records, FHFA Census Tract HPI data, FRED mortgage rates, and Census TIGER/Line geometry.

Build a functional map MVP that allows a user to explore quarterly housing-market conditions by Census tract.

## Primary objective

Create a browser-based application with three coordinated sections:

1. A large choropleth map of St. Petersburg Census tracts
2. A narrow right-side details panel for the selected tract and quarter
3. A bottom timeline for selecting a calendar quarter

The MVP must use pipeline-produced data rather than simulated, hard-coded, or manually transcribed market values.

## First step: inspect the project

Before writing application code:

* Inspect the repository structure and existing technology choices.
* Locate the Phase 1 outputs, schemas, data dictionary, configuration, and quality reports.
* Identify the actual field names rather than assuming the examples below are exact.
* Determine whether a frontend application already exists.
* Determine whether the repository already prescribes a mapping library, framework, build system, or hosting target.
* Document any missing or incompatible outputs.
* Do not silently fabricate missing columns or substitute placeholder market data.

If the repository has no frontend standard, use:

* React
* TypeScript
* Vite
* MapLibre GL JS
* A lightweight charting library such as Recharts
* Vitest and React Testing Library
* Playwright for one end-to-end smoke test

Use the existing project conventions when they differ.

## Expected Phase 1 inputs

Begin by locating equivalents of these outputs:

### Tract geometry

Prefer one of:

```text
dashboard_tracts.geojson
dim_census_tract.geojson
dim_census_tract.geoparquet
```

Expected fields include:

```text
tract_geoid
geometry
tract_name
county_fips
state_fips
land_area
water_area
```

Geometry should represent the fixed Census tract vintage selected during Phase 1, preferably 2020 Census tracts.

### Tract-quarter market data

Prefer an output equivalent to:

```text
dashboard_tract_quarter.parquet
```

Expected fields include:

```text
tract_geoid
year
quarter
quarter_id
quarter_start_date
quarter_end_date
qualified_sale_count
median_sale_price
mean_sale_price
sale_price_p25
sale_price_p75
minimum_sale_price
maximum_sale_price
average_rate_percent
estimated_monthly_principal_interest
fhfa_hpi
small_sample_flag
suppression_flag
partial_quarter_flag
data_quality_flag
```

### Optional tract-year HPI table

```text
fact_tract_hpi_annual.parquet
```

Expected fields include:

```text
tract_geoid
year
hpi
annual_change
```

### Optional metadata

Use these when available:

```text
data_dictionary
pipeline configuration
quality report
source manifest
last successful pipeline run metadata
```

## Add a dashboard publication step if necessary

Browsers should not be required to load a large raw Parquet or GeoParquet file unless the existing application already supports that efficiently.

If Phase 1 does not produce browser-ready files, add a bounded publication script that:

1. Reads the validated Phase 1 outputs.
2. Filters geometry to tracts relevant to St. Petersburg.
3. Reprojects geometry to EPSG:4326.
4. Repairs or rejects invalid geometry.
5. Simplifies geometry for web display without materially altering boundaries.
6. Joins or associates geometry using `tract_geoid`.
7. Exports compact application assets.
8. Produces a publication manifest with build date, boundary vintage, date coverage, and assumptions.

Recommended assets:

```text
public/data/tracts.geojson
public/data/tract-quarter.json
public/data/metadata.json
```

An indexed structure is preferred:

```json
{
  "2021-Q1": {
    "12103020101": {
      "medianSalePrice": 325000,
      "qualifiedSaleCount": 8,
      "averageRatePercent": 2.88,
      "estimatedMonthlyPrincipalInterest": 1079
    }
  }
}
```

Alternative normalized structures are acceptable when they are smaller or easier to maintain.

Do not duplicate geometry for every quarter.

Fail the publication build when:

* Required keys are missing.
* Duplicate `(tract_geoid, quarter_id)` records exist.
* Market records refer to unknown tracts.
* Geometry contains duplicate tract GEOIDs.
* Prices or counts contain impossible values.
* The selected boundary vintage is not identified.

## Geographic scope

Use parcel-based city filtering performed by Phase 1 as the authoritative market-data scope.

The map should display Census tracts associated with St. Petersburg. Some tracts may extend beyond the municipal boundary. Do not imply that every part of a displayed tract is inside the city when only part of it intersects St. Petersburg.

If a St. Petersburg municipal polygon is available:

* Draw it as a distinct outline.
* Keep tract boundaries independently visible.
* Explain the geography in the interface’s information panel.

Do not use neighborhood boundaries for the Phase 2 MVP. Use Census tracts because they provide stable identifiers and join directly to the analytical tables and FHFA data.

## Required layout

### Desktop

Use a responsive three-region layout:

```text
┌──────────────────────────────────────┬───────────────────┐
│                                      │                   │
│            Tract map                 │  Selected tract   │
│                                      │  details          │
│                                      │                   │
├──────────────────────────────────────┴───────────────────┤
│       Quarter timeline and playback controls             │
└───────────────────────────────────────────────────────────┘
```

The map should receive most of the available viewport.

### Small screens

Stack the sections in this order:

1. Map
2. Timeline
3. Selected-tract details

The interface must remain usable with touch input.

## Map requirements

Render one interactive polygon per Census tract.

The map must:

* Start centered on St. Petersburg.
* Fit the relevant tract bounds on initial load.
* Use a neutral basemap that does not overpower the data.
* Display clear tract borders.
* Shade each tract according to the active metric.
* Update colors when the selected quarter or metric changes.
* Highlight the selected tract.
* Support mouse, touch, and keyboard-accessible tract selection where practical.
* Show a compact hover or focus tooltip.
* Preserve the selected tract as the timeline changes.
* Display missing or suppressed values differently from valid observations.
* Include a visible legend tied to the active metric.

Do not use addresses, parcel points, or individual-sale markers in the MVP.

## Default choropleth

The default map metric is:

```text
median_sale_price
```

Use a sequential, colorblind-conscious palette.

The legend must display:

* Metric name
* Currency-formatted break values
* Missing-data style
* Suppressed or insufficient-sample style

Choose one documented classification method:

* Quantiles
* Equal intervals
* Jenks natural breaks
* Fixed business-defined ranges

For the MVP, quantiles calculated across valid St. Petersburg tract values for the selected quarter are acceptable.

Important behavior:

* Recalculate quantile breaks when the quarter changes.
* Avoid unstable classification when too few tracts have observations.
* Fall back to meaningful fixed ranges if the selected quarter lacks enough values.
* Do not treat null values as zero.
* Do not give suppressed observations a normal value color.

## Quarter timeline

Provide a timeline covering all available quarters in the published dataset.

The timeline must include:

* A range input or discrete quarter slider
* The selected quarter label, such as `2024 Q2`
* Previous-quarter and next-quarter controls
* First and last available quarter indicators
* Optional play and pause animation
* Keyboard navigation
* A disabled state when no data is loaded

The timeline should include every calendar quarter between the minimum and maximum dates, even when some quarters contain no observations.

Changing the quarter must update:

* Map colors
* Legend breaks
* Hover values
* Selected-tract details
* Chart emphasis
* URL state, if deep linking is implemented

## Selected-tract details panel

When no tract is selected, show a short instruction and citywide context for the active quarter.

When a tract is selected, display:

* Census tract name or number
* Full 11-character tract GEOID
* Selected quarter
* Median qualified sale price
* Qualified sale count
* 25th and 75th sale-price percentiles
* Average 30-year mortgage rate
* Estimated monthly principal-and-interest payment
* FHFA HPI, when available
* Small-sample, suppression, partial-quarter, or quality warnings
* A small historical trend chart

Use appropriate formatting:

* Prices and payments as whole-dollar currency
* Rates as percentages with two decimal places
* HPI with a clearly labeled index scale
* Missing values as `Not available`, never `$0` or `0%`

The trend chart should show quarterly median sale price for the selected tract. Visually distinguish:

* Valid observed values
* Missing quarters
* Suppressed observations
* Partial current-quarter observations

Do not connect a line across long missing periods in a way that suggests measured values exist.

## Mortgage-payment explanation

Label the payment as:

```text
Estimated monthly principal and interest
```

Provide an accessible tooltip or information disclosure explaining:

* It is based on the tract’s observed median sale price.
* It uses the quarterly average national 30-year fixed mortgage rate.
* It uses the configured down-payment assumption, initially 20%.
* It assumes a 30-year loan unless Phase 1 configuration says otherwise.
* It excludes property taxes, homeowners insurance, flood insurance, mortgage insurance, HOA dues, closing costs, and maintenance.
* It is an estimate, not an observed borrower payment.

Read the assumptions from publication metadata where possible rather than duplicating them in frontend code.

## Data-quality behavior

The frontend must preserve Phase 1 quality semantics.

Implement clear visual treatment for:

* Missing observation
* Fewer sales than the configured minimum
* Suppressed value
* Partial current quarter
* Failed quality check
* Missing FHFA HPI
* Missing mortgage-rate observation

Do not expose a value that Phase 1 marked as suppressed.

If a tract has no valid median for the selected quarter:

* Render it with the missing-data style.
* Keep it selectable.
* Explain the absence in the details panel.
* Continue showing its historical chart when historical data exists.

## Appreciation comparison mode

Add a simple secondary mode that compares two user-selected quarters.

Controls should include:

* Start quarter
* End quarter
* Metric selector
* Clear comparison action

Initially support appreciation based on observed median sale price:

```text
absolute_change =
    end_median_sale_price - start_median_sale_price

percentage_change =
    (end_median_sale_price / start_median_sale_price - 1) × 100
```

Only calculate appreciation when both endpoints have valid, unsuppressed medians.

When comparison mode is active:

* Use a diverging color scale centered on zero.
* Show percentage appreciation on the map.
* Show both endpoint prices in the details panel.
* Show absolute and percentage change.
* Show elapsed quarter count.
* Clearly identify tracts lacking one or both endpoints.
* State that median-price change can reflect changes in the mix of homes sold and is not the same as repeat-sales appreciation.

If FHFA tract HPI comparison is added, present it as a separate metric. Do not combine or relabel HPI change as median-price change.

## Application state

Use a single, predictable state model for:

```text
selected tract
selected quarter
active map metric
comparison mode
comparison start quarter
comparison end quarter
legend classification
data-loading state
error state
```

Keep derived values out of mutable state when they can be calculated from source state.

Where practical, encode these values in URL query parameters:

```text
?tract=12103020101&quarter=2024-Q2&metric=median-price
```

Invalid URL parameters should fall back safely rather than crashing the application.

## Accessibility

Meet reasonable WCAG 2.1 AA expectations for the MVP:

* All controls must have accessible labels.
* Controls must be keyboard operable.
* Focus states must be visible.
* Color must not be the only indicator of missing, suppressed, selected, or positive/negative status.
* Text and controls must meet contrast requirements.
* Tooltips must have an accessible alternative.
* Map status changes should be available to assistive technology.
* Respect reduced-motion preferences.
* Use semantic headings and landmarks.

## Performance

Target smooth interaction on a typical laptop and modern mobile device.

Requirements:

* Load geometry once.
* Do not rebuild the map object whenever the quarter changes.
* Update feature state or source data efficiently.
* Index market records by quarter and tract.
* Avoid scanning the entire dataset on every hover.
* Lazy-load nonessential charts or documentation if helpful.
* Keep initial browser assets reasonably small.
* Display a loading state while data is fetched and parsed.
* Display a useful error state when an asset cannot be loaded.

If GeoJSON size becomes a problem, document and implement an appropriate alternative such as TopoJSON, vector tiles, or PMTiles. Do not add infrastructure that the dataset does not yet require.

## Visual design

Use a restrained civic-data aesthetic:

* Light neutral background
* High-contrast type
* Clear spacing and hierarchy
* Minimal decorative elements
* Consistent currency and date formatting
* Map colors reserved for data meaning
* Compact but readable detail cards
* Visible data-vintage and methodology links

Avoid:

* Excessive gradients
* Unnecessary animations
* 3D map effects
* Property-themed clip art
* Red-green-only comparisons
* Dense dashboards with unrelated metrics

## Required interface disclosures

Display or make easily accessible:

* Data coverage start and end dates
* Date of the latest pipeline build
* Census tract boundary vintage
* PCPAO source attribution
* FHFA source attribution
* FRED/Freddie Mac rate attribution
* Mortgage assumptions
* Small-sample threshold
* Explanation of qualified sales
* Explanation of missing and suppressed values
* Historical-coverage limitations

The PCPAO dataset currently begins in 2021. Do not imply that observed tract-level quarterly medians exist before the earliest qualified sale data.

## Error handling

The application must handle:

* Missing data files
* Malformed JSON or GeoJSON
* Empty datasets
* Unknown tract keys
* Duplicate tract keys
* A quarter with no valid values
* A selected tract with no record in the active quarter
* Invalid comparison date order
* Missing publication metadata
* Unsupported browser features

Errors should be visible and actionable. Do not leave the map blank without explanation.

## Testing requirements

### Unit tests

Test at minimum:

* Quarter sorting and formatting
* Currency and rate formatting
* Tract-quarter lookup
* Quantile or legend-break calculation
* Null and suppression behavior
* Mortgage-assumption display
* Appreciation calculations
* Invalid comparison endpoints
* URL-state parsing
* Tooltip content

### Component tests

Test:

* Timeline updates the active quarter
* Selecting a tract updates the details panel
* Missing observations render correctly
* Suppressed values are not displayed
* Comparison mode changes the legend and details
* Clearing comparison restores median-price mode

### End-to-end smoke test

Use Playwright to verify:

1. The app loads.
2. The map is visible.
3. A tract can be selected.
4. The selected quarter can be changed.
5. The details panel updates.
6. Comparison mode can be enabled.
7. No uncaught browser errors occur.

### Publication validation

Test that:

* Every geometry has one unique tract GEOID.
* Every market-data tract GEOID exists in geometry.
* Every quarter ID follows one canonical format.
* `(tract_geoid, quarter_id)` is unique.
* Suppressed values do not contain publishable medians.
* Date coverage agrees with metadata.
* Browser-ready files are deterministic across identical builds.

## Documentation deliverables

Create or update:

```text
README.md
docs/map-mvp-architecture.md
docs/map-data-contract.md
docs/map-methodology.md
docs/map-accessibility.md
```

Document:

* How to install dependencies
* How to run the application locally
* How to publish browser-ready data
* How to run tests
* How to build a production bundle
* Expected Phase 1 inputs
* Generated web assets
* State model
* Map classification method
* Data-quality behavior
* Known limitations
* Recommended Phase 3 improvements

Include a Mermaid architecture diagram showing:

```text
Phase 1 analytical outputs
    → publication and validation script
    → static web assets
    → application data store
    → map, timeline, and details panel
```

## Required implementation outputs

Deliver:

* Working frontend source code
* Browser-ready data publication script
* Validated web data assets or reproducible build instructions
* Responsive map layout
* Quarter timeline
* Selected-tract details panel
* Historical trend chart
* Appreciation comparison mode
* Legends and disclosures
* Automated tests
* Documentation
* Production build configuration

## MVP acceptance criteria

The MVP is complete when:

1. A clean checkout can build the web data assets from Phase 1 outputs.
2. The application starts with one documented command.
3. The map displays the correct St. Petersburg Census tracts.
4. Tracts are shaded by median sale price for the selected quarter.
5. The legend accurately reflects the active values and classification.
6. A user can select a tract from the map.
7. The details panel displays that tract’s actual pipeline-produced metrics.
8. Moving the quarter slider updates all coordinated views.
9. Missing, suppressed, and partial-quarter records are clearly distinguished.
10. The mortgage payment is labeled as an estimate with its assumptions.
11. A user can compare median prices between two quarters.
12. Data-source and methodology disclosures are available.
13. Automated tests pass.
14. The production build completes without errors.
15. No simulated market figures appear in the application.

## Out of scope for Phase 2

Do not add these unless the existing repository already provides them at negligible cost:

* Individual parcel or sale visualization
* User accounts
* Saved searches
* Mortgage prequalification
* Property listings
* Automated home-value estimates
* Neighborhood geography
* School or crime overlays
* Custom backend APIs
* Real-time streaming updates
* Mobile native applications
* Predictive price forecasting
* Inflation-adjusted analysis
* Taxes, insurance, HOA, or flood-cost modeling
* Full production cloud deployment

Structure the code so these features can be added later without including them in the MVP.

## Implementation conduct

* Make bounded assumptions and document them.
* Prefer configuration over hard-coded paths and thresholds.
* Preserve all Phase 1 quality and suppression rules.
* Do not change Phase 1 analytical definitions merely to simplify the frontend.
* Do not silently repair or fabricate market observations.
* Keep commits logically organized if source control is available.
* Run the full validation, test, and production-build suite before declaring completion.
* Report remaining data gaps separately from implementation defects.

At completion, provide a concise summary containing:

* What was built
* Commands to run it
* Input and output locations
* Tests performed and results
* Screenshots of the primary states
* Known limitations
* Recommended Phase 3 work
