const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    const {data: mx} = await client.from('jobcost_master_matrix').select('cost_code').or('cost_code.like.01%,cost_code.like.03%').limit(10);
    console.log('Matrix hard costs:', mx);
})();
