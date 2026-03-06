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

    useEffect(() => {
        saveFnRef.current = saveFn;
    }, [saveFn]);

    const save = useCallback(
        (data: T) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (fadeTimeoutRef.current) {
                clearTimeout(fadeTimeoutRef.current);
            }

            timeoutRef.current = setTimeout(async () => {
                setStatus('saving');
                try {
                    await saveFnRef.current(data);
                    setStatus('saved');
                    fadeTimeoutRef.current = setTimeout(() => {
                        setStatus('idle');
                    }, 2000);
                } catch (error) {
                    console.error('Auto-save failed:', error);
                    setStatus('error');
                }
            }, AUTO_SAVE_DEBOUNCE_MS);
        },
        []
    );

    const saveImmediate = useCallback(
        async (data: T) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            setStatus('saving');
            try {
                await saveFnRef.current(data);
                setStatus('saved');
                fadeTimeoutRef.current = setTimeout(() => {
                    setStatus('idle');
                }, 2000);
            } catch (error) {
                console.error('Auto-save failed:', error);
                setStatus('error');
            }
        },
        []
    );

    return { save, saveImmediate, status };
}
