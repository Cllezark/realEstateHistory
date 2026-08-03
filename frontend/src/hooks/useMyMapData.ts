import { useState, useEffect, useCallback } from 'react';
import type { MyMapPointsGeoJSON, MyMapPolygonsGeoJSON, MyMapMetadata, MyMapLayerVisibility } from '../data/types';
import { defaultMyMapVisibility } from '../data/types';
import { loadMyMapPoints, loadMyMapPolygons, loadMyMapMetadata, loadMyMapFromUrl } from '../data/loaders';

interface MyMapDataResult {
  points: MyMapPointsGeoJSON | null;
  polygons: MyMapPolygonsGeoJSON | null;
  metadata: MyMapMetadata | null;
  visibility: MyMapLayerVisibility;
  loading: boolean;
  error: string | null;
  setVisibility: (vis: MyMapLayerVisibility) => void;
  /** Fetch fresh KML from a URL and update all layers. */
  refreshFromUrl: (kmlUrl: string) => Promise<void>;
}

/**
 * Load MyMap layer data (points, polygons, metadata) from static assets.
 * Provides visibility state and a runtime refresh method.
 */
export function useMyMapData(): MyMapDataResult {
  const [points, setPoints] = useState<MyMapPointsGeoJSON | null>(null);
  const [polygons, setPolygons] = useState<MyMapPolygonsGeoJSON | null>(null);
  const [metadata, setMetadata] = useState<MyMapMetadata | null>(null);
  const [visibility, setVisibility] = useState<MyMapLayerVisibility>(
    defaultMyMapVisibility(null),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load from static assets
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [pts, polys, meta] = await Promise.all([
          loadMyMapPoints(),
          loadMyMapPolygons(),
          loadMyMapMetadata(),
        ]);

        if (cancelled) return;

        setPoints(pts);
        setPolygons(polys);
        setMetadata(meta);
        setVisibility(defaultMyMapVisibility(meta));

        // If nothing loaded at all, that's fine — no MyMap data available
        if (!pts && !polys && !meta) {
          console.log('[useMyMapData] No MyMap data assets found — MyMap layers will be hidden.');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load MyMap data');
          console.warn('[useMyMapData] Load error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Runtime refresh from KML URL
  const refreshFromUrl = useCallback(async (kmlUrl: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await loadMyMapFromUrl(kmlUrl);

      if (result.error) {
        setError(result.error);
        return;
      }

      setPoints(result.points);
      setPolygons(result.polygons);
      setMetadata(result.metadata);
      setVisibility(defaultMyMapVisibility(result.metadata));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KML refresh failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    points,
    polygons,
    metadata,
    visibility,
    loading,
    error,
    setVisibility,
    refreshFromUrl,
  };
}
