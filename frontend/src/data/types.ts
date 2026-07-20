/** Shared types for the St. Pete Real Estate Map MVP. */

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
  dateCoverageStart: string;
  dateCoverageEnd: string;
  metrics: string[];
  mortgageAssumptions: MortgageAssumptions;
  smallSampleThreshold: number;
  suppressionThreshold: number;
  attributions: Attributions;
  pipelineVersion: string;
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
