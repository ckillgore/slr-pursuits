import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchMyTasks } from '@/lib/supabase/queries';

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthenticated' });
    }

    try {
        const tasks = await fetchMyTasks(user.id);
        const allUserTasks = await supabase.from('pursuit_checklist_tasks').select('*').eq('assigned_to', user.id);
        
        return NextResponse.json({
            user: user.id,
            returnedByFetchMyTasks: tasks.length,
            rawAllUserTasksCount: allUserTasks.data?.length,
            rawTasks: allUserTasks.data
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message, stack: err.stack });
    }
}
