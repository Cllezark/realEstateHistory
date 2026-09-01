import { useState } from 'react';
import type { MapMetric, LegendBreak } from '../../data/types';
import { getMetricLabel, MISSING_COLOR, SUPPRESSED_COLOR } from '../../data/classification';
import { formatInteger, formatQuarterLabel } from '../../data/formatters';
import styles from './MapLegend.module.css';

const PRICE_FILTER_METRICS = new Set<MapMetric>([
  'medianSalePrice', 'meanSalePrice', 'p25SalePrice', 'p75SalePrice',
  'minSalePrice', 'maxSalePrice', 'estimatedMonthlyPrincipalInterest',
]);

interface Props {
  metric: MapMetric;
  breaks: LegendBreak[];
  comparisonMode: boolean;
  comparisonBreaks?: LegendBreak[];
  comparisonStartQuarter?: string | null;
  comparisonEndQuarter?: string | null;
  priceFilterThreshold?: number | null;
}

export function MapLegend({
  metric,
  breaks,
  comparisonMode,
  comparisonBreaks,
  comparisonStartQuarter,
  comparisonEndQuarter,
  priceFilterThreshold,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const showHatchEntry = !comparisonMode && !!priceFilterThreshold && PRICE_FILTER_METRICS.has(metric);
  const activeBreaks = comparisonMode && comparisonBreaks?.length ? comparisonBreaks : breaks;
  const title = comparisonMode ? 'Median price appreciation' : getMetricLabel(metric);

  return (
    <div className={styles.legend} role="complementary" aria-label="Map legend">
      <h3
        className={styles.title}
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(e => !e); }}
        aria-expanded={expanded}
      >
        {expanded ? '▼' : '▶'} {title}
      </h3>
      {expanded && (
        <>
          {comparisonMode && comparisonStartQuarter && comparisonEndQuarter && (
            <p className={styles.comparisonSubtitle}>
              {formatQuarterLabel(comparisonStartQuarter)} → {formatQuarterLabel(comparisonEndQuarter)}
            </p>
          )}
          {activeBreaks.map((b, i) => (
            <div key={i} className={styles.breakItem}>
              <span className={styles.swatch} style={{ backgroundColor: b.color }} />
              <span className={styles.label}>{b.label}</span>
            </div>
          ))}
          {showHatchEntry && (
            <div className={styles.breakItem}>
              <span className={styles.swatch} style={{
                background: 'repeating-linear-gradient(-45deg, #c9b8a8, #c9b8a8 3px, #1a1a1a 3px, #1a1a1a 6px)',
              }} />
              <span className={styles.label}>
                Above ${formatInteger(priceFilterThreshold!)}
              </span>
            </div>
          )}
          {!comparisonMode && (
            <div className={styles.breakItem}>
              <span className={styles.swatch} style={{ backgroundColor: SUPPRESSED_COLOR }} />
              <span className={styles.label}>Suppressed (&lt;5 sales)</span>
            </div>
          )}
          <div className={styles.breakItem}>
            <span className={styles.swatch} style={{ backgroundColor: MISSING_COLOR }} />
            <span className={styles.label}>No data</span>
          </div>
        </>
      )}
    </div>
  );
}
