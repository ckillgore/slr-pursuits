import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Verify that the request is from an authenticated user.
 * Returns the user object on success, or a 401 NextResponse on failure.
 */
export async function requireAuth() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    return { user, response: null };
}
