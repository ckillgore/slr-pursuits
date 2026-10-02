'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Settings, Plus, LayoutDashboard, BarChart3, FileSpreadsheet, TrendingUp, Menu, X, LogOut, ChevronDown, Landmark, Compass, Bell, Moon, Sun, CheckSquare, UserCog, type LucideIcon } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { 
    useMyMentionCount, 
    useMyIncompleteTaskCount 
} from '@/hooks/useSupabaseQueries';
import { useThemeStore } from '@/store/useThemeStore';
import { avatarColor } from '@/components/admin/ActivityFeed';

// Primary sections, shared by the desktop bar and the mobile menu.
const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
    { href: '/', label: 'Pursuits', icon: LayoutDashboard },
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/comps', label: 'Comps', icon: Landmark },
    { href: '/reports', label: 'Reports', icon: FileSpreadsheet },
    { href: '/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/compare', label: 'Compare', icon: BarChart3 },
    { href: '/tasks', label: 'Tasks', icon: CheckSquare },
];

function CountBadge({ count, label }: { count: number; label: string }) {
    if (count <= 0) return null;
    return (
        <span
            className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-[var(--accent)] text-white text-[10px] font-bold leading-none tabular-nums"
            title={label}
        >
            <span aria-hidden>{count > 99 ? '99+' : count}</span>
            <span className="sr-only">, {label}</span>
        </span>
    );
}

interface AppShellProps {
    children: ReactNode;
    onNewPursuit?: () => void;
}

export function AppShell({ children, onNewPursuit }: AppShellProps) {
    const pathname = usePathname();
    const { profile, isAdminOrOwner, isSessionLost, signOut } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const { data: mentionCount = 0 } = useMyMentionCount(profile?.id);
    const { data: pendingTaskCount = 0 } = useMyIncompleteTaskCount(profile?.id);
    const theme = useThemeStore(s => s.theme);
    const toggleTheme = useThemeStore(s => s.toggleTheme);

    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Any navigation closes the menus
    const [menuPath, setMenuPath] = useState(pathname);
    if (menuPath !== pathname) {
        setMenuPath(pathname);
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
    }

    // Account menu: an outside press or Escape closes it; focus moves into it on open
    useEffect(() => {
        if (!userMenuOpen) return;
        const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        items()[0]?.focus();
        const onPointerDown = (e: PointerEvent) => {
            if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setUserMenuOpen(false);
                menuButtonRef.current?.focus();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const list = items();
                const i = list.indexOf(document.activeElement as HTMLElement);
                list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
            } else if (e.key === 'Tab') {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [userMenuOpen]);

    // Escape also closes the mobile menu
    useEffect(() => {
        if (!mobileMenuOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [mobileMenuOpen]);

    const initials = profile?.full_name
        ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : profile?.email?.[0]?.toUpperCase() ?? '?';

    const roleBadge = profile?.role
        ? { owner: 'Owner', admin: 'Admin', member: 'Member' }[profile.role]
        : '';

    const roleBadgeColor = profile?.role
        ? {
            owner: 'bg-[var(--badge-owner-bg)] text-[var(--badge-owner-text)]',
            admin: 'bg-[var(--badge-admin-bg)] text-[var(--badge-admin-text)]',
            member: 'bg-[var(--badge-member-bg)] text-[var(--badge-member-text)]'
        }[profile.role]
        : '';

    // Section match on path segment boundary (so /compare doesn't light up /comps, etc.)
    const isSection = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
    const isNavActive = (href: string) => href === '/' ? (pathname === '/' || isSection('/pursuits')) : isSection(href);
    const isAdminActive = isSection('/admin');
    const taskBadgeLabel = `${pendingTaskCount} open task${pendingTaskCount === 1 ? '' : 's'}`;

    const menuItemClass = 'w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] focus:bg-[var(--bg-elevated)] outline-none transition-colors';

    // Desktop bar: icon-only links from lg (1024px), labels from xl (1280px).
    // The fully labelled bar needs ~1250px, so below lg everything lives in the menu.
    const navLinkClass = (active: boolean) =>
        `flex items-center gap-2 px-2.5 xl:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
        }`;

    const mobileNavLinkClass = (active: boolean) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${active
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
        }`;

    return (
        <div className="min-h-screen flex flex-col overflow-x-clip">
            {/* Top Bar */}
            <header className="sticky top-0 z-50 h-14 border-b border-[var(--border)] bg-[var(--bg-nav)]/95 backdrop-blur-sm">
                <div className="flex items-center justify-between h-full px-4 md:px-6 overflow-x-clip">
                    {/* Left: Logo + Navigation */}
                    <div className="flex items-center gap-1 md:gap-4 min-w-0">
                        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity mr-2">
                            <div className="w-8 h-8 rounded-lg bg-[var(--text-primary)] flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-[var(--bg-primary)]" />
                            </div>
                            <div>
                                <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">SLR</span>
                                <span className="text-sm font-normal text-[var(--text-muted)] ml-1.5">Pursuits</span>
                            </div>
                        </Link>

                        <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1" aria-label="Main">
                            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                                const active = isNavActive(href);
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        className={navLinkClass(active)}
                                        aria-current={active ? 'page' : undefined}
                                        title={label}
                                    >
                                        <Icon className="w-4 h-4" aria-hidden />
                                        <span className="sr-only xl:not-sr-only">{label}</span>
                                        {href === '/tasks' && <CountBadge count={pendingTaskCount} label={taskBadgeLabel} />}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Right: Admin + Actions + User */}
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                        {/* Desktop Admin (owner/admin only) */}
                        {isAdminOrOwner && (
                            <Link
                                href="/admin"
                                className={`hidden lg:flex ${navLinkClass(isAdminActive)}`}
                                aria-current={isAdminActive ? 'page' : undefined}
                                title="Admin"
                            >
                                <Settings className="w-4 h-4" aria-hidden />
                                <span className="sr-only 2xl:not-sr-only">Admin</span>
                            </Link>
                        )}

                        {onNewPursuit && (
                            <button
                                onClick={onNewPursuit}
                                className="hidden lg:flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                New Pursuit
                            </button>
                        )}

                        {/* Mobile: compact + button */}
                        {onNewPursuit && (
                            <button
                                onClick={onNewPursuit}
                                className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)] text-white"
                                aria-label="New pursuit"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}

                        {/* Mobile hamburger */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="lg:hidden relative flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors"
                            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={mobileMenuOpen}
                            aria-controls="mobile-nav"
                        >
                            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                            {/* Open-task count is otherwise hidden inside the closed menu */}
                            {!mobileMenuOpen && pendingTaskCount > 0 && (
                                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg-nav)]" aria-hidden />
                            )}
                        </button>

                        {/* Unread mentions */}
                        <Link
                            href="/tasks"
                            className="relative hover:opacity-80 transition-opacity"
                            title={mentionCount > 0 ? `${mentionCount} unread mention${mentionCount > 1 ? 's' : ''}` : 'No unread mentions'}
                            aria-label={mentionCount > 0 ? `${mentionCount} unread mention${mentionCount > 1 ? 's' : ''}` : 'Notifications: no unread mentions'}
                        >
                            <Bell className="w-5 h-5 text-[var(--text-muted)]" aria-hidden />
                            {mentionCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center px-1 text-[9px] font-bold text-white bg-[var(--danger)] rounded-full" aria-hidden>
                                    {mentionCount > 99 ? '99+' : mentionCount}
                                </span>
                            )}
                        </Link>

                        {/* Desktop User Avatar + Dropdown */}
                        <div className="hidden lg:block relative" ref={userMenuRef}>
                            <button
                                ref={menuButtonRef}
                                onClick={() => setUserMenuOpen((o) => !o)}
                                aria-haspopup="menu"
                                aria-expanded={userMenuOpen}
                                aria-controls="account-menu"
                                aria-label="Account menu"
                                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-[var(--bg-elevated)] transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: profile ? avatarColor(profile.id) : 'var(--accent)' }}>
                                    {initials}
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-faint)] transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {userMenuOpen && (
                                <div
                                    id="account-menu"
                                    ref={menuRef}
                                    role="menu"
                                    aria-label="Account"
                                    className="absolute right-0 top-full mt-2 w-64 z-[60] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl py-1.5 animate-fade-in"
                                    style={{ boxShadow: 'var(--shadow-dropdown)' }}
                                >
                                    <div className="px-4 py-2.5 border-b border-[var(--table-row-border)] mb-1">
                                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{profile?.full_name || 'User'}</div>
                                        <div className="text-xs text-[var(--text-muted)] truncate">{profile?.email}</div>
                                        {roleBadge && (
                                            <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${roleBadgeColor}`}>
                                                {roleBadge}
                                            </span>
                                        )}
                                    </div>
                                    <Link href="/settings" role="menuitem" className={menuItemClass}>
                                        <UserCog className="w-4 h-4" /> Account settings
                                    </Link>
                                    {isAdminOrOwner && (
                                        <Link href="/admin" role="menuitem" className={menuItemClass}>
                                            <Settings className="w-4 h-4" /> Admin
                                        </Link>
                                    )}
                                    <button role="menuitem" onClick={toggleTheme} className={menuItemClass}>
                                        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                        {theme === 'light' ? 'Dark mode' : 'Light mode'}
                                    </button>
                                    <div className="border-t border-[var(--table-row-border)] my-1" />
                                    <button
                                        role="menuitem"
                                        onClick={() => { setUserMenuOpen(false); signOut(); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-bg)] focus:bg-[var(--danger-bg)] outline-none transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" /> Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div id="mobile-nav" className="lg:hidden fixed inset-0 top-14 z-40 overflow-y-auto overscroll-contain bg-[var(--bg-card)] border-t border-[var(--border)]">
                    <nav className="flex flex-col p-4 gap-1" aria-label="Main">
                        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                            const active = isNavActive(href);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={mobileNavLinkClass(active)}
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <Icon className="w-5 h-5" aria-hidden />
                                    {label}
                                    {href === '/tasks' && (
                                        <span className="ml-auto"><CountBadge count={pendingTaskCount} label={taskBadgeLabel} /></span>
                                    )}
                                </Link>
                            );
                        })}
                        {isAdminOrOwner && (
                            <>
                                <div className="border-t border-[var(--border)] my-2" />
                                <Link href="/admin" className={mobileNavLinkClass(isAdminActive)} aria-current={isAdminActive ? 'page' : undefined}>
                                    <Settings className="w-5 h-5" />
                                    Admin
                                </Link>
                            </>
                        )}
                        <div className="border-t border-[var(--border)] my-2" />
                        {/* Mobile user info */}
                        <div className="px-4 py-2">
                            <div className="text-sm font-semibold text-[var(--text-primary)]">{profile?.full_name || 'User'}</div>
                            <div className="text-xs text-[var(--text-muted)]">{profile?.email}</div>
                        </div>
                        <Link href="/settings" className={mobileNavLinkClass(isSection('/settings'))}>
                            <UserCog className="w-5 h-5" />
                            Account settings
                        </Link>
                        <button
                            onClick={toggleTheme}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                        </button>
                        <button
                            onClick={() => { setMobileMenuOpen(false); signOut(); }}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            Sign Out
                        </button>
                    </nav>
                </div>
            )}

            {/* Session lost banner — shown when auth state is lost so user can recover */}
            {isSessionLost && (
                <div className="bg-[var(--danger-bg)] border-b border-[var(--danger)] px-4 py-3 flex items-center justify-between gap-4">
                    <p className="text-sm text-[var(--danger)]">
                        Your session has expired. Please sign in again.
                    </p>
                    <button
                        onClick={signOut}
                        className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-[var(--danger)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        Sign In
                    </button>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1">
                {children}
            </main>
        </div>
    );
}
