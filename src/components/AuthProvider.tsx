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
    /** Whether we had a session that was lost (user can't interact but isn't on /login) */
    isSessionLost: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    isLoading: true,
    isOwner: false,
    isAdmin: false,
    isAdminOrOwner: false,
    isSessionLost: false,
    signOut: async () => { },
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ 
    children, 
    initialUser, 
    initialProfile 
}: { 
    children: ReactNode;
    initialUser?: User | null;
    initialProfile?: UserProfile | null;
}) {
    const supabase = useRef(createClient()).current;
    const [user, setUser] = useState<User | null>(initialUser ?? null);
    const [profile, setProfile] = useState<UserProfile | null>(initialProfile ?? null);
    const [isLoading, setIsLoading] = useState(!initialUser);
    const [isSessionLost, setIsSessionLost] = useState(false);
    const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
    /** Tracks whether we ever had a valid session (to distinguish "not yet loaded" from "lost") */
    const hadSessionRef = useRef(false);

    // Track latest profile in a ref so event listeners never read stale closure values
    const profileRef = useRef<UserProfile | null>(null);
    useEffect(() => { profileRef.current = profile; }, [profile]);

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

                console.log('[Auth] Session initialized for:', currentUser?.email ?? 'no user');
                setUser(currentUser);
                if (currentUser) {
                    hadSessionRef.current = true;
                    setIsSessionLost(false);
                    // Skip fetch if we already received the correct SSR profile
                    if (initialProfile && currentUser.id === initialUser?.id) {
                        setProfile(initialProfile);
                    } else {
                        const p = await fetchProfile(currentUser.id);
                        if (!mounted) return;
                        setProfile(p);
                        // If profile fetch failed, schedule a background retry
                        if (!p) scheduleProfileRetry(currentUser.id);
                    }
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

        // Cross-tab sync channel — declared early so onAuthStateChange can reference it
        let authChannel: BroadcastChannel | null = null;

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event: AuthChangeEvent, session: Session | null) => {
                if (!mounted) return;
                console.log('[Auth] State change:', event);
                const currentUser = session?.user ?? null;

                // Broadcast to other tabs so they re-sync immediately
                try { authChannel?.postMessage({ event, userId: currentUser?.id ?? null }); } catch { /* ignore */ }

                if (event === 'SIGNED_OUT' || !currentUser) {
                    console.log('[Auth] Signed out or no user');
                    setUser(null);
                    setProfile(null);
                    // If we previously had a session and this wasn't triggered by
                    // our own signOut(), mark the session as lost so the UI can
                    // show a recovery option.
                    if (hadSessionRef.current && event !== 'SIGNED_OUT') {
                        setIsSessionLost(true);
                    }
                    return;
                }

                // For TOKEN_REFRESHED, only update user ref — don't re-fetch profile
                // unless it's missing (prevents unnecessary DB calls)
                if (event === 'TOKEN_REFRESHED') {
                    setUser(currentUser);
                    // Use ref to read current profile — avoids stale closure
                    if (!profileRef.current) {
                        console.log('[Auth] Token refreshed, profile missing — recovering...');
                        const p = await fetchProfile(currentUser.id);
                        if (mounted && p) {
                            setProfile(p);
                            console.log('[Auth] Profile recovered on token refresh:', p.email);
                        }
                    } else {
                        console.log('[Auth] Token refreshed, profile intact');
                    }
                    return;
                }

                // SIGNED_IN or INITIAL_SESSION
                console.log('[Auth] Sign-in event, fetching profile...');
                hadSessionRef.current = true;
                setIsSessionLost(false);
                setUser(currentUser);
                
                // Skip fetch if we already received the correct SSR profile
                if (initialProfile && currentUser.id === initialUser?.id) {
                    setProfile(initialProfile);
                } else {
                    const p = await fetchProfile(currentUser.id);
                    if (mounted) {
                        setProfile(p);
                        if (!p) scheduleProfileRetry(currentUser.id);
                    }
                }
                
                setIsLoading(false);
            }
        );

        // ── Cross-tab session sync via BroadcastChannel ──
        // When another tab signs in/out or refreshes the token, this tab
        // re-reads the session from the shared cookie jar so all tabs stay
        // in sync without waiting for a visibility change.
        try {
            authChannel = new BroadcastChannel('supabase-auth-sync');
            authChannel.onmessage = async (e: MessageEvent) => {
                if (!mounted) return;
                const { event: remoteEvent, userId } = e.data as { event: string; userId: string | null };
                console.log('[Auth] Cross-tab sync received:', remoteEvent);

                if (remoteEvent === 'SIGNED_OUT' || !userId) {
                    // Another tab signed out — clear this tab's state too
                    setUser(null);
                    setProfile(null);
                    hadSessionRef.current = false;
                    setIsSessionLost(false);
                    window.location.href = '/login';
                    return;
                }

                // Another tab signed in or refreshed the token.
                // Re-read session from cookies (shared across tabs) to pick up
                // the new token without triggering another refresh ourselves.
                try {
                    const { data: { user: syncedUser } } = await supabase.auth.getUser();
                    if (!mounted) return;
                    if (syncedUser) {
                        setUser(syncedUser);
                        hadSessionRef.current = true;
                        setIsSessionLost(false);
                        // Recover profile if needed
                        if (!profileRef.current) {
                            const p = await fetchProfile(syncedUser.id);
                            if (mounted && p) setProfile(p);
                        }
                    }
                } catch {
                    console.warn('[Auth] Cross-tab sync: failed to re-read session');
                }
            };
        } catch {
            // BroadcastChannel not available — fall back to visibility-change only
            console.warn('[Auth] BroadcastChannel not available, multi-tab sync limited');
        }

        // Session health check: verify session when tab becomes visible again.
        // If the user's session expired while the tab was in the background,
        // this catches it immediately instead of leaving a broken UI.
        const handleVisibilityChange = async () => {
            if (document.visibilityState !== 'visible' || !mounted) return;

            try {
                const { data: { user: healthUser }, error } = await supabase.auth.getUser();
                if (error || !healthUser) {
                    console.warn('[Auth] Session health check failed:', error?.message ?? 'no user');
                    // If we previously had a session, mark it as lost so the UI
                    // can show a recovery option (sign-out button) instead of a
                    // broken state where the user is stuck.
                    if (hadSessionRef.current) {
                        setUser(null);
                        setProfile(null);
                        setIsSessionLost(true);
                    }
                } else if (healthUser && !profileRef.current) {
                    // Session is valid but profile was lost — recover it
                    console.log('[Auth] Session valid, recovering lost profile...');
                    setUser(healthUser);
                    setIsSessionLost(false);
                    const p = await fetchProfile(healthUser.id);
                    if (mounted && p) {
                        setProfile(p);
                        console.log('[Auth] Profile recovered on visibility change:', p.email);
                    }
                }
            } catch {
                // Network error — don't redirect, just log
                console.warn('[Auth] Session health check: network error');
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            mounted = false;
            subscription.unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            try { authChannel?.close(); } catch { /* ignore */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch (err) {
            // signOut can fail if the session is already invalid.
            // That's fine — we still want to clear local state and redirect.
            console.warn('[Auth] signOut error (clearing state anyway):', err);
        }
        setUser(null);
        setProfile(null);
        setIsSessionLost(false);
        hadSessionRef.current = false;
        // Force a full page navigation to clear all client state
        window.location.href = '/login';
    };

    const isOwner = profile?.role === 'owner';
    const isAdmin = profile?.role === 'admin';
    const isAdminOrOwner = isOwner || isAdmin;

    return (
        <AuthContext.Provider value={{ user, profile, isLoading, isOwner, isAdmin, isAdminOrOwner, isSessionLost, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
