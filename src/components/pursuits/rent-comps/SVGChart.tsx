'use client';

import { useMemo } from 'react';

// ============================================================
// Reusable inline SVG line chart — no external deps
// ============================================================

export interface ChartSeries {
    label: string;
    color: string;
    data: { date: string; value: number }[];
}

interface Props {
    series: ChartSeries[];
    width?: number;
    height?: number;
    yLabel?: string;
    formatY?: (v: number) => string;
}

export default function SVGChart({ series, width = 700, height = 260, yLabel, formatY = v => `$${v.toLocaleString()}` }: Props) {
    const padding = { top: 20, right: 20, bottom: 40, left: 65 };
    const w = width - padding.left - padding.right;
    const h = height - padding.top - padding.bottom;

    const computed = useMemo(() => {
        const allPts = series.flatMap(s => s.data);
        if (allPts.length === 0) return null;

        const dates = allPts.map(p => new Date(p.date).getTime());
        const vals = allPts.map(p => p.value);
        const minDate = Math.min(...dates);
        const maxDate = Math.max(...dates);
        const minVal = Math.min(...vals);
        const maxVal = Math.max(...vals);
        const valRange = maxVal - minVal || 1;
        const dateRange = maxDate - minDate || 1;
        const yPad = valRange * 0.1;

        const scaleX = (d: string) => ((new Date(d).getTime() - minDate) / dateRange) * w;
        const scaleY = (v: number) => h - ((v - (minVal - yPad)) / (valRange + yPad * 2)) * h;

        // Y-axis ticks (5 ticks)
        const yTicks: number[] = [];
        const step = valRange / 4;
        for (let i = 0; i < 5; i++) yTicks.push(Math.round(minVal + step * i));

        // X-axis ticks (labels)
        const uniqueMonths = [...new Set(allPts.map(p => p.date.slice(0, 7)))].sort();
        const xLabels = uniqueMonths.length <= 12 ? uniqueMonths : uniqueMonths.filter((_, i) => i % Math.ceil(uniqueMonths.length / 8) === 0);

        const paths = series.map(s => {
            const sorted = [...s.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            if (sorted.length === 0) return '';
            return sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.date).toFixed(1)},${scaleY(p.value).toFixed(1)}`).join(' ');
        });

        return { paths, yTicks, xLabels, scaleX, scaleY, minVal, yPad, valRange };
    }, [series, w, h]);

    if (!computed || series.every(s => s.data.length === 0)) {
        return <p className="text-sm text-[#7A8599] text-center py-8">No trend data available</p>;
    }

    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[750px]" style={{ minWidth: 280 }}>
                {/* Grid lines */}
                {computed.yTicks.map((tick, i) => {
                    const y = computed.scaleY(tick);
                    return (
                        <g key={i}>
                            <line x1={padding.left} x2={width - padding.right} y1={padding.top + y} y2={padding.top + y} stroke="#F4F5F7" strokeWidth={1} />
                            <text x={padding.left - 8} y={padding.top + y + 4} textAnchor="end" fill="#7A8599" fontSize={10}>{formatY(tick)}</text>
                        </g>
                    );
                })}

                {/* X-axis labels */}
                {computed.xLabels.map((label, i) => {
                    const x = computed.scaleX(label + '-15');
                    return (
                        <text key={i} x={padding.left + x} y={height - 8} textAnchor="middle" fill="#7A8599" fontSize={10}>
                            {new Date(label + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                        </text>
                    );
                })}

                {/* Y-axis label */}
                {yLabel && (
                    <text x={12} y={height / 2} textAnchor="middle" fill="#7A8599" fontSize={10} transform={`rotate(-90, 12, ${height / 2})`}>{yLabel}</text>
                )}

                {/* Lines */}
                {computed.paths.map((path, i) => (
                    <path key={i} d={path} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                        transform={`translate(${padding.left}, ${padding.top})`} />
                ))}
            </svg>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
                {series.filter(s => s.data.length > 0).map((s, i) => (
                    <div key={i} className="flex items-center gap-1 text-[11px] sm:text-xs text-[#4A5568]">
                        <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="truncate max-w-[80px] sm:max-w-none">{s.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
