'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { 
    useAllPredevBudgets, 
    useAllFundingPartners,
    useAllFundingSplits,
    useAllPortfolioJobCostAggregates
} from '@/hooks/useSupabaseQueries';
import type { PredevBudget, PredevBudgetLineItem, MonthlyCell, PursuitFundingPartner, PursuitFundingSplit, PursuitStage } from '@/types';
import type { PredevBudgetReportRow } from '@/lib/supabase/queries';
import type { YardiMonthlyCostAggregate } from '@/app/actions/accounting';
import {
    Loader2,
    DollarSign,
    CalendarDays,
    ChevronRight,
    ChevronDown,
    ExternalLink,
    Filter,
    X,
    TrendingUp,
    BarChart3,
    Shield,
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';

// ── Helpers ─────────────────────────────────────────────────

function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isMonthClosed(monthKey: string, today: Date): boolean {
    const [y, m] = monthKey.split('-').map(Number);
    const monthEnd = new Date(y, m, 0); // day 0 of next month = last day of this month
    const daysSinceMonthEnd = Math.floor((today.getTime() - monthEnd.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceMonthEnd >= 15;
}

function isMonthPendingClose(monthKey: string, today: Date, currentMonth: string): boolean {
    if (monthKey >= currentMonth) return false;
    return !isMonthClosed(monthKey, today);
}

function getYardiActual(
    li: PredevBudgetLineItem,
    monthKey: string,
    aggs: YardiMonthlyCostAggregate[] | undefined
): number | null {
    if (!aggs || aggs.length === 0 || !li.yardi_cost_groups || li.yardi_cost_groups.length === 0) return null;
    let total = 0;
    let found = false;

    for (const groupStr of li.yardi_cost_groups) {
        const agg = aggs.find(a => a.category_code === groupStr && a.month === monthKey);
        if (agg) {
            total += agg.total_amount;
            found = true;
        }
    }

    return found ? total : null;
}

function effectiveValueForLineItem(
    li: PredevBudgetLineItem,
    monthKey: string,
    aggs: YardiMonthlyCostAggregate[] | undefined,
    today: Date
): number {
    const cell = li.monthly_values[monthKey] ?? { projected: 0, actual: null };
    const closed = isMonthClosed(monthKey, today);
    const yardiVal = getYardiActual(li, monthKey, aggs);

    if (closed) {
        if (!cell.manual_override && yardiVal !== null && yardiVal !== 0) {
            return yardiVal;
        } else if (cell.actual !== null && cell.actual !== undefined) {
            return cell.actual;
        }
        return cell.projected;
    } else {
        return (yardiVal ?? 0) + cell.projected; // Hybrid Math Fix
    }
}

function pursuitMonthTotal(
    budget: PredevBudget, 
    monthKey: string, 
    aggs: YardiMonthlyCostAggregate[] | undefined,
    today: Date,
    lineItemFilter?: Set<string>
): number {
    return (budget.line_items ?? [])
        .filter((li) => !lineItemFilter || lineItemFilter.has(li.label))
        .reduce((sum, li) => sum + effectiveValueForLineItem(li, monthKey, aggs, today), 0);
}

function getSplitPct(
    pursuitId: string,
    monthKey: string,
    fundingPartners: PursuitFundingPartner[],
    fundingSplits: PursuitFundingSplit[],
    viewMode: string
): number {
    if (viewMode === 'total') return 1;

    const pursuitPartners = fundingPartners.filter(p => p.pursuit_id === pursuitId);
    if (!pursuitPartners.length) {
        return viewMode === 'slrh' ? 1 : 0;
    }

    const slrhPartner = pursuitPartners.find(p => p.is_slrh);

    let thirdPartySum = 0;
    const partnerPcts = new Map<string, number>();

    for (const p of pursuitPartners) {
        if (p.is_slrh) continue;
        const override = fundingSplits.find(s => s.partner_id === p.id && s.month_key === monthKey);
        const val = override ? (override.split_pct / 100) : (Math.max(0, p.default_split_pct || 0) / 100);
        partnerPcts.set(p.name, val);
        thirdPartySum += val;
    }

    const slrhPct = Math.max(0, 1 - thirdPartySum);

    if (viewMode === 'slrh') return slrhPct;

    if (viewMode.startsWith('partner_name:')) {
        const name = viewMode.split(':')[1];
        return partnerPcts.get(name) ?? 0;
    }

    return 1;
}

function pursuitMonthTotalAdjusted(
    budget: PredevBudget,
    monthKey: string,
    aggs: YardiMonthlyCostAggregate[] | undefined,
    today: Date,
    fundingPartners: PursuitFundingPartner[],
    fundingSplits: PursuitFundingSplit[],
    fundingView: string,
    lineItemFilter?: Set<string>
): number {
    const rawTotal = pursuitMonthTotal(budget, monthKey, aggs, today, lineItemFilter);
    const pct = getSplitPct(budget.pursuit_id, monthKey, fundingPartners, fundingSplits, fundingView);
    return rawTotal * pct;
}

function pursuitGrandTotal(
    budget: PredevBudget,
    monthKeys: string[],
    aggs: YardiMonthlyCostAggregate[] | undefined,
    today: Date,
    fundingPartners: PursuitFundingPartner[],
    fundingSplits: PursuitFundingSplit[],
    fundingView: string,
    lineItemFilter?: Set<string>
): number {
    return monthKeys.reduce((sum, mk) => sum + pursuitMonthTotalAdjusted(budget, mk, aggs, today, fundingPartners, fundingSplits, fundingView, lineItemFilter), 0);
}

function pursuitSnapshotTotal(
    budget: PredevBudget,
    fundingPartners: PursuitFundingPartner[],
    fundingSplits: PursuitFundingSplit[],
    fundingView: string,
): number {
    if (!budget.budget_snapshot) return 0;
    let total = 0;
    for (const lineItemMonths of Object.values(budget.budget_snapshot)) {
        for (const [monthKey, val] of Object.entries(lineItemMonths)) {
            const pct = getSplitPct(budget.pursuit_id, monthKey, fundingPartners, fundingSplits, fundingView);
            total += (val as number) * pct;
        }
    }
    return total;
}

function formatMonthLabel(key: string): string {
    const [y, m] = key.split('-');
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function groupMonthsByYear(monthKeys: string[]): { year: string; months: string[] }[] {
    const groups = new Map<string, string[]>();
    for (const mk of monthKeys) {
        const year = mk.split('-')[0];
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year)!.push(mk);
    }
    return Array.from(groups.entries()).map(([year, months]) => ({ year, months }));
}

function getForwardMonthKeys(rows: PredevBudgetReportRow[]): string[] {
    if (rows.length === 0) return [];
    const allMonths = new Set<string>();
    for (const r of rows) {
        const startParts = r.budget.start_date.split('-').map(Number);
        for (let i = 0; i < r.budget.duration_months; i++) {
            const m = ((startParts[1] - 1 + i) % 12) + 1;
            const y = startParts[0] + Math.floor((startParts[1] - 1 + i) / 12);
            allMonths.add(`${y}-${String(m).padStart(2, '0')}`);
        }
    }
    return Array.from(allMonths).sort();
}

// ── Component ───────────────────────────────────────────────

type ViewMode = 'monthly' | 'annual';

export function PredevBudgetReport() {
    const { data: rowsRaw, isLoading: loadingBudgets } = useAllPredevBudgets();
    const { data: fundingPartnersRaw, isLoading: loadingPartners } = useAllFundingPartners();
    const { data: fundingSplitsRaw, isLoading: loadingSplits } = useAllFundingSplits();
    const { data: yardiAggregates, isLoading: loadingAggregates } = useAllPortfolioJobCostAggregates();

    const isLoading = loadingBudgets || loadingPartners || loadingSplits || loadingAggregates;

    const [viewMode, setViewMode] = useState<ViewMode>('monthly');
    const [groupBy, setGroupBy] = useState<'none' | 'region'>('none');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    
    // Filters
    const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
    const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showStageDropdown, setShowStageDropdown] = useState(false);
    
    const [fundingView, setFundingView] = useState<string>('total');

    const today = useMemo(() => new Date(), []);
    
    // Extracted Unique States for filtering
    const allStages = useMemo(() => {
        const map = new Map<string, { id: string, label: string }>();
        for (const r of rowsRaw ?? []) {
            if (r.stage) map.set(r.stage.id, { id: r.stage.id, label: r.stage.name });
        }
        return Array.from(map.values()).sort((a,b) => a.label.localeCompare(b.label));
    }, [rowsRaw]);

    const allPartnerOptions = useMemo(() => {
        const unique = new Map<string, string>();
        for (const p of fundingPartnersRaw ?? []) {
            if (!p.is_slrh) unique.set(p.name, p.name);
        }
        return Array.from(unique.values()).sort();
    }, [fundingPartnersRaw]);

    console.log('YARDI AGGS', yardiAggregates);

    // Apply Stage Filter
    const stageFilter = selectedStages.size > 0 ? selectedStages : undefined;
    const rows = useMemo(() => {
        let arr = rowsRaw ?? [];
        if (stageFilter) arr = arr.filter(r => r.stage && stageFilter.has(r.stage.id));
        return arr;
    }, [rowsRaw, stageFilter]);

    const monthKeys = useMemo(() => getForwardMonthKeys(rows), [rows]);
    
    // Split into closed (LTD) and forward
    const closedMonths = useMemo(() => monthKeys.filter(mk => isMonthClosed(mk, today)), [monthKeys, today]);
    const forwardMonths = useMemo(() => monthKeys.filter(mk => !isMonthClosed(mk, today)), [monthKeys, today]);

    const yearGroups = useMemo(() => groupMonthsByYear(forwardMonths), [forwardMonths]);

    const allLineItemLabels = useMemo(() => {
        const labels = new Set<string>();
        for (const r of rows) {
            for (const li of r.budget.line_items ?? []) {
                labels.add(li.label);
            }
        }
        return Array.from(labels).sort();
    }, [rows]);

    const lineItemFilter = selectedLineItems.size > 0 ? selectedLineItems : undefined;

    const toggleLineItemFilter = (label: string) => {
        setSelectedLineItems((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    const toggleStageFilter = (id: string) => {
        setSelectedStages((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const clearFilters = () => {
        setSelectedLineItems(new Set());
        setSelectedStages(new Set());
        setShowFilterDropdown(false);
        setShowStageDropdown(false);
    };

    // Group rows
    const groupedRows = useMemo(() => {
        const data = rows;
        if (groupBy === 'none') return { '': data };
        const map = new Map<string, PredevBudgetReportRow[]>();
        for (const r of data) {
            const key = r.pursuit.region || 'Unassigned';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(r);
        }
        return Object.fromEntries(map);
    }, [rows, groupBy]);

    const toggleGroup = (key: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // Auto-expand FIX
    useEffect(() => {
        if (groupBy !== 'none') {
            setExpandedGroups(new Set(Object.keys(groupedRows)));
        }
    }, [groupedRows, groupBy]);

    // Fast-access references
    const fp = fundingPartnersRaw ?? [];
    const fs = fundingSplitsRaw ?? [];

    const grandTotalByMonth = (mk: string): number =>
        (rows).reduce((sum, r) => sum + pursuitMonthTotalAdjusted(r.budget, mk, yardiAggregates?.[r.pursuit.id], today, fp, fs, fundingView, lineItemFilter), 0);

    const overallGrandTotal = monthKeys.reduce((sum, mk) => sum + grandTotalByMonth(mk), 0);

    const portfolioMetrics = useMemo(() => {
        const data = rows;
        let totalBudget = 0;
        let totalForecast = 0;

        for (const r of data) {
            const rMonthKeys = getForwardMonthKeys([r]);
            totalForecast += pursuitGrandTotal(r.budget, rMonthKeys, yardiAggregates?.[r.pursuit.id], today, fp, fs, fundingView, lineItemFilter);
            totalBudget += pursuitSnapshotTotal(r.budget, fp, fs, fundingView) || pursuitGrandTotal(r.budget, rMonthKeys, yardiAggregates?.[r.pursuit.id], today, fp, fs, fundingView, lineItemFilter);
        }
        
        const variance = totalForecast - totalBudget;
        return { totalBudget, totalForecast, variance, slrhObligation: totalForecast }; // Obligation is matched via fundingView dynamically
    }, [rows, monthKeys, lineItemFilter, yardiAggregates, today, fp, fs, fundingView]);

    if (isLoading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
            </div>
        );
    }

    if (!rowsRaw || rowsRaw.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <DollarSign className="w-12 h-12 text-[var(--border-strong)] mb-3" />
                <p className="text-sm text-[var(--text-muted)] mb-1">No pre-dev budgets found</p>
                <p className="text-xs text-[var(--text-faint)]">
                    Create a pre-dev budget on a pursuit to see portfolio-level data here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* View Mode Toggle */}
                <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5">
                    <button
                        onClick={() => setViewMode('monthly')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'monthly' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'
                            }`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setViewMode('annual')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'annual' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'
                            }`}
                    >
                        Annual
                    </button>
                </div>

                {/* Group By */}
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[var(--text-muted)]">Group by:</span>
                    <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as 'none' | 'region')}
                        className="px-2 py-1 rounded-md border border-[var(--border)] text-xs text-[var(--text-primary)] bg-[var(--bg-card)]"
                    >
                        <option value="none">None</option>
                        <option value="region">Region</option>
                    </select>
                </div>

                {/* Funding View Toggle */}
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[var(--text-muted)]">Data View:</span>
                    <select
                        value={fundingView}
                        onChange={(e) => setFundingView(e.target.value)}
                        className="px-2 py-1 rounded-md border border-[var(--border)] text-xs text-blue-600 dark:text-blue-400 font-semibold bg-[var(--bg-card)]"
                    >
                        <option value="total">Total Pursuit Forecast</option>
                        <option value="slrh">SLRH Share Forecast</option>
                        {allPartnerOptions.map(p => (
                            <option key={p} value={`partner_name:${p}`}>Partner: {p} Share</option>
                        ))}
                    </select>
                </div>

                {/* Stage Filter */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowStageDropdown(!showStageDropdown);
                            setShowFilterDropdown(false);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${stageFilter
                                ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/30 text-[var(--accent)]'
                                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                            }`}
                    >
                        <Filter className="w-3 h-3" />
                        {stageFilter
                            ? `${selectedStages.size} stage${selectedStages.size !== 1 ? 's' : ''}`
                            : 'Filter by stage'}
                    </button>
                    {showStageDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-50 p-2 overflow-hidden flex flex-col max-h-[300px]">
                            <div className="flex items-center justify-between px-2 mb-2">
                                <span className="text-xs font-medium text-[var(--text-primary)]">Filter by stage</span>
                                {(stageFilter) && (
                                    <button onClick={clearFilters} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="overflow-y-auto space-y-0.5">
                                {allStages.map((stg) => (
                                    <label key={stg.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-elevated)] rounded-md cursor-pointer text-xs">
                                        <input
                                            type="checkbox"
                                            checked={selectedStages.has(stg.id)}
                                            onChange={() => toggleStageFilter(stg.id)}
                                            className="rounded border-[var(--text-secondary)] text-[var(--accent)] focus:ring-[var(--accent)]/20"
                                        />
                                        <span className="text-[var(--text-secondary)] truncate">{stg.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Line Item Filter */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowFilterDropdown(!showFilterDropdown);
                            setShowStageDropdown(false);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${lineItemFilter
                                ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/30 text-[var(--accent)]'
                                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                            }`}
                    >
                        <Filter className="w-3 h-3" />
                        {lineItemFilter
                            ? `${selectedLineItems.size} line item${selectedLineItems.size !== 1 ? 's' : ''}`
                            : 'Filter by line item'}
                    </button>
                    {showFilterDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-50 p-2 overflow-hidden flex flex-col max-h-[300px]">
                            <div className="flex items-center justify-between px-2 mb-2">
                                <span className="text-xs font-medium text-[var(--text-primary)]">Filter by category</span>
                                {(lineItemFilter) && (
                                    <button onClick={clearFilters} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="overflow-y-auto space-y-0.5">
                                {allLineItemLabels.map((lbl) => (
                                    <label key={lbl} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-elevated)] rounded-md cursor-pointer text-xs">
                                        <input
                                            type="checkbox"
                                            checked={selectedLineItems.has(lbl)}
                                            onChange={() => toggleLineItemFilter(lbl)}
                                            className="rounded border-[var(--text-secondary)] text-[var(--accent)] focus:ring-[var(--accent)]/20"
                                        />
                                        <span className="text-[var(--text-secondary)] truncate">{lbl}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarDays className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Total {fundingView !== 'total' ? 'Share ' : ''}Forecast
                        </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
                        {formatCurrency(portfolioMetrics.totalForecast, 0)}
                    </div>
                </div>
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Total {fundingView !== 'total' ? 'Share ' : ''}Budget
                        </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
                        {formatCurrency(portfolioMetrics.totalBudget, 0)}
                    </div>
                </div>
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Forecast Variance
                        </span>
                    </div>
                    <div className={`text-2xl font-bold font-mono tracking-tight ${portfolioMetrics.variance > 0 ? 'text-[var(--error)]' : portfolioMetrics.variance < 0 ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'}`}>
                        {portfolioMetrics.variance > 0 ? '+' : ''}{formatCurrency(portfolioMetrics.variance, 0)}
                    </div>
                </div>
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-5">
                        <Shield className="w-24 h-24" />
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Overall Forecast
                        </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(portfolioMetrics.slrhObligation, 0)}
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1 font-medium">Dynamically filtered by Data View</p>
                </div>
            </div>

            {/* Grid */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm flex flex-col h-full relative">
                <div className="overflow-x-auto flex-1 min-h-0 [scrollbar-width:thin]">
                    <table className="w-full min-w-max text-sm border-collapse">
                        <thead>
                            {viewMode === 'monthly' ? (
                                <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                                    <th className="sticky left-0 z-20 bg-[var(--bg-elevated)] text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-r border-[var(--border)] shadow-[1px_0_0_var(--border)]" style={{ minWidth: 280 }}>
                                        Pursuit
                                    </th>
                                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-r border-[var(--border)]">
                                        Total
                                    </th>
                                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-r border-[var(--border)] bg-[var(--bg-elevated)]">
                                        LTD Actuals
                                    </th>
                                    {forwardMonths.map((mk) => {
                                        const isPending = isMonthPendingClose(mk, today, getCurrentMonthKey());
                                        return (
                                            <th key={mk} className={`text-right px-3 py-2.5 text-xs font-semibold border-r border-[var(--border)] last:border-0 min-w-[80px] ${
                                                isPending ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b-2 border-b-amber-500/50' : 'text-[var(--text-secondary)]'
                                            }`}>
                                                {formatMonthLabel(mk)}
                                            </th>
                                        );
                                    })}
                                </tr>
                            ) : (
                                <>
                                    <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                                        <th rowSpan={2} className="sticky left-0 z-20 bg-[var(--bg-elevated)] text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-r border-[var(--border)] shadow-[1px_0_0_var(--border)]" style={{ minWidth: 280 }}>
                                            Pursuit
                                        </th>
                                        <th rowSpan={2} className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-r border-[var(--border)]">
                                            Total
                                        </th>
                                        <th rowSpan={2} className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-r border-[var(--border)] bg-[var(--bg-elevated)]">
                                            LTD Actuals
                                        </th>
                                        {yearGroups.map((yg) => (
                                            <th key={yg.year} colSpan={yg.months.length} className="text-center px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] border-r border-[var(--border)] last:border-0 bg-[var(--bg-card)] border-b">
                                                {yg.year}
                                            </th>
                                        ))}
                                    </tr>
                                    <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                                        {yearGroups.map((yg) => (
                                            yg.months.map((mk) => (
                                                <th key={mk} className="text-right px-3 py-1.5 text-[10px] uppercase font-semibold text-[var(--text-muted)] border-r border-[var(--border)] last:border-0 min-w-[80px]">
                                                    {formatMonthLabel(mk).split(' ')[0]}
                                                </th>
                                            ))
                                        ))}
                                    </tr>
                                </>
                            )}
                        </thead>
                        {/* Table bodies mapped per group */}
                            {Object.entries(groupedRows).map(([groupKey, groupRows], gIdx) => {
                                const isExpanded = groupBy === 'none' || expandedGroups.has(groupKey);
                                const isRegionBlocked = groupBy === 'region';

                                // Group Subtotals
                                const groupTotal = groupRows.reduce((sum, r) => {
                                    const mk = getForwardMonthKeys([r]);
                                    return sum + pursuitGrandTotal(r.budget, mk, yardiAggregates?.[r.pursuit.id], today, fp, fs, fundingView, lineItemFilter);
                                }, 0);

                                const groupLtd = groupRows.reduce((sum, r) => {
                                    return sum + pursuitGrandTotal(r.budget, closedMonths, yardiAggregates?.[r.pursuit.id], today, fp, fs, fundingView, lineItemFilter);
                                }, 0);

                                return (
                                    <tbody key={groupKey || 'all'} className="group-body">
                                        {isRegionBlocked && (
                                            <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)] transition-colors hover:bg-[var(--accent-subtle)] cursor-pointer" onClick={() => toggleGroup(groupKey)}>
                                                <td className="sticky left-0 z-10 bg-[var(--bg-elevated)] px-4 py-2 border-r border-[var(--border)] shadow-[1px_0_0_var(--border)]">
                                                    <div className="flex items-center gap-2">
                                                        {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                                                        <span className="font-semibold text-xs uppercase tracking-wider text-[var(--text-primary)]">{groupKey}</span>
                                                        <span className="ml-auto text-[10px] font-medium bg-[var(--bg-card)] px-1.5 py-0.5 rounded text-[var(--text-muted)] border border-[var(--border)]">
                                                            {groupRows.length} pursuits
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="text-right px-4 py-2 text-xs font-bold font-mono text-[var(--text-primary)] border-r border-[var(--border)]">
                                                    {formatCurrency(groupTotal, 0)}
                                                </td>
                                                <td className="text-right px-4 py-2 text-xs font-bold font-mono text-[var(--text-primary)] border-r border-[var(--border)] bg-[var(--bg-elevated)]">
                                                    {formatCurrency(groupLtd, 0)}
                                                </td>
                                                {forwardMonths.map((mk) => {
                                                    const mTot = groupRows.reduce((sum, r) => sum + pursuitMonthTotalAdjusted(r.budget, mk, yardiAggregates?.[r.pursuit.id], today, fp, fs, fundingView, lineItemFilter), 0);
                                                    return (
                                                        <td key={mk} className="text-right px-3 py-2 text-xs font-medium font-mono text-[var(--text-secondary)] border-r border-[var(--border)] last:border-0 bg-[var(--bg-primary)]">
                                                            {mTot === 0 ? <span className="text-[var(--text-faint)]">—</span> : formatCurrency(mTot, 0)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        )}

                                        {isExpanded && groupRows.map((row) => {
                                            const rmk = getForwardMonthKeys([row]);
                                            const lineTotal = pursuitGrandTotal(row.budget, rmk, yardiAggregates?.[row.pursuit.id], today, fp, fs, fundingView, lineItemFilter);
                                            const lineLtd = pursuitGrandTotal(row.budget, closedMonths.filter(m => rmk.includes(m)), yardiAggregates?.[row.pursuit.id], today, fp, fs, fundingView, lineItemFilter);

                                            return (
                                                <tr key={row.pursuit.id} className="group/row bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--border)] last:border-0">
                                                    <td className="sticky left-0 z-10 bg-inherit px-4 py-2 border-r border-[var(--border)] shadow-[1px_0_0_var(--border)] group-hover/row:shadow-[1px_0_0_var(--border)]">
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <Link
                                                                    href={`/pursuits/${row.pursuit.short_id}/predev`}
                                                                    className="font-medium text-[var(--accent)] hover:underline truncate"
                                                                    title={row.pursuit.name}
                                                                >
                                                                    {row.pursuit.name}
                                                                </Link>
                                                                <ExternalLink className="w-3 h-3 text-[var(--text-faint)] opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0" />
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                                                <span className="truncate">{row.pursuit.city}, {row.pursuit.state}</span>
                                                                {row.stage && (
                                                                    <>
                                                                        <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                                                                        <span className="truncate">{row.stage.name}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-right px-4 py-2 font-mono text-xs font-semibold text-[var(--text-primary)] border-r border-[var(--border)]">
                                                        {formatCurrency(lineTotal, 0)}
                                                    </td>
                                                    <td className="text-right px-4 py-2 font-mono text-xs font-semibold text-[var(--text-primary)] border-r border-[var(--border)] bg-[var(--bg-elevated)]">
                                                        {lineLtd === 0 ? <span className="text-[var(--text-faint)]">—</span> : formatCurrency(lineLtd, 0)}
                                                    </td>
                                                    {forwardMonths.map((mk) => {
                                                        const isPending = isMonthPendingClose(mk, today, getCurrentMonthKey());
                                                        const inRange = rmk.includes(mk);
                                                        if (!inRange) {
                                                            return (
                                                                <td key={mk} className={`text-right px-3 py-2 text-xs font-mono font-medium text-[var(--text-faint)] border-r border-[var(--border)] last:border-0 ${isPending ? 'bg-amber-500/5' : 'bg-[var(--bg-primary)]/30'}`}>
                                                                    —
                                                                </td>
                                                            );
                                                        }
                                                        const val = pursuitMonthTotalAdjusted(row.budget, mk, yardiAggregates?.[row.pursuit.id], today, fp, fs, fundingView, lineItemFilter);
                                                        return (
                                                            <td key={mk} className={`text-right px-3 py-2 text-xs font-mono font-medium border-r border-[var(--border)] last:border-0 ${
                                                                isPending ? (val > 0 ? 'text-amber-700 dark:text-amber-400 bg-amber-500/10 font-bold' : 'text-amber-700/50 dark:text-amber-400/50 bg-amber-500/5') :
                                                                (val > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]')
                                                            }`}>
                                                                {val === 0 ? '—' : formatCurrency(val, 0)}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                );
                            })}
                        {/* Remove duplicate global tbody */}
                        <tfoot>
                            <tr className="bg-[var(--text-primary)] text-[var(--bg-card)]">
                                <td className="sticky left-0 z-10 bg-[var(--text-primary)] px-4 py-3 border-r border-[var(--text-secondary)] shadow-[1px_0_0_var(--text-secondary)]">
                                    <span className="text-xs font-bold uppercase tracking-wider">Grand Total</span>
                                </td>
                                <td className="text-right px-4 py-3 font-mono text-xs font-bold border-r border-[var(--text-secondary)] text-[var(--accent-fg)]">
                                    {formatCurrency(overallGrandTotal, 0)}
                                </td>
                                <td className="text-right px-4 py-3 font-mono text-xs font-bold border-r border-[var(--text-secondary)] text-[var(--accent-fg)] bg-white/10">
                                    {formatCurrency(closedMonths.reduce((sum, mk) => sum + grandTotalByMonth(mk), 0), 0)}
                                </td>
                                {forwardMonths.map((mk) => {
                                    const mTot = grandTotalByMonth(mk);
                                    const isPending = isMonthPendingClose(mk, today, getCurrentMonthKey());
                                    return (
                                        <td key={mk} className={`text-right px-3 py-3 font-mono text-xs font-bold border-r border-[var(--text-secondary)] last:border-0 ${isPending ? 'text-amber-200' : 'text-[var(--accent-fg)]'}`}>
                                            {mTot === 0 ? '—' : formatCurrency(mTot, 0)}
                                        </td>
                                    );
                                })}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}
