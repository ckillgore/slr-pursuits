/**
 * One-time refresh for assetintel active comps that are stale.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

const pursuitsSb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});
const yardiSb = createClient(env.YARDI_SUPABASE_URL, env.YARDI_SUPABASE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const API_KEY = env.HELLODATA_API_KEY;
const API_BASE = 'https://api.hellodata.ai/v2';

async function fetchFromHelloData(hellodataId) {
    const url = `${API_BASE}/properties/${hellodataId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HelloData API ${res.status}: ${res.statusText}`);
    return res.json();
}

async function refreshProperty(hellodataId, name) {
    try {
        const raw = await fetchFromHelloData(hellodataId);
        
        // Upsert property into pursuits DB
        const propertyData = {
            hellodata_id: hellodataId,
            building_name: raw.building_name,
            street_address: raw.street_address,
            city: raw.city,
            state: raw.state,
            zip_code: raw.zip_code,
            lat: raw.lat,
            lon: raw.lon,
            year_built: raw.year_built,
            number_units: raw.number_units,
            number_stories: raw.number_stories,
            msa: raw.msa,
            management_company: raw.management_company,
            building_website: raw.building_website,
            building_phone: raw.building_phone,
            is_single_family: raw.is_single_family,
            is_apartment: raw.is_apartment,
            is_condo: raw.is_condo,
            is_senior: raw.is_senior,
            is_student: raw.is_student,
            is_build_to_rent: raw.is_build_to_rent,
            is_affordable: raw.is_affordable,
            is_lease_up: raw.is_lease_up,
            building_quality: raw.building_quality,
            pricing_strategy: raw.pricing_strategy,
            review_analysis: raw.review_analysis,
            demographics: raw.demographics,
            fees: raw.fees,
            occupancy_over_time: raw.occupancy_over_time,
            building_amenities: raw.building_amenities,
            unit_amenities: raw.unit_amenities,
            fetched_at: new Date().toISOString(),
            data_as_of: raw.created_on || null,
        };

        const { data: upserted, error: propErr } = await pursuitsSb
            .from('hellodata_properties')
            .upsert(propertyData, { onConflict: 'hellodata_id' })
            .select('id')
            .single();

        if (propErr) throw propErr;

        // Upsert units
        if (raw.floorplans && Array.isArray(raw.floorplans)) {
            for (const fp of raw.floorplans) {
                const unitData = {
                    property_id: upserted.id,
                    hellodata_unit_id: fp.id || `fp_${fp.floorplan_name}_${fp.bed}_${fp.bath}`,
                    floorplan_name: fp.floorplan_name,
                    bed: fp.bed,
                    bath: fp.bath,
                    sqft: fp.sqft,
                    price: fp.price,
                    effective_price: fp.effective_price,
                    availability: fp.availability,
                    days_on_market: fp.days_on_market,
                    availability_periods: fp.availability_periods,
                    history: fp.history,
                };
                await pursuitsSb.from('hellodata_units').upsert(unitData, { onConflict: 'property_id, hellodata_unit_id' });
            }
        }

        console.log(`  ✅ ${name}`);
        return true;
    } catch (err) {
        console.log(`  ❌ ${name}: ${err.message}`);
        return false;
    }
}

async function main() {
    const { data: aiComps } = await yardiSb
        .from('market_comp_config')
        .select('hellodata_prop_id, property_name')
        .eq('is_active', true);

    console.log(`\n🔄 Refreshing ${aiComps.length} active assetintel comps...\n`);

    let success = 0;
    for (const comp of aiComps) {
        if (await refreshProperty(comp.hellodata_prop_id, comp.property_name)) success++;
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n✅ Done: ${success}/${aiComps.length} refreshed\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
