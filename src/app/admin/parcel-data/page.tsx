'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Square, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AdminNav } from '@/components/layout/AdminNav';
import { useAuth } from '@/components/AuthProvider';
import { fetchParcelRefreshTargets, saveRefreshedParcelData, type ParcelRefreshTarget } from '@/lib/supabase/queries';
import { formatNumber } from '@/lib/constants';
import { RegridUsageMeter, useRegridUsage, REGRID_USAGE_KEY, type RegridUsageLogRow } from '@/components/regrid/RegridUsageMeter';

// Regrid bills every parcel record returned. A coordinate lookup capped at this
// many records still finds the primary parcel; the plan includes 2,000/month,
// then $0.15 each.
const RECORDS_PER_LOOKUP = 5;

const PURPOSE_LABELS: Record<RegridUsageLogRow['purpose'], string> = {
    lookup: 'Parcel lookup',
    nearby: 'Nearby parcels',
    find: 'Find sites',
    refresh: 'Bulk refresh',
};

/** One line on what a logged call was for */
function usageDetail(row: RegridUsageLogRow): string {
    const d = row.detail ?? {};
    if (row.purpose === 'find') {
        const f = (d.filters ?? {}) as Record<string, unknown>;
        const parts = [
            f.acresMin != null || f.acresMax != null ? `${f.acresMin ?? 0}–${f.acresMax ?? '∞'} ac` : null,
            Array.isArray(f.zoningSubtypes) && f.zoningSubtypes.length ? (f.zoningSubtypes as string[]).join(', ') : null,
            f.zoningCode ? `zoning ~ ${f.zoningCode}` : null,
            f.noBuildings ? 'no buildings' : null,
            f.ownerContains ? `owner ~ ${f.ownerContains}` : null,
        ].filter(Boolean);
        return parts.join(' · ');
    }
    if (typeof d.address === 'string' && d.address) return d.address;
    if (typeof d.latitude === 'number' && typeof d.longitude === 'number') return `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}`;
    return '';
}

type Scope = 'missing' | 'all';
type RowResult = { status: 'updated' | 'none' | 'failed'; zoning?: string | null; records: number; message?: string };

export default function ParcelDataAdminPage() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const { data: targets = [], isLoading, refetch } = useQuery({ queryKey: ['parcel-refresh-targets'], queryFn: fetchParcelRefreshTargets });
    const { data: usageData, error: usageError } = useRegridUsage();
    const usage = usageData?.usage;
    const remaining = usage ? usage.recordLimit - usage.records : null;
    const [scope, setScope] = useState<Scope>('missing');
    const [running, setRunning] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [results, setResults] = useState<Record<string, RowResult>>({});
    const stopRef = useRef(false);

    const selected = useMemo(() => (scope === 'all' ? targets : targets.filter((t) => !t.has_parcel)), [targets, scope]);
    const maxRecords = selected.length * RECORDS_PER_LOOKUP;
    const done = Object.keys(results).length;
    const recordsUsed = Object.values(results).reduce((s, r) => s + r.records, 0);

    const refreshOne = async (t: ParcelRefreshTarget): Promise<RowResult> => {
        try {
            const res = await fetch('/api/regrid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: t.latitude, longitude: t.longitude, pointOnly: true, limit: RECORDS_PER_LOOKUP, purpose: 'refresh' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                // Out of included records: stop the run rather than fail every remaining pursuit
                if (data.code === 'regrid_budget') stopRef.current = true;
                return { status: 'failed', records: 0, message: data.error || `HTTP ${res.status}` };
            }
            const records = Number(data.recordsReturned) || 0;
            if (!data.parcel) return { status: 'none', records, message: 'No parcel at these coordinates' };
            await saveRefreshedParcelData(t.id, {
                parcel: data.parcel,
                associatedRecords: data.associatedRecords || [],
                taxSummary: data.taxSummary || null,
                buildings: data.buildings || [],
                queriedAt: [t.longitude, t.latitude],
            });
            return { status: 'updated', records, zoning: data.parcel.zoning?.code ?? null };
        } catch (err) {
            return { status: 'failed', records: 0, message: err instanceof Error ? err.message : 'Failed' };
        }
    };

    const run = async () => {
        setConfirming(false);
        setRunning(true);
        setResults({});
        stopRef.current = false;
        // One at a time: keeps Regrid usage predictable and lets Stop take effect quickly
        for (const t of selected) {
            if (stopRef.current) break;
            const r = await refreshOne(t);
            setResults((prev) => ({ ...prev, [t.id]: r }));
        }
        setRunning(false);
        await refetch();
        // Pursuit pages read parcel_data from the pursuit caches
        queryClient.invalidateQueries({ queryKey: ['pursuits'] });
        queryClient.invalidateQueries({ queryKey: REGRID_USAGE_KEY });
    };

    const counts = Object.values(results).reduce((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {} as Record<RowResult['status'], number>);

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <AdminNav />
                <div className="mb-6">
                    <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Parcel Data</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Re-fetch Regrid parcel data — owner, tax values, zoning code and link, land use, vacancy — for pursuits, by their map coordinates.
                        Each pursuit&apos;s AI summary and HUD rent data are kept.
                    </p>
                </div>

                <div className="card mb-4">
                    <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-2">Regrid usage this cycle</div>
                    {usage ? <RegridUsageMeter usage={usage} />
                        : usageError ? <p className="text-sm text-[var(--danger)]">{usageError.message}</p>
                        : <Loader2 className="w-4 h-4 animate-spin text-[var(--text-faint)]" />}
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                        Totals come from Regrid and cover every token on the account. Records past the included {usage ? formatNumber(usage.recordLimit) : '2,000'} cost $0.15 each;
                        the app stops searches that would go past it unless an admin allows it.
                    </p>
                </div>

                <div className="card mb-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-1.5">Pursuits</div>
                            <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-sm" role="radiogroup" aria-label="Which pursuits to refresh">
                                {([['missing', `Without parcel data (${targets.filter((t) => !t.has_parcel).length})`], ['all', `All with a location (${targets.length})`]] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        role="radio"
                                        aria-checked={scope === value}
                                        disabled={running}
                                        onClick={() => setScope(value)}
                                        className={`px-3 py-1.5 ${scope === value ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="text-sm text-[var(--text-secondary)]">
                            Uses up to <span className="font-semibold text-[var(--text-primary)]">{formatNumber(maxRecords)}</span> Regrid parcel records
                            {remaining != null && <span className="text-[var(--text-muted)]"> ({formatNumber(Math.max(0, remaining))} left this cycle)</span>}
                        </div>
                        <div className="ml-auto flex gap-2">
                            {running ? (
                                <button onClick={() => { stopRef.current = true; }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                                    <Square className="w-3.5 h-3.5" /> Stop
                                </button>
                            ) : (
                                <button onClick={() => setConfirming(true)} disabled={isLoading || selected.length === 0} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium">
                                    <RefreshCw className="w-3.5 h-3.5" /> Refresh {selected.length} pursuit{selected.length === 1 ? '' : 's'}
                                </button>
                            )}
                        </div>
                    </div>
                    {(running || done > 0) && (
                        <div className="mt-4 pt-3 border-t border-[var(--table-row-border)] text-sm text-[var(--text-secondary)] flex flex-wrap gap-x-5 gap-y-1" aria-live="polite">
                            <span>{running && <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-1" />}{done} of {selected.length} done</span>
                            <span>{counts.updated ?? 0} updated</span>
                            {!!counts.none && <span>{counts.none} no parcel found</span>}
                            {!!counts.failed && <span className="text-[var(--danger)]">{counts.failed} failed</span>}
                            <span>{formatNumber(recordsUsed)} records used</span>
                        </div>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" /></div>
                ) : (
                    <div className="card p-0 overflow-hidden">
                        <table className="data-table w-full">
                            <thead>
                                <tr><th className="text-left">Pursuit</th><th className="text-left">Last refreshed</th><th className="text-left">Result</th><th className="text-right">Records</th></tr>
                            </thead>
                            <tbody>
                                {selected.map((t) => {
                                    const r = results[t.id];
                                    return (
                                        <tr key={t.id}>
                                            <td>
                                                <Link href={`/pursuits/${t.short_id}?tab=publicinfo`} className="text-sm text-[var(--text-primary)] hover:text-[var(--accent)]">{t.name}</Link>
                                                <div className="text-[11px] text-[var(--text-muted)]">{[t.city, t.state].filter(Boolean).join(', ')}</div>
                                            </td>
                                            <td className="text-xs text-[var(--text-muted)]">{t.parcel_data_updated_at ? new Date(t.parcel_data_updated_at).toLocaleDateString() : 'Never'}</td>
                                            <td className="text-xs">
                                                {!r ? <span className="text-[var(--text-faint)]">—</span>
                                                    : r.status === 'updated' ? <span className="inline-flex items-center gap-1 text-[var(--success)]"><CheckCircle2 className="w-3.5 h-3.5" /> Updated{r.zoning ? ` · ${r.zoning}` : ''}</span>
                                                    : r.status === 'none' ? <span className="inline-flex items-center gap-1 text-[var(--text-muted)]"><MinusCircle className="w-3.5 h-3.5" /> {r.message}</span>
                                                    : <span className="inline-flex items-center gap-1 text-[var(--danger)]"><AlertTriangle className="w-3.5 h-3.5" /> {r.message}</span>}
                                            </td>
                                            <td className="text-right text-xs tabular-nums text-[var(--text-muted)]">{r ? r.records : ''}</td>
                                        </tr>
                                    );
                                })}
                                {selected.length === 0 && (
                                    <tr><td colSpan={4} className="text-center text-sm text-[var(--text-muted)] py-8">Every pursuit with a location already has parcel data.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {!!usageData?.log.length && (
                    <div className="mt-8">
                        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Who used records this cycle</h2>
                        <p className="text-xs text-[var(--text-muted)] mb-3">
                            Calls made through this app since logging began. Regrid&apos;s total can be higher — it also counts other tokens and tools such as the Regrid MCP.
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(usageData.log.reduce((acc, r) => ({ ...acc, [r.user_name]: (acc[r.user_name] ?? 0) + r.records }), {} as Record<string, number>))
                                .sort((a, b) => b[1] - a[1])
                                .map(([name, records]) => (
                                    <span key={name} className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
                                        {name} <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatNumber(records)}</span>
                                    </span>
                                ))}
                        </div>
                        <div className="card p-0 overflow-hidden">
                            <table className="data-table w-full">
                                <thead>
                                    <tr><th className="text-left">When</th><th className="text-left">Who</th><th className="text-left">What</th><th className="text-right">Records</th></tr>
                                </thead>
                                <tbody>
                                    {usageData.log.slice(0, 100).map((r) => (
                                        <tr key={r.id}>
                                            <td className="text-xs text-[var(--text-muted)] whitespace-nowrap">{new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                                            <td className="text-xs text-[var(--text-secondary)]">{r.user_name}</td>
                                            <td className="text-xs">
                                                <div className="text-[var(--text-primary)]">{PURPOSE_LABELS[r.purpose] ?? r.purpose}</div>
                                                <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[22rem]">{usageDetail(r)}</div>
                                            </td>
                                            <td className="text-right text-xs tabular-nums text-[var(--text-secondary)]">{formatNumber(r.records)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {confirming && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onKeyDown={(e) => { if (e.key === 'Escape') setConfirming(false); }}>
                        <div role="dialog" aria-modal="true" aria-labelledby="refresh-confirm-title" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 id="refresh-confirm-title" className="text-lg font-semibold text-[var(--text-primary)] mb-2">Refresh parcel data?</h2>
                            <p className="text-sm text-[var(--text-secondary)]">
                                Looks up {selected.length} pursuit{selected.length === 1 ? '' : 's'} on Regrid by map coordinates, using up to {formatNumber(maxRecords)} parcel records (typically 1–3 per pursuit).
                                {remaining != null && <> {formatNumber(Math.max(0, remaining))} are left this cycle; lookups stop when they run out.</>}
                            </p>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">Cancel</button>
                                <button onClick={() => void run()} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium">Refresh</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
