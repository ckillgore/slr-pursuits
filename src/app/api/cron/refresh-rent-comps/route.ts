import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin-client';
import { createYardiClient } from '@/lib/supabase/yardi-client';
import { refreshHellodataProperty } from '@/lib/hellodata/refresh-property';

/**
 * GET /api/cron/refresh-rent-comps
 * 
 * Vercel Cron — runs every Monday at 5:00 AM CT (11:00 UTC).
 * Refreshes all Hellodata properties that are actively used by:
 *   1. Pursuits (via pursuit_rent_comps)
 *   2. AssetIntel portfolio deals (via market_comp_config.is_active)
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
        // ── Source 1: Pursuit-linked properties ──────────────────────
        const { data: links, error: linkErr } = await supabase
            .from('pursuit_rent_comps')
            .select(`
                property_id,
                property:hellodata_properties!inner(id, hellodata_id, fetched_at),
                pursuit:pursuits!inner(id, name, stage_id)
            `);

        console.log(`[cron] Pursuit query returned ${links?.length ?? 0} rows, error: ${linkErr?.message ?? 'none'}`);

        if (linkErr) {
            console.error('[cron] Failed to fetch pursuit_rent_comps:', linkErr.message);
            return NextResponse.json({ error: linkErr.message }, { status: 500 });
        }

        // De-duplicate pursuit properties by hellodata_id
        const propertyMap = new Map<string, { id: string; hellodata_id: string; fetched_at: string; source: string }>();
        for (const row of links ?? []) {
            const prop = row.property as any;
            if (prop?.hellodata_id && !propertyMap.has(prop.hellodata_id)) {
                propertyMap.set(prop.hellodata_id, {
                    id: prop.id,
                    hellodata_id: prop.hellodata_id,
                    fetched_at: prop.fetched_at,
                    source: 'pursuit',
                });
            }
        }

        const pursuitCount = propertyMap.size;

        // ── Source 2: AssetIntel active comps ────────────────────────
        let assetintelCount = 0;
        try {
            const yardiClient = createYardiClient();
            const { data: aiComps, error: aiErr } = await yardiClient
                .from('market_comp_config')
                .select('hellodata_prop_id, property_name')
                .eq('is_active', true);

            if (aiErr) {
                console.warn('[cron] AssetIntel query failed (non-fatal):', aiErr.message);
            } else if (aiComps && aiComps.length > 0) {
                for (const comp of aiComps) {
                    if (comp.hellodata_prop_id && !propertyMap.has(comp.hellodata_prop_id)) {
                        // Check if this property is already cached in pursuits DB
                        const { data: existing } = await supabase
                            .from('hellodata_properties')
                            .select('id, fetched_at')
                            .eq('hellodata_id', comp.hellodata_prop_id)
                            .maybeSingle();

                        propertyMap.set(comp.hellodata_prop_id, {
                            id: existing?.id ?? '',
                            hellodata_id: comp.hellodata_prop_id,
                            fetched_at: existing?.fetched_at ?? '',
                            source: 'assetintel',
                        });
                        assetintelCount++;
                    }
                }
                console.log(`[cron] AssetIntel added ${assetintelCount} additional properties`);
            }
        } catch (aiError: any) {
            // AssetIntel connection failure should not block pursuit refreshes
            console.warn('[cron] AssetIntel connection failed (non-fatal):', aiError.message);
        }

        const properties = [...propertyMap.values()];
        console.log(`[cron] Total: ${properties.length} unique properties (${pursuitCount} pursuit, ${assetintelCount} assetintel-only)`);

        // ── Refresh each property ───────────────────────────────────
        const results: { hellodata_id: string; status: string; ms: number; source: string }[] = [];

        for (const prop of properties) {
            const propStart = Date.now();
            const result = await refreshHellodataProperty(supabase, prop.hellodata_id, apiKey);
            results.push({
                hellodata_id: prop.hellodata_id,
                status: result.success ? 'success' : `error:${result.error}`,
                ms: Date.now() - propStart,
                source: prop.source,
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
            sources: { pursuit: pursuitCount, assetintel: assetintelCount },
            totalMs,
            results,
        });
    } catch (err: any) {
        console.error('[cron] Unexpected error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
