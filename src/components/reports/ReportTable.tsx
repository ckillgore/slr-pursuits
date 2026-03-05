'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import type { ReportConfig, ReportFieldKey, PursuitStage } from '@/types';
import type { ReportRow } from '@/lib/supabase/queries';
import type { GroupNode } from '@/hooks/useReportEngine';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';

interface ReportTableProps {
    config: ReportConfig;
    groupTree: GroupNode[];
    flatRows: ReportRow[];
    isGrouped: boolean;
    totalAggregates: Record<string, number | null>;
    stages?: PursuitStage[];
    onSort: (field: ReportFieldKey) => void;
}

export function ReportTable({
    config,
    groupTree,
    flatRows,
    isGrouped,
    totalAggregates,
    stages,
    onSort,
}: ReportTableProps) {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggleCollapse = (path: string) => {
        const next = new Set(collapsed);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        setCollapsed(next);
    };

    const columns = config.columns
        .map(key => REPORT_FIELD_MAP[key])
        .filter(Boolean);

    if (columns.length === 0) {
        return (
            <div className="flex items-center justify-center py-16 text-sm text-[var(--text-faint)]">
                Select columns from the configuration panel to build your report.
            </div>
        );
    }

    const formatAggregate = (key: string, value: number | null) => {
        if (value === null) return '—';
        const field = REPORT_FIELD_MAP[key as ReportFieldKey];
        if (!field) return String(value);
        return field.format(value);
    };

    // Render a data row
    const renderRow = (row: ReportRow, depth: number, idx: number) => (
        <tr key={`row-${row.pursuit.id}-${idx}`} className="hover:bg-[var(--bg-primary)] transition-colors">
            {columns.map((col, ci) => (
                <td
                    key={col.key}
                    className={`px-3 py-2 text-xs text-[var(--text-secondary)] border-b border-[var(--table-row-border)] whitespace-nowrap ${col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'text-right tabular-nums' : ''
                        }`}
                    style={ci === 0 ? { paddingLeft: `${depth * 24 + 12}px` } : undefined}
                >
                    {col.key === 'pursuit_name' ? (
                        <Link href={`/pursuits/${row.pursuit.short_id || row.pursuit.id}`} className="text-[var(--accent)] hover:underline font-medium">
                            {col.format(col.getValue(row, stages))}
                        </Link>
                    ) : (
                        col.format(col.getValue(row, stages))
                    )}
                </td>
            ))}
        </tr>
    );

    // Render a group header + its children/rows
    const renderGroup = (node: GroupNode, depth: number, parentPath: string): React.JSX.Element[] => {
        const path = `${parentPath}/${node.value}`;
        const isCollapsed = collapsed.has(path);
        const fieldLabel = REPORT_FIELD_MAP[node.field]?.label ?? node.field;
        const count = node.aggregates['_count'] ?? 0;

        const elements: React.JSX.Element[] = [];

        // Group header row
        elements.push(
            <tr key={`group-${path}`} className="bg-[var(--bg-primary)] hover:bg-[var(--table-row-border)] cursor-pointer transition-colors" onClick={() => toggleCollapse(path)}>
                <td
                    className="px-3 py-2 text-xs font-semibold text-[var(--text-primary)] border-b border-[var(--border)] whitespace-nowrap"
                    style={{ paddingLeft: `${depth * 24 + 8}px` }}
                    colSpan={1}
                >
                    <span className="inline-flex items-center gap-1.5">
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                        <span className="text-[10px] text-[var(--text-faint)] font-normal uppercase">{fieldLabel}:</span>
                        {node.label}
                        <span className="text-[10px] text-[var(--text-faint)] font-normal ml-1">({count})</span>
                    </span>
                </td>
                {columns.slice(1).map(col => (
                    <td
                        key={col.key}
                        className={`px-3 py-2 text-[10px] text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap ${col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'text-right tabular-nums' : ''
                            }`}
                    >
                        {node.aggregates[col.key] !== undefined && node.aggregates[col.key] !== null
                            ? formatAggregate(col.key, node.aggregates[col.key])
                            : ''}
                    </td>
                ))}
            </tr>
        );

        if (!isCollapsed) {
            // Render child groups
            for (const child of node.children) {
                elements.push(...renderGroup(child, depth + 1, path));
            }
            // Render leaf rows
            for (let i = 0; i < node.rows.length; i++) {
                elements.push(renderRow(node.rows[i], depth + 1, i));
            }
        }

        return elements;
    };

    return (
        <div className="overflow-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-max">
                <thead className="sticky top-0 z-10">
                    <tr className="bg-[var(--bg-primary)]">
                        {columns.map(col => (
                            <th
                                key={col.key}
                                className={`px-3 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)] whitespace-nowrap cursor-pointer hover:text-[var(--text-secondary)] transition-colors select-none ${col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'text-right' : 'text-left'
                                    }`}
                                onClick={() => onSort(col.key)}
                            >
                                <span className="inline-flex items-center gap-1">
                                    {col.label}
                                    {config.sortBy?.field === col.key && (
                                        <ArrowUpDown className="w-3 h-3 text-[var(--accent)]" />
                                    )}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {isGrouped ? (
                        groupTree.flatMap(node => renderGroup(node, 0, ''))
                    ) : (
                        flatRows.map((row, idx) => renderRow(row, 0, idx))
                    )}

                    {/* Totals row */}
                    <tr className="bg-[var(--bg-elevated)] font-semibold">
                        {columns.map((col, ci) => (
                            <td
                                key={col.key}
                                className={`px-3 py-2 text-[11px] text-[var(--text-primary)] border-t-2 border-[var(--border)] whitespace-nowrap ${col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'text-right tabular-nums' : ''
                                    }`}
                            >
                                {ci === 0 && !totalAggregates[col.key]
                                    ? `Total (${totalAggregates['_count'] ?? 0})`
                                    : totalAggregates[col.key] !== undefined && totalAggregates[col.key] !== null
                                        ? formatAggregate(col.key, totalAggregates[col.key])
                                        : ''}
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
