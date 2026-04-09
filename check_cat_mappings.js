const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    const {data: mappings} = await client.from('jobcost_category_mapping').select('*').limit(10);
    console.log(mappings);
})();
