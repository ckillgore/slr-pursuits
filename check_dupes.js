const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.YARDI_SUPABASE_URL, process.env.YARDI_SUPABASE_ROLE_KEY);
(async () => {
    const {data} = await client.from('jobcost_transactions').select('*').eq('job_id', 145);
    console.log(data.length);
    const amounts = {};
    for (const d of data) {
        if (!amounts[d.amount]) amounts[d.amount] = [];
        amounts[d.amount].push(d);
    }
    for (const [amt, rows] of Object.entries(amounts)) {
        if (rows.length > 1) {
            console.log(`Amount ${amt} has ${rows.length} rows`);
            rows.slice(0, 2).forEach(r => console.log(r.id, r.transaction_id, r.post_date, r.cost_category_code));
        }
    }
})();
