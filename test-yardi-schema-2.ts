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
    let output = 'Fetching table schema information...\n';
    
    const { data: totalsData, error: totalsError } = await client
        .from('gl_period_totals')
        .select('*')
        .limit(1);

    if (totalsError) {
        output += 'Error fetching gl_period_totals: ' + totalsError.message + '\n';
    } else if (totalsData && totalsData.length > 0) {
        output += 'Columns in gl_period_totals: ' + Object.keys(totalsData[0]).join(', ') + '\n';
    }

    const { data: lamarData } = await client
        .from('gl_period_totals')
        .select('*')
        .eq('property_code', '53600000')
        .eq('account_code', '10025000')
        .eq('financial_period', '2026-03-01')
        .limit(10);
        
    output += 'Lamar GP 2026-03-01 records: ' + JSON.stringify(lamarData, null, 2) + '\n';

    const tableGuesses = ['gl_transactions', 'gl_transaction_details', 'journal_entries', 'yardi_transactions', 'jobcost_transactions'];
    
    output += '\nChecking for possible transaction tables:\n';
    for (const table of tableGuesses) {
        const { error } = await client.from(table).select('id').limit(1);
        if (error) {
            output += `- ${table}: Error or not found (${error.message})\n`;
        } else {
            output += `- ${table}: EXISTS\n`;
            const { data } = await client.from(table).select('*').limit(1);
            if (data && data.length > 0) {
                output += `  Columns in ${table}: ` + Object.keys(data[0]).join(', ') + '\n';
            }
        }
    }
    fs.writeFileSync('output-native-schema.txt', output, 'utf-8');
}

run().catch(console.error);
