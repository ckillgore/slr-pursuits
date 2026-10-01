'use client';

/**
 * useReportEngine — Pure logic hook that takes raw ReportRow data + config,
 * returns a filtered, grouped, sorted tree structure for rendering.
 */
import { useMemo } from 'react';
import type { ReportConfig, ReportFieldKey, PursuitStage } from '@/types';
import type { ReportRow } from '@/lib/supabase/queries';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';
import { isOnePagerComplete } from '@/lib/onePagerStatus';

const ONE_PAGER_CATEGORIES = new Set(['One-Pager', 'Returns', 'Budget', 'Revenue', 'OpEx', 'Assumptions']);

// ── Tree node for grouped report ──────────────────────────────
export interface GroupNode {
    label: string;
    field: ReportFieldKey;
    value: string;
    children: GroupNode[];
    rows: ReportRow[];
    aggregates: Record<string, number | null>;
}

// ── Apply filters ─────────────────────────────────────────────
function applyFilters(rows: ReportRow[], config: ReportConfig, stages?: PursuitStage[]): ReportRow[] {
    if (!config.filters || config.filters.length === 0) return rows;

    return rows.filter(row => {
        return config.filters.every(filter => {
            const fieldDef = REPORT_FIELD_MAP[filter.field];
            if (!fieldDef) return true;

            const rawValue = fieldDef.getValue(row, stages);
            const strValue = rawValue != null ? String(rawValue).toLowerCase() : '';
            const filterVal = (filter.value ?? '').toLowerCase();
            // Numeric comparisons: empty/null values must not coerce to 0 and match
            const isNumericOp = filter.operator === 'gt' || filter.operator === 'lt' || filter.operator === 'gte' || filter.operator === 'lte';
            if (isNumericOp) {
                if (rawValue == null || rawValue === '' || filter.value == null || filter.value.trim() === '') return false;
                const a = Number(rawValue);
                const b = Number(filter.value);
                if (isNaN(a) || isNaN(b)) return false;
                switch (filter.operator) {
                    case 'gt': return a > b;
                    case 'lt': return a < b;
                    case 'gte': return a >= b;
                    case 'lte': return a <= b;
                }
            }

            switch (filter.operator) {
                case 'equals': return strValue === filterVal;
                case 'not_equals': return strValue !== filterVal;
                case 'contains': return strValue.includes(filterVal);
                case 'in': {
                    const vals = (filter.values ?? []).map(v => v.toLowerCase());
                    return vals.length === 0 || vals.includes(strValue);
                }
                default: return true;
            }
        });
    });
}

// ── Build group tree ──────────────────────────────────────────
function buildGroupTree(
    rows: ReportRow[],
    groupByFields: ReportFieldKey[],
    depth: number,
    stages?: PursuitStage[],
): GroupNode[] {
    if (depth >= groupByFields.length || groupByFields.length === 0) {
        return [];
    }

    const fieldKey = groupByFields[depth];
    const fieldDef = REPORT_FIELD_MAP[fieldKey];
    if (!fieldDef) return [];

    // Group rows by the current field's value
    const groups = new Map<string, ReportRow[]>();
    for (const row of rows) {
        const rawValue = fieldDef.getValue(row, stages);
        const key = rawValue != null && rawValue !== '' ? String(rawValue) : '(Empty)';
        const list = groups.get(key) || [];
        list.push(row);
        groups.set(key, list);
    }

    // Sort group keys alphabetically
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

    return sortedKeys.map(key => {
        const groupRows = groups.get(key)!;
        const children = buildGroupTree(groupRows, groupByFields, depth + 1, stages);
        // Only leaf groups have rows
        const leafRows = depth === groupByFields.length - 1 ? groupRows : [];

        return {
            label: key,
            field: fieldKey,
            value: key,
            children,
            rows: leafRows,
            aggregates: computeAggregates(groupRows, stages),
        };
    });
}

// ── Compute aggregates for numeric columns ────────────────────
function computeAggregates(
    rows: ReportRow[],
    stages?: PursuitStage[],
): Record<string, number | null> {
    const agg: Record<string, number | null> = {};
    // We aggregate all numeric/currency/percent fields
    for (const [key, fieldDef] of Object.entries(REPORT_FIELD_MAP)) {
        if (fieldDef.type === 'number' || fieldDef.type === 'currency' || fieldDef.type === 'percent') {
            // Determine aggregation mode: explicit override, or default by type
            const mode = fieldDef.aggregation ?? (fieldDef.type === 'percent' ? 'avg' : 'sum');
            if (mode === 'none') continue;

            // Incomplete one-pagers (no units / hard cost / land cost) would drag averages
            // and inflate totals with placeholder values; their rows still display
            const fromOnePager = ONE_PAGER_CATEGORIES.has(fieldDef.category);
            let sum = 0;
            let count = 0;
            for (const row of rows) {
                if (fromOnePager && row.onePager && !isOnePagerComplete(row.onePager)) continue;
                const v = fieldDef.getValue(row, stages);
                if (v != null && v !== '' && !isNaN(Number(v))) {
                    sum += Number(v);
                    count++;
                }
            }
            agg[key] = count > 0 ? (mode === 'avg' ? sum / count : sum) : null;
        }
    }
    agg['_count'] = rows.length;
    return agg;
}

// ── Sort rows ─────────────────────────────────────────────────
function applySorting(rows: ReportRow[], config: ReportConfig, stages?: PursuitStage[]): ReportRow[] {
    if (!config.sortBy) return rows;

    const fieldDef = REPORT_FIELD_MAP[config.sortBy.field];
    if (!fieldDef) return rows;

    const dir = config.sortBy.direction === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
        const va = fieldDef.getValue(a, stages);
        const vb = fieldDef.getValue(b, stages);
        // Nulls/empties always sort last regardless of direction
        const aEmpty = va == null || va === '';
        const bEmpty = vb == null || vb === '';
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
    });
}

// ── Main hook ─────────────────────────────────────────────────
export interface ReportEngineResult {
    filteredRows: ReportRow[];
    groupTree: GroupNode[];
    totalAggregates: Record<string, number | null>;
    isGrouped: boolean;
}

export function useReportEngine(
    data: ReportRow[] | undefined,
    config: ReportConfig,
    stages?: PursuitStage[],
): ReportEngineResult {
    return useMemo(() => {
        if (!data || data.length === 0) {
            return {
                filteredRows: [],
                groupTree: [],
                totalAggregates: { _count: 0 },
                isGrouped: false,
            };
        }

        // 1. Filter
        const filtered = applyFilters(data, config, stages);

        // 2. Sort
        const sorted = applySorting(filtered, config, stages);

        // 3. Group
        const isGrouped = config.groupBy.length > 0;
        const groupTree = isGrouped
            ? buildGroupTree(sorted, config.groupBy, 0, stages)
            : [];

        // 4. Total aggregates
        const totalAggregates = computeAggregates(sorted, stages);

        return {
            filteredRows: sorted,
            groupTree,
            totalAggregates,
            isGrouped,
        };
    }, [data, config, stages]);
}
