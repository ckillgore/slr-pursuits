'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import {
    Users, UserPlus, Loader2, AlertCircle, Shield, ShieldCheck,
    User, Mail, ChevronDown, ToggleLeft, ToggleRight, Activity,
    FileText, TrendingUp, CalendarDays, DollarSign, Map, GitBranch,
} from 'lucide-react';

interface UserActivity {
    pursuits_created: number;
    one_pagers_created: number;
    stage_changes: number;
    budgets_created: number;
    key_dates_created: number;
    land_comps_created: number;
    total: number;
}

interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: 'owner' | 'admin' | 'member';
    is_active: boolean;
    created_at: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    activity: UserActivity;
}

export default function AdminUsersPage() {
    const { isOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    // Invite dialog
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState(false);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setUsers(data.users);
            }
        } catch {
            setError('Failed to load users.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!authLoading && !isOwner) {
            router.push('/');
            return;
        }
        if (!authLoading && isOwner) {
            fetchUsers();
        }
    }, [authLoading, isOwner, router, fetchUsers]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteError(null);
        setInviting(true);

        try {
            const res = await fetch('/api/admin/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail.trim(), full_name: inviteName.trim(), role: inviteRole }),
            });
            const data = await res.json();
            if (data.error) {
                setInviteError(data.error);
            } else {
                setInviteSuccess(true);
                setTimeout(() => {
                    setShowInvite(false);
                    setInviteEmail('');
                    setInviteName('');
                    setInviteRole('member');
                    setInviteSuccess(false);
                    fetchUsers();
                }, 1500);
            }
        } catch {
            setInviteError('Failed to send invitation.');
        }
        setInviting(false);
    };

    const handleUpdateUser = async (userId: string, updates: { role?: string; is_active?: boolean }) => {
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, ...updates }),
            });
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                fetchUsers();
            }
        } catch {
            setError('Failed to update user.');
        }
    };

    const roleIcon = (role: string) => {
        switch (role) {
            case 'owner': return <ShieldCheck className="w-4 h-4 text-[#1E40AF]" />;
            case 'admin': return <Shield className="w-4 h-4 text-[#4338CA]" />;
            default: return <User className="w-4 h-4 text-[#7A8599]" />;
        }
    };

    const roleBadgeColor = (role: string) => {
        switch (role) {
            case 'owner': return 'bg-[#DBEAFE] text-[#1E40AF]';
            case 'admin': return 'bg-[#E0E7FF] text-[#4338CA]';
            default: return 'bg-[#F4F5F7] text-[#7A8599]';
        }
    };

    const activityColor = (total: number) => {
        if (total >= 50) return 'text-[#059669] bg-[#ECFDF5]';
        if (total >= 20) return 'text-[#2563EB] bg-[#EBF1FF]';
        if (total >= 5) return 'text-[#D97706] bg-[#FFFBEB]';
        return 'text-[#7A8599] bg-[#F4F5F7]';
    };

    // Team-wide totals
    const teamTotal = users.reduce((sum, u) => sum + u.activity.total, 0);

    if (authLoading) {
        return (
            <AppShell>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-6 h-6 animate-spin text-[#A0AABB]" />
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-[#1A1F2B] flex items-center gap-2">
                            <Users className="w-6 h-6" />
                            User Management
                        </h1>
                        <p className="text-sm text-[#7A8599] mt-1">
                            {users.length} user{users.length !== 1 ? 's' : ''} · {teamTotal.toLocaleString()} total actions
                        </p>
                    </div>
                    <button
                        onClick={() => setShowInvite(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        <UserPlus className="w-4 h-4" />
                        <span className="hidden sm:inline">Invite User</span>
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#DC2626] mb-4">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                        <button onClick={() => setError(null)} className="ml-auto text-[#DC2626] hover:text-[#B91C1C]">✕</button>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-[#A0AABB]" />
                    </div>
                ) : (
                    <div className="bg-white border border-[#E2E5EA] rounded-xl overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[#E2E5EA] bg-[#FAFBFC]">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider">User</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden md:table-cell">Role</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden sm:table-cell">Status</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider">
                                        <span className="flex items-center justify-center gap-1">
                                            <Activity className="w-3 h-3" /> Activity
                                        </span>
                                    </th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden lg:table-cell">Last Sign In</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <Fragment key={u.id}>
                                        <tr
                                            className="border-b border-[#F0F1F4] last:border-b-0 hover:bg-[#FAFBFC] transition-colors cursor-pointer"
                                            onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                                        {u.full_name ? u.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : u.email[0].toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-[#1A1F2B] truncate">{u.full_name || '(No name)'}</div>
                                                        <div className="text-xs text-[#7A8599] truncate">{u.email}</div>
                                                        {/* Mobile role badge */}
                                                        <span className={`md:hidden inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${roleBadgeColor(u.role)}`}>
                                                            {u.role}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center hidden md:table-cell">
                                                {u.role === 'owner' ? (
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${roleBadgeColor(u.role)}`}>
                                                        {roleIcon(u.role)} {u.role}
                                                    </span>
                                                ) : (
                                                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                                                        <select
                                                            value={u.role}
                                                            onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                                                            className={`appearance-none cursor-pointer pl-2.5 pr-7 py-1 rounded-full text-xs font-semibold border-0 ${roleBadgeColor(u.role)}`}
                                                        >
                                                            <option value="admin">admin</option>
                                                            <option value="member">member</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-50" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center hidden sm:table-cell">
                                                {u.email_confirmed_at ? (
                                                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF2F2] text-[#DC2626]'}`}>
                                                        {u.is_active ? 'Active' : 'Deactivated'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFFBEB] text-[#D97706]">
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${activityColor(u.activity.total)}`}>
                                                    <Activity className="w-3 h-3" />
                                                    {u.activity.total}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-[#7A8599] hidden lg:table-cell">
                                                {u.last_sign_in_at
                                                    ? new Date(u.last_sign_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                    : '—'
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                {u.role !== 'owner' && (
                                                    <button
                                                        onClick={() => handleUpdateUser(u.id, { is_active: !u.is_active })}
                                                        className={`p-1.5 rounded-md transition-colors ${u.is_active ? 'text-[#059669] hover:bg-[#ECFDF5]' : 'text-[#DC2626] hover:bg-[#FEF2F2]'}`}
                                                        title={u.is_active ? 'Deactivate user' : 'Reactivate user'}
                                                    >
                                                        {u.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>

                                        {/* Expanded Activity Details */}
                                        {expandedUser === u.id && (
                                            <tr className="bg-[#FAFBFC]">
                                                <td colSpan={6} className="px-4 py-3">
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 max-w-3xl mx-auto">
                                                        <ActivityStat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Pursuits" count={u.activity.pursuits_created} color="#2563EB" />
                                                        <ActivityStat icon={<FileText className="w-3.5 h-3.5" />} label="One-Pagers" count={u.activity.one_pagers_created} color="#8B5CF6" />
                                                        <ActivityStat icon={<GitBranch className="w-3.5 h-3.5" />} label="Stage Changes" count={u.activity.stage_changes} color="#F59E0B" />
                                                        <ActivityStat icon={<DollarSign className="w-3.5 h-3.5" />} label="Budgets" count={u.activity.budgets_created} color="#059669" />
                                                        <ActivityStat icon={<CalendarDays className="w-3.5 h-3.5" />} label="Key Dates" count={u.activity.key_dates_created} color="#D97706" />
                                                        <ActivityStat icon={<Map className="w-3.5 h-3.5" />} label="Land Comps" count={u.activity.land_comps_created} color="#DC2626" />
                                                    </div>
                                                    {u.created_at && (
                                                        <div className="text-center mt-3 text-[10px] text-[#A0AABB]">
                                                            Member since {new Date(u.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                        {users.length === 0 && (
                            <div className="text-center py-12 text-[#7A8599]">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No users yet. Invite your first team member.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Invite Dialog */}
            {showInvite && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                        {inviteSuccess ? (
                            <div className="text-center py-4">
                                <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center mx-auto mb-3">
                                    <Mail className="w-6 h-6 text-[#10B981]" />
                                </div>
                                <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">Invitation Sent!</h2>
                                <p className="text-sm text-[#7A8599]">
                                    An invite email has been sent to <span className="font-medium">{inviteEmail}</span>
                                </p>
                            </div>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">Invite User</h2>
                                <p className="text-sm text-[#7A8599] mb-6">
                                    They&apos;ll receive an email to set their password.
                                </p>

                                <form onSubmit={handleInvite} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Full Name</label>
                                        <input
                                            type="text"
                                            value={inviteName}
                                            onChange={(e) => setInviteName(e.target.value)}
                                            placeholder="e.g., Jane Smith"
                                            className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Email</label>
                                        <input
                                            type="email"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            placeholder="user@streetlights.com"
                                            className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Role</label>
                                        <select
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                                            className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                                        >
                                            <option value="member">Member — view, create, edit, delete</option>
                                            <option value="admin">Admin — Member + admin settings</option>
                                        </select>
                                    </div>

                                    {inviteError && (
                                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#DC2626]">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                            {inviteError}
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => { setShowInvite(false); setInviteError(null); }}
                                            className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={inviting}
                                            className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                                        >
                                            {inviting ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                                            ) : (
                                                <><UserPlus className="w-4 h-4" /> Send Invitation</>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}
        </AppShell>
    );
}

/** Small activity stat chip for the expanded row */
function ActivityStat({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
    return (
        <div className="flex flex-col items-center gap-1 py-2 px-2 rounded-lg bg-white border border-[#F0F1F4]">
            <div className="flex items-center gap-1" style={{ color }}>
                {icon}
                <span className="text-lg font-bold">{count}</span>
            </div>
            <span className="text-[10px] text-[#7A8599] uppercase tracking-wider font-semibold">{label}</span>
        </div>
    );
}
