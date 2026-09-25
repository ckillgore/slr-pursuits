'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Warning shown when a cached map / data result was generated for a different
 * location than the record's current one. Regeneration is always user-initiated
 * (these are paid or rate-limited APIs).
 */
export function StaleLocationNotice({ what, generatedAt, onRegenerate, disabled, actionLabel = 'Regenerate' }: {
    /** e.g. "drive-time area" */
    what: string;
    generatedAt?: string | null;
    onRegenerate?: () => void;
    disabled?: boolean;
    actionLabel?: string;
}) {
    const when = generatedAt && !isNaN(new Date(generatedAt).getTime())
        ? ` on ${new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : '';
    return (
        <div role="status" className="flex flex-wrap items-center gap-2 p-2.5 mb-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning)]/40">
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] flex-shrink-0" aria-hidden="true" />
            <p className="flex-1 min-w-[180px] text-xs text-[var(--warning)]">
                Location changed — this {what} was generated{when} for a different site.
            </p>
            {onRegenerate && (
                <button
                    type="button"
                    onClick={onRegenerate}
                    disabled={disabled}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--warning)]/50 text-[11px] font-medium text-[var(--warning)] hover:bg-[var(--warning)]/10 disabled:opacity-50 transition-colors"
                >
                    <RefreshCw className="w-3 h-3" aria-hidden="true" /> {actionLabel}
                </button>
            )}
        </div>
    );
}
