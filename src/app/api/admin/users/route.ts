import { createAdminClient } from '@/lib/supabase/admin-client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type Role = 'owner' | 'admin' | 'member';

/** The signed-in caller and their role, or an error response */
async function caller() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { supabase, user: null, role: null as Role | null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
    return { supabase, user, role: (profile?.role ?? null) as Role | null, error: null };
}

const DAY = 86_400_000;

/**
 * GET /api/admin/users
 * The team, with how each person uses the app. Owners and admins can view;
 * only the owner can change anything (`canManage`).
 */
export async function GET() {
    try {
        const { supabase, user, role, error } = await caller();
        if (error) return error;
        if (role !== 'owner' && role !== 'admin') {
            return NextResponse.json({ error: 'Only owners and admins can view the team.' }, { status: 403 });
        }

        const adminClient = createAdminClient();
        const since30 = new Date(Date.now() - 30 * DAY).toISOString();
        const since30Day = since30.slice(0, 10);

        const [authRes, profilesRes, presenceRes, daysRes, recentRes, allRes] = await Promise.all([
            // listUsers() defaults to 50 per page — ask for everyone
            adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
            supabase.from('user_profiles').select('*').order('full_name', { ascending: true }),
            supabase.from('user_presence').select('user_id, last_seen_at, first_seen_at'),
            supabase.from('user_active_days').select('user_id, day').gte('day', since30Day),
            supabase.from('activity_log').select('actor_id, change_count, last_at').gte('last_at', since30).limit(20_000),
            supabase.from('activity_log').select('actor_id').limit(50_000),
        ]);
        if (authRes.error) return NextResponse.json({ error: authRes.error.message }, { status: 500 });
        if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });

        const presence = new Map((presenceRes.data ?? []).map((p) => [p.user_id, p]));
        const activeDays = new Map<string, number>();
        for (const d of daysRes.data ?? []) activeDays.set(d.user_id, (activeDays.get(d.user_id) ?? 0) + 1);
        const recent = new Map<string, { entries: number; changes: number; lastAt: string | null }>();
        for (const r of recentRes.data ?? []) {
            const cur = recent.get(r.actor_id) ?? { entries: 0, changes: 0, lastAt: null };
            cur.entries += 1;
            cur.changes += r.change_count;
            if (!cur.lastAt || r.last_at > cur.lastAt) cur.lastAt = r.last_at;
            recent.set(r.actor_id, cur);
        }
        const totals = new Map<string, number>();
        for (const r of allRes.data ?? []) totals.set(r.actor_id, (totals.get(r.actor_id) ?? 0) + 1);
        const authById = new Map(authRes.data.users.map((u) => [u.id, u]));

        const users = (profilesRes.data ?? []).map((p) => {
            const a = authById.get(p.id);
            const pr = presence.get(p.id);
            const r = recent.get(p.id);
            // Before presence tracking existed, the best "last active" is the later of sign-in and last edit
            const candidates = [pr?.last_seen_at, a?.last_sign_in_at, r?.lastAt].filter(Boolean) as string[];
            return {
                id: p.id,
                email: p.email,
                full_name: p.full_name,
                role: p.role as Role,
                is_active: p.is_active,
                invited_at: a?.invited_at ?? null,
                created_at: a?.created_at ?? null,
                email_confirmed_at: a?.email_confirmed_at ?? null,
                last_sign_in_at: a?.last_sign_in_at ?? null,
                last_active_at: candidates.sort().at(-1) ?? null,
                active_days_30: activeDays.get(p.id) ?? 0,
                edits_30: r?.entries ?? 0,
                changes_30: r?.changes ?? 0,
                edits_total: totals.get(p.id) ?? 0,
            };
        });

        return NextResponse.json({ users, canManage: role === 'owner', me: user!.id });
    } catch (err) {
        console.error('List users error:', err);
        return NextResponse.json({ error: 'Failed to list users.' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/users
 * Owner only. Body: { userId, role?, is_active?, full_name? }
 */
export async function PATCH(request: Request) {
    try {
        const { user, role: callerRole, error } = await caller();
        if (error) return error;
        if (callerRole !== 'owner') {
            return NextResponse.json({ error: 'Only the owner can manage users.' }, { status: 403 });
        }

        const body = await request.json();
        const { userId, role, is_active, full_name } = body;

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
        }
        if (is_active !== undefined && typeof is_active !== 'boolean') {
            return NextResponse.json({ error: 'is_active must be a boolean.' }, { status: 400 });
        }
        // The owner can't lock themselves out of user management
        if (userId === user!.id && is_active === false) {
            return NextResponse.json({ error: 'You can’t deactivate your own account.' }, { status: 400 });
        }
        if (userId === user!.id && role && role !== 'owner') {
            return NextResponse.json({ error: 'You can’t change your own role.' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (role !== undefined) {
            if (!['admin', 'member'].includes(role) && !(role === 'owner' && userId === user!.id)) {
                return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
            }
            updates.role = role;
        }
        if (is_active !== undefined) updates.is_active = is_active;
        if (full_name !== undefined) {
            if (typeof full_name !== 'string' || !full_name.trim() || full_name.length > 120) {
                return NextResponse.json({ error: 'Enter a name.' }, { status: 400 });
            }
            updates.full_name = full_name.trim();
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
        }

        // Service role: the owner edits other people's profiles
        const adminClient = createAdminClient();
        const { data: updatedRows, error: updateError } = await adminClient
            .from('user_profiles')
            .update(updates)
            .eq('id', userId)
            .select('id');
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        if (!updatedRows?.length) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

        // is_active is only a profile flag — enforce it at sign-in by banning the auth user
        if (is_active !== undefined) {
            const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
                ban_duration: is_active ? 'none' : '876000h',
            });
            if (banError) {
                console.error('Update user ban status error:', banError);
                return NextResponse.json({ error: 'Profile updated, but failed to update sign-in access.' }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Update user error:', err);
        return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
    }
}
