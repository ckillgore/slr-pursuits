/**
 * Manual Rent Comp Refresh Script
 * 
 * Refreshes ALL HelloData properties linked to pursuits by:
 * 1. Querying Supabase for all pursuit_rent_comps → hellodata_properties
 * 2. De-duplicating by hellodata_id
 * 3. Fetching fresh data from HelloData API
 * 4. Upserting property, unit, and concession data back to Supabase
 * 
 * Usage: node scripts/refresh-all-rent-comps.mjs
 * 
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HELLODATA_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env.local ──────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const HELLODATA_API_KEY = env.HELLODATA_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !HELLODATA_API_KEY) {
    console.error('❌ Missing required env vars. Check .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ── Fee extraction (mirrors refresh-property.ts) ─────────────────────────
function extractFees(raw) {
    const feeKeys = [
        'admin_fee', 'application_fee', 'storage_fee',
        'parking_covered', 'parking_garage', 'parking_surface_lot',
        'cats_monthly_rent', 'cats_one_time_fee', 'cats_deposit',
        'dogs_monthly_rent', 'dogs_one_time_fee', 'dogs_deposit',
        'min_deposit', 'max_deposit',
    ];
    const fees = {};
    for (const key of feeKeys) {
        if (raw[key] !== undefined && raw[key] !== null) fees[key] = raw[key];
    }
    if (Array.isArray(raw.fees)) fees.fee_items = raw.fees;
    return Object.keys(fees).length > 0 ? fees : {};
}

// ── Refresh a single property ─────────────────────────────────────────────
async function refreshProperty(hellodataId) {
    const apiStart = Date.now();

    // 1. Fetch from HelloData API
    const hdResponse = await fetch(
        `https://api.hellodata.ai/property/${hellodataId}`,
        { headers: { 'x-api-key': HELLODATA_API_KEY }, signal: AbortSignal.timeout(30_000) }
    );

    if (!hdResponse.ok) {
        const errorText = await hdResponse.text();
        return { success: false, error: `API ${hdResponse.status}: ${errorText.slice(0, 100)}`, ms: Date.now() - apiStart };
    }

    const raw = await hdResponse.json();

    // 2. Upsert property
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

    if (upsertError) {
        return { success: false, error: `Upsert: ${upsertError.message}`, ms: Date.now() - apiStart };
    }

    const propertyId = upserted.id;
    const unitCount = raw.building_availability?.length ?? 0;
    const concessionCount = raw.concessions_history?.length ?? 0;

    // 3. Upsert units
    const validUnitIds = [];
    if (raw.building_availability?.length > 0) {
        const unitRows = raw.building_availability.map((unit) => {
            const uid = unit.id ? String(unit.id) : `NO_ID_${Math.random().toString(36).slice(2)}`;
            validUnitIds.push(uid);
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
        });

        for (let i = 0; i < unitRows.length; i += 50) {
            const batch = unitRows.slice(i, i + 50);
            const { error } = await supabase.from('hellodata_units')
                .upsert(batch, { onConflict: 'property_id,hellodata_unit_id' });
            if (error) console.error(`  ⚠️  Unit upsert error (batch ${i}):`, error.message);
        }
    }

    // 4. Upsert concessions
    const validConcessionIds = [];
    if (raw.concessions_history?.length > 0) {
        const concessionRows = raw.concessions_history.map((c) => {
            const cid = c.id ? String(c.id) : `NO_ID_${Math.random().toString(36).slice(2)}`;
            validConcessionIds.push(cid);
            return {
                property_id: propertyId,
                hellodata_concession_id: cid,
                concession_text: c.concessions || null,
                from_date: c.from_date || null,
                to_date: c.to_date || null,
                items: c.items || null,
            };
        });

        const { error } = await supabase.from('hellodata_concessions')
            .upsert(concessionRows, { onConflict: 'property_id,hellodata_concession_id' });
        if (error) console.error('  ⚠️  Concession upsert error:', error.message);
    }

    // 5. Delete orphaned units/concessions
    if (validUnitIds.length > 0) {
        await supabase.from('hellodata_units').delete()
            .eq('property_id', propertyId)
            .not('hellodata_unit_id', 'in', `(${validUnitIds.join(',')})`);
    } else {
        await supabase.from('hellodata_units').delete().eq('property_id', propertyId);
    }

    if (validConcessionIds.length > 0) {
        await supabase.from('hellodata_concessions').delete()
            .eq('property_id', propertyId)
            .not('hellodata_concession_id', 'in', `(${validConcessionIds.join(',')})`);
    } else {
        await supabase.from('hellodata_concessions').delete().eq('property_id', propertyId);
    }

    return {
        success: true,
        name: upserted.building_name,
        units: unitCount,
        concessions: concessionCount,
        ms: Date.now() - apiStart,
    };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
    console.log('🔄 Fetching all linked rent comps from Supabase...\n');

    // Get all linked properties
    const { data: links, error: linkErr } = await supabase
        .from('pursuit_rent_comps')
        .select(`
            property_id,
            property:hellodata_properties!inner(id, hellodata_id, building_name, fetched_at)
        `);

    if (linkErr) {
        console.error('❌ Failed to query pursuit_rent_comps:', linkErr.message);
        process.exit(1);
    }

    // De-duplicate
    const propertyMap = new Map();
    for (const row of links ?? []) {
        const prop = row.property;
        if (prop?.hellodata_id && !propertyMap.has(prop.hellodata_id)) {
            propertyMap.set(prop.hellodata_id, {
                id: prop.id,
                hellodata_id: prop.hellodata_id,
                building_name: prop.building_name,
                fetched_at: prop.fetched_at,
            });
        }
    }

    const properties = [...propertyMap.values()];
    console.log(`📊 Found ${links.length} comp links → ${properties.length} unique properties\n`);

    // Show what we're about to refresh
    for (const p of properties) {
        const age = p.fetched_at
            ? `${Math.round((Date.now() - new Date(p.fetched_at).getTime()) / (1000 * 60 * 60 * 24))}d ago`
            : 'never';
        console.log(`  • ${(p.building_name || 'Unknown').padEnd(40)} (last: ${age})`);
    }
    console.log('');

    // Refresh each property
    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        const prefix = `[${i + 1}/${properties.length}]`;
        process.stdout.write(`${prefix} ${(prop.building_name || prop.hellodata_id).padEnd(40)} `);

        try {
            const result = await refreshProperty(prop.hellodata_id);
            if (result.success) {
                successCount++;
                console.log(`✅ ${result.units}u/${result.concessions}c in ${result.ms}ms`);
            } else {
                failCount++;
                console.log(`❌ ${result.error}`);
            }
        } catch (err) {
            failCount++;
            console.log(`❌ ${err.message}`);
        }

        // Rate limit: 500ms between API calls
        if (i < properties.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const totalMs = Date.now() - startTime;
    console.log(`\n✨ Done in ${(totalMs / 1000).toFixed(1)}s: ${successCount} succeeded, ${failCount} failed`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
