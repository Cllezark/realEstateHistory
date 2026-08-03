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
}

interface RawPolygon {
  title: string;
  folder: string;
  outerRing: [number, number][];
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
        folderColor: colorMap[pt.folder] || '#999999',
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
        fillColor: POLYGON_COLORS[poly.title] || '#999999',
        fillOpacity: 0.25,
      },
    }));

    const folderMetaList: MyMapFolderMeta[] = rawFolders.map((f) => ({
      name: f.name,
      color: colorMap[f.name] || '#999999',
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
