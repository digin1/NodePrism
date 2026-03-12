'use client';

import { useState, useMemo } from 'react';

export interface HeatmapDataPoint {
  hour: number;
  day: string;
  value: number;
}

interface HeatmapChartProps {
  data: HeatmapDataPoint[];
  className?: string;
  cellSize?: number;
  gap?: number;
}

function interpolateColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgb(34, 197, 94)'; // green when all values equal

  const ratio = (value - min) / (max - min);

  // Green (low) -> Yellow (medium) -> Red (high)
  let r: number, g: number, b: number;
  if (ratio < 0.5) {
    // Green to Yellow
    const t = ratio * 2;
    r = Math.round(34 + (234 - 34) * t);
    g = Math.round(197 + (179 - 197) * t);
    b = Math.round(94 + (8 - 94) * t);
  } else {
    // Yellow to Red
    const t = (ratio - 0.5) * 2;
    r = Math.round(234 + (239 - 234) * t);
    g = Math.round(179 + (68 - 179) * t);
    b = Math.round(8 + (68 - 8) * t);
  }

  return `rgb(${r}, ${g}, ${b})`;
}

export function HeatmapChart({
  data,
  className,
  cellSize = 32,
  gap = 2,
}: HeatmapChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    hour: number;
    day: string;
    value: number;
  } | null>(null);

  const { days, hours, valueMap, min, max } = useMemo(() => {
    const daySet = new Set<string>();
    let minVal = Infinity;
    let maxVal = -Infinity;
    const map = new Map<string, number>();

    for (const point of data) {
      daySet.add(point.day);
      const key = `${point.day}-${point.hour}`;
      map.set(key, point.value);
      if (point.value < minVal) minVal = point.value;
      if (point.value > maxVal) maxVal = point.value;
    }

    // Preserve insertion order for days
    const uniqueDays = Array.from(daySet);
    const hourRange = Array.from({ length: 24 }, (_, i) => i);

    return {
      days: uniqueDays,
      hours: hourRange,
      valueMap: map,
      min: minVal === Infinity ? 0 : minVal,
      max: maxVal === -Infinity ? 0 : maxVal,
    };
  }, [data]);

  if (!data || data.length === 0) return null;

  const labelWidth = 80;
  const headerHeight = 24;
  const gridWidth = hours.length * (cellSize + gap) - gap;
  const gridHeight = days.length * (cellSize + gap) - gap;

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-block' }}>
      <svg
        width={labelWidth + gridWidth + 16}
        height={headerHeight + gridHeight + 16}
        style={{ overflow: 'visible' }}
      >
        {/* Hour labels (X axis) */}
        {hours.map((hour) => (
          <text
            key={`h-${hour}`}
            x={labelWidth + hour * (cellSize + gap) + cellSize / 2}
            y={headerHeight - 4}
            textAnchor="middle"
            fontSize={10}
            fill="#9ca3af"
          >
            {hour}
          </text>
        ))}

        {/* Day labels (Y axis) */}
        {days.map((day, dayIdx) => (
          <text
            key={`d-${day}`}
            x={labelWidth - 8}
            y={headerHeight + dayIdx * (cellSize + gap) + cellSize / 2 + 4}
            textAnchor="end"
            fontSize={11}
            fill="#9ca3af"
          >
            {day}
          </text>
        ))}

        {/* Heatmap cells */}
        {days.map((day, dayIdx) =>
          hours.map((hour) => {
            const key = `${day}-${hour}`;
            const value = valueMap.get(key) ?? 0;
            const color = interpolateColor(value, min, max);

            return (
              <rect
                key={key}
                x={labelWidth + hour * (cellSize + gap)}
                y={headerHeight + dayIdx * (cellSize + gap)}
                width={cellSize}
                height={cellSize}
                rx={3}
                fill={color}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  const parent = (e.target as SVGRectElement).closest('div')?.getBoundingClientRect();
                  if (parent) {
                    setTooltip({
                      x: rect.left - parent.left + cellSize / 2,
                      y: rect.top - parent.top - 8,
                      hour,
                      day,
                      value,
                    });
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: '#1f2937',
            color: '#f3f4f6',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {tooltip.day} {tooltip.hour}:00 — {tooltip.value}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
          paddingLeft: labelWidth,
          fontSize: 11,
          color: '#9ca3af',
        }}
      >
        <span>Low</span>
        <div
          style={{
            width: 120,
            height: 10,
            borderRadius: 3,
            background: `linear-gradient(to right, rgb(34,197,94), rgb(234,179,8), rgb(239,68,68))`,
          }}
        />
        <span>High</span>
      </div>
    </div>
  );
}
