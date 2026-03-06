'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { AlertCircle, LogIn, Loader2 } from 'lucide-react';

/**
 * SessionGuard — renders a full-screen overlay when the user's session
 * is lost. Shows a brief message and auto-redirects to /login after a
 * short delay. The user can also click "Sign in again" immediately.
 *
 * Place this inside <AuthProvider> so it can consume the auth context.
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
    const { isSessionLost, isLoading, user, signOut } = useAuth();
    const [countdown, setCountdown] = useState(5);

    // Auto-redirect countdown when session is lost
    useEffect(() => {
        if (!isSessionLost) {
            setCountdown(5);
            return;
        }

        if (countdown <= 0) {
            signOut();
            return;
        }

        const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [isSessionLost, countdown, signOut]);

    // Also catch the case where loading is done, no user, and we're not
    // on the login page — this is the "limbo" state where the proxy let
    // the request through but the client has no session.
    const isLimbo = !isLoading && !user && typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login');

    useEffect(() => {
        if (isLimbo && !isSessionLost) {
            // Give a brief grace period for auth to settle, then redirect
            const timer = setTimeout(() => {
                console.warn('[SessionGuard] No session detected — redirecting to /login');
                window.location.href = '/login';
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isLimbo, isSessionLost]);

    if (isSessionLost) {
        return (
            <>
                {/* Keep children mounted but hidden to avoid unmount side effects */}
                <div style={{ display: 'none' }}>{children}</div>

                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
                        <div className="w-14 h-14 rounded-full bg-[var(--danger-bg)] flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-7 h-7 text-[var(--danger)]" />
                        </div>

                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                            Session Expired
                        </h2>
                        <p className="text-sm text-[var(--text-muted)] mb-6">
                            Your authentication session has expired. Please sign in again to continue.
                        </p>

                        <button
                            onClick={() => signOut()}
                            className="w-full py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors shadow-sm flex items-center justify-center gap-2"
                        >
                            <LogIn className="w-4 h-4" /> Sign In Again
                        </button>

                        <p className="text-xs text-[var(--text-faint)] mt-3">
                            Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}…
                        </p>
                    </div>
                </div>
            </>
        );
    }

    return <>{children}</>;
}
