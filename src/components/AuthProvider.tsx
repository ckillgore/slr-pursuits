'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

export type UserRole = 'owner' | 'admin' | 'member';

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    isLoading: boolean;
    isOwner: boolean;
    isAdmin: boolean;
    isAdminOrOwner: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    isLoading: true,
    isOwner: false,
    isAdmin: false,
    isAdminOrOwner: false,
    signOut: async () => { },
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const supabase = useRef(createClient()).current;
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch profile with retry (up to 3 attempts with exponential backoff)
    const fetchProfile = useCallback(async (userId: string, attempt = 0): Promise<UserProfile | null> => {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.warn(`[Auth] Profile fetch failed (attempt ${attempt + 1}):`, error.message);
                if (attempt < 2) {
                    // Retry with backoff: 500ms, 1500ms
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                    return fetchProfile(userId, attempt + 1);
                }
                return null;
            }
            return data as UserProfile;
        } catch (err) {
            console.warn(`[Auth] Profile fetch error (attempt ${attempt + 1}):`, err);
            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                return fetchProfile(userId, attempt + 1);
            }
            return null;
        }
    }, [supabase]);

    // Schedule a background retry if profile is null but user exists
    const scheduleProfileRetry = useCallback((userId: string) => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(async () => {
            console.log('[Auth] Retrying profile fetch...');
            const p = await fetchProfile(userId);
            if (p) {
                setProfile(p);
                console.log('[Auth] Profile recovered:', p.email);
            }
        }, 3000);
    }, [fetchProfile]);

    useEffect(() => {
        let mounted = true;

        // Get initial session
        const getSession = async () => {
            try {
                const { data: { user: currentUser }, error } = await supabase.auth.getUser();
                if (!mounted) return;

                if (error) {
                    console.warn('[Auth] getUser error:', error.message);
                    setUser(null);
                    setProfile(null);
                    setIsLoading(false);
                    return;
                }

                setUser(currentUser);
                if (currentUser) {
                    const p = await fetchProfile(currentUser.id);
                    if (!mounted) return;
                    setProfile(p);
                    // If profile fetch failed, schedule a background retry
                    if (!p) scheduleProfileRetry(currentUser.id);
                }
            } catch (err) {
                console.error('[Auth] Session init failed:', err);
                if (mounted) {
                    setUser(null);
                    setProfile(null);
                }
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        getSession();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event: AuthChangeEvent, session: Session | null) => {
                if (!mounted) return;
                const currentUser = session?.user ?? null;

                if (event === 'SIGNED_OUT' || !currentUser) {
                    setUser(null);
                    setProfile(null);
                    return;
                }

                // For TOKEN_REFRESHED, only update user ref — don't re-fetch profile
                // unless it's missing (prevents unnecessary DB calls)
                if (event === 'TOKEN_REFRESHED') {
                    setUser(currentUser);
                    // Only re-fetch profile if it's currently null (recovery)
                    if (!profile) {
                        const p = await fetchProfile(currentUser.id);
                        if (mounted && p) setProfile(p);
                    }
                    return;
                }

                // SIGNED_IN or INITIAL_SESSION
                setUser(currentUser);
                const p = await fetchProfile(currentUser.id);
                if (mounted) {
                    setProfile(p);
                    if (!p) scheduleProfileRetry(currentUser.id);
                }
                setIsLoading(false);
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        // Force a full page navigation to clear all client state
        window.location.href = '/login';
    };

    const isOwner = profile?.role === 'owner';
    const isAdmin = profile?.role === 'admin';
    const isAdminOrOwner = isOwner || isAdmin;

    return (
        <AuthContext.Provider value={{ user, profile, isLoading, isOwner, isAdmin, isAdminOrOwner, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
