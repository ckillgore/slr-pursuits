import { useState, useMemo } from 'react';
import { X, Plus, Save, Loader2, Database } from 'lucide-react';
import type { PredevBudgetLineItem } from '@/types';
import { formatCurrency } from '@/lib/constants';
import { useUpdateLineItemCostGroups, useAddCustomLineItem } from '@/hooks/useSupabaseQueries';

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

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Group actions by Target Line Item ID
            const targetUpdates = new Map<string, string[]>(); // lineItemId -> appended codes array
            const newLinesToCreate = new Map<string, string[]>(); // new label -> appended codes array

            for (const item of unallocatedItems) {
                const sel = selections[item.code];
                if (!sel) continue;

                if (sel.type === 'existing' && sel.lineItemId) {
                    const codes = targetUpdates.get(sel.lineItemId) || [];
                    codes.push(item.code);
                    targetUpdates.set(sel.lineItemId, codes);
                } else if (sel.type === 'new' && sel.label.trim()) {
                    const codes = newLinesToCreate.get(sel.label.trim()) || [];
                    codes.push(item.code);
                    newLinesToCreate.set(sel.label.trim(), codes);
                }
            }

            // 1. Create new line items first
            for (const [label, codes] of newLinesToCreate.entries()) {
                const newLi = await addLineItemMut.mutateAsync({ budgetId, label, pursuitId });
                // We merge with the newly created line item's groups (which is empty, but just in case)
                await updateGroupsMut.mutateAsync({
                    lineItemId: newLi.id,
                    yardiCostGroups: codes,
                    pursuitId,
                });
            }

            // 2. Update existing line items
            for (const [lineItemId, codes] of targetUpdates.entries()) {
                const li = lineItems.find(l => l.id === lineItemId);
                if (!li) continue;
                
                const existingGroups = new Set(li.yardi_cost_groups || []);
                for (const code of codes) {
                    existingGroups.add(code);
                }
                
                await updateGroupsMut.mutateAsync({
                    lineItemId: li.id,
                    yardiCostGroups: Array.from(existingGroups),
                    pursuitId
                });
            }

            onClose();
        } catch (error) {
            console.error('Failed to map unallocated codes:', error);
            alert('Failed to map codes. Check console for details.');
        } finally {
            setIsSaving(false);
        }
    };

    const hasChanges = Object.values(selections).some(s => s.type === 'existing' || (s.type === 'new' && s.label.trim().length > 0));

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 opacity-100 transition-opacity">
            <div className="bg-[var(--bg-primary)] border border-[var(--border)] shadow-2xl rounded-xl w-full max-w-2xl flex flex-col max-h-[85vh] transform scale-100 transition-transform">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <Database className="w-4 h-4 text-orange-500" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Map Unallocated Costs</h2>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                Map standard Yardi detail codes to your pursuit budget.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors">
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
                                    return (
                                        <div key={item.code} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded font-bold">
                                                        {item.code}
                                                    </span>
                                                    <span className="text-sm font-medium text-[var(--text-primary)]">{item.name}</span>
                                                </div>
                                                <span className="text-xs font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                                                    {formatCurrency(item.total, 0)}
                                                </span>
                                            </div>

                                            <div className="flex flex-col gap-2 pl-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-[var(--text-secondary)] font-medium w-16">Map to:</span>
                                                    <select
                                                        className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
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
                                                    <div className="flex items-center gap-2 pl-[72px] mt-1 relative">
                                                        <div className="absolute left-[30px] top-[-14px] bottom-[14px] w-px bg-[var(--border)]" />
                                                        <div className="absolute left-[30px] bottom-[14px] w-4 h-px bg-[var(--border)]" />
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            placeholder="New line item name..."
                                                            value={sel.label}
                                                            onChange={(e) => handleNewLabelChange(item.code, e.target.value)}
                                                            className="flex-1 bg-[var(--bg-primary)] border border-[var(--accent)] rounded-md px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none shadow-sm"
                                                        />
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
                <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border)] shrink-0 bg-[var(--bg-card)]">
                    <span className="text-xs text-[var(--text-muted)]">
                        {Object.keys(selections).filter(k => {
                            const s = selections[k];
                            return s.type === 'existing' || (s.type === 'new' && s.label.trim().length > 0);
                        }).length} items ready to map
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
