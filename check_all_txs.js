const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // Check total count of all transactions
    const {count} = await client.from('jobcost_transactions').select('*', {count: 'exact', head: true});
    console.log('Total txs in database:', count);
    
    // Check most recent
    const {data: recent} = await client.from('jobcost_transactions').select('post_date, invoice_date, amount, job_id').order('post_date', {ascending: false}).limit(1);
    console.log('Most recent tx:', recent);
})();
