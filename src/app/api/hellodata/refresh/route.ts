import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HELLODATA_CACHE_TTL_DAYS } from '@/lib/calculations/hellodataCalculations';

/**
 * POST /api/hellodata/refresh
 * 
 * Weekly background refresh endpoint. Refreshes all cached Hellodata properties
 * that are linked to pursuits in ACTIVE stages only.
 * 
 * "Active" = pursuit's stage has is_active = true (excludes Passed, Dead).
 * Only refreshes properties whose cache is older than HELLODATA_CACHE_TTL_DAYS.
 * 
 * Can be called manually from an admin UI or via a cron job.
 */
export async function POST() {
    const apiKey = process.env.HELLODATA_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'HELLODATA_API_KEY not configured' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    try {
        // 1. Find all properties linked to pursuits with active stages
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - HELLODATA_CACHE_TTL_DAYS);
        const cutoffIso = cutoffDate.toISOString();

        // Get distinct hellodata property IDs needing refresh:
        // - linked to a non-archived pursuit
        // - whose pursuit stage is active (is_active = true)
        // - cached data older than TTL
        const { data: staleComps, error: queryError } = await supabase
            .from('pursuit_rent_comps')
            .select(`
                property_id,
                property:hellodata_properties!inner(hellodata_id, fetched_at),
                pursuit:pursuits!inner(
                    is_archived,
                    stage:pursuit_stages!inner(is_active)
                )
            `)
            .eq('pursuit.is_archived', false)
            .eq('pursuit.stage.is_active', true)
            .lt('property.fetched_at', cutoffIso);

        if (queryError) {
            console.error('Refresh query error:', queryError);
            return NextResponse.json({ error: queryError.message }, { status: 500 });
        }

        // De-duplicate by hellodata_id
        const uniqueIds = new Map<string, string>();
        for (const comp of (staleComps || [])) {
            const prop = comp.property as unknown as { hellodata_id: string };
            if (prop?.hellodata_id) {
                uniqueIds.set(prop.hellodata_id, comp.property_id);
            }
        }

        const results: { hellodataId: string; status: 'success' | 'error'; error?: string }[] = [];

        // 2. Refresh each property via the cache endpoint
        for (const [hellodataId] of uniqueIds) {
            try {
                // Call our own property endpoint with forceRefresh
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                const response = await fetch(
                    `${baseUrl}/api/hellodata/property?hellodataId=${hellodataId}&forceRefresh=true`,
                    {
                        headers: {
                            // Forward auth cookies
                            cookie: '',
                        },
                    }
                );

                if (response.ok) {
                    results.push({ hellodataId, status: 'success' });
                } else {
                    const err = await response.text();
                    results.push({ hellodataId, status: 'error', error: err });
                }

                // Respectful rate limiting — small delay between calls
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err) {
                results.push({
                    hellodataId,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        // Log the batch refresh
        await supabase.from('hellodata_fetch_log').insert({
            hellodata_id: 'BATCH_REFRESH',
            endpoint: '/api/hellodata/refresh',
            response_status: 200,
            fetched_by: user?.id || null,
        });

        return NextResponse.json({
            message: `Refreshed ${results.filter(r => r.status === 'success').length}/${uniqueIds.size} properties`,
            total: uniqueIds.size,
            success: results.filter(r => r.status === 'success').length,
            errors: results.filter(r => r.status === 'error'),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Batch refresh error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
