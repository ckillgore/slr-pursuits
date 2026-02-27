import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Auth callback handler.
 * Exchanges the auth code for a session and redirects.
 * Used for: invite acceptance, password reset, email confirmation.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    // If code exchange fails, redirect to login with error
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
