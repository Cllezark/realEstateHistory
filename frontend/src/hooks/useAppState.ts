import { useState, useCallback, useEffect } from 'react';
import type { AppState, LoadingState, MapMetric } from '../data/types';

const DEFAULT_STATE: AppState = {
  selectedTract: null,
  selectedQuarter: '',
  activeMetric: 'medianSalePrice',
  comparisonMode: false,
  comparisonStartQuarter: null,
  comparisonEndQuarter: null,
  loading: 'idle',
  error: null,
};

/** Read app state from URL query parameters. */
function readUrlState(): Partial<AppState> {
  const params = new URLSearchParams(window.location.search);
  const state: Partial<AppState> = {};

  const tract = params.get('tract');
  if (tract) state.selectedTract = tract;

  const quarter = params.get('quarter');
  if (quarter) state.selectedQuarter = quarter;

  const metric = params.get('metric') as MapMetric | null;
  if (metric) state.activeMetric = metric;

  const compare = params.get('compare');
  if (compare === 'true') state.comparisonMode = true;

  const startQ = params.get('start');
  if (startQ) state.comparisonStartQuarter = startQ;

  const endQ = params.get('end');
  if (endQ) state.comparisonEndQuarter = endQ;

  return state;
}

/** Sync state back to URL. */
function syncUrl(state: AppState): void {
  const params = new URLSearchParams();
  if (state.selectedTract) params.set('tract', state.selectedTract);
  if (state.selectedQuarter) params.set('quarter', state.selectedQuarter);
  if (state.activeMetric !== 'medianSalePrice') params.set('metric', state.activeMetric);
  if (state.comparisonMode) {
    params.set('compare', 'true');
    if (state.comparisonStartQuarter) params.set('start', state.comparisonStartQuarter);
    if (state.comparisonEndQuarter) params.set('end', state.comparisonEndQuarter);
  }
  const newUrl = params.toString()
    ? `${window.location.pathname}?${params}`
    : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
}

/** Centralized application state hook with URL sync. */
export function useAppState(initialQuarter: string) {
  const [state, setState] = useState<AppState>(() => ({
    ...DEFAULT_STATE,
    selectedQuarter: initialQuarter,
    ...readUrlState(),
  }));

  // Sync URL on state changes (debounced internally by replaceState)
  useEffect(() => {
    syncUrl(state);
  }, [state]);

  const setSelectedTract = useCallback((tract: string | null) => {
    setState(prev => ({ ...prev, selectedTract: tract }));
  }, []);

  const setSelectedQuarter = useCallback((quarter: string) => {
    setState(prev => ({ ...prev, selectedQuarter: quarter }));
  }, []);

  const setActiveMetric = useCallback((metric: MapMetric) => {
    setState(prev => ({ ...prev, activeMetric: metric }));
  }, []);

  const setLoading = useCallback((loading: LoadingState) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error, loading: error ? 'error' : prev.loading }));
  }, []);

  const enableComparison = useCallback((start: string, end: string) => {
    setState(prev => ({
      ...prev,
      comparisonMode: true,
      comparisonStartQuarter: start,
      comparisonEndQuarter: end,
    }));
  }, []);

  const disableComparison = useCallback(() => {
    setState(prev => ({
      ...prev,
      comparisonMode: false,
      comparisonStartQuarter: null,
      comparisonEndQuarter: null,
    }));
  }, []);

  return {
    state,
    setSelectedTract,
    setSelectedQuarter,
    setActiveMetric,
    setLoading,
    setError,
    enableComparison,
    disableComparison,
  };
}
