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
                    ? 'bg-[#EBF1FF] text-[#2563EB] border-[#2563EB]/30 shadow-sm'
                    : 'text-[#4A5568] bg-[#F8F9FB] border-[#E2E5EA] hover:text-[#2563EB] hover:bg-[#EBF1FF] hover:border-[#2563EB]/30'
                    }`}
                title="Comments"
            >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Comments</span>
                {comments.length > 0 && (
                    <span className="text-[10px] bg-[#2563EB] text-white min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 font-bold">
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
