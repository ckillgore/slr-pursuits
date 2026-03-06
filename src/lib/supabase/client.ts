import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
    if (!client) {
        client = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: {
                    // The proxy handles server-side token refresh on every request.
                    // Let the browser client also auto-refresh so that long-lived
                    // tabs stay alive even without navigation.
                    autoRefreshToken: true,
                    // Re-check session when the tab regains focus, syncing any
                    // tokens that the proxy refreshed while the tab was hidden.
                    detectSessionInUrl: true,
                    // Use cookie storage (default for createBrowserClient) — this
                    // ensures the browser and proxy share the same token store and
                    // avoids split-brain between localStorage and cookies.
                    persistSession: true,
                    // PKCE flow for security (default)
                    flowType: 'pkce',
                },
            }
        );
    }
    return client;
}
