import { useState, useEffect } from 'react';
import type { TractGeoJSON, TractQuarterIndex, Metadata, LoadingState } from '../data/types';
import { loadTractGeometry, loadTractQuarterData, loadMetadata } from '../data/loaders';

interface MapDataResult {
  geometry: TractGeoJSON | null;
  marketData: TractQuarterIndex | null;
  metadata: Metadata | null;
  loading: LoadingState;
  error: string | null;
}

/** Load all required data assets for the map application. */
export function useMapData(): MapDataResult {
  const [geometry, setGeometry] = useState<TractGeoJSON | null>(null);
  const [marketData, setMarketData] = useState<TractQuarterIndex | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading('loading');
      setError(null);
      try {
        const [geo, mkt, meta] = await Promise.all([
          loadTractGeometry(),
          loadTractQuarterData(),
          loadMetadata(),
        ]);
        if (!cancelled) {
          setGeometry(geo);
          setMarketData(mkt);
          setMetadata(meta);
          setLoading('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
          setLoading('error');
        }
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, []);

  return { geometry, marketData, metadata, loading, error };
}
