const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
client.from('jobcost_transactions').select('*').limit(3).then(r => console.log('txs:', r.data));
