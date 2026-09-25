'use client';

import { useState, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAnalyticsData, useStages, useProductTypes } from '@/hooks/useSupabaseQueries';
import {
    Loader2,
    AlertCircle,
    TrendingUp,
    Calendar,
    ArrowRight,
    Building2,
    Target,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    FunnelChart,
    Funnel,
    LabelList,
    PieChart,
    Pie,
} from 'recharts';
import type { PursuitStage } from '@/types';

// ── Time Period ──────────────────────────────────────────────
type TimePeriod = 'ytd' | 'prior_year' | 'all_time' | 'custom';

/** Parse a <input type="date"> value (YYYY-MM-DD) as a LOCAL calendar date. */
function parseLocalDate(value: string, endOfDay = false): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (endOfDay) d.setHours(23, 59, 59, 999);
    return d;
}

function getDateRange(period: TimePeriod, customStart?: string, customEnd?: string): { start: Date; end: Date } {
    const now = new Date();
    switch (period) {
        case 'ytd':
            return { start: new Date(now.getFullYear(), 0, 1), end: now };
        case 'prior_year':
            // End is the last millisecond of Dec 31 (midnight Dec 31 dropped that whole day)
            return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) };
        case 'all_time':
            return { start: new Date(0), end: now };
        case 'custom':
            // new Date('YYYY-MM-DD') is UTC midnight — the previous evening in US time zones —
            // and the end date excluded everything created on that day. Use local, inclusive bounds.
            return {
                start: (customStart && parseLocalDate(customStart)) || new Date(now.getFullYear(), 0, 1),
                end: (customEnd && parseLocalDate(customEnd, true)) || now,
            };
    }
}

// ── Stage roles ──────────────────────────────────────────────
// Stages are admin-editable, so roles come from stage data rather than names:
//  - pipeline:  counts_toward_forecast = true, in sort_order (the funnel)
//  - terminal:  counts_toward_forecast = false (left the pipeline)
//  - won:       the terminal stage(s) that mean the deal closed — named like
//               "Closed"/"Won"/"Acquired", else the first terminal stage
//               ordered right after the pipeline
//  - lost:      every other terminal stage (Passed, Dead, Inactive…)
// Before migration 20260921000000 the flag is absent; fall back to names.
const TERMINAL_NAME_FALLBACK = /^(closed|passed|dead|inactive|lost|won|acquired)\b/i;
const WON_NAME = /\b(closed|close|won|acquired|purchased)\b/i;

interface StageRoles {
    ordered: PursuitStage[];
    pipeline: PursuitStage[];
    won: PursuitStage[];
    lost: PursuitStage[];
}

function deriveStageRoles(stages: PursuitStage[]): StageRoles {
    const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const hasFlag = ordered.some(s => typeof s.counts_toward_forecast === 'boolean');
    const isTerminal = (s: PursuitStage) =>
        hasFlag ? s.counts_toward_forecast === false : TERMINAL_NAME_FALLBACK.test(s.name);
    const pipeline = ordered.filter(s => !isTerminal(s));
    const terminal = ordered.filter(isTerminal);

    let won = terminal.filter(s => WON_NAME.test(s.name));
    if (won.length === 0) {
        const lastPipelineOrder = pipeline.length ? pipeline[pipeline.length - 1].sort_order : -Infinity;
        const next = terminal.find(s => s.sort_order > lastPipelineOrder);
        won = next ? [next] : [];
    }
    const wonIds = new Set(won.map(s => s.id));
    const lost = terminal.filter(s => !wonIds.has(s.id));
    return { ordered, pipeline, won, lost };
}

const TOOLTIP_STYLE = {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: 'var(--shadow-dropdown)',
};

function isInPeriod(dateStr: string, start: Date, end: Date): boolean {
    const d = new Date(dateStr);
    return d >= start && d <= end;
}

export default function AnalyticsPage() {
    const { data: analyticsData, isLoading, isError, error, refetch } = useAnalyticsData();
    const { data: stages = [] } = useStages();
    const { data: productTypes = [] } = useProductTypes();

    const [period, setPeriod] = useState<TimePeriod>('ytd');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [regionFilter, setRegionFilter] = useState('');
    const [productTypeFilter, setProductTypeFilter] = useState('');

    const stageRoles = useMemo(() => deriveStageRoles(stages), [stages]);
    const { ordered: orderedStages, pipeline: pipelineStages } = stageRoles;

    // Unique regions
    const regions = useMemo(() => {
        if (!analyticsData) return [];
        const unique = new Set(analyticsData.pursuits.map(p => p.region).filter(Boolean));
        return Array.from(unique).sort();
    }, [analyticsData]);

    // Date range
    // Memoized so the filter memos below aren't invalidated by a fresh `now` on every render
    const { start: dateStart, end: dateEnd } = useMemo(
        () => getDateRange(period, customStart, customEnd),
        // analyticsData: recompute `now` when fresh data arrives
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [period, customStart, customEnd, analyticsData]
    );

    // Pursuits with a one-pager of the selected product type (one pass, not per pursuit)
    const productTypeIdsByPursuit = useMemo(() => {
        if (!analyticsData || !productTypeFilter) return null;
        return new Set(analyticsData.onePagers.filter(op => op.product_type_id === productTypeFilter).map(op => op.pursuit_id));
    }, [analyticsData, productTypeFilter]);

    // ── Filtered pursuits ──────────────────────────────────
    const filteredPursuits = useMemo(() => {
        if (!analyticsData) return [];
        return analyticsData.pursuits.filter(p => {
            // Time filter: created_at in period
            if (!isInPeriod(p.created_at, dateStart, dateEnd)) return false;
            // Region filter
            if (regionFilter && p.region !== regionFilter) return false;
            // Product type filter (check one-pagers)
            if (productTypeIdsByPursuit && !productTypeIdsByPursuit.has(p.id)) return false;
            // Exclude archived
            if (p.is_archived) return false;
            return true;
        });
    }, [analyticsData, dateStart, dateEnd, regionFilter, productTypeIdsByPursuit]);

    // ── Stage distribution (current stage of filtered pursuits) ──
    const stageDistribution = useMemo(() => {
        const counts = new Map<string, number>();
        orderedStages.forEach(s => counts.set(s.id, 0));
        filteredPursuits.forEach(p => {
            if (p.stage_id && counts.has(p.stage_id)) {
                counts.set(p.stage_id, (counts.get(p.stage_id) || 0) + 1);
            }
        });
        // Retired (inactive) stages only appear while pursuits still sit in them
        return orderedStages.filter(s => s.is_active || (counts.get(s.id) || 0) > 0).map(s => ({
            name: s.name,
            value: counts.get(s.id) || 0,
            color: s.color,
            stageId: s.id,
        }));
    }, [filteredPursuits, orderedStages]);

    // ── Funnel data (how many ever reached each stage) ────────
    const funnelData = useMemo(() => {
        if (!analyticsData) return [];
        const pursuitIds = new Set(filteredPursuits.map(p => p.id));
        const pipelineIndex = new Map(pipelineStages.map((s, i) => [s.id, i]));
        const wonIds = new Set(stageRoles.won.map(s => s.id));

        // Furthest pipeline stage each pursuit is known to have reached — from
        // stage history and from its current stage. Reaching a stage implies the
        // earlier ones (if you're at LOI, you went through Screening).
        const furthest = new Map<string, number>();
        const reach = (pursuitId: string, idx: number) => {
            if (idx > (furthest.get(pursuitId) ?? -1)) furthest.set(pursuitId, idx);
        };
        analyticsData.stageHistory.forEach(sh => {
            if (!pursuitIds.has(sh.pursuit_id)) return;
            const idx = pipelineIndex.get(sh.stage_id);
            if (idx !== undefined) reach(sh.pursuit_id, idx);
        });
        filteredPursuits.forEach(p => {
            if (!p.stage_id) return;
            const idx = pipelineIndex.get(p.stage_id);
            if (idx !== undefined) reach(p.id, idx);
            // A closed deal went through the whole pipeline. A passed/dead deal only
            // counts for the stages its history shows (it used to count for all of them).
            else if (wonIds.has(p.stage_id)) reach(p.id, pipelineStages.length - 1);
            else if (!furthest.has(p.id) && pipelineStages.length > 0) reach(p.id, 0);
        });

        const counts = pipelineStages.map(() => 0);
        furthest.forEach(idx => {
            for (let i = 0; i <= idx; i++) counts[i]++;
        });

        return pipelineStages.map((s, i) => ({
            name: s.name,
            value: counts[i],
            fill: s.color,
        }));
    }, [analyticsData, filteredPursuits, pipelineStages, stageRoles.won]);

    // ── KPI metrics ──────────────────────────────────────────
    const kpis = useMemo(() => {
        const total = filteredPursuits.length;
        const wonIds = new Set(stageRoles.won.map(s => s.id));
        const lostIds = new Set(stageRoles.lost.map(s => s.id));

        const closed = filteredPursuits.filter(p => p.stage_id && wonIds.has(p.stage_id)).length;
        const lost = filteredPursuits.filter(p => p.stage_id && lostIds.has(p.stage_id)).length;
        const active = total - closed - lost;

        const conversionRate = total > 0 ? (closed / total) * 100 : 0;

        return { total, active, closed, lost, conversionRate };
    }, [filteredPursuits, stageRoles]);

    const wonLabel = stageRoles.won.length === 1 ? stageRoles.won[0].name : 'Closed';
    const lostLabel = stageRoles.lost.length > 0 && stageRoles.lost.length <= 2
        ? stageRoles.lost.map(s => s.name).join(' / ')
        : 'Exited';

    // ── Conversion rates between stages ──────────────────────
    const conversionRates = useMemo(() => {
        const pipelineFunnel = funnelData;
        const rates: { from: string; to: string; fromCount: number; toCount: number; rate: number }[] = [];
        for (let i = 0; i < pipelineFunnel.length - 1; i++) {
            const from = pipelineFunnel[i];
            const to = pipelineFunnel[i + 1];
            rates.push({
                from: from.name,
                to: to.name,
                fromCount: from.value,
                toCount: to.value,
                rate: from.value > 0 ? (to.value / from.value) * 100 : 0,
            });
        }
        return rates;
    }, [funnelData]);

    // ── Outcome pie chart ────────────────────────────────────
    // One slice per terminal stage, in that stage's own color
    const outcomeData = useMemo(() => {
        const byStage = new Map<string, number>();
        filteredPursuits.forEach(p => { if (p.stage_id) byStage.set(p.stage_id, (byStage.get(p.stage_id) || 0) + 1); });
        return [
            { name: 'Active', value: kpis.active, color: 'var(--accent)' },
            ...[...stageRoles.won, ...stageRoles.lost].map(s => ({ name: s.name, value: byStage.get(s.id) || 0, color: s.color })),
        ].filter(d => d.value > 0);
    }, [filteredPursuits, kpis.active, stageRoles]);

    return (
        <AppShell>
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
                {/* ── Header & Filters ──────────────────── */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-[var(--accent)]" />
                            Pipeline Analytics
                        </h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                            Track pursuit flow through your deal pipeline
                        </p>
                    </div>
                </div>

                {/* Filters bar */}
                <div className="flex flex-wrap items-center gap-3 mb-8 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                    <Calendar className="w-4 h-4 text-[var(--text-muted)]" aria-hidden />

                    {/* Time period */}
                    <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5">
                        {[
                            { key: 'ytd' as TimePeriod, label: 'YTD' },
                            { key: 'prior_year' as TimePeriod, label: 'Prior Year' },
                            { key: 'all_time' as TimePeriod, label: 'All Time' },
                            { key: 'custom' as TimePeriod, label: 'Custom' },
                        ].map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setPeriod(opt.key)}
                                aria-pressed={period === opt.key}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === opt.key
                                    ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {period === 'custom' && (
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                aria-label="Start date"
                                value={customStart}
                                max={customEnd || undefined}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
                            />
                            <span className="text-xs text-[var(--text-faint)]">to</span>
                            <input
                                type="date"
                                aria-label="End date"
                                value={customEnd}
                                min={customStart || undefined}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
                            />
                        </div>
                    )}

                    <div className="w-px h-6 bg-[var(--border)] mx-1" />

                    {regions.length > 0 && (
                        <select
                            aria-label="Region"
                            value={regionFilter}
                            onChange={(e) => setRegionFilter(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
                        >
                            <option value="">All Regions</option>
                            {regions.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    )}

                    {productTypes.length > 0 && (
                        <select
                            aria-label="Product type"
                            value={productTypeFilter}
                            onChange={(e) => setProductTypeFilter(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
                        >
                            <option value="">All Products</option>
                            {productTypes.filter(pt => pt.is_active).map(pt => (
                                <option key={pt.id} value={pt.id}>{pt.name}</option>
                            ))}
                        </select>
                    )}

                    <span className="ml-auto text-[11px] text-[var(--text-muted)]" aria-live="polite">
                        {filteredPursuits.length} pursuit{filteredPursuits.length !== 1 ? 's' : ''} in period
                    </span>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-24" role="status" aria-label="Loading analytics">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--text-faint)]" />
                    </div>
                ) : isError ? (
                    <div role="alert" className="flex flex-col items-center justify-center py-24 text-center">
                        <AlertCircle className="w-8 h-8 text-[var(--danger)] mb-3" aria-hidden />
                        <h2 className="text-base font-semibold text-[var(--text-secondary)] mb-1">Couldn&rsquo;t load analytics</h2>
                        <p className="text-sm text-[var(--text-muted)] max-w-md">{error instanceof Error ? error.message : 'Check your connection and try again.'}</p>
                        <button onClick={() => refetch()} className="mt-5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors">
                            Try again
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ── KPI Cards ─────────────────────────── */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
                            {[
                                { label: 'Total Deals', value: kpis.total, icon: Building2, color: 'var(--accent)', bg: 'var(--accent-subtle)' },
                                { label: 'Active Pipeline', value: kpis.active, icon: Target, color: 'var(--info)', bg: 'var(--info-bg)' },
                                { label: wonLabel, value: kpis.closed, icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-bg)' },
                                { label: lostLabel, value: kpis.lost, icon: XCircle, color: 'var(--danger)', bg: 'var(--danger-bg)' },
                                { label: 'Close Rate', value: `${kpis.conversionRate.toFixed(1)}%`, icon: TrendingUp, color: 'var(--review)', bg: 'var(--review-bg)' },
                            ].map((kpi) => (
                                <div key={kpi.label} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider truncate" title={kpi.label}>{kpi.label}</span>
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.bg }}>
                                            <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} aria-hidden />
                                        </div>
                                    </div>
                                    <div className="text-2xl font-bold text-[var(--text-primary)]">{kpi.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* ── Charts Row ─────────────────────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                            {/* Pipeline Funnel */}
                            <div className="lg:col-span-2 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6">
                                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Pipeline Funnel</h2>
                                <p className="text-[11px] text-[var(--text-faint)] mb-4">Pursuits that reached each stage (cumulative)</p>
                                {funnelData.length > 0 && funnelData.some(d => d.value > 0) ? (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <FunnelChart>
                                            <Tooltip
                                                contentStyle={TOOLTIP_STYLE}
                                                formatter={(value: any, name: any) => [`${value} pursuits`, name]}
                                            />
                                            <Funnel
                                                data={funnelData}
                                                dataKey="value"
                                                nameKey="name"
                                                isAnimationActive
                                            >
                                                <LabelList
                                                    position="right"
                                                    content={(props: any) => {
                                                        const { x, y, width, height, value, name } = props;
                                                        return (
                                                            <text x={x + width + 10} y={y + height / 2} textAnchor="start" dominantBaseline="central" className="text-xs fill-[var(--text-secondary)] font-medium">
                                                                {name}: {value}
                                                            </text>
                                                        );
                                                    }}
                                                />
                                                {funnelData.map((entry, idx) => (
                                                    <Cell key={idx} fill={entry.fill} />
                                                ))}
                                            </Funnel>
                                        </FunnelChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-[320px] text-sm text-[var(--text-faint)]">
                                        No funnel data for this period
                                    </div>
                                )}
                            </div>

                            {/* Outcome Distribution */}
                            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6">
                                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Outcome Distribution</h2>
                                <p className="text-[11px] text-[var(--text-faint)] mb-4">Current status of deals in period</p>
                                {outcomeData.length > 0 ? (
                                    <div>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <PieChart>
                                                <Pie
                                                    data={outcomeData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={55}
                                                    outerRadius={80}
                                                    dataKey="value"
                                                    strokeWidth={2}
                                                    stroke="var(--bg-card)"
                                                >
                                                    {outcomeData.map((entry, idx) => (
                                                        <Cell key={idx} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={TOOLTIP_STYLE}
                                                    formatter={(value: any) => [`${value} pursuits`]}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="flex flex-wrap justify-center gap-3 mt-2">
                                            {outcomeData.map(d => (
                                                <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                                                    {d.name} ({d.value})
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-[200px] text-sm text-[var(--text-faint)]">
                                        No data
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Stage Distribution Bar Chart ─────── */}
                        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6 mb-8">
                            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Current Stage Distribution</h2>
                            <p className="text-[11px] text-[var(--text-faint)] mb-4">Where pursuits currently sit in the pipeline</p>
                            <ResponsiveContainer width="100%" height={Math.max(160, stageDistribution.length * 36 + 24)}>
                                <BarChart data={stageDistribution} layout="vertical" margin={{ left: 20, right: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--table-row-border)" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 500 }} width={120} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        formatter={(value: any) => [`${value} pursuits`, 'Count']}
                                    />
                                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                                        {stageDistribution.map((entry, idx) => (
                                            <Cell key={idx} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* ── Conversion Rates Table ─────────── */}
                        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6">
                            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Stage Conversion Rates</h2>
                            <p className="text-[11px] text-[var(--text-faint)] mb-4">Progression rates between pipeline stages</p>
                            {conversionRates.length > 0 ? (
                                <div className="overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-[var(--border)]">
                                                <th className="text-left py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">From</th>
                                                <th className="text-center py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider w-8"></th>
                                                <th className="text-left py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">To</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Entered</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Advanced</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Conversion</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {conversionRates.map((cr, idx) => (
                                                <tr key={idx} className="border-b border-[var(--table-row-border)] last:border-0 hover:bg-[var(--bg-primary)]">
                                                    <td className="py-3 px-3 font-medium text-[var(--text-primary)]">{cr.from}</td>
                                                    <td className="py-3 px-3 text-center text-[var(--text-faint)]"><ArrowRight className="w-3.5 h-3.5 inline" aria-label="to" /></td>
                                                    <td className="py-3 px-3 font-medium text-[var(--text-primary)]">{cr.to}</td>
                                                    <td className="py-3 px-3 text-right text-[var(--text-secondary)] font-mono">{cr.fromCount}</td>
                                                    <td className="py-3 px-3 text-right text-[var(--text-secondary)] font-mono">{cr.toCount}</td>
                                                    <td className="py-3 px-3 text-right">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${cr.rate >= 75 ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                                                            cr.rate >= 25 ? 'bg-[var(--warning-bg)] text-[var(--warning)]' :
                                                                'bg-[var(--danger-bg)] text-[var(--danger)]'
                                                            }`}>
                                                            {cr.rate.toFixed(0)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-sm text-[var(--text-faint)]">
                                    No stage transitions recorded for this period
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </AppShell>
    );
}
