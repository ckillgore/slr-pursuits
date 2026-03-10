import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testTasks() {
    const { data } = await supabase.from('pursuit_checklist_tasks').select('*').limit(5);
    console.log(data);
}
testTasks();
