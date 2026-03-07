'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AuthProvider } from '@/components/AuthProvider';
import { SessionGuard } from '@/components/SessionGuard';
import { useThemeStore } from '@/store/useThemeStore';

/**
 * Applies the persisted theme to the DOM on mount.
 * The store also applies it eagerly on creation, but this
 * useEffect ensures hydration is correct after SSR.
 */
function ThemeInitializer() {
    const theme = useThemeStore((s) => s.theme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return null;
}

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => {
        const handleAuthError = (error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            // Catch PostgREST expired JWT, Invalid JWT, or missing auth tokens
            if (
                msg.includes('JWT') ||
                msg.toLowerCase().includes('auth session missing') ||
                msg.toLowerCase().includes('not logged in') ||
                msg.includes('JWSError')
            ) {
                console.error('[React Query] Auth error intercepted, enforcing sign out:', msg);
                // Trigger global sign out which fires onAuthStateChange('SIGNED_OUT')
                // and activates the SessionGuard overlay automatically.
                createClient().auth.signOut().catch(() => {});
            }
        };

        return new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 3 * 60 * 1000, // 3 minutes — avoids re-fetches on tab/page navigation
                    refetchOnWindowFocus: false,
                },
            },
            queryCache: new QueryCache({
                onError: handleAuthError,
            }),
            mutationCache: new MutationCache({
                onError: handleAuthError,
            }),
        });
    });

    return (
        <AuthProvider>
            <SessionGuard>
                <QueryClientProvider client={queryClient}>
                    <ThemeInitializer />
                    {children}
                </QueryClientProvider>
            </SessionGuard>
        </AuthProvider>
    );
}
