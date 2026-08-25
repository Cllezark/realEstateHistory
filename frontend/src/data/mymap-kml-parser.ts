/**
 * Lightweight client-side KML parser for MyMap data.
 *
 * This mirrors the logic in scripts/convert_mymap.py but runs in the
 * browser. It handles the subset of KML that Google MyMap exports:
 *   - Point placemarks with name/description
 *   - Polygon placemarks with outer boundaries
 *   - Folder grouping
 *
 * For production use, prefer the Python converter for better performance
 * and validation. This is used for on-demand refresh.
 */

import type {
  MyMapPointFeature,
  MyMapPolygonFeature,
  MyMapPointsGeoJSON,
  MyMapPolygonsGeoJSON,
  MyMapFolderMeta,
  MyMapMetadata,
} from './types';

interface RawPoint {
  title: string;
  description: string;
  folder: string;
  lon: number;
  lat: number;
  price: number | null;
  url: string | null;
  color: string | null;
}

interface RawPolygon {
  title: string;
  folder: string;
  outerRing: [number, number][];
  color: string | null;
}

interface RawFolderMeta {
  name: string;
  pointCount: number;
  polygonCount: number;
}

const FOLDER_COLORS = [
  '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
  '#a65628', '#f781bf', '#999999', '#66c2a5', '#fc8d62',
  '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494',
];

const POLYGON_COLORS: Record<string, string> = {
  'Where we spend our time': '#2ca25f',
  'Flood Zone AE or worse': '#3182bd',
  'Flood Zone AE or Worse And too far north': '#e6550d',
  'Work': '#756bb1',
};

function parseCoordinates(text: string): [number, number][] {
  const pairs: [number, number][] = [];
  for (const token of text.trim().split(/\s+/)) {
    const parts = token.split(',');
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lon) && !isNaN(lat)) {
        pairs.push([lon, lat]);
      }
    }
  }
  return pairs;
}

function extractPrice(text: string): number | null {
  const m = text.match(/\$([\d,]+)\b/);
  if (!m) return null;
  const raw = m[1].replace(/,/g, '');
  const v = parseInt(raw, 10);
  return isNaN(v) ? null : v;
}

function extractUrl(text: string): string | null {
  const clean = text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
  const m = clean.match(/(https?:\/\/[^\s<>]+)/);
  return m ? m[1].replace(/\.$/, '') : null;
}

function cleanDescription(raw: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a style id → hex color map from KML <Style> elements. */
function extractStyleColors(doc: Document): Record<string, string> {
  const colors: Record<string, string> = {};
  doc.querySelectorAll('Style').forEach((st) => {
    const sid = st.getAttribute('id') || '';
    let color: string | null = null;

    const iconMatch = sid.match(/icon-1899-([0-9A-Fa-f]{6})/);
    if (iconMatch) {
      color = '#' + iconMatch[1].toUpperCase();
    } else {
      const colorEl = st.querySelector('LineStyle color') || st.querySelector('PolyStyle color');
      const v = colorEl?.textContent?.trim();
      // KML color is aabbggrr -> reverse to #rrggbb
      if (v && /^[0-9A-Fa-f]{8}$/.test(v)) {
        color = '#' + v.slice(6, 8).toUpperCase() + v.slice(4, 6).toUpperCase() + v.slice(2, 4).toUpperCase();
      }
    }

    if (color) {
      colors[sid] = color;
      const base = sid.replace(/-(?:nodesc|normal|highlight)/g, '');
      if (!(base in colors)) colors[base] = color;
    }
  });
  return colors;
}

/** Resolve a placemark's <styleUrl> reference to a hex color. */
function resolveStyleColor(pm: Element, styleColors: Record<string, string>): string | null {
  const su = pm.querySelector('styleUrl')?.textContent?.trim();
  if (!su) return null;
  const ref = su.replace(/^#/, '');
  if (ref in styleColors) return styleColors[ref];
  const base = ref.replace(/-(?:nodesc|normal|highlight)/g, '');
  return styleColors[base] ?? null;
}

function mostCommonColor(colors: string[]): string | null {
  if (colors.length === 0) return null;
  const counts = new Map<string, number>();
  for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = -1;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/** Parse a KML string into structured MyMap data. */
export function parseMyMapKml(kmlText: string): {
  points: MyMapPointsGeoJSON | null;
  polygons: MyMapPolygonsGeoJSON | null;
  metadata: MyMapMetadata | null;
  error: string | null;
} {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(kmlText, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { points: null, polygons: null, metadata: null, error: 'KML parse error: ' + parseError.textContent };
    }

    const rawPoints: RawPoint[] = [];
    const rawPolygons: RawPolygon[] = [];
    const rawFolders: RawFolderMeta[] = [];
    const styleColors = extractStyleColors(doc);

    const folders = doc.querySelectorAll('Document > Folder');
    folders.forEach((folderEl) => {
      const folderName = folderEl.querySelector('name')?.textContent?.trim() || '(unnamed)';

      const meta: RawFolderMeta = { name: folderName, pointCount: 0, polygonCount: 0 };

      folderEl.querySelectorAll('Placemark').forEach((pm) => {
        const pmName = pm.querySelector('name')?.textContent?.trim() || '(unnamed)';
        const pmDesc = pm.querySelector('description')?.textContent;

        const pointEl = pm.querySelector('Point');
        const polygonEl = pm.querySelector('Polygon');

        if (pointEl) {
          const coordEl = pointEl.querySelector('coordinates');
          const coords = coordEl?.textContent ? parseCoordinates(coordEl.textContent) : [];
          if (coords.length > 0) {
            const cleanDesc = cleanDescription(pmDesc ?? null);
            rawPoints.push({
              title: pmName,
              description: cleanDesc,
              folder: folderName,
              lon: coords[0][0],
              lat: coords[0][1],
              price: extractPrice(cleanDesc),
              url: extractUrl(cleanDesc),
              color: resolveStyleColor(pm, styleColors),
            });
            meta.pointCount++;
          }
        } else if (polygonEl) {
          const outerBoundary = polygonEl.querySelector('outerBoundaryIs LinearRing coordinates');
          if (outerBoundary?.textContent) {
            rawPolygons.push({
              title: pmName,
              folder: folderName,
              outerRing: parseCoordinates(outerBoundary.textContent),
              color: resolveStyleColor(pm, styleColors),
            });
            meta.polygonCount++;
          }
        }
      });

      rawFolders.push(meta);
    });

    // Build GeoJSON points
    const colorMap: Record<string, string> = {};
    rawFolders.forEach((f, i) => {
      colorMap[f.name] = FOLDER_COLORS[i % FOLDER_COLORS.length];
    });

    const pointFeatures: MyMapPointFeature[] = rawPoints.map((pt) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
      properties: {
        title: pt.title,
        description: pt.description,
        folder: pt.folder,
        folderColor: pt.color ?? colorMap[pt.folder] ?? '#999999',
        price: pt.price,
        priceFormatted: pt.price != null ? `$${pt.price.toLocaleString()}` : null,
        url: pt.url,
      },
    }));

    const polygonFeatures: MyMapPolygonFeature[] = rawPolygons.map((poly) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [poly.outerRing],
      },
      properties: {
        title: poly.title,
        folder: poly.folder,
        fillColor: poly.color ?? POLYGON_COLORS[poly.title] ?? '#999999',
        fillOpacity: 0.25,
      },
    }));

    const folderMetaList: MyMapFolderMeta[] = rawFolders.map((f) => ({
      name: f.name,
      color:
        mostCommonColor(rawPoints.filter(p => p.folder === f.name && p.color).map(p => p.color as string)) ??
        colorMap[f.name] ??
        '#999999',
      pointCount: f.pointCount,
      polygonCount: f.polygonCount,
    }));

    return {
      points: pointFeatures.length > 0 ? { type: 'FeatureCollection', features: pointFeatures } : null,
      polygons: polygonFeatures.length > 0 ? { type: 'FeatureCollection', features: polygonFeatures } : null,
      metadata: {
        buildDate: new Date().toISOString(),
        sourceDescription: 'MyMap (runtime fetch)',
        totalPoints: rawPoints.length,
        totalPolygons: rawPolygons.length,
        folders: folderMetaList,
      },
      error: null,
    };
  } catch (err) {
    return {
      points: null,
      polygons: null,
      metadata: null,
      error: err instanceof Error ? err.message : 'Unknown KML parse error',
    };
  }
}
