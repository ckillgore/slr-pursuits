'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Settings, Plus, LayoutDashboard, BarChart3, FileSpreadsheet, TrendingUp, Menu, X, LogOut, ChevronDown, Users, Landmark, Compass } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';

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
        ? { owner: 'bg-[#DBEAFE] text-[#1E40AF]', admin: 'bg-[#E0E7FF] text-[#4338CA]', member: 'bg-[#F4F5F7] text-[#7A8599]' }[profile.role]
        : '';

    const navLinkClass = (active: boolean) =>
        `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active
            ? 'bg-[#F4F5F7] text-[#1A1F2B]'
            : 'text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7]'
        }`;

    const mobileNavLinkClass = (active: boolean) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${active
            ? 'bg-[#F4F5F7] text-[#1A1F2B]'
            : 'text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7]'
        }`;

    return (
        <div className="min-h-screen flex flex-col">
            {/* Top Bar */}
            <header className="sticky top-0 z-50 h-14 border-b border-[#E2E5EA] bg-white/95 backdrop-blur-sm">
                <div className="flex items-center justify-between h-full px-4 md:px-6">
                    {/* Left: Logo + Navigation */}
                    <div className="flex items-center gap-1 md:gap-4">
                        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity mr-2">
                            <div className="w-8 h-8 rounded-lg bg-[#1A1F2B] flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <span className="text-sm font-bold tracking-tight text-[#1A1F2B]">SLR</span>
                                <span className="text-sm font-normal text-[#7A8599] ml-1.5">Pursuits</span>
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
                                className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                New Pursuit
                            </button>
                        )}

                        {/* Mobile: compact + button */}
                        {onNewPursuit && (
                            <button
                                onClick={onNewPursuit}
                                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-[#2563EB] text-white"
                                aria-label="New pursuit"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}

                        {/* Mobile hamburger */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden flex items-center justify-center w-8 h-8 rounded-md text-[#7A8599] hover:bg-[#F4F5F7] transition-colors"
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>

                        {/* Desktop User Avatar + Dropdown */}
                        <div className="hidden md:block relative" ref={userMenuRef}>
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-[#F4F5F7] transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center text-xs font-bold text-white">
                                    {initials}
                                </div>
                                <ChevronDown className="w-3.5 h-3.5 text-[#A0AABB]" />
                            </button>

                            {userMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#E2E5EA] rounded-xl shadow-xl py-2 animate-fade-in">
                                    <div className="px-4 py-2 border-b border-[#F0F1F4]">
                                        <div className="text-sm font-semibold text-[#1A1F2B]">{profile?.full_name || 'User'}</div>
                                        <div className="text-xs text-[#7A8599]">{profile?.email}</div>
                                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${roleBadgeColor}`}>
                                            {roleBadge}
                                        </span>
                                    </div>
                                    {isOwner && (
                                        <Link
                                            href="/admin/users"
                                            className="flex items-center gap-2 px-4 py-2 text-sm text-[#4A5568] hover:bg-[#F4F5F7] transition-colors"
                                            onClick={() => setUserMenuOpen(false)}
                                        >
                                            <Users className="w-4 h-4" />
                                            Manage Users
                                        </Link>
                                    )}
                                    <button
                                        onClick={() => { setUserMenuOpen(false); signOut(); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
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
                <div className="md:hidden fixed inset-0 top-14 z-40 bg-white border-t border-[#E2E5EA]">
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
                                <div className="border-t border-[#E2E5EA] my-2" />
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
                        <div className="border-t border-[#E2E5EA] my-2" />
                        {/* Mobile user info */}
                        <div className="px-4 py-2">
                            <div className="text-sm font-semibold text-[#1A1F2B]">{profile?.full_name || 'User'}</div>
                            <div className="text-xs text-[#7A8599]">{profile?.email}</div>
                        </div>
                        <button
                            onClick={() => { setMobileMenuOpen(false); signOut(); }}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
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
        </div>
    );
}
