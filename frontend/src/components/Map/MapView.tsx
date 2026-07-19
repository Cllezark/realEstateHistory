import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { TractGeoJSON, TractQuarterIndex, MapMetric, LegendBreak } from '../../data/types';
import { getTractColor, MISSING_COLOR, getMetricLabel } from '../../data/classification';
import { getTractRecord, getEffectiveMedian, formatCurrency } from '../../data/formatters';
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
  onSelectTract: (tractGeoid: string | null) => void;
}

const ST_PETE_CENTER: [number, number] = [-82.66, 27.77];
const ST_PETE_ZOOM = 11.5;

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

export function MapView({
  geometry,
  marketData,
  selectedQuarter,
  selectedTract,
  activeMetric,
  breaks,
  comparisonMode,
  comparisonColors,
  onSelectTract,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const styleLoadedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  // Track whether we've already added the tract layers to the map
  const layersAddedRef = useRef(false);

  // Initialize map — wait for style.load before marking ready
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASEMAP_STYLE,
      center: ST_PETE_CENTER,
      zoom: ST_PETE_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');

    // Only mark ready after style (basemap tiles) finishes loading
    map.on('style.load', () => {
      styleLoadedRef.current = true;
      setMapReady(true);
    });

    // If the style fails to load (network error, etc.), still allow
    // the app to function with whatever we have
    map.on('error', (e) => {
      if (e.error?.status === 404 || e.error?.status === 403) {
        console.warn('Map tile error (non-fatal):', e.error.message);
        // Mark ready anyway so the GeoJSON overlays still render
        if (!styleLoadedRef.current) {
          styleLoadedRef.current = true;
          setMapReady(true);
        }
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

    return () => {
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
      layersAddedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Add/update tract geometry source — only after style is loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geometry || !mapReady) return;

    // Guard: don't add sources/layers if style isn't loaded
    if (!map.isStyleLoaded()) return;

    const source = map.getSource('tracts') as maplibregl.GeoJSONSource | undefined;

    if (source) {
      source.setData(geometry as FeatureCollection);
    } else if (!layersAddedRef.current) {
      layersAddedRef.current = true;

      map.addSource('tracts', {
        type: 'geojson',
        data: geometry as FeatureCollection,
      });

      // Fill layer (below labels but above basemap)
      map.addLayer({
        id: 'tracts-fill',
        type: 'fill',
        source: 'tracts',
        paint: {
          'fill-color': MISSING_COLOR,
          'fill-opacity': 0.75,
        },
      });

      // Border layer
      map.addLayer({
        id: 'tracts-border',
        type: 'line',
        source: 'tracts',
        paint: {
          'line-color': '#666',
          'line-width': 0.5,
          'line-opacity': 0.8,
        },
      });

      // Highlight layer for selected tract
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

      // Click handler for tract selection
      map.on('click', 'tracts-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const tractGeoid = e.features[0].properties?.tract_geoid;
          if (tractGeoid) {
            onSelectTract(tractGeoid);
          }
        }
      });

      // Hover cursor
      map.on('mouseenter', 'tracts-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'tracts-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }, [geometry, onSelectTract, mapReady]);

  // Update fill colors when quarter/metric/breaks change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !marketData || breaks.length === 0 || !mapReady) return;
    if (!map.isStyleLoaded()) return;

    const quarterData = marketData[selectedQuarter];

    // Build a color lookup by tract_geoid
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

    // Apply colors via setPaintProperty with match expression
    const matchExpr: unknown[] = ['match', ['get', 'tract_geoid']];
    for (const [tractId, color] of Object.entries(colorByTract)) {
      matchExpr.push(tractId, color);
    }
    matchExpr.push(MISSING_COLOR); // default

    map.setPaintProperty('tracts-fill', 'fill-color', matchExpr as unknown as maplibregl.Expression);

    // Update highlight filter
    if (selectedTract) {
      map.setFilter('tracts-highlight', ['==', ['get', 'tract_geoid'], selectedTract]);
      map.setLayoutProperty('tracts-highlight', 'visibility', 'visible');
    } else {
      map.setLayoutProperty('tracts-highlight', 'visibility', 'none');
    }
  }, [marketData, selectedQuarter, activeMetric, breaks, comparisonMode, comparisonColors, selectedTract, mapReady]);

  // Hover tooltip
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !marketData || !mapReady) return;
    if (!map.isStyleLoaded()) return;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    popupRef.current = popup;

    map.on('mousemove', 'tracts-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const tractGeoid = props?.tract_geoid;
      const tractName = props?.tract_name ?? tractGeoid;

      const record = getTractRecord(marketData, selectedQuarter, tractGeoid);
      let tooltipHtml = `<strong>${tractName}</strong><br/>GEOID: ${tractGeoid}`;

      if (record) {
        const median = getEffectiveMedian(record);
        if (median != null) {
          tooltipHtml += `<br/>${getMetricLabel(activeMetric)}: ${formatCurrency(median)}`;
        } else if (record.suppressMedian) {
          tooltipHtml += `<br/><em>Suppressed (fewer than 5 sales)</em>`;
        } else {
          tooltipHtml += `<br/><em>No data</em>`;
        }
      } else {
        tooltipHtml += `<br/><em>No data for ${selectedQuarter}</em>`;
      }

      popup.setLngLat(e.lngLat).setHTML(tooltipHtml).addTo(map);
    });

    map.on('mouseleave', 'tracts-fill', () => {
      popup.remove();
    });

    return () => {
      popup.remove();
    };
  }, [marketData, selectedQuarter, activeMetric, mapReady]);

  return <div ref={mapContainerRef} className={styles.mapContainer} role="application" aria-label="St. Petersburg Census tract map" />;
}
