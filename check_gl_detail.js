const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // Check gl_transaction_detail for 11000261 (which is HPROP 689)
    const {data: gl} = await client.from('gl_transaction_detail').select('*').limit(2);
    console.log('Sample gl_transaction_detail keys:', Object.keys(gl[0]));
})();
