'use client';

import { create } from 'zustand';

// ============================================================
// App-wide toast notifications — replaces blocking alert() for
// save/delete/upload feedback. Rendered by <Toaster /> in Providers.
//
//   toast.error('Failed to save', err)   // appends err.message if present
//   toast.success('Budget amended')
// ============================================================

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
    id: number;
    kind: ToastKind;
    message: string;
}

interface ToastState {
    toasts: Toast[];
    push: (kind: ToastKind, message: string) => void;
    dismiss: (id: number) => void;
}

const MAX_VISIBLE = 4;
// Errors stay long enough to read; they can also be dismissed manually.
const DURATION_MS: Record<ToastKind, number> = { success: 3500, info: 4500, error: 7000 };

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
    toasts: [],
    push: (kind, message) => {
        // Collapse identical messages fired in a burst (e.g. a failing batch).
        if (get().toasts.some(t => t.kind === kind && t.message === message)) return;
        const id = nextId++;
        set(s => ({ toasts: [...s.toasts, { id, kind, message }].slice(-MAX_VISIBLE) }));
        setTimeout(() => get().dismiss(id), DURATION_MS[kind]);
    },
    dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

function errorDetail(err: unknown): string | null {
    if (!err) return null;
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
        return (err as { message: string }).message;
    }
    return null;
}

export const toast = {
    success: (message: string) => useToastStore.getState().push('success', message),
    info: (message: string) => useToastStore.getState().push('info', message),
    /** Pass the caught error to append its message: toast.error('Failed to save', err). */
    error: (message: string, err?: unknown) => {
        const detail = errorDetail(err);
        useToastStore.getState().push('error', detail && !message.includes(detail) ? `${message}: ${detail}` : message);
    },
};
