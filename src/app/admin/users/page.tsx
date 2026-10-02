'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Loader2, AlertCircle, Mail, Search, X, KeyRound, Check } from 'lucide-react';
import { toast } from '@/lib/toast';
import { fetchActivity, relativeTime } from '@/lib/activity';
import { ActivityFeed, Avatar, useNow } from '@/components/admin/ActivityFeed';

type Role = 'owner' | 'admin' | 'member';

interface TeamMember {
    id: string;
    email: string;
    full_name: string;
    role: Role;
    is_active: boolean;
    invited_at: string | null;
    created_at: string | null;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    last_active_at: string | null;
    active_days_30: number;
    edits_30: number;
    changes_30: number;
    edits_total: number;
}

interface TeamResponse {
    users: TeamMember[];
    canManage: boolean;
    me: string;
}

type StatusFilter = 'all' | 'active' | 'pending' | 'deactivated';

const ROLE_INFO: Record<Role, { label: string; description: string }> = {
    owner: { label: 'Owner', description: 'Everything, including managing people' },
    admin: { label: 'Admin', description: 'Everything except managing people' },
    member: { label: 'Member', description: 'Pursuits, one-pagers, comps, tasks and reports' },
};

const WEEK = 7 * 86_400_000;

function status(u: TeamMember): 'active' | 'pending' | 'deactivated' {
    if (!u.is_active) return 'deactivated';
    if (!u.email_confirmed_at) return 'pending';
    return 'active';
}

const STATUS_STYLE = {
    active: 'bg-[var(--success-bg)] text-[var(--success)]',
    pending: 'bg-[var(--warning-bg)] text-[var(--warning)]',
    deactivated: 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
} as const;
const STATUS_LABEL = { active: 'Active', pending: 'Invite pending', deactivated: 'Deactivated' } as const;

const ROLE_STYLE: Record<Role, string> = {
    owner: 'bg-[var(--badge-owner-bg)] text-[var(--badge-owner-text)]',
    admin: 'bg-[var(--badge-admin-bg)] text-[var(--badge-admin-text)]',
    member: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
    return data as T;
}

/** Ten small bars: how many of the last 30 days the person used the app */
function ActiveDays({ days }: { days: number }) {
    return (
        <span className="inline-flex items-center gap-2" title={`Used the app on ${days} of the last 30 days`}>
            <span className="inline-flex gap-px" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => (
                    <span key={i} className="w-1 h-3 rounded-sm" style={{ background: i < Math.round((days / 30) * 10) ? 'var(--accent)' : 'var(--bg-elevated)' }} />
                ))}
            </span>
            <span className="text-xs tabular-nums text-[var(--text-secondary)]">{days}<span className="text-[var(--text-faint)]">/30</span></span>
        </span>
    );
}

export default function UsersPage() {
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['admin-team'],
        queryFn: () => api<TeamResponse>('/api/admin/users'),
    });
    const users = useMemo(() => data?.users ?? [], [data]);
    const canManage = !!data?.canManage;

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showInvite, setShowInvite] = useState(false);

    const now = useNow();
    const counts = useMemo(() => ({
        all: users.length,
        active: users.filter((u) => status(u) === 'active').length,
        pending: users.filter((u) => status(u) === 'pending').length,
        deactivated: users.filter((u) => status(u) === 'deactivated').length,
        thisWeek: users.filter((u) => u.is_active && u.last_active_at && now - Date.parse(u.last_active_at) < WEEK).length,
    }), [users, now]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users
            .filter((u) => filter === 'all' || status(u) === filter)
            .filter((u) => !q || u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            // Most recently active first; people who never signed in last
            .sort((a, b) => (b.last_active_at ?? '').localeCompare(a.last_active_at ?? '') || (a.full_name ?? '').localeCompare(b.full_name ?? ''));
    }, [users, query, filter]);

    const selected = users.find((u) => u.id === selectedId) ?? null;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-team'] });

    const update = async (userId: string, updates: Partial<Pick<TeamMember, 'role' | 'is_active' | 'full_name'>>) => {
        try {
            await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ userId, ...updates }) });
            await refresh();
            toast.success('Saved');
        } catch (err) {
            toast.error('Couldn’t update', err);
        }
    };

    const filterChip = (value: StatusFilter, label: string, n: number) => (
        <button
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${filter === value
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
        >
            {label} <span className="opacity-70 tabular-nums">{n}</span>
        </button>
    );

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Users</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        {!data ? 'Loading the team…' : <>{counts.active} active · {counts.thisWeek} used the app this week</>}
                        {counts.pending > 0 && <> · {counts.pending} invite{counts.pending === 1 ? '' : 's'} pending</>}
                        {!canManage && data && <> · Only the owner can change people&apos;s access</>}
                    </p>
                </div>
                {canManage && (
                    <button
                        onClick={() => setShowInvite(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium shadow-sm"
                    >
                        <UserPlus className="w-4 h-4" /> Invite people
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <label className="relative flex-1 min-w-[12rem] max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
                    <span className="sr-only">Search people</span>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search name or email"
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
                    />
                </label>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Status">
                    {filterChip('all', 'All', counts.all)}
                    {filterChip('active', 'Active', counts.active)}
                    {counts.pending > 0 && filterChip('pending', 'Pending', counts.pending)}
                    {counts.deactivated > 0 && filterChip('deactivated', 'Deactivated', counts.deactivated)}
                </div>
            </div>

            {error ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)] text-sm text-[var(--danger)]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {(error as Error).message}
                </div>
            ) : isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" /></div>
            ) : (
                <div className="card p-0 overflow-x-auto">
                    <table className="w-full md:min-w-[720px]">
                        <thead>
                            <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                <th className="px-4 py-2.5">Person</th>
                                <th className="px-4 py-2.5 hidden sm:table-cell">Role</th>
                                <th className="px-4 py-2.5 hidden sm:table-cell">Status</th>
                                <th className="px-4 py-2.5">Last active</th>
                                <th className="px-4 py-2.5 hidden md:table-cell">Days active</th>
                                <th className="px-4 py-2.5 text-right hidden md:table-cell">Edits · 30d</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((u) => {
                                const st = status(u);
                                return (
                                    <tr
                                        key={u.id}
                                        onClick={() => setSelectedId(u.id)}
                                        className={`border-b border-[var(--table-row-border)] last:border-0 cursor-pointer hover:bg-[var(--bg-elevated)] ${selectedId === u.id ? 'bg-[var(--accent-subtle)]' : ''} ${st === 'deactivated' ? 'opacity-60' : ''}`}
                                    >
                                        <td className="px-4 py-2.5">
                                            <button className="flex items-center gap-3 text-left" onClick={(e) => { e.stopPropagation(); setSelectedId(u.id); }}>
                                                <Avatar id={u.id} name={u.full_name || u.email} size={32} />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                                                        {u.full_name || '(No name)'}{u.id === data?.me && <span className="ml-1.5 text-[10px] font-normal text-[var(--text-faint)]">You</span>}
                                                    </span>
                                                    <span className="block text-xs text-[var(--text-muted)] truncate">{u.email}</span>
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-4 py-2.5 hidden sm:table-cell">
                                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${ROLE_STYLE[u.role]}`}>{ROLE_INFO[u.role].label}</span>
                                        </td>
                                        <td className="px-4 py-2.5 hidden sm:table-cell">
                                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">
                                            {u.last_active_at ? <time dateTime={u.last_active_at} title={new Date(u.last_active_at).toLocaleString()}>{relativeTime(u.last_active_at, now)}</time> : <span className="text-[var(--text-faint)]">Never</span>}
                                        </td>
                                        <td className="px-4 py-2.5 hidden md:table-cell"><ActiveDays days={u.active_days_30} /></td>
                                        <td className="px-4 py-2.5 text-right text-sm tabular-nums hidden md:table-cell text-[var(--text-secondary)]">{u.edits_30 || <span className="text-[var(--text-faint)]">—</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {shown.length === 0 && <p className="text-center text-sm text-[var(--text-muted)] py-10">No one matches.</p>}
                </div>
            )}
            <p className="text-[11px] text-[var(--text-faint)] mt-2">
                &ldquo;Last active&rdquo; and &ldquo;days active&rdquo; come from app use, tracked from October 2, 2026; earlier dates fall back to sign-ins and edits.
            </p>

            {selected && (
                <PersonPanel
                    key={selected.id}
                    person={selected}
                    isMe={selected.id === data?.me}
                    canManage={canManage}
                    onClose={() => setSelectedId(null)}
                    onUpdate={(u) => update(selected.id, u)}
                />
            )}
            {showInvite && <InviteDialog onClose={() => setShowInvite(false)} onInvited={refresh} />}
        </div>
    );
}

// ======================== Person panel ========================

function PersonPanel({ person, isMe, canManage, onClose, onUpdate }: {
    person: TeamMember;
    isMe: boolean;
    canManage: boolean;
    onClose: () => void;
    onUpdate: (u: Partial<Pick<TeamMember, 'role' | 'is_active' | 'full_name'>>) => Promise<void>;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [name, setName] = useState(person.full_name ?? '');
    const [sendingLink, setSendingLink] = useState(false);
    const st = status(person);
    const { data: entries = [], isLoading } = useQuery({
        queryKey: ['activity', { actorId: person.id, recent: true }],
        queryFn: () => fetchActivity({ actorId: person.id }),
    });

    useEffect(() => {
        panelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const sendAccessLink = async () => {
        setSendingLink(true);
        try {
            await api('/api/admin/users/access-link', { method: 'POST', body: JSON.stringify({ email: person.email }) });
            toast.success(`Sent a password link to ${person.email}`);
        } catch (err) {
            toast.error('Couldn’t send the link', err);
        } finally {
            setSendingLink(false);
        }
    };

    const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
    const manageable = canManage && !isMe && person.role !== 'owner';

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
            <div className="absolute inset-0 bg-[var(--bg-overlay)]" onClick={onClose} aria-hidden />
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={person.full_name || person.email}
                className="relative w-full max-w-md h-full bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl flex flex-col animate-slide-in-right outline-none"
            >
                <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--border)]">
                    <Avatar id={person.id} name={person.full_name || person.email} size={44} />
                    <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold text-[var(--text-primary)] truncate">{person.full_name || '(No name)'}</div>
                        <div className="text-sm text-[var(--text-muted)] truncate">{person.email}</div>
                        <div className="flex gap-1.5 mt-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${ROLE_STYLE[person.role]}`}>{ROLE_INFO[person.role].label}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-secondary)]"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <dl className="grid grid-cols-3 gap-px bg-[var(--border)] border-b border-[var(--border)]">
                        {[
                            ['Last active', person.last_active_at ? relativeTime(person.last_active_at) : 'Never'],
                            ['Days active · 30d', `${person.active_days_30}`],
                            ['Edits · 30d', `${person.edits_30}`],
                        ].map(([k, v]) => (
                            <div key={k} className="bg-[var(--bg-card)] px-4 py-3">
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{k}</dt>
                                <dd className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">{v}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="px-5 py-3 text-xs text-[var(--text-muted)] grid grid-cols-2 gap-y-1 border-b border-[var(--border)]">
                        <span>Joined</span><span className="text-[var(--text-secondary)]">{fmtDate(person.email_confirmed_at ?? person.created_at)}</span>
                        <span>Last password sign-in</span><span className="text-[var(--text-secondary)]">{fmtDate(person.last_sign_in_at)}</span>
                        <span>All-time edits</span><span className="text-[var(--text-secondary)] tabular-nums">{person.edits_total}</span>
                    </div>

                    {manageable && (
                        <div className="px-5 py-4 space-y-4 border-b border-[var(--border)]">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Manage</div>
                            <form
                                className="flex gap-2"
                                onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== person.full_name) void onUpdate({ full_name: name.trim() }); }}
                            >
                                <label className="flex-1">
                                    <span className="block text-xs text-[var(--text-secondary)] mb-1">Name</span>
                                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
                                </label>
                                <button type="submit" disabled={!name.trim() || name.trim() === person.full_name} className="self-end px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40" aria-label="Save name"><Check className="w-4 h-4" /></button>
                            </form>
                            <fieldset>
                                <legend className="text-xs text-[var(--text-secondary)] mb-1.5">Role</legend>
                                <div className="space-y-1.5">
                                    {(['member', 'admin'] as const).map((r) => (
                                        <label key={r} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${person.role === r ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] hover:bg-[var(--bg-elevated)]'}`}>
                                            <input type="radio" name="role" checked={person.role === r} onChange={() => void onUpdate({ role: r })} className="mt-0.5 accent-[var(--accent)]" />
                                            <span>
                                                <span className="block text-sm font-medium text-[var(--text-primary)]">{ROLE_INFO[r].label}</span>
                                                <span className="block text-xs text-[var(--text-muted)]">{ROLE_INFO[r].description}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => void sendAccessLink()}
                                    disabled={sendingLink || !person.is_active}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                                >
                                    {sendingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                                    {st === 'pending' ? 'Resend invite link' : 'Send password reset'}
                                </button>
                                {person.is_active ? (
                                    <button
                                        onClick={() => { if (window.confirm(`Deactivate ${person.full_name || person.email}? They’ll be signed out and can’t sign in. Their work stays.`)) void onUpdate({ is_active: false }); }}
                                        className="px-3 py-1.5 rounded-lg border border-[var(--danger)] text-sm text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                                    >
                                        Deactivate
                                    </button>
                                ) : (
                                    <button onClick={() => void onUpdate({ is_active: true })} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium">
                                        Reactivate
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="px-5 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-3">Recent activity</div>
                        {isLoading
                            ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" /></div>
                            : <ActivityFeed entries={entries} showActor={false} emptyText="No recorded activity yet." />}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ======================== Invite ========================

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<'member' | 'admin'>('member');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sentTo, setSentTo] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSending(true);
        try {
            await api('/api/admin/invite', { method: 'POST', body: JSON.stringify({ email: email.trim(), full_name: name.trim(), role }) });
            setSentTo(email.trim());
            onInvited();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send invitation.');
        } finally {
            setSending(false);
        }
    };

    const inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm px-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                {sentTo ? (
                    <div className="text-center py-2">
                        <div className="w-12 h-12 rounded-full bg-[var(--success-bg)] flex items-center justify-center mx-auto mb-3"><Mail className="w-6 h-6 text-[var(--success)]" /></div>
                        <h2 id="invite-title" className="text-lg font-semibold text-[var(--text-primary)] mb-1">Invitation sent</h2>
                        <p className="text-sm text-[var(--text-muted)]"><span className="font-medium">{sentTo}</span> will get an email to set a password.</p>
                        <div className="flex justify-center gap-2 mt-5">
                            <button onClick={() => { setSentTo(null); setEmail(''); setName(''); }} className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">Invite another</button>
                            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium">Done</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-4">
                        <div>
                            <h2 id="invite-title" className="text-lg font-semibold text-[var(--text-primary)]">Invite people</h2>
                            <p className="text-sm text-[var(--text-muted)] mt-0.5">They&apos;ll get an email to set their password.</p>
                        </div>
                        <label className="block">
                            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Full name</span>
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required autoFocus className={inputCls} />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email</span>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@streetlights.com" required className={inputCls} />
                        </label>
                        <fieldset>
                            <legend className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Role</legend>
                            <div className="space-y-1.5">
                                {(['member', 'admin'] as const).map((r) => (
                                    <label key={r} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${role === r ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] hover:bg-[var(--bg-elevated)]'}`}>
                                        <input type="radio" name="invite-role" checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-[var(--accent)]" />
                                        <span>
                                            <span className="block text-sm font-medium text-[var(--text-primary)]">{ROLE_INFO[r].label}</span>
                                            <span className="block text-xs text-[var(--text-muted)]">{ROLE_INFO[r].description}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        {error && (
                            <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--danger-bg)] text-sm text-[var(--danger)]">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">Cancel</button>
                            <button type="submit" disabled={sending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium">
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Send invitation
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
