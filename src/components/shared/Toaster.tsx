'use client';

import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '@/lib/toast';

const STYLES: Record<ToastKind, { icon: typeof Info; color: string; bg: string }> = {
    success: { icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-bg)' },
    error: { icon: AlertCircle, color: 'var(--danger)', bg: 'var(--danger-bg)' },
    info: { icon: Info, color: 'var(--accent)', bg: 'var(--accent-subtle)' },
};

/** Renders toasts from useToastStore. Mounted once in Providers. */
export function Toaster() {
    const toasts = useToastStore(s => s.toasts);
    const dismiss = useToastStore(s => s.dismiss);

    return (
        <div
            className="fixed z-[1000] bottom-4 right-4 left-4 sm:left-auto flex flex-col items-stretch sm:items-end gap-2 pointer-events-none"
            // Errors interrupt screen readers; confirmations wait their turn.
            aria-live="polite"
        >
            {toasts.map(t => {
                const { icon: Icon, color, bg } = STYLES[t.kind];
                return (
                    <div
                        key={t.id}
                        role={t.kind === 'error' ? 'alert' : 'status'}
                        className="pointer-events-auto animate-fade-in flex items-start gap-2.5 w-full sm:w-[360px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3.5 py-3 shadow-[var(--shadow-dropdown)]"
                        style={{ borderLeft: `3px solid ${color}` }}
                    >
                        <span className="mt-0.5 rounded-full p-0.5 shrink-0" style={{ background: bg }}>
                            <Icon className="w-4 h-4" style={{ color }} aria-hidden />
                        </span>
                        <p className="flex-1 text-sm text-[var(--text-primary)] break-words">{t.message}</p>
                        <button
                            onClick={() => dismiss(t.id)}
                            aria-label="Dismiss notification"
                            className="shrink-0 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
