import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin-client';
import { createYardiClient } from '@/lib/supabase/yardi-client';
import { refreshHellodataProperty } from '@/lib/hellodata/refresh-property';
import { mapWithConcurrency } from '@/app/api/_lib/upstream';

// Refreshing every active comp takes minutes. Stop scheduling new refreshes
// with a safety margin so the function returns a summary instead of being
// killed mid-write; skipped properties are picked up next week (or by the
// admin batch refresh).
export const maxDuration = 300;
const TIME_BUDGET_MS = (maxDuration - 30) * 1000;
const REFRESH_CONCURRENCY = 3;

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
    // Fail closed: if CRON_SECRET isn't configured, nobody can trigger this
    // (it uses the service-role client and spends paid HelloData requests).
    if (!cronSecret) {
        console.error('[cron] CRON_SECRET is not configured — refusing to run');
        return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
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

            // 1. Get all active property codes from entity_config
            const { data: activeConfigs, error: configErr } = await yardiClient
                .from('entity_config')
                .select('property_code')
                .eq('is_active', true);

            if (configErr) {
                console.warn('[cron] AssetIntel config query failed (non-fatal):', configErr.message);
            } else if (activeConfigs && activeConfigs.length > 0) {
                const activeCodes = activeConfigs.map(c => c.property_code);

                // 2. Get comp links for those active property codes
                const { data: aiComps, error: aiErr } = await yardiClient
                    .from('hellodata_comp_links')
                    .select('hellodata_property_id')
                    .in('property_code', activeCodes);

                if (aiErr) {
                    console.warn('[cron] AssetIntel comp links query failed (non-fatal):', aiErr.message);
                } else if (aiComps && aiComps.length > 0) {
                    const localUuids = Array.from(new Set(
                        aiComps
                            .map(c => c.hellodata_property_id)
                            .filter(Boolean)
                    ));

                    if (localUuids.length > 0) {
                        // 3. Query hellodata_properties from pursuits DB for these UUIDs to resolve hellodata_id
                        const { data: propertiesFromDb, error: dbErr } = await supabase
                            .from('hellodata_properties')
                            .select('id, hellodata_id, fetched_at')
                            .in('id', localUuids);

                        if (dbErr) {
                            console.warn('[cron] Failed to fetch hellodata_properties from pursuits DB (non-fatal):', dbErr.message);
                        } else if (propertiesFromDb && propertiesFromDb.length > 0) {
                            for (const prop of propertiesFromDb) {
                                if (prop.hellodata_id && !propertyMap.has(prop.hellodata_id)) {
                                    propertyMap.set(prop.hellodata_id, {
                                        id: prop.id,
                                        hellodata_id: prop.hellodata_id,
                                        fetched_at: prop.fetched_at,
                                        source: 'assetintel',
                                    });
                                    assetintelCount++;
                                }
                            }
                        }
                    }
                }
            }
        } catch (aiError: any) {
            // AssetIntel connection failure should not block pursuit refreshes
            console.warn('[cron] AssetIntel connection failed (non-fatal):', aiError.message);
        }

        // Oldest cache first, so a run that hits the time budget still
        // refreshes the stalest data.
        const properties = [...propertyMap.values()].sort((a, b) =>
            String(a.fetched_at ?? '').localeCompare(String(b.fetched_at ?? ''))
        );

        // ── Refresh properties (small bounded concurrency) ──────────
        const settled = await mapWithConcurrency(
            properties,
            REFRESH_CONCURRENCY,
            async (prop) => {
                const propStart = Date.now();
                const result = await refreshHellodataProperty(supabase, prop.hellodata_id, apiKey);
                // Rate limit: brief pause per worker to avoid overwhelming Hellodata API
                await new Promise(resolve => setTimeout(resolve, 500));
                return {
                    hellodata_id: prop.hellodata_id,
                    status: result.success ? 'success' : `error:${result.error}`,
                    ms: Date.now() - propStart,
                    source: prop.source,
                };
            },
            () => Date.now() - startTime < TIME_BUDGET_MS,
        );
        const results = settled.filter((r): r is NonNullable<typeof r> => r !== undefined);
        const skipped = properties.length - results.length;
        if (skipped > 0) {
            console.warn(`[cron] Time budget reached; skipped ${skipped} of ${properties.length} properties`);
        }

        const totalMs = Date.now() - startTime;
        const successCount = results.filter(r => r.status === 'success').length;

        return NextResponse.json({
            refreshed: results.length,
            skipped,
            succeeded: successCount,
            failed: results.length - successCount,
            sources: { pursuit: pursuitCount, assetintel: assetintelCount },
            totalMs,
            results,
        });
    } catch (err: any) {
        console.error('[cron] Unexpected error:', err);
        return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 });
    }
}
