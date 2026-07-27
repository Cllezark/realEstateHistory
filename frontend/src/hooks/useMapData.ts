import { useState, useEffect } from 'react';
import type { TractGeoJSON, TractQuarterIndex, Metadata, ParcelSalesIndex, LoadingState } from '../data/types';
import { loadTractGeometry, loadTractQuarterData, loadMetadata, loadParcelSales } from '../data/loaders';

interface MapDataResult {
  geometry: TractGeoJSON | null;
  marketData: TractQuarterIndex | null;
  metadata: Metadata | null;
  parcelSales: ParcelSalesIndex | null;
  loading: LoadingState;
  error: string | null;
}

/** Load all required data assets for the map application. */
export function useMapData(): MapDataResult {
  const [geometry, setGeometry] = useState<TractGeoJSON | null>(null);
  const [marketData, setMarketData] = useState<TractQuarterIndex | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [parcelSales, setParcelSales] = useState<ParcelSalesIndex | null>(null);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading('loading');
      setError(null);
      try {
        const [geo, mkt, meta, parcels] = await Promise.all([
          loadTractGeometry(),
          loadTractQuarterData(),
          loadMetadata(),
          loadParcelSales(),
        ]);
        if (!cancelled) {
          setGeometry(geo);
          setMarketData(mkt);
          setMetadata(meta);
          setParcelSales(parcels);
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

  return { geometry, marketData, metadata, parcelSales, loading, error };
}
