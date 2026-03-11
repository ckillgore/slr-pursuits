import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client for reading from the secondary Yardi database.
 * NEVER import this from client-side code to protect the credentials.
 */
export function createYardiClient() {
    const url = process.env.YARDI_SUPABASE_URL;
    const key = process.env.YARDI_SUPABASE_ROLE_KEY || process.env.YARDI_SUPABASE_ANON_KEY;

    if (!url || !key) {
        throw new Error(
            'Missing YARDI_SUPABASE_URL or YARDI_SUPABASE_ROLE_KEY/YARDI_SUPABASE_ANON_KEY. ' +
            'Add these to .env.local to enable the accounting integration.'
        );
    }

    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
