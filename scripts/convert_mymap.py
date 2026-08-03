#!/usr/bin/env python3
"""Convert a Google MyMap KML/KMZ export into GeoJSON layers for the dashboard.

Usage:
    .venv/bin/python scripts/convert_mymap.py <input.kmz|input.kml> [--output-dir <dir>]

Outputs (to --output-dir, default: frontend/public/data/):
    mymap-points.geojson     Point features (house tours, work locations)
    mymap-polygons.geojson   Polygon features (area overlays)
    mymap-metadata.json      Layer definitions, folder groups, colors
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import re

# ===========================================================================
# Color palettes — one hue per date folder
# ===========================================================================
FOLDER_COLORS = [
    "#e41a1c",  # red
    "#377eb8",  # blue
    "#4daf4a",  # green
    "#984ea3",  # purple
    "#ff7f00",  # orange
    "#a65628",  # brown
    "#f781bf",  # pink
    "#999999",  # grey
    "#66c2a5",  # teal
    "#fc8d62",  # coral
    "#8da0cb",  # lavender
    "#e78ac3",  # rose
    "#a6d854",  # lime
    "#ffd92f",  # gold
    "#e5c494",  # tan
]

POLYGON_COLORS = {
    "Where we spend our time": "#2ca25f",
    "Flood Zone AE or worse": "#3182bd",
    "Flood Zone AE or Worse And too far north": "#e6550d",
    "Work": "#756bb1",
}

KML_NS = "http://www.opengis.net/kml/2.2"
NS = {"kml": KML_NS}


# ===========================================================================
# Data structures
# ===========================================================================
@dataclass
class PointFeature:
    title: str
    description: str = ""
    folder: str = ""
    longitude: float = 0.0
    latitude: float = 0.0
    price: Optional[int] = None
    url: Optional[str] = None


@dataclass
class PolygonFeature:
    title: str
    folder: str = ""
    coordinates: list[list[tuple[float, float]]] = field(default_factory=list)


@dataclass
class FolderMeta:
    name: str
    color: str
    point_count: int = 0
    polygon_count: int = 0


# ===========================================================================
# KML Parsing
# ===========================================================================
def _text(el, tag) -> Optional[str]:
    child = el.find(f"kml:{tag}", NS)
    if child is not None and child.text:
        return child.text.strip()
    return None


def _parse_coordinates(text: str) -> list[tuple[float, float]]:
    """Parse KML coordinate string into (lon, lat) pairs, stripping altitude."""
    pairs = []
    for token in text.strip().split():
        token = token.strip()
        if not token:
            continue
        parts = token.split(",")
        if len(parts) >= 2:
            try:
                pairs.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
    return pairs


def _extract_price(desc: str) -> Optional[int]:
    """Try to find a dollar price in the description text."""
    # Match $XXX,XXX or $XXX,XXX pattern (commas optional)
    m = re.search(r"\$([\d,]+)\b", desc)
    if m:
        raw = m.group(1).replace(",", "")
        try:
            return int(raw)
        except ValueError:
            return None
    return None


def _extract_url(desc: str) -> Optional[str]:
    """Extract first URL from description text."""
    # Look for text inside <br> tags or raw URLs
    # Clean HTML/CDATA wrapping
    clean = re.sub(r"<br\s*/?>", " ", desc)
    clean = re.sub(r"<[^>]+>", "", clean)
    # Now find URLs
    m = re.search(r"(https?://[^\s<>]+)", clean)
    if m:
        return m.group(1).rstrip(".")
    return None


def _clean_description(raw: Optional[str]) -> str:
    """Strip HTML tags and CDATA wrappers from description text."""
    if raw is None:
        return ""
    # Remove CDATA markers
    text = raw
    text = re.sub(r"<!\[CDATA\[", "", text)
    text = re.sub(r"\]\]>", "", text)
    # Collapse <br> to spaces
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    # Strip remaining HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_kml(kml_text: str) -> tuple[list[PointFeature], list[PolygonFeature], list[FolderMeta]]:
    """Parse KML document and extract point, polygon, and folder metadata."""
    root = ET.fromstring(kml_text)
    doc = root.find(f"{{{KML_NS}}}Document")
    if doc is None:
        raise ValueError("KML has no Document element")

    points: list[PointFeature] = []
    polygons: list[PolygonFeature] = []
    folders: list[FolderMeta] = []

    for folder_el in doc.findall(f"kml:Folder", NS):
        folder_name = _text(folder_el, "name") or "(unnamed)"
        color_idx = len(folders) % len(FOLDER_COLORS)
        folder_color = FOLDER_COLORS[color_idx]

        meta = FolderMeta(name=folder_name, color=folder_color)

        for pm in folder_el.findall("kml:Placemark", NS):
            pm_name = _text(pm, "name") or "(unnamed)"
            pm_desc = _text(pm, "description")

            # Determine geometry type
            if pm.find("kml:Point", NS) is not None:
                coord_el = pm.find(".//kml:coordinates", NS)
                coords = _parse_coordinates(coord_el.text) if coord_el is not None and coord_el.text else []
                if coords:
                    clean_desc = _clean_description(pm_desc)
                    pt = PointFeature(
                        title=pm_name,
                        description=clean_desc,
                        folder=folder_name,
                        longitude=coords[0][0],
                        latitude=coords[0][1],
                        price=_extract_price(clean_desc),
                        url=_extract_url(clean_desc),
                    )
                    points.append(pt)
                    meta.point_count += 1

            elif pm.find("kml:Polygon", NS) is not None:
                poly_coords: list[list[tuple[float, float]]] = []
                outer = pm.find(".//kml:outerBoundaryIs/kml:LinearRing/kml:coordinates", NS)
                if outer is not None and outer.text:
                    poly_coords.append(_parse_coordinates(outer.text))
                # Inner boundaries (holes)
                for inner in pm.findall(".//kml:innerBoundaryIs/kml:LinearRing/kml:coordinates", NS):
                    if inner.text:
                        poly_coords.append(_parse_coordinates(inner.text))
                if poly_coords:
                    poly = PolygonFeature(
                        title=pm_name,
                        folder=folder_name,
                        coordinates=poly_coords,
                    )
                    polygons.append(poly)
                    meta.polygon_count += 1

        folders.append(meta)

    return points, polygons, folders


# ===========================================================================
# GeoJSON serialization
# ===========================================================================
def points_to_geojson(points: list[PointFeature], color_by_folder: dict[str, str]) -> dict:
    """Convert PointFeature list to a GeoJSON FeatureCollection."""
    features = []
    for pt in points:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [pt.longitude, pt.latitude],
            },
            "properties": {
                "title": pt.title,
                "description": pt.description,
                "folder": pt.folder,
                "folderColor": color_by_folder.get(pt.folder, "#999999"),
                "price": pt.price,
                "priceFormatted": f"${pt.price:,}" if pt.price is not None else None,
                "url": pt.url,
            },
        })

    return {"type": "FeatureCollection", "features": features}


def polygons_to_geojson(polygons: list[PolygonFeature]) -> dict:
    """Convert PolygonFeature list to a GeoJSON FeatureCollection."""
    features = []
    for poly in polygons:
        # outer ring = coordinates[0], holes = coordinates[1:]
        rings = []
        for ring_coords in poly.coordinates:
            # GeoJSON expects [lon, lat] (already in that order from KML)
            rings.append([[lon, lat] for lon, lat in ring_coords])

        if len(rings) == 1:
            geom = {"type": "Polygon", "coordinates": rings}
        else:
            geom = {"type": "Polygon", "coordinates": rings}

        fill_color = POLYGON_COLORS.get(poly.title, "#999999")

        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "title": poly.title,
                "folder": poly.folder,
                "fillColor": fill_color,
                "fillOpacity": 0.25,
            },
        })

    return {"type": "FeatureCollection", "features": features}


def folders_to_metadata(
    folders: list[FolderMeta],
    point_count: int,
    polygon_count: int,
) -> dict:
    """Serialize folder metadata as JSON."""
    folder_list = []
    for f in folders:
        folder_list.append({
            "name": f.name,
            "color": f.color,
            "pointCount": f.point_count,
            "polygonCount": f.polygon_count,
        })

    return {
        "buildDate": "",  # filled by refresh script
        "sourceDescription": "Cliff & Sam's Slice of St. Pete — Google MyMap",
        "totalPoints": point_count,
        "totalPolygons": polygon_count,
        "folders": folder_list,
    }


# ===========================================================================
# Main
# ===========================================================================
def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Google MyMap KML/KMZ to GeoJSON layers")
    parser.add_argument("input", type=Path, help="Path to .kml or .kmz file")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "frontend" / "public" / "data",
        help="Output directory for GeoJSON files (default: frontend/public/data/)",
    )
    args = parser.parse_args()

    input_path: Path = args.input
    output_dir: Path = args.output_dir

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Read input (KMZ or KML)
    if input_path.suffix.lower() == ".kmz":
        with zipfile.ZipFile(input_path, "r") as zf:
            names = zf.namelist()
            kml_name = next((n for n in names if n.endswith(".kml")), names[0] if names else None)
            if kml_name is None:
                print("ERROR: KMZ contains no KML file", file=sys.stderr)
                sys.exit(1)
            kml_text = zf.read(kml_name).decode("utf-8")
    else:
        kml_text = input_path.read_text(encoding="utf-8")

    # Parse
    points, polygons, folders = parse_kml(kml_text)
    color_map = {f.name: f.color for f in folders}

    print(f"Parsed {len(points)} point features across {len(folders)} folders")
    print(f"Parsed {len(polygons)} polygon features")
    for f in folders:
        print(f"  {f.name}: {f.point_count} points, {f.polygon_count} polygons")

    # Serialize
    output_dir.mkdir(parents=True, exist_ok=True)

    points_geojson = points_to_geojson(points, color_map)
    points_path = output_dir / "mymap-points.geojson"
    points_path.write_text(json.dumps(points_geojson, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {points_path}")

    if polygons:
        poly_geojson = polygons_to_geojson(polygons)
        poly_path = output_dir / "mymap-polygons.geojson"
        poly_path.write_text(json.dumps(poly_geojson, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote {poly_path}")

    meta = folders_to_metadata(folders, len(points), len(polygons))
    meta_path = output_dir / "mymap-metadata.json"
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {meta_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
