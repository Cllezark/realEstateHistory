import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { TractQuarterIndex } from '../../data/types';
import { getTractRecord, formatQuarterLabel } from '../../data/formatters';

interface Props {
  marketData: TractQuarterIndex;
  tractGeoid: string;
  quarters: string[];
}

interface ChartPoint {
  quarter: string;
  median: number | null;
  label: string;
  isSuppressed: boolean;
  isPartial: boolean;
}

export function TrendChart({ marketData, tractGeoid, quarters }: Props) {
  const [activePoint, setActivePoint] = useState<ChartPoint | null>(null);

  const data: ChartPoint[] = useMemo(() => {
    return quarters.map(q => {
      const record = getTractRecord(marketData, q, tractGeoid);
      const isSuppressed = record?.suppressMedian ?? false;
      const isPartial = record?.partialQuarterFlag ?? false;
      return {
        quarter: q,
        median: isSuppressed ? null : (record?.medianSalePrice ?? null),
        label: formatQuarterLabel(q),
        isSuppressed,
        isPartial,
      };
    });
  }, [marketData, tractGeoid, quarters]);

  if (data.length === 0) {
    return <p style={{ color: '#888', fontSize: '0.8rem' }}>No historical data available.</p>;
  }

  const formatValue = (val: number | null) => {
    if (val == null) return 'Suppressed or missing';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(val);
  };

  // Mirror Task #13: pipe Recharts active-point data into React state so we can
  // render it in a fixed box below the chart instead of a cursor-following popup.
  // content={() => null} keeps <Tooltip> in the tree (enabling activePayload
  // computation) without rendering any visible tooltip element.
  const handleMouseMove = (chartState: unknown) => {
    const state = chartState as { activePayload?: Array<{ payload: ChartPoint }> };
    const point = state?.activePayload?.[0]?.payload ?? null;
    setActivePoint(point);
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 20, left: 8 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setActivePoint(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            interval="preserveStartEnd"
            height={30}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => {
              if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
              if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
              return `$${v}`;
            }}
            width={55}
          />
          {/* Tooltip kept in tree so Recharts computes activePayload; content is invisible */}
          <Tooltip content={() => null} cursor={{ stroke: '#ccc', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="median"
            stroke="#2b8cbe"
            strokeWidth={2}
            dot={{ r: 3, fill: '#2b8cbe' }}
            connectNulls={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Fixed info box below chart — mirrors the map's top-right hover tooltip */}
      <div style={{
        minHeight: '36px',
        padding: '4px 8px',
        background: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: '3px',
        fontSize: '0.78rem',
        color: '#333',
        marginTop: '2px',
      }}>
        {activePoint ? (
          <>
            <strong>{activePoint.label}</strong>: {formatValue(activePoint.median)}
            {activePoint.isSuppressed && (
              <em style={{ marginLeft: 4, color: '#888' }}>(suppressed)</em>
            )}
            {activePoint.isPartial && (
              <em style={{ marginLeft: 4, color: '#888' }}>(partial)</em>
            )}
          </>
        ) : (
          <span style={{ color: '#aaa' }}>Hover chart to see values</span>
        )}
      </div>
    </div>
  );
}
