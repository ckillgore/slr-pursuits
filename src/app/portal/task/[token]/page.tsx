import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin-client';
import PortalClient from './PortalClient';
import type { PursuitChecklistTask } from '@/types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function InvalidLink() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white p-8 border border-red-200 rounded-2xl shadow-sm text-center">
                <h1 className="text-xl font-semibold text-gray-900 mb-2">Link Expired or Invalid</h1>
                <p className="text-sm text-gray-500">This task portal link is no longer active. Please request a new link from the deal team.</p>
            </div>
        </div>
    );
}

export default async function ExternalTaskPortalPage(props: { params: Promise<{ token: string }> }) {
    const params = await props.params;

    // Tokens are UUIDs — reject anything else before touching the DB
    // (also avoids Postgres "invalid input syntax for type uuid" errors).
    if (!UUID_RE.test(params.token)) {
        return <InvalidLink />;
    }

    const supabase = createAdminClient();

    // 1. Fetch task by token. Only select the columns the portal renders —
    //    this page is served to unauthenticated external parties and the task
    //    object is serialized into the HTML, so never use `*` here.
    const { data: task, error } = await supabase
        .from('pursuit_checklist_tasks')
        .select(`
            id, name, description, status, due_date, box_links, external_portal_token,
            external_party:external_task_parties!assigned_external_party_id(name, company),
            pursuit:pursuits!pursuit_id(name)
        `)
        .eq('external_portal_token', params.token)
        .eq('external_portal_enabled', true)
        .eq('assigned_to_type', 'external')
        .single();

    if (error || !task) {
        if (error && error.code !== 'PGRST116') {
            // Log server-side only — never render DB errors to external users
            console.error('[portal] Task lookup failed:', error);
        }
        return <InvalidLink />;
    }

    // 2. Fetch comments/notes
    const { data: notes } = await supabase
        .from('task_notes')
        .select(`
            id, content, created_at,
            user:user_profiles!created_by(full_name, avatar_url)
        `)
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });

    return (
        <main className="min-h-screen bg-gray-50 text-[var(--text-primary)]">
            <PortalClient task={task as any} pursuitName={(task as any).pursuit?.name} externalParty={(task as any).external_party} initialNotes={(notes || []).map((n: any) => ({ ...n, user: Array.isArray(n.user) ? n.user[0] : n.user })) as any} />
        </main>
    );
}
