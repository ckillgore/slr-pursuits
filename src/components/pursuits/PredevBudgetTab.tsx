'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    usePredevBudget,
    useCreatePredevBudget,
    useUpdatePredevBudget,
    useUpsertLineItemValues,
    useAddCustomLineItem,
    useDeleteLineItem,
} from '@/hooks/useSupabaseQueries';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import type { PredevBudget, PredevBudgetLineItem, MonthlyCell } from '@/types';
import {
    Plus,
    Loader2,
    DollarSign,
    Lock,
    Unlock,
    Trash2,
    Settings,
    ChevronDown,
    ChevronUp,
    CalendarDays,
    StickyNote,
    CheckCircle2,
    TrendingUp,
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';

interface PredevBudgetTabProps {
    pursuitId: string;
}

// ── Helpers ─────────────────────────────────────────────────

/** Generate array of month keys (YYYY-MM) from start_date + duration */
function getMonthKeys(startDate: string, durationMonths: number): string[] {
    const keys: string[] = [];
    const [year, month] = startDate.split('-').map(Number);
    for (let i = 0; i < durationMonths; i++) {
        const m = ((month - 1 + i) % 12) + 1;
        const y = year + Math.floor((month - 1 + i) / 12);
        keys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return keys;
}

/** Format a month key to display label (e.g., "Mar 2026") */
function formatMonthLabel(key: string): string {
    const [y, m] = key.split('-');
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Get effective value for a cell (actual takes priority if set) */
function effectiveValue(cell: MonthlyCell | undefined): number {
    if (!cell) return 0;
    return cell.actual !== null && cell.actual !== undefined ? cell.actual : cell.projected;
}

/** Check if a month is locked (has actual set for ANY line item) */
function isMonthLocked(lineItems: PredevBudgetLineItem[], monthKey: string): boolean {
    return lineItems.some((li) => {
        const cell = li.monthly_values[monthKey];
        return cell && cell.actual !== null && cell.actual !== undefined;
    });
}

// ── EditableCell ────────────────────────────────────────────

function EditableCell({
    value,
    isActual,
    onChange,
}: {
    value: number;
    isActual: boolean;
    onChange: (val: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [localVal, setLocalVal] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleStartEdit = useCallback(() => {
        setLocalVal(value === 0 ? '' : value.toLocaleString('en-US'));
        setEditing(true);
    }, [value]);

    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const handleBlur = useCallback(() => {
        setEditing(false);
        const parsed = parseFloat(localVal.replace(/,/g, '')) || 0;
        if (parsed !== value) onChange(parsed);
    }, [localVal, value, onChange]);

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={localVal}
                onChange={(e) => setLocalVal(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBlur();
                    if (e.key === 'Escape') setEditing(false);
                }}
                className="w-full h-full px-2 py-1 text-right text-xs font-mono bg-transparent outline-none border-2 border-[#2563EB] rounded"
            />
        );
    }

    return (
        <div
            onClick={handleStartEdit}
            className={`px-2 py-1.5 text-right text-xs font-mono cursor-text tabular-nums hover:bg-[#F4F5F7] transition-colors rounded ${value === 0 ? 'text-[#C8CDD5]' : isActual ? 'text-[#0D7A3E] font-semibold' : 'text-[#1A1F2B]'
                }`}
        >
            {value === 0 ? '—' : formatCurrency(value, 0)}
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────

export function PredevBudgetTab({ pursuitId }: PredevBudgetTabProps) {
    const { data: budget, isLoading } = usePredevBudget(pursuitId);
    const createBudget = useCreatePredevBudget();
    const updateBudget = useUpdatePredevBudget();
    const upsertValues = useUpsertLineItemValues();
    const addLineItem = useAddCustomLineItem();
    const deleteLineItemMut = useDeleteLineItem();

    // Creation dialog state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newStartDate, setNewStartDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [newDuration, setNewDuration] = useState(12);

    // Settings panel
    const [showSettings, setShowSettings] = useState(false);
    // Notes panel
    const [showNotes, setShowNotes] = useState(false);
    // Custom line item
    const [showAddLine, setShowAddLine] = useState(false);
    const [newLineLabel, setNewLineLabel] = useState('');
    // Lock actuals dialog
    const [lockingMonth, setLockingMonth] = useState<string | null>(null);

    // ── Creation handler ────────────────────────────────────

    const handleCreate = async () => {
        await createBudget.mutateAsync({
            pursuitId,
            startDate: newStartDate,
            durationMonths: newDuration,
        });
        setShowCreateDialog(false);
    };

    // ── Cell value handler ──────────────────────────────────

    const handleCellChange = useCallback(
        (lineItem: PredevBudgetLineItem, monthKey: string, newValue: number, isActual: boolean) => {
            const current = lineItem.monthly_values[monthKey] ?? { projected: 0, actual: null };
            const updated: MonthlyCell = isActual
                ? { projected: current.projected, actual: newValue }
                : { projected: newValue, actual: current.actual };
            const newMonthly = { ...lineItem.monthly_values, [monthKey]: updated };
            upsertValues.mutate({
                lineItemId: lineItem.id,
                monthlyValues: newMonthly,
                pursuitId,
            });
        },
        [upsertValues, pursuitId]
    );

    // ── Lock a month (convert projected → actual) ───────────

    const handleLockMonth = useCallback(
        (monthKey: string) => {
            if (!budget?.line_items) return;
            // For each line item, copy projected → actual for this month
            budget.line_items.forEach((li) => {
                const cell = li.monthly_values[monthKey] ?? { projected: 0, actual: null };
                if (cell.actual === null || cell.actual === undefined) {
                    const updated: MonthlyCell = { projected: cell.projected, actual: cell.projected };
                    const newMonthly = { ...li.monthly_values, [monthKey]: updated };
                    upsertValues.mutate({
                        lineItemId: li.id,
                        monthlyValues: newMonthly,
                        pursuitId,
                    });
                }
            });
            setLockingMonth(null);
        },
        [budget, upsertValues, pursuitId]
    );

    // ── Unlock a month ──────────────────────────────────────

    const handleUnlockMonth = useCallback(
        (monthKey: string) => {
            if (!budget?.line_items) return;
            budget.line_items.forEach((li) => {
                const cell = li.monthly_values[monthKey];
                if (cell && cell.actual !== null) {
                    const updated: MonthlyCell = { projected: cell.projected, actual: null };
                    const newMonthly = { ...li.monthly_values, [monthKey]: updated };
                    upsertValues.mutate({
                        lineItemId: li.id,
                        monthlyValues: newMonthly,
                        pursuitId,
                    });
                }
            });
        },
        [budget, upsertValues, pursuitId]
    );

    // ── Derived data ────────────────────────────────────────

    const monthKeys = useMemo(
        () => budget ? getMonthKeys(budget.start_date, budget.duration_months) : [],
        [budget]
    );

    const lineItems = budget?.line_items ?? [];

    /** Row total for a line item */
    const rowTotal = useCallback(
        (li: PredevBudgetLineItem) =>
            monthKeys.reduce((sum, mk) => sum + effectiveValue(li.monthly_values[mk]), 0),
        [monthKeys]
    );

    /** Column total for a month */
    const colTotal = useCallback(
        (mk: string) =>
            lineItems.reduce((sum, li) => sum + effectiveValue(li.monthly_values[mk]), 0),
        [lineItems]
    );

    /** Grand total */
    const grandTotal = useMemo(
        () => lineItems.reduce((sum, li) => sum + monthKeys.reduce(
            (s, mk) => s + effectiveValue(li.monthly_values[mk]), 0
        ), 0),
        [lineItems, monthKeys]
    );

    /** Summary totals — actuals vs projected */
    const { totalActuals, totalProjected } = useMemo(() => {
        let actuals = 0;
        let projected = 0;
        for (const li of lineItems) {
            for (const mk of monthKeys) {
                const cell = li.monthly_values[mk];
                if (!cell) continue;
                if (cell.actual !== null && cell.actual !== undefined) {
                    actuals += cell.actual;
                } else if (cell.projected) {
                    projected += cell.projected;
                }
            }
        }
        return { totalActuals: actuals, totalProjected: projected };
    }, [lineItems, monthKeys]);

    // ── Loading state ───────────────────────────────────────

    if (isLoading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[#C8CDD5]" />
            </div>
        );
    }

    // ── No budget — show creation CTA ───────────────────────

    if (!budget) {
        return (
            <>
                <div className="card flex flex-col items-center py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#EBF1FF] flex items-center justify-center mb-4">
                        <DollarSign className="w-7 h-7 text-[#2563EB]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#1A1F2B] mb-2">Pre-Development Budget</h3>
                    <p className="text-sm text-[#7A8599] max-w-md mb-6">
                        Track forward cost projections for pre-development items like land cost, design fees,
                        engineering, permits, and more. Set a budget timeline and manage projected vs. actual spend.
                    </p>
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-semibold transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Create Pre-Development Budget
                    </button>
                </div>

                {/* Creation Dialog */}
                {showCreateDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-4">
                                New Pre-Development Budget
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                        Start Month
                                    </label>
                                    <input
                                        type="month"
                                        value={newStartDate.substring(0, 7)}
                                        onChange={(e) => setNewStartDate(`${e.target.value}-01`)}
                                        className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                        Duration (Months)
                                    </label>
                                    <select
                                        value={newDuration}
                                        onChange={(e) => setNewDuration(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                    >
                                        {[6, 9, 12, 15, 18, 21, 24].map((n) => (
                                            <option key={n} value={n}>
                                                {n} months
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setShowCreateDialog(false)}
                                    className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={createBudget.isPending}
                                    className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                                >
                                    {createBudget.isPending ? 'Creating...' : 'Create Budget'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // ── Budget exists — render grid ─────────────────────────

    const lockedMonths = new Set(
        monthKeys.filter((mk) => isMonthLocked(lineItems, mk))
    );

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-[#1A1F2B]">Pre-Dev Budget</h2>
                    <div className="flex items-center gap-1.5 text-xs text-[#7A8599]">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatMonthLabel(monthKeys[0])} – {formatMonthLabel(monthKeys[monthKeys.length - 1])}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowNotes(!showNotes)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showNotes
                            ? 'bg-[#EBF1FF] text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7]'
                            }`}
                    >
                        <StickyNote className="w-3.5 h-3.5" />
                        Notes
                    </button>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showSettings
                            ? 'bg-[#EBF1FF] text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7]'
                            }`}
                    >
                        <Settings className="w-3.5 h-3.5" />
                        Settings
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-[#0D7A3E]" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Actuals</div>
                        <div className="text-lg font-bold text-[#0D7A3E] tabular-nums">
                            {totalActuals === 0 ? '$0' : formatCurrency(totalActuals, 0)}
                        </div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#EBF1FF] flex items-center justify-center shrink-0">
                        <TrendingUp className="w-5 h-5 text-[#2563EB]" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Projected</div>
                        <div className="text-lg font-bold text-[#2563EB] tabular-nums">
                            {totalProjected === 0 ? '$0' : formatCurrency(totalProjected, 0)}
                        </div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F4F5F7] flex items-center justify-center shrink-0">
                        <DollarSign className="w-5 h-5 text-[#1A1F2B]" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Total Budget</div>
                        <div className="text-lg font-bold text-[#1A1F2B] tabular-nums">
                            {grandTotal === 0 ? '$0' : formatCurrency(grandTotal, 0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="card p-4 border-[#2563EB]/20">
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">
                        Budget Settings
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-[#4A5568] mb-1">
                                Start Month
                            </label>
                            <input
                                type="month"
                                value={budget.start_date.substring(0, 7)}
                                onChange={(e) => {
                                    updateBudget.mutate({
                                        id: budget.id,
                                        pursuitId,
                                        updates: { start_date: `${e.target.value}-01` },
                                    });
                                }}
                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#4A5568] mb-1">
                                Duration (Months)
                            </label>
                            <select
                                value={budget.duration_months}
                                onChange={(e) => {
                                    updateBudget.mutate({
                                        id: budget.id,
                                        pursuitId,
                                        updates: { duration_months: Number(e.target.value) },
                                    });
                                }}
                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                            >
                                {[6, 9, 12, 15, 18, 21, 24].map((n) => (
                                    <option key={n} value={n}>
                                        {n} months
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Notes Panel */}
            {showNotes && (
                <div className="card">
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">
                        Budget Notes
                    </h3>
                    <RichTextEditor
                        content={budget.notes}
                        onChange={(json) => {
                            updateBudget.mutate({
                                id: budget.id,
                                pursuitId,
                                updates: { notes: json },
                            });
                        }}
                        placeholder="Enter notes about this pre-dev budget..."
                    />
                </div>
            )}

            {/* Budget Grid */}
            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: `${200 + monthKeys.length * 100 + 110}px` }}>
                        <thead>
                            <tr className="bg-[#FAFBFC]">
                                {/* Sticky label column */}
                                <th
                                    className="sticky left-0 z-20 bg-[#FAFBFC] text-left px-4 py-2.5 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider border-b border-r border-[#E2E5EA]"
                                    style={{ minWidth: 200 }}
                                >
                                    Line Item
                                </th>
                                {/* Month columns */}
                                {monthKeys.map((mk) => {
                                    const locked = lockedMonths.has(mk);
                                    return (
                                        <th
                                            key={mk}
                                            className={`text-center px-1 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b border-[#E2E5EA] ${locked ? 'bg-[#ECFDF5] text-[#0D7A3E]' : 'text-[#7A8599]'
                                                }`}
                                            style={{ minWidth: 100 }}
                                        >
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span>{formatMonthLabel(mk)}</span>
                                                <button
                                                    onClick={() => locked ? handleUnlockMonth(mk) : setLockingMonth(mk)}
                                                    className={`p-0.5 rounded transition-colors ${locked
                                                        ? 'text-[#0D7A3E] hover:text-[#065F46]'
                                                        : 'text-[#C8CDD5] hover:text-[#7A8599]'
                                                        }`}
                                                    title={locked ? 'Unlock actuals' : 'Lock actuals for this month'}
                                                >
                                                    {locked ? (
                                                        <Lock className="w-3 h-3" />
                                                    ) : (
                                                        <Unlock className="w-3 h-3" />
                                                    )}
                                                </button>
                                            </div>
                                        </th>
                                    );
                                })}
                                {/* Total column */}
                                <th
                                    className="sticky right-0 z-20 bg-[#FAFBFC] text-right px-4 py-2.5 text-[10px] font-bold text-[#7A8599] uppercase tracking-wider border-b border-l border-[#E2E5EA]"
                                    style={{ minWidth: 110 }}
                                >
                                    Total
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((li, idx) => {
                                const rt = rowTotal(li);
                                return (
                                    <tr
                                        key={li.id}
                                        className={`group/row ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]/50'} hover:bg-[#F4F5F7]/50 transition-colors`}
                                    >
                                        {/* Label */}
                                        <td className="sticky left-0 z-10 bg-inherit px-4 py-1 border-r border-[#F0F1F4] flex items-center gap-1.5">
                                            <span className="text-xs text-[#1A1F2B] font-medium truncate">
                                                {li.label}
                                            </span>
                                            <button
                                                onClick={() => deleteLineItemMut.mutate({ id: li.id, pursuitId })}
                                                className="opacity-0 group-hover/row:opacity-100 text-[#A0AABB] hover:text-[#DC2626] p-0.5 rounded transition-all"
                                                title="Remove line item"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </td>
                                        {/* Month cells */}
                                        {monthKeys.map((mk) => {
                                            const cell = li.monthly_values[mk];
                                            const locked = lockedMonths.has(mk);
                                            const isActual = !!(cell && cell.actual !== null && cell.actual !== undefined);
                                            const value = effectiveValue(cell);
                                            return (
                                                <td
                                                    key={mk}
                                                    className={`border-[#F0F1F4] ${locked ? 'bg-[#ECFDF5]/40' : ''}`}
                                                >
                                                    <EditableCell
                                                        value={value}
                                                        isActual={isActual}
                                                        onChange={(val) => handleCellChange(li, mk, val, isActual)}
                                                    />
                                                </td>
                                            );
                                        })}
                                        {/* Row total */}
                                        <td className="sticky right-0 z-10 bg-inherit px-3 py-1 border-l border-[#F0F1F4] text-right">
                                            <span className={`text-xs font-semibold tabular-nums ${rt === 0 ? 'text-[#C8CDD5]' : 'text-[#1A1F2B]'}`}>
                                                {rt === 0 ? '—' : formatCurrency(rt, 0)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Total row */}
                            <tr className="bg-[#1A1F2B]">
                                <td className="sticky left-0 z-10 bg-[#1A1F2B] px-4 py-2 border-r border-[#2A3040] text-xs font-bold text-white uppercase tracking-wider">
                                    Total
                                </td>
                                {monthKeys.map((mk) => {
                                    const ct = colTotal(mk);
                                    const locked = lockedMonths.has(mk);
                                    return (
                                        <td key={mk} className={`px-2 py-2 text-right ${locked ? 'bg-[#0D7A3E]/20' : ''}`}>
                                            <span className={`text-xs font-bold tabular-nums ${ct === 0 ? 'text-[#4A5568]' : 'text-white'}`}>
                                                {ct === 0 ? '—' : formatCurrency(ct, 0)}
                                            </span>
                                        </td>
                                    );
                                })}
                                <td className="sticky right-0 z-10 bg-[#1A1F2B] px-3 py-2 border-l border-[#2A3040] text-right">
                                    <span className="text-xs font-bold text-white tabular-nums">
                                        {grandTotal === 0 ? '—' : formatCurrency(grandTotal, 0)}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Custom Line Item */}
            <div className="flex items-center gap-2">
                {showAddLine ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newLineLabel}
                            onChange={(e) => setNewLineLabel(e.target.value)}
                            placeholder="Custom line item name..."
                            className="px-3 py-1.5 rounded-lg border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none w-64"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newLineLabel.trim()) {
                                    addLineItem.mutate({
                                        budgetId: budget.id,
                                        label: newLineLabel.trim(),
                                        pursuitId,
                                    });
                                    setNewLineLabel('');
                                    setShowAddLine(false);
                                }
                                if (e.key === 'Escape') {
                                    setShowAddLine(false);
                                    setNewLineLabel('');
                                }
                            }}
                        />
                        <button
                            onClick={() => {
                                if (newLineLabel.trim()) {
                                    addLineItem.mutate({
                                        budgetId: budget.id,
                                        label: newLineLabel.trim(),
                                        pursuitId,
                                    });
                                    setNewLineLabel('');
                                    setShowAddLine(false);
                                }
                            }}
                            disabled={!newLineLabel.trim() || addLineItem.isPending}
                            className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white text-xs font-medium transition-colors"
                        >
                            Add
                        </button>
                        <button
                            onClick={() => { setShowAddLine(false); setNewLineLabel(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs text-[#7A8599] hover:bg-[#F4F5F7]"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowAddLine(true)}
                        className="flex items-center gap-1.5 text-xs text-[#7A8599] hover:text-[#2563EB] transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Custom Line Item
                    </button>
                )}
            </div>

            {/* Lock Confirmation Dialog */}
            {lockingMonth && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in">
                        <h2 className="text-lg font-semibold text-[#1A1F2B] mb-2">Lock Actuals</h2>
                        <p className="text-sm text-[#7A8599] mb-1">
                            Lock actuals for <span className="font-medium text-[#1A1F2B]">{formatMonthLabel(lockingMonth)}</span>?
                        </p>
                        <p className="text-xs text-[#7A8599] mb-4">
                            This will copy each projected value to actual for this month.
                            You can still edit individual actual values after locking. Use "Unlock" to revert.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setLockingMonth(null)}
                                className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleLockMonth(lockingMonth)}
                                className="px-4 py-2 rounded-lg bg-[#0D7A3E] hover:bg-[#065F46] text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                <Lock className="w-3.5 h-3.5 inline mr-1.5" />
                                Lock Actuals
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
