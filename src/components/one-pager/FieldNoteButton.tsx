'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';

interface FieldNoteButtonProps {
    fieldKey: string;
    note: string | undefined;
    onNoteChange: (fieldKey: string, note: string) => void;
}

const POPOVER_WIDTH = 256;
const GAP = 6;

/**
 * Note icon beside a field; opens a small editor. The editor is portaled to
 * <body> and placed under the icon, so a scrolling table or card can't clip it.
 */
export default function FieldNoteButton({ fieldKey, note, onNoteChange }: FieldNoteButtonProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(note ?? '');
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const hasNote = !!note?.trim();

    const commitAndClose = useCallback(() => {
        const trimmed = draft.trim();
        if (trimmed !== (note ?? '').trim()) onNoteChange(fieldKey, trimmed);
        setOpen(false);
    }, [draft, note, fieldKey, onNoteChange]);

    // Under the icon, kept inside the viewport; flips above when there's no room below
    const place = useCallback(() => {
        const r = buttonRef.current?.getBoundingClientRect();
        if (!r) return;
        const left = Math.min(Math.max(8, r.left), window.innerWidth - POPOVER_WIDTH - 8);
        const height = popoverRef.current?.offsetHeight ?? 150;
        const below = r.bottom + GAP;
        const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - GAP - height) : below;
        setPos({ top, left });
    }, []);

    const openEditor = () => {
        setDraft(note ?? '');
        place();
        setOpen(true);
        requestAnimationFrame(() => textareaRef.current?.focus());
    };

    // Close on outside press or Escape; follow the icon on scroll / resize
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (!popoverRef.current?.contains(t) && !buttonRef.current?.contains(t)) commitAndClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') commitAndClose(); };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open, commitAndClose, place]);

    return (
        <span className="relative inline-flex items-center">
            <button
                ref={buttonRef}
                onClick={(e) => { e.stopPropagation(); if (open) commitAndClose(); else openEditor(); }}
                className={`p-0.5 rounded transition-colors ${hasNote
                        ? 'text-[var(--accent)] hover:text-[var(--accent-hover)]'
                        // Hidden until row hover — except on touch screens, which have no hover
                        : 'text-[var(--text-faint)] hover:text-[var(--text-muted)] opacity-0 group-hover/note:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-60'
                    }`}
                title={hasNote ? note : 'Add a note'}
                aria-label={hasNote ? 'View or edit note' : 'Add a note'}
                aria-expanded={open}
                type="button"
            >
                <MessageSquare className="w-3 h-3" />
            </button>

            {open && createPortal(
                <div
                    ref={popoverRef}
                    role="dialog"
                    aria-label="Note"
                    className="fixed z-[70] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg animate-fade-in"
                    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: POPOVER_WIDTH, boxShadow: 'var(--shadow-dropdown)' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-2.5">
                        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Note</div>
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
                            className="w-full px-2 py-1.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-xs leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-subtle)] focus:outline-none resize-none"
                            rows={3}
                        />
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[11px] text-[var(--text-faint)]">Enter to save · Esc to close</span>
                            {hasNote && (
                                <button
                                    onClick={() => { setDraft(''); onNoteChange(fieldKey, ''); setOpen(false); }}
                                    className="text-[11px] text-[var(--danger)] hover:underline"
                                    type="button"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </span>
    );
}
