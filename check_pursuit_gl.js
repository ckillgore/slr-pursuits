const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // Check GL detail for 11000261 
    const {data: gl} = await client.from('gl_transaction_detail').select('*').eq('property_code', '11000261');
    console.log(`GL transactions for 11000261 count: ${gl.length}`);
    if (gl.length > 0) {
        console.log('Sample:', gl.slice(0, 3));
    }
})();
