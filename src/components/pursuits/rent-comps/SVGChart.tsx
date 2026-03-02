'use client';

import { useMemo, useState, useRef, useCallback } from 'react';

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
    const svgRef = useRef<SVGSVGElement>(null);
    const [hoverX, setHoverX] = useState<number | null>(null);

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
        const unscaleX = (px: number) => new Date(minDate + (px / w) * dateRange);

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

        // Pre-sort each series by date for hover lookup
        const sortedSeries = series.map(s => [...s.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

        return { paths, yTicks, xLabels, scaleX, scaleY, unscaleX, minVal, yPad, valRange, dateRange, minDate, sortedSeries };
    }, [series, w, h]);

    // Find nearest data point for each series at a given x position
    const hoverData = useMemo(() => {
        if (hoverX === null || !computed) return null;
        const targetDate = computed.unscaleX(hoverX);
        const targetTime = targetDate.getTime();

        const points = computed.sortedSeries.map((sortedData, si) => {
            if (sortedData.length === 0) return null;
            // Binary-ish search for nearest point
            let nearest = sortedData[0];
            let minDist = Math.abs(new Date(nearest.date).getTime() - targetTime);
            for (const pt of sortedData) {
                const dist = Math.abs(new Date(pt.date).getTime() - targetTime);
                if (dist < minDist) { nearest = pt; minDist = dist; }
            }
            // Only show if within reasonable range (30 days)
            if (minDist > 30 * 24 * 60 * 60 * 1000) return null;
            return { ...nearest, seriesIndex: si, y: computed.scaleY(nearest.value), x: computed.scaleX(nearest.date) };
        });

        const dateLabel = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
        return { points, dateLabel };
    }, [hoverX, computed]);

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current || !computed) return;
        const rect = svgRef.current.getBoundingClientRect();
        const svgX = ((e.clientX - rect.left) / rect.width) * width;
        const chartX = svgX - padding.left;
        if (chartX >= 0 && chartX <= w) {
            setHoverX(chartX);
        } else {
            setHoverX(null);
        }
    }, [width, w, padding.left, computed]);

    const handleMouseLeave = useCallback(() => setHoverX(null), []);

    if (!computed || series.every(s => s.data.length === 0)) {
        return <p className="text-sm text-[#7A8599] text-center py-8">No trend data available</p>;
    }

    return (
        <div className="overflow-x-auto">
            <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[750px]" style={{ minWidth: 280 }}
                onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
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

                {/* Hover crosshair + dots + tooltip */}
                {hoverX !== null && hoverData && (
                    <g>
                        {/* Vertical line */}
                        <line
                            x1={padding.left + hoverX} x2={padding.left + hoverX}
                            y1={padding.top} y2={padding.top + h}
                            stroke="#CBD2DC" strokeWidth={1} strokeDasharray="3,3"
                        />
                        {/* Dots on each series */}
                        {hoverData.points.map((pt, i) => pt && (
                            <circle key={i} cx={padding.left + pt.x} cy={padding.top + pt.y} r={4}
                                fill={series[pt.seriesIndex].color} stroke="white" strokeWidth={2} />
                        ))}
                        {/* Tooltip box */}
                        {(() => {
                            const validPts = hoverData.points.filter(p => p !== null);
                            if (validPts.length === 0) return null;
                            const tooltipW = 140;
                            const tooltipH = 16 + validPts.length * 16 + 8;
                            // Position tooltip to left or right of crosshair
                            const rawX = padding.left + hoverX + 10;
                            const tooltipX = rawX + tooltipW > width - 5 ? padding.left + hoverX - tooltipW - 10 : rawX;
                            const tooltipY = padding.top + 5;
                            return (
                                <g>
                                    <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={6}
                                        fill="white" stroke="#E2E5EA" strokeWidth={1} filter="drop-shadow(0 1px 3px rgba(0,0,0,0.08))" />
                                    <text x={tooltipX + 8} y={tooltipY + 14} fill="#7A8599" fontSize={10} fontWeight={500}>{hoverData.dateLabel}</text>
                                    {validPts.map((pt, i) => (
                                        <g key={i}>
                                            <circle cx={tooltipX + 12} cy={tooltipY + 28 + i * 16} r={3} fill={series[pt!.seriesIndex].color} />
                                            <text x={tooltipX + 20} y={tooltipY + 32 + i * 16} fill="#4A5568" fontSize={10}>
                                                <tspan>{series[pt!.seriesIndex].label.slice(0, 12)}</tspan>
                                                <tspan fontWeight={600} dx={4}>{formatY(pt!.value)}</tspan>
                                            </text>
                                        </g>
                                    ))}
                                </g>
                            );
                        })()}
                    </g>
                )}

                {/* Invisible hover target */}
                <rect x={padding.left} y={padding.top} width={w} height={h} fill="transparent" style={{ cursor: 'crosshair' }} />
            </svg>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
                {series.filter(s => s.data.length > 0).map((s, i) => (
                    <div key={i} className="flex items-center gap-1 text-[11px] sm:text-xs text-[#4A5568]">
                        <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="truncate max-w-[80px] sm:max-none">{s.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
