'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect, Fragment } from 'react';
import {
    usePredevBudget,
    useCreatePredevBudget,
    useUpdatePredevBudget,
    useUpsertLineItemValues,
    useAddCustomLineItem,
    useDeleteLineItem,
    useSnapshotBudget,
    useAmendBudget,
    useBudgetAmendments,
    useFundingPartners,
    useCreateFundingPartner,
    useUpdateFundingPartner,
    useDeleteFundingPartner,
    useFundingSplits,
    useUpsertFundingSplit,
    useUpdateLineItemCostGroups,
    useUpsertScheduleItem,
    useDeleteScheduleItem,
    useSeedDefaultScheduleItems,
    usePursuit,
} from '@/hooks/useSupabaseQueries';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, usePathname } from 'next/navigation';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import type { PredevBudget, PredevBudgetLineItem, MonthlyCell, PredevScheduleItem } from '@/types';
import type { YardiMonthlyCostAggregate } from '@/app/actions/accounting';
import { CostCodeMappingDialog } from '@/components/pursuits/CostCodeMappingDialog';
import { UnallocatedMappingDialog } from '@/components/pursuits/UnallocatedMappingDialog';
import {
    usePredevYardiAggregates,
    predevMonthKeys,
    buildYardiIndex,
    yardiActualFor,
    computeUnallocated,
    summarizePredevTotals,
    yardiGrandTotal,
    findMappingOverlaps,
} from '@/components/pursuits/predevYardi';
import { toast } from '@/lib/toast';
import {
    Plus, Loader2, DollarSign, Trash2, Settings, ChevronDown, ChevronUp,
    CalendarDays, StickyNote, TrendingUp, Camera, Pencil, Pin, PinOff,
    Database, AlertCircle, History, Users, Shield, BarChart3, FileDown, RefreshCw, Clock,
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { forecastCellValue, isMonthClosed, OPEN_MONTH_NOTE } from '@/lib/calculations/predevForecast';

interface PredevBudgetTabProps {
    pursuitId: string;
}

// ── View Modes ──────────────────────────────────────────────
type ViewMode = 'budget' | 'forecast' | 'variance';

// ── Helpers ─────────────────────────────────────────────────

const EMPTY_AGGS: YardiMonthlyCostAggregate[] = [];

/** mutate() options that surface a failure as a toast instead of failing silently. */
function toastOnError(message: string) {
    return {
        onError: (err: unknown) => {
            console.error(`${message}:`, err);
            toast.error(message, err);
        },
    };
}

type CellStyle = 'normal' | 'actual-yardi' | 'actual-yardi-pending' | 'actual-manual' | 'budget-snapshot' | 'variance-positive' | 'variance-negative';

interface CellInfo {
    value: number;
    style: CellStyle;
    editable: boolean;
    source: 'projected' | 'yardi' | 'manual-override' | 'snapshot' | 'variance';
    tooltip?: string;
}

function formatMonthLabel(key: string): string {
    const [y, m] = key.split('-');
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function shortMonthLabel(key: string): string {
    const [, m] = key.split('-');
    const date = new Date(2000, Number(m) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
}

/** Get the current month key */
function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Is a month in the future (after current month)? */
function isMonthFuture(monthKey: string, currentMonth: string): boolean {
    return monthKey > currentMonth;
}

/** Is the "pending close" window (month ended but <15 days ago)? */
function isMonthPendingClose(monthKey: string, today: Date, currentMonth: string): boolean {
    if (monthKey >= currentMonth) return false;
    return !isMonthClosed(monthKey, today);
}

/** Parse a user-typed currency string ("$1,250", " 900 ") → number, or null if not numeric. */
function parseCurrencyInput(raw: string): number | null {
    const cleaned = raw.replace(/[$,\s]/g, '');
    if (cleaned === '') return 0;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
}

/** Placeholder for a Yardi-dependent number that hasn't loaded yet. */
function YardiPending() {
    return (
        <span className="inline-flex items-center gap-1 text-sm font-normal text-[var(--text-faint)]" title="Loading Yardi actuals">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </span>
    );
}

// ── EditableCell ────────────────────────────────────────────

function EditableCell({
    value,
    cellStyle,
    disabled,
    tooltip,
    forceEditing,
    onChange,
}: {
    value: number;
    cellStyle: CellStyle;
    disabled?: boolean;
    tooltip?: string;
    forceEditing?: boolean;
    onChange: (val: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [localVal, setLocalVal] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    // Set when the edit is cancelled (Escape) so the blur fired on unmount doesn't save
    const skipCommitRef = useRef(false);

    const isEditing = editing || forceEditing;

    const handleStartEdit = useCallback(() => {
        if (disabled) return;
        skipCommitRef.current = false;
        setLocalVal(value === 0 ? '' : value.toLocaleString('en-US'));
        setEditing(true);
    }, [value, disabled]);

    useEffect(() => {
        if (forceEditing) {
            setLocalVal(value === 0 ? '' : value.toLocaleString('en-US'));
        }
    }, [forceEditing, value]);

    useEffect(() => {
        if (editing && inputRef.current && !forceEditing) inputRef.current.focus();
    }, [editing, forceEditing]);

    const handleBlur = useCallback(() => {
        if (!forceEditing) setEditing(false);
        if (skipCommitRef.current) { skipCommitRef.current = false; return; }
        const parsed = parseCurrencyInput(localVal);
        if (parsed === null) {
            // Not a number — discard rather than silently saving 0
            setLocalVal(value === 0 ? '' : value.toLocaleString('en-US'));
            return;
        }
        if (parsed !== value) onChange(parsed);
    }, [localVal, value, onChange, forceEditing]);

    if (isEditing && !disabled) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={localVal}
                onChange={(e) => setLocalVal(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                    // Blur (rather than calling handleBlur directly) so the commit runs exactly once
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape' && !forceEditing) { skipCommitRef.current = true; setEditing(false); }
                }}
                className={`w-full h-full px-1 py-1 text-right text-xs font-mono bg-transparent outline-none border focus:border-[var(--accent)] rounded ${forceEditing ? 'border-[var(--table-row-border)] bg-[var(--bg-card)] shadow-inner' : 'border-2 border-[var(--accent)]'}`}
            />
        );
    }

    const styleClasses = {
        'normal': 'text-[var(--text-primary)]',
        'actual-yardi': 'text-[var(--success)] font-semibold',
        'actual-yardi-pending': 'text-[var(--warning)] font-semibold',
        'actual-manual': 'text-[var(--accent)] font-semibold',
        'budget-snapshot': 'text-[var(--text-secondary)]',
        'variance-positive': 'text-[var(--success)] font-semibold',
        'variance-negative': 'text-[var(--danger)] font-semibold',
    };

    return (
        <div
            title={tooltip}
            onClick={handleStartEdit}
            role={disabled ? undefined : 'button'}
            tabIndex={disabled ? undefined : 0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); handleStartEdit(); } }}
            className={`px-2 py-1.5 text-right text-xs font-mono tabular-nums transition-colors rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${disabled ? 'cursor-default' : 'cursor-text hover:bg-[var(--bg-elevated)]'
                } ${value === 0 ? 'text-[var(--border-strong)]' : styleClasses[cellStyle]}`}
        >
            {value === 0 ? '—' : formatCurrency(value, 0)}
        </div>
    );
}

// ── Funding Split Cell ──────────────────────────────────────

function FundingSplitCell({
    amount, splitPct, isSlrh, onChangeSplit,
}: {
    amount: number;
    splitPct: number;
    isSlrh: boolean;
    onChangeSplit: (pct: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [localPct, setLocalPct] = useState(String(splitPct));
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.select();
    }, [editing]);

    const handleBlur = () => {
        setEditing(false);
        const num = parseFloat(localPct);
        if (!isNaN(num) && num >= 0 && num <= 100 && num !== splitPct) {
            onChangeSplit(Math.round(num * 100) / 100);
        }
    };

    return (
        <div className="flex flex-col items-end gap-0">
            <span className={`text-[11px] font-mono tabular-nums ${amount === 0 ? 'text-[var(--border-strong)]' : isSlrh ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                {amount === 0 ? '—' : formatCurrency(amount, 0)}
            </span>
            {editing ? (
                <input
                    ref={inputRef}
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={localPct}
                    onChange={(e) => setLocalPct(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') { setLocalPct(String(splitPct)); setEditing(false); }
                    }}
                    className="w-14 text-right text-[11px] font-mono bg-transparent outline-none border border-[var(--accent)] rounded px-1 py-0"
                />
            ) : (
                <button
                    onClick={() => { setLocalPct(String(splitPct)); setEditing(true); }}
                    className="text-[11px] font-mono text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors tabular-nums"
                    title="Click to change split %"
                >
                    {splitPct}%
                </button>
            )}
        </div>
    );
}

// ── Predev Schedule Gantt Rows ────────────────────────────────

function PredevScheduleRows({
    scheduleItems,
    monthKeys,
    visibleMonths,
    closedMonths,
    forwardMonths,
    expandLTD,
    onUpsert,
    onDelete,
    onSeed,
    onAddBlank,
    pursuitId
}: {
    scheduleItems: PredevScheduleItem[];
    monthKeys: string[];
    visibleMonths: string[];
    closedMonths: string[];
    forwardMonths: string[];
    expandLTD: boolean;
    onUpsert: (id: string | null, updates: any) => void;
    onDelete: (id: string) => void;
    onSeed: () => void;
    onAddBlank: () => void;
    pursuitId: string;
}) {
    // Group items by section
    const grouped = scheduleItems.reduce((acc, item) => {
        const sec = item.section || 'General';
        if (!acc[sec]) acc[sec] = [];
        acc[sec].push(item);
        return acc;
    }, {} as Record<string, PredevScheduleItem[]>);

    const totalCols = 1 + (!expandLTD ? 1 : (closedMonths.length + (closedMonths.length > 0 ? 1 : 0))) + forwardMonths.length + 1;

    return (
        <>
            <tr className="bg-[var(--bg-elevated)]">
                <td colSpan={totalCols} className="p-0 border-b border-[var(--border)] border-t-0 bg-[var(--bg-elevated)]">
                    <div className="sticky left-0 z-30 px-3 py-2 text-xs font-bold text-[var(--text-primary)] uppercase flex items-center gap-6 w-max bg-[var(--bg-elevated)] shadow-[1px_0_0_0_var(--border)]" style={{ minWidth: 340 }}>
                        <span className="tracking-widest">Pre-Development Schedule</span>
                        <div className="flex gap-2">
                            {scheduleItems.length === 0 && (
                                <button onClick={onSeed} className="flex items-center gap-1.5 px-3 py-1 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors rounded-md shadow-sm normal-case flex-shrink-0">
                                    <CalendarDays className="w-3.5 h-3.5" />
                                    Generate Default Schedule
                                </button>
                            )}
                            <button onClick={onAddBlank} className="flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors rounded-md shadow-sm normal-case flex-shrink-0">
                                <Plus className="w-3 h-3" /> Add Item
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
            {scheduleItems.length === 0 && (
                <tr className="bg-[var(--bg-card)]">
                     <td colSpan={totalCols} className="p-0 border-b-[3px] border-[var(--border-strong)] relative">
                         <div className="sticky left-0 z-20 flex flex-col items-center justify-center text-[var(--text-faint)] py-8 px-4 w-full" style={{ maxWidth: 'calc(100vw - 320px)' }}>
                            <CalendarDays className="w-6 h-6 mb-2 opacity-50" />
                            <span className="text-xs text-[var(--text-muted)]">No schedule items defined. Use the buttons above to add entries.</span>
                        </div>
                    </td>
                </tr>
            )}
            {Object.entries(grouped).map(([section, items]: [string, PredevScheduleItem[]], idx, arr) => (
                <Fragment key={section}>
                    <tr className="bg-[var(--bg-primary)]">
                        <td colSpan={totalCols} className="p-0 border-b border-[var(--table-row-border)] bg-[var(--bg-elevated)] relative">
                            <div className="sticky left-0 z-20 px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider w-max bg-[var(--bg-elevated)] shadow-[1px_0_0_0_var(--border)]" style={{ minWidth: 340 }}>
                                {section}
                            </div>
                        </td>
                    </tr>
                    {items.map((item, itemIdx) => {
                        // Calculate Gantt bar position based on the global monthKeys array index
                        let barLeft = -1;
                        let barWidth = 0;
                        if (item.start_date && item.duration_weeks > 0) {
                            const startMk = item.start_date.substring(0, 7);
                            const startIndex = monthKeys.indexOf(startMk);
                            if (startIndex !== -1) {
                                // Find day offset
                                const day = parseInt(item.start_date.substring(8, 10), 10);
                                const dayOffset = (day / 30) * 75; // 75px per col
                                barLeft = (startIndex * 75) + dayOffset;
                                barWidth = (item.duration_weeks / 4.33) * 75;
                                
                                if (!expandLTD) {
                                    const firstVisibleMonth = forwardMonths[0];
                                    const firstVisibleIndex = monthKeys.indexOf(firstVisibleMonth);
                                    barLeft = barLeft - (firstVisibleIndex * 75);
                                } else if (closedMonths.length > 0) {
                                    if (startIndex >= closedMonths.length) {
                                        barLeft += 3; // add today line offset
                                    }
                                }
                            }
                        }

                        const isLastItemInLastSection = idx === arr.length - 1 && itemIdx === items.length - 1;
                        const cellBorderClass = isLastItemInLastSection ? "border-b-[3px] border-[var(--border-strong)]" : "border-b border-[var(--table-row-border)]";

                        let timelineCols = forwardMonths.length;
                        let timelineWidth = forwardMonths.length * 75;
                        if (expandLTD) {
                             timelineCols = closedMonths.length + (closedMonths.length > 0 ? 1 : 0) + forwardMonths.length;
                             timelineWidth = (closedMonths.length + forwardMonths.length) * 75 + (closedMonths.length > 0 ? 3 : 0);
                        }

                        return (
                            <tr key={item.id} className="group/row hover:bg-[var(--bg-elevated)] transition-colors h-[32px] relative">
                                <td className={`sticky left-0 z-10 bg-inherit border-r border-[var(--table-row-border)] p-0 ${cellBorderClass}`}>
                                    <div className="flex h-full w-full items-center">
                                        <div className="flex-1 px-3 py-1 flex items-center text-xs font-medium text-[var(--text-primary)] border-r border-[var(--border)] hover:bg-[var(--bg-elevated)] transition-colors">
                                            <input 
                                                type="text" 
                                                className="w-full bg-transparent outline-none placeholder-[var(--text-faint)] focus:bg-[var(--bg-card)] px-1 -mx-1 rounded text-ellipsis" 
                                                defaultValue={item.label || ''} 
                                                title={item.label || undefined}
                                                aria-label="Milestone name"
                                                onBlur={(e) => { if (e.target.value !== item.label) onUpsert(item.id, { label: e.target.value }) }}
                                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                                placeholder="Milestone name" 
                                            />
                                        </div>
                                        <div className="w-[120px] px-1 border-r border-[var(--border)] relative h-full flex items-center hover:bg-[var(--bg-elevated)] transition-colors">
                                            <input 
                                                type="date" 
                                                className="w-full text-xs bg-transparent outline-none focus:bg-[var(--bg-card)] px-1 -mx-1 rounded cursor-pointer" 
                                                defaultValue={item.start_date || ''} 
                                                aria-label={`${item.label || 'Milestone'} start date`}
                                                onBlur={(e) => { const v = e.target.value || null; if (v !== (item.start_date || null)) onUpsert(item.id, { start_date: v }) }}
                                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                            />
                                        </div>
                                        <div className="w-[70px] p-1 flex items-center justify-center relative h-full hover:bg-[var(--bg-elevated)] transition-colors">
                                            <input 
                                                type="number" 
                                                className="w-10 text-xs text-right bg-transparent outline-none appearance-none pr-1 focus:bg-[var(--bg-card)] px-1 -ml-1 rounded" 
                                                defaultValue={item.duration_weeks || 0} 
                                                aria-label={`${item.label || 'Milestone'} duration in weeks`}
                                                onBlur={(e) => { 
                                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                                    if (val !== item.duration_weeks) onUpsert(item.id, { duration_weeks: val });
                                                }}
                                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                                min={0}
                                            />
                                            <span className="text-[11px] text-[var(--text-faint)]">wks</span>
                                        </div>
                                    </div>
                                    <button onClick={() => { if (window.confirm(`Delete schedule item "${item.label || 'Untitled'}"?`)) onDelete(item.id); }} aria-label="Delete schedule item" className="absolute right-0 top-0 bottom-0 px-2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-[var(--danger)] bg-[var(--bg-card)] backdrop-blur-sm transition-opacity flex items-center justify-center border-l border-[var(--border)] z-10 hover:bg-[var(--danger-bg)]">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </td>
                                
                                {!expandLTD && <td className={`border-r border-[var(--table-row-border)] bg-[var(--bg-card)] ${cellBorderClass}`}></td>}
                                
                                {/* Timeline Columns container */}
                                <td colSpan={timelineCols} className={`p-0 relative overflow-hidden ${cellBorderClass}`} style={{ minWidth: timelineWidth, maxWidth: timelineWidth }}>
                                    <div className="flex h-full w-full absolute inset-0">
                                        {/* Background column guides */}
                                        {expandLTD && closedMonths.map(mk => <div key={mk} className="h-full border-r border-[var(--table-row-border)] bg-[var(--success-bg)]/5" style={{ minWidth: 75, width: 75 }}></div>)}
                                        {expandLTD && closedMonths.length > 0 && <div className="h-full bg-[var(--accent)]/10 border-r border-[var(--table-row-border)]" style={{ minWidth: 3, width: 3 }}></div>}
                                        {forwardMonths.map(mk => <div key={mk} className="h-full border-r border-[var(--table-row-border)]" style={{ minWidth: 75, width: 75 }}></div>)}
                                    </div>
                                    {/* The Gantt Bar */}
                                    {barLeft >= 0 && (
                                        <div 
                                            className="absolute top-1.5 bottom-1.5 bg-[var(--warning-bg)] rounded shadow-sm border border-[var(--warning)] z-10 flex items-center overflow-hidden px-1.5 pointer-events-none"
                                            style={{ left: barLeft, width: barWidth }}
                                        >
                                           <span className="text-[11px] font-semibold text-[var(--warning)] truncate w-full">{item.label}</span>
                                        </div>
                                    )}
                                </td>
                                
                                <td className={`bg-[var(--bg-primary)] border-l border-[var(--table-row-border)] ${cellBorderClass}`}></td>
                            </tr>
                        );
                    })}
                </Fragment>
            ))}
        </>
    );
}

// ── Main Component ──────────────────────────────────────────

export function PredevBudgetTab({ pursuitId }: PredevBudgetTabProps) {
    const router = useRouter();
    const pathname = usePathname();
    // Drill into the Pursuit Costs tab on the current pursuit URL (short id), filtered to some codes
    const openCostsFor = (codes: string) => router.push(`${pathname}?tab=costs&cost_codes=${encodeURIComponent(codes)}`);
    const { data: budget, isLoading } = usePredevBudget(pursuitId);
    const createBudget = useCreatePredevBudget();
    const updateBudget = useUpdatePredevBudget();
    const upsertValues = useUpsertLineItemValues();
    const addLineItem = useAddCustomLineItem();
    const deleteLineItemMut = useDeleteLineItem();
    const snapshotBudgetMut = useSnapshotBudget();
    const amendBudgetMut = useAmendBudget();
    const { data: fundingPartners } = useFundingPartners(pursuitId);
    const { data: fundingSplits } = useFundingSplits(budget?.id ?? '');
    const [showAmendments, setShowAmendments] = useState(false);
    // Revision history is only fetched while its panel is open
    const { data: amendments, isLoading: amendmentsLoading } = useBudgetAmendments(showAmendments ? budget?.id ?? '' : '');
    const createPartner = useCreateFundingPartner();
    const updatePartner = useUpdateFundingPartner();
    const deletePartner = useDeleteFundingPartner();
    const upsertSplit = useUpsertFundingSplit();
    const upsertScheduleItem = useUpsertScheduleItem();
    const deleteScheduleItem = useDeleteScheduleItem();
    const seedScheduleItems = useSeedDefaultScheduleItems();

    const { data: pursuit } = usePursuit(pursuitId);

    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    // View mode
    const [viewMode, setViewMode] = useState<ViewMode>('forecast');
    // UI panels
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [showAddLine, setShowAddLine] = useState(false);
    const [showFunding, setShowFunding] = useState(false);
    const [showAmendDialog, setShowAmendDialog] = useState(false);
    const [amendReason, setAmendReason] = useState('');
    const [newLineLabel, setNewLineLabel] = useState('');
    const [newPartnerName, setNewPartnerName] = useState('');
    const [newPartnerSplit, setNewPartnerSplit] = useState('');
    const [mappingLineItem, setMappingLineItem] = useState<PredevBudgetLineItem | null>(null);
    const [showUnallocatedMapping, setShowUnallocatedMapping] = useState(false);
    const [showPushConfirm, setShowPushConfirm] = useState(false);
    const [showSchedule, setShowSchedule] = useState(true);
    const [isEditAll, setIsEditAll] = useState(false);
    // Latest locally-edited monthly values per line item, used until the optimistic cache update
    // lands (rapid edits across cells). `known` holds every monthly_values object this ref produced
    // (plus the base it started from); if the cache holds anything else, something else changed it
    // (refetch, another tab) and the cache wins.
    const pendingUpdatesRef = useRef<Record<string, { values: Record<string, MonthlyCell>; known: Record<string, MonthlyCell>[] }>>({});
    // Per-line-item save queue. Each save writes the line item's whole month map, so two saves in
    // flight at once could land out of order and drop an edit; saves for one line item run one at a
    // time, and a queued save sends whatever the latest values are when its turn comes.
    const saveQueueRef = useRef<Record<string, { chain: Promise<boolean>; queued: boolean }>>({});
    useEffect(() => { pendingUpdatesRef.current = {}; saveQueueRef.current = {}; }, [pursuitId]);
    const queryClient = useQueryClient();
    // Creation dialog
    const [newStartDate, setNewStartDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [newDuration, setNewDuration] = useState(12);

    // Yardi actuals (cached per pursuit; shared with the Overview tab's budget card)
    const {
        data: yardiAggregates = EMPTY_AGGS,
        isLoading: yardiLoading,
        isError: yardiError,
        refetch: refetchYardi,
    } = usePredevYardiAggregates(pursuitId, { enabled: !!budget });

    // ── Derived data ────────────────────────────────────────
    const today = useMemo(() => new Date(), []);
    const currentMonth = getCurrentMonthKey();

    // Budget-configured month range, extended to cover any Yardi actuals and schedule items outside it
    const monthKeys = useMemo(
        () => budget ? predevMonthKeys(budget, yardiAggregates) : [],
        [budget, yardiAggregates]
    );

    const lineItems = useMemo(() => budget?.line_items ?? [], [budget?.line_items]);
    const scheduleItems = budget?.schedule_items ?? [];
    const hasSnapshot = !!budget?.budget_snapshot;

    // Split months into closed (LTD) and forward
    const [expandLTD, setExpandLTD] = useState(false);
    const closedMonths = useMemo(
        () => monthKeys.filter((mk) => isMonthClosed(mk, today)),
        [monthKeys, today]
    );
    const forwardMonths = useMemo(
        () => monthKeys.filter((mk) => !isMonthClosed(mk, today)),
        [monthKeys, today]
    );
    // The columns to actually render
    const visibleMonths = useMemo(() => {
        if (expandLTD) return monthKeys; // Show everything when expanded
        return forwardMonths; // Only forward months when collapsed
    }, [expandLTD, monthKeys, forwardMonths]);

    // Yardi lookup: code → month → amount (2-digit groups roll up their detail codes)
    const yardiIndex = useMemo(() => buildYardiIndex(yardiAggregates), [yardiAggregates]);

    /** Get Yardi actual for a line item + month */
    const getYardiActual = useCallback(
        (li: PredevBudgetLineItem, monthKey: string): number | null => yardiActualFor(yardiIndex, li, monthKey),
        [yardiIndex]
    );

    // ── Unallocated Yardi costs ─────────────────────────────
    // Yardi detail codes with activity that aren't covered by any line item
    const unallocated = useMemo(() => computeUnallocated(yardiAggregates, lineItems), [yardiAggregates, lineItems]);
    const unallocatedByMonth = unallocated.byMonth;
    const unallocatedItems = unallocated.items;
    const unallocatedTotal = unallocated.total;
    const hasUnallocated = unallocatedByMonth.size > 0;

    // Line items whose Yardi mappings capture the same transactions (their actuals double count)
    const mappingOverlaps = useMemo(() => findMappingOverlaps(lineItems), [lineItems]);

    /**
     * Get the effective display value for a cell based on view mode
     */
    const computeCellInfo = useCallback((li: PredevBudgetLineItem, monthKey: string): CellInfo => {
        const cell = li.monthly_values[monthKey] ?? { projected: 0, actual: null };
        const closed = isMonthClosed(monthKey, today);
        const future = isMonthFuture(monthKey, currentMonth);
        const yardiVal = getYardiActual(li, monthKey);
        const snapshotVal = budget?.budget_snapshot?.[li.id]?.[monthKey] ?? 0;

        if (viewMode === 'budget') {
            // Show snapshot if exists, otherwise projected
            const val = hasSnapshot ? snapshotVal : cell.projected;
            return { value: val, style: 'budget-snapshot', editable: true, source: 'snapshot' };
        }

        if (viewMode === 'variance') {
            // Forecast value (same logic as forecast mode)
            const forecastVal = forecastCellValue(cell, yardiVal, closed);

            const budgetVal = hasSnapshot ? snapshotVal : cell.projected;
            const variance = forecastVal - budgetVal;
            return {
                value: variance,
                style: variance > 0 ? 'variance-negative' : variance < 0 ? 'variance-positive' : 'normal',
                editable: false,
                source: 'variance',
            };
        }

        // Forecast mode
        if (closed) {
            // Manually overridden actuals
            if (cell.manual_override && cell.actual !== null && cell.actual !== undefined) {
                return { value: cell.actual, style: 'actual-manual', editable: true, source: 'manual-override' };
            }
            // Yardi actuals
            if (yardiVal !== null && yardiVal !== 0) {
                return {
                    value: yardiVal,
                    style: 'actual-yardi',
                    editable: false,
                    source: 'yardi'
                };
            }
            // Fallbacks if no Yardi data
            if (cell.actual !== null && cell.actual !== undefined) {
                return { value: cell.actual, style: 'normal', editable: true, source: 'projected' };
            }
            return { value: cell.projected, style: 'normal', editable: true, source: 'projected' };
        }

        // Future or Pending
        const pending = !closed && !future;
        const baseYardi = yardiVal ?? 0;
        const combined = baseYardi + cell.projected;

        let styleMode: 'normal' | 'actual-yardi-pending' | 'actual-manual' = 'normal';
        let tooltip = undefined;

        if (baseYardi > 0) {
            if (cell.projected > 0) {
                // Mixed state (Yardi + Manual Forecast)
                styleMode = 'actual-manual';
                tooltip = `Total: ${formatCurrency(combined, 0)}\n---\nYardi Actual: ${formatCurrency(baseYardi, 0)}\nManual Addition: ${formatCurrency(cell.projected, 0)}`;
            } else if (pending) {
                // Purely Yardi pending
                styleMode = 'actual-yardi-pending';
                tooltip = `Yardi Actual: ${formatCurrency(baseYardi, 0)}\n(Pending close)`;
            } else {
                // Purely Yardi future
                styleMode = 'actual-yardi-pending';
                tooltip = `Yardi Actual: ${formatCurrency(baseYardi, 0)}\n(Future month actuals)`;
            }
        } else if (cell.projected !== 0) {
            tooltip = `Manual Forecast: ${formatCurrency(cell.projected, 0)}`;
        }

        return { value: combined, style: styleMode, editable: true, source: 'projected', tooltip };
    }, [viewMode, today, currentMonth, getYardiActual, budget?.budget_snapshot, hasSnapshot]);

    // Every cell is read several times per render (cell, row total, column total, LTD, funding
    // rows, exports), so compute the grid once per data/view change instead of per read.
    const cellGrid = useMemo(() => {
        const grid = new Map<string, Map<string, CellInfo>>();
        for (const li of lineItems) {
            const row = new Map<string, CellInfo>();
            for (const mk of monthKeys) row.set(mk, computeCellInfo(li, mk));
            grid.set(li.id, row);
        }
        return grid;
    }, [lineItems, monthKeys, computeCellInfo]);

    const getCellInfo = useCallback(
        (li: PredevBudgetLineItem, monthKey: string): CellInfo =>
            cellGrid.get(li.id)?.get(monthKey) ?? computeCellInfo(li, monthKey),
        [cellGrid, computeCellInfo]
    );

    // ── Handlers ─────────────────────────────────────────────

    const handleCreate = async () => {
        try {
            await createBudget.mutateAsync({ pursuitId, startDate: newStartDate, durationMonths: newDuration });
            setShowCreateDialog(false);
        } catch (err) {
            console.error('Failed to create pre-dev budget:', err);
            toast.error('Failed to create budget', err);
        }
    };

    /** Latest month map for a line item: unsaved/in-flight local edits if the cache still reflects them. */
    const latestMonthlyValues = useCallback((li: PredevBudgetLineItem): Record<string, MonthlyCell> => {
        const pending = pendingUpdatesRef.current[li.id];
        return pending && pending.known.includes(li.monthly_values) ? pending.values : li.monthly_values;
    }, []);

    /**
     * Show a line item's new month map immediately and queue its save behind any save already
     * in flight for that line item. Resolves true once saved, false if the save failed (the grid
     * is then reloaded from the server and the error is toasted unless `silent`).
     */
    const saveMonthlyValues = useCallback(
        (li: PredevBudgetLineItem, newMonthly: Record<string, MonthlyCell>, opts?: { silent?: boolean }): Promise<boolean> => {
            const pending = pendingUpdatesRef.current[li.id];
            const usePending = !!pending && pending.known.includes(li.monthly_values);
            pendingUpdatesRef.current[li.id] = {
                values: newMonthly,
                known: [...(usePending ? pending.known : [li.monthly_values]), newMonthly],
            };

            // Optimistic update now — the mutation's own onMutate only runs when the queued save starts
            const key = ['predev-budget', pursuitId] as const;
            queryClient.setQueryData(key, (old: PredevBudget | null | undefined) => old?.line_items ? {
                ...old,
                line_items: old.line_items.map((x) => x.id === li.id ? { ...x, monthly_values: newMonthly } : x),
            } : old);

            const queue = (saveQueueRef.current[li.id] ??= { chain: Promise.resolve(true), queued: false });
            if (queue.queued) return queue.chain; // the queued save will pick up these values
            queue.queued = true;
            queue.chain = queue.chain.then(async () => {
                queue.queued = false;
                const values = pendingUpdatesRef.current[li.id]?.values ?? newMonthly;
                try {
                    await upsertValues.mutateAsync({ lineItemId: li.id, monthlyValues: values, pursuitId });
                    return true;
                } catch (err) {
                    console.error('Failed to save budget values:', err);
                    // Drop local state for this line item and reload what the server actually has
                    delete pendingUpdatesRef.current[li.id];
                    queryClient.invalidateQueries({ queryKey: key });
                    if (!opts?.silent) toast.error(`Failed to save "${li.label}" — reloaded the last saved values`, err);
                    return false;
                }
            });
            return queue.chain;
        },
        [pursuitId, queryClient, upsertValues]
    );

    const handleCellChange = useCallback(
        (lineItem: PredevBudgetLineItem, monthKey: string, newValue: number) => {
            if (viewMode === 'budget' && hasSnapshot) {
                if (!budget) return;
                const newSnapshot = JSON.parse(JSON.stringify(budget.budget_snapshot || {}));
                if (!newSnapshot[lineItem.id]) newSnapshot[lineItem.id] = {};
                newSnapshot[lineItem.id][monthKey] = newValue;
                updateBudget.mutate({ id: budget.id, pursuitId, updates: { budget_snapshot: newSnapshot } }, toastOnError('Failed to save budget value'));
                return;
            }

            const currentOverrides = latestMonthlyValues(lineItem);
            const current = currentOverrides[monthKey] ?? { projected: 0, actual: null };
            const closed = isMonthClosed(monthKey, today);

            let updated: MonthlyCell;
            if (viewMode === 'budget') {
                // No snapshot yet: the budget view shows raw projected values, so edit them directly
                updated = { ...current, projected: newValue };
            } else if (closed) {
                // Editing a closed month = manual override of ACTUAL
                updated = { projected: current.projected, actual: newValue, manual_override: true };
            } else {
                // Editing a pending or future month = editing PROJECTED portion
                const yardiVal = getYardiActual(lineItem, monthKey) ?? 0;
                // newValue is the combined total they want to see, so projected = newValue - yardiVal
                const newProjected = Math.max(0, newValue - yardiVal);
                updated = { projected: newProjected, actual: current.actual, manual_override: current.manual_override };
            }
            saveMonthlyValues(lineItem, { ...currentOverrides, [monthKey]: updated });
        },
        [pursuitId, today, getYardiActual, viewMode, hasSnapshot, budget, updateBudget, latestMonthlyValues, saveMonthlyValues]
    );

    const confirmPushBudgetToForecast = useCallback(async () => {
        setShowPushConfirm(false);
        if (!hasSnapshot || !budget?.budget_snapshot) {
            toast.info('No baseline budget snapshot exists yet.');
            return;
        }

        const saves: Promise<boolean>[] = [];
        for (const li of lineItems) {
            let changed = false;
            const newMonthly = { ...latestMonthlyValues(li) };

            for (const mk of forwardMonths) {
                const snapshotVal = budget.budget_snapshot[li.id]?.[mk] ?? 0;
                const current = newMonthly[mk] ?? { projected: 0, actual: null };
                const yardiVal = getYardiActual(li, mk) ?? 0;

                // We want the total shown in Forecast to equal snapshotVal.
                // In forecast, total = yardiVal + projected
                const newProjected = Math.max(0, snapshotVal - yardiVal);

                if (current.projected !== newProjected) {
                    newMonthly[mk] = { ...current, projected: newProjected };
                    changed = true;
                }
            }

            if (changed) saves.push(saveMonthlyValues(li, newMonthly, { silent: true }));
        }

        if (saves.length === 0) {
            toast.info('No future months needed updating — they already match the budget.');
            return;
        }
        const results = await Promise.all(saves);
        const failed = results.filter((ok) => !ok).length;
        if (failed === 0) {
            toast.success(`Budget pushed to forecast for ${saves.length} line item${saves.length !== 1 ? 's' : ''}`);
        } else {
            toast.error(`Pushed ${saves.length - failed} of ${saves.length} line items; ${failed} failed and were reloaded. Try again.`);
        }
    }, [hasSnapshot, budget, lineItems, forwardMonths, getYardiActual, latestMonthlyValues, saveMonthlyValues]);

    const handleTogglePin = useCallback(
        (lineItem: PredevBudgetLineItem, monthKey: string) => {
            const base = latestMonthlyValues(lineItem);
            const current = base[monthKey] ?? { projected: 0, actual: null };
            const newOverride = !current.manual_override;
            const updated: MonthlyCell = { ...current, manual_override: newOverride };
            if (!newOverride) {
                // Unpinning — clear actual so Yardi takes over
                updated.actual = null;
            } else if (updated.actual === null || updated.actual === undefined) {
                // Pinning — start from the Yardi value; otherwise the cell still renders as
                // (non-editable) Yardi because an override needs a non-null actual.
                updated.actual = getYardiActual(lineItem, monthKey) ?? 0;
            }
            saveMonthlyValues(lineItem, { ...base, [monthKey]: updated });
        },
        [getYardiActual, latestMonthlyValues, saveMonthlyValues]
    );

    const handleSnapshot = () => {
        if (!budget) return;
        snapshotBudgetMut.mutate({ budgetId: budget.id, pursuitId }, {
            onSuccess: () => toast.success('Original budget snapshot saved. Variance now tracks against it.'),
            ...toastOnError('Failed to snapshot budget'),
        });
    };

    const handleAmend = () => {
        if (!budget) return;
        amendBudgetMut.mutate({ budgetId: budget.id, pursuitId, reason: amendReason || null }, {
            onSuccess: () => {
                toast.success('Original budget amended. The previous snapshot is kept in History.');
                setShowAmendDialog(false);
                setAmendReason('');
            },
            ...toastOnError('Failed to amend budget'),
        });
    };

    const handleAddLineItem = () => {
        const label = newLineLabel.trim();
        if (!budget || !label) return;
        addLineItem.mutate({ budgetId: budget.id, label, pursuitId }, toastOnError(`Failed to add line item "${label}"`));
        setNewLineLabel('');
        setShowAddLine(false);
    };

    // ── Summary calculations ─────────────────────────────────

    const { totalBudget, totalForecast, totalVariance } = useMemo(
        () => summarizePredevTotals({
            lineItems, monthKeys, snapshot: budget?.budget_snapshot ?? null,
            index: yardiIndex, unallocatedTotal, today,
        }),
        [lineItems, monthKeys, budget?.budget_snapshot, yardiIndex, unallocatedTotal, today]
    );
    const slrhPct = fundingPartners?.find(p => p.is_slrh)?.default_split_pct ?? 100;
    const yardiTotal = useMemo(() => yardiGrandTotal(yardiAggregates), [yardiAggregates]);

    // Row, column, LTD and grand totals for the current view, computed once from the cell grid
    const gridTotals = useMemo(() => {
        const rows = new Map<string, number>();
        const ltd = new Map<string, number>();
        const cols = new Map<string, number>();
        const closedSet = new Set(closedMonths);
        for (const mk of monthKeys) cols.set(mk, viewMode !== 'budget' ? (unallocatedByMonth.get(mk) ?? 0) : 0);
        for (const li of lineItems) {
            const row = cellGrid.get(li.id);
            let rowSum = 0, ltdSum = 0;
            for (const mk of monthKeys) {
                const v = row?.get(mk)?.value ?? 0;
                rowSum += v;
                if (closedSet.has(mk)) ltdSum += v;
                cols.set(mk, (cols.get(mk) ?? 0) + v);
            }
            rows.set(li.id, rowSum);
            ltd.set(li.id, ltdSum);
        }
        let grand = 0, ltdGrand = 0;
        for (const [mk, v] of cols) {
            grand += v;
            if (closedSet.has(mk)) ltdGrand += v;
        }
        return { rows, ltd, cols, grand, ltdGrand };
    }, [lineItems, monthKeys, closedMonths, cellGrid, unallocatedByMonth, viewMode]);

    const rowTotal = useCallback((li: PredevBudgetLineItem) => gridTotals.rows.get(li.id) ?? 0, [gridTotals]);
    const colTotal = useCallback((mk: string) => gridTotals.cols.get(mk) ?? 0, [gridTotals]);
    const grandTotal = gridTotals.grand;

    // Funding split % per partner + month: a monthly override, else the partner default
    const splitLookup = useMemo(() => {
        const m = new Map<string, number>();
        for (const s of fundingSplits ?? []) m.set(`${s.partner_id}|${s.month_key}`, s.split_pct);
        return m;
    }, [fundingSplits]);

    // ── Loading / Empty states ───────────────────────────────

    if (isLoading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
            </div>
        );
    }

    if (!budget) {
        return (
            <>
                <div className="card flex flex-col items-center py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
                        <DollarSign className="w-7 h-7 text-[var(--accent)]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Pre-Development Budget</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-md mb-6">
                        Track projected vs. actual pre-development costs with automated Yardi actuals integration,
                        funding partner splits, and budget-to-forecast variance analysis.
                    </p>
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Create Pre-Development Budget
                    </button>
                </div>

                {showCreateDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">New Pre-Development Budget</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Start Month</label>
                                    <input
                                        type="month"
                                        value={newStartDate.substring(0, 7)}
                                        onChange={(e) => setNewStartDate(`${e.target.value}-01`)}
                                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Duration (Months)</label>
                                    <select
                                        value={newDuration}
                                        onChange={(e) => setNewDuration(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                    >
                                        {[6, 9, 12, 15, 18, 21, 24, 30, 36].map((n) => (
                                            <option key={n} value={n}>{n} months</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                                <button onClick={handleCreate} disabled={createBudget.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm">
                                    {createBudget.isPending ? 'Creating...' : 'Create Budget'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // ── Budget exists — render ───────────────────────────────

    return (
        <div className="space-y-4">
            {/* Snapshot Banner */}
            {!hasSnapshot && (
                <div className="card p-3 border-[var(--warning)]/30 bg-[var(--warning-bg)] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-[var(--warning)]" />
                        <span className="text-xs text-[var(--text-secondary)]">
                            <strong>Finalize your Original Budget</strong> to start tracking variance against actuals.
                        </span>
                    </div>
                    <button
                        onClick={handleSnapshot}
                        disabled={snapshotBudgetMut.isPending}
                        className="px-3 py-1 rounded-lg bg-[var(--warning)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                    >
                        {snapshotBudgetMut.isPending ? 'Saving...' : 'Snapshot Budget'}
                    </button>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center flex-wrap gap-3">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Pre-Dev Budget</h2>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatMonthLabel(monthKeys[0])} – {formatMonthLabel(monthKeys[monthKeys.length - 1])}
                    </div>
                    {yardiLoading && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading Yardi actuals…
                        </span>
                    )}
                    {yardiError && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--danger)] bg-[var(--danger-bg)] px-2 py-0.5 rounded-full font-medium">
                            <AlertCircle className="w-2.5 h-2.5" /> Yardi actuals unavailable — forecast shows entered values only
                            <button onClick={() => refetchYardi()} className="underline hover:no-underline ml-1">Retry</button>
                        </span>
                    )}
                    {!yardiLoading && !yardiError && yardiAggregates.length > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--success)] bg-[var(--success-bg)] px-2 py-0.5 rounded-full font-medium">
                            <Database className="w-2.5 h-2.5" /> Yardi Connected
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-2 lg:mt-0">
                    {/* View Mode Toggle */}
                    <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5">
                        {(['budget', 'forecast', 'variance'] as ViewMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                aria-pressed={viewMode === mode}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${viewMode === mode ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-5 bg-[var(--border)] mx-1" />

                    {/* PDF Export */}
                    <button
                        onClick={async () => {
                            setIsExportingPdf(true);
                            try {
                                const { pdf } = await import('@react-pdf/renderer');
                                const { PredevBudgetPDF } = await import('@/components/export/PredevBudgetPDF');
                                const doc = <PredevBudgetPDF pursuit={pursuit!} budget={budget} lineItems={lineItems} monthKeys={monthKeys} closedMonths={closedMonths} forwardMonths={forwardMonths} expandLTD={expandLTD} getCellInfo={getCellInfo} rowTotal={rowTotal} hasUnallocated={hasUnallocated} unallocatedByMonth={unallocatedByMonth} viewMode={viewMode} showSchedule={showSchedule} scheduleItems={scheduleItems} />;
                                const blob = await pdf(doc).toBlob();
                                const { downloadBlob } = await import('@/components/export/download');
                                downloadBlob(blob, `${pursuit?.name?.replace(/[^a-zA-Z0-9-_]/g, '')}_PreDev_${viewMode}.pdf`);
                            } catch (err) {
                                console.error('PDF export failed:', err);
                                toast.error('PDF export failed', err);
                            }
                            setIsExportingPdf(false);
                        }}
                        disabled={isExportingPdf || !pursuit}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 transition-colors"
                        title="Export PDF"
                    >
                        {isExportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
                        PDF
                    </button>

                    {/* Excel Export */}
                    <button
                        onClick={async () => {
                            setIsExportingExcel(true);
                            try {
                                const { exportPredevBudgetToExcel } = await import('@/components/export/exportPredevBudgetExcel');
                                await exportPredevBudgetToExcel({
                                    pursuit: pursuit!, budget, lineItems, monthKeys, closedMonths, forwardMonths,
                                    expandLTD, getCellInfo, rowTotal, hasUnallocated, unallocatedByMonth, viewMode,
                                    showSchedule, scheduleItems
                                });
                            } catch (err) {
                                console.error('Excel export failed:', err);
                                toast.error('Excel export failed', err);
                            }
                            setIsExportingExcel(false);
                        }}
                        disabled={isExportingExcel || !pursuit}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 transition-colors"
                        title="Export Excel"
                    >
                        {isExportingExcel ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
                        Excel
                    </button>

                    <div className="w-px h-5 bg-[var(--border)] mx-1" />

                    <button onClick={() => setIsEditAll(!isEditAll)} aria-pressed={isEditAll} title={isEditAll ? 'Stop editing all cells' : 'Show every editable cell as an input'} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isEditAll ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
                        <Pencil className="w-3.5 h-3.5" /> Edit All
                    </button>

                    {hasSnapshot && (
                        <button onClick={() => setShowPushConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors" title="Overwrite forward months with original budget totals">
                            <RefreshCw className="w-3.5 h-3.5" /> Push Budget to Forecast
                        </button>
                    )}

                    <button onClick={() => setShowSchedule(!showSchedule)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showSchedule ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
                        <Clock className="w-3.5 h-3.5" /> Schedule
                    </button>

                    <button onClick={() => setShowFunding(!showFunding)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showFunding ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
                        <Users className="w-3.5 h-3.5" /> Funding
                    </button>
                    {hasSnapshot && (
                        <button onClick={() => setShowAmendments(!showAmendments)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showAmendments ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
                            <History className="w-3.5 h-3.5" /> History
                        </button>
                    )}
                    <button onClick={() => setShowNotes(!showNotes)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showNotes ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
                        <StickyNote className="w-3.5 h-3.5" /> Notes
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showSettings ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
                        <Settings className="w-3.5 h-3.5" /> Settings
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center shrink-0"><DollarSign className="w-5 h-5 text-[var(--text-primary)]" /></div>
                    <div>
                        <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider" title={hasSnapshot ? 'Snapshotted original budget' : 'No snapshot yet — showing current projected values'}>{hasSnapshot ? 'Original Budget' : 'Budget (not snapshotted)'}</div>
                        <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{totalBudget === 0 ? '$0' : formatCurrency(totalBudget, 0)}</div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-[var(--accent)]" /></div>
                    <div>
                        <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Forecast</div>
                        <div className="text-lg font-bold text-[var(--accent)] tabular-nums">{yardiLoading ? <YardiPending /> : totalForecast === 0 ? '$0' : formatCurrency(totalForecast, 0)}</div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${totalVariance > 0 ? 'bg-[var(--danger)]/10' : 'bg-[var(--success-bg)]'}`}>
                        <BarChart3 className={`w-5 h-5 ${totalVariance > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`} />
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Variance</div>
                        <div className={`text-lg font-bold tabular-nums ${totalVariance > 0 ? 'text-[var(--danger)]' : totalVariance < 0 ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'}`}>
                            {yardiLoading ? <YardiPending /> : totalVariance === 0 ? '$0' : `${totalVariance > 0 ? '+' : ''}${formatCurrency(totalVariance, 0)}`}
                        </div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center shrink-0"><Shield className="w-5 h-5 text-[var(--accent)]" /></div>
                    <div>
                        <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">SLRH Obligation</div>
                        <div className="text-lg font-bold text-[var(--accent)] tabular-nums">{yardiLoading ? <YardiPending /> : formatCurrency(totalForecast * (slrhPct / 100), 0)}</div>
                        <div className="text-[11px] text-[var(--text-faint)]">{slrhPct}% share</div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--success-bg)] flex items-center justify-center shrink-0"><Database className="w-5 h-5 text-[var(--success)]" /></div>
                    <div>
                        <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Yardi Actuals</div>
                        <div className="text-lg font-bold text-[var(--success)] tabular-nums">
                            {yardiLoading ? <YardiPending /> : yardiError ? '—' : formatCurrency(yardiTotal, 0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="card p-4 border-[var(--accent)]/20">
                    <h3 className="op-card-title mb-3">Budget Settings</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Start Month</label>
                            <input type="month" value={budget.start_date.substring(0, 7)}
                                onChange={(e) => { if (e.target.value) updateBudget.mutate({ id: budget.id, pursuitId, updates: { start_date: `${e.target.value}-01` } }, toastOnError('Failed to change start month')); }}
                                className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Duration (Months)</label>
                            <select value={budget.duration_months}
                                onChange={(e) => updateBudget.mutate({ id: budget.id, pursuitId, updates: { duration_months: Number(e.target.value) } }, toastOnError('Failed to change duration'))}
                                className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none">
                                {[6, 9, 12, 15, 18, 21, 24, 30, 36].map((n) => (<option key={n} value={n}>{n} months</option>))}
                            </select>
                        </div>
                    </div>
                    {hasSnapshot && (
                        <div className="mt-4 pt-3 border-t border-[var(--border)]">
                            <button onClick={() => setShowAmendDialog(true)} className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium">
                                <Pencil className="w-3 h-3" /> Amend Original Budget
                            </button>
                            <p className="text-[11px] text-[var(--text-faint)] mt-1">Captures current projected values as a new budget revision with an audit trail.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Notes Panel */}
            {showNotes && (
                <div className="card">
                    <h3 className="op-card-title mb-3">Budget Notes</h3>
                    <RichTextEditor content={budget.notes} onChange={(json) => updateBudget.mutate({ id: budget.id, pursuitId, updates: { notes: json } }, toastOnError('Failed to save budget notes'))} placeholder="Enter notes about this pre-dev budget..." />
                </div>
            )}

            {/* Funding Partners Panel */}
            {showFunding && (
                <div className="card p-4">
                    <h3 className="op-card-title mb-3">Funding Partners</h3>
                    <div className="space-y-2">
                        {(fundingPartners ?? []).map((p) => (
                            <div key={p.id} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-[var(--border)] sm:border-0 last:border-0">
                                <span className={`text-xs font-medium min-w-[120px] ${p.is_slrh ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                                    {p.is_slrh && <Shield className="w-3 h-3 inline mr-1" />}{p.name}
                                </span>
                                <input key={`${p.id}-${p.default_split_pct}`} type="number" min="0" max="100" step="0.5" defaultValue={p.default_split_pct}
                                    aria-label={`${p.name} default split %`}
                                    onBlur={(e) => {
                                        const num = parseFloat(e.target.value);
                                        if (e.target.value === '' || isNaN(num) || num < 0 || num > 100) { e.target.value = String(p.default_split_pct); return; }
                                        if (num !== p.default_split_pct) updatePartner.mutate({ id: p.id, pursuitId, updates: { default_split_pct: num } }, toastOnError(`Failed to update ${p.name}'s split`));
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    className="w-20 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-xs text-right text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                                <span className="text-xs text-[var(--text-muted)]">%</span>
                                <span className="text-xs text-[var(--text-faint)] ml-auto tabular-nums">{formatCurrency(totalForecast * (p.default_split_pct / 100), 0)}</span>
                                <button onClick={() => { if (window.confirm(`Remove funding partner "${p.name}"?`)) deletePartner.mutate({ id: p.id, pursuitId }, toastOnError(`Failed to remove ${p.name}`)); }} className="text-[var(--text-faint)] hover:text-[var(--danger)] p-0.5" title="Remove funding partner" aria-label={`Remove funding partner ${p.name}`}><Trash2 className="w-3 h-3" /></button>
                            </div>
                        ))}
                    </div>
                    {/* Validation */}
                    {(() => {
                        const totalPct = (fundingPartners ?? []).reduce((s, p) => s + p.default_split_pct, 0);
                        if (Math.abs(totalPct - 100) > 0.01) {
                            return <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--danger)]"><AlertCircle className="w-3 h-3" /> Splits total {totalPct.toFixed(1)}% — must equal 100%</div>;
                        }
                        return null;
                    })()}
                    {/* Add partner */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                        <input type="text" value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} placeholder="Partner name..." aria-label="New partner name"
                            className="flex-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                        <input type="number" value={newPartnerSplit} onChange={(e) => setNewPartnerSplit(e.target.value)} placeholder="%" min="0" max="100" aria-label="New partner default split %"
                            className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-xs text-right text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                        <button disabled={!newPartnerName.trim() || !newPartnerSplit || isNaN(Number(newPartnerSplit)) || Number(newPartnerSplit) < 0 || Number(newPartnerSplit) > 100}
                            onClick={() => { const name = newPartnerName.trim(); createPartner.mutate({ pursuit_id: pursuitId, name, default_split_pct: Number(newPartnerSplit) }, toastOnError(`Failed to add partner ${name}`)); setNewPartnerName(''); setNewPartnerSplit(''); }}
                            className="px-3 py-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-medium">Add</button>
                    </div>
                </div>
            )}

            {/* Amendments History */}
            {showAmendments && (
                <div className="card p-4">
                    <h3 className="op-card-title mb-3">Budget Revisions</h3>
                    {amendmentsLoading ? (
                        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-faint)]" /></div>
                    ) : (amendments ?? []).length === 0 ? (
                        <p className="text-xs text-[var(--text-faint)]">No amendments yet. The original budget snapshot is the current baseline.</p>
                    ) : (
                        <div className="space-y-2">
                            {(amendments ?? []).map((a) => (
                                <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-[var(--table-row-border)] last:border-0">
                                    <span className="text-xs font-bold text-[var(--accent)] min-w-[50px]">Rev {a.revision_number}</span>
                                    <span className="text-[11px] text-[var(--text-faint)]">{new Date(a.amended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{a.reason || 'No reason provided'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Overlapping Yardi mappings double count actuals */}
            {viewMode !== 'budget' && yardiAggregates.length > 0 && mappingOverlaps.length > 0 && (
                <div className="card p-3 border-[var(--danger)]/30 bg-[var(--danger-bg)] flex items-start gap-2" role="alert">
                    <AlertCircle className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" />
                    <div className="text-xs text-[var(--text-secondary)]">
                        <strong className="text-[var(--danger)]">Yardi actuals are counted twice.</strong>{' '}
                        These mappings capture the same transactions; open the line item&apos;s mapping (the database icon) and remove one:
                        <ul className="mt-1 space-y-0.5">
                            {mappingOverlaps.slice(0, 5).map((o, i) => (
                                <li key={`${o.code}-${i}`}>
                                    <span className="font-mono">{o.code}</span> — {o.labels.length === 1 ? `"${o.labels[0]}" maps both the group and this code` : `"${o.labels[0]}" and "${o.labels[1]}"`}
                                </li>
                            ))}
                            {mappingOverlaps.length > 5 && <li>…and {mappingOverlaps.length - 5} more</li>}
                        </ul>
                    </div>
                </div>
            )}

            {/* Budget Grid */}
            <div className="card p-0 overflow-hidden">
                {yardiLoading && viewMode !== 'budget' && (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--bg-elevated)] border-b border-[var(--border)]" role="status">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading Yardi actuals — closed months and forecast totals will update when they arrive.
                    </div>
                )}
                <div className={`overflow-x-auto custom-scrollbar pb-32 transition-opacity ${yardiLoading && viewMode !== 'budget' ? 'opacity-60' : ''}`} aria-busy={yardiLoading || undefined}>
                    <table className="border-collapse relative" style={{ minWidth: `${340 + (expandLTD ? monthKeys.length : forwardMonths.length + 1) * 75 + 90}px` }}>
                        <thead>
                            {showSchedule && (
                                <PredevScheduleRows 
                                    scheduleItems={scheduleItems}
                                    monthKeys={monthKeys}
                                    visibleMonths={visibleMonths}
                                    closedMonths={closedMonths}
                                    forwardMonths={forwardMonths}
                                    expandLTD={expandLTD}
                                    onUpsert={(id, up) => upsertScheduleItem.mutate({ itemId: id, budgetId: budget.id, pursuitId, updates: up }, toastOnError('Failed to save schedule item'))}
                                    onDelete={(id) => deleteScheduleItem.mutate({ itemId: id, pursuitId }, toastOnError('Failed to delete schedule item'))}
                                    onSeed={() => seedScheduleItems.mutate({ budgetId: budget.id, pursuitId }, toastOnError('Failed to generate the default schedule'))}
                                    onAddBlank={() => upsertScheduleItem.mutate({ itemId: null, budgetId: budget.id, pursuitId, updates: { section: 'Summary', label: 'New Milestone', duration_weeks: 4 } }, toastOnError('Failed to add schedule item'))}
                                    pursuitId={pursuitId}
                                />
                            )}
                            <tr className="bg-[var(--bg-primary)]">
                                <th className="sticky left-0 z-20 bg-[var(--bg-primary)] text-left px-3 py-2 text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-r border-[var(--border)] shadow-[1px_0_0_0_var(--border)]" style={{ minWidth: 340 }}>
                                    Line Item
                                </th>
                                {/* LTD Column (collapsed) */}
                                {!expandLTD && (
                                    <th
                                        className="text-center px-1 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b border-[var(--border)] bg-[var(--success-bg)]/50 text-[var(--success)] cursor-pointer hover:bg-[var(--success-bg)] transition-colors"
                                        style={{ minWidth: 70 }}
                                        onClick={() => setExpandLTD(true)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandLTD(true); } }}
                                        tabIndex={0}
                                        aria-expanded={false}
                                        title="Show each closed month"
                                    >
                                        <div className="flex flex-col items-center gap-0.5">
                                            <div className="flex items-center gap-1">
                                                <ChevronDown className="w-3 h-3" />
                                                <span>LTD Actuals</span>
                                            </div>
                                            <span className="text-[11px] font-normal opacity-60">{closedMonths.length} month{closedMonths.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </th>
                                )}
                                {/* Expanded closed months */}
                                {expandLTD && closedMonths.map((mk, i) => (
                                    <th key={mk}
                                        className="text-center px-1 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b border-[var(--border)] bg-[var(--success-bg)]/50 text-[var(--success)]"
                                        style={{ minWidth: 75 }}>
                                        <div className="flex flex-col items-center gap-0.5">
                                            {i === 0 ? (
                                                <button onClick={() => setExpandLTD(false)} aria-expanded={true} title="Collapse closed months into LTD" className="flex items-center gap-1 hover:opacity-70">
                                                    <ChevronUp className="w-3 h-3" />
                                                    <span>{shortMonthLabel(mk)}</span>
                                                </button>
                                            ) : (
                                                <span>{shortMonthLabel(mk)}</span>
                                            )}
                                            <span className="text-[11px] font-normal opacity-60">{mk.split('-')[0]}</span>
                                            <Database className="w-2.5 h-2.5 opacity-50" />
                                        </div>
                                    </th>
                                ))}
                                {/* Today line separator */}
                                {closedMonths.length > 0 && expandLTD && (
                                    <th className="border-b border-[var(--border)] px-0 py-0" style={{ width: 3, minWidth: 3 }}>
                                        <div className="h-full w-[3px] bg-[var(--accent)] mx-auto" style={{ minHeight: 40 }} />
                                    </th>
                                )}
                                {/* Forward months */}
                                {forwardMonths.map((mk) => {
                                    const pending = viewMode !== 'budget' && isMonthPendingClose(mk, today, currentMonth);
                                    const isCurrent = viewMode !== 'budget' && mk === currentMonth;
                                    return (
                                        <th key={mk}
                                            className={`text-center px-1 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b border-[var(--border)] ${pending ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : isCurrent ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                                            style={{ minWidth: 75 }}>
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span>{shortMonthLabel(mk)}</span>
                                                <span className="text-[11px] font-normal opacity-60">{mk.split('-')[0]}</span>
                                                {pending && <AlertCircle className="w-2.5 h-2.5 opacity-50" />}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className="sticky right-0 z-20 bg-[var(--bg-primary)] text-right px-2 py-1.5 text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-l border-[var(--border)]" style={{ minWidth: 90 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((li, idx) => {
                                const rt = rowTotal(li);
                                const ltdSum = gridTotals.ltd.get(li.id) ?? 0;
                                return (
                                <tr key={li.id} className={`group/row ${idx % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'} hover:bg-[var(--bg-elevated)] transition-colors h-[32px]`}>
                                        <td className="sticky left-0 z-10 bg-inherit px-3 py-0 border-r border-[var(--table-row-border)] shadow-[1px_0_0_0_var(--border)]">
                                            <div className="flex items-center gap-1.5 h-[32px]">
                                                <span className="text-xs text-[var(--text-primary)] font-medium truncate flex-1" title={li.label}>{li.label}</span>
                                                {li.yardi_cost_groups?.length > 0 && (
                                                    <button
                                                        onClick={() => setMappingLineItem(li)}
                                                        className="flex items-center gap-1 text-[11px] text-[var(--text-faint)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-colors"
                                                        title={`Mapped codes:\n${li.yardi_cost_groups.join('\n')}\n\nClick to edit`}
                                                        aria-label={`Edit Yardi mapping for ${li.label} (${li.yardi_cost_groups.length} codes)`}
                                                    >
                                                        <Database className="w-2.5 h-2.5 opacity-70" />
                                                        <span className="font-mono">{li.yardi_cost_groups.length}</span>
                                                    </button>
                                                )}
                                                {(!li.yardi_cost_groups || li.yardi_cost_groups.length === 0) && (
                                                    <button
                                                        onClick={() => setMappingLineItem(li)}
                                                        className="text-[11px] text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                                                        title="Map Yardi cost groups"
                                                        aria-label={`Map Yardi cost groups for ${li.label}`}
                                                    >
                                                        <Database className="w-3 h-3 opacity-50" />
                                                    </button>
                                                )}
                                                <button onClick={() => { if (window.confirm(`Remove line item "${li.label}" and all of its monthly values?`)) deleteLineItemMut.mutate({ id: li.id, pursuitId }, toastOnError(`Failed to remove "${li.label}"`)); }}
                                                    className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-[var(--text-faint)] hover:text-[var(--danger)] p-0.5 rounded transition-all ml-auto" title="Remove line item" aria-label={`Remove line item ${li.label}`}>
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </td>
                                        {/* LTD cell (collapsed) */}
                                        {!expandLTD && (
                                            <td className={`border-[var(--table-row-border)] bg-[var(--success-bg)]/20 text-right px-1 py-0 transition-colors group/ltd outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${li.yardi_cost_groups?.length ? 'cursor-pointer hover:bg-[var(--success-bg)]/40' : ''}`}
                                                onClick={() => {
                                                    if (li.yardi_cost_groups && li.yardi_cost_groups.length > 0) {
                                                        const groupString = li.yardi_cost_groups.join(',');
                                                        openCostsFor(groupString);
                                                    }
                                                }}
                                                tabIndex={li.yardi_cost_groups?.length ? 0 : undefined}
                                                onKeyDown={(e) => { if (e.key === 'Enter' && li.yardi_cost_groups?.length) openCostsFor(li.yardi_cost_groups.join(',')); }}
                                                title={li.yardi_cost_groups?.length ? `Click to drill down into actual Job Cost transactions for ${li.label}\nFiltered by: ${li.yardi_cost_groups.join(', ')}` : 'Map Yardi cost codes to this line item to drill into its transactions'}
                                            >
                                                <span className={`text-xs font-semibold font-mono tabular-nums group-hover/ltd:text-[var(--accent)] transition-colors ${ltdSum === 0 ? 'text-[var(--border-strong)]' : 'text-[var(--success)]'}`}>
                                                    {ltdSum === 0 ? '—' : formatCurrency(ltdSum, 0)}
                                                </span>
                                            </td>
                                        )}
                                        {/* Expanded closed month cells */}
                                        {expandLTD && closedMonths.map((mk) => {
                                            const info = getCellInfo(li, mk);
                                            const cell = li.monthly_values[mk];
                                            return (
                                                <td key={mk} className="border-[var(--table-row-border)] relative bg-[var(--success-bg)]/20 p-0">
                                                    <EditableCell value={info.value} cellStyle={info.style} disabled={!info.editable} tooltip={info.tooltip} forceEditing={isEditAll && info.editable}
                                                        onChange={(val) => handleCellChange(li, mk, val)} />
                                                    {viewMode === 'forecast' && info.source === 'yardi' && (
                                                        <button onClick={() => handleTogglePin(li, mk)} className="absolute top-0 right-0 p-0.5 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-[var(--text-faint)] hover:text-[var(--accent)] transition-opacity" title="Override with manual value" aria-label={`Override ${li.label} ${formatMonthLabel(mk)} with a manual value`}>
                                                            <Pin className="w-2.5 h-2.5" />
                                                        </button>
                                                    )}
                                                    {viewMode === 'forecast' && cell?.manual_override && (
                                                        <button onClick={() => handleTogglePin(li, mk)} className="absolute top-0 right-0 p-0.5 text-[var(--accent)] hover:text-[var(--danger)] transition-opacity" title="Unpin — revert to Yardi actual" aria-label={`Revert ${li.label} ${formatMonthLabel(mk)} to the Yardi actual`}>
                                                            <PinOff className="w-2.5 h-2.5" />
                                                        </button>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        {/* Today line separator */}
                                        {closedMonths.length > 0 && expandLTD && (
                                            <td className="px-0 py-0 border-[var(--table-row-border)]" style={{ width: 3 }}>
                                                <div className="w-[3px] h-full bg-[var(--accent)]" />
                                            </td>
                                        )}
                                        {/* Forward month cells */}
                                        {forwardMonths.map((mk) => {
                                            const info = getCellInfo(li, mk);
                                            return (
                                                <td key={mk} className="border-[var(--table-row-border)] relative p-0">
                                                    <EditableCell value={info.value} cellStyle={info.style} disabled={!info.editable} tooltip={info.tooltip} forceEditing={isEditAll && info.editable}
                                                        onChange={(val) => handleCellChange(li, mk, val)} />
                                                </td>
                                            );
                                        })}
                                        <td className="sticky right-0 z-10 bg-inherit px-2 py-0 border-l border-[var(--table-row-border)] text-right">
                                            <span className={`text-xs font-mono font-semibold tabular-nums ${rt === 0 ? 'text-[var(--border-strong)]' : 'text-[var(--text-primary)]'}`}>
                                                {rt === 0 ? '—' : formatCurrency(rt, 0)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {/* Unallocated Yardi Costs */}
                            {viewMode !== 'budget' && hasUnallocated && (
                                <tr className="group/row bg-[var(--warning-bg)] hover:bg-[var(--bg-elevated)] transition-colors">
                                    <td className="sticky left-0 z-10 bg-inherit px-2 py-1 border-r border-[var(--table-row-border)]">
                                        <div className="flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
                                            <button 
                                                className="text-xs font-semibold text-[var(--warning)] hover:underline text-left"
                                                onClick={() => setShowUnallocatedMapping(true)}
                                                title={`Unallocated codes:\n${unallocatedItems.map(i => `${i.code} (${i.name}) - ${formatCurrency(i.total, 0)}`).join('\n')}\n\nClick to map`}
                                            >
                                                Unallocated Yardi Actuals
                                            </button>
                                        </div>
                                    </td>
                                    {/* LTD cell (collapsed) */}
                                    {!expandLTD && (
                                        <td className="border-[var(--table-row-border)] text-right px-1 py-1 bg-[var(--success-bg)]/5 hover:bg-[var(--success-bg)]/20 transition-colors cursor-pointer group/ltd-unalloc"
                                            onClick={() => {
                                                const codes = unallocatedItems.map(i => i.code).join(',');
                                                if (codes) openCostsFor(codes);
                                            }}
                                            title={`Click to drill down into unallocated actual Job Cost transactions`}
                                        >
                                            <span className="text-xs font-mono font-semibold text-[var(--warning)] tabular-nums group-hover/ltd-unalloc:underline">
                                                {formatCurrency(closedMonths.reduce((sum, mk) => sum + (unallocatedByMonth.get(mk) ?? 0), 0), 0)}
                                            </span>
                                        </td>
                                    )}
                                    {/* Expanded closed month cells */}
                                    {expandLTD && closedMonths.map((mk) => {
                                        const val = unallocatedByMonth.get(mk) ?? 0;
                                        return (
                                            <td key={mk} className="border-[var(--table-row-border)] text-right px-1 py-1 bg-[var(--success-bg)]/5">
                                                <span className={`text-xs font-mono tabular-nums ${val === 0 ? 'text-[var(--border-strong)]' : 'text-[var(--warning)] font-semibold'}`}>
                                                    {val === 0 ? '—' : formatCurrency(val, 0)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                    {/* Today line separator */}
                                    {closedMonths.length > 0 && expandLTD && (
                                        <td className="px-0 py-0 border-[var(--table-row-border)]" style={{ width: 3 }}>
                                            <div className="w-[3px] h-full bg-[var(--accent)]" />
                                        </td>
                                    )}
                                    {/* Forward month cells */}
                                    {forwardMonths.map((mk) => {
                                        const val = unallocatedByMonth.get(mk) ?? 0;
                                        return (
                                            <td key={mk} className="border-[var(--table-row-border)] text-right px-1 py-1">
                                                <span className={`text-xs font-mono tabular-nums ${val === 0 ? 'text-[var(--border-strong)]' : 'text-[var(--warning)] font-semibold'}`}>
                                                    {val === 0 ? '—' : formatCurrency(val, 0)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                    <td className="sticky right-0 z-10 bg-inherit px-2 py-1 border-l border-[var(--table-row-border)] text-right">
                                        <span className="text-xs font-mono font-bold text-[var(--warning)] tabular-nums">
                                            {formatCurrency(unallocatedTotal, 0)}
                                        </span>
                                    </td>
                                </tr>
                            )}
                            {/* Total row */}
                            <tr className="bg-[var(--text-primary)]">
                                <td className="sticky left-0 z-10 bg-[var(--text-primary)] px-2 py-1.5 border-r border-[var(--border-strong)] text-xs font-bold text-[var(--bg-card)] uppercase tracking-wider">Total</td>
                                {/* LTD total (collapsed) */}
                                {!expandLTD && (
                                    <td className="px-1 py-1 text-right bg-[var(--success)]/10">
                                        <span className="text-xs font-mono font-bold text-[var(--success-bg)] tabular-nums">
                                            {formatCurrency(gridTotals.ltdGrand, 0)}
                                        </span>
                                    </td>
                                )}
                                {/* Expanded closed month totals */}
                                {expandLTD && closedMonths.map((mk) => {
                                    const ct = colTotal(mk);
                                    return (
                                        <td key={mk} className="px-1 py-1 text-right bg-[var(--success)]/10">
                                            <span className={`text-xs font-mono font-bold tabular-nums ${ct === 0 ? 'text-[var(--text-faint)]' : 'text-[var(--success-bg)]'}`}>
                                                {ct === 0 ? '—' : formatCurrency(ct, 0)}
                                            </span>
                                        </td>
                                    );
                                })}
                                {/* Today line separator */}
                                {closedMonths.length > 0 && expandLTD && (
                                    <td className="px-0 py-0" style={{ width: 3 }}><div className="w-[3px] h-full bg-[var(--accent)]" /></td>
                                )}
                                {/* Forward month totals */}
                                {forwardMonths.map((mk) => {
                                    const ct = colTotal(mk);
                                    return (
                                        <td key={mk} className="px-1 py-1 text-right">
                                            <span className={`text-xs font-mono font-bold tabular-nums ${ct === 0 ? 'text-[var(--text-faint)]' : 'text-[var(--bg-card)]'}`}>
                                                {ct === 0 ? '—' : formatCurrency(ct, 0)}
                                            </span>
                                        </td>
                                    );
                                })}
                                <td className="sticky right-0 z-10 bg-[var(--text-primary)] px-2 py-1.5 border-l border-[var(--border-strong)] text-right">
                                    <span className="text-xs font-mono font-bold text-[var(--bg-card)] tabular-nums">{grandTotal === 0 ? '—' : formatCurrency(grandTotal, 0)}</span>
                                </td>
                            </tr>
                            {/* ── Funding Partner Rows ─────────────── */}
                            {fundingPartners && fundingPartners.length > 0 && (
                                <>
                                    <tr>
                                        <td colSpan={999} className="px-4 py-1.5 bg-[var(--bg-elevated)] border-t-2 border-[var(--border)]">
                                            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Funding Splits</span>
                                        </td>
                                    </tr>
                                    {fundingPartners.map((partner) => {
                                        // Get the split for a specific month: check monthly overrides first, then fallback to default
                                        const getSplit = (mk: string): number =>
                                            splitLookup.get(`${partner.id}|${mk}`) ?? partner.default_split_pct;

                                        const partnerLtdTotal = closedMonths.reduce((sum, mk) => sum + colTotal(mk) * getSplit(mk) / 100, 0);
                                        const partnerGrandTotal = monthKeys.reduce((sum, mk) => sum + colTotal(mk) * getSplit(mk) / 100, 0);

                                        return (
                                            <tr key={partner.id} className="bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]/50 transition-colors group/frow">
                                                <td className="sticky left-0 z-10 bg-inherit px-4 py-1.5 border-r border-[var(--table-row-border)]">
                                                    <div className="flex items-center gap-1.5">
                                                        {partner.is_slrh && <Shield className="w-3 h-3 text-[var(--accent)] shrink-0" />}
                                                        <span className={`text-xs font-medium truncate ${partner.is_slrh ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                                                            {partner.name}
                                                        </span>
                                                        <span className="text-[11px] text-[var(--text-faint)] ml-auto font-mono">
                                                            {partner.default_split_pct}%
                                                        </span>
                                                    </div>
                                                </td>
                                                {/* LTD cell (collapsed) */}
                                                {!expandLTD && (
                                                    <td className="border-[var(--table-row-border)] bg-[var(--success-bg)]/10 text-right px-2 py-1.5">
                                                        <span className={`text-xs font-mono tabular-nums ${partnerLtdTotal === 0 ? 'text-[var(--border-strong)]' : partner.is_slrh ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                                                            {partnerLtdTotal === 0 ? '—' : formatCurrency(partnerLtdTotal, 0)}
                                                        </span>
                                                    </td>
                                                )}
                                                {/* Expanded closed month cells */}
                                                {expandLTD && closedMonths.map((mk) => {
                                                    const split = getSplit(mk);
                                                    const amount = colTotal(mk) * split / 100;
                                                    return (
                                                        <td key={mk} className="border-[var(--table-row-border)] bg-[var(--success-bg)]/10 px-1 py-1">
                                                            <FundingSplitCell
                                                                amount={amount}
                                                                splitPct={split}
                                                                isSlrh={partner.is_slrh}
                                                                onChangeSplit={(pct) => upsertSplit.mutate({
                                                                    split: { budget_id: budget.id, partner_id: partner.id, month_key: mk, split_pct: pct },
                                                                    budgetId: budget.id,
                                                                }, toastOnError(`Failed to save ${partner.name}'s split for ${formatMonthLabel(mk)}`))}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                                {/* Today line separator */}
                                                {closedMonths.length > 0 && expandLTD && (
                                                    <td className="px-0 py-0 border-[var(--table-row-border)]" style={{ width: 3 }}>
                                                        <div className="w-[3px] h-full bg-[var(--accent)]" />
                                                    </td>
                                                )}
                                                {/* Forward month cells */}
                                                {forwardMonths.map((mk) => {
                                                    const split = getSplit(mk);
                                                    const amount = colTotal(mk) * split / 100;
                                                    return (
                                                        <td key={mk} className="border-[var(--table-row-border)] px-1 py-1">
                                                            <FundingSplitCell
                                                                amount={amount}
                                                                splitPct={split}
                                                                isSlrh={partner.is_slrh}
                                                                onChangeSplit={(pct) => upsertSplit.mutate({
                                                                    split: { budget_id: budget.id, partner_id: partner.id, month_key: mk, split_pct: pct },
                                                                    budgetId: budget.id,
                                                                }, toastOnError(`Failed to save ${partner.name}'s split for ${formatMonthLabel(mk)}`))}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                                <td className="sticky right-0 z-10 bg-inherit px-3 py-1.5 border-l border-[var(--table-row-border)] text-right">
                                                    <span className={`text-xs font-mono font-semibold tabular-nums ${partnerGrandTotal === 0 ? 'text-[var(--border-strong)]' : partner.is_slrh ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                                                        {partnerGrandTotal === 0 ? '—' : formatCurrency(partnerGrandTotal, 0)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Custom Line Item */}
            <div className="flex items-center gap-2">
                {showAddLine ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <input type="text" value={newLineLabel} onChange={(e) => setNewLineLabel(e.target.value)} placeholder="Custom line item name..." autoFocus aria-label="Custom line item name"
                            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none w-64 max-w-full"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddLineItem(); if (e.key === 'Escape') { setShowAddLine(false); setNewLineLabel(''); } }} />
                        <button onClick={handleAddLineItem}
                            disabled={!newLineLabel.trim() || addLineItem.isPending} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-medium transition-colors">Add</button>
                        <button onClick={() => { setShowAddLine(false); setNewLineLabel(''); }} className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]">Cancel</button>
                    </div>
                ) : (
                    <button onClick={() => setShowAddLine(true)} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Add Custom Line Item
                    </button>
                )}
            </div>

            {/* Amend Budget Dialog */}
            {showAmendDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in mx-4">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Amend Original Budget</h2>
                        <p className="text-xs text-[var(--text-muted)] mb-4">The current projected values will replace the original budget snapshot. The previous snapshot is preserved in the revision history.</p>
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Reason (optional)</label>
                            <input type="text" value={amendReason} onChange={(e) => setAmendReason(e.target.value)} placeholder="e.g., Scope change — added landscape design"
                                onKeyDown={(e) => { if (e.key === 'Enter' && !amendBudgetMut.isPending) handleAmend(); if (e.key === 'Escape') { setShowAmendDialog(false); setAmendReason(''); } }}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" autoFocus />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => { setShowAmendDialog(false); setAmendReason(''); }} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">Cancel</button>
                            <button onClick={handleAmend} disabled={amendBudgetMut.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium transition-colors">
                                {amendBudgetMut.isPending ? 'Saving...' : 'Amend Budget'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Push Budget Dialog */}
            {showPushConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm px-4">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in text-center">
                        <div className="w-12 h-12 rounded-full bg-[var(--danger-bg)] flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-6 h-6 text-[var(--danger)]" />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Push Budget to Forecast?</h2>
                        <p className="text-sm text-[var(--text-secondary)] mb-6">
                            This will completely overwrite your working forecast for all future and pending months using the original budget allocations. 
                            <br /><br />
                            <strong className="text-[var(--text-primary)]">Any manual forecasting overrides will be lost.</strong>
                        </p>
                        <div className="flex justify-center gap-3 w-full">
                            <button onClick={() => setShowPushConfirm(false)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                                Cancel
                            </button>
                            <button onClick={confirmPushBudgetToForecast} className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--danger)] hover:opacity-90 text-white text-sm font-bold shadow-sm transition-colors">
                                Overwrite
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-faint)]" title={OPEN_MONTH_NOTE}>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--success)]" /> Yardi Actual</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--accent)]" /> Manual Override</span>
                <span className="flex items-center gap-1"><Database className="w-2.5 h-2.5" /> Closed Month (15-day lag)</span>
                <span className="flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> Pending Close</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--warning)]" /> Yardi posted, month not yet closed</span>
            </div>

            {/* Cost Code Mapping Dialog */}
            {mappingLineItem && (
                <CostCodeMappingDialog
                    lineItem={mappingLineItem}
                    otherLineItems={lineItems.filter((li) => li.id !== mappingLineItem.id)}
                    pursuitId={pursuitId}
                    onClose={() => setMappingLineItem(null)}
                />
            )}

            {/* Unallocated Mapping Dialog */}
            {showUnallocatedMapping && budget && (
                <UnallocatedMappingDialog
                    budgetId={budget.id}
                    pursuitId={pursuitId}
                    unallocatedItems={unallocatedItems}
                    lineItems={lineItems}
                    onClose={() => setShowUnallocatedMapping(false)}
                />
            )}
        </div>
    );
}
