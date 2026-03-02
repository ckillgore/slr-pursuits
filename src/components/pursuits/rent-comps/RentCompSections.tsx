'use client';

import { useState, useMemo } from 'react';
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
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Rent Trends</h3>
                    <p className="text-xs text-[#7A8599]">Historical rent pricing from unit listing data.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select value={bedFilter} onChange={e => setBedFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="text-[11px] sm:text-xs border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-[#4A5568] bg-white">
                        <option value="all">All Beds</option>
                        {allBeds.map(b => <option key={b} value={b}>{b === 0 ? 'Studio' : `${b} BR`}</option>)}
                    </select>
                    <select value={metric} onChange={e => setMetric(e.target.value as 'asking' | 'effective')} className="text-[11px] sm:text-xs border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-[#4A5568] bg-white">
                        <option value="asking">Asking</option>
                        <option value="effective">Effective</option>
                    </select>
                    <div className="flex rounded-lg border border-[#E2E5EA] overflow-hidden">
                        {(['month', 'week'] as const).map(g => (
                            <button key={g} onClick={() => setGranularity(g)} className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium ${granularity === g ? 'bg-[#2563EB] text-white' : 'text-[#7A8599] hover:bg-[#F4F5F7]'}`}>
                                {g === 'month' ? 'Mo' : 'Wk'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="border border-[#E2E5EA] rounded-xl bg-white p-2 sm:p-4">
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

    const bubbles = useMemo(() => {
        const results: { label: string; sqft: number; rent: number; count: number; color: string }[] = [];

        if (groupBy === 'property') {
            comps.forEach((c, i) => {
                const units = c.units.filter((u: HellodataUnit) => u.sqft && (rentType === 'asking' ? u.price : u.effective_price));
                if (units.length === 0) return;
                const avgSqft = units.reduce((s: number, u: HellodataUnit) => s + (u.sqft ?? 0), 0) / units.length;
                const avgRent = (rentType === 'asking' ? getAverageAskingRent(units) : getAverageEffectiveRent(units)) ?? 0;
                results.push({ label: c.name, sqft: Math.round(avgSqft), rent: yAxis === 'psf' && avgSqft > 0 ? avgRent / avgSqft : avgRent, count: c.property.number_units ?? units.length, color: COMP_COLORS[i % COMP_COLORS.length] });
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
                results.push({ label: bedNum === 0 ? 'Studio' : `${bed} BR`, sqft: Math.round(avgSqft), rent: yAxis === 'psf' && avgSqft > 0 ? avgRent / avgSqft : avgRent, count: valid.length, color: COMP_COLORS[bedNum % COMP_COLORS.length] });
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
                    results.push({ label: `${c.name.slice(0, 8)}/${fp}`, sqft: Math.round(avgSqft), rent: yAxis === 'psf' && avgSqft > 0 ? avgRent / avgSqft : avgRent, count: valid.length, color: COMP_COLORS[ci % COMP_COLORS.length] });
                });
            });
        }
        return results;
    }, [comps, groupBy, yAxis, rentType]);

    const maxRent = Math.max(...bubbles.map(b => b.rent), 1);
    const maxSqft = Math.max(...bubbles.map(b => b.sqft), 1);
    const maxCount = Math.max(...bubbles.map(b => b.count), 1);
    const W = 700, H = 300, pad = { top: 20, right: 20, bottom: 40, left: 65 };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Rent vs. Size</h3>
                    <p className="text-xs text-[#7A8599]">Bubble size = unit count. X = avg sqft, Y = avg rent.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select value={groupBy} onChange={e => setGroupBy(e.target.value as 'property' | 'type' | 'floorplan')} className="text-[11px] sm:text-xs border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-[#4A5568] bg-white">
                        <option value="property">Property</option>
                        <option value="type">Bed Type</option>
                        <option value="floorplan">Floorplan</option>
                    </select>
                    <select value={rentType} onChange={e => setRentType(e.target.value as 'asking' | 'effective')} className="text-[11px] sm:text-xs border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-[#4A5568] bg-white">
                        <option value="asking">Asking</option>
                        <option value="effective">Effective</option>
                    </select>
                    <select value={yAxis} onChange={e => setYAxis(e.target.value as 'total' | 'psf')} className="text-[11px] sm:text-xs border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-[#4A5568] bg-white">
                        <option value="total">Total</option>
                        <option value="psf">Per SF</option>
                    </select>
                </div>
            </div>
            <div className="border border-[#E2E5EA] rounded-xl bg-white p-2 sm:p-4 overflow-x-auto">
                {bubbles.length === 0 ? <p className="text-sm text-center text-[#7A8599] py-8">No data</p> : (
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[750px]" style={{ minWidth: 280 }}>
                        {/* Grid */}
                        {[0, 1, 2, 3, 4].map(i => { const y = pad.top + (H - pad.top - pad.bottom) * (1 - i / 4); const val = (maxRent * i) / 4; return (<g key={i}><line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="#F4F5F7" /><text x={pad.left - 8} y={y + 4} textAnchor="end" fill="#7A8599" fontSize={10}>{yAxis === 'psf' ? `$${val.toFixed(2)}` : `$${Math.round(val).toLocaleString()}`}</text></g>); })}
                        {/* Bubbles */}
                        {bubbles.map((b, i) => {
                            const cx = pad.left + (b.sqft / maxSqft) * (W - pad.left - pad.right) * 0.9 + (W - pad.left - pad.right) * 0.05;
                            const cy = pad.top + (1 - b.rent / maxRent) * (H - pad.top - pad.bottom) * 0.9 + (H - pad.top - pad.bottom) * 0.05;
                            const r = Math.max(6, Math.min(30, (b.count / maxCount) * 25 + 5));
                            return (<g key={i}>
                                <circle cx={cx} cy={cy} r={r} fill={b.color} fillOpacity={0.6} stroke={b.color} strokeWidth={1.5} />
                                <text x={cx} y={cy - r - 4} textAnchor="middle" fill="#4A5568" fontSize={9} fontWeight={500}>{b.label}</text>
                            </g>);
                        })}
                        {/* X label */}
                        <text x={W / 2} y={H - 4} textAnchor="middle" fill="#7A8599" fontSize={10}>Avg Sqft</text>
                    </svg>
                )}
            </div>
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
                <h3 className="text-sm font-semibold text-[#1A1F2B]">Occupancy Trends</h3>
                <p className="text-xs text-[#7A8599]">Estimated leased % over time, derived from unit availability periods.</p>
            </div>
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3">
                {summaryData.map((s, i) => (
                    <div key={i} className="rounded-xl border border-[#E2E5EA] bg-white p-3">
                        <h4 className="text-xs font-semibold text-[#2563EB] truncate mb-2">{s.name}</h4>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-[#7A8599]">Total Units</span><span className="font-medium">{s.totalUnits}</span></div>
                            <div className="flex justify-between"><span className="text-[#7A8599]">Leased %</span><span className="font-medium">{s.leased}%</span></div>
                            <div className="flex justify-between"><span className="text-[#7A8599]">Exposure</span><span className="font-medium">{s.exposure}%</span></div>
                            <div className="flex justify-between"><span className="text-[#7A8599]">On Market</span><span className="font-medium">{s.onMarket} units</span></div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="border border-[#E2E5EA] rounded-xl bg-white p-2 sm:p-4">
                {series.every(s => s.data.length === 0) ? (
                    <p className="text-sm text-[#7A8599] text-center py-8">No availability period data to derive occupancy trends.</p>
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
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Leasing Activity</h3>
                    <p className="text-xs text-[#7A8599]">Estimated leases per week (units exiting market) — trailing {trailingWeeks} weeks.</p>
                </div>
                <div className="flex rounded-lg border border-[#E2E5EA] overflow-hidden">
                    {(['property', 'bed'] as const).map(g => (
                        <button key={g} onClick={() => setGroupBy(g)}
                            className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium ${groupBy === g ? 'bg-[#2563EB] text-white' : 'text-[#7A8599] hover:bg-[#F4F5F7]'}`}>
                            {g === 'property' ? 'By Property' : 'By Bed Type'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                <table className="w-full text-xs min-w-[500px]">
                    <thead>
                        <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                            <th className="text-left py-2.5 px-3 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[100px]">{groupBy === 'property' ? 'Property' : 'Unit Type'}</th>
                            {weekLabels.map((wl, i) => (
                                <th key={i} className="text-center py-2.5 px-1.5 font-medium text-[#7A8599] min-w-[40px]">{wl}</th>
                            ))}
                            <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568] min-w-[50px] border-l-2 border-[#E2E5EA]">Total</th>
                            <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568] min-w-[50px]">Avg/Wk</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                <td className="py-2 px-3 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                                        <span className="truncate">{row.label}</span>
                                    </div>
                                </td>
                                {row.counts.map((count, wi) => (
                                    <td key={wi} className={`py-2 px-1.5 text-center ${count > 0 ? 'text-[#1A1F2B] font-medium' : 'text-[#CBD2DC]'}`}>
                                        {count > 0 ? count : '—'}
                                    </td>
                                ))}
                                <td className="py-2 px-2 text-center font-semibold text-[#2563EB] border-l-2 border-[#E2E5EA]">{row.total}</td>
                                <td className="py-2 px-2 text-center font-medium text-[#4A5568]">{row.avg.toFixed(1)}</td>
                            </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t-2 border-[#E2E5EA] bg-[#F9FAFB] font-semibold">
                            <td className="py-2.5 px-3 text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10">Total</td>
                            {weekLabels.map((_, wi) => {
                                const weekTotal = rows.reduce((s, r) => s + r.counts[wi], 0);
                                return <td key={wi} className="py-2.5 px-1.5 text-center text-[#1A1F2B]">{weekTotal > 0 ? weekTotal : '—'}</td>;
                            })}
                            <td className="py-2.5 px-2 text-center text-[#2563EB] border-l-2 border-[#E2E5EA]">{rows.reduce((s, r) => s + r.total, 0)}</td>
                            <td className="py-2.5 px-2 text-center text-[#4A5568]">{(rows.reduce((s, r) => s + r.total, 0) / trailingWeeks).toFixed(1)}</td>
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
                <h3 className="text-sm font-semibold text-[#1A1F2B]">Concession History</h3>
                <p className="text-xs text-[#7A8599]">Tracked concession periods by property.</p>
            </div>
            {comps.map((c, ci) => {
                const concessions = c.concessions.sort((a: HellodataConcession, b: HellodataConcession) => (b.from_date || '').localeCompare(a.from_date || ''));
                const latest = concessions[0];
                const freeMonths = concessions.filter((cc: HellodataConcession) => {
                    const items = cc.items as { free_months_count?: number }[] | null;
                    return items?.some(it => it.free_months_count && it.free_months_count > 0);
                });
                return (
                    <div key={ci} className="border border-[#E2E5EA] rounded-xl overflow-hidden">
                        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-[#F9FAFB] border-b border-[#E2E5EA] flex flex-col sm:flex-row sm:items-center gap-1 sm:justify-between">
                            <h4 className="text-sm font-semibold text-[#1A1F2B]">{c.name}</h4>
                            <span className="text-[10px] text-[#A0AABB]">{concessions.length} concession periods tracked</span>
                        </div>
                        <div className="p-3 space-y-2">
                            {latest && (
                                <div className="bg-[#EBF1FF] rounded-lg px-3 py-2 text-xs">
                                    <span className="font-medium text-[#2563EB]">Latest: </span>
                                    <span className="text-[#4A5568]">{latest.concession_text?.slice(0, 150) || 'No details'}</span>
                                    {latest.from_date && <span className="text-[#7A8599]"> ({latest.from_date} → {latest.to_date || 'ongoing'})</span>}
                                </div>
                            )}
                            {freeMonths.length > 0 && (
                                <p className="text-xs text-[#7A8599]">
                                    {freeMonths.length} of {concessions.length} periods included free month(s)
                                </p>
                            )}
                            {concessions.length === 0 && <p className="text-xs text-[#7A8599] text-center py-4">No concession data</p>}
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
                <h3 className="text-sm font-semibold text-[#1A1F2B]">Fees & Other Income</h3>
                <p className="text-xs text-[#7A8599]">Fee comparison across comp set — informs other income projections.</p>
            </div>
            <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                <table className="w-full text-xs min-w-[400px]">
                    <thead>
                        <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                            <th className="text-left py-2.5 px-4 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[120px]">Fee</th>
                            {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[#2563EB] min-w-[100px] truncate">{c.name}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {feeRows.map((row, ri) => (
                            <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                <td className="py-2 px-4 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">{row.label}</td>
                                {comps.map((c, ci) => {
                                    const fees = c.property.fees as Record<string, unknown> | null;
                                    return <td key={ci} className="py-2 px-3 text-center text-[#1A1F2B]">{fmtFee(fees?.[row.key])}</td>;
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
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Building Quality Scores</h3>
                    <p className="text-xs text-[#7A8599]">AI-scored quality ratings from property photos (0-100%).</p>
                </div>
                <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[120px]">Quality</th>
                                {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[#2563EB] min-w-[110px] truncate">{c.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {qualityKeys.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                    <td className="py-2 px-4 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {comps.map((c, ci) => {
                                        const q = c.property.building_quality as Record<string, number> | null;
                                        const val = q?.[row.key];
                                        const pct = val !== undefined && val !== null ? Math.round(val * 100) : null;
                                        return (
                                            <td key={ci} className="py-2 px-3">
                                                {pct !== null ? (
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <div className="w-16 h-2 bg-[#F4F5F7] rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct > 80 ? '#22C55E' : pct > 60 ? '#F59E0B' : '#EF4444' }} />
                                                        </div>
                                                        <span className="font-medium text-[#1A1F2B] w-8">{pct}%</span>
                                                    </div>
                                                ) : <span className="text-[#A0AABB] text-center block">—</span>}
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
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Review Sentiment</h3>
                    <p className="text-xs text-[#7A8599]">Positive & negative review counts by category.</p>
                </div>
                <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[120px]">Category</th>
                                {comps.map((c, i) => (
                                    <th key={i} className="text-center py-2.5 px-3 font-semibold text-[#2563EB] min-w-[110px] truncate" colSpan={1}>
                                        {c.name}
                                        {c.property.review_analysis?.count_reviews ? <div className="text-[10px] font-normal text-[#7A8599]">{c.property.review_analysis.count_reviews} reviews · {((c.property.review_analysis.avg_score ?? 0) * 100).toFixed(0)}% positive</div> : null}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sentimentKeys.map((key, ri) => (
                                <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                    <td className="py-2 px-4 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10 capitalize">{key.replace(/_/g, ' ')}</td>
                                    {comps.map((c, ci) => {
                                        const pos = (c.property.review_analysis?.positive_counts as Record<string, number> | undefined)?.[key] ?? 0;
                                        const neg = (c.property.review_analysis?.negative_counts as Record<string, number> | undefined)?.[key] ?? 0;
                                        return (
                                            <td key={ci} className="py-2 px-3 text-center">
                                                <span className="text-[#22C55E] font-medium">+{pos}</span>
                                                <span className="text-[#A0AABB] mx-1">/</span>
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
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Pricing Strategy</h3>
                    <p className="text-xs text-[#7A8599]">Revenue management and pricing behavior intelligence.</p>
                </div>
                <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[140px]">Metric</th>
                                {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[#2563EB] min-w-[110px] truncate">{c.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: 'Revenue Management', fn: (c: PropertyMetrics) => c.property.pricing_strategy?.is_using_rev_management ? '✓ Yes' : '✗ No' },
                                { label: 'Avg Price Change', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.avg_price_change; return v != null ? `${(v * 100).toFixed(1)}%` : '—'; } },
                                { label: 'Avg Update Frequency', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.avg_duration; return v != null ? `Every ${v.toFixed(1)} days` : '—'; } },
                                { label: 'Avg Days on Market', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.avg_time_on_market; return v != null ? `${v.toFixed(0)} days` : '—'; } },
                                { label: 'Price Updates Tracked', fn: (c: PropertyMetrics) => { const v = c.property.pricing_strategy?.count_prices; return v != null ? v.toLocaleString() : '—'; } },
                            ].map((row, ri) => (
                                <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                    <td className="py-2 px-4 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {comps.map((c, ci) => <td key={ci} className="py-2 px-3 text-center text-[#1A1F2B]">{row.fn(c)}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Demographics */}
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Demographics</h3>
                    <p className="text-xs text-[#7A8599]">Census tract demographics around each property.</p>
                </div>
                <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                    <table className="w-full text-xs min-w-[400px]">
                        <thead>
                            <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[140px]">Demographic</th>
                                {comps.map((c, i) => <th key={i} className="text-center py-2.5 px-3 font-semibold text-[#2563EB] min-w-[110px] truncate">{c.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {demoRows.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                    <td className="py-2 px-4 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {comps.map((c, ci) => {
                                        const d = c.property.demographics as Record<string, unknown> | null;
                                        const val = d?.[row.key];
                                        return <td key={ci} className="py-2 px-3 text-center text-[#1A1F2B]">{row.format === 'cur' ? fmtNum(val, '$') : row.format === 'pct' ? fmtPct(val) : fmtNum(val)}</td>;
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
    const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');

    const comp = comps[selectedComp];
    if (!comp) return <p className="text-sm text-[#7A8599] text-center py-8">No comp selected</p>;

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

    // Summary view: group by bed/bath
    const summaryRows = useMemo(() => {
        const groups: Record<string, {
            bed: number | null; bath: number | null;
            units: HellodataUnit[]; statuses: ('occupied' | 'vacant' | 'notice')[];
        }> = {};

        comp.units.forEach((u: HellodataUnit) => {
            const key = `${u.bed ?? 'N/A'}-${u.bath ?? 'N/A'}`;
            if (!groups[key]) groups[key] = { bed: u.bed, bath: u.bath, units: [], statuses: [] };
            groups[key].units.push(u);
            groups[key].statuses.push(getStatus(u));
        });

        return Object.values(groups)
            .sort((a, b) => (a.bed ?? -1) - (b.bed ?? -1) || (a.bath ?? -1) - (b.bath ?? -1))
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
                    label: g.bed === null ? 'N/A' : g.bed === 0 ? 'Studio' : `${g.bed} BR / ${g.bath ?? '?'} BA`,
                    count, occupied, vacant, notice,
                    avgRent, avgEff, avgSqft, rentPsf, effPsf, avgDom,
                    occupancyPct: count > 0 ? (occupied / count) * 100 : 0,
                };
            });
    }, [comp]);

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
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Estimated Rent Roll</h3>
                    <p className="text-xs text-[#7A8599]">Unit-level rent and occupancy data from HelloData listings.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={selectedComp} onChange={e => setSelectedComp(Number(e.target.value))}
                        className="text-[11px] sm:text-xs border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-[#4A5568] bg-white">
                        {comps.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                    </select>
                    <div className="flex rounded-lg border border-[#E2E5EA] overflow-hidden">
                        {(['summary', 'detail'] as const).map(m => (
                            <button key={m} onClick={() => setViewMode(m)}
                                className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium ${viewMode === m ? 'bg-[#2563EB] text-white' : 'text-[#7A8599] hover:bg-[#F4F5F7]'}`}>
                                {m === 'summary' ? 'By Type' : 'By Unit'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border border-[#E2E5EA] bg-white p-2.5">
                    <div className="text-[10px] text-[#7A8599] uppercase tracking-wider">Total Units</div>
                    <div className="text-base font-semibold text-[#1A1F2B]">{totalCount}</div>
                </div>
                <div className="rounded-lg border border-[#E2E5EA] bg-white p-2.5">
                    <div className="text-[10px] text-[#7A8599] uppercase tracking-wider">Occupied</div>
                    <div className="text-base font-semibold text-[#10B981]">{totalOccupied} <span className="text-xs font-normal text-[#7A8599]">({totalCount > 0 ? ((totalOccupied / totalCount) * 100).toFixed(1) : 0}%)</span></div>
                </div>
                <div className="rounded-lg border border-[#E2E5EA] bg-white p-2.5">
                    <div className="text-[10px] text-[#7A8599] uppercase tracking-wider">Vacant</div>
                    <div className="text-base font-semibold text-[#EF4444]">{totalVacant}</div>
                </div>
                <div className="rounded-lg border border-[#E2E5EA] bg-white p-2.5">
                    <div className="text-[10px] text-[#7A8599] uppercase tracking-wider">Avg Rent</div>
                    <div className="text-base font-semibold text-[#1A1F2B]">{fmt(comp.askingRent)}</div>
                </div>
            </div>

            {viewMode === 'summary' ? (
                <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                    <table className="w-full text-xs min-w-[700px]">
                        <thead>
                            <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                                <th className="text-left py-2.5 px-3 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10">Unit Type</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]"># Units</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#10B981]">Occupied</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#EF4444]">Vacant</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Occ %</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Avg SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Market Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Rent/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Eff. Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Eff/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Avg DOM</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaryRows.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                    <td className="py-2 px-3 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">{row.label}</td>
                                    <td className="py-2 px-2 text-center font-medium">{row.count}</td>
                                    <td className="py-2 px-2 text-center text-[#10B981] font-medium">{row.occupied}</td>
                                    <td className="py-2 px-2 text-center text-[#EF4444] font-medium">{row.vacant}{row.notice > 0 ? <span className="text-[#F59E0B]"> +{row.notice}</span> : ''}</td>
                                    <td className="py-2 px-2 text-center">
                                        <span className={`font-medium ${row.occupancyPct >= 95 ? 'text-[#10B981]' : row.occupancyPct >= 90 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>
                                            {row.occupancyPct.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="py-2 px-2 text-center">{row.avgSqft ? `${Math.round(row.avgSqft)} ft²` : '—'}</td>
                                    <td className="py-2 px-2 text-center font-medium">{fmt(row.avgRent)}</td>
                                    <td className="py-2 px-2 text-center">{fmt(row.rentPsf, 2)}/sf</td>
                                    <td className="py-2 px-2 text-center font-medium">{fmt(row.avgEff)}</td>
                                    <td className="py-2 px-2 text-center">{fmt(row.effPsf, 2)}/sf</td>
                                    <td className="py-2 px-2 text-center text-[#7A8599]">{row.avgDom !== null ? `${Math.round(row.avgDom)}d` : '—'}</td>
                                </tr>
                            ))}
                            {/* Totals */}
                            <tr className="border-t-2 border-[#E2E5EA] bg-[#F9FAFB] font-semibold">
                                <td className="py-2.5 px-3 text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10">Total / Avg</td>
                                <td className="py-2.5 px-2 text-center">{totalCount}</td>
                                <td className="py-2.5 px-2 text-center text-[#10B981]">{totalOccupied}</td>
                                <td className="py-2.5 px-2 text-center text-[#EF4444]">{totalVacant}</td>
                                <td className="py-2.5 px-2 text-center">{totalCount > 0 ? `${((totalOccupied / totalCount) * 100).toFixed(1)}%` : '—'}</td>
                                <td className="py-2.5 px-2 text-center">{comp.avgSqft ? `${Math.round(comp.avgSqft)} ft²` : '—'}</td>
                                <td className="py-2.5 px-2 text-center">{fmt(comp.askingRent)}</td>
                                <td className="py-2.5 px-2 text-center">{comp.rentPSF ? `${fmt(comp.rentPSF, 2)}/sf` : '—'}</td>
                                <td className="py-2.5 px-2 text-center">{fmt(comp.effectiveRent)}</td>
                                <td className="py-2.5 px-2 text-center">{comp.effectiveRent && comp.avgSqft ? `${fmt(comp.effectiveRent / comp.avgSqft, 2)}/sf` : '—'}</td>
                                <td className="py-2.5 px-2 text-center text-[#7A8599]">{comp.avgDaysOnMarket !== null ? `${Math.round(comp.avgDaysOnMarket)}d` : '—'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                    <table className="w-full text-xs min-w-[750px]">
                        <thead>
                            <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                                <th className="text-left py-2.5 px-3 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10">Unit</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Type</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Status</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Market Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Rent/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Eff. Rent</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">Eff/SF</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-[#4A5568]">DOM</th>
                                <th className="text-left py-2.5 px-2 font-semibold text-[#4A5568]">Floorplan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detailRows.map((row, ri) => (
                                <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                    <td className="py-1.5 px-3 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">{row.unit}</td>
                                    <td className="py-1.5 px-2 text-center">{row.bed === null ? '—' : row.bed === 0 ? 'Studio' : `${row.bed}/${row.bath ?? '?'}`}</td>
                                    <td className="py-1.5 px-2 text-center">{row.sqft ? `${row.sqft}` : '—'}</td>
                                    <td className="py-1.5 px-2 text-center">
                                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${row.status === 'occupied' ? 'bg-[#ECFDF5] text-[#10B981]' :
                                                row.status === 'notice' ? 'bg-[#FEF3C7] text-[#92400E]' :
                                                    'bg-[#FEF2F2] text-[#EF4444]'
                                            }`}>
                                            {row.status === 'occupied' ? 'Leased' : row.status === 'notice' ? 'Notice' : 'Vacant'}
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-2 text-center font-medium">{fmt(row.rent)}</td>
                                    <td className="py-1.5 px-2 text-center">{fmt(row.rentPsf, 2)}/sf</td>
                                    <td className="py-1.5 px-2 text-center font-medium">{fmt(row.effRent)}</td>
                                    <td className="py-1.5 px-2 text-center">{fmt(row.effPsf, 2)}/sf</td>
                                    <td className="py-1.5 px-2 text-center text-[#7A8599]">{row.dom !== null ? `${row.dom}d` : '—'}</td>
                                    <td className="py-1.5 px-2 text-left text-[#7A8599] truncate max-w-[120px]">{row.floorplan || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {detailRows.length === 0 && <p className="text-sm text-[#7A8599] text-center py-8">No unit data available</p>}
                </div>
            )}
        </div>
    );
}
