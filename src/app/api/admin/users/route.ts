import { createAdminClient } from '@/lib/supabase/admin-client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/admin/users
 * List all users with their profiles, last sign-in, and activity counts.
 * Requires: caller must be 'owner' role.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'owner') {
            return NextResponse.json({ error: 'Only the owner can manage users.' }, { status: 403 });
        }

        // Get all auth users for last_sign_in_at
        const adminClient = createAdminClient();
        // listUsers() defaults to 50 per page — request a large page so users
        // beyond the first 50 still get last_sign_in / confirmation data.
        const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

        if (authError) {
            console.error('List users error:', authError);
            return NextResponse.json({ error: authError.message }, { status: 500 });
        }

        // Get all profiles
        const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('*')
            .order('full_name', { ascending: true });

        if (profilesError) {
            return NextResponse.json({ error: profilesError.message }, { status: 500 });
        }

        // Fetch activity counts in parallel
        const [
            { data: pursuits },
            { data: onePagers },
            { data: stageChanges },
            { data: budgets },
            { data: keyDates },
            { data: landComps },
        ] = await Promise.all([
            supabase.from('pursuits').select('created_by'),
            supabase.from('one_pagers').select('created_by'),
            supabase.from('pursuit_stage_history').select('changed_by'),
            supabase.from('predev_budgets').select('created_by'),
            supabase.from('key_dates').select('created_by'),
            supabase.from('land_comps').select('created_by'),
        ]);

        // Build activity map: userId -> counts
        const activityMap = new Map<string, {
            pursuits_created: number;
            one_pagers_created: number;
            stage_changes: number;
            budgets_created: number;
            key_dates_created: number;
            land_comps_created: number;
            total: number;
        }>();

        const initUser = (id: string) => {
            if (!activityMap.has(id)) {
                activityMap.set(id, {
                    pursuits_created: 0,
                    one_pagers_created: 0,
                    stage_changes: 0,
                    budgets_created: 0,
                    key_dates_created: 0,
                    land_comps_created: 0,
                    total: 0,
                });
            }
            return activityMap.get(id)!;
        };

        const countField = (
            rows: { created_by?: string | null; changed_by?: string | null }[] | null,
            field: 'created_by' | 'changed_by',
            activityKey: keyof Omit<ReturnType<typeof initUser>, 'total'>
        ) => {
            for (const row of rows ?? []) {
                const uid = (row as any)[field];
                if (uid) {
                    const a = initUser(uid);
                    a[activityKey]++;
                    a.total++;
                }
            }
        };

        countField(pursuits, 'created_by', 'pursuits_created');
        countField(onePagers, 'created_by', 'one_pagers_created');
        countField(stageChanges, 'changed_by', 'stage_changes');
        countField(budgets, 'created_by', 'budgets_created');
        countField(keyDates, 'created_by', 'key_dates_created');
        countField(landComps, 'created_by', 'land_comps_created');

        // Merge auth data + activity with profiles
        const users = (profiles ?? []).map((p) => {
            const authUser = authData.users.find((u) => u.id === p.id);
            const activity = activityMap.get(p.id) ?? {
                pursuits_created: 0,
                one_pagers_created: 0,
                stage_changes: 0,
                budgets_created: 0,
                key_dates_created: 0,
                land_comps_created: 0,
                total: 0,
            };
            return {
                ...p,
                last_sign_in_at: authUser?.last_sign_in_at ?? null,
                email_confirmed_at: authUser?.email_confirmed_at ?? null,
                created_at: authUser?.created_at ?? null,
                activity,
            };
        });

        return NextResponse.json({ users });
    } catch (err) {
        console.error('List users error:', err);
        return NextResponse.json({ error: 'Failed to list users.' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/users
 * Update a user's role or active status. Body: { userId, role?, is_active? }
 * Requires: caller must be 'owner' role.
 */
export async function PATCH(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: callerProfile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (callerProfile?.role !== 'owner') {
            return NextResponse.json({ error: 'Only the owner can manage users.' }, { status: 403 });
        }

        const body = await request.json();
        const { userId, role, is_active } = body;

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
        }

        if (is_active !== undefined && typeof is_active !== 'boolean') {
            return NextResponse.json({ error: 'is_active must be a boolean.' }, { status: 400 });
        }

        // Prevent owner from deactivating themselves (would lock out user management)
        if (userId === user.id && is_active === false) {
            return NextResponse.json({ error: 'Cannot deactivate your own account.' }, { status: 400 });
        }

        // Prevent owner from changing their own role
        if (userId === user.id && role && role !== 'owner') {
            return NextResponse.json({ error: 'Cannot change your own role.' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (role !== undefined) {
            const validRoles = ['owner', 'admin', 'member'];
            if (!validRoles.includes(role)) {
                return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
            }
            updates.role = role;
        }
        if (is_active !== undefined) {
            updates.is_active = is_active;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
        }

        // Use admin client to bypass RLS for updating other users' profiles
        const adminClient = createAdminClient();
        const { data: updatedRows, error } = await adminClient
            .from('user_profiles')
            .update(updates)
            .eq('id', userId)
            .select('id');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!updatedRows || updatedRows.length === 0) {
            return NextResponse.json({ error: 'User not found.' }, { status: 404 });
        }

        // is_active is only a profile flag — nothing else checks it — so enforce
        // deactivation at the auth layer by banning / unbanning the auth user.
        // A ban blocks sign-in and token refresh.
        if (is_active !== undefined) {
            const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
                ban_duration: is_active ? 'none' : '876000h',
            });
            if (banError) {
                console.error('Update user ban status error:', banError);
                return NextResponse.json(
                    { error: 'Profile updated, but failed to update sign-in access.' },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Update user error:', err);
        return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
    }
}
