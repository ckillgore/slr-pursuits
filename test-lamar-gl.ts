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
    console.log('Fetching GL Totals for Lamar GP (53600000)...');
    
    // Fetch all accounts for this property
    const { data: rows, error } = await client
        .from('gl_period_totals')
        .select('account_code, account_name, actual_period_amount, actual_beginning_balance, financial_period')
        .eq('property_code', '53600000')
        .in('account_code', ['10025000', '11410000', '20035000'])
        .order('account_code', { ascending: true })
        .order('financial_period', { ascending: false });

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log(`Found ${rows?.length} records for test accounts:`);
    console.log(JSON.stringify(rows, null, 2));

    // What if we sum everything? No, gl_period_totals has a running beginning balance.
}

run().catch(console.error);
