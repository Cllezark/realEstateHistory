import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatRate,
  formatHpi,
  formatPercentageChange,
  parseQuarterId,
  formatQuarterLabel,
  nextQuarter,
  prevQuarter,
  sortQuarterIds,
  getSortedQuarterIds,
  getTractRecord,
  getEffectiveMedian,
  countElapsedQuarters,
  calculateAppreciation,
} from '../../data/formatters';
import type { TractQuarterIndex, TractQuarterRecord } from '../../data/types';

describe('formatCurrency', () => {
  it('formats positive values as whole-dollar currency', () => {
    expect(formatCurrency(325000)).toBe('$325,000');
  });
  it('returns "Not available" for null', () => {
    expect(formatCurrency(null)).toBe('Not available');
  });
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });
});

describe('formatRate', () => {
  it('formats a rate with two decimal places', () => {
    expect(formatRate(2.88)).toBe('2.88%');
  });
  it('returns "Not available" for null', () => {
    expect(formatRate(null)).toBe('Not available');
  });
});

describe('formatHpi', () => {
  it('formats HPI as a labeled index', () => {
    expect(formatHpi(145.2)).toBe('Index: 145.2');
  });
  it('returns "Not available" for null', () => {
    expect(formatHpi(null)).toBe('Not available');
  });
});

describe('formatPercentageChange', () => {
  it('shows positive change with + sign', () => {
    expect(formatPercentageChange(5.3)).toBe('+5.3%');
  });
  it('shows negative change with sign', () => {
    expect(formatPercentageChange(-3.1)).toBe('-3.1%');
  });
  it('returns "Not available" for null', () => {
    expect(formatPercentageChange(null)).toBe('Not available');
  });
});

describe('parseQuarterId', () => {
  it('parses valid quarter IDs', () => {
    expect(parseQuarterId('2024-Q2')).toEqual({ year: 2024, quarter: 2 });
  });
  it('rejects invalid format', () => {
    expect(parseQuarterId('2024')).toBeNull();
    expect(parseQuarterId('2024-Q5')).toBeNull();
    expect(parseQuarterId('not-a-quarter')).toBeNull();
  });
});

describe('formatQuarterLabel', () => {
  it('converts quarter ID to display label', () => {
    expect(formatQuarterLabel('2024-Q2')).toBe('2024 Q2');
  });
  it('returns raw value for invalid quarters', () => {
    expect(formatQuarterLabel('invalid')).toBe('invalid');
  });
});

describe('nextQuarter / prevQuarter', () => {
  it('advances within a year', () => {
    expect(nextQuarter('2024-Q1')).toBe('2024-Q2');
  });
  it('wraps to next year', () => {
    expect(nextQuarter('2024-Q4')).toBe('2025-Q1');
  });
  it('goes back within a year', () => {
    expect(prevQuarter('2024-Q2')).toBe('2024-Q1');
  });
  it('wraps to previous year', () => {
    expect(prevQuarter('2024-Q1')).toBe('2023-Q4');
  });
  it('returns null for invalid quarter', () => {
    expect(nextQuarter('bad')).toBeNull();
    expect(prevQuarter('bad')).toBeNull();
  });
});

describe('sortQuarterIds', () => {
  it('sorts chronologically', () => {
    const quarters = ['2024-Q4', '2021-Q1', '2023-Q2', '2024-Q1'];
    const sorted = [...quarters].sort(sortQuarterIds);
    expect(sorted).toEqual(['2021-Q1', '2023-Q2', '2024-Q1', '2024-Q4']);
  });
});

describe('getSortedQuarterIds', () => {
  it('extracts and sorts quarter keys', () => {
    const index: TractQuarterIndex = {
      '2023-Q2': {},
      '2021-Q1': {},
      '2024-Q4': {},
    };
    expect(getSortedQuarterIds(index)).toEqual(['2021-Q1', '2023-Q2', '2024-Q4']);
  });
});

describe('getTractRecord', () => {
  it('returns record for matching quarter and tract', () => {
    const record: TractQuarterRecord = {
      medianSalePrice: 300000,
      qualifiedSaleCount: 10,
      meanSalePrice: 320000,
      p25SalePrice: 250000,
      p75SalePrice: 380000,
      minSalePrice: 200000,
      maxSalePrice: 500000,
      averageRatePercent: 3.5,
      estimatedMonthlyPrincipalInterest: 1080,
      hpi: 140,
      annualChange: 5.0,
      smallSampleFlag: false,
      suppressMedian: false,
      partialQuarterFlag: false,
    };
    const index: TractQuarterIndex = {
      '2023-Q1': {
        '12103020101': record,
      },
    };
    expect(getTractRecord(index, '2023-Q1', '12103020101')).toEqual(record);
  });
  it('returns null for missing quarter', () => {
    expect(getTractRecord({}, '2023-Q1', '999')).toBeNull();
  });
});

describe('getEffectiveMedian', () => {
  it('returns median when not suppressed', () => {
    const record: TractQuarterRecord = {
      medianSalePrice: 300000, qualifiedSaleCount: 10, meanSalePrice: null,
      p25SalePrice: null, p75SalePrice: null, minSalePrice: null, maxSalePrice: null,
      averageRatePercent: null, estimatedMonthlyPrincipalInterest: null,
      hpi: null, annualChange: null,
      smallSampleFlag: false, suppressMedian: false, partialQuarterFlag: false,
    };
    expect(getEffectiveMedian(record)).toBe(300000);
  });
  it('returns null when suppressed', () => {
    const record: TractQuarterRecord = {
      medianSalePrice: 300000, qualifiedSaleCount: 3, meanSalePrice: null,
      p25SalePrice: null, p75SalePrice: null, minSalePrice: null, maxSalePrice: null,
      averageRatePercent: null, estimatedMonthlyPrincipalInterest: null,
      hpi: null, annualChange: null,
      smallSampleFlag: true, suppressMedian: true, partialQuarterFlag: false,
    };
    expect(getEffectiveMedian(record)).toBeNull();
  });
  it('returns null for null record', () => {
    expect(getEffectiveMedian(null)).toBeNull();
  });
});

describe('countElapsedQuarters', () => {
  it('counts quarters between two IDs', () => {
    expect(countElapsedQuarters('2021-Q1', '2022-Q1')).toBe(4);
    expect(countElapsedQuarters('2023-Q1', '2023-Q3')).toBe(2);
  });
  it('returns null for invalid quarters', () => {
    expect(countElapsedQuarters('bad', '2023-Q1')).toBeNull();
  });
});

describe('calculateAppreciation', () => {
  const baseRecord = (median: number | null, suppressed = false): TractQuarterRecord => ({
    medianSalePrice: median,
    qualifiedSaleCount: suppressed ? 3 : 10,
    meanSalePrice: null,
    p25SalePrice: null, p75SalePrice: null, minSalePrice: null, maxSalePrice: null,
    averageRatePercent: null, estimatedMonthlyPrincipalInterest: null,
    hpi: null, annualChange: null,
    smallSampleFlag: suppressed, suppressMedian: suppressed, partialQuarterFlag: false,
  });

  it('calculates appreciation between two valid records', () => {
    const result = calculateAppreciation(baseRecord(200000), baseRecord(250000));
    expect(result.absoluteChange).toBe(50000);
    expect(result.percentageChange).toBeCloseTo(25);
  });
  it('returns nulls if start is null', () => {
    const result = calculateAppreciation(null, baseRecord(250000));
    expect(result.absoluteChange).toBeNull();
    expect(result.percentageChange).toBeNull();
  });
  it('returns nulls if start is suppressed', () => {
    const result = calculateAppreciation(baseRecord(200000, true), baseRecord(250000));
    expect(result.absoluteChange).toBeNull();
  });
  it('returns nulls if start is zero', () => {
    const result = calculateAppreciation(baseRecord(0), baseRecord(250000));
    expect(result.absoluteChange).toBeNull();
  });
});
