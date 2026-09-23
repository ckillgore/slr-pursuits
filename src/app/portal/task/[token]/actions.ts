'use server';

import { createAdminClient } from '@/lib/supabase/admin-client';

// These actions are reachable by unauthenticated external parties and run
// with the service-role client, so every input must be validated here and
// every write must be scoped by the portal token.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTE_LENGTH = 10_000;
// External parties may only toggle between working / done states.
const EXTERNAL_ALLOWED_STATUSES = ['not_started', 'in_progress', 'complete'] as const;

function isValidToken(token: unknown): token is string {
    return typeof token === 'string' && UUID_RE.test(token);
}

export async function submitExternalNote(token: string, content: string) {
    if (!isValidToken(token)) return { error: 'Invalid or expired magic link' };
    if (typeof content !== 'string' || !content.trim()) return { error: 'Content is required' };
    if (content.length > MAX_NOTE_LENGTH) return { error: 'Note is too long' };
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
    if (!isValidToken(token)) return { error: 'Invalid or expired magic link' };
    if (!(EXTERNAL_ALLOWED_STATUSES as readonly string[]).includes(status)) {
        return { error: 'Invalid status' };
    }
    const supabase = createAdminClient();

    // Update by token (secure)
    const { data, error } = await supabase
        .from('pursuit_checklist_tasks')
        .update({ status })
        .eq('external_portal_token', token)
        .eq('external_portal_enabled', true)
        .eq('assigned_to_type', 'external')
        .select('id');

    if (error) return { error: 'Failed to update task' };
    if (!data || data.length === 0) return { error: 'Invalid or expired magic link' };
    return { success: true };
}
