import { describe, it, expect } from 'vitest';
import { parseMyMapKml } from '../../data/mymap-kml-parser';

// jsdom (vitest environment) provides DOMParser, which handles XML.
const SAMPLE_KML = `<?xml version="1.0" encoding="UTF-8"?>
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
</kml>`;

describe('parseMyMapKml style colors', () => {
  it('parses points with their My Maps icon colors', () => {
    const result = parseMyMapKml(SAMPLE_KML);

    expect(result.error).toBeNull();
    expect(result.points).not.toBeNull();

    const props = Object.fromEntries(
      result.points!.features.map((f) => [f.properties.title, f.properties]),
    );

    // Icon color extracted from the style id (bare StyleMap reference)
    expect(props['512 61st St S'].folderColor).toBe('#9C27B0');
    expect(props['512 61st St S'].price).toBe(480000);
    // nodesc style resolved through the -normal suffix
    expect(props['Work'].folderColor).toBe('#880E4F');
  });

  it('uses the dominant point color for folder metadata', () => {
    const result = parseMyMapKml(SAMPLE_KML);

    const august = result.metadata!.folders.find((f) => f.name === 'August tours');
    expect(august?.color).toBe('#9C27B0');
    expect(august?.pointCount).toBe(2);
  });

  it('parses polygons and their folder', () => {
    const result = parseMyMapKml(SAMPLE_KML);

    expect(result.polygons?.features).toHaveLength(1);
    expect(result.polygons!.features[0].properties.title).toBe('Where we spend our time');
    expect(result.polygons!.features[0].properties.folder).toBe('August tours');
  });
});
