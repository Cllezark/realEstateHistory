import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

interface Props {
  mapPanel: ReactNode;
  detailsPanel: ReactNode;
  timeline: ReactNode;
}

export function AppShell({ mapPanel, detailsPanel, timeline }: Props) {
  return (
    <div className={styles.shell} role="main">
      <div className={styles.mainArea}>
        <div className={styles.mapPanel}>{mapPanel}</div>
        <aside className={styles.detailsPanel} role="complementary" aria-label="Tract details">
          {detailsPanel}
        </aside>
      </div>
      <div className={styles.timelineArea} role="region" aria-label="Quarter timeline">
        {timeline}
      </div>
    </div>
  );
}
