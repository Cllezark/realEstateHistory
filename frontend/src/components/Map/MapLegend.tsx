import type { MapMetric, LegendBreak } from '../../data/types';
import { getMetricLabel, MISSING_COLOR, SUPPRESSED_COLOR } from '../../data/classification';
import styles from './MapLegend.module.css';

interface Props {
  metric: MapMetric;
  breaks: LegendBreak[];
  comparisonMode: boolean;
}

export function MapLegend({ metric, breaks, comparisonMode }: Props) {
  return (
    <div className={styles.legend} role="complementary" aria-label="Map legend">
      <h3 className={styles.title}>{getMetricLabel(metric)}</h3>
      {breaks.map((b, i) => (
        <div key={i} className={styles.breakItem}>
          <span className={styles.swatch} style={{ backgroundColor: b.color }} />
          <span className={styles.label}>{b.label}</span>
        </div>
      ))}
      {!comparisonMode && (
        <>
          <div className={styles.breakItem}>
            <span className={styles.swatch} style={{ backgroundColor: SUPPRESSED_COLOR }} />
            <span className={styles.label}>Suppressed (&lt;5 sales)</span>
          </div>
        </>
      )}
      <div className={styles.breakItem}>
        <span className={styles.swatch} style={{ backgroundColor: MISSING_COLOR }} />
        <span className={styles.label}>No data</span>
      </div>
    </div>
  );
}
