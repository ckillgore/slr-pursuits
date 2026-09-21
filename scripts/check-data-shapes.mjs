/**
 * Diagnostic: Check for data shapes that might cause client-side crashes
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
    const { data: properties, error } = await supabase
        .from('hellodata_properties')
        .select('id, hellodata_id, building_name, occupancy_over_time, building_quality, review_analysis, pricing_strategy, building_amenities, unit_amenities, fees');

    if (error) { console.error('❌', error.message); process.exit(1); }

    console.log(`Checking ${properties.length} properties for data shape issues...\n`);

    let issues = 0;
    for (const p of properties) {
        const problems = [];

        // Check occupancy_over_time
        const occ = p.occupancy_over_time;
        if (occ !== null) {
            if (!Array.isArray(occ)) {
                problems.push(`occupancy_over_time is ${typeof occ}, not array`);
            } else if (occ.length > 0) {
                const last = occ[occ.length - 1];
                if (last && last.leased === undefined) {
                    problems.push(`occupancy_over_time last entry missing .leased`);
                }
                if (last && typeof last.leased !== 'number' && last.leased !== null && last.leased !== undefined) {
                    problems.push(`occupancy_over_time .leased is ${typeof last.leased}: ${last.leased}`);
                }
            }
        }

        // Check building_quality
        const bq = p.building_quality;
        if (bq !== null) {
            if (typeof bq !== 'object') {
                problems.push(`building_quality is ${typeof bq}, not object`);
            } else {
                const quality = bq.property_overall_quality;
                if (quality !== undefined && quality !== null && typeof quality !== 'number') {
                    problems.push(`building_quality.property_overall_quality is ${typeof quality}: ${quality}`);
                }
            }
        }

        // Check review_analysis
        const ra = p.review_analysis;
        if (ra !== null) {
            if (typeof ra !== 'object') {
                problems.push(`review_analysis is ${typeof ra}, not object`);
            } else {
                if (ra.avg_score !== undefined && ra.avg_score !== null && typeof ra.avg_score !== 'number') {
                    problems.push(`review_analysis.avg_score is ${typeof ra.avg_score}: ${ra.avg_score}`);
                }
                if (ra.positive_counts && typeof ra.positive_counts !== 'object') {
                    problems.push(`review_analysis.positive_counts is ${typeof ra.positive_counts}`);
                }
                if (ra.negative_counts && typeof ra.negative_counts !== 'object') {
                    problems.push(`review_analysis.negative_counts is ${typeof ra.negative_counts}`);
                }
            }
        }

        // Check pricing_strategy
        const ps = p.pricing_strategy;
        if (ps !== null) {
            if (typeof ps !== 'object') {
                problems.push(`pricing_strategy is ${typeof ps}, not object`);
            } else {
                if (ps.avg_duration !== undefined && ps.avg_duration !== null && typeof ps.avg_duration !== 'number') {
                    problems.push(`pricing_strategy.avg_duration is ${typeof ps.avg_duration}: ${ps.avg_duration}`);
                }
            }
        }

        // Check amenities arrays
        if (p.building_amenities !== null && !Array.isArray(p.building_amenities)) {
            problems.push(`building_amenities is ${typeof p.building_amenities}, not array`);
        }
        if (p.unit_amenities !== null && !Array.isArray(p.unit_amenities)) {
            problems.push(`unit_amenities is ${typeof p.unit_amenities}, not array`);
        }

        // Check fees
        if (p.fees !== null && typeof p.fees !== 'object') {
            problems.push(`fees is ${typeof p.fees}, not object`);
        }
        // Check for fee_items array which could crash Object.entries
        if (p.fees && p.fees.fee_items && !Array.isArray(p.fees.fee_items)) {
            problems.push(`fees.fee_items is ${typeof p.fees.fee_items}, not array`);
        }

        if (problems.length > 0) {
            issues++;
            console.log(`⚠️  ${p.building_name || p.hellodata_id}:`);
            problems.forEach(prob => console.log(`     • ${prob}`));
            console.log('');
        }
    }

    if (issues === 0) {
        console.log('✅ No data shape issues found in property-level fields.');
    } else {
        console.log(`\n❌ Found issues in ${issues} properties.`);
    }

    // Also check for units with problematic data
    console.log('\n\nChecking unit-level data...');
    const { data: units, error: unitErr } = await supabase
        .from('hellodata_units')
        .select('id, property_id, hellodata_unit_id, availability_periods, history')
        .not('availability_periods', 'is', null)
        .limit(500);

    if (unitErr) {
        console.log('Unit query error:', unitErr.message);
    } else {
        let unitIssues = 0;
        for (const u of units || []) {
            if (u.availability_periods && !Array.isArray(u.availability_periods)) {
                unitIssues++;
                if (unitIssues <= 3) {
                    console.log(`  ⚠️  Unit ${u.hellodata_unit_id}: availability_periods is ${typeof u.availability_periods}`);
                }
            }
            if (u.history && !Array.isArray(u.history)) {
                unitIssues++;
                if (unitIssues <= 3) {
                    console.log(`  ⚠️  Unit ${u.hellodata_unit_id}: history is ${typeof u.history}`);
                }
            }
        }
        if (unitIssues === 0) {
            console.log('✅ No unit-level data shape issues found (checked', units?.length, 'units)');
        } else {
            console.log(`\n❌ Found ${unitIssues} unit-level issues.`);
        }
    }
}

main().catch(err => { console.error(err); process.exit(1); });
