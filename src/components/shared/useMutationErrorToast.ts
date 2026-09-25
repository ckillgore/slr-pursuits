'use client';

import { useEffect } from 'react';
import { toast } from '@/lib/toast';

/**
 * Show a toast whenever a mutation fails. For screens that fire many
 * `mutation.mutate(...)` calls (inline admin editors) where adding an onError
 * to each call would be noise. Pass `mutation.error`; each failure is a new
 * error object, so every failure toasts once.
 */
export function useMutationErrorToast(error: unknown, message: string) {
    useEffect(() => {
        if (error) toast.error(message, error);
    }, [error, message]);
}
