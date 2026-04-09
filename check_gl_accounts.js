const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    const {data: gls} = await client.from('gl_period_totals').select('account_code, account_name').order('account_code').limit(100);
    const unique = [...new Set(gls.map(g => `${g.account_code} - ${g.account_name}`))];
    console.log(unique.slice(0, 20));
})();
