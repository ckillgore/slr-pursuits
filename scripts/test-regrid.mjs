import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) process.env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
});

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    // Check if parcel_data column exists by querying a pursuit
    const { data, error } = await supabase
        .from('pursuits')
        .select('id, parcel_data, parcel_data_updated_at')
        .limit(1);

    console.log('Query result:', JSON.stringify(data, null, 2)?.substring(0, 300));
    console.log('Error:', JSON.stringify(error, null, 2));
}

main().catch(console.error);
