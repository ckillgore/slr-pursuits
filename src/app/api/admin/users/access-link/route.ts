import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/admin/users/access-link
 * Owner only. Emails a person a link to set their password — for an invite that
 * expired or got lost, or someone locked out. Body: { email }
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'owner') {
            return NextResponse.json({ error: 'Only the owner can send access links.' }, { status: 403 });
        }

        const { email } = await request.json();
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
        }
        // Only for people already on the team
        const { data: member } = await supabase.from('user_profiles').select('id').eq('email', email.trim()).maybeSingle();
        if (!member) return NextResponse.json({ error: 'No team member has that email.' }, { status: 404 });

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${new URL(request.url).origin}/auth/callback?next=/auth/reset-password`,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Access link error:', err);
        return NextResponse.json({ error: 'Failed to send the link.' }, { status: 500 });
    }
}
