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
    
    const { data: props, error } = await client
        .from('properties')
        .select('*')
        .ilike('property_name', '%Lamar%');

    if (error) {
        output += 'Error querying properties: ' + error.message + '\n';
    } else {
        output += `Found ${props?.length} properties matching Lamar:\n`;
        output += JSON.stringify(props, null, 2) + '\n';
    }

    fs.writeFileSync('output-native.txt', output, 'utf-8');
    console.log('Saved to output-native.txt');
}

run().catch(console.error);
