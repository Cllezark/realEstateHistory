import type { TractQuarterIndex, TractQuarterRecord, MapMetric, LegendBreak } from './types';

/** Color-blind-conscious sequential palette (10 steps, progressively intense). */
const SEQUENTIAL_PALETTE = [
  '#f7fcf0',
  '#e0f3db',
  '#ccebc5',
  '#a8ddb5',
  '#7bccc4',
  '#4eb3d3',
  '#2b8cbe',
  '#0868ac',
  '#084081',
  '#051d3e',
];

/** Diverging palette for comparison mode (centered on zero). */
const DIVERGING_PALETTE = [
  '#d73027',
  '#f46d43',
  '#fdae61',
  '#fee08b',
  '#ffffbf',
  '#d9ef8b',
  '#a6d96a',
  '#66bd63',
  '#1a9850',
];

/**
 * Appreciation ramps, anchored at zero. Depreciation always reads red,
 * appreciation always reads green — no yellow/orange leaking into the
 * positive side, and no green leaking into the negative side.
 * Both ramps run light (near zero) → dark (far from zero).
 */
const DEPRECIATION_RAMP = [
  '#fee0d2',
  '#fcbba1',
  '#fc9272',
  '#fb6a4a',
  '#ef3b2c',
  '#cb181d',
  '#a50f15',
  '#67000d',
];

const APPRECIATION_RAMP = [
  '#e5f5e0',
  '#c7e9c0',
  '#a1d99b',
  '#74c476',
  '#41ab5d',
  '#238b45',
  '#006d2c',
  '#00441b',
];

/** Pick `count` evenly spaced colors from a ramp, light end first. */
function sampleRamp(ramp: string[], count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [ramp[Math.floor(ramp.length / 2)]];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out.push(ramp[Math.round(t * (ramp.length - 1))]);
  }
  return out;
}

/** Fallback color for missing data. */
export const MISSING_COLOR = '#d9d9d9';

/** Fallback color for suppressed values. */
export const SUPPRESSED_COLOR = '#bdbdbd';

/** Colors per metric for legend lookup. */
const METRIC_LABELS: Record<string, string> = {
  medianSalePrice: 'Median Sale Price',
  meanSalePrice: 'Mean Sale Price',
  p25SalePrice: '25th Pct. Sale Price',
  p75SalePrice: '75th Pct. Sale Price',
  minSalePrice: 'Min Sale Price',
  maxSalePrice: 'Max Sale Price',
  qualifiedSaleCount: 'Qualified Sale Count',
  averageRatePercent: 'Average Mortgage Rate (%)',
  estimatedMonthlyPrincipalInterest: 'Est. Monthly P&I',
  hpi: 'FHFA HPI',
  annualChange: 'FHFA Annual Change (%)',
};

/** Get human-readable label for a metric. */
export function getMetricLabel(metric: MapMetric | string): string {
  return METRIC_LABELS[metric] ?? metric;
}

/**
 * Extract values for a metric across all tracts in a quarter.
 * Returns nulls filtered out by suppressMedian where applicable.
 */
function extractMetricValues(
  index: TractQuarterIndex,
  quarterId: string,
  metric: MapMetric,
): number[] {
  const quarterData = index[quarterId];
  if (!quarterData) return [];

  const values: number[] = [];
  for (const tractId of Object.keys(quarterData)) {
    const record = quarterData[tractId];
    // Skip suppressed median values
    if (metric === 'medianSalePrice' && record.suppressMedian) continue;
    if (metric === 'meanSalePrice' && record.suppressMedian) continue;

    const value = record[metric];
    if (value != null) {
      values.push(value);
    }
  }
  return values;
}

/** Calculate fixed $100K interval breaks for sale price metrics. */
function calculateFixedIntervalBreaks(step: number, steps: number): LegendBreak[] {
  const breaks: LegendBreak[] = [];

  for (let i = 0; i < steps; i++) {
    const minValue = i * step;
    const maxValue = (i + 1) * step - 1;
    const color = SEQUENTIAL_PALETTE[i];

    const label = i === steps - 1
      ? `$${fmtCompact(minValue)} and above`
      : `${fmtCompact(minValue)} – ${fmtCompact(maxValue)}`;

    breaks.push({
      label,
      minValue,
      maxValue: i === steps - 1 ? Infinity : maxValue,
      color,
    });
  }
  return breaks;
}

/** Calculate fixed $100K interval breaks for median/mean sale price. */
export function calculateMedianPriceBreaks(): LegendBreak[] {
  return calculateFixedIntervalBreaks(100_000, 10);
}

/** Calculate fixed $100K interval breaks for mean sale price. */
export function calculateMeanPriceBreaks(): LegendBreak[] {
  return calculateFixedIntervalBreaks(100_000, 10);
}

/** Calculate fixed $100K interval breaks for p25/p75/min/max sale price metrics. */
export function calculateP25PriceBreaks(): LegendBreak[] {
  return calculateFixedIntervalBreaks(100_000, 10);
}

export function calculateP75PriceBreaks(): LegendBreak[] {
  return calculateFixedIntervalBreaks(100_000, 10);
}

export function calculateMinPriceBreaks(): LegendBreak[] {
  return calculateFixedIntervalBreaks(100_000, 10);
}

export function calculateMaxPriceBreaks(): LegendBreak[] {
  return calculateFixedIntervalBreaks(100_000, 10);
}

/** Calculate fixed $500 interval breaks for estimated monthly P&I. */
export function calculateMonthlyPaymentBreaks(): LegendBreak[] {
  const step = 500;
  const steps = 10;
  const breaks: LegendBreak[] = [];

  for (let i = 0; i < steps; i++) {
    const minValue = i * step;
    const maxValue = (i + 1) * step - 1;
    const color = SEQUENTIAL_PALETTE[i];

    const label = i === steps - 1
      ? `$${minValue} and above`
      : `$${minValue} – $${maxValue}`;

    breaks.push({
      label,
      minValue,
      maxValue: i === steps - 1 ? Infinity : maxValue,
      color,
    });
  }
  return breaks;
}

/** Calculate quantile breaks for a metric in a quarter. */
export function calculateQuantileBreaks(
  index: TractQuarterIndex,
  quarterId: string,
  metric: MapMetric,
  numClasses: number = 7,
): LegendBreak[] {
  const values = extractMetricValues(index, quarterId, metric);
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const breaks: LegendBreak[] = [];

  for (let i = 0; i < numClasses; i++) {
    const startIdx = Math.floor((i / numClasses) * sorted.length);
    const endIdx = Math.floor(((i + 1) / numClasses) * sorted.length) - 1;
    const minValue = sorted[startIdx];
    const maxValue = sorted[Math.min(endIdx, sorted.length - 1)];
    const color = SEQUENTIAL_PALETTE[i % SEQUENTIAL_PALETTE.length];

    breaks.push({
      label: formatBreakLabel(minValue, maxValue, metric),
      minValue,
      maxValue,
      color,
    });
  }
  return breaks;
}

/** Calculate equal-interval breaks. */
export function calculateEqualIntervalBreaks(
  index: TractQuarterIndex,
  quarterId: string,
  metric: MapMetric,
  numClasses: number = 7,
): LegendBreak[] {
  const values = extractMetricValues(index, quarterId, metric);
  if (values.length < 2) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / numClasses;

  const breaks: LegendBreak[] = [];
  for (let i = 0; i < numClasses; i++) {
    const minValue = min + i * step;
    const maxValue = i === numClasses - 1 ? max : min + (i + 1) * step;
    const color = SEQUENTIAL_PALETTE[i % SEQUENTIAL_PALETTE.length];
    breaks.push({
      label: formatBreakLabel(minValue, maxValue, metric),
      minValue,
      maxValue,
      color,
    });
  }
  return breaks;
}

/** Get the color for a given value from breaks. */
export function getColorForValue(value: number | null, breaks: LegendBreak[]): string {
  if (value == null) return MISSING_COLOR;
  for (const b of breaks) {
    if (value >= b.minValue && value <= b.maxValue) return b.color;
  }
  // Fallback to last break
  if (breaks.length > 0) return breaks[breaks.length - 1].color;
  return MISSING_COLOR;
}

/** Format a break label for a metric. */
function formatBreakLabel(min: number, max: number, metric: MapMetric): string {
  const isCurrency = metric === 'medianSalePrice' || metric === 'meanSalePrice'
    || metric === 'estimatedMonthlyPrincipalInterest';
  const isPercent = metric === 'averageRatePercent' || metric === 'annualChange';

  if (isCurrency) {
    return `${fmtCompact(min)} – ${fmtCompact(max)}`;
  }
  if (isPercent) {
    return `${min.toFixed(1)}% – ${max.toFixed(1)}%`;
  }
  if (metric === 'hpi') {
    return `${min.toFixed(1)} – ${max.toFixed(1)}`;
  }
  return `${min} – ${max}`;
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** Determine the color for a tract in a given quarter. */
export function getTractColor(
  record: TractQuarterRecord | null,
  breaks: LegendBreak[],
  metric: MapMetric,
): string {
  if (!record) return MISSING_COLOR;
  if (record.suppressMedian && (metric === 'medianSalePrice' || metric === 'meanSalePrice')) {
    return SUPPRESSED_COLOR;
  }
  const value = record[metric];
  if (value == null) return MISSING_COLOR;
  return getColorForValue(value, breaks);
}

/** Calculate appreciation-based diverging breaks over the actual data range. */
export function calculateAppreciationBreaks(
  appreciationValues: Map<string, number | null>,
  numClasses: number = 9,
): LegendBreak[] {
  const valid = Array.from(appreciationValues.values()).filter((v): v is number => v != null);
  if (valid.length === 0) return [];

  const minValue = Math.min(...valid);
  const maxValue = Math.max(...valid);

  if (minValue === maxValue) {
    // Every tract moved by the same amount — a single class, colored by sign.
    return [{
      label: `${formatPercentBound(minValue)}`,
      minValue,
      maxValue,
      color: minValue < 0
        ? DEPRECIATION_RAMP[4]
        : minValue > 0 ? APPRECIATION_RAMP[4] : DIVERGING_PALETTE[4],
    }];
  }

  // Calculate ideal step size and round to a nice number
  const rawStep = (maxValue - minValue) / numClasses;
  const stepMagnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const roundedStep = Math.ceil(rawStep / stepMagnitude) * stepMagnitude;

  // Adjust min/max to align with step boundaries
  const alignedMin = Math.floor(minValue / roundedStep) * roundedStep;
  const alignedMax = Math.ceil(maxValue / roundedStep) * roundedStep;
  const range = alignedMax - alignedMin;

  // Recalculate number of steps to fit the aligned range
  const actualSteps = Math.round(range / roundedStep);

  // Build the step ranges first. Because alignedMin/alignedMax are multiples of
  // roundedStep, zero always lands on a boundary — no step can span both signs.
  const ranges: Array<{ min: number; max: number }> = [];
  for (let i = 0; i < actualSteps; i++) {
    const stepMin = alignedMin + i * roundedStep;
    ranges.push({ min: stepMin, max: stepMin + roundedStep });
  }

  // Colors are anchored at zero, not at the ends of the range: everything below
  // zero draws from the red ramp, everything at or above zero from the green ramp,
  // each scaled to how many steps actually fall on that side.
  const negativeCount = ranges.filter(r => r.max <= 0).length;
  const positiveCount = ranges.length - negativeCount;
  // Most negative step gets the darkest red, so walk the sampled ramp backwards.
  const negativeColors = sampleRamp(DEPRECIATION_RAMP, negativeCount).reverse();
  const positiveColors = sampleRamp(APPRECIATION_RAMP, positiveCount);

  return ranges.map((r, i) => ({
    label: `${formatPercentBound(r.min)} – ${formatPercentBound(r.max)}`,
    minValue: r.min,
    maxValue: r.max,
    color: i < negativeCount ? negativeColors[i] : positiveColors[i - negativeCount],
  }));
}

/** Format a legend bound, dropping the decimal when the step lands on a whole number. */
function formatPercentBound(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
