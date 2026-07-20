import { useState, useCallback } from 'react';
import type { TractQuarterIndex } from '../../data/types';
import { getSortedQuarterIds, formatQuarterLabel } from '../../data/formatters';
import styles from './ComparisonControls.module.css';

interface Props {
  marketData: TractQuarterIndex | null;
  enabled: boolean;
  startQuarter: string | null;
  endQuarter: string | null;
  onEnable: (start: string, end: string) => void;
  onDisable: () => void;
  disabled?: boolean;
}

export function ComparisonControls({
  marketData,
  enabled,
  startQuarter,
  endQuarter,
  onEnable,
  onDisable,
  disabled,
}: Props) {
  const quarters = marketData ? getSortedQuarterIds(marketData) : [];
  const [selStart, setSelStart] = useState(startQuarter ?? quarters[0] ?? '');
  const [selEnd, setSelEnd] = useState(endQuarter ?? quarters[quarters.length - 1] ?? '');

  const handleEnable = useCallback(() => {
    if (selStart && selEnd) onEnable(selStart, selEnd);
  }, [selStart, selEnd, onEnable]);

  return (
    <div className={styles.controls} role="region" aria-label="Appreciation comparison">
      {!enabled ? (
        <div className={styles.setup}>
          <div className={styles.field}>
            <label htmlFor="comp-start">Start quarter</label>
            <select
              id="comp-start"
              value={selStart}
              onChange={e => setSelStart(e.target.value)}
              disabled={disabled || quarters.length === 0}
            >
              {quarters.map(q => (
                <option key={q} value={q}>{formatQuarterLabel(q)}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="comp-end">End quarter</label>
            <select
              id="comp-end"
              value={selEnd}
              onChange={e => setSelEnd(e.target.value)}
              disabled={disabled || quarters.length === 0}
            >
              {quarters.map(q => (
                <option key={q} value={q}>{formatQuarterLabel(q)}</option>
              ))}
            </select>
          </div>
          <button
            className={styles.enableBtn}
            onClick={handleEnable}
            disabled={disabled || !selStart || !selEnd || quarters.length === 0}
          >
            Compare appreciation
          </button>
        </div>
      ) : (
        <div className={styles.active}>
          <span className={styles.comparisonLabel}>
            Median price appreciation
          </span>
          <span className={styles.comparisonRange}>
            {startQuarter ? formatQuarterLabel(startQuarter) : '—'} → {endQuarter ? formatQuarterLabel(endQuarter) : '—'}
          </span>
          <p className={styles.comparisonHint}>
            Colors show % change in median sale price between the two quarters. Red = declined, green = appreciated.
          </p>
          <button className={styles.clearBtn} onClick={onDisable}>
            Clear comparison
          </button>
        </div>
      )}
    </div>
  );
}
