const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: entities, error } = await supabase.from('pursuit_accounting_entities').select('*').limit(20);
    console.log("Entities:", entities);
    
    // Also try to reach Yardi!
    const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
    const { data: jobMapData } = await client.from('jobs').select('job_id, job_code').in('job_id', ['251', '210261']);
    console.log('jobMapData:', jobMapData);
    
    const { data: txs } = await client.from('jobcost_transactions').select('*').in('job_id', ['251', '210261', 251, 210261]).limit(5);
    console.log('transactions length:', txs?.length);
    if (txs?.length) console.log('tx sample:', txs[0]);
    
    const { data: matrix } = await client.from('jobcost_master_matrix').select('*').in('job_id', ['251', '210261', 251, 210261]).limit(5);
    console.log('matrix matched length:', matrix?.length);

    console.log("Error:", error);
}
run();
