'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, MessageSquare, Briefcase, Paperclip, Send } from 'lucide-react';
import { submitExternalNote, updateExternalTaskStatus } from './actions';
import type { PursuitChecklistTask } from '@/types';

// Add type from the server component
type PortalTask = PursuitChecklistTask & {
    external_portal_token: string;
};

type Note = {
    id: string;
    content: string;
    created_at: string;
    user: { full_name: string; avatar_url: string | null } | null;
};

export default function PortalClient({ 
    task, 
    pursuitName, 
    externalParty,
    initialNotes 
}: { 
    task: PortalTask;
    pursuitName?: string;
    externalParty?: { name: string; company: string | null };
    initialNotes: Note[];
}) {
    const router = useRouter();
    const [notes, setNotes] = useState<Note[]>(initialNotes);
    const [noteText, setNoteText] = useState('');
    const [status, setStatus] = useState(task.status);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isComplete = status === 'complete';

    const handleToggleStatus = async () => {
        const newStatus = isComplete ? 'in_progress' : 'complete';
        setIsSubmitting(true);
        setStatus(newStatus);
        await updateExternalTaskStatus(task.external_portal_token, newStatus);
        setIsSubmitting(false);
        router.refresh(); // Refresh server data
    };

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!noteText.trim() || isSubmitting) return;

        setIsSubmitting(true);
        const { error } = await submitExternalNote(task.external_portal_token, noteText);
        
        if (!error) {
            // Optimistic update
            setNotes([...notes, {
                id: Math.random().toString(),
                content: noteText.trim(),
                created_at: new Date().toISOString(),
                user: { full_name: externalParty?.name || 'External User', avatar_url: null }
            }]);
            setNoteText('');
        }
        setIsSubmitting(false);
        router.refresh();
    };

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
            <div className="mb-8">
                <div className="flex items-center gap-3 text-[var(--accent)] mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center">
                        <Briefcase className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 leading-tight">SLR Task Portal</h1>
                        {pursuitName && <p className="text-sm text-gray-500 font-medium">{pursuitName}</p>}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                <div className="p-6 sm:p-8 shrink-0 relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">{task.name}</h2>
                            {task.description && (
                                <p className="text-gray-600 mb-6">{task.description}</p>
                            )}
                            
                            <div className="flex flex-wrap gap-4 text-sm">
                                {externalParty && (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-gray-700 font-medium">
                                        Assigned to: {externalParty.name} {externalParty.company ? `(${externalParty.company})` : ''}
                                    </div>
                                )}
                                {task.due_date && (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 rounded-lg text-rose-700 font-medium">
                                        <Clock className="w-4 h-4" /> Due: {formatDate(task.due_date)}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:w-auto w-full shrink-0">
                            <button 
                                disabled={isSubmitting}
                                onClick={handleToggleStatus}
                                className={`w-full md:w-auto flex items-center justify-center px-6 py-3 rounded-xl font-medium transition-all shadow-sm ${
                                    isComplete 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' 
                                        : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                                }`}>
                                <CheckCircle2 className={`w-5 h-5 mr-2 ${isComplete ? 'text-emerald-500' : 'text-white'}`} />
                                {isComplete ? 'Marked Complete' : 'Mark Complete'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Reference Links */}
            {task.box_links && task.box_links.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-6">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-gray-400" /> Reference Files
                    </h3>
                    <div className="space-y-2">
                        {task.box_links.map((link, idx) => (
                            <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" 
                                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors group">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                    <Paperclip className="w-4 h-4 text-blue-600" />
                                </div>
                                <span className="font-medium text-gray-700 group-hover:text-blue-600 transition-colors">{link.label}</span>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Notes Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ minHeight: '400px' }}>
                <div className="p-6 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400" /> Comments & Notes
                    </h3>
                </div>
                
                <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-gray-50/50">
                    {notes.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No comments yet. Send a message to the deal team below.</p>
                    ) : (
                        notes.map(note => {
                            const isExternal = note.user === null || note.user?.full_name === externalParty?.name;
                            return (
                                <div key={note.id} className={`flex flex-col ${isExternal ? 'items-end' : 'items-start'}`}>
                                    <div className="flex items-end gap-2 max-w-[85%]">
                                        <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm ${
                                            isExternal 
                                                ? 'bg-[var(--accent)] text-white rounded-br-sm' 
                                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                                        }`}>
                                            <p className="whitespace-pre-wrap leading-relaxed">{note.content}</p>
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-2 mt-1.5 px-1 ${isExternal ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <span className="text-xs font-semibold text-gray-500">
                                            {isExternal ? (externalParty?.name || 'You') : (note.user?.full_name || 'Deal Team')}
                                        </span>
                                        <span className="text-[10px] text-gray-400">
                                            {formatDate(note.created_at)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 bg-white border-t border-gray-100">
                    <form onSubmit={handleAddNote} className="flex items-end gap-3">
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add a comment or ask a question..."
                            className="flex-1 max-h-32 min-h-[44px] p-3 rounded-xl border border-gray-200 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none resize-y text-sm transition-shadow"
                            rows={1}
                        />
                        <button 
                            type="submit"
                            disabled={!noteText.trim() || isSubmitting}
                            className="shrink-0 w-[44px] h-[44px] flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </div>
            
            <div className="mt-8 text-center">
                <p className="text-xs text-gray-400 font-medium">Powered by SLR • Secure Task Portal</p>
            </div>
        </div>
    );
}
