import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Refresh a single Hellodata property by fetching from the API and upserting into the database.
 * 
 * This is a shared utility used by both:
 * - The `/api/hellodata/property` route (user-initiated refreshes)
 * - The `/api/cron/refresh-rent-comps` route (weekly background refreshes)
 * 
 * @param supabase  A Supabase client (admin or user-scoped)
 * @param hellodataId  The Hellodata property ID to refresh
 * @param apiKey  The Hellodata API key
 * @param fetchedBy  Optional user ID for audit logging
 * @returns Object with success status, property data, and timing info
 */
export async function refreshHellodataProperty(
    supabase: SupabaseClient,
    hellodataId: string,
    apiKey: string,
    fetchedBy?: string | null,
): Promise<{
    success: boolean;
    property?: Record<string, unknown>;
    error?: string;
    timings: Record<string, number>;
}> {
    const timings: Record<string, number> = {};
    const startTotal = Date.now();
    const time = (label: string) => { timings[label] = Date.now() - startTotal; };

    try {
        // 1. Fetch from Hellodata API
        const hdResponse = await fetch(
            `https://api.hellodata.ai/property/${hellodataId}`,
            { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(30_000) }
        );
        time('api_fetch');

        // Log the API call (fire and forget)
        supabase.from('hellodata_fetch_log').insert({
            hellodata_id: hellodataId,
            endpoint: `/property/${hellodataId}`,
            response_status: hdResponse.status,
            fetched_by: fetchedBy || null,
        }).then(() => { });

        if (!hdResponse.ok) {
            const errorText = await hdResponse.text();
            console.error('[hellodata] API error:', hdResponse.status, errorText.slice(0, 200));
            return { success: false, error: `API fetch failed (${hdResponse.status})`, timings };
        }

        const raw = await hdResponse.json();
        time('api_parse');

        // 2. Build property data and upsert
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
            raw_response: null,
            fetched_at: new Date().toISOString(),
            data_as_of: raw.created_on || null,
        };

        const { data: upserted, error: upsertError } = await supabase
            .from('hellodata_properties')
            .upsert(propertyData, { onConflict: 'hellodata_id' })
            .select()
            .single();
        time('property_upsert');

        if (upsertError) {
            console.error('[hellodata] Property upsert error:', upsertError);
            return { success: false, error: upsertError.message, timings };
        }

        const propertyId = upserted.id;

        // 3. Insert/Upsert units and concessions in parallel
        const insertPromises: Promise<void>[] = [];
        const childErrors: string[] = [];
        let unitUpsertFailed = false;
        let concessionUpsertFailed = false;

        // Dedupe by source id: a single upsert statement that touches the same
        // (property_id, hellodata_unit_id) twice fails with
        // "ON CONFLICT DO UPDATE command cannot affect row a second time".
        const dedupeBy = <T extends Record<string, unknown>>(rows: T[], key: keyof T): T[] => {
            const map = new Map<unknown, T>();
            for (const r of rows) map.set(r[key], r);
            return Array.from(map.values());
        };

        const unitRows = dedupeBy(
            ((raw.building_availability ?? []) as Record<string, unknown>[]).map((unit) => {
                const uid = unit.id ? String(unit.id) : `NO_ID_${Math.random().toString(36).slice(2)}`;
                return {
                    property_id: propertyId,
                    hellodata_unit_id: uid,
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
                };
            }),
            'hellodata_unit_id',
        );
        const validUnitIds = new Set(unitRows.map(r => r.hellodata_unit_id));

        for (let i = 0; i < unitRows.length; i += 50) {
            const batch = unitRows.slice(i, i + 50);
            insertPromises.push(
                (async () => {
                    const { error } = await supabase.from('hellodata_units')
                        .upsert(batch, { onConflict: 'property_id,hellodata_unit_id' });
                    if (error) {
                        unitUpsertFailed = true;
                        childErrors.push(`units: ${error.message}`);
                        console.error(`[hellodata] Unit upsert error (batch ${i}):`, error.message);
                    }
                })()
            );
        }

        const concessionRows = dedupeBy(
            ((raw.concessions_history ?? []) as Record<string, unknown>[]).map((c) => {
                const cid = c.id ? String(c.id) : `NO_ID_${Math.random().toString(36).slice(2)}`;
                return {
                    property_id: propertyId,
                    hellodata_concession_id: cid,
                    concession_text: c.concessions || null,
                    from_date: c.from_date || null,
                    to_date: c.to_date || null,
                    items: c.items || null,
                };
            }),
            'hellodata_concession_id',
        );
        const validConcessionIds = new Set(concessionRows.map(r => r.hellodata_concession_id));

        if (concessionRows.length > 0) {
            insertPromises.push(
                (async () => {
                    const { error } = await supabase.from('hellodata_concessions')
                        .upsert(concessionRows, { onConflict: 'property_id,hellodata_concession_id' });
                    if (error) {
                        concessionUpsertFailed = true;
                        childErrors.push(`concessions: ${error.message}`);
                        console.error('[hellodata] Concession upsert error:', error.message);
                    }
                })()
            );
        }

        await Promise.all(insertPromises);
        time('insert_children');

        // 4. Delete orphaned units and concessions.
        // Diff against the existing ids in JS and delete by primary key in batches,
        // rather than a `not.in.(...)` filter: that filter embeds every source id in
        // the URL (too long for large properties) and breaks on ids containing
        // commas/parens. Skipped for a table whose upsert failed, so we never delete
        // rows we couldn't replace. Errors are now surfaced instead of ignored.
        const deleteOrphans = async (
            table: 'hellodata_units' | 'hellodata_concessions',
            idColumn: 'hellodata_unit_id' | 'hellodata_concession_id',
            keep: Set<string>,
        ) => {
            const orphanIds: string[] = [];
            const pageSize = 1000;
            for (let from = 0; ; from += pageSize) {
                const { data, error } = await supabase
                    .from(table)
                    .select(`id, ${idColumn}`)
                    .eq('property_id', propertyId)
                    .order('id')
                    .range(from, from + pageSize - 1);
                if (error) {
                    childErrors.push(`${table} orphan scan: ${error.message}`);
                    return;
                }
                const rows = (data ?? []) as unknown as Record<string, string>[];
                for (const row of rows) {
                    if (!keep.has(row[idColumn])) orphanIds.push(row.id);
                }
                if (rows.length < pageSize) break;
            }
            for (let i = 0; i < orphanIds.length; i += 100) {
                const { error } = await supabase.from(table).delete().in('id', orphanIds.slice(i, i + 100));
                if (error) {
                    childErrors.push(`${table} orphan delete: ${error.message}`);
                    console.error(`[hellodata] Orphan delete error (${table}):`, error.message);
                    return;
                }
            }
        };

        await Promise.all([
            unitUpsertFailed ? Promise.resolve() : deleteOrphans('hellodata_units', 'hellodata_unit_id', validUnitIds),
            concessionUpsertFailed ? Promise.resolve() : deleteOrphans('hellodata_concessions', 'hellodata_concession_id', validConcessionIds),
        ]);
        time('delete_orphans');

        if (childErrors.length > 0) {
            return {
                success: false,
                property: upserted,
                error: `Property saved but units/concessions failed to sync (${childErrors.join('; ')})`,
                timings,
            };
        }

        return { success: true, property: upserted, timings };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[hellodata] Refresh error:', err);
        return { success: false, error: message, timings };
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
    if (Array.isArray(raw.fees)) {
        fees.fee_items = raw.fees;
    }
    return Object.keys(fees).length > 0 ? fees : {};
}
