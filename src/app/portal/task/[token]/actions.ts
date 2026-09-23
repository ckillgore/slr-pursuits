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

// ── Attachments ─────────────────────────────────────────────
// External parties have no Supabase session, so they can't touch the
// task-files bucket or task_attachments table directly (RLS is
// authenticated-only). Every attachment operation goes through these
// token-checked actions instead. File bytes never pass through the server:
// we hand out a signed upload URL for a path we choose, the browser uploads
// straight to Storage (bucket file_size_limit still applies), and a second
// call records the attachment once the object is confirmed to exist.

const ATTACHMENT_BUCKET = 'task-files';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the bucket's file_size_limit
const MAX_EXTERNAL_ATTACHMENTS_PER_TASK = 50;
const MAX_FILE_NAME_LENGTH = 255;

export type PortalAttachment = {
    id: string;
    file_name: string;
    content_type: string | null;
    size_bytes: number | null;
    created_at: string;
    uploader_name: string | null;
};

async function getPortalTask(token: unknown) {
    if (!isValidToken(token)) return null;
    const supabase = createAdminClient();
    const { data: task } = await supabase
        .from('pursuit_checklist_tasks')
        .select('id, assigned_external_party_id')
        .eq('external_portal_token', token)
        .eq('external_portal_enabled', true)
        .eq('assigned_to_type', 'external')
        .maybeSingle();
    return task ? { supabase, task } : null;
}

/** Display name only; storage paths are generated server-side. */
function cleanFileName(name: unknown): string | null {
    if (typeof name !== 'string') return null;
    const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_FILE_NAME_LENGTH);
    return cleaned || null;
}

function storagePathPattern(taskId: string) {
    return new RegExp(`^${taskId}/[0-9a-f-]{36}(\\.[a-z0-9]{1,10})?$`);
}

export async function listExternalAttachments(token: string): Promise<{ attachments?: PortalAttachment[]; error?: string }> {
    const ctx = await getPortalTask(token);
    if (!ctx) return { error: 'Invalid or expired magic link' };
    const { supabase, task } = ctx;

    const { data, error } = await supabase
        .from('task_attachments')
        .select('id, file_name, content_type, size_bytes, created_at, uploaded_by, uploader_external:external_task_parties!uploaded_by_external_party_id(name)')
        .eq('task_id', task.id)
        .order('created_at', { ascending: false });
    if (error) return { error: 'Failed to load attachments' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    // Internal uploaders: expose display name only, never email.
    const internalIds = Array.from(new Set(rows.map(r => r.uploaded_by).filter(Boolean)));
    const names = new Map<string, string>();
    if (internalIds.length) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', internalIds);
        for (const p of profiles ?? []) if (p.full_name) names.set(p.id, p.full_name);
    }

    return {
        attachments: rows.map(r => ({
            id: r.id,
            file_name: r.file_name,
            content_type: r.content_type,
            size_bytes: r.size_bytes,
            created_at: r.created_at,
            uploader_name: (r.uploaded_by && names.get(r.uploaded_by)) || r.uploader_external?.name || null,
        })),
    };
}

export async function createExternalUploadUrl(
    token: string,
    fileName: string,
    sizeBytes: number
): Promise<{ path?: string; uploadToken?: string; error?: string }> {
    const ctx = await getPortalTask(token);
    if (!ctx) return { error: 'Invalid or expired magic link' };
    const { supabase, task } = ctx;

    const name = cleanFileName(fileName);
    if (!name) return { error: 'File name is required' };
    if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return { error: 'File is empty' };
    }
    if (sizeBytes > MAX_UPLOAD_BYTES) return { error: 'File exceeds the 50 MB limit' };

    const { count, error: countErr } = await supabase
        .from('task_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', task.id)
        .not('uploaded_by_external_party_id', 'is', null);
    if (countErr) return { error: 'Failed to prepare upload' };
    if ((count ?? 0) >= MAX_EXTERNAL_ATTACHMENTS_PER_TASK) {
        return { error: `This task already has ${MAX_EXTERNAL_ATTACHMENTS_PER_TASK} uploaded files` };
    }

    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase() : '';
    const path = `${task.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: 'Failed to prepare upload' };
    return { path: data.path, uploadToken: data.token };
}

export async function finalizeExternalUpload(
    token: string,
    path: string,
    fileName: string
): Promise<{ success?: true; error?: string }> {
    const ctx = await getPortalTask(token);
    if (!ctx) return { error: 'Invalid or expired magic link' };
    const { supabase, task } = ctx;

    const name = cleanFileName(fileName);
    if (!name) return { error: 'File name is required' };
    // Only accept paths this task's createExternalUploadUrl could have issued.
    if (typeof path !== 'string' || !storagePathPattern(task.id).test(path)) {
        return { error: 'Invalid upload' };
    }

    // Confirm the object really landed, and take size/type from Storage
    // rather than trusting the client.
    const objectName = path.slice(task.id.length + 1);
    const { data: objects, error: listErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .list(task.id, { search: objectName, limit: 1 });
    const object = objects?.find(o => o.name === objectName);
    if (listErr || !object) return { error: 'Upload not found. Please try again.' };

    const { data: existing } = await supabase
        .from('task_attachments')
        .select('id')
        .eq('storage_path', path)
        .maybeSingle();
    if (existing) return { success: true }; // idempotent retry

    const size = Number(object.metadata?.size ?? 0) || null;
    if (size !== null && size > MAX_UPLOAD_BYTES) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
        return { error: 'File exceeds the 50 MB limit' };
    }

    const { error: insertErr } = await supabase.from('task_attachments').insert({
        task_id: task.id,
        file_name: name,
        storage_path: path,
        content_type: (object.metadata?.mimetype as string | undefined) || null,
        size_bytes: size,
        uploaded_by: null,
        uploaded_by_external_party_id: task.assigned_external_party_id ?? null,
    });
    if (insertErr) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
        return { error: 'Failed to save attachment' };
    }
    return { success: true };
}

export async function getExternalDownloadUrl(
    token: string,
    attachmentId: string
): Promise<{ url?: string; error?: string }> {
    const ctx = await getPortalTask(token);
    if (!ctx) return { error: 'Invalid or expired magic link' };
    if (typeof attachmentId !== 'string' || !UUID_RE.test(attachmentId)) return { error: 'File not found' };
    const { supabase, task } = ctx;

    // Scope by task so a token can only reach its own task's files.
    const { data: att } = await supabase
        .from('task_attachments')
        .select('storage_path, file_name')
        .eq('id', attachmentId)
        .eq('task_id', task.id)
        .maybeSingle();
    if (!att) return { error: 'File not found' };

    const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(att.storage_path, 3600, { download: att.file_name });
    if (error || !data) return { error: 'Could not download file' };
    return { url: data.signedUrl };
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
