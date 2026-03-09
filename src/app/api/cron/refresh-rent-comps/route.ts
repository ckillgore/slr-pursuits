import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin-client';
import { refreshHellodataProperty } from '@/lib/hellodata/refresh-property';

/**
 * GET /api/cron/refresh-rent-comps
 * 
 * Vercel Cron — runs every Monday at 5:00 AM CT (11:00 UTC).
 * Refreshes all Hellodata properties linked to pursuits.
 * 
 * Uses the admin Supabase client (service role key) to bypass RLS,
 * and calls the HelloData API directly — no internal HTTP self-calls.
 */
export async function GET(req: Request) {
    // Verify cron secret (Vercel sets this header for cron invocations)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.HELLODATA_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'HELLODATA_API_KEY not configured' }, { status: 500 });
    }

    const supabase = createAdminClient();
    const startTime = Date.now();

    try {
        // 1. Get all unique hellodata_ids linked to pursuits
        const { data: links, error: linkErr } = await supabase
            .from('pursuit_rent_comps')
            .select(`
                property_id,
                property:hellodata_properties!inner(id, hellodata_id, fetched_at),
                pursuit:pursuits!inner(id, name, stage_id)
            `);

        console.log(`[cron] Query returned ${links?.length ?? 0} rows, error: ${linkErr?.message ?? 'none'}`);

        if (linkErr) {
            console.error('[cron] Failed to fetch pursuit_rent_comps:', linkErr.message);
            return NextResponse.json({ error: linkErr.message }, { status: 500 });
        }

        // De-duplicate by hellodata_id
        const propertyMap = new Map<string, { id: string; hellodata_id: string; fetched_at: string }>();
        for (const row of links ?? []) {
            const prop = row.property as any;
            if (prop?.hellodata_id && !propertyMap.has(prop.hellodata_id)) {
                propertyMap.set(prop.hellodata_id, {
                    id: prop.id,
                    hellodata_id: prop.hellodata_id,
                    fetched_at: prop.fetched_at,
                });
            }
        }

        const properties = [...propertyMap.values()];
        console.log(`[cron] Found ${properties.length} unique properties to refresh`);

        // 2. Refresh each property directly (no HTTP self-calls)
        const results: { hellodata_id: string; status: string; ms: number }[] = [];

        for (const prop of properties) {
            const propStart = Date.now();
            const result = await refreshHellodataProperty(supabase, prop.hellodata_id, apiKey);
            results.push({
                hellodata_id: prop.hellodata_id,
                status: result.success ? 'success' : `error:${result.error}`,
                ms: Date.now() - propStart,
            });

            // Rate limit: wait 500ms between requests to avoid overwhelming Hellodata API
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const totalMs = Date.now() - startTime;
        const successCount = results.filter(r => r.status === 'success').length;
        console.log(`[cron] Refresh complete in ${totalMs}ms: ${successCount}/${properties.length} succeeded`);

        return NextResponse.json({
            refreshed: properties.length,
            succeeded: successCount,
            failed: properties.length - successCount,
            totalMs,
            results,
        });
    } catch (err: any) {
        console.error('[cron] Unexpected error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
