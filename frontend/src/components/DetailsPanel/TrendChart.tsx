import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { TractQuarterIndex } from '../../data/types';
import { getTractRecord, formatQuarterLabel } from '../../data/formatters';

interface Props {
  marketData: TractQuarterIndex;
  tractGeoid: string;
  quarters: string[];
  highlightedQuarter?: string | null;
  onHighlightQuarter?: (quarter: string | null) => void;
  showExpandButton?: boolean;
  isExpanded?: boolean;
}

interface ChartPoint {
  quarter: string;
  median: number | null;
  label: string;
  isSuppressed: boolean;
  isPartial: boolean;
}

// ── TooltipBridge ────────────────────────────────────────────────────────────
// Defined outside TrendChart so React sees a stable component type (no
// remount on every parent render).  Recharts clones the element passed to
// <Tooltip content> and injects active/payload/label as props; we use
// useEffect to hand that data back to the parent AFTER render, which is the
// only way to call setState from a Recharts content prop without triggering
// "cannot update during render" warnings.

interface BridgeProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  onUpdate: (point: ChartPoint | null) => void;
}

function TooltipBridge({ active, payload, onUpdate }: BridgeProps) {
  const point = active && payload?.[0] ? payload[0].payload : null;

  // Depend on the quarter string, not the object reference, so this fires
  // only when the hovered data point actually changes.
  useEffect(() => {
    onUpdate(point);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.quarter ?? null, onUpdate]);

  return null; // nothing rendered inside the chart
}

// ── TrendChart ────────────────────────────────────────────────────────────────

export function TrendChart({
  marketData,
  tractGeoid,
  quarters,
  highlightedQuarter,
  onHighlightQuarter,
  showExpandButton,
  isExpanded,
}: Props) {
  const [activePoint, setActivePoint] = useState<ChartPoint | null>(null);

  const handleExpandClick = useCallback(() => {
    const chartData = {
      tractGeoid,
      quarters,
      marketData,
    };
    sessionStorage.setItem('chartViewerData', JSON.stringify(chartData));
    window.open('?view=chart-viewer', 'chart-viewer', 'width=1200,height=800,resizable=yes,scrollbars=yes');
  }, [tractGeoid, quarters, marketData]);

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

  // Stable callback so TooltipBridge's useEffect dep never changes identity.
  const handleTooltipUpdate = useCallback((point: ChartPoint | null) => {
    setActivePoint(point);
  }, []);

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

  const handleDotClick = (point: ChartPoint) => {
    if (onHighlightQuarter) {
      onHighlightQuarter(highlightedQuarter === point.quarter ? null : point.quarter);
    }
  };

  const chartHeight = isExpanded ? 500 : 180;

  return (
    <div>
      {showExpandButton && (
        <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleExpandClick}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              border: '1px solid #2b8cbe',
              background: '#2b8cbe',
              color: '#fff',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
            title="Open chart in expandable window"
          >
            Expand
          </button>
        </div>
      )}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 20, left: 8 }}>
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
          <Tooltip
            content={<TooltipBridge onUpdate={handleTooltipUpdate} />}
            cursor={{ stroke: '#ccc', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke="#2b8cbe"
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              const isHighlighted = !highlightedQuarter || payload.quarter === highlightedQuarter;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill="#2b8cbe"
                  opacity={isHighlighted ? 1 : 0.2}
                  cursor="pointer"
                  onClick={() => handleDotClick(payload)}
                  style={{ transition: 'opacity 0.2s' }}
                />
              );
            }}
            connectNulls={false}
            activeDot={{ r: 5 }}
            strokeOpacity={highlightedQuarter ? 0.2 : 1}
            style={{ transition: 'stroke-opacity 0.2s' }}
          />
          {highlightedQuarter && (
            <Line
              type="monotone"
              dataKey="median"
              stroke="#e31a1c"
              strokeWidth={3}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.quarter !== highlightedQuarter) return null;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill="#e31a1c"
                    opacity={1}
                    cursor="pointer"
                    onClick={() => handleDotClick(payload)}
                  />
                );
              }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {highlightedQuarter && (
        <div style={{ marginTop: '6px', textAlign: 'center' }}>
          <button
            onClick={() => onHighlightQuarter?.(null)}
            style={{
              padding: '2px 8px',
              fontSize: '0.7rem',
              border: '1px solid #e31a1c',
              background: '#fff',
              color: '#e31a1c',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            Clear highlight
          </button>
        </div>
      )}

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
        {highlightedQuarter ? (
          <>
            <strong>Highlighted: {data.find(d => d.quarter === highlightedQuarter)?.label}</strong>
            {' — '}
            {formatValue(data.find(d => d.quarter === highlightedQuarter)?.median ?? null)}
            {' (click dots to highlight different quarters)'}
          </>
        ) : activePoint ? (
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
          <span style={{ color: '#aaa' }}>Hover chart to see values, click dots to highlight</span>
        )}
      </div>
    </div>
  );
}
