'use client';

import { useState, useMemo } from 'react';
import { fetchCategoryMappings, updateCategoryMapping, type CategoryMappingEntry } from '@/app/actions/accounting';
import { useUpdateLineItemCostGroups } from '@/hooks/useSupabaseQueries';
import type { PredevBudgetLineItem } from '@/types';
import {
    X, Loader2, Search, Database, ChevronRight, ChevronDown, Check,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface CostCodeMappingDialogProps {
    lineItem: PredevBudgetLineItem;
    pursuitId: string;
    onClose: () => void;
}

/**
 * Dialog for mapping Yardi cost groups to a budget line item.
 * Shows all 2-digit cost groups from the jobcost_category_mapping table
 * and lets the user toggle which groups should roll up into this line item.
 */
export function CostCodeMappingDialog({ lineItem, pursuitId, onClose }: CostCodeMappingDialogProps) {
    const updateCostGroups = useUpdateLineItemCostGroups();
    const [search, setSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Fetch all mappings from the Yardi database
    const { data: mappings, isLoading } = useQuery({
        queryKey: ['category-mappings'] as const,
        queryFn: fetchCategoryMappings,
        staleTime: 5 * 60 * 1000,
    });

    // Selected cost groups (local state initialized from line item)
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(
        new Set(lineItem.yardi_cost_groups ?? [])
    );

    // Build group hierarchy: { groupCode: { header, details[] } }
    const groupedMappings = useMemo(() => {
        if (!mappings) return [];

        const groups = new Map<string, { header: CategoryMappingEntry | null; details: CategoryMappingEntry[] }>();

        for (const m of mappings) {
            if (m.is_group_header) {
                if (!groups.has(m.category_code)) {
                    groups.set(m.category_code, { header: m, details: [] });
                } else {
                    groups.get(m.category_code)!.header = m;
                }
            } else {
                const prefix = m.category_code.substring(0, 2);
                if (!groups.has(prefix)) {
                    groups.set(prefix, { header: null, details: [] });
                }
                groups.get(prefix)!.details.push(m);
            }
        }

        return Array.from(groups.entries())
            .map(([code, data]) => ({
                code,
                name: data.header?.category_name ?? `Group ${code}`,
                costGroup: data.header?.cost_group ?? 'Unknown',
                details: data.details,
            }))
            .sort((a, b) => a.code.localeCompare(b.code));
    }, [mappings]);

    // Filter by search
    const filteredGroups = useMemo(() => {
        if (!search.trim()) return groupedMappings;
        const q = search.toLowerCase();
        return groupedMappings.filter(
            (g) => g.code.includes(q) || g.name.toLowerCase().includes(q) ||
                g.costGroup.toLowerCase().includes(q) ||
                g.details.some((d) => d.category_name.toLowerCase().includes(q) || d.category_code.includes(q))
        );
    }, [groupedMappings, search]);

    const toggleGroup = (code: string) => {
        setSelectedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const toggleExpand = (code: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const handleSave = () => {
        updateCostGroups.mutate(
            { lineItemId: lineItem.id, yardiCostGroups: Array.from(selectedGroups), pursuitId },
            { onSuccess: onClose }
        );
    };

    const hasChanges = (() => {
        const original = new Set(lineItem.yardi_cost_groups ?? []);
        if (original.size !== selectedGroups.size) return true;
        for (const g of selectedGroups) if (!original.has(g)) return true;
        return false;
    })();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            Map Cost Groups
                        </h2>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            <span className="font-medium text-[var(--accent)]">{lineItem.label}</span> — Select which Yardi cost groups should aggregate into this line item.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-[var(--table-row-border)]">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search cost codes or names..."
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                            autoFocus
                        />
                    </div>
                    {selectedGroups.size > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {Array.from(selectedGroups).sort().map((code) => {
                                const isGroup = code.length <= 2;
                                const g = groupedMappings.find((m) => m.code === code);
                                // For detail codes, find the detail entry
                                const detailEntry = !isGroup ? groupedMappings
                                    .flatMap(m => m.details)
                                    .find(d => d.category_code === code) : null;
                                const label = isGroup
                                    ? (g ? g.name : `Group ${code}`)
                                    : (detailEntry ? detailEntry.category_name : code);
                                return (
                                    <span key={code} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${isGroup ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'}`}>
                                        <span className="font-mono">{code}</span> · {label}
                                        <button onClick={() => toggleGroup(code)} className="hover:text-[var(--danger)]">
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Group List */}
                <div className="flex-1 overflow-y-auto px-5 py-2">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-[var(--border-strong)]" />
                        </div>
                    ) : filteredGroups.length === 0 ? (
                        <p className="text-xs text-[var(--text-faint)] text-center py-6">No cost groups found</p>
                    ) : (
                        <div className="space-y-0.5">
                            {filteredGroups.map((g) => {
                                const isGroupSelected = selectedGroups.has(g.code);
                                const isExpanded = expandedGroups.has(g.code);
                                // Count how many detail codes are individually selected
                                const detailSelectedCount = g.details.filter(d => selectedGroups.has(d.category_code)).length;
                                const hasPartialSelection = !isGroupSelected && detailSelectedCount > 0;
                                return (
                                    <div key={g.code}>
                                        <div className="flex items-center gap-2 py-1.5 rounded-lg hover:bg-[var(--bg-elevated)] px-2 transition-colors">
                                            <button
                                                onClick={() => {
                                                    setSelectedGroups(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(g.code)) {
                                                            next.delete(g.code);
                                                        } else {
                                                            next.add(g.code);
                                                            // Remove any individually-selected detail codes since
                                                            // the parent group now captures them all
                                                            for (const d of g.details) next.delete(d.category_code);
                                                        }
                                                        return next;
                                                    });
                                                }}
                                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isGroupSelected ? 'bg-[var(--accent)] border-[var(--accent)]' : hasPartialSelection ? 'bg-[var(--accent)]/30 border-[var(--accent)]' : 'border-[var(--border)]'}`}
                                            >
                                                {isGroupSelected && <Check className="w-3 h-3 text-white" />}
                                                {hasPartialSelection && <div className="w-2 h-0.5 bg-white rounded" />}
                                            </button>
                                            <span className="text-[10px] font-mono text-[var(--text-faint)] w-6 shrink-0">{g.code}</span>
                                            <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{g.name}</span>
                                            {hasPartialSelection && (
                                                <span className="text-[9px] text-[var(--accent)] font-medium">{detailSelectedCount} code{detailSelectedCount !== 1 ? 's' : ''}</span>
                                            )}
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${g.costGroup === 'Hard Costs' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' : g.costGroup === 'Soft Costs' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}>
                                                {g.costGroup}
                                            </span>
                                            {g.details.length > 0 && (
                                                <button onClick={() => toggleExpand(g.code)} className="p-0.5 text-[var(--text-faint)] hover:text-[var(--text-secondary)]">
                                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                                </button>
                                            )}
                                        </div>
                                        {/* Detail codes — selectable individually */}
                                        {isExpanded && g.details.length > 0 && (
                                            <div className="ml-8 pl-2 border-l border-[var(--table-row-border)] mb-1">
                                                {g.details.map((d) => {
                                                    const isDetailSelected = selectedGroups.has(d.category_code);
                                                    const isIncludedViaGroup = isGroupSelected;
                                                    return (
                                                        <div key={d.category_code}
                                                            className={`flex items-center gap-2 py-1 rounded hover:bg-[var(--bg-elevated)] px-1 transition-colors ${isIncludedViaGroup ? 'opacity-60' : ''}`}>
                                                            <button
                                                                onClick={() => {
                                                                    if (isIncludedViaGroup) return; // already captured by parent
                                                                    toggleGroup(d.category_code);
                                                                }}
                                                                disabled={isIncludedViaGroup}
                                                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${isDetailSelected || isIncludedViaGroup ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'} ${isIncludedViaGroup ? 'cursor-default' : ''}`}
                                                            >
                                                                {(isDetailSelected || isIncludedViaGroup) && <Check className="w-2.5 h-2.5 text-white" />}
                                                            </button>
                                                            <span className="font-mono text-[var(--text-faint)] w-16 shrink-0 text-[10px]">{d.category_code}</span>
                                                            <span className="text-[var(--text-secondary)] truncate text-[10px]">{d.category_name}</span>
                                                            {isIncludedViaGroup && (
                                                                <span className="text-[8px] text-[var(--text-faint)] ml-auto italic">via group</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-faint)]">
                        {(() => {
                            const groups = Array.from(selectedGroups).filter(c => c.length <= 2).length;
                            const details = Array.from(selectedGroups).filter(c => c.length > 2).length;
                            const parts = [];
                            if (groups) parts.push(`${groups} group${groups !== 1 ? 's' : ''}`);
                            if (details) parts.push(`${details} code${details !== 1 ? 's' : ''}`);
                            return parts.length ? parts.join(', ') : 'None selected';
                        })()}
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || updateCostGroups.isPending}
                            className="px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-medium transition-colors"
                        >
                            {updateCostGroups.isPending ? 'Saving...' : 'Save Mapping'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
