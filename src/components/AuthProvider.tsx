'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

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
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const supabase = createClient();

    // Fetch profile from user_profiles table
    const fetchProfile = async (userId: string) => {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Failed to fetch user profile:', error);
            return null;
        }
        return data as UserProfile;
    };

    useEffect(() => {
        // Get initial session
        const getSession = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            setUser(currentUser);
            if (currentUser) {
                const p = await fetchProfile(currentUser.id);
                setProfile(p);
            }
            setIsLoading(false);
        };

        getSession();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                const currentUser = session?.user ?? null;
                setUser(currentUser);
                if (currentUser) {
                    const p = await fetchProfile(currentUser.id);
                    setProfile(p);
                } else {
                    setProfile(null);
                }
                setIsLoading(false);
            }
        );

        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
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
