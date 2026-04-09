const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    // Check oldest and newest
    const {data: oldest} = await client.from('jobcost_transactions').select('post_date').order('post_date', {ascending: true}).limit(1);
    const {data: newest} = await client.from('jobcost_transactions').select('post_date').order('post_date', {ascending: false}).limit(1);
    console.log('Oldest:', oldest);
    console.log('Newest:', newest);
})();
