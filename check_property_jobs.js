const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // get property id
    const {data: props} = await client.from('properties').select('*').eq('property_code', '11000261');
    console.log('props:', props);
    if (!props?.length) return;
    const {data: jobs} = await client.from('jobs').select('*').eq('property_id', props[0].property_id);
    console.log('jobs for that property:', jobs);
    
    // Check if jobcost_transactions has ANY transactions for ANY of these jobs!
    const jobIds = jobs.map(j => j.job_id);
    const {data: txs} = await client.from('jobcost_transactions').select('job_id').in('job_id', jobIds).limit(5);
    console.log('txs matching ANY job for property:', txs);
})();
