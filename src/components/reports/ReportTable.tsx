'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import type { ReportConfig, ReportFieldKey, PursuitStage } from '@/types';
import type { ReportRow } from '@/lib/supabase/queries';
import type { GroupNode } from '@/hooks/useReportEngine';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';
import type { ReportFieldDef } from '@/lib/reportFields';

interface ReportTableProps {
    config: ReportConfig;
    groupTree: GroupNode[];
    flatRows: ReportRow[];
    isGrouped: boolean;
    totalAggregates: Record<string, number | null>;
    stages?: PursuitStage[];
    onSort: (field: ReportFieldKey) => void;
    editMode?: boolean;
    onCellEdit?: (row: ReportRow, field: ReportFieldDef, rawValue: string | number | null) => void;
}

// ── Inline edit cell ────────────────────────────────
function EditableCell({
    row,
    col,
    stages,
    editMode,
    onCellEdit,
    allRows,
}: {
    row: ReportRow;
    col: ReportFieldDef;
    stages?: PursuitStage[];
    editMode?: boolean;
    onCellEdit?: (row: ReportRow, field: ReportFieldDef, rawValue: string | number | null) => void;
    allRows: ReportRow[];
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const selectRef = useRef<HTMLSelectElement>(null);

    const currentValue = col.getValue(row, stages);
    const formatted = col.format(currentValue);
    const isEditable = editMode && col.editable && col.editTarget && col.dbColumn;

    // Compute options for dropdown fields
    const hasOptions = isEditable && col.editOptions;
    const options = useMemo(() => {
        if (!hasOptions) return null;
        if (Array.isArray(col.editOptions)) return col.editOptions;
        // Dynamic: derive unique values from all rows for this field
        const vals = new Set<string>();
        for (const r of allRows) {
            const v = col.getValue(r, stages);
            if (v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '—') {
                vals.add(String(v));
            }
        }
        return [...vals].sort();
    }, [hasOptions, col, allRows, stages]);

    const startEdit = useCallback(() => {
        if (!isEditable) return;
        // Prepare raw value for editing
        let editableValue = '';
        if (currentValue !== null && currentValue !== undefined) {
            if (col.type === 'percent' && typeof currentValue === 'number') {
                // Convert decimal to percentage for editing (0.05 → 5)
                editableValue = String(Math.round(currentValue * 10000) / 100);
            } else if (col.type === 'date' && typeof currentValue === 'string') {
                // Format as YYYY-MM-DD for date input
                editableValue = currentValue.split('T')[0];
            } else {
                editableValue = String(currentValue);
            }
        }
        setDraft(editableValue);
        setEditing(true);
    }, [isEditable, currentValue, col.type]);

    useEffect(() => {
        if (editing) {
            if (options && selectRef.current) {
                selectRef.current.focus();
            } else if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select();
            }
        }
    }, [editing, options]);

    const commit = useCallback(() => {
        setEditing(false);
        if (!onCellEdit || !col.dbColumn || !col.editTarget) return;
        const trimmed = draft.trim();
        if (trimmed === '' && currentValue === null) return; // no change
        if (trimmed === String(currentValue)) return; // no change

        let rawValue: string | number | null;
        if (trimmed === '') {
            rawValue = null;
        } else if (col.type === 'number' || col.type === 'currency') {
            // Strip $ , formatting
            const num = parseFloat(trimmed.replace(/[$,]/g, ''));
            rawValue = isNaN(num) ? null : num;
        } else if (col.type === 'percent') {
            // User enters "5" meaning 5%, store as decimal
            const num = parseFloat(trimmed.replace(/%/g, ''));
            rawValue = isNaN(num) ? null : num / 100;
        } else {
            rawValue = trimmed;
        }
        onCellEdit(row, col, rawValue);
    }, [draft, currentValue, col, row, onCellEdit]);

    const cancel = useCallback(() => {
        setEditing(false);
    }, []);

    if (editing) {
        // Dropdown select for fields with options
        if (options) {
            return (
                <select
                    ref={selectRef}
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        // Auto-commit on select change
                        setEditing(false);
                        if (onCellEdit && col.dbColumn && col.editTarget) {
                            const val = e.target.value || null;
                            onCellEdit(row, col, val);
                        }
                    }}
                    onBlur={cancel}
                    onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
                    className="w-full px-1 py-0.5 text-xs rounded border border-[var(--accent)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ minWidth: '70px' }}
                >
                    <option value="">—</option>
                    {options.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            );
        }

        // Regular text/number/date input
        return (
            <input
                ref={inputRef}
                type={col.type === 'date' ? 'date' : 'text'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') cancel();
                }}
                className="w-full px-1.5 py-0.5 text-xs rounded border border-[var(--accent)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] tabular-nums"
                style={{ minWidth: '60px' }}
            />
        );
    }

    // Pursuit name link
    if (col.key === 'pursuit_name') {
        return (
            <Link href={`/pursuits/${(row.pursuit as any).short_id || row.pursuit.id}`} className="text-[var(--accent)] hover:underline font-medium">
                {formatted}
            </Link>
        );
    }

    // Sale comp / land comp name link
    if (col.key === 'sc_name' && row.saleComp) {
        return (
            <Link href={`/comps/sales/${(row.saleComp as any).short_id || row.saleComp.id}`} className="text-[var(--accent)] hover:underline font-medium">
                {formatted}
            </Link>
        );
    }
    if (col.key === 'comp_name' && row.comp) {
        return (
            <Link href={`/comps/${(row.comp as any).short_id || row.comp.id}`} className="text-[var(--accent)] hover:underline font-medium">
                {formatted}
            </Link>
        );
    }

    return (
        <span
            onClick={isEditable ? startEdit : undefined}
            className={isEditable ? 'cursor-pointer hover:bg-[var(--accent-subtle)] hover:outline hover:outline-1 hover:outline-dashed hover:outline-[var(--accent)]/40 rounded px-0.5 -mx-0.5 transition-colors' : undefined}
        >
            {formatted}
        </span>
    );
}

export function ReportTable({
    config,
    groupTree,
    flatRows,
    isGrouped,
    totalAggregates,
    stages,
    onSort,
    editMode,
    onCellEdit,
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
        <tr key={`row-${row.pursuit.id}-${idx}`} className="block md:table-row bg-[var(--bg-card)] md:bg-transparent hover:bg-[var(--bg-primary)] transition-colors border border-[var(--border)] md:border-0 mb-4 md:mb-0 rounded-lg md:rounded-none overflow-hidden hover:shadow-sm md:hover:shadow-none">
            {columns.map((col, ci) => (
                <td
                    key={col.key}
                    className={`flex justify-between items-center md:table-cell px-3 py-2 text-xs text-[var(--text-secondary)] border-b border-[var(--table-row-border)] ${col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'md:text-right tabular-nums' : ''
                        }`}
                    style={ci === 0 ? { paddingLeft: `${depth * 24 + 12}px` } : undefined}
                >
                    <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wide mr-4">{col.label}</span>
                    <EditableCell
                        row={row}
                        col={col}
                        stages={stages}
                        editMode={editMode}
                        onCellEdit={onCellEdit}
                        allRows={flatRows}
                    />
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
            <tr key={`group-${path}`} className="block md:table-row bg-[var(--bg-primary)] hover:bg-[var(--table-row-border)] cursor-pointer transition-colors border border-[var(--border)] md:border-0 mb-3 md:mb-0 rounded-lg md:rounded-none overflow-hidden" onClick={() => toggleCollapse(path)}>
                <td
                    className="block md:table-cell px-3 py-2 text-xs font-semibold text-[var(--text-primary)] border-b border-[var(--border)]"
                    style={{ paddingLeft: `${depth * 24 + 8}px` }}
                    colSpan={1}
                >
                    <span className="inline-flex items-center gap-1.5">
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                        <span className="text-[10px] text-[var(--text-faint)] font-normal uppercase whitespace-nowrap">{fieldLabel}:</span>
                        <span className="truncate">{node.label}</span>
                        <span className="text-[10px] text-[var(--text-faint)] font-normal ml-1">({count})</span>
                    </span>
                </td>
                {columns.slice(1).map(col => (
                    <td
                        key={col.key}
                        className={`flex justify-between items-center md:table-cell px-3 py-2 text-[10px] text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap ${col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'md:text-right tabular-nums' : ''
                            }`}
                    >
                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[10px] uppercase tracking-wide mr-4">{col.label}</span>
                        <span>
                            {node.aggregates[col.key] !== undefined && node.aggregates[col.key] !== null
                                ? formatAggregate(col.key, node.aggregates[col.key])
                                : ''}
                        </span>
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
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] md:bg-transparent p-2 md:p-0">
            <table className="w-full min-w-full md:min-w-max block md:table">
                <thead className="hidden md:table-header-group sticky top-0 z-10">
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
                <tbody className="block md:table-row-group">
                    {isGrouped ? (
                        groupTree.flatMap(node => renderGroup(node, 0, ''))
                    ) : (
                        flatRows.map((row, idx) => renderRow(row, 0, idx))
                    )}

                    {/* Totals row */}
                    <tr className="block md:table-row bg-[var(--bg-elevated)] font-semibold border border-[var(--border)] md:border-0 mt-4 md:mt-0 rounded-lg md:rounded-none overflow-hidden">
                        {columns.map((col, ci) => (
                            <td
                                key={col.key}
                                className={`flex justify-between items-center md:table-cell px-3 py-2 text-[11px] text-[var(--text-primary)] border-b border-[var(--border)] md:border-b-0 md:border-t-2 md:whitespace-nowrap ${col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'md:text-right tabular-nums' : ''
                                    }`}
                            >
                                <span className="md:hidden font-semibold text-[var(--text-muted)] text-[10px] uppercase tracking-wide mr-4">{col.label}</span>
                                <span>
                                    {ci === 0 && !totalAggregates[col.key]
                                        ? `Total (${totalAggregates['_count'] ?? 0})`
                                        : totalAggregates[col.key] !== undefined && totalAggregates[col.key] !== null
                                            ? formatAggregate(col.key, totalAggregates[col.key])
                                            : ''}
                                </span>
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
