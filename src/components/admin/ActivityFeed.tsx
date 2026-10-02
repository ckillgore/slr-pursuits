'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { changedParts, describe, entryHref, relativeTime, fetchPursuitNames, type ActivityEntry } from '@/lib/activity';

export interface Person {
    id: string;
    full_name: string | null;
    email: string | null;
    is_active?: boolean;
}

/** Everyone who has ever had an account, including deactivated people (their history stays readable) */
export function usePeople() {
    return useQuery({
        queryKey: ['people-all'],
        queryFn: async (): Promise<Person[]> => {
            const { data, error } = await createClient().from('user_profiles').select('id, full_name, email, is_active').order('full_name');
            if (error) throw error;
            return (data ?? []) as Person[];
        },
        staleTime: 5 * 60_000,
    });
}

/** The current time, refreshed every minute — for "5m ago" labels */
export function useNow(intervalMs = 60_000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(t);
    }, [intervalMs]);
    return now;
}

export function personName(p: Person | undefined): string {
    return p?.full_name || p?.email || 'Former user';
}

export function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/** A stable color per person so a busy feed is easy to scan */
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#0891B2', '#CA8A04', '#4F46E5'];
export function avatarColor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
    return (
        <span
            aria-hidden
            className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
            style={{ width: size, height: size, background: avatarColor(id), fontSize: Math.round(size * 0.38) }}
        >
            {initials(name)}
        </span>
    );
}

function dayHeading(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/**
 * Activity entries grouped by day. `showActor` is off when the feed is already
 * about one person.
 */
export function ActivityFeed({ entries, showActor = true, emptyText = 'No activity yet.' }: {
    entries: ActivityEntry[];
    showActor?: boolean;
    emptyText?: string;
}) {
    const { data: people = [] } = usePeople();
    const byId = new Map(people.map((p) => [p.id, p]));
    const now = useNow();

    // Entries inside a pursuit name it (one-pagers, budgets, tasks …)
    const pursuitIds = [...new Set(entries.filter((e) => e.pursuit_id && e.entity_type !== 'pursuit').map((e) => e.pursuit_id!))].sort();
    const { data: pursuitNames } = useQuery({
        queryKey: ['activity-pursuit-names', pursuitIds],
        queryFn: () => fetchPursuitNames(pursuitIds),
        enabled: pursuitIds.length > 0,
        staleTime: 5 * 60_000,
    });

    if (!entries.length) return <p className="text-sm text-[var(--text-muted)] py-6 text-center">{emptyText}</p>;

    const groups: { day: string; items: ActivityEntry[] }[] = [];
    for (const e of entries) {
        const day = dayHeading(e.last_at);
        if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(e);
        else groups.push({ day, items: [e] });
    }

    return (
        <div className="space-y-5">
            {groups.map((g) => (
                <section key={g.day}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-2">{g.day}</h3>
                    <ol className="space-y-1">
                        {g.items.map((e) => {
                            const person = byId.get(e.actor_id);
                            const name = personName(person);
                            const { verb, noun } = describe(e);
                            const parts = e.action === 'updated' ? changedParts(e) : [];
                            const href = entryHref(e);
                            const label = e.entity_label || `a ${noun}`;
                            const inPursuit = e.entity_type !== 'pursuit' && e.pursuit_id ? pursuitNames?.get(e.pursuit_id) : null;
                            return (
                                <li key={e.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-[var(--bg-elevated)]">
                                    {showActor && <Avatar id={e.actor_id} name={name} />}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-[var(--text-secondary)] leading-snug">
                                            {showActor && <span className="font-semibold text-[var(--text-primary)]">{name} </span>}
                                            {showActor ? verb.toLowerCase() : verb} {noun}{' '}
                                            {href ? (
                                                <Link href={href} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline">{label}</Link>
                                            ) : (
                                                <span className="font-medium text-[var(--text-primary)]">{label}</span>
                                            )}
                                            {inPursuit && <span className="text-[var(--text-muted)]"> · {inPursuit}</span>}
                                        </p>
                                        {(parts.length > 0 || e.change_count > 1) && (
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                                {parts.slice(0, 6).map((p) => (
                                                    <span key={p} className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[10px] text-[var(--text-muted)]">{p}</span>
                                                ))}
                                                {parts.length > 6 && <span className="text-[10px] text-[var(--text-faint)]">+{parts.length - 6} more</span>}
                                                {e.change_count > 1 && <span className="text-[10px] text-[var(--text-faint)]">· {e.change_count} saves</span>}
                                            </div>
                                        )}
                                    </div>
                                    <time dateTime={e.last_at} title={new Date(e.last_at).toLocaleString()} className="text-[11px] text-[var(--text-faint)] whitespace-nowrap tabular-nums pt-0.5">
                                        {relativeTime(e.last_at, now)}
                                    </time>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            ))}
        </div>
    );
}
