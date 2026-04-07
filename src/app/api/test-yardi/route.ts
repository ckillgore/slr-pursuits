import { createClient } from '@supabase/supabase-js';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_YARDI_SUPABASE_URL || '';
        const supabaseKey = process.env.NEXT_PUBLIC_YARDI_SUPABASE_ANON_KEY || '';
        const client = createClient(supabaseUrl, supabaseKey);

        const { data: txs } = await client.from('jobcost_transactions').select('*').limit(3);
        const { data: matrix } = await client.from('jobcost_master_matrix').select('*').limit(3);
        
        return Response.json({
            txs,
            matrix
        });
    } catch(e: any) {
        return Response.json({ error: e.message });
    }
}
