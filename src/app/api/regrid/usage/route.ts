import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getRegridUsage, REGRID_OVERAGE_PER_RECORD } from '@/app/api/_lib/regridUsage';

/**
 * GET /api/regrid/usage
 *
 * This billing cycle's Regrid totals (from Regrid, account-wide) for everyone.
 * Owners/admins also get the app's log of who used records, and for what —
 * RLS returns no log rows to anyone else.
 */
export async function GET() {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    const usage = await getRegridUsage();
    if (!usage) return NextResponse.json({ error: 'Regrid usage is unavailable' }, { status: 502 });

    const supabase = await createClient();
    const { data: rows } = await supabase
        .from('regrid_usage_log')
        .select('id, created_at, user_id, purpose, records, detail')
        .gte('created_at', usage.cycleStart)
        .order('created_at', { ascending: false })
        .limit(500);

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { data: profiles } = userIds.length
        ? await supabase.from('user_profiles').select('id, full_name, email').in('id', userIds)
        : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || 'Unknown']));

    return NextResponse.json({
        usage,
        overagePerRecord: REGRID_OVERAGE_PER_RECORD,
        log: (rows ?? []).map((r) => ({ ...r, user_name: names.get(r.user_id) ?? 'Unknown' })),
    });
}
