import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-client';
import { requireAuth } from '@/app/api/_lib/auth';
import { refreshHellodataProperty } from '@/lib/hellodata/refresh-property';

/**
 * GET /api/hellodata/property?hellodataId=...&forceRefresh=...
 * 
 * Cache-first endpoint — NEVER auto-refreshes on staleness.
 * 
 * Behavior:
 * - If cached data exists → always returns it (zero API cost)
 * - If NO cached data exists (first-time add) → fetches from Hellodata API
 * - If forceRefresh=true → re-fetches from API (used by weekly background job)
 * 
 * Costs 1 Hellodata request (~$0.50) only on first add or explicit refresh.
 */
export async function GET(req: NextRequest) {
    // Allow cron jobs to bypass user auth via shared secret
    const cronSecret = process.env.CRON_SECRET;
    const isCronCall = cronSecret && req.headers.get('x-cron-secret') === cronSecret;

    let user: { id: string } | null = null;
    if (!isCronCall) {
        const { user: authedUser, response: authError } = await requireAuth();
        if (authError) return authError;
        user = authedUser;
    }

    const apiKey = process.env.HELLODATA_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'HELLODATA_API_KEY not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const hellodataId = searchParams.get('hellodataId');
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    if (!hellodataId) {
        return NextResponse.json({ error: 'hellodataId is required' }, { status: 400 });
    }

    // Use admin client for cron calls (bypasses RLS), regular client for user calls
    const supabase = isCronCall ? createAdminClient() : await createClient();

    try {
        // 1. Check cache — always return cached data if it exists (no auto-refresh)
        if (!forceRefresh) {
            const { data: cached } = await supabase
                .from('hellodata_properties')
                .select(`
                    id, hellodata_id, building_name, street_address, city, state, zip_code,
                    lat, lon, year_built, number_units, number_stories, msa,
                    management_company, building_website, building_phone,
                    is_single_family, is_apartment, is_condo, is_senior, is_student,
                    is_build_to_rent, is_affordable, is_lease_up,
                    building_quality, pricing_strategy, review_analysis,
                    demographics, fees, occupancy_over_time,
                    building_amenities, unit_amenities,
                    fetched_at, data_as_of, created_at, updated_at,
                    units:hellodata_units(*),
                    concessions:hellodata_concessions(*)
                `)
                .eq('hellodata_id', hellodataId)
                .single();

            if (cached) {
                console.log(`[hellodata] Cache hit for ${hellodataId}`);
                return NextResponse.json({ property: cached, source: 'cache' });
            }
        }

        // 2. Refresh from Hellodata API using shared utility
        const result = await refreshHellodataProperty(supabase, hellodataId, apiKey, user?.id);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ property: result.property, source: 'api' });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[hellodata] Property fetch error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
