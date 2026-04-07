import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_YARDI_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_YARDI_SUPABASE_ANON_KEY;
const client = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data } = await client.from('jobcost_transactions').select('job_id').limit(5);
    console.log("jobcost_transactions.job_id format:", data);
}
check();
