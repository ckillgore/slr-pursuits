'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTO_SAVE_DEBOUNCE_MS } from '@/lib/constants';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave<T>(
    saveFn: (data: T) => Promise<void>
) {
    const [status, setStatus] = useState<SaveStatus>('idle');
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveFnRef = useRef(saveFn);
    // Data waiting on the debounce timer (so it can be flushed on unmount/unload)
    const pendingRef = useRef<{ data: T } | null>(null);
    // Monotonic save counter — only the most recent save may update status,
    // so an older request finishing late can't flip 'saving' → 'saved'.
    const seqRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        saveFnRef.current = saveFn;
    }, [saveFn]);

    const run = useCallback(async (data: T) => {
        const seq = ++seqRef.current;
        if (fadeTimeoutRef.current) {
            clearTimeout(fadeTimeoutRef.current);
            fadeTimeoutRef.current = null;
        }
        if (mountedRef.current) setStatus('saving');
        try {
            await saveFnRef.current(data);
            if (!mountedRef.current || seq !== seqRef.current) return;
            setStatus('saved');
            fadeTimeoutRef.current = setTimeout(() => {
                if (mountedRef.current) setStatus('idle');
            }, 2000);
        } catch (error) {
            console.error('Auto-save failed:', error);
            if (mountedRef.current && seq === seqRef.current) setStatus('error');
        }
    }, []);

    const flush = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        const pending = pendingRef.current;
        pendingRef.current = null;
        // Resolves once the flushed save settles, for callers that must read fresh DB state
        return pending ? run(pending.data) : Promise.resolve();
    }, [run]);

    const save = useCallback(
        (data: T) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (fadeTimeoutRef.current) {
                clearTimeout(fadeTimeoutRef.current);
                fadeTimeoutRef.current = null;
            }
            pendingRef.current = { data };

            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                const pending = pendingRef.current;
                pendingRef.current = null;
                if (pending) void run(pending.data);
            }, AUTO_SAVE_DEBOUNCE_MS);
        },
        [run]
    );

    const saveImmediate = useCallback(
        async (data: T) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            // The immediate payload supersedes whatever was debounced
            pendingRef.current = null;
            await run(data);
        },
        [run]
    );

    // Flush any debounced edit when the page is being hidden/unloaded,
    // and when the component unmounts (e.g. client-side navigation).
    useEffect(() => {
        mountedRef.current = true;
        const onHide = () => flush();
        window.addEventListener('pagehide', onHide);
        window.addEventListener('beforeunload', onHide);
        return () => {
            window.removeEventListener('pagehide', onHide);
            window.removeEventListener('beforeunload', onHide);
            mountedRef.current = false;
            flush();
            if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
        };
    }, [flush]);

    return { save, saveImmediate, flush, status };
}
