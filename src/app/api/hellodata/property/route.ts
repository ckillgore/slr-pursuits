import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Timing helper
    const timings: Record<string, number> = {};
    const startTotal = Date.now();
    const time = (label: string) => { timings[label] = Date.now() - startTotal; };

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

            time('cache_check');

            if (cached) {
                console.log(`[hellodata] Cache hit for ${hellodataId} in ${timings.cache_check}ms`);
                return NextResponse.json({ property: cached, source: 'cache' });
            }
        }

        // 2. Fetch from Hellodata API
        const apiStart = Date.now();
        const hdResponse = await fetch(
            `https://api.hellodata.ai/property/${hellodataId}`,
            { headers: { 'x-api-key': apiKey } }
        );
        time('api_fetch');
        console.log(`[hellodata] API call for ${hellodataId}: ${hdResponse.status} in ${Date.now() - apiStart}ms`);

        // Log the API call (don't await — fire and forget)
        supabase.from('hellodata_fetch_log').insert({
            hellodata_id: hellodataId,
            endpoint: `/property/${hellodataId}`,
            response_status: hdResponse.status,
            fetched_by: user?.id || null,
        }).then(() => { });

        if (!hdResponse.ok) {
            const errorText = await hdResponse.text();
            return NextResponse.json(
                { error: `Hellodata API error: ${hdResponse.status}`, details: errorText },
                { status: hdResponse.status }
            );
        }

        const raw = await hdResponse.json();
        time('api_parse');

        const unitCount = raw.building_availability?.length ?? 0;
        const concessionCount = raw.concessions_history?.length ?? 0;
        console.log(`[hellodata] Parsed ${hellodataId}: ${unitCount} units, ${concessionCount} concessions`);

        // 3. Parse and upsert into DB (exclude raw_response to reduce payload size)
        const propertyData = {
            hellodata_id: raw.id || hellodataId,
            building_name: raw.building_name || null,
            street_address: raw.street_address || null,
            city: raw.city || null,
            state: raw.state || null,
            zip_code: raw.zip_code || null,
            lat: raw.lat || null,
            lon: raw.lon || null,
            year_built: raw.year_built || null,
            number_units: raw.number_units || null,
            number_stories: raw.number_stories || null,
            msa: raw.msa || null,
            management_company: raw.management_company || null,
            building_website: raw.building_website || null,
            building_phone: raw.building_phone_number || null,
            is_single_family: raw.is_single_family || false,
            is_apartment: raw.is_apartment ?? true,
            is_condo: raw.is_condo || false,
            is_senior: raw.is_senior || false,
            is_student: raw.is_student || false,
            is_build_to_rent: raw.is_build_to_rent || false,
            is_affordable: raw.is_affordable || false,
            is_lease_up: raw.is_lease_up || false,
            building_quality: raw.building_quality || null,
            pricing_strategy: raw.pricing_strategy || null,
            review_analysis: raw.review_analysis || null,
            demographics: raw.demographics || null,
            fees: extractFees(raw),
            occupancy_over_time: raw.occupancy_over_time || null,
            building_amenities: raw.building_amenities || [],
            unit_amenities: raw.unit_amenities || [],
            raw_response: null, // Don't store multi-MB raw blob — all useful fields are extracted above
            fetched_at: new Date().toISOString(),
            data_as_of: raw.created_on || null,
        };

        // Upsert property (on conflict of hellodata_id)
        const { data: upserted, error: upsertError } = await supabase
            .from('hellodata_properties')
            .upsert(propertyData, { onConflict: 'hellodata_id' })
            .select()
            .single();
        time('property_upsert');

        if (upsertError) {
            console.error('[hellodata] Property upsert error:', upsertError);
            return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }

        const propertyId = upserted.id;
        console.log(`[hellodata] Property upserted in ${timings.property_upsert}ms, id=${propertyId}`);

        // 4. Delete old child rows in PARALLEL
        await Promise.all([
            supabase.from('hellodata_units').delete().eq('property_id', propertyId),
            supabase.from('hellodata_concessions').delete().eq('property_id', propertyId),
        ]);
        time('delete_children');

        // 5. Insert units and concessions in PARALLEL
        const insertPromises: Promise<void>[] = [];

        if (raw.building_availability && raw.building_availability.length > 0) {
            const unitRows = raw.building_availability.map((unit: Record<string, unknown>) => ({
                property_id: propertyId,
                hellodata_unit_id: unit.id || null,
                is_floorplan: unit.is_floorplan || false,
                bed: unit.bed ?? null,
                bath: unit.bath ?? null,
                partial_bath: unit.partial_bath || 0,
                sqft: unit.sqft ?? null,
                min_sqft: unit.min_sqft ?? null,
                max_sqft: unit.max_sqft ?? null,
                floorplan_name: unit.floorplan_name || null,
                unit_name: unit.unit_name || null,
                floor: unit.floor ?? null,
                price: unit.price ?? null,
                min_price: unit.min_price ?? null,
                max_price: unit.max_price ?? null,
                effective_price: unit.effective_price ?? null,
                min_effective_price: unit.min_effective_price ?? null,
                max_effective_price: unit.max_effective_price ?? null,
                days_on_market: unit.days_on_market ?? null,
                lease_term: unit.lease_term ?? null,
                enter_market: unit.enter_market || null,
                exit_market: unit.exit_market || null,
                availability: unit.availability || null,
                amenities: unit.amenities || [],
                tags: unit.tags || [],
                history: unit.history || null,
                availability_periods: unit.availability_periods || null,
                price_plans: unit.price_plans || null,
            }));

            // Insert in batches of 50 (smaller batches = smaller payloads)
            for (let i = 0; i < unitRows.length; i += 50) {
                const batch = unitRows.slice(i, i + 50);
                insertPromises.push(
                    (async () => {
                        const { error } = await supabase.from('hellodata_units').insert(batch);
                        if (error) console.error(`[hellodata] Unit insert error (batch ${i}):`, error.message);
                    })()
                );
            }
        }

        if (raw.concessions_history && raw.concessions_history.length > 0) {
            const concessionRows = raw.concessions_history.map((c: Record<string, unknown>) => ({
                property_id: propertyId,
                hellodata_concession_id: c.id || null,
                concession_text: c.concessions || null,
                from_date: c.from_date || null,
                to_date: c.to_date || null,
                items: c.items || null,
            }));

            insertPromises.push(
                (async () => {
                    const { error } = await supabase.from('hellodata_concessions').insert(concessionRows);
                    if (error) console.error('[hellodata] Concession insert error:', error.message);
                })()
            );
        }

        // Wait for all inserts to complete
        await Promise.all(insertPromises);
        time('insert_children');

        const totalMs = Date.now() - startTotal;
        console.log(
            `[hellodata] Complete for ${hellodataId} in ${totalMs}ms ` +
            `| cache: ${timings.cache_check ?? '-'}ms ` +
            `| api: ${timings.api_fetch ?? '-'}ms ` +
            `| parse: ${timings.api_parse ?? '-'}ms ` +
            `| upsert: ${timings.property_upsert ?? '-'}ms ` +
            `| delete: ${timings.delete_children ?? '-'}ms ` +
            `| insert(${unitCount}u/${concessionCount}c): ${totalMs - (timings.delete_children ?? 0)}ms`
        );

        // 6. Return the upserted property data (skip redundant re-fetch)
        return NextResponse.json({ property: upserted, source: 'api' });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[hellodata] Property fetch error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}



/** Extract fee fields from raw Hellodata response into a flat object */
function extractFees(raw: Record<string, unknown>): Record<string, unknown> {
    const feeKeys = [
        'admin_fee', 'application_fee', 'storage_fee',
        'parking_covered', 'parking_garage', 'parking_surface_lot',
        'cats_monthly_rent', 'cats_one_time_fee', 'cats_deposit',
        'dogs_monthly_rent', 'dogs_one_time_fee', 'dogs_deposit',
        'min_deposit', 'max_deposit',
    ];
    const fees: Record<string, unknown> = {};
    for (const key of feeKeys) {
        if (raw[key] !== undefined && raw[key] !== null) {
            fees[key] = raw[key];
        }
    }
    // Include the fees array if present
    if (Array.isArray(raw.fees)) {
        fees.fee_items = raw.fees;
    }
    return Object.keys(fees).length > 0 ? fees : {};
}
