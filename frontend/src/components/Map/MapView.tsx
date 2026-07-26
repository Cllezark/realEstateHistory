import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { TractGeoJSON, TractQuarterIndex, MapMetric, LegendBreak, TractQuarterRecord } from '../../data/types';
import { getTractColor, MISSING_COLOR, getMetricLabel } from '../../data/classification';
import { getTractRecord, formatCurrency, formatHpi } from '../../data/formatters';
import styles from './MapView.module.css';

interface Props {
  geometry: TractGeoJSON | null;
  marketData: TractQuarterIndex | null;
  selectedQuarter: string;
  selectedTract: string | null;
  activeMetric: MapMetric;
  breaks: LegendBreak[];
  comparisonMode: boolean;
  comparisonColors: Map<string, string> | null;
  appreciationMap?: Map<string, number | null> | null;
  onSelectTract: (tractGeoid: string | null) => void;
  priceFilterThreshold?: number | null;
}

interface HoveredTract {
  name: string;
  geoid: string;
  record: TractQuarterRecord | null;
}

const ST_PETE_CENTER: [number, number] = [-82.66, 27.77];
const ST_PETE_ZOOM = 11.5;

const PRICE_FILTER_METRICS = new Set<MapMetric>([
  'medianSalePrice', 'meanSalePrice', 'p25SalePrice', 'p75SalePrice',
  'minSalePrice', 'maxSalePrice', 'estimatedMonthlyPrincipalInterest',
]);

/** Light basemap style using OpenStreetMap raster tiles (no API key required). */
const BASEMAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm-tiles',
    },
  ],
};

function formatMetricValue(record: TractQuarterRecord, metric: MapMetric): string {
  const val = record[metric];
  if (val == null) return 'No data';
  if (metric === 'averageRatePercent' || metric === 'annualChange') {
    return `${(val as number).toFixed(2)}%`;
  }
  if (metric === 'hpi') return formatHpi(val as number);
  if (metric === 'qualifiedSaleCount') return String(val);
  return formatCurrency(val as number);
}

function buildHatchPattern(): ImageData {
  const size = 12;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c9b8a8';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3;
  // Tile the diagonal stripe across the canvas cell
  for (let offset = -size; offset <= size * 2; offset += size) {
    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

export function MapView({
  geometry,
  marketData,
  selectedQuarter,
  selectedTract,
  activeMetric,
  breaks,
  comparisonMode,
  comparisonColors,
  appreciationMap,
  onSelectTract,
  priceFilterThreshold,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const layersAddedRef = useRef(false);
  const [hoveredTract, setHoveredTract] = useState<HoveredTract | null>(null);

  // Initialize map — defer to next frame to avoid WebGL context loss
  // caused by React StrictMode double-mounting in development
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let cancelled = false;
    const container = mapContainerRef.current;

    const raf = requestAnimationFrame(() => {
      if (cancelled || mapRef.current) return;

      const map = new maplibregl.Map({
        container,
        style: BASEMAP_STYLE,
        center: ST_PETE_CENTER,
        zoom: ST_PETE_ZOOM,
        attributionControl: { compact: true },
      });

      map.addControl(new maplibregl.NavigationControl(), 'top-left');

      if (map.isStyleLoaded()) {
        styleLoadedRef.current = true;
        setMapReady(true);
      } else {
        map.on('style.load', () => {
          styleLoadedRef.current = true;
          setMapReady(true);
        });
      }

      map.on('webglcontextlost', () => {
        console.warn('[MapView] WebGL context lost');
      });
      map.on('webglcontextrestored', () => {
        console.log('[MapView] WebGL context restored');
      });

      map.on('error', (e) => {
        if ((e.error?.status === 404 || e.error?.status === 403) && !styleLoadedRef.current) {
          console.warn('Map tile error (non-fatal):', e.error.message);
        }
      });

      // Click on empty space to deselect
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['tracts-fill'] });
        if (features.length === 0) {
          onSelectTract(null);
        }
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        styleLoadedRef.current = false;
        layersAddedRef.current = false;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Add/update tract geometry source — only after style is loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geometry || !mapReady) return;

    const source = map.getSource('tracts') as maplibregl.GeoJSONSource | undefined;

    if (source) {
      source.setData(geometry as FeatureCollection);
    } else if (!layersAddedRef.current) {
      try {
        map.addSource('tracts', {
          type: 'geojson',
          data: geometry as FeatureCollection,
        });

        map.addLayer({
          id: 'tracts-fill',
          type: 'fill',
          source: 'tracts',
          paint: {
            'fill-color': '#e7e1ef',
            'fill-opacity': 0.7,
          },
        });

        map.addLayer({
          id: 'tracts-border',
          type: 'line',
          source: 'tracts',
          paint: {
            'line-color': '#333',
            'line-width': 1,
            'line-opacity': 0.9,
          },
        });

        map.addLayer({
          id: 'tracts-highlight',
          type: 'line',
          source: 'tracts',
          paint: {
            'line-color': '#e31a1c',
            'line-width': 2,
            'line-opacity': 1,
          },
          filter: ['==', ['get', 'tract_geoid'], ''],
          layout: { visibility: 'none' },
        });

        // Add hatch pattern image for price filter overlay
        const hatchData = buildHatchPattern();
        map.addImage('hatch-pattern', hatchData);

        // Hatch overlay layer for tracts above price threshold (starts empty)
        map.addLayer({
          id: 'tracts-hatch',
          type: 'fill',
          source: 'tracts',
          paint: {
            'fill-pattern': 'hatch-pattern',
          },
          filter: ['in', ['get', 'tract_geoid'], ['literal', []]],
        });

        // Click handler for tract selection
        map.on('click', 'tracts-fill', (e) => {
          if (e.features && e.features.length > 0) {
            const tractGeoid = e.features[0].properties?.tract_geoid;
            if (tractGeoid) onSelectTract(tractGeoid);
          }
        });

        // Hover cursor
        map.on('mouseenter', 'tracts-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'tracts-fill', () => {
          map.getCanvas().style.cursor = '';
        });

        layersAddedRef.current = true;
      } catch (err) {
        console.error('[MapView] Failed to add tract layers:', err);
      }
    }
  }, [geometry, onSelectTract, mapReady]);

  // Update fill colors when quarter/metric/breaks change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !marketData || breaks.length === 0 || !mapReady) return;
    if (!map.getSource('tracts')) return;

    const quarterData = marketData[selectedQuarter];
    const colorByTract: Record<string, string> = {};

    if (comparisonMode && comparisonColors) {
      for (const [tractId, color] of comparisonColors) {
        colorByTract[tractId] = color;
      }
    } else if (quarterData) {
      for (const tractId of Object.keys(quarterData)) {
        const record = quarterData[tractId];
        colorByTract[tractId] = getTractColor(record, breaks, activeMetric);
      }
    }

    const matchExpr: unknown[] = ['match', ['get', 'tract_geoid']];
    for (const [tractId, color] of Object.entries(colorByTract)) {
      matchExpr.push(tractId, color);
    }
    matchExpr.push(MISSING_COLOR);

    map.setPaintProperty('tracts-fill', 'fill-color', matchExpr as unknown as maplibregl.Expression);
  }, [marketData, selectedQuarter, activeMetric, breaks, comparisonMode, comparisonColors, mapReady]);

  // Update highlight filter when selected tract changes (independent of color repaint)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getLayer('tracts-highlight')) return;

    if (selectedTract) {
      map.setFilter('tracts-highlight', ['==', ['get', 'tract_geoid'], selectedTract]);
      map.setLayoutProperty('tracts-highlight', 'visibility', 'visible');
    } else {
      map.setLayoutProperty('tracts-highlight', 'visibility', 'none');
    }
  }, [selectedTract, mapReady]);

  // Update hatch filter when price threshold / quarter / metric changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer('tracts-hatch')) return;

    // MapLibre v5 setFilter expects FilterSpecification; cast through unknown
    // since the expression array syntax is valid at runtime but not assignable
    // to the new Expression class type directly.
    type FS = maplibregl.FilterSpecification;
    const emptyFilter = ['in', ['get', 'tract_geoid'], ['literal', []]] as unknown as FS;

    if (!priceFilterThreshold || !marketData || !PRICE_FILTER_METRICS.has(activeMetric)) {
      map.setFilter('tracts-hatch', emptyFilter);
      return;
    }

    const quarterData = marketData[selectedQuarter];
    if (!quarterData) {
      map.setFilter('tracts-hatch', emptyFilter);
      return;
    }

    const aboveIds = Object.entries(quarterData)
      .filter(([, record]) => {
        const val = record[activeMetric] as number | null;
        return val != null && val > priceFilterThreshold;
      })
      .map(([id]) => id);

    const activeFilter = ['in', ['get', 'tract_geoid'], ['literal', aboveIds]] as unknown as FS;
    map.setFilter('tracts-hatch', aboveIds.length > 0 ? activeFilter : emptyFilter);
  }, [priceFilterThreshold, marketData, selectedQuarter, activeMetric, mapReady]);

  // Hover tooltip: update React state via map events
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !marketData || !mapReady) return;
    if (!map.getSource('tracts')) return;

    const onMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const geoid = props?.tract_geoid as string;
      const name = (props?.tract_name ?? geoid) as string;
      const record = getTractRecord(marketData, selectedQuarter, geoid);
      setHoveredTract({ name, geoid, record });
    };

    const onMouseLeave = () => {
      setHoveredTract(null);
    };

    map.on('mousemove', 'tracts-fill', onMouseMove);
    map.on('mouseleave', 'tracts-fill', onMouseLeave);

    return () => {
      map.off('mousemove', 'tracts-fill', onMouseMove);
      map.off('mouseleave', 'tracts-fill', onMouseLeave);
    };
  }, [marketData, selectedQuarter, activeMetric, mapReady]);

  const tooltipValue = hoveredTract?.record
    ? formatMetricValue(hoveredTract.record, activeMetric)
    : null;

  const appreciationValue = comparisonMode && hoveredTract && appreciationMap
    ? appreciationMap.get(hoveredTract.geoid)
    : undefined;

  return (
    <div className={styles.mapWrapper}>
      <div
        ref={mapContainerRef}
        className={styles.mapContainer}
        role="application"
        aria-label="St. Petersburg Census tract map"
      />
      {hoveredTract && (
        <div className={styles.hoverTooltip}>
          <div className={styles.tooltipName}>{hoveredTract.name}</div>
          <div className={styles.tooltipGeoid}>GEOID: {hoveredTract.geoid}</div>
          {comparisonMode ? (
            <div className={styles.tooltipMetric}>
              Price change:{' '}
              {appreciationValue == null
                ? <em>Insufficient data</em>
                : <strong style={{ color: appreciationValue >= 0 ? '#1a9850' : '#d73027' }}>
                    {appreciationValue >= 0 ? '+' : ''}{appreciationValue.toFixed(1)}%
                  </strong>
              }
            </div>
          ) : (
            <>
              <div className={styles.tooltipMetric}>
                {getMetricLabel(activeMetric)}:{' '}
                {tooltipValue ?? <em>No data</em>}
              </div>
              {hoveredTract.record?.suppressMedian && (
                <div className={styles.tooltipSuppressed}>Suppressed (&lt;5 sales)</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
