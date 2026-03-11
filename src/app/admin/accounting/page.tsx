'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePursuits, usePursuitAccountingEntities, useUpsertPursuitAccountingEntity, useDeletePursuitAccountingEntity } from '@/hooks/useSupabaseQueries';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { DebouncedTextInput } from '@/components/shared/DebouncedTextInput';
import { YardiPropertySelect, YardiJobSelect } from '@/components/accounting/YardiEntitySelect';

export default function AccountingAdminPage() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const { data: pursuits = [], isLoading: pursuitsLoading } = usePursuits();
    const { data: entities = [], isLoading: entitiesLoading } = usePursuitAccountingEntities();
    
    const upsertEntity = useUpsertPursuitAccountingEntity();
    const deleteEntity = useDeletePursuitAccountingEntity();

    const [showAdd, setShowAdd] = useState(false);
    const [newPursuitId, setNewPursuitId] = useState('');
    const [newPropertyCode, setNewPropertyCode] = useState('');
    const [newJobId, setNewJobId] = useState('');

    const handleAdd = () => {
        if (!newPursuitId || !newPropertyCode.trim()) return;
        upsertEntity.mutate({
            pursuit_id: newPursuitId,
            property_code: newPropertyCode.trim(),
            job_id: newJobId.trim() ? parseInt(newJobId.trim(), 10) : null,
            is_primary: true
        }, {
            onSuccess: () => {
                setShowAdd(false);
                setNewPursuitId('');
                setNewPropertyCode('');
                setNewJobId('');
            }
        });
    };

    const isLoading = pursuitsLoading || entitiesLoading;

    // Filter out archived pursuits for the select dropdown
    const activePursuits = pursuits.filter(p => !p.is_archived).sort((a, b) => a.name.localeCompare(b.name));

    return (
        <AppShell>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {/* Navigation Header */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Key Date Types</Link>
                    <Link href="/admin/checklist-templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Checklists</Link>
                    <Link href="/admin/accounting" className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium">Accounting</Link>
                </div>

                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Yardi Accounting Mapping</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1">Map Pursuit entries to Yardi General Ledger Property Codes and Job IDs.</p>
                    </div>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> Link Property
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--border-strong)]" />
                    </div>
                ) : (
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table w-full text-left border-collapse">
                                <thead>
                                    <tr>
                                        <th className="py-3 px-4 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border)]">Pursuit Name</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border)]">Property Code</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border)]">Job ID</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border)] w-16"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entities.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-[var(--text-muted)] text-sm">
                                                No properties mapped. Click "Link Property" to map an entity.
                                            </td>
                                        </tr>
                                    ) : (
                                        entities.map((entity) => {
                                            const pursuit = pursuits.find(p => p.id === entity.pursuit_id);
                                            return (
                                                <tr key={entity.id} className="hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--table-row-border)] last:border-b-0">
                                                    <td className="py-3 px-4 text-sm font-medium text-[var(--text-primary)]">
                                                        {pursuit?.name || 'Unknown Pursuit'}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <DebouncedTextInput
                                                            value={entity.property_code}
                                                            placeholder="e.g. 110000194"
                                                            className="inline-input text-sm w-full"
                                                            onCommit={(val) => upsertEntity.mutate({ id: entity.id, pursuit_id: entity.pursuit_id, property_code: val })}
                                                        />
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <DebouncedTextInput
                                                            value={entity.job_id?.toString() || ''}
                                                            placeholder="e.g. 1500"
                                                            className="inline-input text-sm w-32"
                                                            onCommit={(val) => upsertEntity.mutate({ id: entity.id, pursuit_id: entity.pursuit_id, property_code: entity.property_code, job_id: val ? parseInt(val, 10) : null })}
                                                        />
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        <button 
                                                            onClick={() => {
                                                                if (confirm('Are you sure you want to unlink this property?')) {
                                                                    deleteEntity.mutate({ id: entity.id, pursuit_id: entity.pursuit_id });
                                                                }
                                                            }}
                                                            className="text-[var(--border-strong)] hover:text-[var(--danger)] transition-colors p-1"
                                                            title="Unlink"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Mapping Dialog */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Link Yardi Property</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Pursuit <span className="text-[var(--danger)]">*</span></label>
                                <select 
                                    value={newPursuitId} 
                                    onChange={(e) => setNewPursuitId(e.target.value)} 
                                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                >
                                    <option value="">Select a pursuit...</option>
                                    {activePursuits.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Property Code <span className="text-[var(--danger)]">*</span></label>
                                <YardiPropertySelect 
                                    value={newPropertyCode}
                                    onChange={setNewPropertyCode}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Job ID (optional)</label>
                                <YardiJobSelect 
                                    value={newJobId}
                                    onChange={setNewJobId}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                            <button 
                                onClick={handleAdd} 
                                disabled={!newPursuitId || !newPropertyCode.trim() || upsertEntity.isPending} 
                                className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                {upsertEntity.isPending ? 'Linking...' : 'Link Property'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
