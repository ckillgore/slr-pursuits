'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, ChevronDown } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { ADMIN_GROUPS, sectionForPath } from '@/components/admin/adminSections';

/**
 * Every /admin page shares this frame: one access check, and a sidebar that
 * stays put while you move between sections (it never unmounts or disappears
 * while a page loads).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
    const { isAdminOrOwner, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const current = sectionForPath(pathname);

    useEffect(() => {
        if (!isLoading && !isAdminOrOwner) router.replace('/');
    }, [isLoading, isAdminOrOwner, router]);

    return (
        <AppShell>
            <div className="lg:flex lg:min-h-[calc(100vh-56px)]">
                {/* Sidebar (desktop) */}
                <aside className="hidden lg:block w-60 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)]">
                    <nav aria-label="Admin" className="sticky top-14 max-h-[calc(100vh-56px)] overflow-y-auto px-3 py-5">
                        <div className="px-3 mb-4">
                            <div className="text-sm font-bold text-[var(--text-primary)]">Admin</div>
                            <div className="text-[11px] text-[var(--text-muted)]">Settings for the whole team</div>
                        </div>
                        {ADMIN_GROUPS.map((group, gi) => (
                            <div key={gi} className={group.label ? 'mt-5' : ''}>
                                {group.label && (
                                    <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{group.label}</div>
                                )}
                                <ul className="space-y-0.5">
                                    {group.sections.map(({ href, label, icon: Icon }) => {
                                        const active = current?.href === href;
                                        return (
                                            <li key={href}>
                                                <Link
                                                    href={href}
                                                    aria-current={active ? 'page' : undefined}
                                                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${active
                                                        ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'}`}
                                                >
                                                    <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
                                                    {label}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </nav>
                </aside>

                <div className="flex-1 min-w-0">
                    {/* Section picker (phones and tablets) */}
                    <div className="lg:hidden sticky top-14 z-30 border-b border-[var(--border)] bg-[var(--bg-nav)]/95 backdrop-blur-sm px-4 py-2">
                        <label className="relative block">
                            <span className="sr-only">Admin section</span>
                            <select
                                value={current?.href ?? ''}
                                onChange={(e) => router.push(e.target.value)}
                                className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-card)] pl-3 pr-9 py-2 text-sm font-medium text-[var(--text-primary)]"
                            >
                                {ADMIN_GROUPS.map((group, gi) => (
                                    <optgroup key={gi} label={group.label ?? 'Admin'}>
                                        {group.sections.map((s) => <option key={s.href} value={s.href}>{s.label}</option>)}
                                    </optgroup>
                                ))}
                                {!current && <option value="">Admin</option>}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                        </label>
                    </div>

                    {isLoading || !isAdminOrOwner ? (
                        <div className="flex justify-center py-24" role="status" aria-label="Loading">
                            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" />
                        </div>
                    ) : (
                        children
                    )}
                </div>
            </div>
        </AppShell>
    );
}

