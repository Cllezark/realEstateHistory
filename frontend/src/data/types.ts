/** Shared types for the Real Estate Tract Map. */

import type { Polygon, MultiPolygon } from 'geojson';

/** A single tract-quarter data record (camelCase from tract-quarter.json). */
export interface TractQuarterRecord {
  medianSalePrice: number | null;
  qualifiedSaleCount: number | null;
  meanSalePrice: number | null;
  p25SalePrice: number | null;
  p75SalePrice: number | null;
  minSalePrice: number | null;
  maxSalePrice: number | null;
  averageRatePercent: number | null;
  estimatedMonthlyPrincipalInterest: number | null;
  hpi: number | null;
  annualChange: number | null;
  smallSampleFlag: boolean;
  suppressMedian: boolean;
  partialQuarterFlag: boolean;
}

/** Indexed market data: quarter_id → tract_geoid → record */
export type TractQuarterIndex = Record<string, Record<string, TractQuarterRecord>>;

/** A GeoJSON Feature for a Census tract. */
export interface TractFeature {
  type: 'Feature';
  geometry: Polygon | MultiPolygon;
  properties: TractProperties;
}

/** Non-geometry tract properties. */
export interface TractProperties {
  tract_geoid: string;
  tract_name: string;
  land_area: number | null;
  water_area: number | null;
}

/** A GeoJSON FeatureCollection of tracts. */
export interface TractGeoJSON {
  type: 'FeatureCollection';
  features: TractFeature[];
}

/** Publication metadata. */
export interface Metadata {
  buildDate: string;
  dataSource: string;
  boundaryVintage: string;
  boundaryDescription: string;
  region?: RegionInfo;
  dateCoverageStart: string;
  dateCoverageEnd: string;
  metrics: string[];
  mortgageAssumptions: MortgageAssumptions;
  smallSampleThreshold: number;
  suppressionThreshold: number;
  attributions: Attributions;
  pipelineVersion: string;
}

/** Dashboard coverage region definition. */
export interface RegionInfo {
  displayName: string;
  cutoffLatitude?: number | null;
  municipalities?: string[];
  clearwaterBeach?: Record<string, number>;
  map?: {
    center?: [number, number];
    zoom?: number;
  };
}

export interface MortgageAssumptions {
  downPaymentPercent: number;
  loanTermYears: number;
  paymentComponents: string;
}

export interface Attributions {
  salesAndProperty: string;
  hpi: string;
  mortgageRate: string;
}

/** A single parcel sale record. */
export interface ParcelSale {
  parcelNumber: string | null;
  address: string | null;
  salePrice: number | null;
  saleDate: string | null; // YYYY-MM-DD format
  latitude: number | null;
  longitude: number | null;
  livingAreaSqft: number | null;
  grossAreaSqft: number | null;
  parcelAreaSqft: number | null;
}

/** Parcel sales indexed by quarter then tract: quarter_id → tract_geoid → sales[] */
export type ParcelSalesIndex = Record<string, Record<string, ParcelSale[]>>;

/** The active map metric. */
export type MapMetric =
  | 'medianSalePrice'
  | 'meanSalePrice'
  | 'qualifiedSaleCount'
  | 'p25SalePrice'
  | 'p75SalePrice'
  | 'minSalePrice'
  | 'maxSalePrice'
  | 'averageRatePercent'
  | 'estimatedMonthlyPrincipalInterest'
  | 'hpi'
  | 'annualChange';

/** Comparison mode metrics. */
export type ComparisonMetric = 'medianSalePrice' | 'hpi';

/** Classification method for choropleth. */
export type ClassificationMethod = 'quantiles' | 'equalIntervals' | 'jenks' | 'fixed';

/** A single legend break. */
export interface LegendBreak {
  label: string;
  minValue: number;
  maxValue: number;
  color: string;
}

/** Application state. */
export interface AppState {
  selectedTract: string | null;
  selectedQuarter: string;
  activeMetric: MapMetric;
  comparisonMode: boolean;
  comparisonStartQuarter: string | null;
  comparisonEndQuarter: string | null;
  loading: LoadingState;
  error: string | null;
  priceFilterThreshold: number | null;
}

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

// =========================================================================
// MyMap Layer Types (Google MyMap integration)
// =========================================================================

/** Properties on a MyMap point feature (house tour, work location, etc.). */
export interface MyMapPointProperties {
  title: string;
  description: string;
  folder: string;
  folderColor: string;
  price: number | null;
  priceFormatted: string | null;
  url: string | null;
}

/** GeoJSON Feature for a MyMap point. */
export interface MyMapPointFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: MyMapPointProperties;
}

/** Properties on a MyMap polygon feature (area overlay). */
export interface MyMapPolygonProperties {
  title: string;
  folder: string;
  fillColor: string;
  fillOpacity: number;
}

/** GeoJSON Feature for a MyMap polygon. */
export interface MyMapPolygonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: MyMapPolygonProperties;
}

/** GeoJSON FeatureCollection for MyMap points. */
export interface MyMapPointsGeoJSON {
  type: 'FeatureCollection';
  features: MyMapPointFeature[];
}

/** GeoJSON FeatureCollection for MyMap polygons. */
export interface MyMapPolygonsGeoJSON {
  type: 'FeatureCollection';
  features: MyMapPolygonFeature[];
}

/** Per-folder metadata from the MyMap conversion. */
export interface MyMapFolderMeta {
  name: string;
  color: string;
  pointCount: number;
  polygonCount: number;
}

/** MyMap publication metadata. */
export interface MyMapMetadata {
  buildDate: string;
  sourceDescription: string;
  totalPoints: number;
  totalPolygons: number;
  folders: MyMapFolderMeta[];
}

/** Visibility state for MyMap layers. */
export interface MyMapLayerVisibility {
  points: boolean;
  polygons: boolean;
  /** Per-folder point visibility (folder name → visible). */
  folderPoints: Record<string, boolean>;
  /** Per-polygon visibility (polygon title → visible). */
  individualPolygons: Record<string, boolean>;
}

/** Build default visibility state from MyMap metadata (everything visible). */
export function defaultMyMapVisibility(metadata: MyMapMetadata | null): MyMapLayerVisibility {
  const folderPoints: Record<string, boolean> = {};
  const individualPolygons: Record<string, boolean> = {};

  if (metadata) {
    for (const f of metadata.folders) {
      folderPoints[f.name] = true;
    }
    // Pre-populate polygon keys from metadata folder names
    // Actual polygon titles are initialized from GeoJSON features on first load
  }

  return {
    points: true,
    polygons: true,
    folderPoints,
    individualPolygons,
  };
}
