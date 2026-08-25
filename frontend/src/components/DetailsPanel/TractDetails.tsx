import { useMemo, useState } from 'react';
import type { TractQuarterIndex, TractQuarterRecord, Metadata, ParcelSalesIndex, ParcelSale } from '../../data/types';
import {
  formatCurrency, formatRate, formatHpi, formatQuarterLabel, formatAreaSqft,
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
  parcelSales: ParcelSalesIndex | null;
  onSaleClick?: (sale: ParcelSale) => void;
}

type SortField = 'price' | 'date';
type SortDirection = 'asc' | 'desc';

export function TractDetails({
  tractGeoid,
  tractName,
  selectedQuarter,
  marketData,
  metadata,
  parcelSales,
  onSaleClick,
}: Props) {
  const [highlightedQuarter, setHighlightedQuarter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('price');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const rawSales: ParcelSale[] = useMemo(() => {
    if (!parcelSales || !tractGeoid) return [];
    const quarterData = parcelSales[selectedQuarter];
    if (!quarterData) return [];
    return quarterData[tractGeoid] ?? [];
  }, [parcelSales, tractGeoid, selectedQuarter]);

  const sales: ParcelSale[] = useMemo(() => {
    const sorted = [...rawSales];
    sorted.sort((a, b) => {
      let aVal: number | string | null;
      let bVal: number | string | null;

      if (sortField === 'price') {
        aVal = a.salePrice ?? 0;
        bVal = b.salePrice ?? 0;
      } else {
        aVal = a.saleDate ?? '';
        bVal = b.saleDate ?? '';
      }

      if (aVal === bVal) return 0;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [rawSales, sortField, sortDirection]);

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
          <h2>{metadata?.region?.displayName ?? 'South Pinellas'} Housing Market</h2>
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

      {/* Individual parcel sales */}
      {sales.length > 0 && (
        <div className={styles.chartSection}>
          <h3 className={styles.chartTitle}>Individual sales in {formatQuarterLabel(selectedQuarter)}</h3>
          <div className={styles.salesControls}>
            <div className={styles.sortFields}>
              <button
                className={`${styles.sortButton} ${sortField === 'price' ? styles.active : ''}`}
                onClick={() => setSortField('price')}
                title="Sort by price"
              >
                Price
              </button>
              <button
                className={`${styles.sortButton} ${sortField === 'date' ? styles.active : ''}`}
                onClick={() => setSortField('date')}
                title="Sort by date"
              >
                Date
              </button>
            </div>
            <button
              className={styles.sortDirection}
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              title={`Switch to ${sortDirection === 'asc' ? 'descending' : 'ascending'} order`}
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          <div className={styles.salesList}>
            {sales.map((sale, idx) => (
              <div
                key={idx}
                className={styles.saleItem}
                onClick={() => onSaleClick?.(sale)}
                style={{ cursor: sale.latitude != null ? 'pointer' : 'default' }}
              >
                {sale.saleDate && (
                  <div className={styles.saleDate}>{sale.saleDate}</div>
                )}
                {sale.address && (
                  <div className={styles.saleAddress}>{sale.address}</div>
                )}
                {sale.salePrice !== null && (
                  <div className={styles.salePrice}>{formatCurrency(sale.salePrice)}</div>
                )}
                {sale.parcelNumber && (
                  <div className={styles.saleParcelNumber}>Parcel: {sale.parcelNumber}</div>
                )}
                {(sale.livingAreaSqft != null || sale.grossAreaSqft != null || sale.parcelAreaSqft != null) && (
                  <div className={styles.saleStats}>
                    {sale.livingAreaSqft != null && (
                      <span className={styles.saleStat}>Living: {formatAreaSqft(sale.livingAreaSqft)}</span>
                    )}
                    {sale.grossAreaSqft != null && (
                      <span className={styles.saleStat}>Gross: {formatAreaSqft(sale.grossAreaSqft)}</span>
                    )}
                    {sale.parcelAreaSqft != null && (
                      <span className={styles.saleStat}>Lot: {formatAreaSqft(sale.parcelAreaSqft)}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {sales.length === 0 && parcelSales && tractGeoid && parcelSales[selectedQuarter]?.[tractGeoid] === undefined && (
        <div className={styles.chartSection} style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
          <p>No individual sales data available for this quarter.</p>
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
