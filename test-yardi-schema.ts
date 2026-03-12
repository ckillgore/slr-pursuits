import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

const envs = envContent.split('\n').reduce((acc, line) => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
        acc[key.trim()] = values.join('=').trim().replace(/['"]/g, '');
    }
    return acc;
}, {} as Record<string, string>);

const YARDI_SUPABASE_URL = envs.YARDI_SUPABASE_URL;
const YARDI_SUPABASE_ROLE_KEY = envs.YARDI_SUPABASE_ROLE_KEY;

const client = createClient(YARDI_SUPABASE_URL, YARDI_SUPABASE_ROLE_KEY);

async function run() {
    console.log('Fetching table schema information...');
    
    // We can't query information_schema via PostgREST directly typically unless exposed, but let's try.
    // Let's just query a single row from gl_period_totals to see ALL keys (since JS select * might not show nulls if not careful? No, it should).
    // Better: let's see what tables exist by querying something invalid or checking RPC if available.
    // Instead of information_schema, let's query a known row and print Object.keys.
    
    const { data: totalsData, error: totalsError } = await client
        .from('gl_period_totals')
        .select('*')
        .limit(1);

    if (totalsError) {
        console.error('Error fetching gl_period_totals:', totalsError);
    } else if (totalsData && totalsData.length > 0) {
        console.log('Columns in gl_period_totals:', Object.keys(totalsData[0]));
    }

    // Is there a book column? Let's check a raw supabase query for Lamar GP
    const { data: lamarData } = await client
        .from('gl_period_totals')
        .select('*')
        .eq('property_code', '53600000')
        .eq('account_code', '10025000')
        .eq('financial_period', '2026-03-01')
        .limit(10);
        
    console.log('Lamar GP 2026-03-01 records:', JSON.stringify(lamarData, null, 2));

    // Let's try to query transaction tables
    const tableGuesses = ['gl_transactions', 'gl_transaction_details', 'journal_entries', 'yardi_transactions', 'jobcost_transactions'];
    
    console.log('\nChecking for possible transaction tables:');
    for (const table of tableGuesses) {
        const { error } = await client.from(table).select('id').limit(1);
        if (error) {
            console.log(`- ${table}: Error or not found (${error.message})`);
        } else {
            console.log(`- ${table}: EXISTS`);
            const { data } = await client.from(table).select('*').limit(1);
            if (data && data.length > 0) {
                console.log(`  Columns in ${table}:`, Object.keys(data[0]));
            }
        }
    }
}

run().catch(console.error);
