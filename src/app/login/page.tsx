'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Building2, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [mode, setMode] = useState<'login' | 'reset'>('login');

    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (authError) {
            setError(
                authError.message === 'Invalid login credentials'
                    ? 'Invalid email or password. Please try again.'
                    : authError.message
            );
            setLoading(false);
            return;
        }

        // Successful login — middleware will redirect to /
        window.location.href = '/';
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
            email.trim(),
            { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password` }
        );

        if (resetError) {
            setError(resetError.message);
            setLoading(false);
            return;
        }

        setResetSent(true);
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8F9FB] via-[#EBF1FF] to-[#F4F5F7] px-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-[#1A1F2B] flex items-center justify-center mb-4 shadow-lg">
                        <Building2 className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-[#1A1F2B]">
                        SLR <span className="text-[#7A8599] font-normal">Pursuits</span>
                    </h1>
                    <p className="text-sm text-[#7A8599] mt-1">
                        Multifamily Development Feasibility
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white border border-[#E2E5EA] rounded-2xl p-6 shadow-xl shadow-black/5">
                    {mode === 'login' ? (
                        <>
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">Sign in</h2>
                            <p className="text-sm text-[#7A8599] mb-6">Enter your credentials to continue</p>

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                        Email
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@streetlights.com"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none transition-all"
                                            required
                                            autoComplete="email"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none transition-all"
                                            required
                                            autoComplete="current-password"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#DC2626]">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
                                    ) : (
                                        'Sign In'
                                    )}
                                </button>
                            </form>

                            <button
                                onClick={() => { setMode('reset'); setError(null); }}
                                className="w-full text-center text-sm text-[#2563EB] hover:text-[#1D4FD7] font-medium mt-4 transition-colors"
                            >
                                Forgot password?
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">Reset Password</h2>
                            <p className="text-sm text-[#7A8599] mb-6">
                                Enter your email and we&apos;ll send you a reset link.
                            </p>

                            {resetSent ? (
                                <div className="text-center py-4">
                                    <div className="w-12 h-12 rounded-full bg-[#EBF1FF] flex items-center justify-center mx-auto mb-3">
                                        <Mail className="w-6 h-6 text-[#2563EB]" />
                                    </div>
                                    <p className="text-sm text-[#4A5568]">
                                        Check your email for a password reset link.
                                    </p>
                                    <p className="text-xs text-[#7A8599] mt-1">
                                        Sent to <span className="font-medium">{email}</span>
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleResetPassword} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                            Email
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="you@streetlights.com"
                                                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none transition-all"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#DC2626]">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                                        ) : (
                                            'Send Reset Link'
                                        )}
                                    </button>
                                </form>
                            )}

                            <button
                                onClick={() => { setMode('login'); setError(null); setResetSent(false); }}
                                className="w-full text-center text-sm text-[#7A8599] hover:text-[#4A5568] font-medium mt-4 transition-colors"
                            >
                                ← Back to sign in
                            </button>
                        </>
                    )}
                </div>

                <p className="text-center text-[10px] text-[#A0AABB] mt-6">
                    © {new Date().getFullYear()} Streetlight Residential
                </p>
            </div>
        </div>
    );
}
