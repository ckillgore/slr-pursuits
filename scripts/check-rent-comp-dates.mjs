/**
 * Diagnostic: Check fetched_at and data_as_of for all linked rent comp properties.
 * This will tell us whether the refresh script actually updated the DB.
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
    // 1. Check current fetched_at / data_as_of for all linked properties
    const { data: links, error } = await supabase
        .from('pursuit_rent_comps')
        .select(`
            property_id,
            pursuit:pursuits!inner(name),
            property:hellodata_properties!inner(
                id, hellodata_id, building_name, fetched_at, data_as_of, updated_at
            )
        `);

    if (error) {
        console.error('❌ Query failed:', error.message);
        process.exit(1);
    }

    // De-duplicate by property
    const propMap = new Map();
    for (const row of links) {
        const p = row.property;
        if (!propMap.has(p.hellodata_id)) {
            propMap.set(p.hellodata_id, {
                name: p.building_name,
                hellodata_id: p.hellodata_id,
                fetched_at: p.fetched_at,
                data_as_of: p.data_as_of,
                updated_at: p.updated_at,
                pursuits: [],
            });
        }
        propMap.get(p.hellodata_id).pursuits.push(row.pursuit?.name);
    }

    const now = Date.now();
    console.log(`\n📊 ${propMap.size} unique properties linked to ${links.length} comp entries\n`);
    console.log(`${'Property'.padEnd(42)} ${'fetched_at'.padEnd(24)} ${'data_as_of'.padEnd(24)} ${'Age'.padEnd(10)}`);
    console.log('─'.repeat(100));

    let staleCount = 0;
    for (const [, p] of propMap) {
        const fetchedDate = p.fetched_at ? new Date(p.fetched_at) : null;
        const dataAsOf = p.data_as_of ? new Date(p.data_as_of) : null;
        const ageMs = fetchedDate ? now - fetchedDate.getTime() : null;
        const ageDays = ageMs ? Math.round(ageMs / (1000 * 60 * 60 * 24)) : null;
        
        const isStale = ageDays != null && ageDays > 7;
        if (isStale) staleCount++;

        const marker = isStale ? '⚠️ ' : '  ';
        console.log(
            `${marker}${(p.name || 'Unknown').padEnd(40)} ` +
            `${(fetchedDate?.toISOString()?.slice(0, 19) || 'never').padEnd(24)} ` +
            `${(dataAsOf?.toISOString()?.slice(0, 19) || 'never').padEnd(24)} ` +
            `${ageDays != null ? ageDays + 'd' : '—'}`
        );
    }

    console.log(`\n📈 Summary: ${staleCount} stale (>7d), ${propMap.size - staleCount} fresh`);

    // 2. Check the fetch log for recent cron activity
    console.log('\n\n🔍 Recent hellodata_fetch_log entries:');
    const { data: logs, error: logErr } = await supabase
        .from('hellodata_fetch_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (logErr) {
        console.log('  (no fetch log table or error:', logErr.message, ')');
    } else if (logs && logs.length > 0) {
        for (const log of logs) {
            console.log(`  ${log.created_at?.slice(0, 19)}  ${(log.endpoint || '').padEnd(30)}  status: ${log.response_status}  by: ${log.fetched_by || 'cron/system'}`);
        }
    } else {
        console.log('  (no log entries found)');
    }

    // 3. Check if any properties have updated_at !== fetched_at (would indicate a DB trigger issue)
    console.log('\n\n🔎 Checking for updated_at vs fetched_at discrepancies:');
    let discrepancies = 0;
    for (const [, p] of propMap) {
        if (p.fetched_at && p.updated_at) {
            const fetchedMs = new Date(p.fetched_at).getTime();
            const updatedMs = new Date(p.updated_at).getTime();
            // If updated_at is significantly older than fetched_at, the upsert may not be working
            if (Math.abs(fetchedMs - updatedMs) > 60000) { // > 1 minute difference
                discrepancies++;
                if (discrepancies <= 5) {
                    console.log(`  ⚠️  ${p.name}: fetched_at=${p.fetched_at?.slice(0, 19)}, updated_at=${p.updated_at?.slice(0, 19)}`);
                }
            }
        }
    }
    if (discrepancies === 0) {
        console.log('  ✅ No discrepancies found');
    } else {
        console.log(`  Total discrepancies: ${discrepancies}`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
