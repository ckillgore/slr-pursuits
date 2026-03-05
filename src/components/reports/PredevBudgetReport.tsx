'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAllPredevBudgets } from '@/hooks/useSupabaseQueries';
import type { PredevBudget, PredevBudgetLineItem, MonthlyCell } from '@/types';
import type { PredevBudgetReportRow } from '@/lib/supabase/queries';
import {
    Loader2,
    DollarSign,
    CalendarDays,
    ChevronRight,
    ChevronDown,
    ExternalLink,
    Filter,
    X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';

// ── Helpers ─────────────────────────────────────────────────

function effectiveValue(cell: MonthlyCell | undefined): number {
    if (!cell) return 0;
    return cell.actual !== null && cell.actual !== undefined ? cell.actual : cell.projected;
}

/**
 * Total budget spend for a pursuit in a given month.
 * If lineItemFilter is provided, only sum line items whose label is in the set.
 */
function pursuitMonthTotal(budget: PredevBudget, monthKey: string, lineItemFilter?: Set<string>): number {
    return (budget.line_items ?? [])
        .filter((li) => !lineItemFilter || lineItemFilter.has(li.label))
        .reduce((sum, li) => sum + effectiveValue(li.monthly_values[monthKey]), 0);
}

/** Total budget spend for a pursuit across all months */
function pursuitGrandTotal(budget: PredevBudget, monthKeys: string[], lineItemFilter?: Set<string>): number {
    return monthKeys.reduce((sum, mk) => sum + pursuitMonthTotal(budget, mk, lineItemFilter), 0);
}

/** Format a month key to display label (e.g., "Mar 2026") */
function formatMonthLabel(key: string): string {
    const [y, m] = key.split('-');
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Generate month keys for annual view: groups months into years, returns year labels */
function groupMonthsByYear(monthKeys: string[]): { year: string; months: string[] }[] {
    const groups = new Map<string, string[]>();
    for (const mk of monthKeys) {
        const year = mk.split('-')[0];
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year)!.push(mk);
    }
    return Array.from(groups.entries()).map(([year, months]) => ({ year, months }));
}

/** Get all months across all budgets */
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
    const { data: rows, isLoading } = useAllPredevBudgets();
    const [viewMode, setViewMode] = useState<ViewMode>('monthly');
    const [groupBy, setGroupBy] = useState<'none' | 'region'>('none');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);

    const monthKeys = useMemo(() => getForwardMonthKeys(rows ?? []), [rows]);
    const yearGroups = useMemo(() => groupMonthsByYear(monthKeys), [monthKeys]);

    // Collect all unique line item labels across all budgets
    const allLineItemLabels = useMemo(() => {
        const labels = new Set<string>();
        for (const r of rows ?? []) {
            for (const li of r.budget.line_items ?? []) {
                labels.add(li.label);
            }
        }
        return Array.from(labels).sort();
    }, [rows]);

    // Active filter (null means "show all")
    const lineItemFilter = selectedLineItems.size > 0 ? selectedLineItems : undefined;

    const toggleLineItemFilter = (label: string) => {
        setSelectedLineItems((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    const clearFilters = () => {
        setSelectedLineItems(new Set());
        setShowFilterDropdown(false);
    };

    // Group rows
    const groupedRows = useMemo(() => {
        const data = rows ?? [];
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

    // Auto-expand all groups
    useMemo(() => {
        if (groupBy !== 'none') {
            setExpandedGroups(new Set(Object.keys(groupedRows)));
        }
    }, [groupedRows, groupBy]);

    if (isLoading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
            </div>
        );
    }

    if (!rows || rows.length === 0) {
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

    // Grand totals across all pursuits
    const grandTotalByMonth = (mk: string): number =>
        (rows ?? []).reduce((sum, r) => sum + pursuitMonthTotal(r.budget, mk, lineItemFilter), 0);

    const overallGrandTotal = monthKeys.reduce((sum, mk) => sum + grandTotalByMonth(mk), 0);

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

                {/* Line Item Filter */}
                <div className="relative">
                    <button
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
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
                        <div className="absolute top-full mt-1 left-0 w-72 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl py-1 z-30 animate-fade-in max-h-80 overflow-y-auto">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--table-row-border)]">
                                <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider">
                                    Line Item Categories
                                </span>
                                {lineItemFilter && (
                                    <button
                                        onClick={clearFilters}
                                        className="text-[10px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                            {allLineItemLabels.map((label) => (
                                <label
                                    key={label}
                                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedLineItems.has(label)}
                                        onChange={() => toggleLineItemFilter(label)}
                                        className="w-3.5 h-3.5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                                    />
                                    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                                </label>
                            ))}
                            <div className="px-3 py-2 border-t border-[var(--table-row-border)]">
                                <button
                                    onClick={() => setShowFilterDropdown(false)}
                                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors font-medium"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Active filter pills */}
                {lineItemFilter && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {Array.from(selectedLineItems).map((label) => (
                            <span
                                key={label}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[10px] font-medium text-[var(--accent)]"
                            >
                                {label}
                                <button onClick={() => toggleLineItemFilter(label)} className="hover:text-[var(--accent-hover)]">
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <div className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {rows.length} pursuit{rows.length !== 1 ? 's' : ''} · {monthKeys.length} months
                </div>
            </div>

            {/* Budget Grid */}
            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    {viewMode === 'monthly' ? (
                        <MonthlyGrid
                            groupedRows={groupedRows}
                            monthKeys={monthKeys}
                            groupBy={groupBy}
                            expandedGroups={expandedGroups}
                            onToggleGroup={toggleGroup}
                            grandTotalByMonth={grandTotalByMonth}
                            overallGrandTotal={overallGrandTotal}
                            lineItemFilter={lineItemFilter}
                        />
                    ) : (
                        <AnnualGrid
                            groupedRows={groupedRows}
                            yearGroups={yearGroups}
                            monthKeys={monthKeys}
                            groupBy={groupBy}
                            expandedGroups={expandedGroups}
                            onToggleGroup={toggleGroup}
                            lineItemFilter={lineItemFilter}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Monthly Grid ────────────────────────────────────────────

function MonthlyGrid({
    groupedRows,
    monthKeys,
    groupBy,
    expandedGroups,
    onToggleGroup,
    grandTotalByMonth,
    overallGrandTotal,
    lineItemFilter,
}: {
    groupedRows: Record<string, PredevBudgetReportRow[]>;
    monthKeys: string[];
    groupBy: string;
    expandedGroups: Set<string>;
    onToggleGroup: (key: string) => void;
    grandTotalByMonth: (mk: string) => number;
    overallGrandTotal: number;
    lineItemFilter?: Set<string>;
}) {
    return (
        <table className="w-full border-collapse" style={{ minWidth: `${240 + monthKeys.length * 95 + 110}px` }}>
            <thead>
                <tr className="bg-[var(--bg-primary)]">
                    <th className="sticky left-0 z-20 bg-[var(--bg-primary)] text-left px-4 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-r border-[var(--border)]" style={{ minWidth: 240 }}>
                        Pursuit
                    </th>
                    {monthKeys.map((mk) => (
                        <th key={mk} className="text-center px-1 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]" style={{ minWidth: 95 }}>
                            {formatMonthLabel(mk)}
                        </th>
                    ))}
                    <th className="sticky right-0 z-20 bg-[var(--bg-primary)] text-right px-4 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-l border-[var(--border)]" style={{ minWidth: 110 }}>
                        Total
                    </th>
                </tr>
            </thead>
            <tbody>
                {Object.entries(groupedRows).map(([groupKey, groupRows]) => {
                    const isGrouped = groupBy !== 'none';
                    const isExpanded = !isGrouped || expandedGroups.has(groupKey);

                    return (
                        <React.Fragment key={groupKey}>
                            {/* Group header row */}
                            {isGrouped && (
                                <tr
                                    className="bg-[var(--bg-elevated)] cursor-pointer hover:bg-[#ECEEF1] transition-colors"
                                    onClick={() => onToggleGroup(groupKey)}
                                >
                                    <td className="sticky left-0 z-10 bg-inherit px-4 py-2 border-r border-[var(--border)] text-xs font-bold text-[var(--text-primary)]" colSpan={1}>
                                        <div className="flex items-center gap-1.5">
                                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            {groupKey}
                                            <span className="text-[var(--text-faint)] font-normal">({groupRows.length})</span>
                                        </div>
                                    </td>
                                    {monthKeys.map((mk) => {
                                        const gt = groupRows.reduce((s, r) => s + pursuitMonthTotal(r.budget, mk, lineItemFilter), 0);
                                        return (
                                            <td key={mk} className="px-2 py-2 text-right text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                                                {gt === 0 ? '—' : formatCurrency(gt, 0)}
                                            </td>
                                        );
                                    })}
                                    <td className="sticky right-0 z-10 bg-inherit px-3 py-2 border-l border-[var(--border)] text-right text-xs font-bold tabular-nums text-[var(--text-primary)]">
                                        {formatCurrency(groupRows.reduce((s, r) => s + pursuitGrandTotal(r.budget, monthKeys, lineItemFilter), 0), 0)}
                                    </td>
                                </tr>
                            )}

                            {/* Pursuit rows */}
                            {isExpanded && groupRows.map((row, idx) => {
                                const pt = pursuitGrandTotal(row.budget, monthKeys, lineItemFilter);
                                return (
                                    <tr key={row.budget.id} className={`${idx % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]/50'} hover:bg-[var(--bg-elevated)]/50 transition-colors`}>
                                        <td className="sticky left-0 z-10 bg-inherit px-4 py-1.5 border-r border-[var(--table-row-border)]">
                                            <Link
                                                href={`/pursuits/${row.pursuit.short_id || row.pursuit.id}?tab=predev`}
                                                className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline inline-flex items-center gap-1 transition-colors"
                                            >
                                                {row.pursuit.name}
                                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                            </Link>
                                            <div className="text-[10px] text-[var(--text-faint)]">
                                                {row.pursuit.city}{row.pursuit.state ? `, ${row.pursuit.state}` : ''}
                                                {row.stage ? ` · ${row.stage.name}` : ''}
                                            </div>
                                        </td>
                                        {monthKeys.map((mk) => {
                                            const val = pursuitMonthTotal(row.budget, mk, lineItemFilter);
                                            return (
                                                <td key={mk} className="px-2 py-1.5 text-right text-xs font-mono tabular-nums text-[var(--text-primary)]">
                                                    {val === 0 ? <span className="text-[var(--border-strong)]">—</span> : formatCurrency(val, 0)}
                                                </td>
                                            );
                                        })}
                                        <td className="sticky right-0 z-10 bg-inherit px-3 py-1.5 border-l border-[var(--table-row-border)] text-right">
                                            <span className={`text-xs font-semibold tabular-nums ${pt === 0 ? 'text-[var(--border-strong)]' : 'text-[var(--text-primary)]'}`}>
                                                {pt === 0 ? '—' : formatCurrency(pt, 0)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    );
                })}

                {/* Grand total row */}
                <tr className="bg-[var(--text-primary)]">
                    <td className="sticky left-0 z-10 bg-[var(--text-primary)] px-4 py-2 border-r border-[#2A3040] text-xs font-bold text-white uppercase tracking-wider">
                        Portfolio Total
                    </td>
                    {monthKeys.map((mk) => {
                        const gt = grandTotalByMonth(mk);
                        return (
                            <td key={mk} className="px-2 py-2 text-right">
                                <span className={`text-xs font-bold tabular-nums ${gt === 0 ? 'text-[var(--text-secondary)]' : 'text-white'}`}>
                                    {gt === 0 ? '—' : formatCurrency(gt, 0)}
                                </span>
                            </td>
                        );
                    })}
                    <td className="sticky right-0 z-10 bg-[var(--text-primary)] px-3 py-2 border-l border-[#2A3040] text-right">
                        <span className="text-xs font-bold text-white tabular-nums">
                            {overallGrandTotal === 0 ? '—' : formatCurrency(overallGrandTotal, 0)}
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

// ── Annual Grid ─────────────────────────────────────────────

function AnnualGrid({
    groupedRows,
    yearGroups,
    monthKeys,
    groupBy,
    expandedGroups,
    onToggleGroup,
    lineItemFilter,
}: {
    groupedRows: Record<string, PredevBudgetReportRow[]>;
    yearGroups: { year: string; months: string[] }[];
    monthKeys: string[];
    groupBy: string;
    expandedGroups: Set<string>;
    onToggleGroup: (key: string) => void;
    lineItemFilter?: Set<string>;
}) {
    const rows = Object.values(groupedRows).flat();

    const yearTotal = (budget: PredevBudget, months: string[]) =>
        months.reduce((sum, mk) => sum + pursuitMonthTotal(budget, mk, lineItemFilter), 0);

    const allYearTotal = (months: string[]) =>
        rows.reduce((sum, r) => sum + yearTotal(r.budget, months), 0);

    const overallTotal = monthKeys.reduce(
        (sum, mk) => sum + rows.reduce((s, r) => s + pursuitMonthTotal(r.budget, mk, lineItemFilter), 0),
        0
    );

    return (
        <table className="w-full border-collapse" style={{ minWidth: `${240 + yearGroups.length * 120 + 110}px` }}>
            <thead>
                <tr className="bg-[var(--bg-primary)]">
                    <th className="sticky left-0 z-20 bg-[var(--bg-primary)] text-left px-4 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-r border-[var(--border)]" style={{ minWidth: 240 }}>
                        Pursuit
                    </th>
                    {yearGroups.map(({ year }) => (
                        <th key={year} className="text-center px-2 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]" style={{ minWidth: 120 }}>
                            {year}
                        </th>
                    ))}
                    <th className="sticky right-0 z-20 bg-[var(--bg-primary)] text-right px-4 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-l border-[var(--border)]" style={{ minWidth: 110 }}>
                        Total
                    </th>
                </tr>
            </thead>
            <tbody>
                {Object.entries(groupedRows).map(([groupKey, groupRows]) => {
                    const isGrouped = groupBy !== 'none';
                    const isExpanded = !isGrouped || expandedGroups.has(groupKey);
                    return (
                        <React.Fragment key={groupKey}>
                            {isGrouped && (
                                <tr className="bg-[var(--bg-elevated)] cursor-pointer hover:bg-[#ECEEF1]" onClick={() => onToggleGroup(groupKey)}>
                                    <td className="sticky left-0 z-10 bg-inherit px-4 py-2 border-r border-[var(--border)] text-xs font-bold text-[var(--text-primary)]">
                                        <div className="flex items-center gap-1.5">
                                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            {groupKey} <span className="text-[var(--text-faint)] font-normal">({groupRows.length})</span>
                                        </div>
                                    </td>
                                    {yearGroups.map(({ year, months }) => {
                                        const yt = groupRows.reduce((s, r) => s + yearTotal(r.budget, months), 0);
                                        return (
                                            <td key={year} className="px-2 py-2 text-right text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                                                {yt === 0 ? '—' : formatCurrency(yt, 0)}
                                            </td>
                                        );
                                    })}
                                    <td className="sticky right-0 z-10 bg-inherit px-3 py-2 border-l border-[var(--border)] text-right text-xs font-bold tabular-nums text-[var(--text-primary)]">
                                        {formatCurrency(groupRows.reduce((s, r) => s + pursuitGrandTotal(r.budget, monthKeys, lineItemFilter), 0), 0)}
                                    </td>
                                </tr>
                            )}
                            {isExpanded && groupRows.map((row, idx) => {
                                const pt = pursuitGrandTotal(row.budget, monthKeys, lineItemFilter);
                                return (
                                    <tr key={row.budget.id} className={`${idx % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]/50'} hover:bg-[var(--bg-elevated)]/50`}>
                                        <td className="sticky left-0 z-10 bg-inherit px-4 py-1.5 border-r border-[var(--table-row-border)]">
                                            <Link href={`/pursuits/${row.pursuit.short_id || row.pursuit.id}?tab=predev`} className="text-xs font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1">
                                                {row.pursuit.name}
                                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                            </Link>
                                            <div className="text-[10px] text-[var(--text-faint)]">
                                                {row.pursuit.city}{row.pursuit.state ? `, ${row.pursuit.state}` : ''}
                                            </div>
                                        </td>
                                        {yearGroups.map(({ year, months }) => {
                                            const val = yearTotal(row.budget, months);
                                            return (
                                                <td key={year} className="px-2 py-1.5 text-right text-xs font-mono tabular-nums text-[var(--text-primary)]">
                                                    {val === 0 ? <span className="text-[var(--border-strong)]">—</span> : formatCurrency(val, 0)}
                                                </td>
                                            );
                                        })}
                                        <td className="sticky right-0 z-10 bg-inherit px-3 py-1.5 border-l border-[var(--table-row-border)] text-right">
                                            <span className={`text-xs font-semibold tabular-nums ${pt === 0 ? 'text-[var(--border-strong)]' : 'text-[var(--text-primary)]'}`}>
                                                {pt === 0 ? '—' : formatCurrency(pt, 0)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
                <tr className="bg-[var(--text-primary)]">
                    <td className="sticky left-0 z-10 bg-[var(--text-primary)] px-4 py-2 border-r border-[#2A3040] text-xs font-bold text-white uppercase tracking-wider">
                        Portfolio Total
                    </td>
                    {yearGroups.map(({ year, months }) => {
                        const yt = allYearTotal(months);
                        return (
                            <td key={year} className="px-2 py-2 text-right">
                                <span className={`text-xs font-bold tabular-nums ${yt === 0 ? 'text-[var(--text-secondary)]' : 'text-white'}`}>
                                    {yt === 0 ? '—' : formatCurrency(yt, 0)}
                                </span>
                            </td>
                        );
                    })}
                    <td className="sticky right-0 z-10 bg-[var(--text-primary)] px-3 py-2 border-l border-[#2A3040] text-right">
                        <span className="text-xs font-bold text-white tabular-nums">
                            {overallTotal === 0 ? '—' : formatCurrency(overallTotal, 0)}
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

import React from 'react';
