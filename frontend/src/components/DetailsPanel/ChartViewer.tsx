import { useEffect, useState } from 'react';
import type { TractQuarterIndex } from '../../data/types';
import { TrendChart } from './TrendChart';
import { getSortedQuarterIds } from '../../data/formatters';

interface ChartViewerData {
  tractGeoid: string;
  quarters: string[];
  marketData: TractQuarterIndex;
}

export function ChartViewer() {
  const [data, setData] = useState<ChartViewerData | null>(null);
  const [tractGeoid, setTractGeoid] = useState<string>('');
  const [highlightedQuarter, setHighlightedQuarter] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('chartViewerData');
    if (stored) {
      try {
        const chartData: ChartViewerData = JSON.parse(stored);
        setData(chartData);
        setTractGeoid(chartData.tractGeoid);
      } catch (err) {
        console.error('Failed to parse chart data:', err);
      }
    }

    // Listen for tract changes from the main window
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TRACT_CHANGED') {
        setTractGeoid(event.data.tractGeoid);
        setHighlightedQuarter(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!data) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: '#666',
      }}>
        Loading chart data...
      </div>
    );
  }

  const quarters = getSortedQuarterIds(data.marketData);

  return (
    <div style={{
      padding: '16px',
      height: '100vh',
      overflow: 'auto',
      background: '#fff',
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem' }}>
          Median Sale Price Trend — {tractGeoid}
        </h2>
        <p style={{ margin: '0', fontSize: '0.85rem', color: '#666' }}>
          Click on chart nodes to highlight a quarter and fade others. Close this window to return to the main view.
        </p>
      </div>

      <TrendChart
        marketData={data.marketData}
        tractGeoid={tractGeoid}
        quarters={quarters}
        highlightedQuarter={highlightedQuarter}
        onHighlightQuarter={setHighlightedQuarter}
        isExpanded
      />
    </div>
  );
}
