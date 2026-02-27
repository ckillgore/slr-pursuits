'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Building2, Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const supabase = createClient();

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        const { error: updateError } = await supabase.auth.updateUser({
            password,
        });

        if (updateError) {
            setError(updateError.message);
            setLoading(false);
            return;
        }

        setSuccess(true);
        setLoading(false);

        // Redirect to dashboard after brief delay
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
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
                </div>

                <div className="bg-white border border-[#E2E5EA] rounded-2xl p-6 shadow-xl shadow-black/5">
                    {success ? (
                        <div className="text-center py-4">
                            <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center mx-auto mb-3">
                                <CheckCircle className="w-6 h-6 text-[#10B981]" />
                            </div>
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">Password Updated</h2>
                            <p className="text-sm text-[#7A8599]">Redirecting to dashboard...</p>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">Set New Password</h2>
                            <p className="text-sm text-[#7A8599] mb-6">Choose a strong password for your account.</p>

                            <form onSubmit={handleReset} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Min. 8 characters"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none transition-all"
                                            required
                                            autoFocus
                                            minLength={8}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Re-enter password"
                                            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none transition-all"
                                            required
                                            minLength={8}
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
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</>
                                    ) : (
                                        'Update Password'
                                    )}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
