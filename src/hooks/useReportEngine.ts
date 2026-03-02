'use client';

/**
 * useReportEngine — Pure logic hook that takes raw ReportRow data + config,
 * returns a filtered, grouped, sorted tree structure for rendering.
 */
import { useMemo } from 'react';
import type { ReportConfig, ReportFieldKey, PursuitStage } from '@/types';
import type { ReportRow } from '@/lib/supabase/queries';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';

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
            const filterVal = filter.value.toLowerCase();

            switch (filter.operator) {
                case 'equals': return strValue === filterVal;
                case 'not_equals': return strValue !== filterVal;
                case 'contains': return strValue.includes(filterVal);
                case 'gt': return Number(rawValue) > Number(filter.value);
                case 'lt': return Number(rawValue) < Number(filter.value);
                case 'gte': return Number(rawValue) >= Number(filter.value);
                case 'lte': return Number(rawValue) <= Number(filter.value);
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

            let sum = 0;
            let count = 0;
            for (const row of rows) {
                const v = fieldDef.getValue(row, stages);
                if (v !== null && v !== '' && !isNaN(Number(v))) {
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
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
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
