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
    console.log('Testing GL transactions for property 22300000 account 12110000...');
    
    // We want to see what columns exist on the table that holds these details.
    // Let's try to query 'gl_transactions' or 'gl_transaction_detail' or similar.
    // I will query 'gl_transactions' first if it exists.
    
    const { data: txs, error } = await client
        .from('gl_transactions')
        .select('*')
        .eq('property_code', '22300000')
        // .eq('account_code', '12110000')
        .limit(5);

    if (error) {
        console.error('Error querying gl_transactions:', error);
    } else {
        console.log('gl_transactions:', txs);
    }
}

run().catch(console.error);
