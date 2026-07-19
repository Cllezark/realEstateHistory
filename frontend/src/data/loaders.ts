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
