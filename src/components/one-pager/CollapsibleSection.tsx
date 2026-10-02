'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * A full-width section that opens to show more cards (Target Yield, Sensitivity).
 * The header is a real disclosure button; the summary line says what's inside.
 */
export function CollapsibleSection({ title, summary, expanded, onToggle, children }: {
    title: string;
    /** One line shown on the right, e.g. what the section solves for */
    summary: ReactNode;
    expanded: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    return (
        <section className="lg:col-span-2 min-[88.75rem]:col-span-3">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="card w-full flex items-center justify-between gap-4 text-left cursor-pointer hover:border-[var(--border-strong)] transition-colors"
            >
                <span className="flex items-center gap-2 min-w-0">
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 text-[var(--text-faint)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} aria-hidden />
                    <h3 className="op-card-title">{title}</h3>
                </span>
                <span className="op-hint truncate">{summary}</span>
            </button>
            {expanded && <div className="mt-4 animate-fade-in">{children}</div>}
        </section>
    );
}
