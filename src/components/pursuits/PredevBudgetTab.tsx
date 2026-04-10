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
import { fetchMonthlyJobCostAggregates } from '@/app/actions/accounting';
import { fetchPursuitAccountingEntity } from '@/lib/supabase/queries';
import { fetchJobsForProperty } from '@/app/actions/accounting';
import { useRouter } from 'next/navigation';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import type { PredevBudget, PredevBudgetLineItem, MonthlyCell, PursuitFundingPartner, PredevScheduleItem } from '@/types';
import type { YardiMonthlyCostAggregate } from '@/app/actions/accounting';
import { CostCodeMappingDialog } from '@/components/pursuits/CostCodeMappingDialog';
import { UnallocatedMappingDialog } from '@/components/pursuits/UnallocatedMappingDialog';
import {
    Plus, Loader2, DollarSign, Trash2, Settings, ChevronDown, ChevronUp,
    CalendarDays, StickyNote, TrendingUp, Camera, Pencil, Pin, PinOff,
    Database, AlertCircle, History, Users, Shield, BarChart3, FileDown, RefreshCw, Clock,
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';

interface PredevBudgetTabProps {
    pursuitId: string;
}

// ── View Modes ──────────────────────────────────────────────
type ViewMode = 'budget' | 'forecast' | 'variance';

// ── Helpers ─────────────────────────────────────────────────

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

/**
 * Is a month "closed" (actuals should replace forecast)?
 * Closed = month-end was ≥15 days ago
 */
function isMonthClosed(monthKey: string, today: Date): boolean {
    const [y, m] = monthKey.split('-').map(Number);
    // Last day of the month
    const monthEnd = new Date(y, m, 0); // day 0 of next month = last day of this month
    const daysSinceMonthEnd = Math.floor((today.getTime() - monthEnd.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceMonthEnd >= 15;
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
    cellStyle: 'normal' | 'actual-yardi' | 'actual-yardi-pending' | 'actual-manual' | 'budget-snapshot' | 'variance-positive' | 'variance-negative';
    disabled?: boolean;
    tooltip?: string;
    forceEditing?: boolean;
    onChange: (val: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [localVal, setLocalVal] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const isEditing = editing || forceEditing;

    const handleStartEdit = useCallback(() => {
        if (disabled) return;
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
        const parsed = parseFloat(localVal.replace(/,/g, '')) || 0;
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
                    if (e.key === 'Enter') handleBlur();
                    if (e.key === 'Escape' && !forceEditing) setEditing(false);
                }}
                className={`w-full h-full px-1 py-1 text-right text-xs font-mono bg-transparent outline-none border focus:border-[var(--accent)] rounded ${forceEditing ? 'border-[var(--table-row-border)] bg-[var(--bg-card)] shadow-inner' : 'border-2 border-[var(--accent)]'}`}
            />
        );
    }

    const styleClasses = {
        'normal': 'text-[var(--text-primary)]',
        'actual-yardi': 'text-[var(--success)] font-semibold',
        'actual-yardi-pending': 'text-yellow-600 dark:text-yellow-500 font-semibold',
        'actual-manual': 'text-[var(--accent)] font-semibold',
        'budget-snapshot': 'text-[var(--text-secondary)]',
        'variance-positive': 'text-[var(--success)] font-semibold',
        'variance-negative': 'text-[var(--danger)] font-semibold',
    };

    return (
        <div
            title={tooltip}
            onClick={handleStartEdit}
            className={`px-2 py-1.5 text-right text-xs font-mono tabular-nums transition-colors rounded ${disabled ? 'cursor-default' : 'cursor-text hover:bg-[var(--bg-elevated)]'
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
            <span className={`text-[10px] font-mono tabular-nums ${amount === 0 ? 'text-[var(--border-strong)]' : isSlrh ? 'text-blue-500' : 'text-[var(--text-secondary)]'}`}>
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
                        if (e.key === 'Enter') handleBlur();
                        if (e.key === 'Escape') setEditing(false);
                    }}
                    className="w-14 text-right text-[9px] font-mono bg-transparent outline-none border border-[var(--accent)] rounded px-1 py-0"
                />
            ) : (
                <button
                    onClick={() => { setLocalPct(String(splitPct)); setEditing(true); }}
                    className="text-[9px] font-mono text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors tabular-nums"
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
                    <div className="px-2 py-1.5 text-xs font-bold text-[var(--text-primary)] uppercase flex items-center justify-between">
                        <span className="tracking-widest">Pre-Development Schedule</span>
                        <div className="flex gap-2">
                            {scheduleItems.length === 0 && (
                                <button onClick={onSeed} className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline flex-shrink-0">
                                    Generate Default Schedule
                                </button>
                            )}
                            <button onClick={onAddBlank} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
                                <Plus className="w-3 h-3" /> Add Item
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
            {scheduleItems.length === 0 && (
                <tr className="bg-[var(--bg-card)] h-12">
                     <td colSpan={totalCols} className="px-4 py-8 text-xs text-[var(--text-muted)] text-center border-b-[3px] border-[var(--border-strong)]">
                         <div className="flex flex-col items-center justify-center text-[var(--text-faint)]">
                            <CalendarDays className="w-6 h-6 mb-2 opacity-50" />
                            No schedule items defined. Use the buttons above to add entries.
                        </div>
                    </td>
                </tr>
            )}
            {Object.entries(grouped).map(([section, items]: [string, PredevScheduleItem[]], idx, arr) => (
                <Fragment key={section}>
                    <tr className="bg-[var(--bg-primary)]">
                        <td colSpan={totalCols} className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-elevated)] border-b border-[var(--table-row-border)]">
                            {section}
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
                                        <div className="flex-1 px-3 py-1 truncate text-xs font-medium text-[var(--text-primary)] border-r border-[var(--border)]">{item.label}</div>
                                        <div className="w-[120px] px-1 border-r border-[var(--border)] relative h-full flex items-center">
                                            <input type="date" className="w-full text-xs bg-transparent outline-none" value={item.start_date || ''} onChange={(e) => onUpsert(item.id, { start_date: e.target.value })} />
                                        </div>
                                        <div className="w-[70px] p-1 flex items-center justify-center relative h-full">
                                            <input type="number" className="w-10 text-xs text-right bg-transparent outline-none appearance-none pr-1" value={item.duration_weeks || 0} onChange={(e) => onUpsert(item.id, { duration_weeks: parseInt(e.target.value) || 0 })} />
                                            <span className="text-[10px] text-[var(--text-faint)]">wks</span>
                                        </div>
                                    </div>
                                    <button onClick={() => onDelete(item.id)} className="absolute right-0 top-0 bottom-0 px-2 opacity-0 group-hover/row:opacity-100 text-[var(--danger)] bg-[var(--bg-elevated)] backdrop-blur-sm transition-opacity flex items-center justify-center border-l border-[var(--border)] z-10">
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
                                            className="absolute top-1.5 bottom-1.5 bg-orange-200 dark:bg-orange-600/50 rounded shadow-sm border border-orange-400 dark:border-orange-500 z-10 flex items-center overflow-hidden px-1.5 pointer-events-none"
                                            style={{ left: barLeft, width: barWidth }}
                                        >
                                           <span className="text-[9px] font-semibold text-orange-900 dark:text-orange-100 truncate w-full">{item.label}</span>
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
    const { data: amendments } = useBudgetAmendments(budget?.id ?? '');
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
    const [showAmendments, setShowAmendments] = useState(false);
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
    const pendingUpdatesRef = useRef<Record<string, Record<string, MonthlyCell>>>({});
    // Creation dialog
    const [newStartDate, setNewStartDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [newDuration, setNewDuration] = useState(12);

    // Yardi actuals
    const [yardiAggregates, setYardiAggregates] = useState<YardiMonthlyCostAggregate[]>([]);
    const [yardiLoading, setYardiLoading] = useState(false);

    // Fetch Yardi data on mount
    useEffect(() => {
        let cancelled = false;
        async function loadYardi() {
            try {
                setYardiLoading(true);
                const entity = await fetchPursuitAccountingEntity(pursuitId);
                if (!entity?.property_code || cancelled) { setYardiLoading(false); return; }
                const jobIds = await fetchJobsForProperty(entity.property_code);
                if (!jobIds.length || cancelled) { setYardiLoading(false); return; }
                const data = await fetchMonthlyJobCostAggregates(jobIds.map(String));
                if (!cancelled) setYardiAggregates(data);
            } catch (e) {
                console.error('Failed to load Yardi data for budget:', e);
            } finally {
                if (!cancelled) setYardiLoading(false);
            }
        }
        if (budget) loadYardi();
        return () => { cancelled = true; };
    }, [pursuitId, budget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived data ────────────────────────────────────────
    const today = useMemo(() => new Date(), []);
    const currentMonth = getCurrentMonthKey();

    // Budget-configured month range
    const budgetMonthKeys = useMemo(
        () => budget ? getMonthKeys(budget.start_date, budget.duration_months) : [],
        [budget]
    );

    // Extend month range to include any Yardi actuals that predate the budget start, AND schedule items
    const monthKeys = useMemo(() => {
        const allMonths = new Set(budgetMonthKeys);
        
        // Add any months from Yardi data
        for (const agg of yardiAggregates) {
            allMonths.add(agg.month);
        }
        
        // Add any months from Schedule items
        const currentScheduleItems = budget?.schedule_items ?? [];
        for (const item of currentScheduleItems) {
            if (item.start_date) {
                const startMk = item.start_date.substring(0, 7); // yyyy-mm
                allMonths.add(startMk);
                
                if (item.duration_weeks > 0) {
                    const monthsToAdd = Math.ceil(item.duration_weeks / 4.33); 
                    const extendedKeys = getMonthKeys(startMk + '-01', Math.max(1, monthsToAdd));
                    extendedKeys.forEach(mk => allMonths.add(mk));
                }
            }
        }
        
        return Array.from(allMonths).sort();
    }, [budgetMonthKeys, yardiAggregates, budget?.schedule_items]);
    
    const lineItems = budget?.line_items ?? [];
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

    // Build Yardi lookup: key → month → amount
    // Keys are BOTH 2-digit group codes (aggregate all under that group)
    // AND individual category_codes (for detail-level mapping)
    const yardiByCodeMonth = useMemo(() => {
        const map = new Map<string, Map<string, number>>();
        for (const agg of yardiAggregates) {
            // Index by exact category_code (works for both 2-digit and detail codes)
            if (!map.has(agg.category_code)) map.set(agg.category_code, new Map());
            const codeMap = map.get(agg.category_code)!;
            codeMap.set(agg.month, (codeMap.get(agg.month) ?? 0) + agg.total_amount);

            // Also roll up detail codes into their 2-digit parent group
            if (agg.category_code.length > 2) {
                const groupKey = agg.category_code.substring(0, 2);
                const groupTag = `__group_${groupKey}`; // synthetic key for group-level rollup
                if (!map.has(groupTag)) map.set(groupTag, new Map());
                const groupMap = map.get(groupTag)!;
                groupMap.set(agg.month, (groupMap.get(agg.month) ?? 0) + agg.total_amount);
            }
        }
        return map;
    }, [yardiAggregates]);

    /** Get Yardi actual for a line item + month */
    const getYardiActual = useCallback((li: PredevBudgetLineItem, monthKey: string): number | null => {
        if (!li.yardi_cost_groups?.length) return null;
        let total = 0;
        let hasData = false;
        for (const code of li.yardi_cost_groups) {
            if (code.length <= 2) {
                // 2-digit group: use the rolled-up group aggregate
                const groupMap = yardiByCodeMonth.get(`__group_${code}`) ?? yardiByCodeMonth.get(code);
                if (groupMap?.has(monthKey)) {
                    total += groupMap.get(monthKey)!;
                    hasData = true;
                }
            } else {
                // Specific detail code (e.g., '62-00400')
                const codeMap = yardiByCodeMonth.get(code);
                if (codeMap?.has(monthKey)) {
                    total += codeMap.get(monthKey)!;
                    hasData = true;
                }
            }
        }
        return hasData ? total : null;
    }, [yardiByCodeMonth]);

    // ── Unallocated Yardi costs ─────────────────────────────
    // Find any Yardi detail codes with activity that aren't covered by any line item
    const unallocatedByMonth = useMemo(() => {
        if (!yardiAggregates.length || !lineItems.length) return new Map<string, number>();

        // Build the set of all codes covered by line item mappings
        const coveredCodes = new Set<string>();
        const coveredGroups = new Set<string>(); // 2-digit groups that are fully captured
        for (const li of lineItems) {
            for (const code of (li.yardi_cost_groups ?? [])) {
                if (code.length <= 2) {
                    coveredGroups.add(code);
                } else {
                    coveredCodes.add(code);
                }
            }
        }

        // Check each Yardi aggregate — is it covered?
        const unallocated = new Map<string, number>();
        for (const agg of yardiAggregates) {

            const prefix = agg.category_code.substring(0, 2);
            // Covered if the parent group is mapped, or the specific code is mapped
            if (coveredGroups.has(prefix) || coveredCodes.has(agg.category_code)) continue;

            // This code is unallocated
            unallocated.set(agg.month, (unallocated.get(agg.month) ?? 0) + agg.total_amount);
        }
        return unallocated;
    }, [yardiAggregates, lineItems]);

    const hasUnallocated = unallocatedByMonth.size > 0;
    const unallocatedTotal = useMemo(
        () => Array.from(unallocatedByMonth.values()).reduce((a, b) => a + b, 0),
        [unallocatedByMonth]
    );

    // Collect the unallocated code details
    const unallocatedItems = useMemo(() => {
        if (!yardiAggregates.length || !lineItems.length) return [];
        const coveredCodes = new Set<string>();
        const coveredGroups = new Set<string>();
        for (const li of lineItems) {
            for (const code of (li.yardi_cost_groups ?? [])) {
                if (code.length <= 2) coveredGroups.add(code);
                else coveredCodes.add(code);
            }
        }
        const itemMap = new Map<string, { code: string; name: string; total: number }>();
        for (const agg of yardiAggregates) {
            const prefix = agg.category_code.substring(0, 2);
            if (coveredGroups.has(prefix) || coveredCodes.has(agg.category_code)) continue;
            
            const existing = itemMap.get(agg.category_code);
            if (existing) {
                existing.total += agg.total_amount;
            } else {
                itemMap.set(agg.category_code, {
                    code: agg.category_code,
                    name: agg.category_name,
                    total: agg.total_amount,
                });
            }
        }
        return Array.from(itemMap.values()).sort((a, b) => b.total - a.total); // Sort by largest amount first
    }, [yardiAggregates, lineItems]);

    /**
     * Get the effective display value for a cell based on view mode
     */
    const getCellInfo = useCallback((li: PredevBudgetLineItem, monthKey: string): {
        value: number;
        style: 'normal' | 'actual-yardi' | 'actual-yardi-pending' | 'actual-manual' | 'budget-snapshot' | 'variance-positive' | 'variance-negative';
        editable: boolean;
        source: 'projected' | 'yardi' | 'manual-override' | 'snapshot' | 'variance';
        tooltip?: string;
    } => {
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
            let forecastVal = cell.projected;
            
            if (closed) {
                if (!cell.manual_override && yardiVal !== null && yardiVal !== 0) {
                    forecastVal = yardiVal;
                } else if (cell.actual !== null && cell.actual !== undefined) {
                    forecastVal = cell.actual;
                }
            } else {
                // Pending or Future
                forecastVal = (yardiVal ?? 0) + cell.projected;
            }

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

    // ── Handlers ─────────────────────────────────────────────

    const handleCreate = async () => {
        await createBudget.mutateAsync({ pursuitId, startDate: newStartDate, durationMonths: newDuration });
        setShowCreateDialog(false);
    };

    const handleCellChange = useCallback(
        (lineItem: PredevBudgetLineItem, monthKey: string, newValue: number) => {
            if (viewMode === 'budget' && hasSnapshot) {
                if (!budget) return;
                const newSnapshot = JSON.parse(JSON.stringify(budget.budget_snapshot || {}));
                if (!newSnapshot[lineItem.id]) newSnapshot[lineItem.id] = {};
                newSnapshot[lineItem.id][monthKey] = newValue;
                updateBudget.mutate({ id: budget.id, pursuitId, updates: { budget_snapshot: newSnapshot } });
                return;
            }

            const currentOverrides = pendingUpdatesRef.current[lineItem.id] || lineItem.monthly_values;
            const current = currentOverrides[monthKey] ?? { projected: 0, actual: null };
            const closed = isMonthClosed(monthKey, today);

            let updated: MonthlyCell;
            if (closed) {
                // Editing a closed month = manual override of ACTUAL
                updated = { projected: current.projected, actual: newValue, manual_override: true };
            } else {
                // Editing a pending or future month = editing PROJECTED portion
                const yardiVal = getYardiActual(lineItem, monthKey) ?? 0;
                // newValue is the combined total they want to see, so projected = newValue - yardiVal
                const newProjected = Math.max(0, newValue - yardiVal);
                updated = { projected: newProjected, actual: current.actual, manual_override: current.manual_override };
            }
            const newMonthly = { ...currentOverrides, [monthKey]: updated };
            pendingUpdatesRef.current[lineItem.id] = newMonthly;
            upsertValues.mutate({ lineItemId: lineItem.id, monthlyValues: newMonthly, pursuitId });
        },
        [upsertValues, pursuitId, today, getYardiActual, viewMode, hasSnapshot, budget, updateBudget]
    );

    const confirmPushBudgetToForecast = useCallback(async () => {
        if (!hasSnapshot || !budget?.budget_snapshot) {
            alert("No baseline budget snapshot exists yet.");
            return;
        }

        setShowPushConfirm(false);

        let operations = 0;
        for (const li of lineItems) {
            let changed = false;
            const newMonthly = { ...li.monthly_values };

            for (const mk of forwardMonths) {
                const snapshotVal = budget.budget_snapshot[li.id]?.[mk] ?? 0;
                const current = newMonthly[mk] ?? { projected: 0, actual: null };
                const yardiVal = getYardiActual(li, mk) ?? 0;

                // We want the total shown in Forecast to equal snapshotVal.
                // In forecast, total = yardiVal + projected
                const newProjected = Math.max(0, snapshotVal - yardiVal);

                if (current.projected !== newProjected) {
                    newMonthly[mk] = { ...current, projected: newProjected, manual_override: true };
                    changed = true;
                }
            }

            if (changed) {
                operations++;
                // Bypass pendingUpdatesRef since we're bulk saving and not dealing with simultaneous keystrokes here
                upsertValues.mutate({ lineItemId: li.id, monthlyValues: newMonthly, pursuitId });
            }
        }

        if (operations === 0) {
            alert("No future months needed updating (they already match the budget).");
        }
    }, [hasSnapshot, budget, lineItems, forwardMonths, getYardiActual, upsertValues, pursuitId]);

    const handleTogglePin = useCallback(
        (lineItem: PredevBudgetLineItem, monthKey: string) => {
            const current = lineItem.monthly_values[monthKey] ?? { projected: 0, actual: null };
            const newOverride = !current.manual_override;
            const updated: MonthlyCell = { ...current, manual_override: newOverride };
            if (!newOverride) {
                // Unpinning — clear actual so Yardi takes over
                updated.actual = null;
            }
            const newMonthly = { ...lineItem.monthly_values, [monthKey]: updated };
            upsertValues.mutate({ lineItemId: lineItem.id, monthlyValues: newMonthly, pursuitId });
        },
        [upsertValues, pursuitId]
    );

    const handleSnapshot = () => {
        if (!budget) return;
        snapshotBudgetMut.mutate({ budgetId: budget.id, pursuitId });
    };

    const handleAmend = () => {
        if (!budget) return;
        amendBudgetMut.mutate({ budgetId: budget.id, pursuitId, reason: amendReason || null });
        setShowAmendDialog(false);
        setAmendReason('');
    };

    // ── Summary calculations ─────────────────────────────────

    const { totalBudget, totalForecast, totalVariance, slrhPct } = useMemo(() => {
        let bTotal = 0, fTotal = 0;
        for (const li of lineItems) {
            for (const mk of monthKeys) {
                const cell = li.monthly_values[mk] ?? { projected: 0, actual: null };
                const snapshotVal = budget?.budget_snapshot?.[li.id]?.[mk] ?? 0;
                bTotal += hasSnapshot ? snapshotVal : cell.projected;

                // Forecast value
                const closed = isMonthClosed(mk, today);
                const yardiVal = getYardiActual(li, mk);
                
                if (closed) {
                    if (!cell.manual_override && yardiVal !== null && yardiVal !== 0) {
                        fTotal += yardiVal;
                    } else if (cell.actual !== null && cell.actual !== undefined) {
                        fTotal += cell.actual;
                    } else {
                        fTotal += cell.projected;
                    }
                } else {
                    // Pending or future: Combined total
                    fTotal += (yardiVal ?? 0) + cell.projected;
                }
            }
        }
        // Add unallocated Yardi amounts to total forecast
        fTotal += unallocatedTotal;

        // SLRH split
        const slrh = fundingPartners?.find(p => p.is_slrh);
        const pct = slrh?.default_split_pct ?? 100;
        return { totalBudget: bTotal, totalForecast: fTotal, totalVariance: fTotal - bTotal, slrhPct: pct };
    }, [lineItems, monthKeys, budget?.budget_snapshot, hasSnapshot, today, getYardiActual, fundingPartners, unallocatedTotal]);

    const rowTotal = useCallback((li: PredevBudgetLineItem) =>
        monthKeys.reduce((sum, mk) => {
            const info = getCellInfo(li, mk);
            return sum + info.value;
        }, 0),
        [monthKeys, getCellInfo]
    );

    const colTotal = useCallback((mk: string) => {
        let sum = lineItems.reduce((acc, li) => acc + getCellInfo(li, mk).value, 0);
        if (viewMode !== 'budget') {
            sum += unallocatedByMonth.get(mk) ?? 0;
        }
        return sum;
    }, [lineItems, getCellInfo, unallocatedByMonth, viewMode]);

    const grandTotal = useMemo(() => {
        let sum = lineItems.reduce((acc, li) => acc + rowTotal(li), 0);
        if (viewMode !== 'budget') {
            sum += unallocatedTotal;
        }
        return sum;
    }, [lineItems, rowTotal, unallocatedTotal, viewMode]);

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
                        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
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
                <div className="card p-3 border-[var(--warning)]/30 bg-[var(--warning)]/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-[var(--warning)]" />
                        <span className="text-xs text-[var(--text-secondary)]">
                            <strong>Finalize your Original Budget</strong> to start tracking variance against actuals.
                        </span>
                    </div>
                    <button
                        onClick={handleSnapshot}
                        disabled={snapshotBudgetMut.isPending}
                        className="px-3 py-1 rounded-lg bg-[var(--warning)] hover:opacity-90 text-white text-xs font-medium transition-colors"
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
                    {yardiLoading && <Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)]" />}
                    {!yardiLoading && yardiAggregates.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--success)] bg-[var(--success-bg)] px-2 py-0.5 rounded-full font-medium">
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
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${pursuit?.name?.replace(/[^a-zA-Z0-9-_]/g, '')}_PreDev_${viewMode}.pdf`;
                                a.click();
                                URL.revokeObjectURL(url);
                            } catch (err) {
                                console.error('PDF export failed:', err);
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

                    <button onClick={() => setIsEditAll(!isEditAll)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isEditAll ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>
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
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Original Budget</div>
                        <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{totalBudget === 0 ? '$0' : formatCurrency(totalBudget, 0)}</div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-[var(--accent)]" /></div>
                    <div>
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Forecast</div>
                        <div className="text-lg font-bold text-[var(--accent)] tabular-nums">{totalForecast === 0 ? '$0' : formatCurrency(totalForecast, 0)}</div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${totalVariance > 0 ? 'bg-[var(--danger)]/10' : 'bg-[var(--success-bg)]'}`}>
                        <BarChart3 className={`w-5 h-5 ${totalVariance > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Variance</div>
                        <div className={`text-lg font-bold tabular-nums ${totalVariance > 0 ? 'text-[var(--danger)]' : totalVariance < 0 ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'}`}>
                            {totalVariance === 0 ? '$0' : `${totalVariance > 0 ? '+' : ''}${formatCurrency(totalVariance, 0)}`}
                        </div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><Shield className="w-5 h-5 text-blue-500" /></div>
                    <div>
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">SLRH Obligation</div>
                        <div className="text-lg font-bold text-blue-500 tabular-nums">{formatCurrency(totalForecast * (slrhPct / 100), 0)}</div>
                        <div className="text-[10px] text-[var(--text-faint)]">{slrhPct}% share</div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--success-bg)] flex items-center justify-center shrink-0"><Database className="w-5 h-5 text-[var(--success)]" /></div>
                    <div>
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Yardi Actuals</div>
                        <div className="text-lg font-bold text-[var(--success)] tabular-nums">
                            {formatCurrency(yardiAggregates.filter(a => a.category_code.length === 2).reduce((s, a) => s + a.total_amount, 0), 0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="card p-4 border-[var(--accent)]/20">
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Budget Settings</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Start Month</label>
                            <input type="month" value={budget.start_date.substring(0, 7)}
                                onChange={(e) => updateBudget.mutate({ id: budget.id, pursuitId, updates: { start_date: `${e.target.value}-01` } })}
                                className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Duration (Months)</label>
                            <select value={budget.duration_months}
                                onChange={(e) => updateBudget.mutate({ id: budget.id, pursuitId, updates: { duration_months: Number(e.target.value) } })}
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
                            <p className="text-[10px] text-[var(--text-faint)] mt-1">Captures current projected values as a new budget revision with an audit trail.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Notes Panel */}
            {showNotes && (
                <div className="card">
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Budget Notes</h3>
                    <RichTextEditor content={budget.notes} onChange={(json) => updateBudget.mutate({ id: budget.id, pursuitId, updates: { notes: json } })} placeholder="Enter notes about this pre-dev budget..." />
                </div>
            )}

            {/* Funding Partners Panel */}
            {showFunding && (
                <div className="card p-4">
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Funding Partners</h3>
                    <div className="space-y-2">
                        {(fundingPartners ?? []).map((p) => (
                            <div key={p.id} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-[var(--border)] sm:border-0 last:border-0">
                                <span className={`text-xs font-medium min-w-[120px] ${p.is_slrh ? 'text-blue-500' : 'text-[var(--text-primary)]'}`}>
                                    {p.is_slrh && <Shield className="w-3 h-3 inline mr-1" />}{p.name}
                                </span>
                                <input type="number" min="0" max="100" step="0.5" value={p.default_split_pct}
                                    onChange={(e) => updatePartner.mutate({ id: p.id, pursuitId, updates: { default_split_pct: Number(e.target.value) } })}
                                    className="w-20 px-2 py-1 rounded border border-[var(--border)] text-xs text-right text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                                <span className="text-xs text-[var(--text-muted)]">%</span>
                                <span className="text-xs text-[var(--text-faint)] ml-auto tabular-nums">{formatCurrency(totalForecast * (p.default_split_pct / 100), 0)}</span>
                                <button onClick={() => deletePartner.mutate({ id: p.id, pursuitId })} className="text-[var(--text-faint)] hover:text-[var(--danger)] p-0.5" title="Remove funding partner"><Trash2 className="w-3 h-3" /></button>
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
                        <input type="text" value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} placeholder="Partner name..."
                            className="flex-1 px-2 py-1 rounded border border-[var(--border)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                        <input type="number" value={newPartnerSplit} onChange={(e) => setNewPartnerSplit(e.target.value)} placeholder="%" min="0" max="100"
                            className="w-16 px-2 py-1 rounded border border-[var(--border)] text-xs text-right text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
                        <button disabled={!newPartnerName.trim() || !newPartnerSplit}
                            onClick={() => { createPartner.mutate({ pursuit_id: pursuitId, name: newPartnerName.trim(), default_split_pct: Number(newPartnerSplit) }); setNewPartnerName(''); setNewPartnerSplit(''); }}
                            className="px-3 py-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-medium">Add</button>
                    </div>
                </div>
            )}

            {/* Amendments History */}
            {showAmendments && (
                <div className="card p-4">
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Budget Revisions</h3>
                    {(amendments ?? []).length === 0 ? (
                        <p className="text-xs text-[var(--text-faint)]">No amendments yet. The original budget snapshot is the current baseline.</p>
                    ) : (
                        <div className="space-y-2">
                            {(amendments ?? []).map((a) => (
                                <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-[var(--table-row-border)] last:border-0">
                                    <span className="text-xs font-bold text-[var(--accent)] min-w-[50px]">Rev {a.revision_number}</span>
                                    <span className="text-[10px] text-[var(--text-faint)]">{new Date(a.amended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{a.reason || 'No reason provided'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Budget Grid */}
            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar pb-32">
                    <table className="border-collapse relative" style={{ minWidth: `${340 + (expandLTD ? monthKeys.length : forwardMonths.length + 1) * 75 + 90}px` }}>
                        <thead>
                            {showSchedule && (
                                <PredevScheduleRows 
                                    scheduleItems={scheduleItems}
                                    monthKeys={monthKeys}
                                    visibleMonths={visibleMonths}
                                    closedMonths={closedMonths}
                                    expandLTD={expandLTD}
                                    onUpsert={(id, up) => upsertScheduleItem.mutate({ itemId: id, budgetId: budget!.id, pursuitId, updates: up })}
                                    onDelete={(id) => deleteScheduleItem.mutate({ itemId: id, pursuitId })}
                                    onSeed={() => seedScheduleItems.mutate({ budgetId: budget!.id, pursuitId })}
                                    onAddBlank={() => upsertScheduleItem.mutate({ itemId: null, budgetId: budget!.id, pursuitId, updates: { section: 'Summary', label: 'New Milestone', duration_weeks: 4 } })}
                                    pursuitId={pursuitId}
                                />
                            )}
                            <tr className="bg-[var(--bg-primary)]">
                                <th className="sticky left-0 z-20 bg-[var(--bg-primary)] text-left px-3 py-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-r border-[var(--border)] shadow-[1px_0_0_0_var(--border)]" style={{ minWidth: 340 }}>
                                    Line Item
                                </th>
                                {/* LTD Column (collapsed) */}
                                {!expandLTD && (
                                    <th
                                        className="text-center px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border)] bg-[var(--success-bg)]/50 text-[var(--success)] cursor-pointer hover:bg-[var(--success-bg)] transition-colors"
                                        style={{ minWidth: 70 }}
                                        onClick={() => setExpandLTD(true)}
                                    >
                                        <div className="flex flex-col items-center gap-0.5">
                                            <div className="flex items-center gap-1">
                                                <ChevronDown className="w-3 h-3" />
                                                <span>LTD Actuals</span>
                                            </div>
                                            <span className="text-[8px] font-normal opacity-60">{closedMonths.length} month{closedMonths.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </th>
                                )}
                                {/* Expanded closed months */}
                                {expandLTD && closedMonths.map((mk, i) => (
                                    <th key={mk}
                                        className="text-center px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border)] bg-[var(--success-bg)]/50 text-[var(--success)]"
                                        style={{ minWidth: 75 }}>
                                        <div className="flex flex-col items-center gap-0.5">
                                            {i === 0 ? (
                                                <button onClick={() => setExpandLTD(false)} className="flex items-center gap-1 hover:opacity-70">
                                                    <ChevronUp className="w-3 h-3" />
                                                    <span>{shortMonthLabel(mk)}</span>
                                                </button>
                                            ) : (
                                                <span>{shortMonthLabel(mk)}</span>
                                            )}
                                            <span className="text-[8px] font-normal opacity-60">{mk.split('-')[0]}</span>
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
                                            className={`text-center px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border)] ${pending ? 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-600' : isCurrent ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                                            style={{ minWidth: 75 }}>
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span>{shortMonthLabel(mk)}</span>
                                                <span className="text-[8px] font-normal opacity-60">{mk.split('-')[0]}</span>
                                                {pending && <AlertCircle className="w-2.5 h-2.5 opacity-50" />}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className="sticky right-0 z-20 bg-[var(--bg-primary)] text-right px-2 py-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-l border-[var(--border)]" style={{ minWidth: 90 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((li, idx) => {
                                const rt = rowTotal(li);
                                // LTD sum for this line item
                                const ltdSum = closedMonths.reduce((sum, mk) => {
                                    const info = getCellInfo(li, mk);
                                    return sum + info.value;
                                }, 0);
                                return (
                                <tr key={li.id} className={`group/row ${idx % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'} hover:bg-[var(--bg-elevated)] transition-colors h-[32px]`}>
                                        <td className="sticky left-0 z-10 bg-inherit px-3 py-0 border-r border-[var(--table-row-border)] shadow-[1px_0_0_0_var(--border)]">
                                            <div className="flex items-center gap-1.5 h-[32px]">
                                                <span className="text-xs text-[var(--text-primary)] font-medium truncate flex-1">{li.label}</span>
                                                {li.yardi_cost_groups?.length > 0 && (
                                                    <button
                                                        onClick={() => setMappingLineItem(li)}
                                                        className="flex items-center gap-1 text-[9px] text-[var(--text-faint)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-colors"
                                                        title={`Mapped codes:\n${li.yardi_cost_groups.join('\n')}\n\nClick to edit`}
                                                    >
                                                        <Database className="w-2.5 h-2.5 opacity-70" />
                                                        <span className="font-mono">{li.yardi_cost_groups.length}</span>
                                                    </button>
                                                )}
                                                {(!li.yardi_cost_groups || li.yardi_cost_groups.length === 0) && (
                                                    <button
                                                        onClick={() => setMappingLineItem(li)}
                                                        className="text-[8px] text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors opacity-0 group-hover/row:opacity-100"
                                                        title="Map cost groups"
                                                    >
                                                        <Database className="w-3 h-3 opacity-50" />
                                                    </button>
                                                )}
                                                <button onClick={() => deleteLineItemMut.mutate({ id: li.id, pursuitId })}
                                                    className="opacity-0 group-hover/row:opacity-100 text-[var(--text-faint)] hover:text-[var(--danger)] p-0.5 rounded transition-all ml-auto" title="Remove line item">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </td>
                                        {/* LTD cell (collapsed) */}
                                        {!expandLTD && (
                                            <td className="border-[var(--table-row-border)] bg-[var(--success-bg)]/20 text-right px-1 py-0 hover:bg-[var(--success-bg)]/40 transition-colors cursor-pointer group/ltd"
                                                onClick={() => {
                                                    if (li.yardi_cost_groups && li.yardi_cost_groups.length > 0) {
                                                        const groupString = li.yardi_cost_groups.join(',');
                                                        router.push(`/pursuits/${pursuitId}?tab=costs&cost_codes=${encodeURIComponent(groupString)}`);
                                                    }
                                                }}
                                                title={`Click to drill down into actual Job Cost transactions for ${li.label}\nFiltered by: ${li.yardi_cost_groups?.join(', ') || 'None'}`}
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
                                                        <button onClick={() => handleTogglePin(li, mk)} className="absolute top-0 right-0 p-0.5 opacity-0 group-hover/row:opacity-100 text-[var(--text-faint)] hover:text-[var(--accent)] transition-opacity" title="Override with manual value">
                                                            <Pin className="w-2.5 h-2.5" />
                                                        </button>
                                                    )}
                                                    {viewMode === 'forecast' && cell?.manual_override && (
                                                        <button onClick={() => handleTogglePin(li, mk)} className="absolute top-0 right-0 p-0.5 text-[var(--accent)] hover:text-[var(--danger)] transition-opacity" title="Unpin — revert to Yardi actual">
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
                                <tr className="group/row bg-[#FFF6ED] dark:bg-[#1A0F0A] hover:bg-[#FFECD9] dark:hover:bg-[#2A170F] transition-colors">
                                    <td className="sticky left-0 z-10 bg-inherit px-2 py-1 border-r border-[var(--table-row-border)]">
                                        <div className="flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                            <button 
                                                className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline text-left"
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
                                                if (codes) router.push(`/pursuits/${pursuitId}?tab=costs&cost_codes=${encodeURIComponent(codes)}`);
                                            }}
                                            title={`Click to drill down into unallocated actual Job Cost transactions`}
                                        >
                                            <span className="text-xs font-mono font-semibold text-orange-600 dark:text-orange-400 tabular-nums group-hover/ltd-unalloc:text-orange-700 dark:group-hover/ltd-unalloc:text-orange-300 transition-colors">
                                                {formatCurrency(closedMonths.reduce((sum, mk) => sum + (unallocatedByMonth.get(mk) ?? 0), 0), 0)}
                                            </span>
                                        </td>
                                    )}
                                    {/* Expanded closed month cells */}
                                    {expandLTD && closedMonths.map((mk) => {
                                        const val = unallocatedByMonth.get(mk) ?? 0;
                                        return (
                                            <td key={mk} className="border-[var(--table-row-border)] text-right px-1 py-1 bg-[var(--success-bg)]/5">
                                                <span className={`text-xs font-mono tabular-nums ${val === 0 ? 'text-[var(--border-strong)]' : 'text-orange-600 dark:text-orange-400 font-semibold'}`}>
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
                                                <span className={`text-xs font-mono tabular-nums ${val === 0 ? 'text-[var(--border-strong)]' : 'text-orange-600 dark:text-orange-400 font-semibold'}`}>
                                                    {val === 0 ? '—' : formatCurrency(val, 0)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                    <td className="sticky right-0 z-10 bg-inherit px-2 py-1 border-l border-[var(--table-row-border)] text-right">
                                        <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                                            {formatCurrency(unallocatedTotal, 0)}
                                        </span>
                                    </td>
                                </tr>
                            )}
                            {/* Total row */}
                            <tr className="bg-[var(--text-primary)]">
                                <td className="sticky left-0 z-10 bg-[var(--text-primary)] px-2 py-1.5 border-r border-[#2A3040] text-xs font-bold text-white uppercase tracking-wider">Total</td>
                                {/* LTD total (collapsed) */}
                                {!expandLTD && (
                                    <td className="px-1 py-1 text-right bg-[var(--success)]/10">
                                        <span className="text-xs font-mono font-bold text-green-300 tabular-nums">
                                            {formatCurrency(closedMonths.reduce((sum, mk) => sum + colTotal(mk), 0), 0)}
                                        </span>
                                    </td>
                                )}
                                {/* Expanded closed month totals */}
                                {expandLTD && closedMonths.map((mk) => {
                                    const ct = colTotal(mk);
                                    return (
                                        <td key={mk} className="px-1 py-1 text-right bg-[var(--success)]/10">
                                            <span className={`text-xs font-mono font-bold tabular-nums ${ct === 0 ? 'text-[var(--text-secondary)]' : 'text-green-300'}`}>
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
                                            <span className={`text-xs font-mono font-bold tabular-nums ${ct === 0 ? 'text-[var(--text-secondary)]' : 'text-white'}`}>
                                                {ct === 0 ? '—' : formatCurrency(ct, 0)}
                                            </span>
                                        </td>
                                    );
                                })}
                                <td className="sticky right-0 z-10 bg-[var(--text-primary)] px-2 py-1.5 border-l border-[#2A3040] text-right">
                                    <span className="text-xs font-mono font-bold text-white tabular-nums">{grandTotal === 0 ? '—' : formatCurrency(grandTotal, 0)}</span>
                                </td>
                            </tr>
                            {/* ── Funding Partner Rows ─────────────── */}
                            {fundingPartners && fundingPartners.length > 0 && (
                                <>
                                    <tr>
                                        <td colSpan={999} className="px-4 py-1.5 bg-[var(--bg-elevated)] border-t-2 border-[var(--border)]">
                                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Funding Splits</span>
                                        </td>
                                    </tr>
                                    {fundingPartners.map((partner) => {
                                        // Get the split for a specific month: check monthly overrides first, then fallback to default
                                        const getSplit = (mk: string): number => {
                                            const override = fundingSplits?.find(
                                                (s) => s.partner_id === partner.id && s.month_key === mk
                                            );
                                            return override ? override.split_pct : partner.default_split_pct;
                                        };

                                        const partnerLtdTotal = closedMonths.reduce((sum, mk) => sum + colTotal(mk) * getSplit(mk) / 100, 0);
                                        const partnerGrandTotal = monthKeys.reduce((sum, mk) => sum + colTotal(mk) * getSplit(mk) / 100, 0);

                                        return (
                                            <tr key={partner.id} className="bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]/50 transition-colors group/frow">
                                                <td className="sticky left-0 z-10 bg-inherit px-4 py-1.5 border-r border-[var(--table-row-border)]">
                                                    <div className="flex items-center gap-1.5">
                                                        {partner.is_slrh && <Shield className="w-3 h-3 text-blue-500 shrink-0" />}
                                                        <span className={`text-xs font-medium truncate ${partner.is_slrh ? 'text-blue-500' : 'text-[var(--text-secondary)]'}`}>
                                                            {partner.name}
                                                        </span>
                                                        <span className="text-[8px] text-[var(--text-faint)] ml-auto font-mono">
                                                            {partner.default_split_pct}%
                                                        </span>
                                                    </div>
                                                </td>
                                                {/* LTD cell (collapsed) */}
                                                {viewMode !== 'budget' && !expandLTD && (
                                                    <td className="border-[var(--table-row-border)] bg-[var(--success-bg)]/10 text-right px-2 py-1.5">
                                                        <span className={`text-xs font-mono tabular-nums ${partnerLtdTotal === 0 ? 'text-[var(--border-strong)]' : partner.is_slrh ? 'text-blue-500' : 'text-[var(--text-secondary)]'}`}>
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
                                                                })}
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
                                                                })}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                                <td className="sticky right-0 z-10 bg-inherit px-3 py-1.5 border-l border-[var(--table-row-border)] text-right">
                                                    <span className={`text-xs font-mono font-semibold tabular-nums ${partnerGrandTotal === 0 ? 'text-[var(--border-strong)]' : partner.is_slrh ? 'text-blue-500' : 'text-[var(--text-primary)]'}`}>
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
                    <div className="flex items-center gap-2">
                        <input type="text" value={newLineLabel} onChange={(e) => setNewLineLabel(e.target.value)} placeholder="Custom line item name..." autoFocus
                            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none w-64"
                            onKeyDown={(e) => { if (e.key === 'Enter' && newLineLabel.trim()) { addLineItem.mutate({ budgetId: budget.id, label: newLineLabel.trim(), pursuitId }); setNewLineLabel(''); setShowAddLine(false); } if (e.key === 'Escape') { setShowAddLine(false); setNewLineLabel(''); } }} />
                        <button onClick={() => { if (newLineLabel.trim()) { addLineItem.mutate({ budgetId: budget.id, label: newLineLabel.trim(), pursuitId }); setNewLineLabel(''); setShowAddLine(false); } }}
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
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Amend Original Budget</h2>
                        <p className="text-xs text-[var(--text-muted)] mb-4">The current projected values will replace the original budget snapshot. The previous snapshot is preserved in the revision history.</p>
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Reason (optional)</label>
                            <input type="text" value={amendReason} onChange={(e) => setAmendReason(e.target.value)} placeholder="e.g., Scope change — added landscape design"
                                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" autoFocus />
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
                        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Push Core Budget?</h2>
                        <p className="text-sm text-[var(--text-secondary)] mb-6">
                            This will completely overwrite your working forecast for all future and pending months using the original budget allocations. 
                            <br /><br />
                            <strong className="text-[var(--text-primary)]">Any manual forecasting overrides will be lost.</strong>
                        </p>
                        <div className="flex justify-center gap-3 w-full">
                            <button onClick={() => setShowPushConfirm(false)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                                Cancel
                            </button>
                            <button onClick={confirmPushBudgetToForecast} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-sm transition-colors">
                                Overwrite
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-faint)]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--success)]" /> Yardi Actual</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--accent)]" /> Manual Override</span>
                <span className="flex items-center gap-1"><Database className="w-2.5 h-2.5" /> Closed Month (15-day lag)</span>
                <span className="flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> Pending Close</span>
            </div>

            {/* Cost Code Mapping Dialog */}
            {mappingLineItem && (
                <CostCodeMappingDialog
                    lineItem={mappingLineItem}
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
