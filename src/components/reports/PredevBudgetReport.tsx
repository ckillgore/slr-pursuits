'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { 
    useAllPredevBudgets, 
    useAllFundingPartners,
    useAllFundingSplits,
    useAllPortfolioJobCostAggregates
} from '@/hooks/useSupabaseQueries';
import type { PredevBudget, PredevBudgetLineItem, PursuitFundingPartner, PursuitFundingSplit } from '@/types';
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
    Shield,
    Info,
    AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { isMonthClosed, forecastCellValue, OPEN_MONTH_NOTE, dedupeYardiAggs } from '@/lib/calculations/predevForecast';
import { useRegisterReportExport } from './ReportExportContext';
import type { TableExportSpec, ExportColumn, ExportRow } from '@/components/export/tableExport';

// ── Helpers ─────────────────────────────────────────────────

function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isMonthPendingClose(monthKey: string, today: Date, currentMonth: string): boolean {
    if (monthKey >= currentMonth) return false;
    return !isMonthClosed(monthKey, today);
}

/**
 * Deduped Yardi rows for one pursuit, bucketed by month. Buckets keep the feed's
 * original row order, so every sum below adds the same numbers in the same
 * order as a full scan would: totals are unchanged, the scan just skips the
 * other months.
 */
function indexAggsByMonth(aggs: YardiMonthlyCostAggregate[] | undefined): Map<string, YardiMonthlyCostAggregate[]> {
    const byMonth = new Map<string, YardiMonthlyCostAggregate[]>();
    if (!aggs || aggs.length === 0) return byMonth;
    for (const a of dedupeYardiAggs(aggs)) {
        const bucket = byMonth.get(a.month);
        if (bucket) bucket.push(a);
        else byMonth.set(a.month, [a]);
    }
    return byMonth;
}

function getYardiActual(
    li: PredevBudgetLineItem,
    monthRows: YardiMonthlyCostAggregate[] | undefined,
): number | null {
    if (!monthRows || monthRows.length === 0 || !li.yardi_cost_groups || li.yardi_cost_groups.length === 0) return null;
    let total = 0;
    let found = false;

    // Aggregates are keyed by detail code ("50-00100"). A line item may map a
    // whole 2-digit group ("50") or a specific detail code — same rule as
    // PredevBudgetTab, so the portfolio report ties to the pursuit page.
    for (const code of li.yardi_cost_groups) {
        const isGroup = code.length <= 2;
        for (const a of monthRows) {
            if (isGroup ? a.category_code.substring(0, 2) === code : a.category_code === code) {
                total += a.total_amount;
                found = true;
            }
        }
    }

    return found ? total : null;
}

interface CoveredCodes {
    groups: Set<string>;
    codes: Set<string>;
}

/** The Yardi groups and detail codes that any of a budget's line items map. */
function coveredCodesFor(lineItems: PredevBudgetLineItem[]): CoveredCodes {
    const groups = new Set<string>();
    const codes = new Set<string>();
    for (const li of lineItems) {
        for (const code of li.yardi_cost_groups ?? []) {
            if (code.length <= 2) groups.add(code);
            else codes.add(code);
        }
    }
    return { groups, codes };
}

/**
 * Yardi cost for one month that no line item maps to. PredevBudgetTab shows
 * this as "Unallocated Yardi Actuals" and includes it in the pursuit total, so
 * the portfolio report must too or the two won't tie.
 */
function unallocatedYardiForMonth(
    lineItems: PredevBudgetLineItem[],
    covered: CoveredCodes,
    monthRows: YardiMonthlyCostAggregate[] | undefined,
): number {
    if (!monthRows || monthRows.length === 0 || lineItems.length === 0) return 0;
    let total = 0;
    for (const a of monthRows) {
        if (covered.groups.has(a.category_code.substring(0, 2)) || covered.codes.has(a.category_code)) continue;
        total += a.total_amount;
    }
    return total;
}

function pursuitMonthTotal(
    lineItems: PredevBudgetLineItem[],
    covered: CoveredCodes,
    monthKey: string,
    monthRows: YardiMonthlyCostAggregate[] | undefined,
    today: Date,
    lineItemFilter?: Set<string>
): number {
    // forecastCellValue is shared with PredevBudgetTab so the report ties to the pursuit page.
    const closed = isMonthClosed(monthKey, today);
    const lineTotal = lineItems
        .filter((li) => !lineItemFilter || lineItemFilter.has(li.label))
        .reduce((sum, li) => {
            const cell = li.monthly_values[monthKey] ?? { projected: 0, actual: null };
            return sum + forecastCellValue(cell, getYardiActual(li, monthRows), closed);
        }, 0);
    // Unallocated spend belongs to no line item, so a line-item filter excludes it.
    return lineItemFilter ? lineTotal : lineTotal + unallocatedYardiForMonth(lineItems, covered, monthRows);
}

/** Funding partners and split overrides, indexed once instead of scanned per cell. */
interface FundingIndex {
    partnersByPursuit: Map<string, PursuitFundingPartner[]>;
    /** `${partner_id}|${month_key}` → the first matching override (what Array.find returned). */
    splitByPartnerMonth: Map<string, PursuitFundingSplit>;
}

function buildFundingIndex(fundingPartners: PursuitFundingPartner[], fundingSplits: PursuitFundingSplit[]): FundingIndex {
    const partnersByPursuit = new Map<string, PursuitFundingPartner[]>();
    for (const p of fundingPartners) {
        const list = partnersByPursuit.get(p.pursuit_id);
        if (list) list.push(p);
        else partnersByPursuit.set(p.pursuit_id, [p]);
    }
    const splitByPartnerMonth = new Map<string, PursuitFundingSplit>();
    for (const s of fundingSplits) {
        const key = `${s.partner_id}|${s.month_key}`;
        if (!splitByPartnerMonth.has(key)) splitByPartnerMonth.set(key, s);
    }
    return { partnersByPursuit, splitByPartnerMonth };
}

function getSplitPct(
    pursuitId: string,
    monthKey: string,
    funding: FundingIndex,
    viewMode: string
): number {
    if (viewMode === 'total') return 1;

    const pursuitPartners = funding.partnersByPursuit.get(pursuitId) ?? [];
    if (!pursuitPartners.length) {
        return viewMode === 'slrh' ? 1 : 0;
    }

    let thirdPartySum = 0;
    const partnerPcts = new Map<string, number>();

    for (const p of pursuitPartners) {
        if (p.is_slrh) continue;
        const override = funding.splitByPartnerMonth.get(`${p.id}|${monthKey}`);
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

function pursuitSnapshotTotal(
    budget: PredevBudget,
    funding: FundingIndex,
    fundingView: string,
    lineItemFilter?: Set<string>,
): number {
    if (!budget.budget_snapshot) return 0;
    // Snapshot is keyed by line item id; the filter is by label.
    const labelById = new Map((budget.line_items ?? []).map(li => [li.id, li.label]));
    let total = 0;
    for (const [lineItemId, lineItemMonths] of Object.entries(budget.budget_snapshot)) {
        if (lineItemFilter && !lineItemFilter.has(labelById.get(lineItemId) ?? '')) continue;
        for (const [monthKey, val] of Object.entries(lineItemMonths)) {
            const pct = getSplitPct(budget.pursuit_id, monthKey, funding, fundingView);
            total += (val as number) * pct;
        }
    }
    return total;
}

/** Everything the grid, metrics and export need for one pursuit, computed once per input change. */
interface PursuitCalc {
    /** Sorted months this pursuit occupies (see getPursuitMonthKeys). */
    monthKeys: string[];
    monthSet: Set<string>;
    /** Funding-adjusted forecast for each month in monthKeys. */
    byMonth: Map<string, number>;
    /** byMonth summed over monthKeys, in order. */
    total: number;
    /** byMonth summed over the closed months, in order. */
    ltd: number;
}

function buildPursuitCalc(
    row: PredevBudgetReportRow,
    aggs: YardiMonthlyCostAggregate[] | undefined,
    today: Date,
    funding: FundingIndex,
    fundingView: string,
    lineItemFilter?: Set<string>,
): PursuitCalc {
    const monthKeys = getPursuitMonthKeys(row, aggs);
    const aggsByMonth = indexAggsByMonth(aggs);
    const lineItems = row.budget.line_items ?? [];
    const covered = coveredCodesFor(lineItems);
    const byMonth = new Map<string, number>();
    let total = 0;
    let ltd = 0;
    for (const mk of monthKeys) {
        const raw = pursuitMonthTotal(lineItems, covered, mk, aggsByMonth.get(mk), today, lineItemFilter);
        const value = raw * getSplitPct(row.budget.pursuit_id, mk, funding, fundingView);
        byMonth.set(mk, value);
        total += value;
        if (isMonthClosed(mk, today)) ltd += value;
    }
    return { monthKeys, monthSet: new Set(monthKeys), byMonth, total, ltd };
}

/** The day a month closes: 15 days after its last day, matching isMonthClosed. */
function closeDateLabel(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    const monthEnd = new Date(y, m, 0);
    const closes = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 15);
    return closes.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/**
 * The months one pursuit occupies in this report: its budgeted window plus any
 * month Yardi has posted cost against it.
 *
 * Yardi spend routinely lands outside the budgeted window — diligence booked
 * before the budget's start_date, or a deal running past its duration. The
 * grand total has always picked that spend up (it walks the portfolio-wide
 * month list), while the rows clipped it to the budget window. That mismatch
 * is why the Grand Total row did not foot to the rows above it, and why a
 * pursuit like South Lamar could show real spend in no column at all. Ranging
 * both off the same set makes them reconcile by construction.
 *
 * Schedule-item months are included the same way PredevBudgetTab does, so a
 * projection entered in a month that only the schedule extends to is counted
 * in both places. This only takes effect when the rows carry
 * `budget.schedule_items` (fetchAllPredevBudgets must select them).
 */
function getPursuitMonthKeys(
    row: PredevBudgetReportRow,
    aggs: YardiMonthlyCostAggregate[] | undefined,
): string[] {
    const keys = new Set(getForwardMonthKeys([row]));
    for (const agg of aggs ?? []) keys.add(agg.month);
    for (const item of row.budget.schedule_items ?? []) {
        if (!item.start_date) continue;
        const [y, m] = item.start_date.substring(0, 7).split('-').map(Number);
        const span = item.duration_weeks > 0 ? Math.max(1, Math.ceil(item.duration_weeks / 4.33)) : 1;
        for (let i = 0; i < span; i++) {
            const mm = ((m - 1 + i) % 12) + 1;
            const yy = y + Math.floor((m - 1 + i) / 12);
            keys.add(`${yy}-${String(mm).padStart(2, '0')}`);
        }
    }
    return Array.from(keys).sort();
}

// ── Component ───────────────────────────────────────────────

type ViewMode = 'monthly' | 'annual';

export function PredevBudgetReport() {
    const { data: rowsRaw, isLoading: loadingBudgets, error: budgetsError } = useAllPredevBudgets();
    const { data: fundingPartnersRaw, isLoading: loadingPartners, error: partnersError } = useAllFundingPartners();
    const { data: fundingSplitsRaw, isLoading: loadingSplits, error: splitsError } = useAllFundingSplits();
    const { data: yardiAggregates, isLoading: loadingAggregates, error: aggregatesError } = useAllPortfolioJobCostAggregates();

    const isLoading = loadingBudgets || loadingPartners || loadingSplits || loadingAggregates;
    const loadError = budgetsError || partnersError || splitsError || aggregatesError;

    const [viewMode, setViewMode] = useState<ViewMode>('monthly');
    const [groupBy, setGroupBy] = useState<'none' | 'region'>('none');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    // Filters
    const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
    const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showStageDropdown, setShowStageDropdown] = useState(false);
    const stageDropdownRef = useRef<HTMLDivElement>(null);
    const lineItemDropdownRef = useRef<HTMLDivElement>(null);

    const [fundingView, setFundingView] = useState<string>('total');

    const today = useMemo(() => new Date(), []);

    // Close the filter dropdowns on an outside click.
    useEffect(() => {
        if (!showStageDropdown && !showFilterDropdown) return;
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (stageDropdownRef.current?.contains(target) || lineItemDropdownRef.current?.contains(target)) return;
            setShowStageDropdown(false);
            setShowFilterDropdown(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [showStageDropdown, showFilterDropdown]);

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

    // Apply Stage Filter
    const stageFilter = selectedStages.size > 0 ? selectedStages : undefined;
    const rows = useMemo(() => {
        let arr = rowsRaw ?? [];
        if (stageFilter) arr = arr.filter(r => r.stage && stageFilter.has(r.stage.id));
        return arr;
    }, [rowsRaw, stageFilter]);

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
    const activeFilterCount = selectedStages.size + selectedLineItems.size;

    const funding = useMemo(
        () => buildFundingIndex(fundingPartnersRaw ?? [], fundingSplitsRaw ?? []),
        [fundingPartnersRaw, fundingSplitsRaw],
    );

    // ── Precompute ──────────────────────────────────────────────
    // Every figure on this page (cells, row totals, group subtotals, column and
    // grand totals, metrics, export) reads from this one pass. Each pursuit is
    // restricted to its own month range (budget window ∪ Yardi months ∪
    // schedule months), so rows, groups and the grand total foot by
    // construction. Sums run in the same order the old per-cell code used.
    const calc = useMemo(() => {
        const byPursuit = new Map<string, PursuitCalc>();
        const allMonths = new Set<string>();
        for (const r of rows) {
            const pc = buildPursuitCalc(r, yardiAggregates?.[r.pursuit.id], today, funding, fundingView, lineItemFilter);
            byPursuit.set(r.pursuit.id, pc);
            // Only pursuits still in the (stage-filtered) report contribute
            // months, so filtered-out pursuits don't leave empty columns.
            for (const mk of pc.monthKeys) allMonths.add(mk);
        }
        const monthKeys = Array.from(allMonths).sort();
        const grandByMonth = new Map<string, number>();
        for (const mk of monthKeys) {
            grandByMonth.set(mk, rows.reduce((sum, r) => {
                const pc = byPursuit.get(r.pursuit.id)!;
                return pc.monthSet.has(mk) ? sum + (pc.byMonth.get(mk) ?? 0) : sum;
            }, 0));
        }
        return { byPursuit, monthKeys, grandByMonth };
    }, [rows, yardiAggregates, today, funding, fundingView, lineItemFilter]);

    const monthKeys = calc.monthKeys;
    const calcFor = useCallback((r: PredevBudgetReportRow) => calc.byPursuit.get(r.pursuit.id)!, [calc]);
    /** Forecast for one pursuit-month, or null when the month is outside that pursuit's range. */
    const cellValue = useCallback((r: PredevBudgetReportRow, mk: string): number | null => {
        const pc = calc.byPursuit.get(r.pursuit.id);
        if (!pc || !pc.monthSet.has(mk)) return null;
        return pc.byMonth.get(mk) ?? 0;
    }, [calc]);
    const grandTotalByMonth = useCallback((mk: string) => calc.grandByMonth.get(mk) ?? 0, [calc]);

    // Split into closed (LTD) and forward
    const closedMonths = useMemo(() => monthKeys.filter(mk => isMonthClosed(mk, today)), [monthKeys, today]);
    const forwardMonths = useMemo(() => monthKeys.filter(mk => !isMonthClosed(mk, today)), [monthKeys, today]);
    const pendingMonths = useMemo(() => {
        const current = getCurrentMonthKey();
        return new Set(forwardMonths.filter(mk => isMonthPendingClose(mk, today, current)));
    }, [forwardMonths, today]);

    const yearGroups = useMemo(() => groupMonthsByYear(forwardMonths), [forwardMonths]);

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

    // Groups start expanded; track the ones the user collapsed instead of
    // re-expanding everything from an effect whenever the rows change.
    const toggleGroup = (key: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const overallGrandTotal = monthKeys.reduce((sum, mk) => sum + grandTotalByMonth(mk), 0);
    const overallGrandLtd = closedMonths.reduce((sum, mk) => sum + grandTotalByMonth(mk), 0);

    const portfolioMetrics = useMemo(() => {
        let totalBudget = 0;
        let totalForecast = 0;

        for (const r of rows) {
            // A pursuit with no snapshot budgets at its forecast (zero variance).
            // Check for the snapshot explicitly — a snapshot that legitimately
            // sums to 0 (e.g. under a line-item filter) must not fall back.
            const forecast = calcFor(r).total;
            totalForecast += forecast;
            const hasSnapshot = !!r.budget.budget_snapshot && Object.keys(r.budget.budget_snapshot).length > 0;
            totalBudget += hasSnapshot ? pursuitSnapshotTotal(r.budget, funding, fundingView, lineItemFilter) : forecast;
        }

        const variance = totalForecast - totalBudget;
        return { totalBudget, totalForecast, variance, slrhObligation: totalForecast }; // Obligation is matched via fundingView dynamically
    }, [rows, calcFor, funding, fundingView, lineItemFilter]);

    // ── Export ──────────────────────────────────────────────────
    // Mirrors the grid below so the toolbar's XLSX/PDF buttons emit this tab's
    // matrix rather than the Pursuits report. Collapsed groups are still
    // included — an export is the data set, not the current viewport.
    const buildExportSpec = useCallback((): TableExportSpec => {
        const periodCols: ExportColumn[] = viewMode === 'monthly'
            ? forwardMonths.map((mk) => ({
                label: pendingMonths.has(mk) ? `${formatMonthLabel(mk)}*` : formatMonthLabel(mk),
                type: 'currency' as const,
                dashOnZero: true,
            }))
            : yearGroups.map((yg) => ({ label: yg.year, type: 'currency' as const, dashOnZero: true }));

        const columns: ExportColumn[] = [
            { label: 'Pursuit', type: 'text', weight: 2.6 },
            { label: 'Location', type: 'text' },
            { label: 'Stage', type: 'text', weight: 1.4 },
            { label: 'Total', type: 'currency' },
            { label: 'LTD Actuals', type: 'currency', dashOnZero: true },
            ...periodCols,
        ];

        const periodMonths = (colIdx: number): string[] =>
            viewMode === 'monthly' ? [forwardMonths[colIdx]] : yearGroups[colIdx].months;

        /** Sum a set of rows for one period column, respecting the active view. */
        const periodTotal = (groupRows: PredevBudgetReportRow[], colIdx: number): number => {
            const months = periodMonths(colIdx);
            let total = 0;
            for (const r of groupRows) {
                for (const mk of months) {
                    const v = cellValue(r, mk);
                    if (v === null) continue;
                    total += v;
                }
            }
            return total;
        };

        const exportRows: ExportRow[] = [];

        for (const [groupKey, groupRows] of Object.entries(groupedRows)) {
            if (groupBy === 'region') {
                const groupTotal = groupRows.reduce((sum, r) => sum + calcFor(r).total, 0);
                const groupLtd = groupRows.reduce((sum, r) => sum + calcFor(r).ltd, 0);

                exportRows.push({
                    kind: 'group',
                    cells: [
                        `${groupKey} (${groupRows.length} pursuit${groupRows.length !== 1 ? 's' : ''})`,
                        null,
                        null,
                        groupTotal,
                        groupLtd,
                        ...periodCols.map((_, i) => periodTotal(groupRows, i)),
                    ],
                });
            }

            for (const row of groupRows) {
                const pc = calcFor(row);

                const periodCells = periodCols.map((_, i) => {
                    const months = periodMonths(i);
                    const inRange = months.some(mk => pc.monthSet.has(mk));
                    if (!inRange) return null; // renders as an em dash, like the grid
                    return months.reduce((sum, mk) => {
                        const v = cellValue(row, mk);
                        return v === null ? sum : sum + v;
                    }, 0);
                });

                exportRows.push({
                    kind: 'data',
                    cells: [
                        row.pursuit.name,
                        [row.pursuit.city, row.pursuit.state].filter(Boolean).join(', ') || null,
                        row.stage?.name ?? null,
                        pc.total,
                        pc.ltd,
                        ...periodCells,
                    ],
                    depth: groupBy === 'region' ? 1 : 0,
                });
            }
        }

        exportRows.push({
            kind: 'total',
            cells: [
                'GRAND TOTAL',
                null,
                null,
                overallGrandTotal,
                overallGrandLtd,
                ...periodCols.map((_, i) => periodTotal(rows, i)),
            ],
        });

        const dataViewLabel = fundingView === 'total'
            ? 'Total Pursuit Forecast'
            : fundingView === 'slrh'
                ? 'SLRH Share Forecast'
                : `Partner: ${fundingView.split(':')[1]} Share`;

        const filterNotes: string[] = [];
        if (stageFilter) filterNotes.push(`${stageFilter.size} stage filter${stageFilter.size !== 1 ? 's' : ''}`);
        if (lineItemFilter) filterNotes.push(`${lineItemFilter.size} line item filter${lineItemFilter.size !== 1 ? 's' : ''}`);

        const shareWord = fundingView !== 'total' ? 'Share ' : '';

        return {
            title: 'Pre-Dev Budget Report',
            sheetName: 'Pre-Dev',
            fileBase: 'Pre-Dev_Budgets_Report',
            subtitle: [
                `${rows.length} pursuit${rows.length !== 1 ? 's' : ''}`,
                'Active pipeline only',
                viewMode === 'monthly' ? 'Monthly' : 'Annual',
                `Data View: ${dataViewLabel}`,
                groupBy === 'region' ? 'Grouped by Region' : 'Ungrouped',
                ...filterNotes,
            ].join(' · '),
            columns,
            rows: exportRows,
            frozenCols: 5,
            metrics: [
                { label: `Total ${shareWord}Forecast`, value: formatCurrency(portfolioMetrics.totalForecast, 0) },
                { label: `Total ${shareWord}Budget`, value: formatCurrency(portfolioMetrics.totalBudget, 0) },
                { label: 'Forecast Variance', value: `${portfolioMetrics.variance > 0 ? '+' : ''}${formatCurrency(portfolioMetrics.variance, 0)}` },
                { label: 'Overall Forecast', value: formatCurrency(portfolioMetrics.slrhObligation, 0) },
            ],
            notes: [
                OPEN_MONTH_NOTE,
                ...(viewMode === 'monthly' && pendingMonths.size > 0 ? ['* Month is past but not yet closed (pending close).'] : []),
            ],
        };
    }, [
        viewMode, forwardMonths, pendingMonths, yearGroups, groupedRows, groupBy, rows, overallGrandTotal, overallGrandLtd,
        cellValue, calcFor, fundingView, lineItemFilter, stageFilter, portfolioMetrics,
    ]);

    useRegisterReportExport(isLoading || loadError || rows.length === 0 ? null : buildExportSpec);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
                <p className="text-xs text-[var(--text-muted)]">Loading budgets and Yardi actuals…</p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <AlertCircle className="w-12 h-12 text-[var(--danger)] mb-3 opacity-60" />
                <p className="text-sm text-[var(--text-primary)] mb-1">Couldn&apos;t load the pre-dev report</p>
                <p className="text-xs text-[var(--text-muted)] max-w-md">
                    {loadError instanceof Error ? loadError.message : 'One of the budget, funding or Yardi queries failed.'} Reload the page to try again.
                </p>
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

    const numCell = 'text-right font-mono tabular-nums whitespace-nowrap';

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
                        className={`px-2 py-1 rounded-md border text-xs font-semibold bg-[var(--bg-card)] ${fundingView !== 'total'
                            ? 'border-[var(--accent)]/40 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-primary)]'
                            }`}
                    >
                        <option value="total">Total Pursuit Forecast</option>
                        <option value="slrh">SLRH Share Forecast</option>
                        {allPartnerOptions.map(p => (
                            <option key={p} value={`partner_name:${p}`}>Partner: {p} Share</option>
                        ))}
                    </select>
                </div>

                {/* Stage Filter */}
                <div className="relative" ref={stageDropdownRef}>
                    <button
                        onClick={() => {
                            setShowStageDropdown(!showStageDropdown);
                            setShowFilterDropdown(false);
                        }}
                        aria-expanded={showStageDropdown}
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
                                    <button onClick={() => setSelectedStages(new Set())} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
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
                <div className="relative" ref={lineItemDropdownRef}>
                    <button
                        onClick={() => {
                            setShowFilterDropdown(!showFilterDropdown);
                            setShowStageDropdown(false);
                        }}
                        aria-expanded={showFilterDropdown}
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
                                    <button onClick={() => setSelectedLineItems(new Set())} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
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

                {activeFilterCount > 0 && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                        <X className="w-3 h-3" />
                        Clear filters
                    </button>
                )}

                <span className="ml-auto text-xs text-[var(--text-faint)] tabular-nums">
                    {rows.length} of {rowsRaw.length} pursuit{rowsRaw.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Scope and month-rule notes. Totals exclude pursuits whose stage is
                flagged out of the forecast, so they won't tie to a raw budget
                list; open months follow the rule in OPEN_MONTH_NOTE. */}
            <div className="-mt-1 space-y-0.5 text-[11px] text-[var(--text-faint)]">
                <p>
                    Active pipeline only — pursuits in Closed, Passed, Dead or Inactive stages are excluded.
                    Adjust per stage under Admin &rsaquo; Stages.
                </p>
                <p className="flex items-start gap-1.5">
                    <Info className="w-3 h-3 mt-px shrink-0" />
                    <span>
                        {OPEN_MONTH_NOTE}
                        {pendingMonths.size > 0 && (
                            <> Months shaded <span className="px-1 rounded bg-[var(--warning)]/15 text-[var(--warning)] font-medium">amber</span> are past but not yet closed.</>
                        )}
                    </span>
                </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarDays className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Total {fundingView !== 'total' ? 'Share ' : ''}Forecast
                        </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
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
                    <div className="text-2xl font-bold font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
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
                    <div className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${portfolioMetrics.variance > 0 ? 'text-[var(--danger)]' : portfolioMetrics.variance < 0 ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'}`}>
                        {portfolioMetrics.variance > 0 ? '+' : ''}{formatCurrency(portfolioMetrics.variance, 0)}
                    </div>
                </div>
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-5">
                        <Shield className="w-24 h-24" />
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-4 h-4 text-[var(--success)]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Overall Forecast
                        </span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums tracking-tight text-[var(--success)]">
                        {formatCurrency(portfolioMetrics.slrhObligation, 0)}
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1 font-medium">Dynamically filtered by Data View</p>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
                    <Filter className="w-10 h-10 text-[var(--border-strong)] mb-3" />
                    <p className="text-sm text-[var(--text-muted)] mb-1">No pursuits match the selected stages</p>
                    <button onClick={clearFilters} className="text-xs text-[var(--accent)] hover:underline">Clear filters</button>
                </div>
            ) : (
            /* Grid — scrolls both ways inside its own frame so the header row,
               the Pursuit column and the Grand Total stay pinned. */
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-auto max-h-[75vh] [scrollbar-width:thin]">
                    <table className="w-full min-w-max text-sm border-separate border-spacing-0">
                        <thead>
                            <tr>
                                <th className="sticky left-0 top-0 z-30 bg-[var(--bg-elevated)] text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-b border-r border-[var(--border)]" style={{ minWidth: 280 }}>
                                    Pursuit
                                </th>
                                <th className="sticky top-0 z-20 bg-[var(--bg-elevated)] text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-b border-r border-[var(--border)]">
                                    Total
                                </th>
                                <th className="sticky top-0 z-20 bg-[var(--bg-elevated)] text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] border-b border-r border-[var(--border)]" title="Life-to-date: every closed month, summed">
                                    LTD Actuals
                                </th>
                                {viewMode === 'monthly' ? forwardMonths.map((mk) => {
                                    const isPending = pendingMonths.has(mk);
                                    return (
                                        <th
                                            key={mk}
                                            title={isPending
                                                ? `Pending close (closes ${closeDateLabel(mk)}): Yardi posted to date + full projection`
                                                : 'Open month: Yardi posted to date + full projection'}
                                            className={`sticky top-0 z-20 text-right px-3 py-2.5 text-xs font-semibold border-b border-r border-[var(--border)] last:border-r-0 min-w-[80px] whitespace-nowrap ${
                                                isPending
                                                    ? 'bg-[color-mix(in_srgb,var(--warning)_14%,var(--bg-elevated))] text-[var(--warning)] border-b-2 border-b-[var(--warning)]/50'
                                                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                                            }`}
                                        >
                                            {formatMonthLabel(mk)}
                                        </th>
                                    );
                                }) : yearGroups.map((yg) => (
                                    <th key={yg.year} className="sticky top-0 z-20 bg-[var(--bg-elevated)] text-right px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)] border-b border-r border-[var(--border)] last:border-r-0 min-w-[80px]">
                                        {yg.year}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        {/* Table bodies mapped per group */}
                            {Object.entries(groupedRows).map(([groupKey, groupRows]) => {
                                const isExpanded = groupBy === 'none' || !collapsedGroups.has(groupKey);
                                const isRegionBlocked = groupBy === 'region';

                                // Group Subtotals
                                const groupTotal = groupRows.reduce((sum, r) => sum + calcFor(r).total, 0);
                                const groupLtd = groupRows.reduce((sum, r) => sum + calcFor(r).ltd, 0);
                                const groupMonthTotal = (mk: string) => groupRows.reduce((sum, r) => {
                                    const v = cellValue(r, mk);
                                    return v === null ? sum : sum + v;
                                }, 0);

                                return (
                                    <tbody key={groupKey || 'all'} className="group-body">
                                        {isRegionBlocked && (
                                            <tr className="group/grp cursor-pointer" onClick={() => toggleGroup(groupKey)} aria-expanded={isExpanded}>
                                                <td className="sticky left-0 z-10 bg-[var(--bg-elevated)] group-hover/grp:bg-[var(--accent-subtle)] transition-colors px-4 py-2 border-b border-r border-[var(--border)]">
                                                    <div className="flex items-center gap-2">
                                                        {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                                                        <span className="font-semibold text-xs uppercase tracking-wider text-[var(--text-primary)]">{groupKey}</span>
                                                        <span className="ml-auto text-[10px] font-medium bg-[var(--bg-card)] px-1.5 py-0.5 rounded text-[var(--text-muted)] border border-[var(--border)]">
                                                            {groupRows.length} pursuit{groupRows.length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className={`${numCell} px-4 py-2 text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-elevated)] group-hover/grp:bg-[var(--accent-subtle)] border-b border-r border-[var(--border)]`}>
                                                    {formatCurrency(groupTotal, 0)}
                                                </td>
                                                <td className={`${numCell} px-4 py-2 text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-elevated)] group-hover/grp:bg-[var(--accent-subtle)] border-b border-r border-[var(--border)]`}>
                                                    {groupLtd === 0 ? <span className="text-[var(--text-faint)]">—</span> : formatCurrency(groupLtd, 0)}
                                                </td>
                                                {viewMode === 'monthly' ? forwardMonths.map((mk) => {
                                                    const mTot = groupMonthTotal(mk);
                                                    return (
                                                        <td key={mk} className={`${numCell} px-3 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] group-hover/grp:bg-[var(--accent-subtle)] border-b border-r border-[var(--border)] last:border-r-0`}>
                                                            {mTot === 0 ? <span className="text-[var(--text-faint)]">—</span> : formatCurrency(mTot, 0)}
                                                        </td>
                                                    );
                                                }) : yearGroups.map((yg) => {
                                                    let yTot = 0;
                                                    for (const mk of yg.months) {
                                                        yTot += groupMonthTotal(mk);
                                                    }
                                                    return (
                                                        <td key={yg.year} className={`${numCell} px-3 py-2 text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-elevated)] group-hover/grp:bg-[var(--accent-subtle)] border-b border-r border-[var(--border)] last:border-r-0`}>
                                                            {yTot === 0 ? <span className="text-[var(--text-faint)]">—</span> : formatCurrency(yTot, 0)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        )}

                                        {isExpanded && groupRows.map((row) => {
                                            const pc = calcFor(row);
                                            const location = [row.pursuit.city, row.pursuit.state].filter(Boolean).join(', ');

                                            return (
                                                <tr key={row.pursuit.id} className="group/row bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] transition-colors">
                                                    <td className={`sticky left-0 z-10 bg-[var(--bg-card)] group-hover/row:bg-[var(--bg-elevated)] transition-colors py-2 pr-4 border-b border-r border-[var(--border)] ${isRegionBlocked ? 'pl-8' : 'pl-4'}`}>
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <Link
                                                                    href={`/pursuits/${row.pursuit.short_id}?tab=predev`}
                                                                    className="font-medium text-[var(--accent)] hover:underline truncate"
                                                                    title={row.pursuit.name}
                                                                >
                                                                    {row.pursuit.name}
                                                                </Link>
                                                                <ExternalLink className="w-3 h-3 text-[var(--text-faint)] opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0" />
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                                                {location && <span className="truncate">{location}</span>}
                                                                {location && row.stage && <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />}
                                                                {row.stage && <span className="truncate">{row.stage.name}</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className={`${numCell} px-4 py-2 text-xs font-semibold text-[var(--text-primary)] border-b border-r border-[var(--border)]`}>
                                                        {formatCurrency(pc.total, 0)}
                                                    </td>
                                                    <td className={`${numCell} px-4 py-2 text-xs font-semibold text-[var(--text-primary)] border-b border-r border-[var(--border)] bg-[var(--bg-elevated)]/60`}>
                                                        {pc.ltd === 0 ? <span className="text-[var(--text-faint)]">—</span> : formatCurrency(pc.ltd, 0)}
                                                    </td>
                                                    {viewMode === 'monthly' ? forwardMonths.map((mk) => {
                                                        const isPending = pendingMonths.has(mk);
                                                        const val = cellValue(row, mk);
                                                        if (val === null) {
                                                            return (
                                                                <td key={mk} className={`${numCell} px-3 py-2 text-xs font-medium text-[var(--text-faint)] border-b border-r border-[var(--border)] last:border-r-0 ${isPending ? 'bg-[var(--warning)]/5' : ''}`}>
                                                                    —
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td key={mk} className={`${numCell} px-3 py-2 text-xs font-medium border-b border-r border-[var(--border)] last:border-r-0 ${
                                                                isPending ? (val !== 0 ? 'text-[var(--warning)] bg-[var(--warning)]/10 font-bold' : 'text-[var(--warning)]/50 bg-[var(--warning)]/5') :
                                                                (val !== 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]')
                                                            }`}>
                                                                {val === 0 ? '—' : formatCurrency(val, 0)}
                                                            </td>
                                                        );
                                                    }) : yearGroups.map((yg) => {
                                                        let yTot = 0;
                                                        for (const mk of yg.months) {
                                                            const v = cellValue(row, mk);
                                                            if (v !== null) yTot += v;
                                                        }
                                                        return (
                                                            <td key={yg.year} className={`${numCell} px-3 py-2 text-xs font-semibold border-b border-r border-[var(--border)] last:border-r-0 ${yTot !== 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]'}`}>
                                                                {yTot === 0 ? '—' : formatCurrency(yTot, 0)}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                );
                            })}
                        <tfoot>
                            <tr className="text-[var(--bg-card)]">
                                <td className="sticky left-0 bottom-0 z-30 bg-[var(--text-primary)] px-4 py-3 border-r border-[var(--text-secondary)]">
                                    <span className="text-xs font-bold uppercase tracking-wider">Grand Total</span>
                                </td>
                                <td className={`${numCell} sticky bottom-0 z-20 bg-[var(--text-primary)] px-4 py-3 text-xs font-bold border-r border-[var(--text-secondary)]`}>
                                    {formatCurrency(overallGrandTotal, 0)}
                                </td>
                                <td className={`${numCell} sticky bottom-0 z-20 bg-[var(--text-primary)] px-4 py-3 text-xs font-bold border-r border-[var(--text-secondary)]`}>
                                    {overallGrandLtd === 0 ? '—' : formatCurrency(overallGrandLtd, 0)}
                                </td>
                                {viewMode === 'monthly' ? forwardMonths.map((mk) => {
                                    const mTot = grandTotalByMonth(mk);
                                    const isPending = pendingMonths.has(mk);
                                    return (
                                        <td key={mk} className={`${numCell} sticky bottom-0 z-20 bg-[var(--text-primary)] px-3 py-3 text-xs font-bold border-r border-[var(--text-secondary)] last:border-r-0 ${isPending ? 'text-[color-mix(in_srgb,var(--warning)_55%,var(--bg-card))]' : ''}`}>
                                            {mTot === 0 ? '—' : formatCurrency(mTot, 0)}
                                        </td>
                                    );
                                }) : yearGroups.map((yg) => {
                                    let yTot = 0;
                                    for (const mk of yg.months) {
                                        yTot += grandTotalByMonth(mk);
                                    }
                                    return (
                                        <td key={yg.year} className={`${numCell} sticky bottom-0 z-20 bg-[var(--text-primary)] px-3 py-3 text-xs font-bold border-r border-[var(--text-secondary)] last:border-r-0`}>
                                            {yTot === 0 ? '—' : formatCurrency(yTot, 0)}
                                        </td>
                                    );
                                })}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            )}
        </div>
    );
}
