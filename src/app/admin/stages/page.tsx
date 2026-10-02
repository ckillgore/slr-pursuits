'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useStages, useUpsertStage } from '@/hooks/useSupabaseQueries';
import { Plus, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { DebouncedTextInput } from '@/components/shared/DebouncedTextInput';
import { ColorInput } from '@/components/shared/ColorInput';
import { useMutationErrorToast } from '@/components/shared/useMutationErrorToast';

export default function StagesPage() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const { data: stages = [], isLoading, isError } = useStages();
    const upsertMutation = useUpsertStage();
    useMutationErrorToast(upsertMutation.error, 'Failed to save stage');
    const sortedStages = useMemo(() => [...stages].sort((a, b) => a.sort_order - b.sort_order), [stages]);

    // Order matters: Analytics' funnel and "closed" detection follow sort_order.
    // Renumber the whole list so duplicate/gapped sort_orders can't make a move a no-op.
    const moveStage = (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= sortedStages.length) return;
        const next = [...sortedStages];
        [next[index], next[target]] = [next[target], next[index]];
        next.forEach((s, i) => {
            if (s.sort_order !== i + 1) upsertMutation.mutate({ id: s.id, sort_order: i + 1 });
        });
    };

    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#64748B');

    const handleAdd = () => {
        if (!newName.trim()) return;
        const maxOrder = sortedStages.length ? sortedStages[sortedStages.length - 1].sort_order : 0;
        upsertMutation.mutate({ name: newName.trim(), sort_order: maxOrder + 1, color: newColor, is_active: true, counts_toward_forecast: true });
        setNewName(''); setNewColor('#64748B'); setShowAdd(false);
    };

    return (
        <>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Pursuit Stages</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">
                            Order drives the Analytics funnel. &ldquo;In Forecast&rdquo; stages are the active pipeline; &ldquo;Out of Forecast&rdquo; stages are exits (a Closed/Won stage counts as a win).
                        </p>
                    </div>
                    <button onClick={() => setShowAdd(true)} className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> Add Stage
                    </button>
                </div>
                {isLoading && <div className="flex justify-center py-12" role="status" aria-label="Loading"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" /></div>}
                {isError && <p role="alert" className="text-sm text-[var(--danger)] py-4">Couldn&rsquo;t load stages. Refresh to try again.</p>}
                <div className="space-y-2">
                    {sortedStages.map((stage, index) => (
                        <div key={stage.id} className="card flex flex-wrap items-center gap-2 sm:gap-4">
                            <div className="flex flex-col -my-1">
                                <button onClick={() => moveStage(index, -1)} disabled={index === 0} aria-label={`Move ${stage.name} up`} title="Move up" className="p-0.5 rounded text-[var(--text-faint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed">
                                    <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => moveStage(index, 1)} disabled={index === sortedStages.length - 1} aria-label={`Move ${stage.name} down`} title="Move down" className="p-0.5 rounded text-[var(--text-faint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed">
                                    <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                            <DebouncedTextInput value={stage.name} aria-label="Stage name" onCommit={(v) => { if (v.trim()) upsertMutation.mutate({ id: stage.id, name: v.trim() }); }} className="flex-1 min-w-[120px] inline-input text-sm text-[var(--text-primary)] text-left" />
                            <ColorInput value={stage.color} aria-label={`${stage.name} color`} onCommit={(color) => upsertMutation.mutate({ id: stage.id, color })} className="w-8 h-8 rounded cursor-pointer border border-[var(--border)] bg-transparent" />
                            <span className="text-xs text-[var(--text-muted)] font-mono w-16 hidden sm:inline">{stage.color}</span>
                            <button onClick={() => upsertMutation.mutate({ id: stage.id, is_active: !stage.is_active })} title={stage.is_active ? 'Stage is offered in the stage picker' : 'Stage is hidden from the stage picker'} className={`text-xs px-2 py-0.5 rounded ${stage.is_active ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}>
                                {stage.is_active ? 'Active' : 'Inactive'}
                            </button>
                            {/* Separate from Active: a Dead/Passed stage stays selectable but its
                                pursuits drop out of the Pre-Dev spend forecast rollup. */}
                            <button onClick={() => upsertMutation.mutate({ id: stage.id, counts_toward_forecast: !stage.counts_toward_forecast })} title={stage.counts_toward_forecast ? 'Pursuits in this stage are included in the Pre-Dev spend forecast' : 'Pursuits in this stage are excluded from the Pre-Dev spend forecast'} className={`text-xs px-2 py-0.5 rounded ${stage.counts_toward_forecast ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}>
                                {stage.counts_toward_forecast ? 'In Forecast' : 'Out of Forecast'}
                            </button>
                        </div>
                    ))}
                </div>
                {showAdd && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onKeyDown={(e) => { if (e.key === 'Escape') setShowAdd(false); }}>
                        <div role="dialog" aria-modal="true" aria-labelledby="add-stage-title" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 id="add-stage-title" className="text-lg font-semibold text-[var(--text-primary)] mb-4">Add Pursuit Stage</h2>
                            <div className="space-y-4">
                                <div><label htmlFor="new-stage-name" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Stage Name</label><input id="new-stage-name" type="text" value={newName} onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none" autoFocus /></div>
                                <div><label htmlFor="new-stage-color" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Color</label>
                                    <div className="flex items-center gap-3"><input id="new-stage-color" type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-[var(--border)] bg-transparent" /><span className="text-sm text-[var(--text-muted)] font-mono">{newColor}</span></div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                                <button onClick={handleAdd} disabled={upsertMutation.isPending || !newName.trim()} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm">{upsertMutation.isPending ? 'Adding...' : 'Add Stage'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
