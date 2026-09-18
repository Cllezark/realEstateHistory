import { useEffect, useRef, type ReactNode } from 'react';
import styles from './AppShell.module.css';

interface Props {
  mapPanel: ReactNode;
  detailsPanel: ReactNode;
  timeline: ReactNode;
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  isMobile: boolean;
}

export function AppShell({
  mapPanel,
  detailsPanel,
  timeline,
  detailsOpen,
  onDetailsOpenChange,
  isMobile,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isMobile || !detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onDetailsOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, detailsOpen, onDetailsOpenChange]);

  useEffect(() => {
    if (!isMobile) {
      wasOpenRef.current = detailsOpen;
      return;
    }
    if (detailsOpen) {
      closeRef.current?.focus({ preventScroll: true });
    } else if (wasOpenRef.current) {
      tabRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = detailsOpen;
  }, [detailsOpen, isMobile]);

  const drawerClosed = isMobile && !detailsOpen;

  return (
    <div className={styles.shell} role="main">
      <div className={styles.mainArea}>
        <div className={styles.mapPanel}>{mapPanel}</div>
        {isMobile && detailsOpen && (
          <div
            className={styles.backdrop}
            onClick={() => onDetailsOpenChange(false)}
            aria-hidden="true"
          />
        )}
        {isMobile && (
          <button
            ref={tabRef}
            type="button"
            className={`${styles.handle} ${detailsOpen ? styles.handleOpen : ''}`}
            aria-expanded={detailsOpen}
            aria-controls="details-panel"
            aria-label={detailsOpen ? 'Hide details' : 'Show tract details'}
            onClick={() => onDetailsOpenChange(!detailsOpen)}
          >
            <span aria-hidden="true">{detailsOpen ? '›' : '‹'}</span>
          </button>
        )}
        <aside
          id="details-panel"
          className={`${styles.detailsPanel} ${detailsOpen ? styles.open : ''}`}
          role="complementary"
          aria-label="Tract details"
          inert={drawerClosed}
          aria-hidden={drawerClosed || undefined}
        >
          {isMobile && (
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>Tract details</h2>
              <button
                ref={closeRef}
                type="button"
                className={styles.closeBtn}
                onClick={() => onDetailsOpenChange(false)}
                aria-label="Close details"
              >
                ×
              </button>
            </div>
          )}
          <div className={styles.detailsBody}>{detailsPanel}</div>
        </aside>
      </div>
      <div className={styles.timelineArea} role="region" aria-label="Quarter timeline">
        {timeline}
      </div>
    </div>
  );
}
