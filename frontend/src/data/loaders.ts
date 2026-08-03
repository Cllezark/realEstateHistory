/** Fetch and parse GeoJSON tract geometry. */
export async function loadTractGeometry(): Promise<import('./types').TractGeoJSON> {
  const resp = await fetch('/data/tracts.geojson');
  if (!resp.ok) throw new Error(`Failed to load tract geometry: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

/** Fetch and parse the tract-quarter market data index. */
export async function loadTractQuarterData(): Promise<import('./types').TractQuarterIndex> {
  const resp = await fetch('/data/tract-quarter.json');
  if (!resp.ok) throw new Error(`Failed to load market data: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

/** Fetch and parse publication metadata. */
export async function loadMetadata(): Promise<import('./types').Metadata> {
  const resp = await fetch('/data/metadata.json');
  if (!resp.ok) throw new Error(`Failed to load metadata: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

/** Fetch and parse parcel-level sales data. */
export async function loadParcelSales(): Promise<import('./types').ParcelSalesIndex | null> {
  try {
    const resp = await fetch('/data/parcel-sales.json');
    if (!resp.ok) {
      console.warn(`Parcel sales data not available: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return resp.json();
  } catch (err) {
    console.warn('Failed to load parcel sales data:', err);
    return null;
  }
}

// ===========================================================================
// MyMap Data Loaders
// ===========================================================================

/** Fetch and parse MyMap point features. Returns null if file not found (not an error). */
export async function loadMyMapPoints(): Promise<import('./types').MyMapPointsGeoJSON | null> {
  try {
    const resp = await fetch('/data/mymap-points.geojson');
    if (!resp.ok) {
      console.warn(`MyMap points data not available: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return resp.json();
  } catch (err) {
    console.warn('Failed to load MyMap points:', err);
    return null;
  }
}

/** Fetch and parse MyMap polygon features. Returns null if file not found. */
export async function loadMyMapPolygons(): Promise<import('./types').MyMapPolygonsGeoJSON | null> {
  try {
    const resp = await fetch('/data/mymap-polygons.geojson');
    if (!resp.ok) {
      console.warn(`MyMap polygons data not available: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return resp.json();
  } catch (err) {
    console.warn('Failed to load MyMap polygons:', err);
    return null;
  }
}

/** Fetch and parse MyMap metadata. Returns null if file not found. */
export async function loadMyMapMetadata(): Promise<import('./types').MyMapMetadata | null> {
  try {
    const resp = await fetch('/data/mymap-metadata.json');
    if (!resp.ok) {
      console.warn(`MyMap metadata not available: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return resp.json();
  } catch (err) {
    console.warn('Failed to load MyMap metadata:', err);
    return null;
  }
}

/**
 * Fetch a KML/KMZ export URL, parse it client-side, and return GeoJSON features.
 * Used for on-demand refresh without a Python build step.
 *
 * NOTE: This is a lightweight client-side parser. For heavy KML files, prefer
 * the Python converter (scripts/convert_mymap.py).
 */
export async function loadMyMapFromUrl(
  kmlUrl: string,
): Promise<{
  points: import('./types').MyMapPointsGeoJSON | null;
  polygons: import('./types').MyMapPolygonsGeoJSON | null;
  metadata: import('./types').MyMapMetadata | null;
  error: string | null;
}> {
  try {
    const resp = await fetch(kmlUrl);
    if (!resp.ok) {
      return { points: null, polygons: null, metadata: null, error: `HTTP ${resp.status}: ${resp.statusText}` };
    }

    const text = await resp.text();

    // Dynamically import the KML parser (lazy-loaded to keep bundle smaller)
    const { parseMyMapKml } = await import('./mymap-kml-parser');
    return parseMyMapKml(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error parsing KML';
    return { points: null, polygons: null, metadata: null, error: msg };
  }
}
