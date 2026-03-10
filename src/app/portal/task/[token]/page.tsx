import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin-client';
import PortalClient from './PortalClient';
import type { PursuitChecklistTask } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ExternalTaskPortalPage({ params }: { params: { token: string } }) {
    const supabase = createAdminClient();

    // 1. Fetch task by token
    const { data: task, error } = await supabase
        .from('pursuit_checklist_tasks')
        .select(`
            *,
            external_party:external_task_parties!assigned_external_party_id(name, company),
            pursuit:pursuits!pursuit_id(name)
        `)
        .eq('external_portal_token', params.token)
        .eq('external_portal_enabled', true)
        .eq('assigned_to_type', 'external')
        .single();

    if (error || !task) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white p-8 border border-red-200 rounded-2xl shadow-sm text-center">
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Link Expired or Invalid</h1>
                    <p className="text-sm text-gray-500">This task portal link is no longer active. Please request a new link from the deal team.</p>
                </div>
            </div>
        );
    }

    // 2. Fetch comments/notes
    const { data: notes } = await supabase
        .from('task_notes')
        .select(`
            id, content, created_at, created_by,
            user:user_profiles!created_by(full_name, avatar_url)
        `)
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });

    return (
        <main className="min-h-screen bg-gray-50 text-[var(--text-primary)]">
            <PortalClient task={task} pursuitName={task.pursuit?.name} externalParty={task.external_party} initialNotes={(notes || []).map((n: any) => ({ ...n, user: Array.isArray(n.user) ? n.user[0] : n.user })) as any} />
        </main>
    );
}
