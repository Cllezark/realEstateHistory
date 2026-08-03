import { useState, useCallback } from 'react';
import type { MyMapMetadata, MyMapLayerVisibility } from '../../data/types';
import styles from './MyMapLayerToggles.module.css';

interface Props {
  metadata: MyMapMetadata | null;
  visibility: MyMapLayerVisibility;
  onVisibilityChange: (vis: MyMapLayerVisibility) => void;
  onRefresh?: () => void;
  refreshStatus?: string | null;
}

export function MyMapLayerToggles({
  metadata,
  visibility,
  onVisibilityChange,
  onRefresh,
  refreshStatus,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const togglePoints = useCallback(() => {
    onVisibilityChange({ ...visibility, points: !visibility.points });
  }, [visibility, onVisibilityChange]);

  const togglePolygons = useCallback(() => {
    onVisibilityChange({ ...visibility, polygons: !visibility.polygons });
  }, [visibility, onVisibilityChange]);

  const toggleFolder = useCallback(
    (folderName: string) => {
      const next = { ...visibility.folderPoints, [folderName]: !visibility.folderPoints[folderName] };
      onVisibilityChange({ ...visibility, folderPoints: next });
    },
    [visibility, onVisibilityChange],
  );

  const toggleIndividualPolygon = useCallback(
    (polygonKey: string) => {
      const next = { ...visibility.individualPolygons, [polygonKey]: !visibility.individualPolygons[polygonKey] };
      onVisibilityChange({ ...visibility, individualPolygons: next });
    },
    [visibility, onVisibilityChange],
  );

  if (!metadata) return null;

  return (
    <div className={styles.toggles} role="complementary" aria-label="MyMap layer toggles">
      <div
        className={styles.togglesTitle}
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(e => !e); }}
        aria-expanded={expanded}
      >
        {expanded ? '▼' : '▶'} MyMap Layers
      </div>

      {expanded && (
        <>
          {/* Point layers — master toggle + per-folder toggles */}
          <label className={styles.masterToggle}>
            <input
              type="checkbox"
              checked={visibility.points}
              onChange={togglePoints}
            />
            Tour Points ({metadata.totalPoints})
          </label>

          {visibility.points && (
            <ul className={styles.folderList}>
              {metadata.folders
                .filter(f => f.pointCount > 0)
                .map(f => (
                  <li key={f.name}>
                    <label className={styles.folderToggle}>
                      <input
                        type="checkbox"
                        checked={visibility.folderPoints[f.name] ?? true}
                        onChange={() => toggleFolder(f.name)}
                      />
                      <span
                        className={styles.folderDot}
                        style={{ backgroundColor: f.color }}
                      />
                      <span className={styles.folderLabel}>
                        {f.name} ({f.pointCount})
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
          )}

          {/* Polygon layers */}
          <label className={styles.masterToggle}>
            <input
              type="checkbox"
              checked={visibility.polygons}
              onChange={togglePolygons}
            />
            Area Overlays ({metadata.totalPolygons})
          </label>

          {visibility.polygons && (
            <ul className={styles.folderList}>
              {Object.entries(visibility.individualPolygons).map(([key, visible]) => (
                <li key={key}>
                  <label className={styles.polygonToggle}>
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleIndividualPolygon(key)}
                    />
                    <span
                      className={styles.polygonSwatch}
                      style={{
                        backgroundColor: visible ? '#2ca25f' : '#ccc',
                        opacity: visible ? 0.35 : 0.15,
                      }}
                    />
                    <span className={styles.folderLabel}>{key}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {/* Refresh button (if callback provided) */}
          {onRefresh && (
            <div className={styles.refreshArea}>
              <button className={styles.refreshBtn} onClick={onRefresh}>
                Refresh from Google MyMap
              </button>
              {refreshStatus && (
                <div className={styles.refreshStatus}>{refreshStatus}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
