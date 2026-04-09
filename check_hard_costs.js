const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    const {data: txs} = await client
        .from('jobcost_transactions')
        .select('cost_category_code')
        .or('cost_category_code.like.01%,cost_category_code.like.03%')
        .limit(10);
    console.log('Hard cost sample:', txs);
})();
