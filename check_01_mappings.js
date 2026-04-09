const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    const {data: mappings} = await client.from('jobcost_category_mapping').select('*').like('category_code', '01%');
    console.log(`01 maps length: ${mappings.length}`);
    console.log(mappings.slice(0, 5));
})();
