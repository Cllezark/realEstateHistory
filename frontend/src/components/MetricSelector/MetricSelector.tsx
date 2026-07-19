import type { MapMetric } from '../../data/types';
import { getMetricLabel } from '../../data/classification';
import styles from './MetricSelector.module.css';

const AVAILABLE_METRICS: { value: MapMetric; group: string }[] = [
  { value: 'medianSalePrice', group: 'Price' },
  { value: 'meanSalePrice', group: 'Price' },
  { value: 'p25SalePrice', group: 'Price' },
  { value: 'p75SalePrice', group: 'Price' },
  { value: 'minSalePrice', group: 'Price' },
  { value: 'maxSalePrice', group: 'Price' },
  { value: 'averageRatePercent', group: 'Mortgage' },
  { value: 'estimatedMonthlyPrincipalInterest', group: 'Mortgage' },
  { value: 'hpi', group: 'HPI' },
  { value: 'annualChange', group: 'HPI' },
];

interface Props {
  value: MapMetric;
  onChange: (metric: MapMetric) => void;
  disabled?: boolean;
}

export function MetricSelector({ value, onChange, disabled }: Props) {
  const groups = new Map<string, { value: MapMetric }[]>();
  for (const m of AVAILABLE_METRICS) {
    const list = groups.get(m.group) ?? [];
    list.push({ value: m.value });
    groups.set(m.group, list);
  }

  return (
    <div className={styles.container}>
      <label htmlFor="metric-selector" className={styles.label}>
        Metric
      </label>
      <select
        id="metric-selector"
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as MapMetric)}
        disabled={disabled}
      >
        {Array.from(groups.entries()).map(([group, metrics]) => (
          <optgroup key={group} label={group}>
            {metrics.map(({ value: m }) => (
              <option key={m} value={m}>
                {getMetricLabel(m)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
