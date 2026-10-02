'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Save, Loader2, Database } from 'lucide-react';
import type { PredevBudgetLineItem } from '@/types';
import { formatCurrency } from '@/lib/constants';
import { useUpdateLineItemCostGroups, useAddCustomLineItem } from '@/hooks/useSupabaseQueries';
import { toast } from '@/lib/toast';

interface UnallocatedItem {
    code: string;
    name: string;
    total: number;
}

interface UnallocatedMappingDialogProps {
    budgetId: string;
    pursuitId: string;
    unallocatedItems: UnallocatedItem[];
    lineItems: PredevBudgetLineItem[];
    onClose: () => void;
}

const labelKey = (label: string) => label.trim().toLowerCase();

export function UnallocatedMappingDialog({
    budgetId,
    pursuitId,
    unallocatedItems,
    lineItems,
    onClose,
}: UnallocatedMappingDialogProps) {
    const updateGroupsMut = useUpdateLineItemCostGroups();
    const addLineItemMut = useAddCustomLineItem();

    // Local state to track user's intent for each unallocated code
    // map to: { type: 'existing', lineItemId } OR { type: 'new', label }
    const [selections, setSelections] = useState<Record<string, { type: 'existing'; lineItemId: string } | { type: 'new'; label: string }>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Work already done in this dialog, so a retry after a partial failure never repeats it:
    // line items created here (by label) and the codes each line item has been saved with.
    const createdByLabelRef = useRef<Map<string, PredevBudgetLineItem>>(new Map());
    const savedCodesRef = useRef<Map<string, Set<string>>>(new Map());

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSaving) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, isSaving]);

    const handleSelect = (code: string, value: string) => {
        if (!value) {
            setSelections(prev => {
                const next = { ...prev };
                delete next[code];
                return next;
            });
            return;
        }

        if (value === 'create_new') {
            setSelections(prev => ({
                ...prev,
                [code]: { type: 'new', label: '' }
            }));
        } else {
            setSelections(prev => ({
                ...prev,
                [code]: { type: 'existing', lineItemId: value }
            }));
        }
    };

    const handleNewLabelChange = (code: string, label: string) => {
        setSelections(prev => ({
            ...prev,
            [code]: { type: 'new', label }
        }));
    };

    /** Codes a line item is known to have: this dialog's saved state if newer than the props. */
    const currentCodes = (li: PredevBudgetLineItem): Set<string> =>
        new Set([...(li.yardi_cost_groups ?? []), ...(savedCodesRef.current.get(li.id) ?? [])]);

    const handleSave = async () => {
        setIsSaving(true);
        // Group codes by target. New labels that match an existing line item (or one created on an
        // earlier attempt) are merged into it instead of creating a duplicate.
        const byExisting = new Map<string, string[]>(); // lineItemId -> codes
        const byNewLabel = new Map<string, { label: string; codes: string[] }>(); // label key -> codes
        const liByLabel = new Map(lineItems.map((li) => [labelKey(li.label), li]));

        for (const item of unallocatedItems) {
            const sel = selections[item.code];
            if (!sel) continue;
            if (sel.type === 'existing' && sel.lineItemId) {
                byExisting.set(sel.lineItemId, [...(byExisting.get(sel.lineItemId) ?? []), item.code]);
            } else if (sel.type === 'new' && sel.label.trim()) {
                const key = labelKey(sel.label);
                const match = liByLabel.get(key) ?? createdByLabelRef.current.get(key);
                if (match) {
                    byExisting.set(match.id, [...(byExisting.get(match.id) ?? []), item.code]);
                } else {
                    const entry = byNewLabel.get(key) ?? { label: sel.label.trim(), codes: [] };
                    entry.codes.push(item.code);
                    byNewLabel.set(key, entry);
                }
            }
        }

        const total = byExisting.size + byNewLabel.size;
        let done = 0;
        try {
            // 1. Create new line items (each create is remembered, so a retry reuses it)
            for (const [key, { label, codes }] of byNewLabel) {
                const newLi = await addLineItemMut.mutateAsync({ budgetId, label, pursuitId });
                createdByLabelRef.current.set(key, newLi);
                const merged = Array.from(new Set([...(newLi.yardi_cost_groups ?? []), ...codes]));
                await updateGroupsMut.mutateAsync({ lineItemId: newLi.id, yardiCostGroups: merged, pursuitId });
                savedCodesRef.current.set(newLi.id, new Set(merged));
                done++;
            }

            // 2. Add codes to existing line items (and ones created on an earlier attempt)
            for (const [lineItemId, codes] of byExisting) {
                const li = lineItems.find(l => l.id === lineItemId)
                    ?? Array.from(createdByLabelRef.current.values()).find(l => l.id === lineItemId);
                if (!li) continue;
                const existing = currentCodes(li);
                if (codes.every((c) => existing.has(c))) { done++; continue; } // saved on an earlier attempt
                for (const code of codes) existing.add(code);
                const merged = Array.from(existing);
                await updateGroupsMut.mutateAsync({ lineItemId: li.id, yardiCostGroups: merged, pursuitId });
                savedCodesRef.current.set(li.id, new Set(merged));
                done++;
            }

            const mapped = [...byExisting.values(), ...[...byNewLabel.values()].map((v) => v.codes)].reduce((n, c) => n + c.length, 0);
            toast.success(`Mapped ${mapped} code${mapped !== 1 ? 's' : ''} to the budget`);
            onClose();
        } catch (error) {
            console.error('Failed to map unallocated codes:', error);
            toast.error(
                done > 0
                    ? `Saved ${done} of ${total} line items before an error. Apply again to finish — completed ones won't be repeated`
                    : 'Failed to map codes',
                error,
            );
        } finally {
            setIsSaving(false);
        }
    };

    const readyCount = Object.values(selections).filter(s => s.type === 'existing' || (s.type === 'new' && s.label.trim().length > 0)).length;
    const hasChanges = readyCount > 0;

    return (
        <div className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="unallocated-mapping-title"
                className="bg-[var(--bg-primary)] border border-[var(--border)] shadow-2xl rounded-xl w-full max-w-2xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--warning-bg)] flex items-center justify-center">
                            <Database className="w-4 h-4 text-[var(--warning)]" />
                        </div>
                        <div>
                            <h2 id="unallocated-mapping-title" className="text-sm font-semibold text-[var(--text-primary)]">Map Unallocated Costs</h2>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                Assign Yardi detail codes that no line item captures yet to an existing or new line item.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={isSaving} aria-label="Close" className="p-2 -mr-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-[var(--bg-elevated)]">
                    <div className="p-5">
                        {unallocatedItems.length === 0 ? (
                            <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                                No unallocated codes found.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {unallocatedItems.map((item) => {
                                    const sel = selections[item.code];
                                    const newLabelMatches = sel?.type === 'new' && sel.label.trim()
                                        ? lineItems.find((li) => labelKey(li.label) === labelKey(sel.label))
                                        : undefined;
                                    return (
                                        <div key={item.code} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 flex flex-col gap-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-mono text-xs bg-[var(--warning-bg)] text-[var(--warning)] px-1.5 py-0.5 rounded font-bold shrink-0">
                                                        {item.code}
                                                    </span>
                                                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">{item.name}</span>
                                                </div>
                                                <span className="text-xs font-semibold tabular-nums text-[var(--warning)] shrink-0">
                                                    {formatCurrency(item.total, 0)}
                                                </span>
                                            </div>

                                            <div className="flex flex-col gap-2 pl-1">
                                                <div className="flex items-center gap-2">
                                                    <label htmlFor={`map-${item.code}`} className="text-xs text-[var(--text-secondary)] font-medium w-16 shrink-0">Map to:</label>
                                                    <select
                                                        id={`map-${item.code}`}
                                                        className="flex-1 min-w-0 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                                        value={sel?.type === 'new' ? 'create_new' : (sel?.type === 'existing' ? sel.lineItemId : '')}
                                                        onChange={(e) => handleSelect(item.code, e.target.value)}
                                                    >
                                                        <option value="">-- Ignore for now --</option>
                                                        <optgroup label="Actions">
                                                            <option value="create_new">+ Create New Line Item</option>
                                                        </optgroup>
                                                        <optgroup label="Existing Line Items">
                                                            {lineItems.map(li => (
                                                                <option key={li.id} value={li.id}>{li.label}</option>
                                                            ))}
                                                        </optgroup>
                                                    </select>
                                                </div>

                                                {sel?.type === 'new' && (
                                                    <div className="pl-[72px] mt-1">
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            placeholder="New line item name..."
                                                            aria-label={`New line item name for ${item.code}`}
                                                            value={sel.label}
                                                            onChange={(e) => handleNewLabelChange(item.code, e.target.value)}
                                                            className="w-full bg-[var(--bg-primary)] border border-[var(--accent)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none shadow-sm"
                                                        />
                                                        {newLabelMatches && (
                                                            <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                                                A line item named &ldquo;{newLabelMatches.label}&rdquo; already exists — the code will be added to it.
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border)] shrink-0 bg-[var(--bg-card)] rounded-b-xl">
                    <span className="text-xs text-[var(--text-muted)]">
                        {readyCount} code{readyCount !== 1 ? 's' : ''} ready to map
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} disabled={isSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || isSaving}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${!hasChanges || isSaving ? 'bg-[var(--accent)]/50 cursor-not-allowed' : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] shadow-sm hover:shadow'}`}
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Apply Mappings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
