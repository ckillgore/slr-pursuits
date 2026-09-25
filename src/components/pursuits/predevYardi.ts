/**
 * Yardi-aware pre-dev budget helpers shared by the Pre-Dev Budget tab and the
 * pursuit Overview card, so both show the same Budget / Forecast / Variance.
 *
 * The per-cell forecast rule itself lives in @/lib/calculations/predevForecast
 * (also used by the portfolio Pre-Dev Budget report).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    fetchMonthlyJobCostAggregates,
    type YardiMonthlyCostAggregate,
} from '@/app/actions/accounting';
import { fetchPursuitAccountingEntities } from '@/lib/supabase/queries';
import { forecastCellValue, isMonthClosed, dedupeYardiAggs } from '@/lib/calculations/predevForecast';
import { resolvePursuitJobIds } from '@/components/pursuits/accountingJobs';
import type { PredevBudget, PredevBudgetLineItem } from '@/types';

// ── Yardi aggregates query ──────────────────────────────────

/**
 * Monthly Yardi job-cost aggregates for all of a pursuit's accounting entities, using the
 * same job rule as the Pursuit Costs tab (explicit job_id, else every job on the property).
 * Cached per pursuit + entity mapping, so switching between Overview and the Pre-Dev tab
 * doesn't refetch, and remapping an entity does.
 */
export function usePredevYardiAggregates(pursuitId: string, opts?: { enabled?: boolean }) {
    const enabled = !!pursuitId && (opts?.enabled ?? true);
    // Same key + fetcher as usePursuitAccountingEntities() (shared cache with the Costs tab);
    // declared here so it can be disabled until Yardi data is actually needed.
    const entitiesQuery = useQuery({
        queryKey: ['pursuit-accounting-entities'],
        queryFn: () => fetchPursuitAccountingEntities(),
        enabled,
    });
    const entities = useMemo(
        () => entitiesQuery.data?.filter((e) => e.pursuit_id === pursuitId),
        [entitiesQuery.data, pursuitId]
    );
    const entityKey = entities?.map((e) => `${e.property_code}:${e.job_id ?? '*'}`).sort().join(',') ?? '';

    const aggsQuery = useQuery({
        queryKey: ['predev-yardi-aggregates', pursuitId, entityKey] as const,
        queryFn: async (): Promise<YardiMonthlyCostAggregate[]> => {
            const jobIds = await resolvePursuitJobIds(entities ?? []);
            return jobIds.length ? fetchMonthlyJobCostAggregates(jobIds) : [];
        },
        enabled: enabled && entities !== undefined && entities.length > 0,
        staleTime: 5 * 60 * 1000,
    });

    const unmapped = entities !== undefined && entities.length === 0;
    return {
        data: unmapped ? EMPTY : aggsQuery.data,
        isLoading: enabled && !unmapped && (entitiesQuery.isLoading || aggsQuery.isLoading),
        isError: entitiesQuery.isError || aggsQuery.isError,
        refetch: () => (entitiesQuery.isError ? entitiesQuery.refetch() : aggsQuery.refetch()),
    };
}

const EMPTY: YardiMonthlyCostAggregate[] = [];

// ── Month range ─────────────────────────────────────────────

export function getMonthKeys(startDate: string, durationMonths: number): string[] {
    const keys: string[] = [];
    const [year, month] = startDate.split('-').map(Number);
    for (let i = 0; i < durationMonths; i++) {
        const m = ((month - 1 + i) % 12) + 1;
        const y = year + Math.floor((month - 1 + i) / 12);
        keys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return keys;
}

/**
 * Months shown on the budget grid: the configured budget range, extended to cover
 * any Yardi actuals and schedule items that fall outside it.
 */
export function predevMonthKeys(budget: PredevBudget, aggs: YardiMonthlyCostAggregate[]): string[] {
    const allMonths = new Set(getMonthKeys(budget.start_date, budget.duration_months));
    for (const agg of aggs) allMonths.add(agg.month);
    for (const item of budget.schedule_items ?? []) {
        if (!item.start_date) continue;
        const startMk = item.start_date.substring(0, 7);
        allMonths.add(startMk);
        if (item.duration_weeks > 0) {
            const monthsToAdd = Math.ceil(item.duration_weeks / 4.33);
            getMonthKeys(`${startMk}-01`, Math.max(1, monthsToAdd)).forEach((mk) => allMonths.add(mk));
        }
    }
    return Array.from(allMonths).sort();
}

// ── Yardi lookup ────────────────────────────────────────────

/**
 * code → month → amount, built from de-duplicated rows (see dedupeYardiAggs). Every row also
 * rolls up under a synthetic `__group_XX` key, so a mapped 2-digit group gets its detail codes
 * plus any spend posted with only the group code — the same rule as the portfolio report.
 */
export type YardiIndex = Map<string, Map<string, number>>;

export function buildYardiIndex(rawAggs: YardiMonthlyCostAggregate[]): YardiIndex {
    const aggs = dedupeYardiAggs(rawAggs);
    const map: YardiIndex = new Map();
    const add = (key: string, month: string, amount: number) => {
        let m = map.get(key);
        if (!m) { m = new Map(); map.set(key, m); }
        m.set(month, (m.get(month) ?? 0) + amount);
    };
    for (const agg of aggs) {
        add(agg.category_code, agg.month, agg.total_amount);
        add(`__group_${agg.category_code.substring(0, 2)}`, agg.month, agg.total_amount);
    }
    return map;
}

/** Yardi actual for a line item + month, or null when none of its mapped codes posted that month. */
export function yardiActualFor(index: YardiIndex, li: PredevBudgetLineItem, monthKey: string): number | null {
    if (!li.yardi_cost_groups?.length) return null;
    let total = 0;
    let hasData = false;
    for (const code of li.yardi_cost_groups) {
        // 2-digit group: its rollup; detail code: exact match
        const codeMap = index.get(code.length <= 2 ? `__group_${code}` : code);
        const v = codeMap?.get(monthKey);
        if (v !== undefined) { total += v; hasData = true; }
    }
    return hasData ? total : null;
}

// ── Unallocated Yardi costs ─────────────────────────────────

export interface UnallocatedYardiItem {
    code: string;
    name: string;
    total: number;
}

/**
 * Yardi codes with activity that no line item maps (directly or via its 2-digit group),
 * including spend posted with only a group code.
 */
export function computeUnallocated(rawAggs: YardiMonthlyCostAggregate[], lineItems: PredevBudgetLineItem[]) {
    const aggs = dedupeYardiAggs(rawAggs);
    const byMonth = new Map<string, number>();
    const itemMap = new Map<string, UnallocatedYardiItem>();
    if (!aggs.length || !lineItems.length) return { byMonth, items: [] as UnallocatedYardiItem[], total: 0 };

    const coveredCodes = new Set<string>();
    const coveredGroups = new Set<string>();
    for (const li of lineItems) {
        for (const code of li.yardi_cost_groups ?? []) {
            if (code.length <= 2) coveredGroups.add(code);
            else coveredCodes.add(code);
        }
    }

    let total = 0;
    for (const agg of aggs) {
        // Group rollups that duplicate detail rows were already dropped by dedupeYardiAggs
        if (coveredGroups.has(agg.category_code.substring(0, 2)) || coveredCodes.has(agg.category_code)) continue;
        byMonth.set(agg.month, (byMonth.get(agg.month) ?? 0) + agg.total_amount);
        total += agg.total_amount;
        const existing = itemMap.get(agg.category_code);
        if (existing) existing.total += agg.total_amount;
        else itemMap.set(agg.category_code, { code: agg.category_code, name: agg.category_name, total: agg.total_amount });
    }
    const items = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);
    return { byMonth, items, total };
}

/** Total Yardi spend across all cost groups (group rollup rows only, so nothing is counted twice). */
export function yardiGrandTotal(aggs: YardiMonthlyCostAggregate[]): number {
    return aggs.reduce((s, a) => (a.category_code.length === 2 ? s + a.total_amount : s), 0);
}

// ── Summary totals ──────────────────────────────────────────

/**
 * Original budget (snapshot, or projected when no snapshot exists) and Yardi-aware
 * forecast totals. Forecast includes unallocated Yardi spend, same as the budget grid.
 */
export function summarizePredevTotals({
    lineItems, monthKeys, snapshot, index, unallocatedTotal, today,
}: {
    lineItems: PredevBudgetLineItem[];
    monthKeys: string[];
    snapshot: PredevBudget['budget_snapshot'];
    index: YardiIndex;
    unallocatedTotal: number;
    today: Date;
}) {
    let totalBudget = 0;
    let totalForecast = 0;
    const closed = new Map(monthKeys.map((mk) => [mk, isMonthClosed(mk, today)]));
    for (const li of lineItems) {
        for (const mk of monthKeys) {
            const cell = li.monthly_values[mk] ?? { projected: 0, actual: null };
            totalBudget += snapshot ? (snapshot[li.id]?.[mk] ?? 0) : cell.projected;
            totalForecast += forecastCellValue(cell, yardiActualFor(index, li, mk), closed.get(mk)!);
        }
    }
    totalForecast += unallocatedTotal;
    return { totalBudget, totalForecast, totalVariance: totalForecast - totalBudget };
}

/** One-call summary for places (like the Overview card) that don't already hold the grid's pieces. */
export function summarizePredevBudget(budget: PredevBudget, aggs: YardiMonthlyCostAggregate[], today: Date) {
    const lineItems = budget.line_items ?? [];
    return {
        ...summarizePredevTotals({
            lineItems,
            monthKeys: predevMonthKeys(budget, aggs),
            snapshot: budget.budget_snapshot,
            index: buildYardiIndex(aggs),
            unallocatedTotal: computeUnallocated(aggs, lineItems).total,
            today,
        }),
        yardiTotal: yardiGrandTotal(aggs),
        hasSnapshot: !!budget.budget_snapshot,
    };
}

// ── Mapping overlap (double counting) ───────────────────────

/** Do two mapped codes capture any of the same transactions? */
export function codesOverlap(a: string, b: string): boolean {
    if (a === b) return true;
    if (a.length <= 2 && b.length > 2) return b.substring(0, 2) === a;
    if (b.length <= 2 && a.length > 2) return a.substring(0, 2) === b;
    return false;
}

/**
 * Label of another line item whose mapping already captures `code`, or null.
 * Mapping the same transactions on two line items double counts their actuals.
 */
export function findConflictingLineItem(
    code: string,
    others: Pick<PredevBudgetLineItem, 'id' | 'label' | 'yardi_cost_groups'>[],
): { label: string; code: string } | null {
    for (const li of others) {
        for (const c of li.yardi_cost_groups ?? []) {
            if (codesOverlap(code, c)) return { label: li.label, code: c };
        }
    }
    return null;
}

/** Every pair of line items whose mappings overlap — shown as a warning on the budget grid. */
export function findMappingOverlaps(lineItems: PredevBudgetLineItem[]): { code: string; labels: string[] }[] {
    const out: { code: string; labels: string[] }[] = [];
    for (let i = 0; i < lineItems.length; i++) {
        const a = lineItems[i];
        const codesA = a.yardi_cost_groups ?? [];
        // Within one line item: a group plus one of its own detail codes
        for (const c of codesA) {
            if (c.length > 2 && codesA.includes(c.substring(0, 2))) out.push({ code: c, labels: [a.label] });
        }
        for (let j = i + 1; j < lineItems.length; j++) {
            const b = lineItems[j];
            for (const c of codesA) {
                const hit = (b.yardi_cost_groups ?? []).find((d) => codesOverlap(c, d));
                if (hit) out.push({ code: c.length > hit.length ? c : hit, labels: [a.label, b.label] });
            }
        }
    }
    return out;
}
