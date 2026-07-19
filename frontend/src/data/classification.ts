import type { TractQuarterIndex, TractQuarterRecord, MapMetric, LegendBreak } from './types';

/** Color-blind-conscious sequential palette (9 steps). */
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

/** Fallback color for missing data. */
export const MISSING_COLOR = '#d9d9d9';

/** Fallback color for suppressed values. */
export const SUPPRESSED_COLOR = '#bdbdbd';

/** Colors per metric for legend lookup. */
const METRIC_LABELS: Record<string, string> = {
  medianSalePrice: 'Median Sale Price',
  meanSalePrice: 'Mean Sale Price',
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

/** Calculate appreciation-based diverging breaks. */
export function calculateAppreciationBreaks(
  appreciationValues: Map<string, number | null>,
  numClasses: number = 9,
): LegendBreak[] {
  const valid = Array.from(appreciationValues.values()).filter((v): v is number => v != null);
  if (valid.length === 0) return [];

  const maxAbs = Math.max(Math.abs(Math.min(...valid)), Math.abs(Math.max(...valid)));
  if (maxAbs === 0) {
    return [{
      label: '0.0% (no change)',
      minValue: 0,
      maxValue: 0,
      color: DIVERGING_PALETTE[4],
    }];
  }

  const step = (maxAbs * 2) / numClasses;
  const breaks: LegendBreak[] = [];

  for (let i = 0; i < numClasses; i++) {
    const minValue = -maxAbs + i * step;
    const maxValue = -maxAbs + (i + 1) * step;
    const color = DIVERGING_PALETTE[i % DIVERGING_PALETTE.length];
    breaks.push({
      label: `${minValue.toFixed(1)}% – ${maxValue.toFixed(1)}%`,
      minValue,
      maxValue,
      color,
    });
  }
  return breaks;
}
