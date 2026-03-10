require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testFetchMyTasks() {
    // 1. Get the first user
    const { data: users } = await supabase.from('user_profiles').select('*').limit(1);
    const userId = users[0].id;
    console.log('Testing for user:', userId);

    // 2. See what tasks they are assigned to regardless of type
    const { data: allAssigned } = await supabase.from('pursuit_checklist_tasks').select('*').eq('assigned_to', userId);
    console.log(`Total tasks assigned (ANY type):`, allAssigned?.length);

    // 3. Test the precise fetchMyTasks query
    const { data, error } = await supabase
        .from('pursuit_checklist_tasks')
        .select(`
            *,
            pursuit:pursuits!pursuit_id(id, name, stage)
        `)
        .eq('assigned_to', userId)
        .eq('assigned_to_type', 'internal')
        .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('Error fetching internal tasks:', error);
    } else {
        console.log('Internal tasks fetched:', data.length);
    }

    // 4. Test with or condition
    const { data: orData, error: orError } = await supabase
        .from('pursuit_checklist_tasks')
        .select(`
            *,
            pursuit:pursuits!pursuit_id(id, name, stage)
        `)
        .eq('assigned_to', userId)
        .or('assigned_to_type.eq.internal,assigned_to_type.is.null')
        .order('due_date', { ascending: true, nullsFirst: false });

    if (orError) {
        console.error('Error fetching OR tasks:', orError);
    } else {
        console.log('OR tasks fetched:', orData.length);
    }
}

testFetchMyTasks();
