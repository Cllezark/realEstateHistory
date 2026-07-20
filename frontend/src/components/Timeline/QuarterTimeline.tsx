import { useCallback, useEffect } from 'react';
import type { TractQuarterIndex } from '../../data/types';
import { getSortedQuarterIds, formatQuarterLabel, nextQuarter, prevQuarter } from '../../data/formatters';
import styles from './QuarterTimeline.module.css';

interface Props {
  marketData: TractQuarterIndex | null;
  selectedQuarter: string;
  disabled: boolean;
  onChangeQuarter: (quarter: string) => void;
  onPlayToggle?: () => void;
  isPlaying?: boolean;
}

export function QuarterTimeline({
  marketData,
  selectedQuarter,
  disabled,
  onChangeQuarter,
  onPlayToggle,
  isPlaying,
}: Props) {
  const quarterIds = marketData ? getSortedQuarterIds(marketData) : [];
  const currentIndex = quarterIds.indexOf(selectedQuarter);
  const firstQuarter = quarterIds[0] ?? '';
  const lastQuarter = quarterIds[quarterIds.length - 1] ?? '';

  const handlePrev = useCallback(() => {
    const prev = prevQuarter(selectedQuarter);
    if (prev && quarterIds.includes(prev)) onChangeQuarter(prev);
  }, [selectedQuarter, quarterIds, onChangeQuarter]);

  const handleNext = useCallback(() => {
    const next = nextQuarter(selectedQuarter);
    if (next && quarterIds.includes(next)) onChangeQuarter(next);
  }, [selectedQuarter, quarterIds, onChangeQuarter]);

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (quarterIds[idx]) onChangeQuarter(quarterIds[idx]);
  }, [quarterIds, onChangeQuarter]);

  // Keyboard navigation
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'Home') onChangeQuarter(firstQuarter);
      else if (e.key === 'End') onChangeQuarter(lastQuarter);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, handlePrev, handleNext, onChangeQuarter, firstQuarter, lastQuarter]);

  return (
    <div className={styles.timeline} role="group" aria-label="Quarter selector">
      <button
        className={styles.navBtn}
        onClick={() => onChangeQuarter(firstQuarter)}
        disabled={disabled || selectedQuarter === firstQuarter}
        aria-label="First quarter"
      >⏮</button>

      <button
        className={styles.navBtn}
        onClick={handlePrev}
        disabled={disabled || selectedQuarter === firstQuarter}
        aria-label="Previous quarter"
      >◀</button>

      <div className={styles.sliderWrap}>
        <label htmlFor="quarter-slider" className={styles.sliderLabel}>
          {disabled ? 'No data' : formatQuarterLabel(selectedQuarter)}
        </label>
        <input
          id="quarter-slider"
          type="range"
          className={styles.slider}
          min={0}
          max={Math.max(0, quarterIds.length - 1)}
          value={currentIndex >= 0 ? currentIndex : 0}
          onChange={handleSlider}
          disabled={disabled || quarterIds.length === 0}
          aria-valuetext={disabled ? 'No data' : formatQuarterLabel(selectedQuarter)}
        />
        <div className={styles.sliderEnds}>
          <span>{firstQuarter ? formatQuarterLabel(firstQuarter) : '—'}</span>
          <span>{lastQuarter ? formatQuarterLabel(lastQuarter) : '—'}</span>
        </div>
      </div>

      <button
        className={styles.navBtn}
        onClick={handleNext}
        disabled={disabled || selectedQuarter === lastQuarter}
        aria-label="Next quarter"
      >▶</button>

      <button
        className={styles.navBtn}
        onClick={() => onChangeQuarter(lastQuarter)}
        disabled={disabled || selectedQuarter === lastQuarter}
        aria-label="Last quarter"
      >⏭</button>

      {onPlayToggle && (
        <button
          className={styles.playBtn}
          onClick={onPlayToggle}
          disabled={disabled || quarterIds.length === 0}
          aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      )}
    </div>
  );
}
