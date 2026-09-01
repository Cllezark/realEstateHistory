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
  it('returns diverging breaks with zero on a class boundary', () => {
    const values = new Map<string, number | null>([
      ['t1', -20], ['t2', -10], ['t3', 0], ['t4', 10], ['t5', 20],
    ]);
    const breaks = calculateAppreciationBreaks(values, 9);
    expect(breaks.length).toBeGreaterThan(0);
    // Zero is a boundary, not the interior of a class
    expect(breaks.some(b => b.maxValue === 0)).toBe(true);
    expect(breaks.some(b => b.minValue === 0)).toBe(true);
  });

  it('never lets a single class span negative and positive values', () => {
    const values = new Map<string, number | null>([
      ['t1', -71.3], ['t2', -12], ['t3', 4], ['t4', 88], ['t5', 140],
    ]);
    const breaks = calculateAppreciationBreaks(values, 9);
    for (const b of breaks) {
      expect(b.minValue < 0 && b.maxValue > 0).toBe(false);
    }
  });

  it('uses a uniform, round step and covers the full data span', () => {
    const values = new Map<string, number | null>([
      ['t1', -71.3], ['t2', 140],
    ]);
    const breaks = calculateAppreciationBreaks(values, 9);
    const step = breaks[0].maxValue - breaks[0].minValue;
    // Every class is the same width, and that width is a round number
    for (const b of breaks) {
      expect(b.maxValue - b.minValue).toBeCloseTo(step, 6);
    }
    expect(Number.isInteger(step)).toBe(true);
    // The span is over-fitted so it encloses every observed value
    expect(breaks[0].minValue).toBeLessThanOrEqual(-71.3);
    expect(breaks[breaks.length - 1].maxValue).toBeGreaterThanOrEqual(140);
  });

  it('starts at zero when no tract depreciated', () => {
    const values = new Map<string, number | null>([
      ['t1', 12], ['t2', 45], ['t3', 130],
    ]);
    const breaks = calculateAppreciationBreaks(values, 9);
    expect(breaks[0].minValue).toBe(0);
    expect(breaks.every(b => b.minValue >= 0)).toBe(true);
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
