const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    const {data: txs} = await client.from('jobcost_transactions').select('*').limit(5);
    console.log('Sample txs directly from Supabase:', txs);
})();
