import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
const YARDI_SUPABASE_URL = envContent.match(/YARDI_SUPABASE_URL=(.*)/)?.[1];
const YARDI_SUPABASE_ROLE_KEY = envContent.match(/YARDI_SUPABASE_ROLE_KEY=(.*)/)?.[1];

const client = createClient(YARDI_SUPABASE_URL!, YARDI_SUPABASE_ROLE_KEY!);

async function main() {
    console.log("--- GL PERIOD TOTALS WITHOUT FILTER ---");
    const { data: gl } = await client.from('gl_period_totals').select('*').limit(2);
    console.log(JSON.stringify(gl, null, 2));
}

main().catch(console.error);
