'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useProductTypes, useUpsertProductType } from '@/hooks/useSupabaseQueries';
import Link from 'next/link';
import { Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

export default function ProductTypesPage() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const { data: productTypes = [], isLoading } = useProductTypes();
    const upsertMutation = useUpsertProductType();

    const [expanded, setExpanded] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newLow, setNewLow] = useState('');
    const [newHigh, setNewHigh] = useState('');

    const handleAdd = () => {
        if (!newName.trim()) return;
        upsertMutation.mutate({ name: newName.trim(), density_low: parseFloat(newLow) || 0, density_high: parseFloat(newHigh) || 0, sort_order: productTypes.length + 1, is_active: true });
        setNewName(''); setNewLow(''); setNewHigh(''); setShowAdd(false);
    };

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Key Date Types</Link>
                    <Link href="/admin/checklist-templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Checklists</Link>
                </div>
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Product Types</h1>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> Add Product Type
                    </button>
                </div>
                {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--border-strong)]" /></div>}
                <div className="space-y-2">
                    {productTypes.sort((a, b) => a.sort_order - b.sort_order).map((pt) => (
                        <div key={pt.id} className="card">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <button onClick={() => setExpanded(expanded === pt.id ? null : pt.id)} className="flex items-center gap-2 text-[var(--text-primary)] font-medium">
                                    {expanded === pt.id ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}{pt.name}
                                </button>
                                <div className="flex items-center gap-2 sm:gap-4 text-sm text-[var(--text-muted)] flex-wrap">
                                    <span className="text-xs">{pt.density_low}–{pt.density_high} units/acre</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${pt.is_active ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}>{pt.is_active ? 'Active' : 'Inactive'}</span>
                                    <button onClick={() => upsertMutation.mutate({ id: pt.id, is_active: !pt.is_active })} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">{pt.is_active ? 'Deactivate' : 'Activate'}</button>
                                </div>
                            </div>
                            {expanded === pt.id && (
                                <div className="mt-4 pl-6 space-y-2 animate-fade-in">
                                    <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-2">Sub-Product Types</div>
                                    {pt.sub_product_types && pt.sub_product_types.length > 0 ? pt.sub_product_types.map((spt) => (
                                        <div key={spt.id} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-[var(--bg-primary)] border border-[var(--table-row-border)] text-sm text-[var(--text-secondary)]">
                                            {spt.name}
                                            <span className={`text-xs ${spt.is_active ? 'text-[var(--success)]' : 'text-[var(--text-faint)]'}`}>{spt.is_active ? 'Active' : 'Inactive'}</span>
                                        </div>
                                    )) : <div className="text-xs text-[var(--text-faint)]">No sub-types defined</div>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                {showAdd && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Add Product Type</h2>
                            <div className="space-y-4">
                                <div><label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Name</label><input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none" autoFocus /></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Density Low</label><input type="number" value={newLow} onChange={(e) => setNewLow(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" /></div>
                                    <div><label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Density High</label><input type="number" value={newHigh} onChange={(e) => setNewHigh(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" /></div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                                <button onClick={handleAdd} disabled={upsertMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">{upsertMutation.isPending ? 'Adding...' : 'Add'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
