import type { TractQuarterRecord, TractQuarterIndex } from './types';

/** Format a number as whole-dollar US currency. */
export function formatCurrency(value: number | null): string {
  if (value == null) return 'Not available';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a percentage rate to two decimal places. */
export function formatRate(value: number | null): string {
  if (value == null) return 'Not available';
  return `${value.toFixed(2)}%`;
}

/** Format HPI as a labeled index value. */
export function formatHpi(value: number | null): string {
  if (value == null) return 'Not available';
  return `Index: ${value.toFixed(1)}`;
}

/** Format a percentage change (e.g., appreciation). */
export function formatPercentageChange(value: number | null): string {
  if (value == null) return 'Not available';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/** Parse a quarter_id like "2024-Q2" into { year, quarter }. */
export function parseQuarterId(quarterId: string): { year: number; quarter: number } | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterId);
  if (!match) return null;
  return { year: parseInt(match[1], 10), quarter: parseInt(match[2], 10) };
}

/** Format a quarter label from "2024-Q2" → "2024 Q2". */
export function formatQuarterLabel(quarterId: string): string {
  const parsed = parseQuarterId(quarterId);
  if (!parsed) return quarterId;
  return `${parsed.year} Q${parsed.quarter}`;
}

/** Get the next quarter ID. */
export function nextQuarter(quarterId: string): string | null {
  const parsed = parseQuarterId(quarterId);
  if (!parsed) return null;
  const nextQ = parsed.quarter === 4 ? 1 : parsed.quarter + 1;
  const nextY = parsed.quarter === 4 ? parsed.year + 1 : parsed.year;
  return `${nextY}-Q${nextQ}`;
}

/** Get the previous quarter ID. */
export function prevQuarter(quarterId: string): string | null {
  const parsed = parseQuarterId(quarterId);
  if (!parsed) return null;
  const prevQ = parsed.quarter === 1 ? 4 : parsed.quarter - 1;
  const prevY = parsed.quarter === 1 ? parsed.year - 1 : parsed.year;
  return `${prevY}-Q${prevQ}`;
}

/** Sort quarter IDs chronologically. */
export function sortQuarterIds(a: string, b: string): number {
  const pa = parseQuarterId(a);
  const pb = parseQuarterId(b);
  if (!pa || !pb) return 0;
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.quarter - pb.quarter;
}

/** Get all quarter IDs in the data indexed chronologically. */
export function getSortedQuarterIds(index: TractQuarterIndex): string[] {
  return Object.keys(index).sort(sortQuarterIds);
}

/** Get a record for a tract in a quarter, or null. */
export function getTractRecord(
  index: TractQuarterIndex,
  quarterId: string,
  tractGeoid: string,
): TractQuarterRecord | null {
  return index[quarterId]?.[tractGeoid] ?? null;
}

/** Get the effective median (null if suppressed). */
export function getEffectiveMedian(record: TractQuarterRecord | null): number | null {
  if (!record) return null;
  if (record.suppressMedian) return null;
  return record.medianSalePrice;
}

/** Count elapsed quarters between two quarter IDs. */
export function countElapsedQuarters(start: string, end: string): number | null {
  const ps = parseQuarterId(start);
  const pe = parseQuarterId(end);
  if (!ps || !pe) return null;
  return (pe.year - ps.year) * 4 + (pe.quarter - ps.quarter);
}

/** Calculate appreciation between two records. */
export function calculateAppreciation(
  startRecord: TractQuarterRecord | null,
  endRecord: TractQuarterRecord | null,
): { absoluteChange: number | null; percentageChange: number | null } {
  const startMedian = getEffectiveMedian(startRecord);
  const endMedian = getEffectiveMedian(endRecord);
  if (startMedian == null || endMedian == null || startMedian === 0) {
    return { absoluteChange: null, percentageChange: null };
  }
  return {
    absoluteChange: endMedian - startMedian,
    percentageChange: ((endMedian / startMedian) - 1) * 100,
  };
}
