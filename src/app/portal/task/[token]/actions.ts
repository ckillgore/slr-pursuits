'use server';

import { createAdminClient } from '@/lib/supabase/admin-client';

export async function submitExternalNote(token: string, content: string) {
    if (!content.trim()) return { error: 'Content is required' };
    const supabase = createAdminClient();

    // Verify token & task
    const { data: task, error: fetchErr } = await supabase
        .from('pursuit_checklist_tasks')
        .select('id, assigned_external_party_id')
        .eq('external_portal_token', token)
        .eq('external_portal_enabled', true)
        .eq('assigned_to_type', 'external')
        .single();
    if (fetchErr || !task) return { error: 'Invalid or expired magic link' };

    // Insert note
    const { error: insertErr } = await supabase
        .from('task_notes')
        .insert({
            task_id: task.id,
            content: content.trim(),
            // No user ID since they are external
            created_by: null, 
        });
        
    if (insertErr) return { error: 'Failed to add note' };
    return { success: true };
}

export async function updateExternalTaskStatus(token: string, status: string) {
    const supabase = createAdminClient();

    // Update by token (secure)
    const { error } = await supabase
        .from('pursuit_checklist_tasks')
        .update({ status })
        .eq('external_portal_token', token)
        .eq('external_portal_enabled', true)
        .eq('assigned_to_type', 'external');

    if (error) return { error: 'Failed to update task' };
    return { success: true };
}
