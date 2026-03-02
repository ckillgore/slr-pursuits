'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';

interface FieldNoteButtonProps {
    fieldKey: string;
    note: string | undefined;
    onNoteChange: (fieldKey: string, note: string) => void;
}

export default function FieldNoteButton({ fieldKey, note, onNoteChange }: FieldNoteButtonProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(note ?? '');
    const popoverRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const hasNote = !!note?.trim();

    // Sync draft when note changes externally
    useEffect(() => {
        if (!open) setDraft(note ?? '');
    }, [note, open]);

    // Focus textarea when popover opens
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => textareaRef.current?.focus());
        }
    }, [open]);

    // Close on outside click or Escape
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)
            ) {
                commitAndClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') commitAndClose();
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    });

    const commitAndClose = useCallback(() => {
        const trimmed = draft.trim();
        if (trimmed !== (note ?? '').trim()) {
            onNoteChange(fieldKey, trimmed);
        }
        setOpen(false);
    }, [draft, note, fieldKey, onNoteChange]);

    return (
        <span className="relative inline-flex items-center">
            <button
                ref={buttonRef}
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={`p-0.5 rounded transition-colors ${hasNote
                        ? 'text-[#2563EB] hover:text-[#1D4ED8]'
                        : 'text-[#CBD2DC] hover:text-[#7A8599] opacity-0 group-hover/note:opacity-100'
                    } ${hasNote ? '' : 'focus:opacity-100'}`}
                title={hasNote ? 'View/edit note' : 'Add a note'}
                type="button"
            >
                <MessageSquare className="w-3 h-3" />
            </button>

            {open && (
                <div
                    ref={popoverRef}
                    className="absolute left-0 top-full mt-1 z-50 w-64 bg-white border border-[#E2E5EA] rounded-lg shadow-lg animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-2">
                        <div className="text-[10px] font-semibold text-[#7A8599] uppercase tracking-wider mb-1">
                            Note
                        </div>
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    commitAndClose();
                                }
                            }}
                            placeholder="Add assumption context..."
                            className="w-full px-2 py-1.5 rounded-md bg-[#F9FAFB] border border-[#E2E5EA] text-xs text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-1 focus:ring-[#EBF1FF] focus:outline-none resize-none"
                            rows={3}
                        />
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-[#A0AABB]">Enter to save · Esc to close</span>
                            {hasNote && (
                                <button
                                    onClick={() => { setDraft(''); onNoteChange(fieldKey, ''); setOpen(false); }}
                                    className="text-[10px] text-[#DC2626] hover:underline"
                                    type="button"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </span>
    );
}
