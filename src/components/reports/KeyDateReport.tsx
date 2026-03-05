'use client';

import { useMemo, useState } from 'react';
import { useKeyDateReportData, useStages } from '@/hooks/useSupabaseQueries';
import type { KeyDateReportRow } from '@/lib/supabase/queries';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';
import type { ReportFieldKey } from '@/types';
import {
    Loader2,
    Calendar,
    FileSpreadsheet,
    ChevronDown,
    ChevronUp,
    ArrowUpDown,
    AlertTriangle,
    Sparkles,
} from 'lucide-react';

const DEFAULT_COLUMNS: ReportFieldKey[] = [
    'kd_pursuit_name', 'kd_region', 'kd_stage',
    'kd_contract_execution', 'kd_inspection_period', 'kd_closing_date',
    'kd_next_date_label', 'kd_next_date_value', 'kd_next_date_days',
    'kd_total_dates', 'kd_overdue_count',
];

type SortConfig = { field: ReportFieldKey; direction: 'asc' | 'desc' } | null;

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

    // Summary stats
    const totalDates = rows.reduce((sum, r) => sum + r.totalDates, 0);
    const totalOverdue = rows.reduce((sum, r) => sum + r.overdueCount, 0);
    const nextUpcoming = rows
        .filter(r => r.nextDate)
        .sort((a, b) => new Date(a.nextDate!.date).getTime() - new Date(b.nextDate!.date).getTime())[0]?.nextDate;

    const renderRow = (row: KeyDateReportRow) => (
        <tr key={row.pursuit.id} className="border-b border-[var(--table-row-border)] hover:bg-[var(--bg-primary)] transition-colors">
            {DEFAULT_COLUMNS.map(colKey => {
                const field = REPORT_FIELD_MAP[colKey];
                if (!field) return <td key={colKey} />;
                const val = field.getKeyDateValue ? field.getKeyDateValue(row, stages) : null;
                const formatted = field.format(val);

                // Special styling for overdue count
                if (colKey === 'kd_overdue_count' && val && Number(val) > 0) {
                    return (
                        <td key={colKey} className="px-3 py-2">
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--danger-bg)] text-[var(--danger)]">
                                {formatted}
                            </span>
                        </td>
                    );
                }

                // Special styling for days until
                if (colKey === 'kd_next_date_days' && val !== null) {
                    const days = Number(val);
                    return (
                        <td key={colKey} className="px-3 py-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${days <= 7 ? 'bg-[var(--danger-bg)] text-[var(--danger)]' :
                                    days <= 30 ? 'bg-[#FFF8E1] text-[#CA8A04]' :
                                        'bg-[var(--accent-subtle)] text-[var(--accent)]'
                                }`}>
                                {days === 0 ? 'Today' : `${formatted}d`}
                            </span>
                        </td>
                    );
                }

                return (
                    <td key={colKey} className={`px-3 py-2 text-xs ${field.type === 'text' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] font-mono tabular-nums'}`}>
                        {formatted}
                    </td>
                );
            })}
        </tr>
    );

    return (
        <div>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="card text-center">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Pursuits</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{rows.length}</p>
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
            <div className="flex items-center gap-3 mb-4">
                <select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
                >
                    <option value="none">No Grouping</option>
                    <option value="region">Group by Region</option>
                    <option value="stage">Group by Stage</option>
                </select>
                <select
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
                >
                    <option value="">All Regions</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="ml-auto text-xs text-[var(--text-faint)]">
                    {filtered.length} pursuit{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-card)]">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-[var(--bg-elevated)]">
                                {DEFAULT_COLUMNS.map(colKey => {
                                    const field = REPORT_FIELD_MAP[colKey];
                                    if (!field) return <th key={colKey} />;
                                    const isSorted = sortConfig?.field === colKey;
                                    return (
                                        <th
                                            key={colKey}
                                            onClick={() => handleSort(colKey)}
                                            className="px-3 py-2 text-left text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
                                        >
                                            <span className="flex items-center gap-1">
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
                                Array.from(grouped.entries()).map(([groupName, groupRows]) => (
                                    <tr key={groupName}>
                                        <td colSpan={DEFAULT_COLUMNS.length}>
                                            <div className="px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border)]">
                                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">{groupName}</span>
                                                <span className="ml-2 text-xs text-[var(--text-faint)]">({groupRows.length})</span>
                                            </div>
                                            <table className="w-full">
                                                <tbody>
                                                    {groupRows.map(renderRow)}
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                sorted.map(renderRow)
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
                                                        days <= 30 ? 'bg-[#CA8A04]' :
                                                            'bg-[var(--accent)]'
                                                    }`}
                                                style={{ width: `${Math.max(5, Math.min(100, 100 - days))}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-[var(--text-muted)] font-mono w-28 text-right">
                                            {r.nextDate!.label}
                                        </span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded w-12 text-center ${days <= 7 ? 'bg-[var(--danger-bg)] text-[var(--danger)]' :
                                                days <= 30 ? 'bg-[#FFF8E1] text-[#CA8A04]' :
                                                    'bg-[var(--accent-subtle)] text-[var(--accent)]'
                                            }`}>
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
