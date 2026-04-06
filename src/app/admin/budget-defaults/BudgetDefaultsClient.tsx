'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const supabase = createClient();

interface DefaultLineItem {
    id: string;
    category: string;
    label: string;
    sort_order: number;
    yardi_cost_groups: string[];
}

export function BudgetDefaultsClient() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const [lineItems, setLineItems] = useState<DefaultLineItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('default_predev_budget_line_items')
            .select('*')
            .order('sort_order');
        if (!error && data) {
            setLineItems(data);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleAdd = async () => {
        setIsSaving(true);
        const sort_order = lineItems.length > 0 ? Math.max(...lineItems.map(l => l.sort_order)) + 1 : 1;
        const { data, error } = await supabase
            .from('default_predev_budget_line_items')
            .insert({ category: 'new_category', label: 'New Line Item', sort_order, yardi_cost_groups: [] })
            .select()
            .single();
            
        if (!error && data) {
            setLineItems([...lineItems, data]);
            setEditingId(data.id);
        }
        setIsSaving(false);
    };

    const handleDelete = async (id: string) => {
        setIsSaving(true);
        const { error } = await supabase.from('default_predev_budget_line_items').delete().eq('id', id);
        if (!error) setLineItems(lineItems.filter(l => l.id !== id));
        setIsSaving(false);
    };

    const handleUpdate = async (id: string, updates: Partial<DefaultLineItem>) => {
        // Optimistic
        setLineItems(lineItems.map(l => l.id === id ? { ...l, ...updates } : l));
        await supabase.from('default_predev_budget_line_items').update(updates).eq('id', id);
    };

    if (isLoading) {
        return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" /></div>;
    }

    return (
        <AppShell>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
                <div className="flex gap-2 -mt-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Key Date Types</Link>
                    <Link href="/admin/checklist-templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Checklists</Link>
                    <Link href="/admin/budget-defaults" className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium">Budget Defaults</Link>
                    <Link href="/admin/accounting" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Accounting</Link>
                </div>

                <div className="flex justify-between items-center bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)]">Pre-Dev Budget Defaults</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Manage the standard set of line items injected into all new Pre-Dev Budgets globally.</p>
                </div>
                <button
                    onClick={handleAdd}
                    disabled={isSaving}
                    className="btn btn-primary flex items-center gap-2"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Line Item
                </button>
            </div>

            <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
                <table className="w-full text-left text-sm text-[var(--text-secondary)]">
                    <thead className="bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)] border-b border-[var(--border)]">
                        <tr>
                            <th className="px-6 py-4 font-semibold w-16">Sort</th>
                            <th className="px-6 py-4 font-semibold">Label</th>
                            <th className="px-6 py-4 font-semibold">Category (ID)</th>
                            <th className="px-6 py-4 font-semibold w-64">Yardi Cost Groups (comma list)</th>
                            <th className="px-6 py-4 font-semibold text-right w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {lineItems.map((li) => (
                            <tr key={li.id} className="hover:bg-[var(--bg-elevated)] transition-colors">
                                <td className="px-6 py-4">
                                    <input 
                                        type="number" 
                                        defaultValue={li.sort_order}
                                        onBlur={(e) => handleUpdate(li.id, { sort_order: parseInt(e.target.value) || 0 })}
                                        className="w-12 bg-transparent outline-none border-b border-transparent focus:border-[var(--accent)]"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <input 
                                        type="text" 
                                        defaultValue={li.label}
                                        onBlur={(e) => handleUpdate(li.id, { label: e.target.value })}
                                        className="w-full bg-transparent font-medium text-[var(--text-primary)] outline-none border-b border-transparent focus:border-[var(--accent)]"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <input 
                                        type="text" 
                                        defaultValue={li.category}
                                        onBlur={(e) => handleUpdate(li.id, { category: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                                        className="w-full bg-transparent font-mono text-[10px] text-[var(--text-muted)] outline-none border-b border-transparent focus:border-[var(--accent)]"
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <input 
                                        type="text" 
                                        defaultValue={li.yardi_cost_groups.join(', ')}
                                        onBlur={(e) => {
                                            const codes = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                            handleUpdate(li.id, { yardi_cost_groups: codes })
                                        }}
                                        placeholder="e.g. 60-00275, 54"
                                        className="w-full bg-transparent font-mono text-xs text-[var(--text-primary)] outline-none border-b border-transparent focus:border-[var(--accent)]"
                                    />
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => handleDelete(li.id)}
                                        disabled={isSaving}
                                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded-md transition-colors disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {lineItems.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-[var(--text-muted)]">
                                    No default line items configured.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="p-4 bg-[var(--accent-bg)] text-[var(--accent)] rounded-lg text-sm flex items-start gap-3">
                <span className="shrink-0 text-xl block leading-none">💡</span>
                <p>
                    <strong>Note on Updates:</strong> Modifications made to these defaults will only affect <strong>newly created</strong> Pre-Development budgets. Any active pursuits that have already instantiated their budget will retain their original structures ensuring historical integrity.
                </p>
            </div>
            </div>
        </AppShell>
    );
}
