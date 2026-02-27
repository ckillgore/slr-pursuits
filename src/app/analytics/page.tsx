'use client';

import { useState, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAnalyticsData, useStages, useProductTypes } from '@/hooks/useSupabaseQueries';
import {
    Loader2,
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
import type { Pursuit, PursuitStage, PursuitStageHistory } from '@/types';

// ── Time Period ──────────────────────────────────────────────
type TimePeriod = 'ytd' | 'prior_year' | 'all_time' | 'custom';

function getDateRange(period: TimePeriod, customStart?: string, customEnd?: string): { start: Date; end: Date } {
    const now = new Date();
    switch (period) {
        case 'ytd':
            return { start: new Date(now.getFullYear(), 0, 1), end: now };
        case 'prior_year':
            return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31) };
        case 'all_time':
            return { start: new Date(2020, 0, 1), end: now };
        case 'custom':
            return {
                start: customStart ? new Date(customStart) : new Date(now.getFullYear(), 0, 1),
                end: customEnd ? new Date(customEnd) : now,
            };
    }
}

// ── Helpers ──────────────────────────────────────────────────
const PIPELINE_STAGES = ['Screening', 'Initial Analysis', 'LOI', 'Under Contract', 'Due Diligence'];
const TERMINAL_STAGES = ['Closed', 'Passed', 'Dead'];

function isInPeriod(dateStr: string, start: Date, end: Date): boolean {
    const d = new Date(dateStr);
    return d >= start && d <= end;
}

export default function AnalyticsPage() {
    const { data: analyticsData, isLoading } = useAnalyticsData();
    const { data: stages = [] } = useStages();
    const { data: productTypes = [] } = useProductTypes();

    const [period, setPeriod] = useState<TimePeriod>('ytd');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [regionFilter, setRegionFilter] = useState('');
    const [productTypeFilter, setProductTypeFilter] = useState('');

    // Map stage id → stage
    const stageMap = useMemo(() => {
        const m = new Map<string, PursuitStage>();
        stages.forEach(s => m.set(s.id, s));
        return m;
    }, [stages]);

    // Get sorted pipeline stages in order
    const orderedStages = useMemo(() => {
        return [...PIPELINE_STAGES, ...TERMINAL_STAGES]
            .map(name => stages.find(s => s.name === name))
            .filter(Boolean) as PursuitStage[];
    }, [stages]);

    const pipelineStageIds = useMemo(() => {
        return new Set(orderedStages.filter(s => PIPELINE_STAGES.includes(s.name)).map(s => s.id));
    }, [orderedStages]);

    // Unique regions
    const regions = useMemo(() => {
        if (!analyticsData) return [];
        const unique = new Set(analyticsData.pursuits.map(p => p.region).filter(Boolean));
        return Array.from(unique).sort();
    }, [analyticsData]);

    // Date range
    const { start: dateStart, end: dateEnd } = getDateRange(period, customStart, customEnd);

    // ── Filtered pursuits ──────────────────────────────────
    const filteredPursuits = useMemo(() => {
        if (!analyticsData) return [];
        return analyticsData.pursuits.filter(p => {
            // Time filter: created_at in period
            if (!isInPeriod(p.created_at, dateStart, dateEnd)) return false;
            // Region filter
            if (regionFilter && p.region !== regionFilter) return false;
            // Product type filter (check one-pagers)
            if (productTypeFilter) {
                const pursuitOps = analyticsData.onePagers.filter(op => op.pursuit_id === p.id);
                if (!pursuitOps.some(op => op.product_type_id === productTypeFilter)) return false;
            }
            // Exclude archived
            if (p.is_archived) return false;
            return true;
        });
    }, [analyticsData, dateStart, dateEnd, regionFilter, productTypeFilter]);

    // ── Stage distribution (current stage of filtered pursuits) ──
    const stageDistribution = useMemo(() => {
        const counts = new Map<string, number>();
        orderedStages.forEach(s => counts.set(s.id, 0));
        filteredPursuits.forEach(p => {
            if (p.stage_id && counts.has(p.stage_id)) {
                counts.set(p.stage_id, (counts.get(p.stage_id) || 0) + 1);
            }
        });
        return orderedStages.map(s => ({
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
        // For each stage, count how many of the filtered pursuits ever reached it
        // A pursuit "reached" a stage if it had a stage history entry with that stage
        // OR if its current stage is at or past that stage
        const reachedCounts = new Map<string, Set<string>>();
        orderedStages.forEach(s => reachedCounts.set(s.id, new Set()));

        // From stage history
        analyticsData.stageHistory.forEach(sh => {
            if (!pursuitIds.has(sh.pursuit_id)) return;
            if (reachedCounts.has(sh.stage_id)) {
                reachedCounts.get(sh.stage_id)!.add(sh.pursuit_id);
            }
        });

        // From current stage
        filteredPursuits.forEach(p => {
            if (p.stage_id && reachedCounts.has(p.stage_id)) {
                reachedCounts.get(p.stage_id)!.add(p.id);
            }
        });

        // Also mark all stages "before" the current stage as reached
        // (implicit: if you're at LOI, you went through Screening and Initial Analysis)
        const pipelineOrder = orderedStages.filter(s => PIPELINE_STAGES.includes(s.name));
        filteredPursuits.forEach(p => {
            if (!p.stage_id) return;
            const currentStage = stageMap.get(p.stage_id);
            if (!currentStage) return;
            const currentIdx = pipelineOrder.findIndex(s => s.id === currentStage.id);
            // For terminal stages, mark all pipeline stages as reached
            if (TERMINAL_STAGES.includes(currentStage.name)) {
                pipelineOrder.forEach(s => reachedCounts.get(s.id)?.add(p.id));
                reachedCounts.get(p.stage_id)?.add(p.id);
            } else if (currentIdx >= 0) {
                for (let i = 0; i <= currentIdx; i++) {
                    reachedCounts.get(pipelineOrder[i].id)?.add(p.id);
                }
            }
        });

        return orderedStages
            .filter(s => PIPELINE_STAGES.includes(s.name))
            .map(s => ({
                name: s.name,
                value: reachedCounts.get(s.id)?.size || 0,
                fill: s.color,
            }));
    }, [analyticsData, filteredPursuits, orderedStages, stageMap]);

    // ── KPI metrics ──────────────────────────────────────────
    const kpis = useMemo(() => {
        const total = filteredPursuits.length;
        const closedStage = stages.find(s => s.name === 'Closed');
        const passedStage = stages.find(s => s.name === 'Passed');
        const deadStage = stages.find(s => s.name === 'Dead');

        const closed = filteredPursuits.filter(p => p.stage_id === closedStage?.id).length;
        const passed = filteredPursuits.filter(p => p.stage_id === passedStage?.id).length;
        const dead = filteredPursuits.filter(p => p.stage_id === deadStage?.id).length;
        const active = total - closed - passed - dead;

        const conversionRate = total > 0 ? (closed / total) * 100 : 0;

        return { total, active, closed, passed, dead, conversionRate };
    }, [filteredPursuits, stages]);

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
    const outcomeData = useMemo(() => {
        return [
            { name: 'Active', value: kpis.active, color: '#3B82F6' },
            { name: 'Closed', value: kpis.closed, color: '#10B981' },
            { name: 'Passed', value: kpis.passed, color: '#EF4444' },
            { name: 'Dead', value: kpis.dead, color: '#6B7280' },
        ].filter(d => d.value > 0);
    }, [kpis]);

    return (
        <AppShell>
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
                {/* ── Header & Filters ──────────────────── */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-[#1A1F2B] flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-[#2563EB]" />
                            Pipeline Analytics
                        </h1>
                        <p className="text-sm text-[#7A8599] mt-1">
                            Track pursuit flow through your deal pipeline
                        </p>
                    </div>
                </div>

                {/* Filters bar */}
                <div className="flex flex-wrap items-center gap-3 mb-8 p-4 bg-white rounded-xl border border-[#E2E5EA]">
                    <Calendar className="w-4 h-4 text-[#7A8599]" />

                    {/* Time period */}
                    <div className="flex items-center rounded-lg bg-[#F4F5F7] p-0.5">
                        {[
                            { key: 'ytd' as TimePeriod, label: 'YTD' },
                            { key: 'prior_year' as TimePeriod, label: 'Prior Year' },
                            { key: 'all_time' as TimePeriod, label: 'All Time' },
                            { key: 'custom' as TimePeriod, label: 'Custom' },
                        ].map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setPeriod(opt.key)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === opt.key
                                    ? 'bg-white text-[#1A1F2B] shadow-sm'
                                    : 'text-[#7A8599] hover:text-[#4A5568]'
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
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-[#E2E5EA] text-xs text-[#4A5568] focus:border-[#2563EB] focus:outline-none"
                            />
                            <span className="text-xs text-[#A0AABB]">to</span>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="px-2 py-1.5 rounded-lg border border-[#E2E5EA] text-xs text-[#4A5568] focus:border-[#2563EB] focus:outline-none"
                            />
                        </div>
                    )}

                    <div className="w-px h-6 bg-[#E2E5EA] mx-1" />

                    {regions.length > 0 && (
                        <select
                            value={regionFilter}
                            onChange={(e) => setRegionFilter(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#E2E5EA] text-xs text-[#4A5568] focus:border-[#2563EB] focus:outline-none"
                        >
                            <option value="">All Regions</option>
                            {regions.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    )}

                    {productTypes.length > 0 && (
                        <select
                            value={productTypeFilter}
                            onChange={(e) => setProductTypeFilter(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#E2E5EA] text-xs text-[#4A5568] focus:border-[#2563EB] focus:outline-none"
                        >
                            <option value="">All Products</option>
                            {productTypes.filter(pt => pt.is_active).map(pt => (
                                <option key={pt.id} value={pt.id}>{pt.name}</option>
                            ))}
                        </select>
                    )}

                    <span className="ml-auto text-[11px] text-[#A0AABB]">
                        {filteredPursuits.length} pursuit{filteredPursuits.length !== 1 ? 's' : ''} in period
                    </span>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-24">
                        <Loader2 className="w-8 h-8 animate-spin text-[#C8CDD5]" />
                    </div>
                ) : (
                    <>
                        {/* ── KPI Cards ─────────────────────────── */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                            {[
                                { label: 'Total Deals', value: kpis.total, icon: Building2, color: '#2563EB', bg: '#EBF1FF' },
                                { label: 'Active Pipeline', value: kpis.active, icon: Target, color: '#3B82F6', bg: '#EFF6FF' },
                                { label: 'Closed', value: kpis.closed, icon: CheckCircle2, color: '#10B981', bg: '#ECFDF5' },
                                { label: 'Passed / Dead', value: kpis.passed + kpis.dead, icon: XCircle, color: '#EF4444', bg: '#FEF2F2' },
                                { label: 'Close Rate', value: `${kpis.conversionRate.toFixed(1)}%`, icon: TrendingUp, color: '#8B5CF6', bg: '#F5F3FF' },
                            ].map((kpi) => (
                                <div key={kpi.label} className="bg-white rounded-xl border border-[#E2E5EA] p-4 hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider">{kpi.label}</span>
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.bg }}>
                                            <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
                                        </div>
                                    </div>
                                    <div className="text-2xl font-bold text-[#1A1F2B]">{kpi.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* ── Charts Row ─────────────────────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                            {/* Pipeline Funnel */}
                            <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E5EA] p-6">
                                <h2 className="text-sm font-semibold text-[#1A1F2B] mb-1">Pipeline Funnel</h2>
                                <p className="text-[11px] text-[#A0AABB] mb-4">Pursuits that reached each stage (cumulative)</p>
                                {funnelData.length > 0 && funnelData.some(d => d.value > 0) ? (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <FunnelChart>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#fff',
                                                    border: '1px solid #E2E5EA',
                                                    borderRadius: '8px',
                                                    fontSize: '12px',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                                }}
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
                                                            <text x={x + width + 10} y={y + height / 2} textAnchor="start" dominantBaseline="central" className="text-xs fill-[#4A5568] font-medium">
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
                                    <div className="flex items-center justify-center h-[320px] text-sm text-[#A0AABB]">
                                        No funnel data for this period
                                    </div>
                                )}
                            </div>

                            {/* Outcome Distribution */}
                            <div className="bg-white rounded-xl border border-[#E2E5EA] p-6">
                                <h2 className="text-sm font-semibold text-[#1A1F2B] mb-1">Outcome Distribution</h2>
                                <p className="text-[11px] text-[#A0AABB] mb-4">Current status of deals in period</p>
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
                                                    stroke="#fff"
                                                >
                                                    {outcomeData.map((entry, idx) => (
                                                        <Cell key={idx} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: '#fff',
                                                        border: '1px solid #E2E5EA',
                                                        borderRadius: '8px',
                                                        fontSize: '12px',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                                    }}
                                                    formatter={(value: any) => [`${value} pursuits`]}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="flex flex-wrap justify-center gap-3 mt-2">
                                            {outcomeData.map(d => (
                                                <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-[#4A5568]">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                                                    {d.name} ({d.value})
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-[200px] text-sm text-[#A0AABB]">
                                        No data
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Stage Distribution Bar Chart ─────── */}
                        <div className="bg-white rounded-xl border border-[#E2E5EA] p-6 mb-8">
                            <h2 className="text-sm font-semibold text-[#1A1F2B] mb-1">Current Stage Distribution</h2>
                            <p className="text-[11px] text-[#A0AABB] mb-4">Where pursuits currently sit in the pipeline</p>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={stageDistribution} layout="vertical" margin={{ left: 20, right: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F4" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 11, fill: '#7A8599' }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#4A5568', fontWeight: 500 }} width={120} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#fff',
                                            border: '1px solid #E2E5EA',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                        }}
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
                        <div className="bg-white rounded-xl border border-[#E2E5EA] p-6">
                            <h2 className="text-sm font-semibold text-[#1A1F2B] mb-1">Stage Conversion Rates</h2>
                            <p className="text-[11px] text-[#A0AABB] mb-4">Progression rates between pipeline stages</p>
                            {conversionRates.length > 0 ? (
                                <div className="overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-[#E2E5EA]">
                                                <th className="text-left py-2 px-3 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">From</th>
                                                <th className="text-center py-2 px-3 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider w-8"></th>
                                                <th className="text-left py-2 px-3 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">To</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Entered</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Advanced</th>
                                                <th className="text-right py-2 px-3 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Conversion</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {conversionRates.map((cr, idx) => (
                                                <tr key={idx} className="border-b border-[#F0F1F4] last:border-0 hover:bg-[#FAFBFC]">
                                                    <td className="py-3 px-3 font-medium text-[#1A1F2B]">{cr.from}</td>
                                                    <td className="py-3 px-3 text-center text-[#A0AABB]"><ArrowRight className="w-3.5 h-3.5 inline" /></td>
                                                    <td className="py-3 px-3 font-medium text-[#1A1F2B]">{cr.to}</td>
                                                    <td className="py-3 px-3 text-right text-[#4A5568] font-mono">{cr.fromCount}</td>
                                                    <td className="py-3 px-3 text-right text-[#4A5568] font-mono">{cr.toCount}</td>
                                                    <td className="py-3 px-3 text-right">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${cr.rate >= 75 ? 'bg-[#ECFDF5] text-[#10B981]' :
                                                            cr.rate >= 50 ? 'bg-[#FFF7ED] text-[#F59E0B]' :
                                                                cr.rate >= 25 ? 'bg-[#FFF7ED] text-[#F97316]' :
                                                                    'bg-[#FEF2F2] text-[#EF4444]'
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
                                <div className="text-center py-8 text-sm text-[#A0AABB]">
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
