'use client';

import { useState, useMemo, useRef } from 'react';
import { Search, ChevronDown, ChevronRight, GripVertical, X, Filter } from 'lucide-react';
import type { ReportConfig, ReportFieldKey, ReportFilter, ReportFilterOperator, ReportDataSource } from '@/types';
import { REPORT_FIELD_MAP, getFieldCategoriesForSource, getGroupableFieldsForSource } from '@/lib/reportFields';
import type { ReportFieldDef } from '@/lib/reportFields';
import type { ReportRow } from '@/lib/supabase/queries';

interface ReportConfigPanelProps {
    config: ReportConfig;
    onChange: (config: ReportConfig) => void;
    onClose: () => void;
    dataSource: ReportDataSource;
    data?: ReportRow[];
}

export function ReportConfigPanel({ config, onChange, onClose, dataSource, data }: ReportConfigPanelProps) {
    const [search, setSearch] = useState('');
    const [expandedFilter, setExpandedFilter] = useState<number | null>(null);
    const [filterSearch, setFilterSearch] = useState('');

    const sourceCategories = useMemo(() => getFieldCategoriesForSource(dataSource), [dataSource]);
    const sourceGroupable = useMemo(() => getGroupableFieldsForSource(dataSource), [dataSource]);
    const sourceFilterable = useMemo(() =>
        sourceCategories.flatMap(c => c.fields).filter(f => f.filterable),
        [sourceCategories]
    );

    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(sourceCategories.map(c => c.category))
    );

    const filteredCategories = useMemo(() => {
        if (!search.trim()) return sourceCategories;
        const q = search.toLowerCase();
        return sourceCategories
            .map(cat => ({
                ...cat,
                fields: cat.fields.filter(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)),
            }))
            .filter(cat => cat.fields.length > 0);
    }, [search, sourceCategories]);

    // Extract distinct values for text fields from the actual data
    const distinctValues = useMemo(() => {
        if (!data || data.length === 0) return {};
        const result: Record<string, string[]> = {};
        for (const field of sourceFilterable) {
            if (field.type === 'text') {
                const vals = new Set<string>();
                for (const row of data) {
                    const v = field.getValue(row);
                    if (v !== null && v !== '' && v !== undefined) vals.add(String(v));
                }
                result[field.key] = Array.from(vals).sort((a, b) => a.localeCompare(b));
            }
        }
        return result;
    }, [data, sourceFilterable]);

    const toggleColumn = (key: ReportFieldKey) => {
        const cols = config.columns.includes(key)
            ? config.columns.filter(c => c !== key)
            : [...config.columns, key];
        onChange({ ...config, columns: cols });
    };

    const removeColumn = (key: ReportFieldKey) => {
        onChange({ ...config, columns: config.columns.filter(c => c !== key) });
    };

    const moveColumn = (idx: number, direction: 'up' | 'down') => {
        const newCols = [...config.columns];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= newCols.length) return;
        [newCols[idx], newCols[swapIdx]] = [newCols[swapIdx], newCols[idx]];
        onChange({ ...config, columns: newCols });
    };

    const toggleGroupBy = (key: ReportFieldKey) => {
        const groups = config.groupBy.includes(key)
            ? config.groupBy.filter(g => g !== key)
            : [...config.groupBy, key];
        onChange({ ...config, groupBy: groups });
    };

    const removeGroupBy = (key: ReportFieldKey) => {
        onChange({ ...config, groupBy: config.groupBy.filter(g => g !== key) });
    };

    const moveGroupBy = (idx: number, direction: 'up' | 'down') => {
        const newGroups = [...config.groupBy];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= newGroups.length) return;
        [newGroups[idx], newGroups[swapIdx]] = [newGroups[swapIdx], newGroups[idx]];
        onChange({ ...config, groupBy: newGroups });
    };

    const addFilter = (fieldKey: ReportFieldKey) => {
        const fieldDef = REPORT_FIELD_MAP[fieldKey];
        const isText = fieldDef?.type === 'text';
        const newFilter: ReportFilter = isText
            ? { field: fieldKey, operator: 'in', value: '', values: [] }
            : { field: fieldKey, operator: 'gte', value: '' };
        const newFilters = [...config.filters, newFilter];
        onChange({ ...config, filters: newFilters });
        setExpandedFilter(newFilters.length - 1);
    };

    const updateFilter = (idx: number, updates: Partial<ReportFilter>) => {
        const newFilters = config.filters.map((f, i) => (i === idx ? { ...f, ...updates } : f));
        onChange({ ...config, filters: newFilters });
    };

    const toggleFilterValue = (idx: number, val: string) => {
        const filter = config.filters[idx];
        const current = filter.values ?? [];
        const newVals = current.includes(val)
            ? current.filter(v => v !== val)
            : [...current, val];
        updateFilter(idx, { values: newVals });
    };

    const removeFilter = (idx: number) => {
        onChange({ ...config, filters: config.filters.filter((_, i) => i !== idx) });
        if (expandedFilter === idx) setExpandedFilter(null);
    };

    const toggleCategory = (cat: string) => {
        const next = new Set(expandedCategories);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        setExpandedCategories(next);
    };

    // ── Drag-and-drop column reorder ──────────────────────────
    const dragIdx = useRef<number | null>(null);
    const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

    const handleDragStart = (idx: number) => {
        dragIdx.current = idx;
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        setDropTargetIdx(idx);
    };

    const handleDrop = (e: React.DragEvent, toIdx: number) => {
        e.preventDefault();
        setDropTargetIdx(null);
        const fromIdx = dragIdx.current;
        if (fromIdx === null || fromIdx === toIdx) return;
        const newCols = [...config.columns];
        const [moved] = newCols.splice(fromIdx, 1);
        newCols.splice(toIdx, 0, moved);
        onChange({ ...config, columns: newCols });
        dragIdx.current = null;
    };

    const handleDragEnd = () => {
        dragIdx.current = null;
        setDropTargetIdx(null);
    };

    // Which filterable fields are NOT yet used in a filter
    const availableFilterFields = sourceFilterable.filter(
        f => !config.filters.some(flt => flt.field === f.key)
    );

    return (
        <div className="h-full flex flex-col bg-white border-r border-[#E2E5EA] w-80 min-w-80">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E5EA]">
                <h3 className="text-sm font-semibold text-[#1A1F2B]">Report Configuration</h3>
                <button onClick={onClose} className="p-1 rounded hover:bg-[#F4F5F7] text-[#7A8599]">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* ── Group By ────────────────────────────── */}
                <div className="px-4 py-3 border-b border-[#F0F1F4]">
                    <h4 className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider mb-2">Group By</h4>
                    {config.groupBy.length > 0 ? (
                        <div className="space-y-1">
                            {config.groupBy.map((key, idx) => {
                                const field = REPORT_FIELD_MAP[key];
                                return (
                                    <div key={key} className="flex items-center gap-1.5 px-2 py-1.5 bg-[#F4F5F7] rounded-md text-xs">
                                        <GripVertical className="w-3 h-3 text-[#C8CDD5] shrink-0" />
                                        <span className="flex-1 text-[#1A1F2B] font-medium">{field?.label ?? key}</span>
                                        <div className="flex gap-0.5">
                                            <button onClick={() => moveGroupBy(idx, 'up')} disabled={idx === 0} className="p-0.5 rounded hover:bg-[#E2E5EA] disabled:opacity-30 text-[#7A8599]">↑</button>
                                            <button onClick={() => moveGroupBy(idx, 'down')} disabled={idx === config.groupBy.length - 1} className="p-0.5 rounded hover:bg-[#E2E5EA] disabled:opacity-30 text-[#7A8599]">↓</button>
                                        </div>
                                        <button onClick={() => removeGroupBy(key)} className="p-0.5 rounded hover:bg-[#FEF2F2] text-[#A0AABB] hover:text-[#DC2626]">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[11px] text-[#A0AABB]">No grouping applied</p>
                    )}
                    <div className="mt-2">
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) toggleGroupBy(e.target.value as ReportFieldKey); }}
                            className="w-full px-2 py-1.5 text-xs rounded-md border border-[#E2E5EA] text-[#7A8599] bg-white"
                        >
                            <option value="">Add grouping...</option>
                            {sourceGroupable.filter(f => !config.groupBy.includes(f.key)).map(f => (
                                <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ── Filters ────────────────────────────── */}
                <div className="px-4 py-3 border-b border-[#F0F1F4]">
                    <h4 className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider mb-2">Filters</h4>

                    {config.filters.length === 0 && (
                        <p className="text-[11px] text-[#A0AABB] mb-2">No filters applied</p>
                    )}

                    {config.filters.map((filter, idx) => {
                        const fieldDef = REPORT_FIELD_MAP[filter.field];
                        const isText = fieldDef?.type === 'text';
                        const isExpanded = expandedFilter === idx;
                        const dv = distinctValues[filter.field] ?? [];
                        const selectedCount = filter.values?.length ?? 0;

                        return (
                            <div key={idx} className="mb-2 rounded-md border border-[#E2E5EA] overflow-hidden">
                                {/* Filter header — click to expand */}
                                <div
                                    className="flex items-center gap-1.5 px-2.5 py-2 bg-[#F8F9FA] cursor-pointer hover:bg-[#F0F1F4] transition-colors"
                                    onClick={() => setExpandedFilter(isExpanded ? null : idx)}
                                >
                                    <Filter className="w-3 h-3 text-[#7A8599] shrink-0" />
                                    <span className="flex-1 text-[11px] font-medium text-[#1A1F2B] truncate">
                                        {fieldDef?.label ?? filter.field}
                                    </span>
                                    {isText && selectedCount > 0 && (
                                        <span className="text-[10px] font-medium text-[#2563EB] bg-[#EBF1FF] px-1.5 py-0.5 rounded-full">
                                            {selectedCount}
                                        </span>
                                    )}
                                    {!isText && filter.value && (
                                        <span className="text-[10px] text-[#7A8599]">
                                            {filter.operator === 'gte' ? '≥' : filter.operator === 'lte' ? '≤' : filter.operator === 'gt' ? '>' : filter.operator === 'lt' ? '<' : '='} {filter.value}
                                        </span>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeFilter(idx); }}
                                        className="p-0.5 rounded hover:bg-[#FEF2F2] text-[#A0AABB] hover:text-[#DC2626] shrink-0"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>

                                {/* Expanded filter content */}
                                {isExpanded && (
                                    <div className="px-2.5 py-2 border-t border-[#E2E5EA] bg-white">
                                        {isText ? (
                                            /* Multi-select checkbox list for text fields */
                                            <div>
                                                {dv.length > 6 && (
                                                    <input
                                                        type="text"
                                                        value={filterSearch}
                                                        onChange={(e) => setFilterSearch(e.target.value)}
                                                        placeholder="Search values..."
                                                        className="w-full px-2 py-1 text-[11px] rounded border border-[#E2E5EA] bg-white text-[#1A1F2B] placeholder:text-[#C8CDD5] mb-1.5 focus:border-[#2563EB] focus:outline-none"
                                                    />
                                                )}
                                                <div className="max-h-40 overflow-y-auto space-y-0.5">
                                                    {(filterSearch
                                                        ? dv.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
                                                        : dv
                                                    ).map(val => (
                                                        <label key={val} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[#F4F5F7] cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={filter.values?.includes(val) ?? false}
                                                                onChange={() => toggleFilterValue(idx, val)}
                                                                className="w-3 h-3 rounded border-[#E2E5EA] text-[#2563EB] focus:ring-[#2563EB]"
                                                            />
                                                            <span className="text-[11px] text-[#4A5568] truncate">{val}</span>
                                                        </label>
                                                    ))}
                                                    {dv.length === 0 && (
                                                        <p className="text-[10px] text-[#A0AABB] py-1">No values found</p>
                                                    )}
                                                </div>
                                                {selectedCount > 0 && (
                                                    <button
                                                        onClick={() => updateFilter(idx, { values: [] })}
                                                        className="mt-1.5 text-[10px] text-[#2563EB] hover:text-[#1D4FD7] font-medium"
                                                    >
                                                        Clear all
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            /* Operator + value input for numeric fields */
                                            <div className="flex items-center gap-1.5">
                                                <select
                                                    value={filter.operator}
                                                    onChange={(e) => updateFilter(idx, { operator: e.target.value as ReportFilterOperator })}
                                                    className="w-14 px-1 py-1 text-[11px] rounded border border-[#E2E5EA] bg-white text-[#1A1F2B]"
                                                >
                                                    <option value="gte">≥</option>
                                                    <option value="lte">≤</option>
                                                    <option value="gt">&gt;</option>
                                                    <option value="lt">&lt;</option>
                                                    <option value="equals">=</option>
                                                    <option value="not_equals">≠</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    value={filter.value}
                                                    onChange={(e) => updateFilter(idx, { value: e.target.value })}
                                                    placeholder="Value"
                                                    className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded border border-[#E2E5EA] bg-white text-[#1A1F2B] placeholder:text-[#C8CDD5] focus:border-[#2563EB] focus:outline-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Add filter dropdown */}
                    <select
                        value=""
                        onChange={(e) => { if (e.target.value) addFilter(e.target.value as ReportFieldKey); }}
                        className="w-full px-2 py-1.5 text-xs rounded-md border border-[#E2E5EA] text-[#7A8599] bg-white mt-1"
                    >
                        <option value="">+ Add filter...</option>
                        {availableFilterFields.map(f => (
                            <option key={f.key} value={f.key}>{f.label} ({f.type === 'text' ? 'pick values' : 'numeric'})</option>
                        ))}
                    </select>
                </div>

                {/* ── Column Order ────────────────────────── */}
                {config.columns.length > 0 && (
                    <div className="px-4 py-3 border-b border-[#F0F1F4]">
                        <h4 className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider mb-2">
                            Column Order
                            <span className="font-normal ml-1">({config.columns.length})</span>
                        </h4>
                        <p className="text-[10px] text-[#C8CDD5] mb-2">Drag or use arrows to reorder</p>
                        <div className="space-y-0.5">
                            {config.columns.map((key, idx) => {
                                const field = REPORT_FIELD_MAP[key];
                                return (
                                    <div
                                        key={key}
                                        draggable
                                        onDragStart={() => handleDragStart(idx)}
                                        onDragOver={(e) => handleDragOver(e, idx)}
                                        onDrop={(e) => handleDrop(e, idx)}
                                        onDragEnd={handleDragEnd}
                                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-grab active:cursor-grabbing transition-colors ${dropTargetIdx === idx ? 'bg-[#EBF1FF] border border-[#2563EB]/30' : 'bg-[#F4F5F7] border border-transparent hover:bg-[#EDEEF1]'
                                            }`}
                                    >
                                        <GripVertical className="w-3 h-3 text-[#C8CDD5] shrink-0" />
                                        <span className="text-[10px] text-[#A0AABB] font-mono w-4 text-center shrink-0">{idx + 1}</span>
                                        <span className="flex-1 text-[#1A1F2B] font-medium truncate">{field?.label ?? key}</span>
                                        <div className="flex gap-0.5 shrink-0">
                                            <button onClick={(e) => { e.stopPropagation(); moveColumn(idx, 'up'); }} disabled={idx === 0} className="p-0.5 rounded hover:bg-[#E2E5EA] disabled:opacity-30 text-[#7A8599]">↑</button>
                                            <button onClick={(e) => { e.stopPropagation(); moveColumn(idx, 'down'); }} disabled={idx === config.columns.length - 1} className="p-0.5 rounded hover:bg-[#E2E5EA] disabled:opacity-30 text-[#7A8599]">↓</button>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeColumn(key); }}
                                            className="p-0.5 rounded hover:bg-[#FEF2F2] text-[#A0AABB] hover:text-[#DC2626] shrink-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Add Columns ─────────────────────────── */}
                <div className="px-4 py-3">
                    <h4 className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider mb-2">Add Columns</h4>
                    <div className="relative mb-3">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#C8CDD5]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search fields..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[#E2E5EA] bg-white text-[#1A1F2B] placeholder:text-[#C8CDD5] focus:border-[#2563EB] focus:outline-none"
                        />
                    </div>
                    {filteredCategories.map(cat => (
                        <div key={cat.category} className="mb-2">
                            <button
                                onClick={() => toggleCategory(cat.category)}
                                className="flex items-center gap-1.5 w-full text-left px-1 py-1 text-[11px] font-semibold text-[#4A5568] hover:text-[#1A1F2B] transition-colors"
                            >
                                {expandedCategories.has(cat.category)
                                    ? <ChevronDown className="w-3 h-3" />
                                    : <ChevronRight className="w-3 h-3" />
                                }
                                {cat.category}
                                <span className="text-[#A0AABB] font-normal ml-1">({cat.fields.length})</span>
                            </button>
                            {expandedCategories.has(cat.category) && (
                                <div className="ml-4 space-y-0.5">
                                    {cat.fields.map(field => (
                                        <label key={field.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[#F4F5F7] cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={config.columns.includes(field.key)}
                                                onChange={() => toggleColumn(field.key)}
                                                className="w-3.5 h-3.5 rounded border-[#E2E5EA] text-[#2563EB] focus:ring-[#2563EB]"
                                            />
                                            <span className="text-[11px] text-[#4A5568]">{field.label}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

