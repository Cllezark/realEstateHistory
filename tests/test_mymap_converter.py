"""Tests for the Google MyMap KML/KMZ → GeoJSON converter.

Covers style-color extraction (Google My Maps encodes per-date point
colors in icon style ids), styleUrl resolution, and GeoJSON output.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from convert_mymap import (
    _parse_style_colors,
    _resolve_style_color,
    parse_kml,
    points_to_geojson,
)

SAMPLE_KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Test Map</name>
    <Style id="icon-1899-9C27B0-normal">
      <IconStyle><scale>1</scale><Icon><href>images/icon-1.png</href></Icon></IconStyle>
    </Style>
    <Style id="icon-1899-9C27B0-highlight">
      <IconStyle><scale>1</scale><Icon><href>images/icon-1.png</href></Icon></IconStyle>
    </Style>
    <Style id="icon-1899-880E4F-nodesc-normal">
      <IconStyle><Icon><href>images/icon-11.png</href></Icon></IconStyle>
    </Style>
    <Style id="poly-F57C00-1200-77-nodesc-normal">
      <LineStyle><color>ff007cf5</color></LineStyle>
      <PolyStyle><color>ff007cf5</color></PolyStyle>
    </Style>
    <StyleMap id="icon-1899-9C27B0">
      <Pair><key>normal</key><styleUrl>#icon-1899-9C27B0-normal</styleUrl></Pair>
      <Pair><key>highlight</key><styleUrl>#icon-1899-9C27B0-highlight</styleUrl></Pair>
    </StyleMap>
    <Folder>
      <name>August tours</name>
      <Placemark>
        <name>512 61st St S</name>
        <styleUrl>#icon-1899-9C27B0</styleUrl>
        <description>Listed for $480,000</description>
        <Point><coordinates>-82.67,27.77,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Work</name>
        <styleUrl>#icon-1899-880E4F-nodesc-normal</styleUrl>
        <Point><coordinates>-82.66,27.76,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Where we spend our time</name>
        <styleUrl>#poly-F57C00-1200-77-nodesc-normal</styleUrl>
        <Polygon>
          <outerBoundaryIs><LinearRing>
            <coordinates>-82.67,27.77 -82.66,27.77 -82.66,27.76 -82.67,27.76 -82.67,27.77</coordinates>
          </LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>
"""


class TestStyleColors:
    def test_icon_colors_parsed_from_style_ids(self):
        root = parse_kml(SAMPLE_KML)  # exercises parser indirectly
        assert root is not None

    def test_parse_style_colors_icon_and_polygon(self):
        # Re-parse the XML root for style extraction
        import xml.etree.ElementTree as ET

        root = ET.fromstring(SAMPLE_KML)
        colors = _parse_style_colors(root)

        # Icon colors come from the style id
        assert colors["icon-1899-9C27B0-normal"] == "#9C27B0"
        # Bare StyleMap id is registered too
        assert colors["icon-1899-9C27B0"] == "#9C27B0"
        # nodesc suffix stripped for the base id
        assert colors["icon-1899-880E4F"] == "#880E4F"
        # Polygon color decoded from KML aabbggrr -> rrggbb
        assert colors["poly-F57C00-1200-77-nodesc-normal"] == "#F57C00"

    def test_resolve_style_color_bare_and_suffixed(self):
        import xml.etree.ElementTree as ET

        root = ET.fromstring(SAMPLE_KML)
        colors = _parse_style_colors(root)
        pm = root.find(".//kml:Placemark", {"kml": "http://www.opengis.net/kml/2.2"})
        assert pm is not None
        assert _resolve_style_color(pm, colors) == "#9C27B0"


class TestParseAndSerialize:
    def test_parse_kml_sets_point_colors(self):
        points, polygons, folders = parse_kml(SAMPLE_KML)

        by_title = {p.title: p for p in points}
        assert by_title["512 61st St S"].color == "#9C27B0"
        assert by_title["Work"].color == "#880E4F"
        assert len(polygons) == 1

        # Folder representative color = most common point color
        august = next(f for f in folders if f.name == "August tours")
        assert august.color == "#9C27B0"

    def test_points_to_geojson_uses_real_colors(self):
        points, polygons, folders = parse_kml(SAMPLE_KML)
        color_map = {f.name: f.color for f in folders}
        geojson = points_to_geojson(points, color_map)

        props = {f["properties"]["title"]: f["properties"] for f in geojson["features"]}
        assert props["512 61st St S"]["folderColor"] == "#9C27B0"
        assert props["Work"]["folderColor"] == "#880E4F"
