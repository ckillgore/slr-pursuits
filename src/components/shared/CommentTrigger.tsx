'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useEntityComments } from '@/hooks/useSupabaseQueries';
import CommentPanel from './CommentPanel';
import type { CommentEntityType } from '@/types';

interface CommentTriggerProps {
    entityType: CommentEntityType;
    entityId: string;
    className?: string;
}

export default function CommentTrigger({ entityType, entityId, className }: CommentTriggerProps) {
    const [open, setOpen] = useState(false);
    const { data: comments = [] } = useEntityComments(entityType, entityId);

    return (
        <div className={`relative ${className || ''}`}>
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${open
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/30 shadow-sm'
                    : 'text-[var(--text-secondary)] bg-[var(--bg-primary)] border-[var(--border)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] hover:border-[var(--accent)]/30'
                    }`}
                title="Comments"
            >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Comments</span>
                {comments.length > 0 && (
                    <span className="text-[10px] bg-[var(--accent)] text-white min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 font-bold">
                        {comments.length}
                    </span>
                )}
            </button>

            {open && (
                <CommentPanel
                    entityType={entityType}
                    entityId={entityId}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}
