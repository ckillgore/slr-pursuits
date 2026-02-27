import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client with service role key.
 * Used for admin operations: inviting users, listing auth users, etc.
 * NEVER import this from client-side code.
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        throw new Error(
            'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL. ' +
            'Add SUPABASE_SERVICE_ROLE_KEY to .env.local (from Supabase Dashboard > Settings > API).'
        );
    }

    return createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
