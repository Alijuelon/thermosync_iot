'use client';

import React from 'react';
import type { TelemetryPoint } from '@/lib/iot-engine';

interface SparklineChartProps {
  data: TelemetryPoint[];
  accentColor?: string;
  height?: number;
}

export function SparklineChart({
  data,
  accentColor = '#38BDF8',
  height = 56,
}: SparklineChartProps) {
  if (!data || data.length < 2) {
    return (
      <div className="h-12 flex items-center justify-center text-xs text-slate-400 dark:text-zinc-500">
        Menunggu data telemetri...
      </div>
    );
  }

  const width = 600;
  const padX = 4;
  const padY = 8;

  const temps = data.map((d) => d.temp);
  const minTemp = Math.min(...temps) - 0.4;
  const maxTemp = Math.max(...temps) + 0.4;
  const range = Math.max(0.5, maxTemp - minTemp);

  const points = data.map((point, idx) => {
    const x =
      padX + (idx / Math.max(1, data.length - 1)) * (width - padX * 2);
    const y =
      height -
      padY -
      ((point.temp - minTemp) / range) * (height - padY * 2);
    return { x, y, ...point };
  });

  const polylinePoints = points
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `M ${points[0].x.toFixed(1)} ${height} L ${points
    .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' L ')} L ${points[points.length - 1].x.toFixed(1)} ${height} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full block overflow-visible"
        style={{ height }}
        role="img"
        aria-label="Tren suhu ruangan 6 jam terakhir"
      >
        <defs>
          <linearGradient
            id={`spark-${accentColor.replace('#', '')}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d={areaPath}
          fill={`url(#spark-${accentColor.replace('#', '')})`}
        />
        <polyline
          fill="none"
          stroke={accentColor}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylinePoints}
        />
      </svg>
      <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-zinc-800/80 flex items-center justify-between gap-1.5 text-[10px] sm:text-xs">
        <span className="inline-flex items-center rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 px-2.5 py-1 font-mono tabular-nums font-medium text-slate-600 dark:text-zinc-300 whitespace-nowrap shrink-0">
          {data[0]?.time} · {data[0]?.temp.toFixed(1)}°C
        </span>
        <span className="inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-zinc-800/90 border border-slate-200/70 dark:border-zinc-700/70 px-2.5 py-1 font-semibold text-slate-600 dark:text-zinc-300 whitespace-nowrap truncate">
          Tren Suhu 6 Jam
        </span>
        <span className="inline-flex items-center rounded-lg bg-sky-500/10 border border-sky-500/25 px-2.5 py-1 font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap shrink-0">
          {data[data.length - 1]?.time} · {data[data.length - 1]?.temp.toFixed(1)}°C
        </span>
      </div>
    </div>
  );
}
