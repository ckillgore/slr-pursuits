'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
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
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 3 * 60 * 1000, // 3 minutes — avoids re-fetches on tab/page navigation
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

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
