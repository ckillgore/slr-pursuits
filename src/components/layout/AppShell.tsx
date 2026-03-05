'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Settings, Plus, LayoutDashboard, BarChart3, FileSpreadsheet, TrendingUp, Menu, X, LogOut, ChevronDown, Users, Landmark, Compass, KeyRound, Bell, Moon, Sun } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { useMyMentionCount } from '@/hooks/useSupabaseQueries';
import { useThemeStore } from '@/store/useThemeStore';

interface AppShellProps {
    children: ReactNode;
    onNewPursuit?: () => void;
}

export function AppShell({ children, onNewPursuit }: AppShellProps) {
    const pathname = usePathname();
    const { profile, isAdminOrOwner, isOwner, signOut } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const { data: mentionCount = 0 } = useMyMentionCount(profile?.id);
    const { theme, toggleTheme } = useThemeStore();

    // Change password state
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);

    const handleChangePassword = async () => {
        setPasswordError(null);
        if (newPassword.length < 6) {
            setPasswordError('Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('Passwords do not match.');
            return;
        }
        setPasswordLoading(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
                setPasswordError(error.message);
            } else {
                setPasswordSuccess(true);
                setTimeout(() => {
                    setShowPasswordModal(false);
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordSuccess(false);
                }, 1500);
            }
        } catch (err: any) {
            setPasswordError(err.message || 'Failed to update password.');
        } finally {
            setPasswordLoading(false);
        }
    };

    // Close user menu on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

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

    const navLinkClass = (active: boolean) =>
        `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
        }`;

    const mobileNavLinkClass = (active: boolean) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${active
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
        }`;

    return (
        <div className="min-h-screen flex flex-col">
            {/* Top Bar */}
            <header className="sticky top-0 z-50 h-14 border-b border-[var(--border)] bg-[var(--bg-nav)]/95 backdrop-blur-sm">
                <div className="flex items-center justify-between h-full px-4 md:px-6">
                    {/* Left: Logo + Navigation */}
                    <div className="flex items-center gap-1 md:gap-4">
                        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity mr-2">
                            <div className="w-8 h-8 rounded-lg bg-[var(--text-primary)] flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-[var(--bg-primary)]" />
                            </div>
                            <div>
                                <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">SLR</span>
                                <span className="text-sm font-normal text-[var(--text-muted)] ml-1.5">Pursuits</span>
                            </div>
                        </Link>

                        <nav className="hidden md:flex items-center gap-1">
                            <Link href="/" className={navLinkClass(pathname === '/')}>
                                <LayoutDashboard className="w-4 h-4" />
                                Pursuits
                            </Link>
                            <Link href="/explore" className={navLinkClass(pathname === '/explore')}>
                                <Compass className="w-4 h-4" />
                                Explore
                            </Link>
                            <Link href="/comps" className={navLinkClass(pathname.startsWith('/comps'))}>
                                <Landmark className="w-4 h-4" />
                                Comps
                            </Link>
                            <Link href="/reports" className={navLinkClass(pathname === '/reports')}>
                                <FileSpreadsheet className="w-4 h-4" />
                                Reports
                            </Link>
                            <Link href="/analytics" className={navLinkClass(pathname === '/analytics')}>
                                <TrendingUp className="w-4 h-4" />
                                Analytics
                            </Link>
                            <Link href="/compare" className={navLinkClass(pathname === '/compare')}>
                                <BarChart3 className="w-4 h-4" />
                                Compare
                            </Link>
                        </nav>
                    </div>

                    {/* Right: Admin + Actions + User */}
                    <div className="flex items-center gap-2 md:gap-3">
                        {/* Desktop Admin (owner/admin only) */}
                        {isAdminOrOwner && (
                            <Link
                                href="/admin/product-types"
                                className={`hidden md:flex ${navLinkClass(pathname.startsWith('/admin'))}`}
                            >
                                <Settings className="w-4 h-4" />
                                Admin
                            </Link>
                        )}

                        {onNewPursuit && (
                            <button
                                onClick={onNewPursuit}
                                className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                New Pursuit
                            </button>
                        )}

                        {/* Mobile: compact + button */}
                        {onNewPursuit && (
                            <button
                                onClick={onNewPursuit}
                                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)] text-white"
                                aria-label="New pursuit"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}

                        {/* Mobile hamburger */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors"
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>

                        {/* Mention notification badge */}
                        {mentionCount > 0 && (
                            <div className="relative" title={`${mentionCount} mention${mentionCount > 1 ? 's' : ''}`}>
                                <Bell className="w-5 h-5 text-[var(--text-muted)]" />
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center px-1 text-[9px] font-bold text-white bg-[var(--danger)] rounded-full">
                                    {mentionCount > 99 ? '99+' : mentionCount}
                                </span>
                            </div>
                        )}

                        {/* Desktop User Avatar + Dropdown */}
                        <div className="hidden md:block relative" ref={userMenuRef}>
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-[var(--bg-elevated)] transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white">
                                    {initials}
                                </div>
                                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                            </button>

                            {userMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl py-2 animate-fade-in" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                                    <div className="px-4 py-2 border-b border-[var(--table-row-border)]">
                                        <div className="text-sm font-semibold text-[var(--text-primary)]">{profile?.full_name || 'User'}</div>
                                        <div className="text-xs text-[var(--text-muted)]">{profile?.email}</div>
                                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${roleBadgeColor}`}>
                                            {roleBadge}
                                        </span>
                                    </div>
                                    {isOwner && (
                                        <Link
                                            href="/admin/users"
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                            onClick={() => setUserMenuOpen(false)}
                                        >
                                            <Users className="w-4 h-4" />
                                            Manage Users
                                        </Link>
                                    )}
                                    <button
                                        onClick={() => { setUserMenuOpen(false); setShowPasswordModal(true); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                    >
                                        <KeyRound className="w-4 h-4" />
                                        Change Password
                                    </button>
                                    <button
                                        onClick={toggleTheme}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                    >
                                        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                        {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                                    </button>
                                    <button
                                        onClick={() => { setUserMenuOpen(false); signOut(); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 top-14 z-40 bg-[var(--bg-card)] border-t border-[var(--border)]">
                    <nav className="flex flex-col p-4 gap-1">
                        <Link href="/" className={mobileNavLinkClass(pathname === '/')} onClick={() => setMobileMenuOpen(false)}>
                            <LayoutDashboard className="w-5 h-5" />
                            Pursuits
                        </Link>
                        <Link href="/explore" className={mobileNavLinkClass(pathname === '/explore')} onClick={() => setMobileMenuOpen(false)}>
                            <Compass className="w-5 h-5" />
                            Explore
                        </Link>
                        <Link href="/comps" className={mobileNavLinkClass(pathname.startsWith('/comps'))} onClick={() => setMobileMenuOpen(false)}>
                            <Landmark className="w-5 h-5" />
                            Comps
                        </Link>
                        <Link href="/reports" className={mobileNavLinkClass(pathname === '/reports')} onClick={() => setMobileMenuOpen(false)}>
                            <FileSpreadsheet className="w-5 h-5" />
                            Reports
                        </Link>
                        <Link href="/analytics" className={mobileNavLinkClass(pathname === '/analytics')} onClick={() => setMobileMenuOpen(false)}>
                            <TrendingUp className="w-5 h-5" />
                            Analytics
                        </Link>
                        <Link href="/compare" className={mobileNavLinkClass(pathname === '/compare')} onClick={() => setMobileMenuOpen(false)}>
                            <BarChart3 className="w-5 h-5" />
                            Compare
                        </Link>
                        {isAdminOrOwner && (
                            <>
                                <div className="border-t border-[var(--border)] my-2" />
                                <Link href="/admin/product-types" className={mobileNavLinkClass(pathname.startsWith('/admin'))} onClick={() => setMobileMenuOpen(false)}>
                                    <Settings className="w-5 h-5" />
                                    Admin
                                </Link>
                            </>
                        )}
                        {isOwner && (
                            <Link href="/admin/users" className={mobileNavLinkClass(pathname === '/admin/users')} onClick={() => setMobileMenuOpen(false)}>
                                <Users className="w-5 h-5" />
                                Manage Users
                            </Link>
                        )}
                        <div className="border-t border-[var(--border)] my-2" />
                        {/* Mobile user info */}
                        <div className="px-4 py-2">
                            <div className="text-sm font-semibold text-[var(--text-primary)]">{profile?.full_name || 'User'}</div>
                            <div className="text-xs text-[var(--text-muted)]">{profile?.email}</div>
                        </div>
                        <button
                            onClick={() => { setMobileMenuOpen(false); setShowPasswordModal(true); }}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                            <KeyRound className="w-5 h-5" />
                            Change Password
                        </button>
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

            {/* Main Content */}
            <main className="flex-1">
                {children}
            </main>

            {/* Change Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }}>
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm animate-fade-in mx-4" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Change Password</h2>
                        <p className="text-xs text-[var(--text-muted)] mb-5">Enter your new password below.</p>

                        {passwordSuccess ? (
                            <div className="py-6 text-center">
                                <div className="w-10 h-10 rounded-full bg-[var(--success-bg)] flex items-center justify-center mx-auto mb-3">
                                    <span className="text-[var(--success)] text-lg">✓</span>
                                </div>
                                <p className="text-sm font-medium text-[var(--success)]">Password updated!</p>
                            </div>
                        ) : (
                            <>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Min 6 characters"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--border-strong)] mb-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
                                />
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter password"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--border-strong)] mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
                                    onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                                />
                                {passwordError && (
                                    <p className="text-xs text-[var(--danger)] mb-3">{passwordError}</p>
                                )}
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => { setShowPasswordModal(false); setNewPassword(''); setConfirmPassword(''); setPasswordError(null); }}
                                        className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleChangePassword}
                                        disabled={passwordLoading}
                                        className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                                    >
                                        {passwordLoading ? 'Updating...' : 'Update Password'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
