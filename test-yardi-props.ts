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
    let output = '';
    output += 'Fetching unique properties in gl_period_totals...\n';
    
    // Let's just grab the first 1000 records to see what properties exist
    const { data: props, error } = await client
        .from('gl_period_totals')
        .select('property_code')
        .limit(2000);

    if (error) {
        output += 'Error querying gl_period_totals: ' + error.message + '\n';
    } else {
        const uniqueProps = [...new Set(props?.map(p => p.property_code))];
        output += `Found ${uniqueProps.length} unique properties:\n`;
        output += uniqueProps.join(', ') + '\n';
    }
    
    output += '\nFetching unique properties in gl_period_totals for the 11410000/11415000/11720000 accounts...\n';
    
    // Let's grab the property codes that are specifically WIP accounts
    const { data: wipProps, error: error2 } = await client
        .from('gl_period_totals')
        .select('property_code, account_code')
        .in('account_code', ['11720000', '11410000', '11415000'])
        .limit(2000);

    if (error2) {
        output += 'Error querying gl_period_totals: ' + error2.message + '\n';
    } else {
        const uniqueWipProps = [...new Set(wipProps?.map(p => p.property_code))];
        output += `Found ${uniqueWipProps.length} unique properties with WIP accounts:\n`;
        output += uniqueWipProps.join(', ') + '\n';
    }

    fs.writeFileSync('output-native.txt', output, 'utf-8');
    console.log('Saved to output-native.txt');
}

run().catch(console.error);
