#!/usr/bin/env bash
# Refresh MyMap data: download KML export from Google MyMap and run converter.
#
# Usage:
#   ./scripts/refresh_mymap.sh [KML_URL]
#
# If KML_URL is omitted, reads from MYMAP_KML_URL env var.
# Output lands in frontend/public/data/ (served as static assets by Vite).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$ROOT/frontend/public/data"
VENV_PYTHON="$ROOT/.venv/bin/python"

KML_URL="${1:-${MYMAP_KML_URL:-}}"

if [[ -z "$KML_URL" ]]; then
    echo "Usage: $0 <KML_URL>"
    echo "  or set MYMAP_KML_URL environment variable"
    echo ""
    echo "Get the KML export URL from Google MyMap:"
    echo "  1. Open your MyMap"
    echo "  2. Click the three-dot menu next to the map title"
    echo "  3. Select 'Export to KML/KMZ'"
    echo "  4. Check 'Export to a .KML file' and download"
    echo "  5. Or use the direct URL pattern:"
    echo "     https://www.google.com/maps/d/kml?mid=YOUR_MAP_ID"
    exit 1
fi

DOWNLOAD_PATH="$ROOT/mymap.kmz"

echo "Downloading MyMap KML from $KML_URL ..."
curl -sL -o "$DOWNLOAD_PATH" "$KML_URL"

if [[ ! -s "$DOWNLOAD_PATH" ]]; then
    echo "ERROR: Download failed or empty file"
    exit 1
fi

echo "Running converter..."
"$VENV_PYTHON" "$ROOT/scripts/convert_mymap.py" "$DOWNLOAD_PATH" --output-dir "$OUT_DIR"

# Inject build timestamp into metadata
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
META_PATH="$OUT_DIR/mymap-metadata.json"
if [[ -f "$META_PATH" ]]; then
    "$VENV_PYTHON" -c "
import json, sys
with open('$META_PATH') as f:
    meta = json.load(f)
meta['buildDate'] = '$TIMESTAMP'
with open('$META_PATH', 'w') as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)
"
fi

echo ""
echo "MyMap data refreshed successfully."
echo "  Points:  $OUT_DIR/mymap-points.geojson"
echo "  Polygons: $OUT_DIR/mymap-polygons.geojson"
echo "  Metadata: $OUT_DIR/mymap-metadata.json"
