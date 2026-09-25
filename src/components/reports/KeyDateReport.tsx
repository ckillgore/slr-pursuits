'use client';

import { Fragment, useMemo, useState, useCallback } from 'react';
import { useKeyDateReportData, useStages } from '@/hooks/useSupabaseQueries';
import type { KeyDateReportRow } from '@/lib/supabase/queries';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';
import type { ReportFieldKey } from '@/types';
import { useRegisterReportExport } from './ReportExportContext';
import type { TableExportSpec, ExportColumn, ExportRow } from '@/components/export/tableExport';
import {
    Loader2,
    Calendar,
    FileSpreadsheet,
    ChevronDown,
    ChevronUp,
    ArrowUpDown,
    X,
} from 'lucide-react';

const DEFAULT_COLUMNS: ReportFieldKey[] = [
    'kd_pursuit_name', 'kd_region', 'kd_stage',
    'kd_contract_execution', 'kd_inspection_period', 'kd_closing_date',
    'kd_next_date_label', 'kd_next_date_value', 'kd_next_date_days',
    'kd_total_dates', 'kd_overdue_count',
];

type SortConfig = { field: ReportFieldKey; direction: 'asc' | 'desc' } | null;

function isNumeric(type: string): boolean {
    return type === 'number' || type === 'currency' || type === 'percent';
}

/** Badge colours for days-until: this week, this month, later. */
function urgencyClass(days: number): string {
    if (days <= 7) return 'bg-[var(--danger-bg)] text-[var(--danger)]';
    if (days <= 30) return 'bg-[var(--warning-bg)] text-[var(--warning)]';
    return 'bg-[var(--accent-subtle)] text-[var(--accent)]';
}

export function KeyDateReport() {
    const { data: rows = [], isLoading } = useKeyDateReportData();
    const { data: stages = [] } = useStages();
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);
    const [groupBy, setGroupBy] = useState<'none' | 'region' | 'stage'>('none');
    const [filterRegion, setFilterRegion] = useState('');

    // Get unique regions for filter
    const regions = useMemo(() => {
        const set = new Set(rows.map(r => r.pursuit.region).filter(Boolean));
        return Array.from(set).sort();
    }, [rows]);

    // Filter
    const filtered = useMemo(() => {
        let result = rows;
        if (filterRegion) {
            result = result.filter(r => r.pursuit.region === filterRegion);
        }
        return result;
    }, [rows, filterRegion]);

    // Sort
    const sorted = useMemo(() => {
        if (!sortConfig) return filtered;
        const field = REPORT_FIELD_MAP[sortConfig.field];
        if (!field?.getKeyDateValue) return filtered;
        return [...filtered].sort((a, b) => {
            const aVal = field.getKeyDateValue!(a, stages);
            const bVal = field.getKeyDateValue!(b, stages);
            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
    }, [filtered, sortConfig, stages]);

    // Group
    const grouped = useMemo(() => {
        if (groupBy === 'none') return null;
        const groups = new Map<string, KeyDateReportRow[]>();
        for (const row of sorted) {
            const key = groupBy === 'region' ? (row.pursuit.region || 'Unassigned') : (row.stage?.name || 'No Stage');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(row);
        }
        return groups;
    }, [sorted, groupBy]);

    const handleSort = (field: ReportFieldKey) => {
        setSortConfig(prev =>
            prev?.field === field
                ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: 'asc' }
        );
    };

    // ── Export ──────────────────────────────────────────────────
    // Feeds the toolbar's XLSX/PDF buttons with this tab's rows, honoring the
    // active sort, grouping and region filter.
    const buildExportSpec = useCallback((): TableExportSpec => {
        const fields = DEFAULT_COLUMNS.map(key => REPORT_FIELD_MAP[key]).filter(Boolean);
        const columns: ExportColumn[] = fields.map(f => ({ label: f.label, type: f.type }));

        const cellsFor = (row: KeyDateReportRow) =>
            fields.map(f => (f.getKeyDateValue ? f.getKeyDateValue(row, stages) : null));

        const exportRows: ExportRow[] = [];
        if (grouped) {
            for (const [groupName, groupRows] of grouped.entries()) {
                exportRows.push({
                    kind: 'group',
                    cells: [`${groupName} (${groupRows.length})`, ...Array(columns.length - 1).fill(null)],
                });
                for (const row of groupRows) {
                    exportRows.push({ kind: 'data', cells: cellsFor(row), depth: 1 });
                }
            }
        } else {
            for (const row of sorted) {
                exportRows.push({ kind: 'data', cells: cellsFor(row) });
            }
        }

        const totalDatesAll = filtered.reduce((sum, r) => sum + r.totalDates, 0);
        const totalOverdueAll = filtered.reduce((sum, r) => sum + r.overdueCount, 0);
        const next = filtered
            .filter(r => r.nextDate)
            .sort((a, b) => new Date(a.nextDate!.date).getTime() - new Date(b.nextDate!.date).getTime())[0]?.nextDate;

        return {
            title: 'Key Dates Report',
            sheetName: 'Key Dates',
            fileBase: 'Key_Dates_Report',
            subtitle: [
                `${filtered.length} pursuit${filtered.length !== 1 ? 's' : ''}`,
                filterRegion ? `Region: ${filterRegion}` : 'All Regions',
                groupBy === 'none' ? 'Ungrouped' : `Grouped by ${groupBy === 'region' ? 'Region' : 'Stage'}`,
            ].join(' · '),
            columns,
            rows: exportRows,
            frozenCols: 1,
            metrics: [
                { label: 'Pursuits', value: String(filtered.length) },
                { label: 'Total Dates', value: String(totalDatesAll) },
                { label: 'Overdue', value: String(totalOverdueAll) },
                { label: 'Next Upcoming', value: next ? `${next.label} (${next.daysUntil}d)` : '—' },
            ],
        };
    }, [sorted, grouped, filtered, stages, groupBy, filterRegion]);

    useRegisterReportExport(isLoading || rows.length === 0 ? null : buildExportSpec);

    if (isLoading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <Calendar className="w-12 h-12 text-[var(--border-strong)] mb-3" />
                <p className="text-sm text-[var(--text-muted)] mb-1">No key dates found</p>
                <p className="text-xs text-[var(--text-faint)]">Add key dates to your pursuits to see them in reports.</p>
            </div>
        );
    }

    // Summary stats — follow the region filter, same as the grid and the export
    const totalDates = filtered.reduce((sum, r) => sum + r.totalDates, 0);
    const totalOverdue = filtered.reduce((sum, r) => sum + r.overdueCount, 0);
    const nextUpcoming = filtered
        .filter(r => r.nextDate)
        .sort((a, b) => new Date(a.nextDate!.date).getTime() - new Date(b.nextDate!.date).getTime())[0]?.nextDate;

    // First column stays pinned while the date columns scroll sideways.
    const stickyFirst = (ci: number, bg: string) =>
        ci === 0 ? `sticky left-0 z-[1] ${bg} border-r border-[var(--border)]` : '';

    const renderRow = (row: KeyDateReportRow, depth = 0) => (
        <tr key={row.pursuit.id} className="group/row hover:bg-[var(--bg-primary)] transition-colors">
            {DEFAULT_COLUMNS.map((colKey, ci) => {
                const field = REPORT_FIELD_MAP[colKey];
                if (!field) return <td key={colKey} />;
                const val = field.getKeyDateValue ? field.getKeyDateValue(row, stages) : null;
                const formatted = field.format(val);
                const base = `px-3 py-2 border-b border-[var(--table-row-border)] ${isNumeric(field.type) ? 'text-right' : ''} ${stickyFirst(ci, 'bg-[var(--bg-card)] group-hover/row:bg-[var(--bg-primary)]')}`;
                const indent = ci === 0 && depth > 0 ? { paddingLeft: `${12 + depth * 16}px` } : undefined;

                // Special styling for overdue count
                if (colKey === 'kd_overdue_count' && val && Number(val) > 0) {
                    return (
                        <td key={colKey} className={base} style={indent}>
                            <span className="text-xs font-medium tabular-nums px-1.5 py-0.5 rounded bg-[var(--danger-bg)] text-[var(--danger)]">
                                {formatted}
                            </span>
                        </td>
                    );
                }

                // Special styling for days until
                if (colKey === 'kd_next_date_days' && val !== null) {
                    const days = Number(val);
                    return (
                        <td key={colKey} className={base} style={indent}>
                            <span className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${urgencyClass(days)}`}>
                                {days === 0 ? 'Today' : `${formatted}d`}
                            </span>
                        </td>
                    );
                }

                return (
                    <td key={colKey} style={indent} className={`${base} text-xs whitespace-nowrap ${field.type === 'text' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] font-mono tabular-nums'}`}>
                        {formatted}
                    </td>
                );
            })}
        </tr>
    );

    return (
        <div>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="card text-center">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Pursuits</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{filtered.length}</p>
                </div>
                <div className="card text-center">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Total Dates</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{totalDates}</p>
                </div>
                <div className="card text-center">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Overdue</p>
                    <p className={`text-2xl font-bold ${totalOverdue > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{totalOverdue}</p>
                </div>
                <div className="card text-center">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Next Upcoming</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                        {nextUpcoming ? `${nextUpcoming.label} (${nextUpcoming.daysUntil}d)` : '—'}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as 'none' | 'region' | 'stage')}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
                >
                    <option value="none">No Grouping</option>
                    <option value="region">Group by Region</option>
                    <option value="stage">Group by Stage</option>
                </select>
                <select
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg border text-xs focus:border-[var(--accent)] focus:outline-none ${filterRegion
                        ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/30 text-[var(--accent)] font-medium'
                        : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]'
                        }`}
                >
                    <option value="">All Regions</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {filterRegion && (
                    <button
                        onClick={() => setFilterRegion('')}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                        <X className="w-3 h-3" />
                        Clear filter
                    </button>
                )}
                <span className="ml-auto text-xs text-[var(--text-faint)] tabular-nums">
                    {filterRegion ? `${filtered.length} of ${rows.length}` : filtered.length} pursuit{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table — scrolls inside its frame so the header row and Pursuit column stay pinned */}
            <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-card)]">
                <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full border-separate border-spacing-0">
                        <thead>
                            <tr>
                                {DEFAULT_COLUMNS.map((colKey, ci) => {
                                    const field = REPORT_FIELD_MAP[colKey];
                                    if (!field) return <th key={colKey} />;
                                    const isSorted = sortConfig?.field === colKey;
                                    return (
                                        <th
                                            key={colKey}
                                            onClick={() => handleSort(colKey)}
                                            aria-sort={isSorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                                            className={`group sticky top-0 ${ci === 0 ? 'left-0 z-20 border-r' : 'z-10'} bg-[var(--bg-elevated)] border-b border-[var(--border)] px-3 py-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap ${isNumeric(field.type) ? 'text-right' : 'text-left'}`}
                                        >
                                            <span className={`inline-flex items-center gap-1 ${isNumeric(field.type) ? 'flex-row-reverse' : ''}`}>
                                                {field.label}
                                                {isSorted ? (
                                                    sortConfig.direction === 'asc'
                                                        ? <ChevronUp className="w-3 h-3" />
                                                        : <ChevronDown className="w-3 h-3" />
                                                ) : (
                                                    <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                                                )}
                                            </span>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {grouped ? (
                                // Group header and rows share the outer table so the
                                // columns line up with the header (a nested table didn't).
                                Array.from(grouped.entries()).map(([groupName, groupRows]) => (
                                    <Fragment key={groupName}>
                                        <tr>
                                            <td className="sticky left-0 z-[1] px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border)] whitespace-nowrap">
                                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">{groupName}</span>
                                                <span className="ml-2 text-xs text-[var(--text-faint)] tabular-nums">({groupRows.length})</span>
                                            </td>
                                            <td colSpan={DEFAULT_COLUMNS.length - 1} className="bg-[var(--bg-primary)] border-b border-[var(--border)]" />
                                        </tr>
                                        {groupRows.map(r => renderRow(r, 1))}
                                    </Fragment>
                                ))
                            ) : (
                                sorted.map(r => renderRow(r))
                            )}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={DEFAULT_COLUMNS.length} className="px-3 py-12 text-center text-xs text-[var(--text-muted)]">
                                        No pursuits in {filterRegion || 'this region'}.{' '}
                                        <button onClick={() => setFilterRegion('')} className="text-[var(--accent)] hover:underline">Show all regions</button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Timeline across all pursuits */}
            {sorted.length > 0 && (
                <div className="mt-6 card">
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4">Portfolio Timeline</h3>
                    <div className="space-y-3">
                        {sorted
                            .filter(r => r.nextDate)
                            .sort((a, b) => new Date(a.nextDate!.date).getTime() - new Date(b.nextDate!.date).getTime())
                            .slice(0, 15)
                            .map(r => {
                                const days = r.nextDate!.daysUntil;
                                return (
                                    <div key={r.pursuit.id} className="flex items-center gap-3">
                                        <span className="w-36 truncate text-xs text-[var(--text-primary)] font-medium">{r.pursuit.name}</span>
                                        <div className="flex-1 h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${days <= 7 ? 'bg-[var(--danger)]' :
                                                        days <= 30 ? 'bg-[var(--warning)]' :
                                                            'bg-[var(--accent)]'
                                                    }`}
                                                style={{ width: `${Math.max(5, Math.min(100, 100 - days))}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-[var(--text-muted)] font-mono w-28 text-right">
                                            {r.nextDate!.label}
                                        </span>
                                        <span className={`text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded w-12 text-center ${urgencyClass(days)}`}>
                                            {days === 0 ? 'Today' : `${days}d`}
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}
        </div>
    );
}
