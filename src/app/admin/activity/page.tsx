'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
    ACTIVITY_CATEGORIES, ACTIVITY_PAGE_SIZE, entityTypesFor, fetchActivity,
    type ActivityCategory, type ActivityFilters,
} from '@/lib/activity';
import { ActivityFeed, Avatar, personName, usePeople } from '@/components/admin/ActivityFeed';

const PERIODS = [
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
    { days: 90, label: '90 days' },
    { days: 0, label: 'All time' },
] as const;

const DAY = 86_400_000;

function localDayKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ActivityPage() {
    const { data: people = [] } = usePeople();
    const [actorId, setActorId] = useState<string>('');
    const [category, setCategory] = useState<ActivityCategory | ''>('');
    const [periodDays, setPeriodDays] = useState<number>(30);

    // Midnight-aligned so the query key stays stable across renders
    const since = useMemo(() => {
        if (!periodDays) return null;
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return new Date(d.getTime() - (periodDays - 1) * DAY).toISOString();
    }, [periodDays]);

    const filters: ActivityFilters = { actorId: actorId || null, category: category || null, since };

    const feed = useInfiniteQuery({
        queryKey: ['activity', filters],
        queryFn: ({ pageParam }) => fetchActivity(filters, pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => (last.length === ACTIVITY_PAGE_SIZE ? last.at(-1)!.last_at : undefined),
    });
    const entries = feed.data?.pages.flat() ?? [];

    // Chart + leaderboard: the period's entries, lightweight columns only
    const chartDays = periodDays || 90;
    const chartSince = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return new Date(d.getTime() - (chartDays - 1) * DAY).toISOString();
    }, [chartDays]);
    const { data: summaryRows = [], isLoading: summaryLoading } = useQuery({
        queryKey: ['activity-summary', chartSince, actorId, category],
        queryFn: async () => {
            let q = createClient().from('activity_log').select('actor_id, last_at').gte('last_at', chartSince).limit(20_000);
            if (actorId) q = q.eq('actor_id', actorId);
            if (category) q = q.in('entity_type', entityTypesFor(category));
            const { data, error } = await q;
            if (error) throw error;
            return (data ?? []) as { actor_id: string; last_at: string }[];
        },
    });

    const { bars, maxBar, leaders, total } = useMemo(() => {
        const counts = new Map<string, number>();
        const byActor = new Map<string, number>();
        for (const r of summaryRows) {
            const key = localDayKey(new Date(r.last_at));
            counts.set(key, (counts.get(key) ?? 0) + 1);
            byActor.set(r.actor_id, (byActor.get(r.actor_id) ?? 0) + 1);
        }
        const start = new Date(chartSince);
        const bars = Array.from({ length: chartDays }, (_, i) => {
            const d = new Date(start.getTime() + i * DAY);
            return { key: localDayKey(d), date: d, count: counts.get(localDayKey(d)) ?? 0 };
        });
        const leaders = [...byActor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
        return { bars, maxBar: Math.max(1, ...bars.map((b) => b.count)), leaders, total: summaryRows.length };
    }, [summaryRows, chartSince, chartDays]);

    const byId = new Map(people.map((p) => [p.id, p]));
    const chip = (on: boolean) =>
        `px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${on
            ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
            : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Activity</h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Every change to pursuits, one-pagers, budgets, comps, tasks and settings, and who made it. A run of edits to the same record by one person within half an hour shows as one entry.
                </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
                <select
                    aria-label="Person"
                    value={actorId}
                    onChange={(e) => setActorId(e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-primary)]"
                >
                    <option value="">Everyone</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{personName(p)}{p.is_active === false ? ' (deactivated)' : ''}</option>)}
                </select>
                <div className="flex gap-1" role="group" aria-label="Area">
                    <button className={chip(!category)} aria-pressed={!category} onClick={() => setCategory('')}>All</button>
                    {ACTIVITY_CATEGORIES.map((c) => (
                        <button key={c.value} className={chip(category === c.value)} aria-pressed={category === c.value} onClick={() => setCategory(c.value)}>{c.label}</button>
                    ))}
                </div>
                <div className="flex gap-1 sm:ml-auto" role="group" aria-label="Period">
                    {PERIODS.map((p) => (
                        <button key={p.days} className={chip(periodDays === p.days)} aria-pressed={periodDays === p.days} onClick={() => setPeriodDays(p.days)}>{p.label}</button>
                    ))}
                </div>
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-[1fr_16rem] mb-6">
                <div className="card">
                    <div className="flex items-baseline justify-between mb-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Entries per day{periodDays ? '' : ' · last 90 days'}</div>
                        <div className="text-sm text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)] tabular-nums">{summaryLoading ? '…' : total.toLocaleString()}</span> entries</div>
                    </div>
                    <div className="flex items-end gap-px h-24" role="img" aria-label={`Activity per day over ${chartDays} days`}>
                        {bars.map((b) => (
                            <div key={b.key} className="flex-1 h-full flex items-end" title={`${b.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${b.count}`}>
                                <div
                                    className="w-full rounded-sm"
                                    style={{ height: b.count ? `${Math.max(6, (b.count / maxBar) * 100)}%` : '2px', background: b.count ? 'var(--accent)' : 'var(--bg-elevated)', opacity: b.date.getDay() % 6 === 0 && !b.count ? 0.5 : 1 }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-[var(--text-faint)] mt-1.5">
                        <span>{bars[0]?.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        <span>Today</span>
                    </div>
                </div>
                <div className="card">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-3">Most active</div>
                    {leaders.length ? (
                        <ul className="space-y-2">
                            {leaders.map(([id, n]) => (
                                <li key={id}>
                                    <button onClick={() => setActorId(actorId === id ? '' : id)} className="w-full flex items-center gap-2 text-left rounded-md hover:bg-[var(--bg-elevated)] px-1 py-0.5">
                                        <Avatar id={id} name={personName(byId.get(id))} size={22} />
                                        <span className="flex-1 text-sm text-[var(--text-secondary)] truncate">{personName(byId.get(id))}</span>
                                        <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">{n}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-[var(--text-muted)]">{summaryLoading ? 'Loading…' : 'No activity in this period.'}</p>}
                </div>
            </div>

            {/* Feed */}
            <div className="card">
                {feed.isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" /></div>
                ) : feed.error ? (
                    <p className="text-sm text-[var(--danger)]">{(feed.error as Error).message}</p>
                ) : (
                    <>
                        <ActivityFeed entries={entries} emptyText="No activity matches these filters." />
                        {feed.hasNextPage && (
                            <div className="flex justify-center pt-4">
                                <button
                                    onClick={() => void feed.fetchNextPage()}
                                    disabled={feed.isFetchingNextPage}
                                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                                >
                                    {feed.isFetchingNextPage && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Load more
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
