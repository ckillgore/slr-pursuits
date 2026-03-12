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
    console.log('Fetching Cash (10025000) for Lamar GP (53600000)...');
    
    const { data: rows, error } = await client
        .from('gl_period_totals')
        .select('*')
        .eq('property_code', '53600000')
        .eq('account_code', '10025000')
        .order('financial_period', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    const output = JSON.stringify(rows, null, 2);
    fs.writeFileSync('output-cash.txt', output, 'utf-8');
    console.log(`Saved ${rows?.length} rows to output-cash.txt`);
}

run().catch(console.error);
