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
 * Depreciation shades (red), darkest at the extreme, lightening toward 0%.
 * 6 steps — more gradation than the appreciation side, since declines in
 * this market are less common and worth distinguishing more finely.
 */
const DEPRECIATION_SHADES = [
  '#67001f',
  '#a50026',
  '#d73027',
  '#f46d43',
  '#fdae61',
  '#fee08b',
];

/**
 * Appreciation shades (green), lightest just above 0%, darkening toward the extreme.
 * 4 steps.
 */
const APPRECIATION_SHADES = [
  '#d9ef8b',
  '#a6d96a',
  '#66bd63',
  '#1a9850',
];

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

/**
 * Calculate appreciation-based diverging breaks with a hard color boundary at 0%.
 * Depreciation (< 0%) and appreciation (> 0%) each get their own independent
 * range (based on the actual min/max of the data) split into their own number
 * of bins, so no bin straddles zero and each side can have a different
 * resolution — e.g. more, finer steps on the depreciation side.
 */
export function calculateAppreciationBreaks(
  appreciationValues: Map<string, number | null>,
  depreciationClasses: number = 6,
  appreciationClasses: number = 4,
): LegendBreak[] {
  const valid = Array.from(appreciationValues.values()).filter((v): v is number => v != null);
  if (valid.length === 0) return [];

  const minValueOverall = Math.min(...valid);
  const maxValueOverall = Math.max(...valid);
  const minMagnitude = Math.abs(Math.min(minValueOverall, 0));
  const maxMagnitude = Math.max(maxValueOverall, 0);

  if (minMagnitude === 0 && maxMagnitude === 0) {
    return [{
      label: '0.0% (no change)',
      minValue: 0,
      maxValue: 0,
      color: APPRECIATION_SHADES[0],
    }];
  }

  const breaks: LegendBreak[] = [];

  // Depreciation side: darkest red at the extreme, lightening toward 0.
  if (minMagnitude > 0) {
    const step = minMagnitude / depreciationClasses;
    for (let i = 0; i < depreciationClasses; i++) {
      const minValue = -minMagnitude + i * step;
      const maxValue = i === depreciationClasses - 1 ? 0 : -minMagnitude + (i + 1) * step;
      const shadeIdx = Math.round((i / Math.max(depreciationClasses - 1, 1)) * (DEPRECIATION_SHADES.length - 1));
      breaks.push({
        label: `${minValue.toFixed(1)}% – ${maxValue.toFixed(1)}%`,
        minValue,
        maxValue,
        color: DEPRECIATION_SHADES[shadeIdx],
      });
    }
  }

  // Appreciation side: lightest green just above 0, darkening toward the extreme.
  if (maxMagnitude > 0) {
    const step = maxMagnitude / appreciationClasses;
    for (let i = 0; i < appreciationClasses; i++) {
      const minValue = i === 0 ? 0 : i * step;
      const maxValue = (i + 1) * step;
      const shadeIdx = Math.round((i / Math.max(appreciationClasses - 1, 1)) * (APPRECIATION_SHADES.length - 1));
      breaks.push({
        label: `${minValue.toFixed(1)}% – ${maxValue.toFixed(1)}%`,
        minValue,
        maxValue,
        color: APPRECIATION_SHADES[shadeIdx],
      });
    }
  }

  return breaks;
}
