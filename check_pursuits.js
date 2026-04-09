const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // get all pursuit jobs
    const {data: pursuitJobs} = await client.from('jobcost_master_matrix').select('job_id').eq('job_type', 'Pursuit Costs');
    const jobIds = [...new Set(pursuitJobs.map(j => j.job_id))];
    console.log('Total pursuit jobs in matrix:', jobIds.length);
    
    // Check if any pursuit jobs have txs
    const {count} = await client.from('jobcost_transactions').select('*', {count: 'exact', head: true}).in('job_id', jobIds);
    console.log('Total pursuit transactions in DB:', count);
})();
