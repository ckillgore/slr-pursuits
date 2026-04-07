'use server';

import { createClient } from '@supabase/supabase-js';

export async function testYardiQuery() {
    const supabaseUrl = process.env.NEXT_PUBLIC_YARDI_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_YARDI_SUPABASE_ANON_KEY || '';
    const client = createClient(supabaseUrl, supabaseKey);

    // See if the value built in `jobcost_transactions.job_id` is actually the ID or the code!
    const { data } = await client.from('jobcost_transactions').select('job_id').limit(5);
    console.log("FORMAT IN JOBCOST_TRANSACTIONS:", data);

    const { data: mData } = await client.from('jobcost_master_matrix').select('job_id, job_code').limit(5);
    console.log("FORMAT IN JOBCOST_MASTER_MATRIX:", mData);

    return { done: true };
}
