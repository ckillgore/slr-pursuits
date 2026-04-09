const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // Check if ANY job exists with job_code = '210261' regardless of property!
    const {data: jobs} = await client.from('jobs').select('*').eq('job_code', '210261');
    console.log('jobs with code 210261:', jobs);
    
    // Check transactions
    const {data: txs} = await client.from('jobcost_transactions').select('*').in('job_id', jobs.map(j => j.job_id));
    console.log('txs for these jobs:', txs.length);
})();
