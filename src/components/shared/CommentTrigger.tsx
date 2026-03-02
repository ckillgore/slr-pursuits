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
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${open
                        ? 'bg-[#EBF1FF] text-[#2563EB]'
                        : 'text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7]'
                    }`}
                title="Comments"
            >
                <MessageSquare className="w-4 h-4" />
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
