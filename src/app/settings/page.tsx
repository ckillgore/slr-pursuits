'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, LogOut, Sun, Moon, Check, AlertCircle } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { useThemeStore } from '@/store/useThemeStore';
import { toast } from '@/lib/toast';
import { fetchActivity } from '@/lib/activity';
import { ActivityFeed, Avatar } from '@/components/admin/ActivityFeed';

const ROLE_TEXT = {
    owner: 'Owner — full access, including managing people',
    admin: 'Admin — full access, including admin settings',
    member: 'Member — pursuits, one-pagers, comps, tasks and reports',
} as const;

const MIN_PASSWORD = 8;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-4 md:grid-cols-[14rem_1fr] py-6 border-b border-[var(--border)] last:border-0">
            <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
                {description && <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>}
            </div>
            <div>{children}</div>
        </section>
    );
}

const inputCls = 'w-full max-w-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20';

export default function AccountSettingsPage() {
    const { profile, user, signOut, refreshProfile } = useAuth();
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);

    // Name (the form is keyed by the saved name, so it starts from it)
    const [name, setName] = useState(profile?.full_name ?? '');
    const [nameFor, setNameFor] = useState(profile?.full_name);
    if (profile && profile.full_name !== nameFor) {
        setNameFor(profile.full_name);
        setName(profile.full_name ?? '');
    }
    const [savingName, setSavingName] = useState(false);
    const saveName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile || !name.trim() || name.trim() === profile.full_name) return;
        setSavingName(true);
        const { error } = await createClient().from('user_profiles').update({ full_name: name.trim() }).eq('id', profile.id);
        setSavingName(false);
        if (error) toast.error('Couldn’t save your name', error);
        else { await refreshProfile(); toast.success('Name updated'); }
    };

    // Password
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [pwError, setPwError] = useState<string | null>(null);
    const [savingPw, setSavingPw] = useState(false);
    const savePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError(null);
        if (password.length < MIN_PASSWORD) return setPwError(`Use at least ${MIN_PASSWORD} characters.`);
        if (password !== confirm) return setPwError('The passwords don’t match.');
        setSavingPw(true);
        const { error } = await createClient().auth.updateUser({ password });
        setSavingPw(false);
        if (error) return setPwError(error.message);
        setPassword('');
        setConfirm('');
        toast.success('Password changed');
    };

    const { data: myActivity = [], isLoading: activityLoading } = useQuery({
        queryKey: ['activity', { actorId: profile?.id, mine: true }],
        queryFn: () => fetchActivity({ actorId: profile!.id }),
        enabled: !!profile,
    });

    if (!profile) {
        return <AppShell><div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" /></div></AppShell>;
    }

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <div className="flex items-center gap-4 mb-2">
                    <Avatar id={profile.id} name={profile.full_name || profile.email} size={48} />
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Account settings</h1>
                        <p className="text-sm text-[var(--text-muted)]">{profile.email}</p>
                    </div>
                </div>

                <Section title="Profile" description="How your name appears on pursuits, tasks and activity.">
                    <form onSubmit={saveName} className="space-y-3">
                        <label className="block">
                            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Full name</span>
                            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" />
                        </label>
                        <div>
                            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email</span>
                            <p className="text-sm text-[var(--text-primary)]">{profile.email}</p>
                            <p className="text-xs text-[var(--text-muted)]">Ask the owner if your email needs to change.</p>
                        </div>
                        <div>
                            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Role</span>
                            <p className="text-sm text-[var(--text-primary)]">{ROLE_TEXT[profile.role]}</p>
                        </div>
                        <button
                            type="submit"
                            disabled={savingName || !name.trim() || name.trim() === profile.full_name}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium"
                        >
                            {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
                        </button>
                    </form>
                </Section>

                <Section title="Password" description={`At least ${MIN_PASSWORD} characters. You stay signed in on this device.`}>
                    <form onSubmit={savePassword} className="space-y-3">
                        {/* Lets password managers attach the new password to the right account */}
                        <input type="email" value={user?.email ?? profile.email} autoComplete="username" readOnly hidden />
                        <label className="block">
                            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">New password</span>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Confirm new password</span>
                            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={inputCls} />
                        </label>
                        {pwError && <p role="alert" className="flex items-center gap-1.5 text-xs text-[var(--danger)]"><AlertCircle className="w-3.5 h-3.5" />{pwError}</p>}
                        <button
                            type="submit"
                            disabled={savingPw || !password}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium"
                        >
                            {savingPw && <Loader2 className="w-4 h-4 animate-spin" />} Change password
                        </button>
                    </form>
                </Section>

                <Section title="Appearance" description="Applies on this device.">
                    <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden" role="radiogroup" aria-label="Theme">
                        {([['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const).map(([value, label, Icon]) => (
                            <button
                                key={value}
                                role="radio"
                                aria-checked={theme === value}
                                onClick={() => setTheme(value)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm ${theme === value ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
                            >
                                <Icon className="w-4 h-4" /> {label}
                            </button>
                        ))}
                    </div>
                </Section>

                <Section title="Your recent activity" description="Changes you've made, newest first.">
                    {activityLoading
                        ? <Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" />
                        : <ActivityFeed entries={myActivity.slice(0, 15)} showActor={false} emptyText="Nothing recorded yet." />}
                </Section>

                <Section title="Sign out" description="Signs you out on this device.">
                    <button
                        onClick={() => void signOut()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--danger)] text-sm text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                    >
                        <LogOut className="w-4 h-4" /> Sign out
                    </button>
                </Section>
            </div>
        </AppShell>
    );
}
