const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // get random 1 matrix record
    const {data: m} = await client.from('jobcost_master_matrix').select('*').limit(1);
    console.log('matrix keys:', Object.keys(m[0]));
})();
