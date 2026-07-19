# Map Methodology

## Classification Methods

### Quantile Classification (Default)

The default choropleth classification uses **quintiles** (5 equal-count classes) per quarter per metric. For each quarter, all tract values for the active metric are sorted and divided into 5 groups with equal numbers of tracts.

**Process**:
1. Collect all non-null, non-suppressed values for the metric in the active quarter
2. Sort values ascending
3. Split into 5 equal-sized groups
4. Compute breakpoints at group boundaries
5. Assign each tract to the break range containing its value

**Edge cases**:
- Fewer than 5 unique values → equal-interval fallback
- All values identical → single class spanning the value
- No values for a tract → "No data" color (light gray)

### Appreciation Comparison (Diverging)

When comparison mode is active, a **diverging color scale** is used centered on zero:
- Negative change (decline) → blue tones
- Near zero → light neutral
- Positive change (appreciation) → orange/red tones

The scale uses symmetric breakpoints around zero (max absolute percentage change determines range).

### Color Palette

**Sequential** (single-quarter choropleth): Color-blind-conscious green-to-blue palette
```
#f7fcf0 → #e0f3db → #ccebc5 → #a8ddb5 → #7bccc4 → #4eb3d3 → #2b8cbe → #0868ac → #084081
```

**Diverging** (comparison mode): Blue-white-orange diverging palette
```
#2166ac → #4393c3 → #92c5de → #d1e5f0 → #f7f7f7 → #fddbc7 → #f4a582 → #d6604d → #b2182b
```

**Missing/Suppressed**: `#cccccc` (light gray) with appropriate legend indicator.

## Mortgage Payment Calculation

Monthly principal and interest payments are estimated using the standard amortization formula:

```
P&I = P × [r(1+r)^n] / [(1+r)^n - 1]
```

Where:
- **P** = Median sale price × (1 - down payment %)
- **r** = Monthly interest rate (average 30-year fixed rate / 12 / 100)
- **n** = Loan term in months (30 years × 12 = 360)

**Assumptions** (from `config.yaml`):
- Down payment: 20%
- Loan term: 30 years
- Rate source: FRED 30-Year Fixed Rate Mortgage Average (weekly, averaged to quarterly)
- Payment components: Principal and interest only (no taxes, insurance, PMI)

**Important**: The estimated payment is for comparison purposes only. It does not include property taxes, homeowner's insurance, or mortgage insurance, which can significantly increase total monthly housing costs.

## Geographic Scope

### St. Petersburg, Florida

The map covers **80 Census tracts** within the city of St. Petersburg. Tracts are identified by their 11-digit GEOID (state `12` + county `103` + tract `022701`).

### Tract Selection Criteria

A tract is included if it meets **both** conditions:
1. Geographically within St. Petersburg city limits (determined by Phase 1 city membership logic)
2. Has at least one qualified sale in the dataset period (2021-Q1 through 2026-Q4)

### Boundary Source

2020 TIGER/Line Census tract boundaries, effective January 1, 2020. These are the boundaries used for the 2020 Decennial Census and American Community Survey 2020-2024.

## Data Quality

### Sale Filtering (Phase 1)

Only "qualified" sales are included in tract-level aggregations:
- Sale price between $50,000 and $5,000,000
- Valid property characteristics (living area, lot size within bounds)
- Arms-length transactions (excludes quit claim deeds, foreclosures, etc.)
- Single-family residential properties

### Suppression

- **Small sample flag** (< 30 sales): Median and mean are displayed with a warning indicator
- **Suppression** (< 5 sales): Median and mean are nulled entirely to prevent disclosure of individual transactions
- **Partial quarter**: The current incomplete quarter is flagged but values are displayed

### FHFA HPI

The Federal Housing Finance Agency Tract HPI is an annual index (1990=100, 2000=100) merged at the tract-year level. Values are not available for all tract-years. The `annualChange` field shows year-over-year percentage change.

## Limitations

1. **Census tract boundaries** are from 2020 and may not reflect recent annexations
2. **FHFA HPI** is annual, so quarterly values show repeated annual values within each year
3. **Mortgage rate** is a national average, not borrower-specific; actual rates vary by credit score, loan type, and lender
4. **Suppressed cells** may hide localized market activity in low-transaction tracts
5. **The map shows correlations, not causations** — observed patterns should be interpreted with appropriate caution
