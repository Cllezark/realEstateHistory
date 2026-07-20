import { useMemo, useState, useEffect } from 'react';
import type { TractQuarterIndex, TractQuarterRecord, Metadata } from '../../data/types';
import {
  formatCurrency, formatRate, formatHpi, formatQuarterLabel,
  getTractRecord, getSortedQuarterIds, getEffectiveMedian,
} from '../../data/formatters';
import styles from './TractDetails.module.css';
import { TrendChart } from './TrendChart';

interface Props {
  tractGeoid: string | null;
  tractName: string | null;
  selectedQuarter: string;
  marketData: TractQuarterIndex | null;
  metadata: Metadata | null;
}

export function TractDetails({
  tractGeoid,
  tractName,
  selectedQuarter,
  marketData,
  metadata,
}: Props) {
  const [highlightedQuarter, setHighlightedQuarter] = useState<string | null>(null);

  // Notify chart viewer windows when tract changes
  useEffect(() => {
    if (tractGeoid) {
      const chartViewerWindow = window.open('', 'chart-viewer');
      if (chartViewerWindow && !chartViewerWindow.closed) {
        chartViewerWindow.postMessage({ type: 'TRACT_CHANGED', tractGeoid }, window.location.origin);
      }
    }
  }, [tractGeoid]);

  const record: TractQuarterRecord | null = useMemo(() => {
    if (!marketData || !tractGeoid) return null;
    return getTractRecord(marketData, selectedQuarter, tractGeoid);
  }, [marketData, selectedQuarter, tractGeoid]);

  const sortedQuarters = useMemo(() => {
    if (!marketData) return [];
    return getSortedQuarterIds(marketData);
  }, [marketData]);

  // No tract selected: show instructions
  if (!tractGeoid || !tractName) {
    return (
      <div className={styles.panel}>
        <div className={styles.noSelection}>
          <h2>St. Petersburg Housing Market</h2>
          <p>Select a Census tract on the map to view detailed quarterly metrics.</p>
          {selectedQuarter && (
            <p className={styles.currentQuarter}>
              Current quarter: <strong>{formatQuarterLabel(selectedQuarter)}</strong>
            </p>
          )}
          {metadata && (
            <div className={styles.metaInfo}>
              <p>Data: {metadata.dateCoverageStart} – {metadata.dateCoverageEnd}</p>
              <p>Source: {metadata.attributions.salesAndProperty}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const median = getEffectiveMedian(record);
  const hasWarnings = record && (
    record.smallSampleFlag ||
    record.partialQuarterFlag ||
    record.suppressMedian
  );

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.tractName}>{tractName}</h2>
        <span className={styles.geoid}>GEOID: {tractGeoid}</span>
      </header>

      <div className={styles.quarterBadge}>
        {formatQuarterLabel(selectedQuarter)}
      </div>

      {hasWarnings && (
        <div className={styles.warnings} role="alert">
          {record.smallSampleFlag && (
            <span className={styles.warning}>⚠ Small sample (&lt;{metadata?.smallSampleThreshold ?? 5} sales)</span>
          )}
          {record.suppressMedian && (
            <span className={styles.warning}>⚠ Median suppressed</span>
          )}
          {record.partialQuarterFlag && (
            <span className={styles.warning}>⚠ Partial quarter</span>
          )}
        </div>
      )}

      {record && (
        <dl className={styles.metricsList}>
          {!record.suppressMedian && median != null && (
            <>
              <div className={styles.metricItem}>
                <dt>Median sale price</dt>
                <dd>{formatCurrency(median)}</dd>
              </div>
            </>
          )}
          {record.qualifiedSaleCount != null && (
            <div className={styles.metricItem}>
              <dt>Qualified sales</dt>
              <dd>{record.qualifiedSaleCount}</dd>
            </div>
          )}
          {!record.suppressMedian && record.p25SalePrice != null && (
            <div className={styles.metricItem}>
              <dt>25th percentile</dt>
              <dd>{formatCurrency(record.p25SalePrice)}</dd>
            </div>
          )}
          {!record.suppressMedian && record.p75SalePrice != null && (
            <div className={styles.metricItem}>
              <dt>75th percentile</dt>
              <dd>{formatCurrency(record.p75SalePrice)}</dd>
            </div>
          )}
          {record.averageRatePercent != null && (
            <div className={styles.metricItem}>
              <dt>Avg. mortgage rate</dt>
              <dd>{formatRate(record.averageRatePercent)}</dd>
            </div>
          )}
          {!record.suppressMedian && record.estimatedMonthlyPrincipalInterest != null && (
            <div className={styles.metricItem}>
              <dt>
                Est. monthly P&amp;I
                <span className={styles.tooltipTrigger} tabIndex={0} role="tooltip" aria-label="Estimated monthly principal and interest payment">
                  ⓘ
                  <span className={styles.tooltip}>
                    Based on median sale price and {metadata?.mortgageAssumptions?.downPaymentPercent ?? 20}% down payment.
                    {metadata?.mortgageAssumptions?.loanTermYears ?? 30}-year loan at the quarterly average 30-year fixed rate.
                    Excludes taxes, insurance, HOA, PMI, closing costs, and maintenance.
                    This is an estimate, not an observed borrower payment.
                  </span>
                </span>
              </dt>
              <dd>{formatCurrency(record.estimatedMonthlyPrincipalInterest)}</dd>
            </div>
          )}
          {record.hpi != null && (
            <div className={styles.metricItem}>
              <dt>FHFA HPI</dt>
              <dd>{formatHpi(record.hpi)}</dd>
            </div>
          )}
          {record.annualChange != null && (
            <div className={styles.metricItem}>
              <dt>FHFA annual change</dt>
              <dd>{record.annualChange >= 0 ? '+' : ''}{record.annualChange.toFixed(1)}%</dd>
            </div>
          )}
        </dl>
      )}

      {/* Historical trend chart */}
      {marketData && sortedQuarters.length > 0 && (
        <div className={styles.chartSection}>
          <h3 className={styles.chartTitle}>Historical median sale price</h3>
          <TrendChart
            marketData={marketData}
            tractGeoid={tractGeoid}
            quarters={sortedQuarters}
            highlightedQuarter={highlightedQuarter}
            onHighlightQuarter={setHighlightedQuarter}
            showExpandButton
          />
        </div>
      )}

      {/* Disclosures footer */}
      <footer className={styles.disclosures}>
        <p>Data: PCPAO, FHFA, FRED/Freddie Mac</p>
        <p>2020 Census tract boundaries</p>
        {metadata && (
          <p>Coverage: {metadata.dateCoverageStart} – {metadata.dateCoverageEnd}</p>
        )}
      </footer>
    </div>
  );
}
