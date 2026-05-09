'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AdminNav } from '@/components/layout/AdminNav';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useChecklistTemplates, useUpsertChecklistTemplate } from '@/hooks/useSupabaseQueries';
import { Plus, Loader2, ChevronDown, ChevronRight, FileCheck2 } from 'lucide-react';

export default function ChecklistTemplatesPage() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const { data: templates = [], isLoading } = useChecklistTemplates();
    const upsertMutation = useUpsertChecklistTemplate();

    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleAdd = () => {
        if (!newName.trim()) return;
        upsertMutation.mutate(
            { name: newName.trim(), description: newDescription.trim() || null, is_active: true, is_default: false, version: 1 },
            { onSuccess: () => { setNewName(''); setNewDescription(''); setShowAdd(false); } }
        );
    };

    useEffect(() => {
        document.title = 'Checklists | Admin | SLR Pursuits';
    }, []);

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <AdminNav />
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Checklist Templates</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1">Define standard due diligence checklists that can be applied to pursuits.</p>
                    </div>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> New Template
                    </button>
                </div>

                {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--border-strong)]" /></div>}

                <div className="space-y-2">
                    {templates.map((t) => (
                        <div key={t.id} className="card">
                            <div className="flex items-center justify-between">
                                <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="flex items-center gap-2 text-left">
                                    {expandedId === t.id ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                                    <div>
                                        <div className="text-sm font-semibold text-[var(--text-primary)]">{t.name}</div>
                                        {t.description && <div className="text-xs text-[var(--text-muted)]">{t.description}</div>}
                                    </div>
                                </button>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-[var(--text-faint)] font-mono">v{t.version}</span>
                                    {t.is_default && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-[var(--accent-subtle)] text-[var(--accent)]">Default</span>
                                    )}
                                    <button
                                        onClick={() => upsertMutation.mutate({ id: t.id, is_active: !t.is_active })}
                                        className={`text-xs px-2 py-0.5 rounded ${t.is_active ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}
                                    >
                                        {t.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                </div>
                            </div>
                            {expandedId === t.id && (
                                <div className="mt-4 pt-4 border-t border-[var(--table-row-border)] animate-fade-in">
                                    <p className="text-xs text-[var(--text-muted)] mb-3">
                                        To edit this template&apos;s phases, tasks, and checklist items, apply it to a pursuit from the Checklist tab on the pursuit detail page.
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <span className="text-xs text-[var(--text-muted)]">Template Name</span>
                                            <input
                                                type="text"
                                                defaultValue={t.name}
                                                onBlur={(e) => {
                                                    if (e.target.value !== t.name) {
                                                        upsertMutation.mutate({ id: t.id, name: e.target.value });
                                                    }
                                                }}
                                                className="w-full inline-input text-xs text-left"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-xs text-[var(--text-muted)]">Description</span>
                                            <input
                                                type="text"
                                                defaultValue={t.description ?? ''}
                                                onBlur={(e) => {
                                                    if (e.target.value !== (t.description ?? '')) {
                                                        upsertMutation.mutate({ id: t.id, description: e.target.value || null });
                                                    }
                                                }}
                                                className="w-full inline-input text-xs text-left"
                                                placeholder="Optional description..."
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={t.is_default}
                                                onChange={() => upsertMutation.mutate({ id: t.id, is_default: !t.is_default })}
                                                className="rounded border-[var(--border)]"
                                            />
                                            Set as default template
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {!isLoading && templates.length === 0 && (
                    <div className="card flex flex-col items-center py-12 text-center">
                        <FileCheck2 className="w-10 h-10 text-[var(--border-strong)] mb-3" />
                        <p className="text-sm text-[var(--text-muted)]">No checklist templates yet. Create one to define a standard due diligence workflow.</p>
                    </div>
                )}
            </div>

            {/* Add Template Dialog */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">New Checklist Template</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Template Name <span className="text-[var(--danger)]">*</span></label>
                                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder='e.g., "Standard Due Diligence"' className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none" autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Description</label>
                                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Optional description of this template..." rows={3} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none resize-none" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                            <button onClick={handleAdd} disabled={!newName.trim() || upsertMutation.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm">{upsertMutation.isPending ? 'Creating...' : 'Create'}</button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
