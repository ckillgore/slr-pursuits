'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import SVGChart, { ChartSeries } from './SVGChart';
import type { HellodataUnit, HellodataConcession } from '@/types';
import type { PropertyMetrics } from './types';
import { getAverageAskingRent, getAverageEffectiveRent } from '@/lib/calculations/hellodataCalculations';

const COMP_COLORS = ['#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

// ============================================================
// Rent Trends Section
// ============================================================
export function RentTrendsSection({ comps }: { comps: PropertyMetrics[] }) {
    const [granularity, setGranularity] = useState<'month' | 'week'>('month');
    const [metric, setMetric] = useState<'asking' | 'effective'>('asking');
    const [bedFilter, setBedFilter] = useState<number | 'all'>('all');

    const allBeds = useMemo(() => {
        const beds = new Set<number>();
        comps.forEach(c => c.units.forEach((u: HellodataUnit) => { if (u.bed !== null) beds.add(u.bed); }));
        return [...beds].sort((a, b) => a - b);
    }, [comps]);

    const series = useMemo((): ChartSeries[] => {
        return comps.map((comp, i) => {
            const units = bedFilter === 'all' ? comp.units : comp.units.filter((u: HellodataUnit) => u.bed === bedFilter);
            const buckets: Record<string, number[]> = {};

            units.forEach((u: HellodataUnit) => {
                if (!u.history || !Array.isArray(u.history)) return;
                (u.history as { from_date: string; price?: number | null; effective_price?: number | null }[]).forEach(h => {
                    if (!h.from_date) return;
                    const val = metric === 'asking' ? h.price : h.effective_price;
                    if (val === null || val === undefined) return;
                    const key = granularity === 'month' ? h.from_date.slice(0, 7) : getWeekKey(h.from_date);
                    if (!buckets[key]) buckets[key] = [];
                    buckets[key].push(val);
                });
            });

            const data = Object.entries(buckets)
                .map(([date, vals]) => ({ date: date + (granularity === 'month' ? '-15' : ''), value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return { label: comp.name, color: COMP_COLORS[i % COMP_COLORS.length], data };
        });
    }, [comps, granularity, metric, bedFilter]);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Rent Trends</h3>
                    <p className="text-xs text-[var(--text-muted)]">Historical rent pricing from unit listing data.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select value={bedFilter} onChange={e => setBedFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="text-[11px] sm:text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
                        <option value="all">All Beds</option>
                        {allBeds.map(b => <option key={b} value={b}>{b === 0 ? 'Studio' : `${b} BR`}</option>)}
                    </select>
                    <select value={metric} onChange={e => setMetric(e.target.value as 'asking' | 'effective')} className="text-[11px] sm:text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
                        <option value="asking">Asking</option>
                        <option value="effective">Effective</option>
                    </select>
                    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                        {(['month', 'week'] as const).map(g => (
                            <button key={g} onClick={() => setGranularity(g)} className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium ${granularity === g ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}>
                                {g === 'month' ? 'Mo' : 'Wk'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] p-2 sm:p-4">
                <SVGChart series={series} yLabel={metric === 'asking' ? 'Asking Rent' : 'Effective Rent'} />
            </div>
        </div>
    );
}

function getWeekKey(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day;
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().slice(0, 10);
}

// ============================================================
// Bubble Chart Section
// ============================================================
export function BubbleChartSection({ comps }: { comps: PropertyMetrics[] }) {
    const [groupBy, setGroupBy] = useState<'property' | 'type' | 'floorplan'>('property');
    const [yAxis, setYAxis] = useState<'total' | 'psf'>('total');
    const [rentType, setRentType] = useState<'asking' | 'effective'>('asking');
    const [hoveredBubble, setHoveredBubble] = useState<number | null>(null);
    const [selectedBubble, setSelectedBubble] = useState<number | null>(null);

    const bubbles = useMemo(() => {
        const results: { label: string; sqft: number; rent: number; count: number; color: string; units: HellodataUnit[] }[] = [];

        if (groupBy === 'property') {
            comps.forEach((c, i) => {
                const units = c.units.filter((u: HellodataUnit) => u.sqft && (rentType === 'asking' ? u.price : u.effective_price));
                if (units.length === 0) return;
                const avgSqft = units.reduce((s: number, u: HellodataUnit) => s + (u.sqft ?? 0), 0) / units.length;
                const avgRent = (rentType === 'asking' ? getAverageAskingRent(units) : getAverageEffectiveRent(units)) ?? 0;
                results.push({ label: c.name, sqft: Math.round(avgSqft), rent: yAxis === 'psf' && avgSqft > 0 ? avgRent / avgSqft : avgRent, count: c.property.number_units ?? units.length, color: COMP_COLORS[i % COMP_COLORS.length], units });
            });
        } else if (groupBy === 'type') {
            const bedGroups: Record<number, HellodataUnit[]> = {};
            comps.forEach(c => c.units.forEach((u: HellodataUnit) => { if (u.bed !== null) { if (!bedGroups[u.bed]) bedGroups[u.bed] = []; bedGroups[u.bed].push(u); } }));
            Object.entries(bedGroups).forEach(([bed, units]) => {
                const valid = units.filter(u => u.sqft && (rentType === 'asking' ? u.price : u.effective_price));
                if (valid.length === 0) return;
                const avgSqft = valid.reduce((s, u) => s + (u.sqft ?? 0), 0) / valid.length;
                const avgRent = (rentType === 'asking' ? getAverageAskingRent(valid) : getAverageEffectiveRent(valid)) ?? 0;
                const bedNum = Number(bed);
                results.push({ label: bedNum === 0 ? 'Studio' : `${bed} BR`, sqft: Math.round(avgSqft), rent: yAxis === 'psf' && avgSqft > 0 ? avgRent / avgSqft : avgRent, count: valid.length, color: COMP_COLORS[bedNum % COMP_COLORS.length], units: valid });
            });
        } else {
            comps.forEach((c, ci) => {
                const fpGroups: Record<string, HellodataUnit[]> = {};
                c.units.forEach((u: HellodataUnit) => { const fp = u.floorplan_name || 'Unknown'; if (!fpGroups[fp]) fpGroups[fp] = []; fpGroups[fp].push(u); });
                Object.entries(fpGroups).forEach(([fp, units]) => {
                    const valid = units.filter(u => u.sqft && (rentType === 'asking' ? u.price : u.effective_price));
                    if (valid.length === 0) return;
                    const avgSqft = valid.reduce((s, u) => s + (u.sqft ?? 0), 0) / valid.length;
                    const avgRent = (rentType === 'asking' ? getAverageAskingRent(valid) : getAverageEffectiveRent(valid)) ?? 0;
                    results.push({ label: `${c.name.slice(0, 8)}/${fp}`, sqft: Math.round(avgSqft), rent: yAxis === 'psf' && avgSqft > 0 ? avgRent / avgSqft : avgRent, count: valid.length, color: COMP_COLORS[ci % COMP_COLORS.length], units: valid });
                });
            });
        }
        return results;
    }, [comps, groupBy, yAxis, rentType]);

    // Reset selection when filters change
    useMemo(() => { setSelectedBubble(null); }, [groupBy, yAxis, rentType]);

    const maxRent = Math.max(...bubbles.map(b => b.rent), 1);
    const maxSqft = Math.max(...bubbles.map(b => b.sqft), 1);
    const maxCount = Math.max(...bubbles.map(b => b.count), 1);
    const W = 700, H = 300, pad = { top: 20, right: 20, bottom: 40, left: 65 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const getBubblePos = (b: typeof bubbles[0]) => ({
        cx: pad.left + (b.sqft / maxSqft) * cw * 0.9 + cw * 0.05,
        cy: pad.top + (1 - b.rent / maxRent) * ch * 0.9 + ch * 0.05,
        r: Math.max(6, Math.min(30, (b.count / maxCount) * 25 + 5)),
    });

    const drilldownUnits = selectedBubble !== null && bubbles[selectedBubble]
        ? bubbles[selectedBubble].units
            .filter((u: HellodataUnit) => u.sqft && (u.price || u.effective_price))
            .sort((a: HellodataUnit, b: HellodataUnit) => (a.bed ?? 99) - (b.bed ?? 99) || (a.sqft ?? 0) - (b.sqft ?? 0))
        : [];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Rent vs. Size</h3>
                    <p className="text-xs text-[var(--text-muted)]">Bubble size = unit count. Click a bubble to see individual units.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select value={groupBy} onChange={e => setGroupBy(e.target.value as 'property' | 'type' | 'floorplan')} className="text-[11px] sm:text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
                        <option value="property">Property</option>
                        <option value="type">Bed Type</option>
                        <option value="floorplan">Floorplan</option>
                    </select>
                    <select value={rentType} onChange={e => setRentType(e.target.value as 'asking' | 'effective')} className="text-[11px] sm:text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
                        <option value="asking">Asking</option>
                        <option value="effective">Effective</option>
                    </select>
                    <select value={yAxis} onChange={e => setYAxis(e.target.value as 'total' | 'psf')} className="text-[11px] sm:text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
                        <option value="total">Total</option>
                        <option value="psf">Per SF</option>
                    </select>
                </div>
            </div>
            <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] p-2 sm:p-4 overflow-x-auto">
                {bubbles.length === 0 ? <p className="text-sm text-center text-[var(--text-muted)] py-8">No data</p> : (
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[750px]" style={{ minWidth: 280 }}
                        onMouseLeave={() => setHoveredBubble(null)}>
                        {/* Grid */}
                        {[0, 1, 2, 3, 4].map(i => { const y = pad.top + ch * (1 - i / 4); const val = (maxRent * i) / 4; return (<g key={i}><line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="var(--bg-elevated)" /><text x={pad.left - 8} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize={10}>{yAxis === 'psf' ? `$${val.toFixed(2)}` : `$${Math.round(val).toLocaleString()}`}</text></g>); })}
                        {/* Bubbles */}
                        {bubbles.map((b, i) => {
                            const { cx, cy, r } = getBubblePos(b);
                            const isHovered = hoveredBubble === i;
                            const isSelected = selectedBubble === i;
                            const isDimmed = (hoveredBubble !== null || selectedBubble !== null) && !isHovered && !isSelected;
                            return (<g key={i} style={{ cursor: 'pointer' }}
                                onMouseEnter={() => setHoveredBubble(i)}
                                onClick={() => setSelectedBubble(selectedBubble === i ? null : i)}>
                                <circle cx={cx} cy={cy} r={r} fill={b.color} fillOpacity={isDimmed ? 0.15 : 0.6} stroke={b.color}
                                    strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.5} style={{ transition: 'all 0.15s ease' }} />
                                {isSelected && <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke={b.color} strokeWidth={1.5} strokeDasharray="3,2" opacity={0.6} />}
                                <text x={cx} y={cy - r - 4} textAnchor="middle" fill="var(--text-secondary)" fontSize={9} fontWeight={500}
                                    opacity={isDimmed ? 0.25 : 1}>{b.label}</text>
                                {/* Larger hit area */}
                                <circle cx={cx} cy={cy} r={Math.max(r + 8, 18)} fill="transparent" />
                            </g>);
                        })}
                        {/* Hover tooltip */}
                        {hoveredBubble !== null && bubbles[hoveredBubble] && (() => {
                            const b = bubbles[hoveredBubble];
                            const { cx, cy } = getBubblePos(b);
                            const tw = 155, th = 70;
                            const tx = cx + tw + 15 > W ? cx - tw - 10 : cx + 15;
                            const ty = Math.max(pad.top, Math.min(cy - th / 2, H - pad.bottom - th));
                            const fmtR = yAxis === 'psf' ? `$${b.rent.toFixed(2)}/sf` : `$${Math.round(b.rent).toLocaleString()}`;
                            return (
                                <g style={{ pointerEvents: 'none' }}>
                                    <rect x={tx} y={ty} width={tw} height={th} rx={6}
                                        fill="var(--bg-card)" stroke="var(--border)" strokeWidth={1} filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
                                    <circle cx={tx + 10} cy={ty + 14} r={4} fill={b.color} />
                                    <text x={tx + 18} y={ty + 18} fill="var(--text-primary)" fontSize={11} fontWeight={600}>{b.label.slice(0, 20)}</text>
                                    <text x={tx + 10} y={ty + 34} fill="var(--text-muted)" fontSize={10}>Sqft: <tspan fill="var(--text-primary)" fontWeight={500}>{b.sqft.toLocaleString()} ft²</tspan></text>
                                    <text x={tx + 10} y={ty + 48} fill="var(--text-muted)" fontSize={10}>{rentType === 'asking' ? 'Asking' : 'Eff.'}: <tspan fill="var(--text-primary)" fontWeight={500}>{fmtR}</tspan></text>
                                    <text x={tx + 10} y={ty + 62} fill="var(--text-muted)" fontSize={10}>Units: <tspan fill="var(--text-primary)" fontWeight={500}>{b.count}</tspan></text>
                                </g>
                            );
                        })()}
                        {/* X label */}
                        <text x={W / 2} y={H - 4} textAnchor="middle" fill="var(--text-muted)" fontSize={10}>Avg Sqft</text>
                    </svg>
                )}
            </div>

            {/* Drilldown Detail Table */}
            {selectedBubble !== null && bubbles[selectedBubble] && drilldownUnits.length > 0 && (
                <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] overflow-hidden animate-fade-in">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bubbles[selectedBubble].color }} />
                            <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                                {bubbles[selectedBubble].label} — {drilldownUnits.length} Unit{drilldownUnits.length !== 1 ? 's' : ''}
                            </h4>
                        </div>
                        <button onClick={() => setSelectedBubble(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium">✕ Close</button>
                    </div>
                    <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                        <table className="w-full text-xs min-w-[500px]">
                            <thead className="sticky top-0 bg-[var(--bg-card)] z-10">
                                <tr className="border-b border-[var(--border)]">
                                    <th className="text-left py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase">Floorplan</th>
                                    <th className="text-center py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase">Bed/Bath</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase">Sqft</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase">Asking</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase">Effective</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase">$/SF</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drilldownUnits.map((u: HellodataUnit, i: number) => {
                                    const psf = u.sqft && u.price ? u.price / u.sqft : null;
                                    return (
                                        <tr key={i} className="border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)]">
                                            <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{u.floorplan_name || '—'}</td>
                                            <td className="py-2 px-3 text-center text-[var(--text-secondary)]">
                                                {u.bed !== null ? (u.bed === 0 ? 'Studio' : `${u.bed}`) : '—'}
                                                {u.bath !== null ? `/${u.bath}` : ''}
                                            </td>
                                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{u.sqft?.toLocaleString() ?? '—'}</td>
                                            <td className="py-2 px-3 text-right tabular-nums font-medium text-[var(--text-primary)]">{u.price ? `$${u.price.toLocaleString()}` : '—'}</td>
                                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{u.effective_price ? `$${u.effective_price.toLocaleString()}` : '—'}</td>
                                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-muted)]">{psf ? `$${psf.toFixed(2)}` : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}



// ============================================================
// Occupancy Trends — derived from availability_periods
// ============================================================
export function OccupancySection({ comps }: { comps: PropertyMetrics[] }) {
    // Derive occupancy over time from unit availability_periods
    const { series, summaryData } = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        // Build weekly occupancy for each comp using availability_periods
        const seriesData: ChartSeries[] = comps.map((c, ci) => {
            const totalUnits = c.property.number_units ?? 0;
            if (totalUnits === 0) return { label: c.name, color: COMP_COLORS[ci % COMP_COLORS.length], data: [] };

            // Collect all enter/exit dates across all units to build a timeline
            const allPeriods: { enter: string; exit: string | null }[] = [];
            c.units.forEach((u: HellodataUnit) => {
                (u.availability_periods || []).forEach(ap => {
                    if (ap.enter_market) {
                        allPeriods.push({ enter: ap.enter_market, exit: ap.exit_market ?? null });
                    }
                });
            });

            if (allPeriods.length === 0) return { label: c.name, color: COMP_COLORS[ci % COMP_COLORS.length], data: [] };

            // Find date range
            const dates = allPeriods.map(p => p.enter);
            const minDate = new Date(dates.sort()[0]);
            const maxDate = now;

            // Build weekly snapshots
            const weeklyData: { date: string; value: number }[] = [];
            const current = new Date(minDate);
            // Start from the first Monday
            current.setDate(current.getDate() - current.getDay() + 1);

            while (current <= maxDate) {
                const weekStr = current.toISOString().slice(0, 10);
                // Count units on market during this week
                let onMarket = 0;
                for (const period of allPeriods) {
                    const entered = period.enter <= weekStr;
                    const notExited = !period.exit || period.exit >= weekStr;
                    if (entered && notExited) onMarket++;
                }
                const leasedPct = ((totalUnits - onMarket) / totalUnits) * 100;
                weeklyData.push({ date: weekStr, value: Math.round(leasedPct * 10) / 10 });
                current.setDate(current.getDate() + 7);
            }

            // Keep last 52 weeks max for performance
            return {
                label: c.name,
                color: COMP_COLORS[ci % COMP_COLORS.length],
                data: weeklyData.slice(-52),
            };
        });

        // Summary cards — current snapshot
        const summary = comps.map(c => {
            const totalUnits = c.property.number_units ?? 0;
            let onMarketNow = 0;
            let availableNext7Days = 0;
            c.units.forEach((u: HellodataUnit) => {
                (u.availability_periods || []).forEach(ap => {
                    const entered = !ap.enter_market || ap.enter_market <= todayStr;
                    const notExited = !ap.exit_market || ap.exit_market >= todayStr;
                    if (entered && notExited) onMarketNow++;

                    const entering7 = !ap.enter_market || ap.enter_market <= sevenDaysOut;
                    const notExited7 = !ap.exit_market || ap.exit_market >= todayStr;
                    if (entering7 && notExited7) availableNext7Days++;
                });
            });

            const leasedPct = totalUnits > 0 ? ((totalUnits - availableNext7Days) / totalUnits) * 100 : null;
            const exposurePct = totalUnits > 0 ? (onMarketNow / totalUnits) * 100 : null;

            return {
                name: c.name,
                leased: leasedPct !== null ? leasedPct.toFixed(1) : '—',
                exposure: exposurePct !== null ? exposurePct.toFixed(1) : '—',
                totalUnits,
                onMarket: onMarketNow,
            };
        });

        return { series: seriesData, summaryData: summary };
    }, [comps]);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Occupancy Trends</h3>
                <p className="text-xs text-[var(--text-muted)]">Estimated leased % over time, derived from unit availability periods.</p>
            </div>
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3">
                {summaryData.map((s, i) => (
                    <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                        <h4 className="text-xs font-semibold text-[var(--accent)] truncate mb-2">{s.name}</h4>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Total Units</span><span className="font-medium">{s.totalUnits}</span></div>
                            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Leased %</span><span className="font-medium">{s.leased}%</span></div>
                            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Exposure</span><span className="font-medium">{s.exposure}%</span></div>
                            <div className="flex justify-between"><span className="text-[var(--text-muted)]">On Market</span><span className="font-medium">{s.onMarket} units</span></div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] p-2 sm:p-4">
                {series.every(s => s.data.length === 0) ? (
                    <p className="text-sm text-[var(--text-muted)] text-center py-8">No availability period data to derive occupancy trends.</p>
                ) : (
                    <SVGChart series={series} yLabel="Leased %" formatY={(v: number) => `${v.toFixed(0)}%`} />
                )}
            </div>
        </div>
    );
}

// ============================================================
// Leasing Activity — derived from availability_periods exit dates
// ============================================================
export function LeasingActivitySection({ comps }: { comps: PropertyMetrics[] }) {
    const [groupBy, setGroupBy] = useState<'property' | 'bed'>('property');
    const trailingWeeks = 12;

    const { weekLabels, rows } = useMemo(() => {
        const now = new Date();
        // Build trailing week buckets
        const weeks: { start: Date; end: Date; label: string }[] = [];
        for (let w = trailingWeeks - 1; w >= 0; w--) {
            const end = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
            const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
            weeks.push({
                start,
                end,
                label: `${(start.getMonth() + 1)}/${start.getDate()}`,
            });
        }

        const labels = weeks.map(w => w.label);

        if (groupBy === 'property') {
            const rowData = comps.map((c, ci) => {
                const counts = weeks.map(week => {
                    let leases = 0;
                    c.units.forEach((u: HellodataUnit) => {
                        (u.availability_periods || []).forEach(ap => {
                            if (ap.exit_market) {
                                const exitDate = new Date(ap.exit_market);
                                if (exitDate >= week.start && exitDate < week.end) leases++;
                            }
                        });
                    });
                    return leases;
                });
                const total = counts.reduce((s, v) => s + v, 0);
                const avg = total / weeks.length;
                return { label: c.name, color: COMP_COLORS[ci % COMP_COLORS.length], counts, total, avg };
            });
            return { weekLabels: labels, rows: rowData };
        } else {
            // Group by bed type
            const allBeds = new Set<number>();
            comps.forEach(c => c.units.forEach((u: HellodataUnit) => { if (u.bed !== null) allBeds.add(u.bed); }));
            const sortedBeds = [...allBeds].sort((a, b) => a - b);

            const rowData = sortedBeds.map((bed, bi) => {
                const counts = weeks.map(week => {
                    let leases = 0;
                    comps.forEach(c => {
                        c.units.filter((u: HellodataUnit) => u.bed === bed).forEach((u: HellodataUnit) => {
                            (u.availability_periods || []).forEach(ap => {
                                if (ap.exit_market) {
                                    const exitDate = new Date(ap.exit_market);
                                    if (exitDate >= week.start && exitDate < week.end) leases++;
                                }
                            });
                        });
                    });
                    return leases;
                });
                const total = counts.reduce((s, v) => s + v, 0);
                const avg = total / weeks.length;
                return { label: bed === 0 ? 'Studio' : `${bed} BR`, color: COMP_COLORS[bi % COMP_COLORS.length], counts, total, avg };
            });
            return { weekLabels: labels, rows: rowData };
        }
    }, [comps, groupBy]);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Leasing Activity</h3>
                    <p className="text-xs text-[var(--text-muted)]">Estimated leases per week (units exiting market) — trailing {trailingWeeks} weeks.</p>
                </div>
                <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                    {(['property', 'bed'] as const).map(g => (
                        <button key={g} onClick={() => setGroupBy(g)}
                            className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium ${groupBy === g ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}>
                            {g === 'property' ? 'By Property' : 'By Bed Type'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                <table className="w-full text-xs min-w-[500px]">
                    <thead>
                        <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                            <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10 min-w-[100px]">{groupBy === 'property' ? 'Property' : 'Unit Type'}</th>
                            {weekLabels.map((wl, i) => (
                                <th key={i} className="text-center py-2.5 px-1.5 font-medium text-[var(--text-muted)] min-w-[40px]">{wl}</th>
                            ))}
                            <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)] min-w-[50px] border-l-2 border-[var(--border)]">Total</th>
                            <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)] min-w-[50px]">Avg/Wk</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                <td className="py-2 px-3 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                                        <span className="truncate">{row.label}</span>
                                    </div>
                                </td>
                                {row.counts.map((count, wi) => (
                                    <td key={wi} className={`py-2 px-1.5 text-center ${count > 0 ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-faint)]'}`}>
                                        {count > 0 ? count : '—'}
                                    </td>
                                ))}
                                <td className="py-2 px-2 text-center font-semibold text-[var(--accent)] border-l-2 border-[var(--border)]">{row.total}</td>
                                <td className="py-2 px-2 text-center font-medium text-[var(--text-secondary)]">{row.avg.toFixed(1)}</td>
                            </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-primary)] font-semibold">
                            <td className="py-2.5 px-3 text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10">Total</td>
                            {weekLabels.map((_, wi) => {
                                const weekTotal = rows.reduce((s, r) => s + r.counts[wi], 0);
                                return <td key={wi} className="py-2.5 px-1.5 text-center text-[var(--text-primary)]">{weekTotal > 0 ? weekTotal : '—'}</td>;
                            })}
                            <td className="py-2.5 px-2 text-center text-[var(--accent)] border-l-2 border-[var(--border)]">{rows.reduce((s, r) => s + r.total, 0)}</td>
                            <td className="py-2.5 px-2 text-center text-[var(--text-secondary)]">{(rows.reduce((s, r) => s + r.total, 0) / trailingWeeks).toFixed(1)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ============================================================
// Concession Timeline
// ============================================================
export function ConcessionsSection({ comps }: { comps: PropertyMetrics[] }) {
    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Concession History</h3>
                <p className="text-xs text-[var(--text-muted)]">Tracked concession periods by property.</p>
            </div>
            {comps.map((c, ci) => {
                const concessions = c.concessions.sort((a: HellodataConcession, b: HellodataConcession) => (b.from_date || '').localeCompare(a.from_date || ''));
                const latest = concessions[0];
                const freeMonths = concessions.filter((cc: HellodataConcession) => {
                    const items = cc.items as { free_months_count?: number }[] | null;
                    return items?.some(it => it.free_months_count && it.free_months_count > 0);
                });
                return (
                    <div key={ci} className="border border-[var(--border)] rounded-xl overflow-hidden">
                        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-[var(--bg-primary)] border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center gap-1 sm:justify-between">
                            <h4 className="text-sm font-semibold text-[var(--text-primary)]">{c.name}</h4>
                            <span className="text-[10px] text-[var(--text-faint)]">{concessions.length} concession periods tracked</span>
                        </div>
                        <div className="p-3 space-y-2">
                            {latest && (
                                <div className="bg-[var(--accent-subtle)] rounded-lg px-3 py-2 text-xs">
                                    <span className="font-medium text-[var(--accent)]">Latest: </span>
                                    <span className="text-[var(--text-secondary)]">{latest.concession_text?.slice(0, 150) || 'No details'}</span>
                                    {latest.from_date && <span className="text-[var(--text-muted)]"> ({latest.from_date} â†’ {latest.to_date || 'ongoing'})</span>}
                                </div>
                            )}
                            {freeMonths.length > 0 && (
                                <p className="text-xs text-[var(--text-muted)]">
                                    {freeMonths.length} of {concessions.length} periods included free month(s)
                                </p>
                            )}
                            {concessions.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-4">No concession data</p>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================================
// Fees & Other Income
// ============================================================
export function FeesSection({ comps }: { comps: PropertyMetrics[] }) {
    const fmtFee = (v: unknown) => {
        if (v === null || v === undefined) return '—';
        if (typeof v === 'number') return `$${v.toLocaleString()}`;
        return String(v);
    };

    const feeRows: { label: string; key: string }[] = [
        { label: 'Application Fee', key: 'application_fee' },
        { label: 'Admin Fee', key: 'admin_fee' },
        { label: 'Parking (Garage)', key: 'parking_garage' },
        { label: 'Parking (Covered)', key: 'parking_covered' },
        { label: 'Parking (Surface)', key: 'parking_surface_lot' },
        { label: 'Storage Fee', key: 'storage_fee' },
        { label: 'Cats Monthly', key: 'cats_monthly_rent' },
        { label: 'Cats One-Time', key: 'cats_one_time_fee' },
        { label: 'Dogs Monthly', key: 'dogs_monthly_rent' },
        { label: 'Dogs One-Time', key: 'dogs_one_time_fee' },
        { label: 'Min Deposit', key: 'min_deposit' },
        { label: 'Max Deposit', key: 'max_deposit' },
    ];

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Fees & Other Income</h3>
                <p className="text-xs text-[var(--text-muted)]">Fee comparison across comp set — informs other income projections.</p>
            </div>
            <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                <table className="w-full text-xs min-w-[400px]">
                    <thead>
                        <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                            <th className="text-left py-2.5 px-4 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10 min-w-[120px]">Fee</th>
                            {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[var(--accent)] min-w-[100px] truncate">{c.name}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {feeRows.map((row, ri) => (
                            <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                <td className="py-2 px-4 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10">{row.label}</td>
                                {comps.map((c, ci) => {
                                    const fees = c.property.fees as Record<string, unknown> | null;
                                    return <td key={ci} className="py-2 px-3 text-center text-[var(--text-primary)]">{fmtFee(fees?.[row.key])}</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ============================================================
// Quality & Reviews
// ============================================================
export function QualitySection({ comps }: { comps: PropertyMetrics[] }) {
    const qualityKeys: { label: string; key: string }[] = [
        { label: 'Overall', key: 'property_overall_quality' },
        { label: 'Kitchen', key: 'avg_quality_score_kitchen' },
        { label: 'Bathroom', key: 'avg_quality_score_bathroom' },
        { label: 'Bedroom', key: 'avg_quality_score_bedroom' },
        { label: 'Living Room', key: 'avg_quality_score_living_room' },
        { label: 'Dining Room', key: 'avg_quality_score_dining_room' },
        { label: 'Common Areas', key: 'avg_quality_score_common_areas' },
        { label: 'Fitness Center', key: 'avg_quality_score_fitness_center' },
        { label: 'Pool', key: 'avg_quality_score_swimming_pool' },
        { label: 'Main Entrance', key: 'avg_quality_score_main_entrance' },
    ];

    const sentimentKeys = ['location', 'staff_and_management', 'amenities_and_features', 'cleanliness_and_maintenance', 'value'];

    return (
        <div className="space-y-6">
            {/* Quality Scores */}
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Building Quality Scores</h3>
                    <p className="text-xs text-[var(--text-muted)]">AI-scored quality ratings from property photos (0-100%).</p>
                </div>
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10 min-w-[120px]">Quality</th>
                                {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[var(--accent)] min-w-[110px] truncate">{c.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {qualityKeys.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                    <td className="py-2 px-4 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {comps.map((c, ci) => {
                                        const q = c.property.building_quality as Record<string, number> | null;
                                        const val = q?.[row.key];
                                        const pct = val !== undefined && val !== null ? Math.round(val * 100) : null;
                                        return (
                                            <td key={ci} className="py-2 px-3">
                                                {pct !== null ? (
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <div className="w-16 h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct > 80 ? '#22C55E' : pct > 60 ? '#F59E0B' : '#EF4444' }} />
                                                        </div>
                                                        <span className="font-medium text-[var(--text-primary)] w-8">{pct}%</span>
                                                    </div>
                                                ) : <span className="text-[var(--text-faint)] text-center block">—</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Reviews Sentiment */}
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Review Sentiment</h3>
                    <p className="text-xs text-[var(--text-muted)]">Positive & negative review counts by category.</p>
                </div>
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10 min-w-[120px]">Category</th>
                                {comps.map((c, i) => (
                                    <th key={i} className="text-center py-2.5 px-3 font-semibold text-[var(--accent)] min-w-[110px] truncate" colSpan={1}>
                                        {c.name}
                                        {c.property.review_analysis?.count_reviews ? <div className="text-[10px] font-normal text-[var(--text-muted)]">{c.property.review_analysis.count_reviews} reviews · {((c.property.review_analysis.avg_score ?? 0) * 100).toFixed(0)}% positive</div> : null}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sentimentKeys.map((key, ri) => (
                                <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                    <td className="py-2 px-4 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10 capitalize">{key.replace(/_/g, ' ')}</td>
                                    {comps.map((c, ci) => {
                                        const pos = (c.property.review_analysis?.positive_counts as Record<string, number> | undefined)?.[key] ?? 0;
                                        const neg = (c.property.review_analysis?.negative_counts as Record<string, number> | undefined)?.[key] ?? 0;
                                        return (
                                            <td key={ci} className="py-2 px-3 text-center">
                                                <span className="text-[#22C55E] font-medium">+{pos}</span>
                                                <span className="text-[var(--text-faint)] mx-1">/</span>
                                                <span className="text-[#EF4444] font-medium">-{neg}</span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Market Context (Demographics + Pricing Strategy)
// ============================================================
export function MarketContextSection({ comps }: { comps: PropertyMetrics[] }) {
    const fmtNum = (v: unknown, prefix = '') => {
        if (v === null || v === undefined) return '—';
        if (typeof v === 'number') return `${prefix}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        return String(v);
    };
    const fmtPct = (v: unknown) => {
        if (v === null || v === undefined) return '—';
        if (typeof v === 'number') return `${(v * 100).toFixed(1)}%`;
        return String(v);
    };

    const demoRows: { label: string; key: string; format: 'num' | 'cur' | 'pct' }[] = [
        { label: 'Total Population', key: 'total_pop', format: 'num' },
        { label: 'Median Income', key: 'median_income', format: 'cur' },
        { label: 'Median Rent', key: 'median_rent', format: 'cur' },
        { label: 'Median Age', key: 'median_age', format: 'num' },
        { label: 'Bachelor\'s Degree %', key: 'bachelors_degree_perc', format: 'pct' },
        { label: 'Graduate Degree %', key: 'graduate_professional_degree_perc', format: 'pct' },
        { label: 'Unemployment %', key: 'unemployed_pop_perc', format: 'pct' },
        { label: 'Owner-Occupied %', key: 'owner_occupied_housing_units_perc', format: 'pct' },
        { label: 'Vacant Housing %', key: 'vacant_housing_units_perc', format: 'pct' },
    ];

    return (
        <div className="space-y-6">
            {/* Pricing Strategy */}
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pricing Strategy</h3>
                    <p className="text-xs text-[var(--text-muted)]">Revenue management and pricing behavior intelligence.</p>
                </div>
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10 min-w-[140px]">Metric</th>
                                {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[var(--accent)] min-w-[110px] truncate">{c.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: 'Revenue Management', fn: (c: PropertyMetrics) => c.property.pricing_strategy?.is_using_rev_management ? 'âœ“ Yes' : 'âœ— No' },
                                { label: 'Avg Price Change', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.avg_price_change; return v != null ? `${(v * 100).toFixed(1)}%` : '—'; } },
                                { label: 'Avg Update Frequency', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.avg_duration; return v != null ? `Every ${v.toFixed(1)} days` : '—'; } },
                                { label: 'Avg Days on Market', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.avg_time_on_market; return v != null ? `${v.toFixed(0)} days` : '—'; } },
                                { label: 'Price Updates Tracked', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.count_prices; return v != null ? v.toLocaleString() : '—'; } },
                            ].map((row, ri) => (
                                <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                    <td className="py-2 px-4 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {comps.map((c, ci) => <td key={ci} className="py-2 px-3 text-center text-[var(--text-primary)]">{row.fn(c)}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Demographics */}
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Demographics</h3>
                    <p className="text-xs text-[var(--text-muted)]">Census tract demographics around each property.</p>
                </div>
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10 min-w-[140px]">Demographic</th>
                                {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[var(--accent)] min-w-[110px] truncate">{c.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {demoRows.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                    <td className="py-2 px-4 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {comps.map((c, ci) => {
                                        const d = c.property.demographics as Record<string, unknown> | null;
                                        const val = d?.[row.key];
                                        return <td key={ci} className="py-2 px-3 text-center text-[var(--text-primary)]">{row.format === 'cur' ? fmtNum(val, '$') : row.format === 'pct' ? fmtPct(val) : fmtNum(val)}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Rent Roll — estimated unit-level rent roll per property
// ============================================================
export function RentRollSection({ comps }: { comps: PropertyMetrics[] }) {
    const [selectedComp, setSelectedComp] = useState(0);
    const [viewMode, setViewMode] = useState<'summary' | 'floorplan' | 'detail'>('summary');

    const comp = comps[selectedComp];
    if (!comp) return <p className="text-sm text-[var(--text-muted)] text-center py-8">No comp selected</p>;

    const todayStr = new Date().toISOString().slice(0, 10);

    // Determine unit occupancy status from availability_periods
    const getStatus = (u: HellodataUnit): 'occupied' | 'vacant' | 'notice' => {
        const periods = u.availability_periods || [];
        const isOnMarket = periods.some(ap => {
            const entered = !ap.enter_market || ap.enter_market <= todayStr;
            const notExited = !ap.exit_market || ap.exit_market >= todayStr;
            return entered && notExited;
        });
        if (isOnMarket) return 'vacant';
        // Check if exiting soon (within 30 days) — "notice"
        const thirtyOut = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const isNotice = periods.some(ap => {
            if (!ap.enter_market) return false;
            return ap.enter_market > todayStr && ap.enter_market <= thirtyOut;
        });
        return isNotice ? 'notice' : 'occupied';
    };

    // Summary view: group by bed/bath or floorplan
    const summaryRows = useMemo(() => {
        const groups: Record<string, {
            label: string;
            bed: number | null; bath: number | null;
            units: HellodataUnit[]; statuses: ('occupied' | 'vacant' | 'notice')[];
        }> = {};

        comp.units.forEach((u: HellodataUnit) => {
            let key, label;
            if (viewMode === 'floorplan') {
                label = u.floorplan_name || 'Unknown Floorplan';
                key = `fp-${label}`;
            } else {
                label = u.bed === null ? 'N/A' : u.bed === 0 ? 'Studio' : `${u.bed} BR / ${u.bath ?? '?'} BA`;
                key = `type-${u.bed ?? 'N/A'}-${u.bath ?? 'N/A'}`;
            }

            if (!groups[key]) groups[key] = { label, bed: u.bed, bath: u.bath, units: [], statuses: [] };
            groups[key].units.push(u);
            groups[key].statuses.push(getStatus(u));
        });

        return Object.values(groups)
            .sort((a, b) => {
                if (viewMode === 'floorplan') return a.label.localeCompare(b.label);
                return (a.bed ?? -1) - (b.bed ?? -1) || (a.bath ?? -1) - (b.bath ?? -1);
            })
            .map(g => {
                const count = g.units.length;
                const occupied = g.statuses.filter(s => s === 'occupied').length;
                const vacant = g.statuses.filter(s => s === 'vacant').length;
                const notice = g.statuses.filter(s => s === 'notice').length;
                const validPrices = g.units.filter(u => u.price !== null);
                const validEff = g.units.filter(u => u.effective_price !== null);
                const validSqft = g.units.filter(u => u.sqft !== null);

                const avgRent = validPrices.length > 0 ? validPrices.reduce((s, u) => s + (u.price ?? 0), 0) / validPrices.length : null;
                const avgEff = validEff.length > 0 ? validEff.reduce((s, u) => s + (u.effective_price ?? 0), 0) / validEff.length : null;
                const avgSqft = validSqft.length > 0 ? validSqft.reduce((s, u) => s + (u.sqft ?? 0), 0) / validSqft.length : null;
                const rentPsf = avgRent && avgSqft ? avgRent / avgSqft : null;
                const effPsf = avgEff && avgSqft ? avgEff / avgSqft : null;
                const avgDom = g.units.filter(u => u.days_on_market !== null).length > 0
                    ? g.units.reduce((s, u) => s + (u.days_on_market ?? 0), 0) / g.units.filter(u => u.days_on_market !== null).length
                    : null;

                return {
                    label: g.label,
                    count, occupied, vacant, notice,
                    avgRent, avgEff, avgSqft, rentPsf, effPsf, avgDom,
                    occupancyPct: count > 0 ? (occupied / count) * 100 : 0,
                };
            });
    }, [comp, viewMode]);

    // Detail view: individual units
    const detailRows = useMemo(() => {
        return comp.units
            .map((u: HellodataUnit) => ({
                unit: u.unit_name || u.floorplan_name || '—',
                bed: u.bed,
                bath: u.bath,
                sqft: u.sqft,
                rent: u.price,
                effRent: u.effective_price,
                rentPsf: u.price && u.sqft ? u.price / u.sqft : null,
                effPsf: u.effective_price && u.sqft ? u.effective_price / u.sqft : null,
                dom: u.days_on_market,
                status: getStatus(u),
                floorplan: u.floorplan_name,
            }))
            .sort((a, b) => (a.bed ?? -1) - (b.bed ?? -1) || (a.unit || '').localeCompare(b.unit || ''));
    }, [comp]);

    const fmt = (v: number | null, dec = 0, prefix = '$') => v !== null ? `${prefix}${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}` : '—';

    // Totals
    const totalCount = summaryRows.reduce((s, r) => s + r.count, 0);
    const totalOccupied = summaryRows.reduce((s, r) => s + r.occupied, 0);
    const totalVacant = summaryRows.reduce((s, r) => s + r.vacant, 0);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Estimated Rent Roll</h3>
                    <p className="text-xs text-[var(--text-muted)]">Unit-level rent and occupancy data from HelloData listings.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={selectedComp} onChange={e => setSelectedComp(Number(e.target.value))}
                        className="text-[11px] sm:text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-card)]">
                        {comps.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                    </select>
                    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                        {(['summary', 'floorplan', 'detail'] as const).map(m => (
                            <button key={m} onClick={() => setViewMode(m)}
                                className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium ${viewMode === m ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}>
                                {m === 'summary' ? 'By Type' : m === 'floorplan' ? 'By Floorplan' : 'By Unit'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Total Units</div>
                    <div className="text-base font-semibold text-[var(--text-primary)]">{totalCount}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Occupied</div>
                    <div className="text-base font-semibold text-[var(--success)]">{totalOccupied} <span className="text-xs font-normal text-[var(--text-muted)]">({totalCount > 0 ? ((totalOccupied / totalCount) * 100).toFixed(1) : 0}%)</span></div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Vacant</div>
                    <div className="text-base font-semibold text-[#EF4444]">{totalVacant}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Avg Rent</div>
                    <div className="text-base font-semibold text-[var(--text-primary)]">{fmt(comp.askingRent)}</div>
                </div>
            </div>

            {viewMode !== 'detail' ? (
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-xs min-w-[700px]">
                        <thead>
                            <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                                <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10">{viewMode === 'summary' ? 'Unit Type' : 'Floorplan'}</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]"># Units</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--success)]">Occupied</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#EF4444]">Vacant</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Occ %</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Avg SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Market Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Rent/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Eff. Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Eff/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Avg DOM</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaryRows.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                    <td className="py-2 px-3 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    <td className="py-2 px-2 text-center font-medium">{row.count}</td>
                                    <td className="py-2 px-2 text-center text-[var(--success)] font-medium">{row.occupied}</td>
                                    <td className="py-2 px-2 text-center text-[#EF4444] font-medium">{row.vacant}{row.notice > 0 ? <span className="text-[#F59E0B]"> +{row.notice}</span> : ''}</td>
                                    <td className="py-2 px-2 text-center">
                                        <span className={`font-medium ${row.occupancyPct >= 95 ? 'text-[var(--success)]' : row.occupancyPct >= 90 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>
                                            {row.occupancyPct.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="py-2 px-2 text-center">{row.avgSqft ? `${Math.round(row.avgSqft)} ft²` : '—'}</td>
                                    <td className="py-2 px-2 text-center font-medium">{fmt(row.avgRent)}</td>
                                    <td className="py-2 px-2 text-center">{fmt(row.rentPsf, 2)}/sf</td>
                                    <td className="py-2 px-2 text-center font-medium">{fmt(row.avgEff)}</td>
                                    <td className="py-2 px-2 text-center">{fmt(row.effPsf, 2)}/sf</td>
                                    <td className="py-2 px-2 text-center text-[var(--text-muted)]">{row.avgDom !== null ? `${Math.round(row.avgDom)}d` : '—'}</td>
                                </tr>
                            ))}
                            {/* Totals */}
                            <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-primary)] font-semibold">
                                <td className="py-2.5 px-3 text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10">Total / Avg</td>
                                <td className="py-2.5 px-2 text-center">{totalCount}</td>
                                <td className="py-2.5 px-2 text-center text-[var(--success)]">{totalOccupied}</td>
                                <td className="py-2.5 px-2 text-center text-[#EF4444]">{totalVacant}</td>
                                <td className="py-2.5 px-2 text-center">{totalCount > 0 ? `${((totalOccupied / totalCount) * 100).toFixed(1)}%` : '—'}</td>
                                <td className="py-2.5 px-2 text-center">{comp.avgSqft ? `${Math.round(comp.avgSqft)} ft²` : '—'}</td>
                                <td className="py-2.5 px-2 text-center">{fmt(comp.askingRent)}</td>
                                <td className="py-2.5 px-2 text-center">{comp.rentPSF ? `${fmt(comp.rentPSF, 2)}/sf` : '—'}</td>
                                <td className="py-2.5 px-2 text-center">{fmt(comp.effectiveRent)}</td>
                                <td className="py-2.5 px-2 text-center">{comp.effectiveRent && comp.avgSqft ? `${fmt(comp.effectiveRent / comp.avgSqft, 2)}/sf` : '—'}</td>
                                <td className="py-2.5 px-2 text-center text-[var(--text-muted)]">{comp.avgDaysOnMarket !== null ? `${Math.round(comp.avgDaysOnMarket)}d` : '—'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-xs min-w-[750px]">
                        <thead>
                            <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                                <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-secondary)] sticky left-0 bg-[var(--bg-primary)] z-10">Unit</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Type</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Status</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Market Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Rent/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Eff. Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Eff/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[var(--text-secondary)]">DOM</th>
                                <th className="text-left py-2.5 px-2 font-semibold text-[var(--text-secondary)]">Floorplan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detailRows.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[var(--bg-elevated)] ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                    <td className="py-1.5 px-3 font-medium text-[var(--text-secondary)] sticky left-0 bg-inherit z-10">{row.unit}</td>
                                    <td className="py-1.5 px-2 text-center">{row.bed === null ? '—' : row.bed === 0 ? 'Studio' : `${row.bed}/${row.bath ?? '?'}`}</td>
                                    <td className="py-1.5 px-2 text-center">{row.sqft ? `${row.sqft}` : '—'}</td>
                                    <td className="py-1.5 px-2 text-center">
                                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${row.status === 'occupied' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                                            row.status === 'notice' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' :
                                                'bg-[var(--danger-bg)] text-[#EF4444]'
                                            }`}>
                                            {row.status === 'occupied' ? 'Leased' : row.status === 'notice' ? 'Notice' : 'Vacant'}
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-2 text-center font-medium">{fmt(row.rent)}</td>
                                    <td className="py-1.5 px-2 text-center">{fmt(row.rentPsf, 2)}/sf</td>
                                    <td className="py-1.5 px-2 text-center font-medium">{fmt(row.effRent)}</td>
                                    <td className="py-1.5 px-2 text-center">{fmt(row.effPsf, 2)}/sf</td>
                                    <td className="py-1.5 px-2 text-center text-[var(--text-muted)]">{row.dom !== null ? `${row.dom}d` : '—'}</td>
                                    <td className="py-1.5 px-2 text-left text-[var(--text-muted)] truncate max-w-[120px]">{row.floorplan || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {detailRows.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-8">No unit data available</p>}
                </div>
            )}
        </div>
    );
}

// ============================================================
// Comp Map — Mapbox GL map with markers for each comp
// ============================================================
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export function CompMapSection({ comps }: { comps: PropertyMetrics[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<unknown>(null);
    const markersRef = useRef<unknown[]>([]);
    const [hoveredComp, setHoveredComp] = useState<number | null>(null);

    // Comps with valid coordinates
    const mappableComps = useMemo(() => comps.filter(c => c.property.lat && c.property.lon), [comps]);

    const initMap = useCallback(() => {
        if (!MAPBOX_TOKEN || !containerRef.current || mappableComps.length === 0) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        import('mapbox-gl').then((mapboxgl: any) => {
            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;

            // Compute bounds
            const lats = mappableComps.map(c => c.property.lat!);
            const lons = mappableComps.map(c => c.property.lon!);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);

            const center: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];

            const map = new mbgl.Map({
                container: containerRef.current!,
                style: 'mapbox://styles/mapbox/light-v11',
                center,
                zoom: 12,
                attributionControl: false,
            });
            mapInstanceRef.current = map;

            map.on('load', () => {
                // Fit to bounds with padding
                if (mappableComps.length > 1) {
                    const pad = 0.005;
                    map.fitBounds(
                        [[minLon - pad, minLat - pad], [maxLon + pad, maxLat + pad]],
                        { padding: 60, maxZoom: 15 }
                    );
                }

                // Add markers with popups
                mappableComps.forEach((c, i) => {
                    const color = c.compType === 'primary' ? COMP_COLORS[i % COMP_COLORS.length] : '#94A3B8';
                    const fmtC = (v: number | null) => v !== null ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';

                    const popup = new mbgl.Popup({
                        offset: 25,
                        closeButton: false,
                        maxWidth: '280px',
                    }).setHTML(`
                        <div style="font-family: system-ui, sans-serif; padding: 4px;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: var(--text-primary);">${c.name}</div>
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">${c.address}</div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: 11px;">
                                <span style="color: var(--text-muted);">Asking:</span><span style="font-weight: 500;">${fmtC(c.askingRent)}</span>
                                <span style="color: var(--text-muted);">Effective:</span><span style="font-weight: 500;">${fmtC(c.effectiveRent)}</span>
                                <span style="color: var(--text-muted);">Units:</span><span style="font-weight: 500;">${c.property.number_units ?? '—'}</span>
                                <span style="color: var(--text-muted);">Leased:</span><span style="font-weight: 500;">${c.leasedPct !== null ? c.leasedPct.toFixed(1) + '%' : '—'}</span>
                            </div>
                        </div>
                    `);

                    const marker = new mbgl.Marker({ color, scale: 0.85 })
                        .setLngLat([c.property.lon!, c.property.lat!])
                        .addTo(map);

                    const el = marker.getElement();
                    el.style.cursor = 'pointer';
                    el.addEventListener('mouseenter', () => {
                        setHoveredComp(i);
                        popup.setLngLat([c.property.lon!, c.property.lat!]).addTo(map);
                    });
                    el.addEventListener('mouseleave', () => {
                        setHoveredComp(null);
                        popup.remove();
                    });

                    markersRef.current.push(marker);
                });
            });
        });

        return () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            markersRef.current.forEach((m: any) => m.remove());
            markersRef.current = [];
            if (mapInstanceRef.current) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (mapInstanceRef.current as any).remove();
                mapInstanceRef.current = null;
            }
        };
    }, [mappableComps]);

    useEffect(() => {
        const cleanup = initMap();
        return () => { if (cleanup) cleanup(); };
    }, [initMap]);

    if (!MAPBOX_TOKEN) {
        return (
            <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-primary)]">
                <p className="text-sm text-[var(--text-muted)]">Map requires <code className="text-[10px] bg-[var(--bg-elevated)] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> in .env.local</p>
            </div>
        );
    }

    if (mappableComps.length === 0) {
        return (
            <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-primary)]">
                <p className="text-sm text-[var(--text-muted)]">No comps with coordinates available for mapping.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Comp Map</h3>
                <p className="text-xs text-[var(--text-muted)]">Locations of comp properties. Hover markers for details.</p>
            </div>
            <div className="border border-[var(--border)] rounded-xl overflow-hidden relative" style={{ height: '420px' }}>
                <div ref={containerRef} className="w-full h-full" />
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 px-1">
                {mappableComps.map((c, i) => (
                    <div key={i} className={`flex items-center gap-1.5 text-xs transition-opacity ${hoveredComp !== null && hoveredComp !== i ? 'opacity-40' : ''}`}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.compType === 'primary' ? COMP_COLORS[i % COMP_COLORS.length] : '#94A3B8' }} />
                        <span className="text-[var(--text-secondary)] truncate max-w-[140px]">{c.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================
// OCCUPANCY FORECAST
// ============================================================
export function OccupancyForecastSectionFull({ comps }: { comps: PropertyMetrics[] }) {
    const [lookback, setLookback] = useState<7 | 30 | 90>(30);

    const { series, summaryData, avgSummary, todayStr } = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const cutoffDate = new Date(now.getTime() - lookback * 86400000).toISOString().slice(0, 10);

        const seriesData: ChartSeries[] = [];
        const summary = [];

        // Forecast 12 weeks out, and include 12 weeks of history
        const forecastWeeks = [-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12];
        const dateStrings = forecastWeeks.map(w => {
            const d = new Date(now.getTime() + w * 864e5 * 7);
            return d.toISOString().slice(0, 10);
        });

        for (let ci = 0; ci < comps.length; ci++) {
            const c = comps[ci];
            const totalUnits = c.property.number_units ?? 0;
            if (totalUnits === 0) continue;

            const allPeriods: { enter: string; exit: string | null }[] = [];
            let onMarket = 0;
            let supplyInWindow = 0;
            let leasesInWindow = 0;

            c.units.forEach((u: HellodataUnit) => {
                let isCurrentlyOnMarket = false;
                (u.availability_periods || []).forEach(ap => {
                    const enter = ap.enter_market;
                    const exit = ap.exit_market;
                    if (enter) allPeriods.push({ enter, exit: exit ?? null });

                    const entered = !enter || enter <= todayStr;
                    const notExited = !exit || exit >= todayStr;
                    if (entered && notExited) isCurrentlyOnMarket = true;

                    // Compute lookback tallies
                    if (enter && enter >= cutoffDate && enter <= todayStr) {
                        supplyInWindow++;
                    }
                    if (exit && exit >= cutoffDate && exit <= todayStr) {
                        leasesInWindow++;
                    }
                });
                if (isCurrentlyOnMarket) onMarket++;
            });

            const currentOccPct = ((totalUnits - onMarket) / totalUnits) * 100;
            const wkSupply = supplyInWindow / (lookback / 7);
            const wkLeases = leasesInWindow / (lookback / 7);
            const netAbsorption = wkLeases - wkSupply;

            let trend: 'Tightening' | 'Stabilized' | 'Softening' = 'Stabilized';
            if (netAbsorption > 0.5) trend = 'Tightening';
            else if (netAbsorption < -0.5) trend = 'Softening';

            const dataPts = forecastWeeks.map((w, wi) => {
                if (w < 0) {
                    // Compute historical OCC 
                    const weekStr = dateStrings[wi];
                    let histOnMarket = 0;
                    for (const p of allPeriods) {
                        if (p.enter <= weekStr && (!p.exit || p.exit >= weekStr)) histOnMarket++;
                    }
                    let occ: number | null = ((totalUnits - histOnMarket) / totalUnits) * 100;

                    // LEASE-UP && OUTAGE CORRECTION
                    if (occ > 96 && currentOccPct < 85) occ = null; 
                    if (occ !== null && occ < 40) occ = null;

                    return { date: dateStrings[wi], value: occ !== null ? Number(occ.toFixed(1)) : null };
                } else {
                    // Forecast OCC
                    let forecastedUnitOcc = (totalUnits - onMarket) + (netAbsorption * w);
                    let forecastedOccPct = (forecastedUnitOcc / totalUnits) * 100;
                    if (forecastedOccPct > 95) forecastedOccPct = 95;
                    if (forecastedOccPct < 0) forecastedOccPct = 0;
                    return { date: dateStrings[wi], value: Number(forecastedOccPct.toFixed(1)) };
                }
            });

            // Strip null values since SVGChart needs valid path points
            const validDataPts = dataPts.filter((d): d is { date: string, value: number } => d.value !== null);

            seriesData.push({
                label: c.name,
                color: COMP_COLORS[ci % COMP_COLORS.length],
                data: validDataPts
            });

            summary.push({
                name: c.name,
                totalUnits,
                currentOcc: currentOccPct.toFixed(1),
                wkSupply: wkSupply.toFixed(1),
                wkLeases: wkLeases.toFixed(1),
                netAbs: netAbsorption.toFixed(1),
                forecast12Wk: dataPts[dataPts.length - 1].value?.toFixed(1) ?? '—',
                trend
            });
        }

        const avgData = forecastWeeks.map((w, wi) => {
            let sum = 0; let count = 0;
            seriesData.forEach(s => { 
                const match = s.data.find(d => d.date === dateStrings[wi]);
                if (match?.value != null) { sum += match.value; count++; }
            });
            return { date: dateStrings[wi], value: count > 0 ? Number((sum / count).toFixed(1)) : null };
        }).filter((d): d is { date: string, value: number } => d.value !== null);

        if (seriesData.length > 0) {
            seriesData.unshift({
                label: 'Market Average',
                color: '#475569',
                data: avgData
            });
        }

        let avgSummary = null;
        if (summary.length > 0) {
            const valid = summary.filter(s => s.totalUnits > 0);
            if (valid.length > 0) {
                const totalUnits = valid.reduce((s, c) => s + c.totalUnits, 0);
                const avgNetAbs = valid.reduce((s, c) => s + Number(c.netAbs), 0) / valid.length;
                let avgTrend: 'Tightening' | 'Stabilized' | 'Softening' = 'Stabilized';
                if (avgNetAbs > 0.5) avgTrend = 'Tightening';
                else if (avgNetAbs < -0.5) avgTrend = 'Softening';

               avgSummary = {
                    name: 'Market Average',
                    totalUnits,
                    currentOcc: (valid.reduce((s, c) => s + Number(c.currentOcc), 0) / valid.length).toFixed(1),
                    wkSupply: (valid.reduce((s, c) => s + Number(c.wkSupply), 0) / valid.length).toFixed(1),
                    wkLeases: (valid.reduce((s, c) => s + Number(c.wkLeases), 0) / valid.length).toFixed(1),
                    netAbs: avgNetAbs.toFixed(1),
                    forecast12Wk: avgData.length > 0 ? avgData[avgData.length - 1].value.toFixed(1) : '—',
                    trend: avgTrend
                };
            }
        }

        return { series: seriesData, summaryData: summary, avgSummary, todayStr };
    }, [comps, lookback]);

    const btnClasses = (isActive: boolean) => 
        `px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all duration-200 ${isActive ? 'bg-[var(--accent)] text-white shadow-sm ring-1 ring-slate-900/5' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Occupancy Forecast</h3>
                    <p className="text-xs text-[var(--text-muted)]">12-week historical context and 12-week forward projection derived from historical trend absorption.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest hidden sm:block">Lookback Window</span>
                    <div className="inline-flex p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                        <button onClick={() => setLookback(7)} className={btnClasses(lookback === 7)}>Trailing 7D</button>
                        <button onClick={() => setLookback(30)} className={btnClasses(lookback === 30)}>Trailing 30D</button>
                        <button onClick={() => setLookback(90)} className={btnClasses(lookback === 90)}>Trailing 90D</button>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5 shadow-sm">
                {series.length === 0 ? <p className="text-sm text-[var(--text-muted)] text-center py-8">No availability data mapped.</p>
                    : <SVGChart series={series as any} yLabel="Projected Occupancy %" formatY={v => `${v.toFixed(1)}%`} highlightDate={todayStr} />}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-x-auto shadow-sm">
                <table className="w-full text-xs min-w-[750px]">
                    <thead>
                        <tr className="bg-[var(--bg-primary)] border-b border-[var(--border)]">
                            <th className="text-left py-3 px-4 font-semibold text-[11px] uppercase tracking-widest text-[var(--text-muted)] sticky left-0 bg-[var(--bg-primary)] z-10">Property</th>
                            <th className="text-center py-3 px-3 font-semibold text-[11px] uppercase tracking-widest text-[var(--text-muted)]">Current Occ</th>
                            <th className="text-center py-3 px-3 font-semibold text-[11px] uppercase tracking-widest text-[var(--text-muted)]">Wkly Supply</th>
                            <th className="text-center py-3 px-3 font-semibold text-[11px] uppercase tracking-widest text-[var(--text-muted)]">Wkly Leases</th>
                            <th className="text-center py-3 px-3 font-semibold text-[11px] uppercase tracking-widest text-blue-600 dark:text-blue-400 border-l border-[var(--border)]">Net Abs (Wkly)</th>
                            <th className="text-center py-3 px-3 font-semibold text-[11px] uppercase tracking-widest text-blue-600 dark:text-blue-400">12-Wk Forecast</th>
                            <th className="text-center py-3 px-4 font-semibold text-[11px] uppercase tracking-widest text-[var(--text-muted)]">Trend Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {avgSummary && (
                            <tr className="border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)]">
                                <td className="py-3 px-4 font-bold text-[13px] text-[var(--text-primary)] truncate max-w-[200px] sticky left-0 bg-inherit z-10">{avgSummary.name}</td>
                                <td className="py-3 px-3 text-center text-[13px] font-bold text-[var(--text-primary)] tabular-nums">{avgSummary.currentOcc}%</td>
                                <td className="py-3 px-3 text-center text-[13px] text-[#EF4444] font-bold tabular-nums">{avgSummary.wkSupply}</td>
                                <td className="py-3 px-3 text-center text-[13px] text-[#22C55E] font-bold tabular-nums">{avgSummary.wkLeases}</td>
                                <td className="py-3 px-3 text-center font-bold text-[13px] border-l border-[var(--border)] tabular-nums text-[var(--text-primary)]">{Number(avgSummary.netAbs) > 0 ? '+' : ''}{avgSummary.netAbs}</td>
                                <td className="py-3 px-3 text-center font-bold text-[13px] text-blue-600 dark:text-blue-400 tabular-nums">{avgSummary.forecast12Wk}%</td>
                                <td className="py-3 px-4 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold ${
                                        avgSummary.trend === 'Tightening' ? 'bg-[#22C55E]/10 text-[#22C55E]' :
                                        avgSummary.trend === 'Softening' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                                        'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]'
                                    }`}>{avgSummary.trend}</span>
                                </td>
                            </tr>
                        )}
                        {summaryData.sort((a,b) => Number(b.netAbs) - Number(a.netAbs)).map((row, ri) => (
                            <tr key={ri} className={`border-b border-[var(--bg-elevated)] last:border-0 ${ri % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                <td className="py-2.5 px-4 font-semibold text-[13px] text-[var(--text-primary)] truncate max-w-[200px] sticky left-0 bg-inherit z-10">{row.name}</td>
                                <td className="py-2.5 px-3 text-center text-[13px] text-[var(--text-secondary)] tabular-nums">{row.currentOcc}%</td>
                                <td className="py-2.5 px-3 text-center text-[13px] text-[#EF4444] font-medium tabular-nums">{row.wkSupply}</td>
                                <td className="py-2.5 px-3 text-center text-[13px] text-[#22C55E] font-medium tabular-nums">{row.wkLeases}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-[13px] border-l border-[var(--border)] tabular-nums text-[var(--text-primary)]">{Number(row.netAbs) > 0 ? '+' : ''}{row.netAbs}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-[13px] text-blue-600 dark:text-blue-400 tabular-nums">{row.forecast12Wk}%</td>
                                <td className="py-2.5 px-4 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold ${
                                        row.trend === 'Tightening' ? 'bg-[#22C55E]/10 text-[#22C55E]' :
                                        row.trend === 'Softening' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                                        'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                                    }`}>{row.trend}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
