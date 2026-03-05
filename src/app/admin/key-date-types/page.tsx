'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useKeyDateTypes, useUpsertKeyDateType } from '@/hooks/useSupabaseQueries';
import Link from 'next/link';
import { Plus, GripVertical, Loader2 } from 'lucide-react';
import { DebouncedTextInput } from '@/components/shared/DebouncedTextInput';
import type { KeyDateCategory } from '@/types';

export default function KeyDateTypesPage() {
    const { data: types = [], isLoading } = useKeyDateTypes();
    const upsertMutation = useUpsertKeyDateType();

    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCategory, setNewCategory] = useState<KeyDateCategory>('contract');
    const [newColor, setNewColor] = useState('var(--text-secondary)');

    const handleAdd = () => {
        if (!newName.trim()) return;
        upsertMutation.mutate({
            name: newName.trim(),
            category: newCategory,
            sort_order: types.length + 1,
            color: newColor,
            is_active: true,
        });
        setNewName('');
        setNewCategory('contract');
        setNewColor('var(--text-secondary)');
        setShowAdd(false);
    };

    const contractTypes = types.filter(t => t.category === 'contract').sort((a, b) => a.sort_order - b.sort_order);
    const predevTypes = types.filter(t => t.category === 'pre_development').sort((a, b) => a.sort_order - b.sort_order);

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium">Key Date Types</Link>
                    <Link href="/admin/checklist-templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Checklists</Link>
                </div>
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Key Date Types</h1>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> Add Type
                    </button>
                </div>

                {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--border-strong)]" /></div>}

                {/* Contract Types */}
                {contractTypes.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Contract</h3>
                        <div className="space-y-2">
                            {contractTypes.map((t) => (
                                <div key={t.id} className="card flex flex-wrap items-center gap-2 sm:gap-4">
                                    <GripVertical className="w-4 h-4 text-[var(--border-strong)] cursor-grab" />
                                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                    <DebouncedTextInput value={t.name} onCommit={(v) => upsertMutation.mutate({ id: t.id, name: v })} className="flex-1 min-w-[120px] inline-input text-sm text-[var(--text-primary)] text-left" />
                                    <input type="color" value={t.color} onChange={(e) => upsertMutation.mutate({ id: t.id, color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border border-[var(--border)] bg-transparent" />
                                    <span className="text-xs text-[var(--text-faint)] font-mono w-16 hidden sm:inline">{t.color}</span>
                                    <button onClick={() => upsertMutation.mutate({ id: t.id, is_active: !t.is_active })} className={`text-xs px-2 py-0.5 rounded ${t.is_active ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}>
                                        {t.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pre-Development Types */}
                {predevTypes.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Pre-Development</h3>
                        <div className="space-y-2">
                            {predevTypes.map((t) => (
                                <div key={t.id} className="card flex flex-wrap items-center gap-2 sm:gap-4">
                                    <GripVertical className="w-4 h-4 text-[var(--border-strong)] cursor-grab" />
                                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                    <DebouncedTextInput value={t.name} onCommit={(v) => upsertMutation.mutate({ id: t.id, name: v })} className="flex-1 min-w-[120px] inline-input text-sm text-[var(--text-primary)] text-left" />
                                    <input type="color" value={t.color} onChange={(e) => upsertMutation.mutate({ id: t.id, color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border border-[var(--border)] bg-transparent" />
                                    <span className="text-xs text-[var(--text-faint)] font-mono w-16 hidden sm:inline">{t.color}</span>
                                    <button onClick={() => upsertMutation.mutate({ id: t.id, is_active: !t.is_active })} className={`text-xs px-2 py-0.5 rounded ${t.is_active ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}>
                                        {t.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Add Dialog */}
                {showAdd && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Add Key Date Type</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Name</label>
                                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none" autoFocus />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Category</label>
                                    <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as KeyDateCategory)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none">
                                        <option value="contract">Contract</option>
                                        <option value="pre_development">Pre-Development</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Color</label>
                                    <div className="flex items-center gap-3">
                                        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-[var(--border)] bg-transparent" />
                                        <span className="text-sm text-[var(--text-muted)] font-mono">{newColor}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                                <button onClick={handleAdd} disabled={upsertMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
                                    {upsertMutation.isPending ? 'Adding...' : 'Add Type'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
