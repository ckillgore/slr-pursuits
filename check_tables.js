const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // See if JCDETAIL exists and has data 
    const {data: jcdetail, error} = await client.from('jcdetail').select('*').limit(5);
    console.log('JCDETAIL:', jcdetail, error);
})();
