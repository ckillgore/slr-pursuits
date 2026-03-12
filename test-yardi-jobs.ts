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

const client = createClient(YARDI_SUPABASE_URL!, YARDI_SUPABASE_ROLE_KEY!);

async function run() {
    console.log('Testing job property relationships...');
    
    // Check what tables exist related to jobs/properties
    // Assuming there's a `jobs` or `properties` table linking them
    const result = await client.from('jobs').select('*').limit(3);
    const resultProp = await client.from('properties').select('*').limit(3);

    const out = {
        jobs: result.data,
        properties: resultProp.data
    };
    fs.writeFileSync('yardi-sample.json', JSON.stringify(out, null, 2), 'utf-8');
}

run().catch(console.error);
