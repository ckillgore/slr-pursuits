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
    console.log('Testing GL transactions for property 5360000...');
    
    // We want to see what rows exist for Lamar GP
    const { data: txs, error } = await client
        .from('gl_period_totals')
        .select('*')
        .eq('property_code', '5360000')
        .limit(10);

    if (error) {
        console.error('Error querying gl_period_totals:', error);
    } else {
        console.log(`Found ${txs?.length} records for 5360000`);
        if (txs && txs.length > 0) {
            console.log(JSON.stringify(txs, null, 2));
        } else {
            // let's just see WHAT properties are in there
            const { data: props } = await client.from('gl_period_totals').select('property_code').limit(50);
            const uniqueProps = [...new Set(props?.map(p => p.property_code))];
            console.log('Available properties in gl_period_totals:', uniqueProps);
        }
    }
}

run().catch(console.error);
