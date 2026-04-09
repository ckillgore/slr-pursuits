require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
async function run() {
    const jobIds = ['251'];
    console.log('Querying jobIds:', jobIds);
    const { data: jobMapData } = await client.from('jobs').select('job_id, job_code').in('job_id', jobIds);
    console.log('jobMapData:', jobMapData);
    
    // Test what actually IS in the DB!
    const { data: search210261 } = await client.from('jobs').select('*').eq('job_code', '210261').limit(5);
    console.log('search by job_code 210261:', search210261);
    
    const { data: searchProp } = await client.from('jobs').select('*').eq('property_id', 98); // just test something
    
    const { data: txs } = await client.from('jobcost_transactions').select('*').in('job_id', ['251', '210261', 251, 210261]).limit(5);
    console.log('transactions matched by ANY code/id:', txs?.length);
    if (txs?.length) console.log('tx sample:', txs[0]);
    
    // Wait, what's actually in jobcost_transactions job_id?!
    const { data: sampleTxs } = await client.from('jobcost_transactions').select('job_id').limit(5);
    console.log('Sample transaction job_ids:', sampleTxs);
}
run();
