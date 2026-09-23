import { createAdminClient } from '@/lib/supabase/admin-client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/admin/invite
 * Invite a new user. Body: { email, full_name, role }
 * Requires: caller must be 'owner' role.
 */
export async function POST(request: Request) {
    try {
        // Verify the calling user is owner
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'owner') {
            return NextResponse.json({ error: 'Only the owner can invite users.' }, { status: 403 });
        }

        const body = await request.json();
        const { email, full_name, role } = body;

        if (!email || !full_name || typeof email !== 'string' || typeof full_name !== 'string') {
            return NextResponse.json({ error: 'Email and full name are required.' }, { status: 400 });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
        }

        const validRoles = ['admin', 'member'];
        const userRole = validRoles.includes(role) ? role : 'member';

        // Use admin client to invite user
        const adminClient = createAdminClient();
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
            data: { full_name, role: userRole },
            redirectTo: `${new URL(request.url).origin}/auth/callback?next=/auth/reset-password`,
        });

        if (error) {
            console.error('Invite error:', error);
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }

        // Set the role explicitly with the service-role client rather than
        // relying solely on the signup trigger reading user_metadata.
        if (data.user) {
            const { error: profileError } = await adminClient
                .from('user_profiles')
                .update({ role: userRole, full_name })
                .eq('id', data.user.id);
            if (profileError) {
                console.error('Invite profile update error:', profileError);
            }
        }

        return NextResponse.json({ user: data.user });
    } catch (err) {
        console.error('Invite error:', err);
        return NextResponse.json({ error: 'Failed to invite user.' }, { status: 500 });
    }
}
