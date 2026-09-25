'use client';

import { useState, useMemo, useEffect } from 'react';
import { fetchCategoryMappings, type CategoryMappingEntry } from '@/app/actions/accounting';
import { useUpdateLineItemCostGroups } from '@/hooks/useSupabaseQueries';
import type { PredevBudgetLineItem } from '@/types';
import {
    X, Loader2, Search, ChevronRight, ChevronDown, Check, AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { findConflictingLineItem } from '@/components/pursuits/predevYardi';

interface CostCodeMappingDialogProps {
    lineItem: PredevBudgetLineItem;
    /** The budget's other line items — a code already captured by one of them can't be mapped again. */
    otherLineItems?: PredevBudgetLineItem[];
    pursuitId: string;
    onClose: () => void;
}

/** Drop detail codes whose 2-digit group is also selected (the group already captures them). */
function normalizeSelection(codes: Iterable<string>): Set<string> {
    const all = new Set(codes);
    for (const c of all) {
        if (c.length > 2 && all.has(c.substring(0, 2))) all.delete(c);
    }
    return all;
}

/**
 * Dialog for mapping Yardi cost groups to a budget line item.
 * Shows all 2-digit cost groups from the jobcost_category_mapping table
 * and lets the user toggle which groups should roll up into this line item.
 *
 * A code can only be captured once per budget: mapping a group ("50") and one of
 * its detail codes ("50-00100"), on this or another line item, double counts the
 * detail code's actuals, so those choices are disabled with the reason shown.
 */
export function CostCodeMappingDialog({ lineItem, otherLineItems = [], pursuitId, onClose }: CostCodeMappingDialogProps) {
    const updateCostGroups = useUpdateLineItemCostGroups();
    const [search, setSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [saveError, setSaveError] = useState<string | null>(null);

    // Fetch all mappings from the Yardi database
    const { data: mappings, isLoading, isError, refetch } = useQuery({
        queryKey: ['category-mappings'] as const,
        queryFn: fetchCategoryMappings,
        staleTime: 5 * 60 * 1000,
    });

    const originalCodes = lineItem.yardi_cost_groups ?? [];
    // Selected cost groups (local state initialized from line item, minus redundant detail codes)
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => normalizeSelection(originalCodes));
    const droppedRedundant = originalCodes.filter((c) => !normalizeSelection(originalCodes).has(c));

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !updateCostGroups.isPending) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, updateCostGroups.isPending]);

    /** Another line item that already captures `code`, if any. */
    const conflictFor = (code: string) => findConflictingLineItem(code, otherLineItems);

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

    const detailByCode = useMemo(() => {
        const m = new Map<string, CategoryMappingEntry>();
        for (const g of groupedMappings) for (const d of g.details) m.set(d.category_code, d);
        return m;
    }, [groupedMappings]);

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

    const toggleCode = (code: string) => {
        setSaveError(null);
        setSelectedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const toggleGroupWithDetails = (code: string, details: CategoryMappingEntry[]) => {
        setSaveError(null);
        setSelectedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(code)) {
                next.delete(code);
            } else {
                next.add(code);
                // Remove any individually-selected detail codes since
                // the parent group now captures them all
                for (const d of details) next.delete(d.category_code);
            }
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
        const codes = Array.from(normalizeSelection(selectedGroups));
        // Guard against overlaps that pre-date this check (or another tab's edit)
        const conflicts = codes
            .map((code) => ({ code, hit: conflictFor(code) }))
            .filter((c): c is { code: string; hit: { label: string; code: string } } => !!c.hit);
        if (conflicts.length > 0) {
            setSaveError(
                `Already mapped elsewhere, so the actuals would count twice: ${conflicts
                    .map((c) => `${c.code} (in "${c.hit.label}" as ${c.hit.code})`)
                    .join(', ')}. Remove ${conflicts.length === 1 ? 'it' : 'them'} here or on the other line item.`
            );
            return;
        }
        updateCostGroups.mutate(
            { lineItemId: lineItem.id, yardiCostGroups: codes, pursuitId },
            {
                onSuccess: onClose,
                onError: (err) => {
                    console.error('Failed to save cost code mapping:', err);
                    toast.error('Failed to save mapping', err);
                },
            }
        );
    };

    const hasChanges = (() => {
        const original = new Set(originalCodes);
        if (original.size !== selectedGroups.size) return true;
        for (const g of selectedGroups) if (!original.has(g)) return true;
        return false;
    })();

    const costGroupBadge = (costGroup: string) =>
        costGroup === 'Hard Costs' ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
            : costGroup === 'Soft Costs' ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget && !updateCostGroups.isPending) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="cost-code-mapping-title"
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div>
                        <h2 id="cost-code-mapping-title" className="text-sm font-semibold text-[var(--text-primary)]">
                            Map Cost Groups
                        </h2>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            <span className="font-medium text-[var(--accent)]">{lineItem.label}</span> — Select which Yardi cost groups or codes roll up into this line item. Each code can be mapped to only one line item.
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
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
                            aria-label="Search cost codes"
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                            autoFocus
                        />
                    </div>
                    {droppedRedundant.length > 0 && (
                        <p className="mt-2 text-[10px] text-[var(--warning)]">
                            Removed {droppedRedundant.join(', ')} — already included via {droppedRedundant.length === 1 ? 'its group' : 'their groups'}, so {droppedRedundant.length === 1 ? 'it was' : 'they were'} being counted twice. Save to apply.
                        </p>
                    )}
                    {selectedGroups.size > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {Array.from(selectedGroups).sort().map((code) => {
                                const isGroup = code.length <= 2;
                                const g = isGroup ? groupedMappings.find((m) => m.code === code) : null;
                                const label = isGroup
                                    ? (g ? g.name : `Group ${code}`)
                                    : (detailByCode.get(code)?.category_name ?? code);
                                return (
                                    <span key={code} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${isGroup ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--badge-owner-bg)] text-[var(--badge-owner-text)]'}`}>
                                        <span className="font-mono">{code}</span> · {label}
                                        <button onClick={() => toggleCode(code)} aria-label={`Remove ${code}`} className="hover:text-[var(--danger)]">
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
                    ) : isError ? (
                        <div className="text-xs text-[var(--danger)] text-center py-6">
                            Couldn&apos;t load Yardi cost codes.{' '}
                            <button onClick={() => refetch()} className="underline hover:no-underline">Retry</button>
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
                                const groupConflict = !isGroupSelected ? conflictFor(g.code) : null;
                                return (
                                    <div key={g.code}>
                                        <div className="flex items-center gap-2 py-1.5 rounded-lg hover:bg-[var(--bg-elevated)] px-2 transition-colors">
                                            <button
                                                role="checkbox"
                                                aria-checked={isGroupSelected ? true : hasPartialSelection ? 'mixed' : false}
                                                aria-label={`Group ${g.code} ${g.name}`}
                                                disabled={!!groupConflict}
                                                title={groupConflict ? `Some of this group is already mapped to "${groupConflict.label}" (${groupConflict.code})` : undefined}
                                                onClick={() => toggleGroupWithDetails(g.code, g.details)}
                                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--accent)] outline-none ${isGroupSelected ? 'bg-[var(--accent)] border-[var(--accent)]' : hasPartialSelection ? 'bg-[var(--accent)]/30 border-[var(--accent)]' : 'border-[var(--border)]'}`}
                                            >
                                                {isGroupSelected && <Check className="w-3 h-3 text-white" />}
                                                {hasPartialSelection && <div className="w-2 h-0.5 bg-white rounded" />}
                                            </button>
                                            <span className="text-[10px] font-mono text-[var(--text-faint)] w-6 shrink-0">{g.code}</span>
                                            <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{g.name}</span>
                                            {groupConflict && (
                                                <span className="text-[9px] text-[var(--text-faint)] italic truncate max-w-[120px]" title={`Already mapped to "${groupConflict.label}"`}>
                                                    in {groupConflict.label}
                                                </span>
                                            )}
                                            {hasPartialSelection && (
                                                <span className="text-[9px] text-[var(--accent)] font-medium">{detailSelectedCount} code{detailSelectedCount !== 1 ? 's' : ''}</span>
                                            )}
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${costGroupBadge(g.costGroup)}`}>
                                                {g.costGroup}
                                            </span>
                                            {g.details.length > 0 && (
                                                <button onClick={() => toggleExpand(g.code)} aria-expanded={isExpanded} aria-label={`${isExpanded ? 'Hide' : 'Show'} detail codes for group ${g.code}`} className="p-0.5 text-[var(--text-faint)] hover:text-[var(--text-secondary)]">
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
                                                    const detailConflict = !isDetailSelected && !isIncludedViaGroup ? conflictFor(d.category_code) : null;
                                                    const disabled = isIncludedViaGroup || !!detailConflict;
                                                    return (
                                                        <div key={d.category_code}
                                                            className={`flex items-center gap-2 py-1 rounded hover:bg-[var(--bg-elevated)] px-1 transition-colors ${disabled ? 'opacity-60' : ''}`}>
                                                            <button
                                                                role="checkbox"
                                                                aria-checked={isDetailSelected || isIncludedViaGroup}
                                                                aria-label={`${d.category_code} ${d.category_name}`}
                                                                onClick={() => { if (!disabled) toggleCode(d.category_code); }}
                                                                disabled={disabled}
                                                                title={detailConflict ? `Already mapped to "${detailConflict.label}" (${detailConflict.code})` : isIncludedViaGroup ? 'Included via the selected group' : undefined}
                                                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] outline-none ${isDetailSelected || isIncludedViaGroup ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'} ${disabled ? 'cursor-default' : ''}`}
                                                            >
                                                                {(isDetailSelected || isIncludedViaGroup) && <Check className="w-2.5 h-2.5 text-white" />}
                                                            </button>
                                                            <span className="font-mono text-[var(--text-faint)] w-16 shrink-0 text-[10px]">{d.category_code}</span>
                                                            <span className="text-[var(--text-secondary)] truncate text-[10px]">{d.category_name}</span>
                                                            {isIncludedViaGroup && (
                                                                <span className="text-[8px] text-[var(--text-faint)] ml-auto italic">via group</span>
                                                            )}
                                                            {detailConflict && (
                                                                <span className="text-[8px] text-[var(--text-faint)] ml-auto italic truncate max-w-[120px]">in {detailConflict.label}</span>
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

                {saveError && (
                    <div role="alert" className="mx-5 mb-2 flex items-start gap-1.5 rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-[11px] text-[var(--danger)]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>{saveError}</span>
                    </div>
                )}

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
