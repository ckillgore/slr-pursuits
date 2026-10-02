'use client';

import { useMemo, useState } from 'react';
import { History, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import {
    useOnePagerVersions,
    useSaveOnePagerVersion,
    useRestoreOnePagerVersion,
    useDeleteOnePagerVersion,
    useUsers,
} from '@/hooks/useSupabaseQueries';
import { useMutationErrorToast } from '@/components/shared/useMutationErrorToast';
import { toast } from '@/lib/toast';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/constants';
import type { OnePager, OnePagerVersion } from '@/types';

type Fmt = 'currency' | 'percent' | 'percent4' | 'number';

/** Assumptions and results worth showing in a version comparison. */
const COMPARE_FIELDS: { key: string; label: string; fmt: Fmt }[] = [
    { key: 'calc_yoc', label: 'Yield on cost', fmt: 'percent' },
    { key: 'calc_total_budget', label: 'Total budget', fmt: 'currency' },
    { key: 'calc_noi', label: 'NOI', fmt: 'currency' },
    { key: 'calc_cost_per_unit', label: 'Cost / unit', fmt: 'currency' },
    { key: 'total_units', label: 'Units', fmt: 'number' },
    { key: 'efficiency_ratio', label: 'Efficiency', fmt: 'percent' },
    { key: 'hard_cost_per_nrsf', label: 'Hard cost $/NRSF', fmt: 'currency' },
    { key: 'land_cost', label: 'Land cost', fmt: 'currency' },
    { key: 'soft_cost_pct', label: 'Soft cost %', fmt: 'percent' },
    { key: 'vacancy_rate', label: 'Vacancy', fmt: 'percent' },
    { key: 'other_income_per_unit_month', label: 'Other income $/unit/mo', fmt: 'currency' },
    { key: 'opex_utilities', label: 'Utilities', fmt: 'currency' },
    { key: 'opex_repairs_maintenance', label: 'Repairs & maintenance', fmt: 'currency' },
    { key: 'opex_contract_services', label: 'Contract services', fmt: 'currency' },
    { key: 'opex_marketing', label: 'Marketing', fmt: 'currency' },
    { key: 'opex_general_admin', label: 'General & admin', fmt: 'currency' },
    { key: 'opex_turnover', label: 'Turnover', fmt: 'currency' },
    { key: 'opex_misc', label: 'Misc. opex', fmt: 'currency' },
    { key: 'opex_insurance', label: 'Insurance', fmt: 'currency' },
    { key: 'opex_capex_reserves', label: 'CapEx reserves', fmt: 'currency' },
    { key: 'mgmt_fee_pct', label: 'Management fee', fmt: 'percent' },
    { key: 'payroll_burden_pct', label: 'Payroll burden', fmt: 'percent' },
    { key: 'tax_mil_rate', label: 'Tax rate', fmt: 'percent4' },
    { key: 'tax_assessed_pct_hard', label: 'Assessed % hard', fmt: 'percent' },
    { key: 'tax_assessed_pct_land', label: 'Assessed % land', fmt: 'percent' },
    { key: 'tax_assessed_pct_soft', label: 'Assessed % soft', fmt: 'percent' },
];

function fmt(v: unknown, f: Fmt): string {
    const n = Number(v);
    if (v == null || !Number.isFinite(n)) return '—';
    if (f === 'currency') return formatCurrency(n);
    if (f === 'percent') return formatPercent(n);
    if (f === 'percent4') return formatPercent(n, 3);
    return formatNumber(n);
}

function sameNumber(a: unknown, b: unknown): boolean {
    const x = Number(a ?? 0), y = Number(b ?? 0);
    return Math.abs(x - y) <= Math.max(1e-9, Math.abs(y) * 1e-9);
}

interface VersionsPanelProps {
    onePager: OnePager;
    /** Push any unsaved edits to the database before a snapshot is taken */
    flushPendingSaves: () => Promise<void>;
    onClose: () => void;
}

export function VersionsPanel({ onePager, flushPendingSaves, onClose }: VersionsPanelProps) {
    const { data: versions = [], isLoading } = useOnePagerVersions(onePager.id);
    const { data: users = [] } = useUsers();
    const saveVersion = useSaveOnePagerVersion();
    const restoreVersion = useRestoreOnePagerVersion();
    const deleteVersion = useDeleteOnePagerVersion();
    useMutationErrorToast(saveVersion.error, 'Failed to save version');
    useMutationErrorToast(restoreVersion.error, 'Failed to restore version');
    useMutationErrorToast(deleteVersion.error, 'Failed to delete version');

    const [label, setLabel] = useState('');
    const [compareId, setCompareId] = useState<string | null>(null);
    const userName = useMemo(() => new Map(users.map((u) => [u.id, u.full_name || u.email])), [users]);
    const compared = versions.find((v) => v.id === compareId) ?? null;

    const handleSave = async () => {
        await flushPendingSaves();
        await saveVersion.mutateAsync({ onePagerId: onePager.id, label });
        setLabel('');
        toast.success('Version saved');
    };

    const handleRestore = async (v: OnePagerVersion) => {
        if (!window.confirm(`Restore "${v.label}"? The current one-pager is saved as a version first, so you can switch back.`)) return;
        await flushPendingSaves();
        await restoreVersion.mutateAsync({ versionId: v.id, onePagerId: onePager.id });
        setCompareId(null);
        toast.success(`Restored "${v.label}"`);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-[var(--bg-overlay)]" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="versions-title"
                className="h-full w-full max-w-xl bg-[var(--bg-card)] border-l border-[var(--border)] shadow-xl flex flex-col animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <h2 id="versions-title" className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <History className="w-4 h-4" /> Versions
                    </h2>
                    <button onClick={onClose} aria-label="Close versions" className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-4 border-b border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)] mb-2">Save the one-pager as it is now — assumptions, unit mix, payroll, soft costs, premiums and other income.</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !saveVersion.isPending) void handleSave(); }}
                            placeholder='e.g., "Sent to IC" (blank = date and time)'
                            aria-label="Version name"
                            className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none"
                        />
                        <button onClick={() => void handleSave()} disabled={saveVersion.isPending} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium">
                            {saveVersion.isPending ? 'Saving…' : 'Save version'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                    {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" /></div>}
                    {!isLoading && versions.length === 0 && (
                        <p className="text-sm text-[var(--text-muted)] text-center py-8">No versions yet. Save one before a big change or before sending the numbers out.</p>
                    )}
                    {versions.map((v) => {
                        const isOpen = compareId === v.id;
                        return (
                            <div key={v.id} className={`rounded-lg border ${isOpen ? 'border-[var(--accent)]' : 'border-[var(--border)]'} p-3`}>
                                <div className="flex items-start justify-between gap-3">
                                    <button onClick={() => setCompareId(isOpen ? null : v.id)} className="text-left min-w-0 flex-1">
                                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{v.label}</div>
                                        <div className="text-[11px] text-[var(--text-muted)]">
                                            {new Date(v.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            {v.created_by && userName.get(v.created_by) ? ` · ${userName.get(v.created_by)}` : ''}
                                        </div>
                                        <div className="text-[11px] text-[var(--text-secondary)] mt-1 tabular-nums">
                                            YOC {fmt(v.calc_yoc, 'percent')} · {fmt(v.total_units, 'number')} units · Budget {fmt(v.calc_total_budget, 'currency')}
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button onClick={() => void handleRestore(v)} disabled={restoreVersion.isPending} title="Restore this version" aria-label={`Restore ${v.label}`} className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-elevated)] disabled:opacity-50">
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => { if (window.confirm(`Delete version "${v.label}"?`)) deleteVersion.mutate({ id: v.id, onePagerId: onePager.id }); }} title="Delete version" aria-label={`Delete ${v.label}`} className="p-1.5 rounded text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {isOpen && compared && <VersionDiff version={compared} current={onePager} />}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** What differs between a saved version and the one-pager now. */
function VersionDiff({ version, current }: { version: OnePagerVersion; current: OnePager }) {
    const then = version.snapshot.one_pager;
    const now = current as unknown as Record<string, unknown>;
    const changed = COMPARE_FIELDS.filter((f) => !sameNumber(then[f.key], now[f.key]));
    const rowCounts: [string, number][] = [
        ['Unit mix rows', version.snapshot.unit_mix.length],
        ['Payroll lines', version.snapshot.payroll.length],
        ['Premium lines', version.snapshot.unit_premiums.length],
        ['Other income lines', version.snapshot.other_income?.length ?? 0],
    ];

    return (
        <div className="mt-3 pt-3 border-t border-[var(--table-row-border)]">
            {changed.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Assumptions and results match the current one-pager.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                            <th className="text-left font-medium pb-1">Changed since</th>
                            <th className="text-right font-medium pb-1">This version</th>
                            <th className="text-right font-medium pb-1">Now</th>
                        </tr>
                    </thead>
                    <tbody>
                        {changed.map((f) => (
                            <tr key={f.key}>
                                <td className="py-0.5 text-[var(--text-secondary)]">{f.label}</td>
                                <td className="py-0.5 text-right tabular-nums text-[var(--text-muted)]">{fmt(then[f.key], f.fmt)}</td>
                                <td className="py-0.5 text-right tabular-nums font-medium text-[var(--text-primary)]">{fmt(now[f.key], f.fmt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p className="text-[10px] text-[var(--text-faint)] mt-2">
                Version has {rowCounts.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}.
            </p>
        </div>
    );
}
