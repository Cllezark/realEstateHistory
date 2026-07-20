import { useMemo, useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { AppShell } from './components/AppShell/AppShell';
import { MapView } from './components/Map/MapView';
import { MapLegend } from './components/Map/MapLegend';
import { QuarterTimeline } from './components/Timeline/QuarterTimeline';
import { TractDetails } from './components/DetailsPanel/TractDetails';
import { ComparisonControls } from './components/ComparisonMode/ComparisonControls';
import { MetricSelector } from './components/MetricSelector/MetricSelector';
import { useMapData } from './hooks/useMapData';
import { useAppState } from './hooks/useAppState';
import {
  calculateQuantileBreaks,
  calculateMedianPriceBreaks,
  calculateMeanPriceBreaks,
  calculateP25PriceBreaks,
  calculateP75PriceBreaks,
  calculateMinPriceBreaks,
  calculateMaxPriceBreaks,
  calculateMonthlyPaymentBreaks,
  calculateAppreciationBreaks,
  MISSING_COLOR,
} from './data/classification';
import { calculateAppreciation, getSortedQuarterIds } from './data/formatters';

export default function App() {
  const { geometry, marketData, metadata, loading, error } = useMapData();
  const {
    state,
    setSelectedTract,
    setSelectedQuarter,
    setActiveMetric,
    setPriceFilterThreshold,
    enableComparison,
    disableComparison,
  } = useAppState(metadata?.dateCoverageEnd ?? '');

  const [isPlaying, setIsPlaying] = useState(false);

  // Fall back to last quarter when metadata loads.
  // Defensively walk backward through quarters to find one with actual
  // market data, in case the pipeline publishes a trailing empty quarter.
  useEffect(() => {
    if (!metadata || !marketData) return;
    // Only set default on initial load (no quarter yet)
    if (state.selectedQuarter) return;

    const available = getSortedQuarterIds(marketData);
    if (available.length === 0) return;

    // Start from dateCoverageEnd and walk backward to find a quarter with data
    let candidate = metadata.dateCoverageEnd;
    while (candidate >= available[0]) {
      const quarterData = marketData[candidate];
      if (quarterData) {
        // Check if any tract in this quarter has a median price
        const hasData = Object.values(quarterData).some(
          (r) => r.medianSalePrice != null,
        );
        if (hasData) {
          setSelectedQuarter(candidate);
          return;
        }
      }
      // Walk backward to previous quarter
      const parsed = /^(\d{4})-Q([1-4])$/.exec(candidate);
      if (!parsed) break;
      const year = parseInt(parsed[1], 10);
      const q = parseInt(parsed[2], 10);
      candidate = q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`;
    }
    // Fallback to first available quarter
    setSelectedQuarter(available[0]);
  }, [metadata, marketData, state.selectedQuarter, setSelectedQuarter]);

  // Calculate legend breaks
  const breaks = useMemo(() => {
    if (!marketData || !state.selectedQuarter) return [];
    switch (state.activeMetric) {
      case 'medianSalePrice': return calculateMedianPriceBreaks();
      case 'meanSalePrice': return calculateMeanPriceBreaks();
      case 'p25SalePrice': return calculateP25PriceBreaks();
      case 'p75SalePrice': return calculateP75PriceBreaks();
      case 'minSalePrice': return calculateMinPriceBreaks();
      case 'maxSalePrice': return calculateMaxPriceBreaks();
      case 'estimatedMonthlyPrincipalInterest': return calculateMonthlyPaymentBreaks();
      default:
        return calculateQuantileBreaks(marketData, state.selectedQuarter, state.activeMetric);
    }
  }, [marketData, state.selectedQuarter, state.activeMetric]);

  // Comparison mode colors
  const comparisonColors = useMemo(() => {
    if (!marketData || !state.comparisonMode || !state.comparisonStartQuarter || !state.comparisonEndQuarter) {
      return null;
    }

    const appreciationMap = new Map<string, number | null>();
    const allTracts = new Set<string>();

    const startData = marketData[state.comparisonStartQuarter];
    const endData = marketData[state.comparisonEndQuarter];
    if (startData) Object.keys(startData).forEach(t => allTracts.add(t));
    if (endData) Object.keys(endData).forEach(t => allTracts.add(t));

    for (const tractId of allTracts) {
      const startRecord = startData?.[tractId] ?? null;
      const endRecord = endData?.[tractId] ?? null;
      const { percentageChange } = calculateAppreciation(startRecord, endRecord);
      appreciationMap.set(tractId, percentageChange);
    }

    const appBreaks = calculateAppreciationBreaks(appreciationMap);

    // Build color map by finding which break each percentage falls into
    const colorMap = new Map<string, string>();
    for (const [tractId, pct] of appreciationMap) {
      if (pct == null) {
        colorMap.set(tractId, MISSING_COLOR);
        continue;
      }
      let found = false;
      for (const b of appBreaks) {
        if (pct >= b.minValue && pct <= b.maxValue) {
          colorMap.set(tractId, b.color);
          found = true;
          break;
        }
      }
      if (!found && appBreaks.length > 0) {
        colorMap.set(tractId, appBreaks[appBreaks.length - 1].color);
      }
      if (!found && appBreaks.length === 0) {
        colorMap.set(tractId, MISSING_COLOR);
      }
    }

    return colorMap;
  }, [marketData, state.comparisonMode, state.comparisonStartQuarter, state.comparisonEndQuarter]);

  // Get selected tract name from geometry
  const tractName = useMemo(() => {
    if (!state.selectedTract || !geometry) return null;
    const feature = geometry.features.find(f => f.properties.tract_geoid === state.selectedTract);
    return feature?.properties.tract_name ?? state.selectedTract;
  }, [state.selectedTract, geometry]);

  // Play animation
  useEffect(() => {
    if (!isPlaying || !marketData) return;
    const quarters = getSortedQuarterIds(marketData);
    const currentIdx = quarters.indexOf(state.selectedQuarter);

    if (currentIdx >= quarters.length - 1) {
      setIsPlaying(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextIdx = currentIdx + 1;
      if (nextIdx < quarters.length) {
        setSelectedQuarter(quarters[nextIdx]);
      } else {
        setIsPlaying(false);
      }
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [isPlaying, marketData, state.selectedQuarter, setSelectedQuarter]);

  const handlePlayToggle = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  if (error) {
    return (
      <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Unable to load data</h2>
        <p>{error}</p>
        <p>Make sure <code>public/data/</code> assets have been generated by the publish stage.</p>
      </div>
    );
  }

  if (loading === 'loading' || loading === 'idle') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>Loading St. Petersburg housing data…</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell
        mapPanel={
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <MapView
              geometry={geometry}
              marketData={marketData}
              selectedQuarter={state.selectedQuarter}
              selectedTract={state.selectedTract}
              activeMetric={state.activeMetric}
              breaks={breaks}
              comparisonMode={state.comparisonMode}
              comparisonColors={comparisonColors}
              onSelectTract={setSelectedTract}
              priceFilterThreshold={state.priceFilterThreshold}
            />
            <MapLegend
              metric={state.activeMetric}
              breaks={breaks}
              comparisonMode={state.comparisonMode}
              priceFilterThreshold={state.priceFilterThreshold}
            />
          </div>
        }
        detailsPanel={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '0.5rem', borderBottom: '1px solid #e0e0e0' }}>
              <MetricSelector
                value={state.activeMetric}
                onChange={setActiveMetric}
                disabled={loading !== 'loaded'}
              />
            </div>
            <div style={{ padding: '0.5rem 0.5rem 0', borderBottom: '1px solid #e0e0e0', fontSize: '0.8rem' }}>
              <label style={{ display: 'block', marginBottom: '3px', color: '#555', fontWeight: 500 }}>
                Price filter (hatch tracts above):
              </label>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ color: '#555' }}>$</span>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="e.g. 400000"
                  value={state.priceFilterThreshold ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    setPriceFilterThreshold(raw === '' ? null : Number(raw));
                  }}
                  disabled={loading !== 'loaded'}
                  style={{
                    flex: 1,
                    padding: '3px 6px',
                    fontSize: '0.8rem',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                    minWidth: 0,
                  }}
                />
                {state.priceFilterThreshold != null && (
                  <button
                    onClick={() => setPriceFilterThreshold(null)}
                    style={{ padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer' }}
                    aria-label="Clear price filter"
                  >✕</button>
                )}
              </div>
              <div style={{ marginTop: '2px', marginBottom: '4px', color: '#888', fontSize: '0.72rem' }}>
                Applies to price-based metrics only
              </div>
            </div>
            <ComparisonControls
              marketData={marketData}
              enabled={state.comparisonMode}
              startQuarter={state.comparisonStartQuarter}
              endQuarter={state.comparisonEndQuarter}
              onEnable={enableComparison}
              onDisable={disableComparison}
              disabled={loading !== 'loaded'}
            />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <TractDetails
                tractGeoid={state.selectedTract}
                tractName={tractName}
                selectedQuarter={state.selectedQuarter}
                marketData={marketData}
                metadata={metadata}
              />
            </div>
          </div>
        }
        timeline={
          <QuarterTimeline
            marketData={marketData}
            selectedQuarter={state.selectedQuarter}
            disabled={loading !== 'loaded'}
            onChangeQuarter={setSelectedQuarter}
            onPlayToggle={handlePlayToggle}
            isPlaying={isPlaying}
            maxQuarter={metadata?.dateCoverageEnd}
          />
        }
      />
    </ErrorBoundary>
  );
}
