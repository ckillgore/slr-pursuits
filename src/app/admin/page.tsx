'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchActivity, relativeTime } from '@/lib/activity';
import { ADMIN_GROUPS } from '@/components/admin/adminSections';
import { ActivityFeed, Avatar, useNow } from '@/components/admin/ActivityFeed';
import { RegridUsageMeter, useRegridUsage } from '@/components/regrid/RegridUsageMeter';

interface TeamMember {
    id: string;
    full_name: string;
    email: string;
    is_active: boolean;
    email_confirmed_at: string | null;
    last_active_at: string | null;
    edits_30: number;
}

const WEEK = 7 * 86_400_000;

/** Counts shown on the settings directory, keyed by admin href */
async function fetchSettingCounts(): Promise<Record<string, { count: number; note?: string }>> {
    const supabase = createClient();
    const count = async (table: string, filter?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        let q = supabase.from(table).select('id', { count: 'exact', head: true });
        if (filter) q = filter(q);
        const { count: n } = await q;
        return n ?? 0;
    };
    const [stages, keyDateTypes, checklists, productTypes, templates, taxRates, taxUnverified, budgetLines, yardi] = await Promise.all([
        count('pursuit_stages', (q) => q.eq('is_active', true)),
        count('key_date_types', (q) => q.eq('is_active', true)),
        count('checklist_templates', (q) => q.eq('is_active', true)),
        count('product_types', (q) => q.eq('is_active', true)),
        count('data_model_templates', (q) => q.eq('is_active', true)),
        count('tax_jurisdictions'),
        count('tax_jurisdictions', (q) => q.eq('is_verified', false)),
        count('default_predev_budget_line_items'),
        count('pursuit_accounting_entities'),
    ]);
    return {
        '/admin/stages': { count: stages },
        '/admin/key-date-types': { count: keyDateTypes },
        '/admin/checklist-templates': { count: checklists },
        '/admin/product-types': { count: productTypes },
        '/admin/templates': { count: templates },
        '/admin/tax-rates': { count: taxRates, note: taxUnverified ? `${taxUnverified} not verified` : undefined },
        '/admin/budget-defaults': { count: budgetLines },
        '/admin/accounting': { count: yardi },
    };
}

export default function AdminOverviewPage() {
    const { data: team } = useQuery({
        queryKey: ['admin-team'],
        queryFn: async () => {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return data as { users: TeamMember[] };
        },
    });
    const { data: recent = [], isLoading: recentLoading } = useQuery({
        queryKey: ['activity', { overview: true }],
        queryFn: () => fetchActivity({}),
    });
    const { data: weekCount } = useQuery({
        queryKey: ['activity-week-count'],
        queryFn: async () => {
            const weekAgo = new Date(Date.now() - WEEK).toISOString();
            const { count } = await createClient().from('activity_log').select('id', { count: 'exact', head: true }).gte('last_at', weekAgo);
            return count ?? 0;
        },
    });
    const { data: counts = {} } = useQuery({ queryKey: ['admin-setting-counts'], queryFn: fetchSettingCounts });
    const { data: regrid } = useRegridUsage();

    const users = team?.users ?? [];
    const now = useNow();
    const active = users.filter((u) => u.is_active && u.email_confirmed_at);
    const activeThisWeek = active.filter((u) => u.last_active_at && now - Date.parse(u.last_active_at) < WEEK);
    const pending = users.filter((u) => u.is_active && !u.email_confirmed_at);
    const recentPeople = [...active].filter((u) => u.last_active_at).sort((a, b) => b.last_active_at!.localeCompare(a.last_active_at!)).slice(0, 6);

    const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode, href?: string) => {
        const body = (
            <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{label}</div>
                <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">{value ?? <Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" />}</div>
                {sub && <div className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</div>}
            </>
        );
        return href
            ? <Link href={href} className="card block hover:border-[var(--accent)] transition-colors">{body}</Link>
            : <div className="card">{body}</div>;
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Admin</h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">How the team is using the app, and the settings everyone&apos;s work runs on.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {stat('People', team ? active.length : null, !team ? null : pending.length ? `${pending.length} invite${pending.length === 1 ? '' : 's'} pending` : 'All invites accepted', '/admin/users')}
                {stat('Active this week', team ? activeThisWeek.length : null, team ? `of ${active.length} people` : null, '/admin/users')}
                {stat('Changes this week', weekCount ?? null, 'Across pursuits, comps and settings', '/admin/activity')}
                <Link href="/admin/parcel-data" className="card block hover:border-[var(--accent)] transition-colors">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-2">Regrid parcel records</div>
                    {regrid ? <RegridUsageMeter usage={regrid.usage} compact /> : <Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" />}
                </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
                <div className="card">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent activity</h2>
                        <Link href="/admin/activity" className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">All activity <ArrowRight className="w-3 h-3" /></Link>
                    </div>
                    {recentLoading
                        ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" /></div>
                        : <ActivityFeed entries={recent.slice(0, 12)} />}
                </div>
                <div className="card">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recently active</h2>
                        <Link href="/admin/users" className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">Users <ArrowRight className="w-3 h-3" /></Link>
                    </div>
                    <ul className="space-y-2.5">
                        {recentPeople.map((u) => (
                            <li key={u.id} className="flex items-center gap-2.5">
                                <Avatar id={u.id} name={u.full_name || u.email} size={28} />
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm text-[var(--text-primary)] truncate">{u.full_name || u.email}</div>
                                    <div className="text-[11px] text-[var(--text-muted)]">{u.edits_30} edits · 30d</div>
                                </div>
                                <span className="text-[11px] text-[var(--text-faint)] whitespace-nowrap">{relativeTime(u.last_active_at!, now)}</span>
                            </li>
                        ))}
                        {team && !recentPeople.length && <li className="text-sm text-[var(--text-muted)]">No one yet.</li>}
                    </ul>
                </div>
            </div>

            {/* Settings directory */}
            <div className="space-y-5">
                {ADMIN_GROUPS.filter((g) => g.label && g.label !== 'Team').map((g) => (
                    <section key={g.label}>
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-2">{g.label}</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {g.sections.map(({ href, label, icon: Icon, description }) => {
                                const c = counts[href];
                                return (
                                    <Link key={href} href={href} className="card group flex items-start gap-3 hover:border-[var(--accent)] transition-colors">
                                        <span className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-2">
                                                <span className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">{label}</span>
                                                {c && <span className="text-xs tabular-nums text-[var(--text-muted)]">{c.count}</span>}
                                            </span>
                                            <span className="block text-xs text-[var(--text-muted)] mt-0.5">{description}</span>
                                            {c?.note && <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-[var(--warning)]"><AlertTriangle className="w-3 h-3" />{c.note}</span>}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
