'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useTaxJurisdictions, useUpsertTaxJurisdiction, useDeleteTaxJurisdiction } from '@/hooks/useSupabaseQueries';
import { AdminNav } from '@/components/layout/AdminNav';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { DebouncedTextInput } from '@/components/shared/DebouncedTextInput';
import { InlineInput } from '@/components/one-pager/InlineInput';
import { useMutationErrorToast } from '@/components/shared/useMutationErrorToast';
import { DEFAULT_ASSUMPTIONS } from '@/lib/constants';
import type { TaxJurisdiction } from '@/types';

const inputClass = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none';
const labelClass = 'block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider';

export default function TaxRatesPage() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const { data: jurisdictions = [], isLoading } = useTaxJurisdictions();
    const upsertMutation = useUpsertTaxJurisdiction();
    const deleteMutation = useDeleteTaxJurisdiction();
    useMutationErrorToast(upsertMutation.error, 'Failed to save tax rate');
    useMutationErrorToast(deleteMutation.error, 'Failed to delete tax rate');

    const [showAdd, setShowAdd] = useState(false);
    const [newState, setNewState] = useState('');
    const [newCounty, setNewCounty] = useState('');
    const [newCity, setNewCity] = useState('');
    const [newRatePct, setNewRatePct] = useState('');

    const byState = useMemo(() => {
        const groups = new Map<string, TaxJurisdiction[]>();
        jurisdictions.forEach((j) => groups.set(j.state, [...(groups.get(j.state) ?? []), j]));
        return [...groups.entries()];
    }, [jurisdictions]);

    const update = (id: string, field: keyof TaxJurisdiction, value: number | string | boolean | null) =>
        upsertMutation.mutate({ id, [field]: value });

    const handleAdd = () => {
        const rate = parseFloat(newRatePct);
        if (!newState.trim() || !newCounty.trim() || !Number.isFinite(rate)) return;
        upsertMutation.mutate({
            state: newState.trim(),
            county: newCounty.trim(),
            city: newCity.trim() || null,
            tax_rate: rate / 100,
            assessed_pct_hard: DEFAULT_ASSUMPTIONS.tax_assessed_pct_hard,
            assessed_pct_land: DEFAULT_ASSUMPTIONS.tax_assessed_pct_land,
            assessed_pct_soft: DEFAULT_ASSUMPTIONS.tax_assessed_pct_soft,
            is_verified: true,
        });
        setNewState(''); setNewCounty(''); setNewCity(''); setNewRatePct('');
        setShowAdd(false);
    };

    const unverified = jurisdictions.filter((j) => !j.is_verified).length;

    return (
        <AppShell>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <AdminNav />
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Property Tax Rates</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                            Effective rate and assessed % by city, or county-wide when the city is blank. New one-pagers take the rate for their pursuit&apos;s location; existing ones can apply it from the Property Tax card.
                        </p>
                        {unverified > 0 && (
                            <p className="text-xs text-[var(--warning)] mt-2">
                                {unverified} rate{unverified === 1 ? '' : 's'} came from past one-pagers and haven&apos;t been checked against the current millage.
                            </p>
                        )}
                    </div>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm flex-shrink-0">
                        <Plus className="w-4 h-4" /> Add Rate
                    </button>
                </div>

                {isLoading && <div className="flex justify-center py-12" role="status" aria-label="Loading"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" /></div>}

                {byState.map(([state, rows]) => (
                    <div key={state} className="mb-6">
                        <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">{state}</h3>
                        <div className="space-y-2">
                            {rows.map((j) => (
                                <div key={j.id} className="card">
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <div className="flex-1 min-w-[180px]">
                                            <DebouncedTextInput value={j.city ?? ''} placeholder="County-wide" aria-label="City" onCommit={(v) => update(j.id, 'city', v.trim() || null)} className="inline-input text-sm font-semibold text-[var(--text-primary)] w-full" style={{ textAlign: 'left' }} />
                                            <DebouncedTextInput value={j.county} aria-label="County" onCommit={(v) => { if (v.trim()) update(j.id, 'county', v.trim()); }} className="inline-input text-xs text-[var(--text-muted)] w-full" style={{ textAlign: 'left' }} />
                                        </div>
                                        <label className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                                            Rate
                                            <InlineInput value={j.tax_rate} onChange={(v) => update(j.id, 'tax_rate', v)} format="percent" decimals={4} className="w-24 text-sm font-medium" />
                                        </label>
                                        <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                                            Assessed
                                            <InlineInput value={j.assessed_pct_hard} onChange={(v) => update(j.id, 'assessed_pct_hard', v)} format="percent" decimals={0} className="w-14 text-sm" />
                                            <span className="text-[var(--text-faint)]">/</span>
                                            <InlineInput value={j.assessed_pct_land} onChange={(v) => update(j.id, 'assessed_pct_land', v)} format="percent" decimals={0} className="w-14 text-sm" />
                                            <span className="text-[var(--text-faint)]">/</span>
                                            <InlineInput value={j.assessed_pct_soft} onChange={(v) => update(j.id, 'assessed_pct_soft', v)} format="percent" decimals={0} className="w-14 text-sm" />
                                            <span className="text-[10px] text-[var(--text-faint)] hidden sm:inline">hard / land / soft</span>
                                        </div>
                                        <div className="flex items-center gap-3 ml-auto">
                                            <button onClick={() => update(j.id, 'is_verified', !j.is_verified)} className={`text-xs px-2 py-0.5 rounded ${j.is_verified ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--warning-bg)] text-[var(--warning)]'}`}>
                                                {j.is_verified ? 'Verified' : 'Unverified'}
                                            </button>
                                            <button onClick={() => { if (confirm(`Delete the tax rate for ${j.city || j.county}?`)) deleteMutation.mutate(j.id); }} aria-label="Delete tax rate" className="text-[var(--border-strong)] hover:text-[var(--danger)] transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <DebouncedTextInput value={j.notes ?? ''} placeholder="Source / notes" aria-label="Notes" onCommit={(v) => update(j.id, 'notes', v.trim() || null)} className="inline-input text-xs text-[var(--text-muted)] w-full mt-2" style={{ textAlign: 'left' }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {!isLoading && jurisdictions.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)] text-center py-12">No tax rates on file yet.</p>
                )}

                {showAdd && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onKeyDown={(e) => { if (e.key === 'Escape') setShowAdd(false); }}>
                        <div role="dialog" aria-modal="true" aria-labelledby="add-tax-rate-title" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 id="add-tax-rate-title" className="text-lg font-semibold text-[var(--text-primary)] mb-4">Add Tax Rate</h2>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="new-tax-state" className={labelClass}>State</label>
                                    <input id="new-tax-state" type="text" value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="e.g., Texas" className={inputClass} autoFocus />
                                </div>
                                <div>
                                    <label htmlFor="new-tax-county" className={labelClass}>County</label>
                                    <input id="new-tax-county" type="text" value={newCounty} onChange={(e) => setNewCounty(e.target.value)} placeholder="e.g., Dallas County" className={inputClass} />
                                </div>
                                <div>
                                    <label htmlFor="new-tax-city" className={labelClass}>City</label>
                                    <input id="new-tax-city" type="text" value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="Leave blank for county-wide" className={inputClass} />
                                </div>
                                <div>
                                    <label htmlFor="new-tax-rate" className={labelClass}>Effective Rate (%)</label>
                                    <input id="new-tax-rate" type="number" step="0.0001" value={newRatePct} onChange={(e) => setNewRatePct(e.target.value)} placeholder="e.g., 2.235" className={inputClass} />
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1">Assessed % starts at 90 / 100 / 0 (hard / land / soft); edit it on the row.</p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                                <button onClick={handleAdd} disabled={upsertMutation.isPending || !newState.trim() || !newCounty.trim() || !Number.isFinite(parseFloat(newRatePct))} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm">
                                    {upsertMutation.isPending ? 'Adding...' : 'Add Rate'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
