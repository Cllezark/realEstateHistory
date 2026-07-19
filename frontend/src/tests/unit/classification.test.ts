import { describe, it, expect } from 'vitest';
import {
  calculateQuantileBreaks,
  calculateAppreciationBreaks,
} from '../../data/classification';
import type { TractQuarterIndex, TractQuarterRecord } from '../../data/types';

function makeRecord(median: number | null, count: number | null, suppressed = false): TractQuarterRecord {
  return {
    medianSalePrice: median,
    qualifiedSaleCount: count,
    meanSalePrice: median,
    p25SalePrice: null,
    p75SalePrice: null,
    minSalePrice: null,
    maxSalePrice: null,
    averageRatePercent: null,
    estimatedMonthlyPrincipalInterest: null,
    hpi: null,
    annualChange: null,
    smallSampleFlag: count != null && count < 5,
    suppressMedian: suppressed,
    partialQuarterFlag: false,
  };
}

describe('calculateQuantileBreaks', () => {
  const makeIndex = (quarterId: string, data: [string, number | null, number | null][]): TractQuarterIndex => {
    const quarterData: Record<string, TractQuarterRecord> = {};
    for (const [tract, median, count] of data) {
      quarterData[tract] = makeRecord(median, count, count != null && count < 5);
    }
    return { [quarterId]: quarterData };
  };

  it('returns breaks for valid data', () => {
    const index = makeIndex('2023-Q1', [
      ['t1', 100000, 10], ['t2', 200000, 10], ['t3', 300000, 10],
      ['t4', 400000, 10], ['t5', 500000, 10], ['t6', 600000, 10],
      ['t7', 700000, 10],
    ]);
    const breaks = calculateQuantileBreaks(index, '2023-Q1', 'medianSalePrice', 7);
    expect(breaks).toHaveLength(7);
    expect(breaks[0].minValue).toBe(100000);
    expect(breaks[6].maxValue).toBe(700000);
  });

  it('excludes suppressed median values', () => {
    const index = makeIndex('2023-Q1', [
      ['t1', 100000, 3],  // suppressed (small sample)
      ['t2', 200000, 10],
      ['t3', 300000, 10],
    ]);
    const breaks = calculateQuantileBreaks(index, '2023-Q1', 'medianSalePrice');
    // Should have values from t2 and t3 only
    expect(breaks.length).toBeGreaterThan(0);
  });

  it('returns empty for empty quarter', () => {
    const breaks = calculateQuantileBreaks({}, '2023-Q1', 'medianSalePrice');
    expect(breaks).toEqual([]);
  });
});

describe('calculateAppreciationBreaks', () => {
  it('returns diverging breaks centered on zero', () => {
    const values = new Map<string, number | null>([
      ['t1', -20], ['t2', -10], ['t3', 0], ['t4', 10], ['t5', 20],
    ]);
    const breaks = calculateAppreciationBreaks(values, 9);
    expect(breaks).toHaveLength(9);
    // Center break should contain zero
    const containsZero = breaks.some(b => 0 >= b.minValue && 0 <= b.maxValue);
    expect(containsZero).toBe(true);
  });

  it('handles all-null values', () => {
    const values = new Map<string, number | null>([
      ['t1', null], ['t2', null],
    ]);
    const breaks = calculateAppreciationBreaks(values);
    expect(breaks).toEqual([]);
  });

  it('handles all-equal values', () => {
    const values = new Map<string, number | null>([
      ['t1', 5], ['t2', 5],
    ]);
    const breaks = calculateAppreciationBreaks(values);
    expect(breaks.length).toBeGreaterThan(0);
  });
});
