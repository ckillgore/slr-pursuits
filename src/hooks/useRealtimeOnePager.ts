'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from './useSupabaseQueries';

/**
 * Subscribe to Supabase Realtime changes for a specific one-pager record.
 * When another user modifies the same record, the TanStack cache is
 * silently invalidated so the next render fetches fresh data.
 *
 * This is the "silent refetch" strategy — appropriate for ~10 users
 * where conflicts are rare. No disruptive modals.
 */
export function useRealtimeOnePager(onePagerId: string) {
    const qc = useQueryClient();

    useEffect(() => {
        if (!onePagerId) return;

        const supabase = createClient();

        const channel = supabase
            .channel(`one-pager-${onePagerId}`)
            // Listen for changes to this specific one-pager row
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'one_pagers',
                    filter: `id=eq.${onePagerId}`,
                },
                () => {
                    // Silently invalidate — TanStack will refetch automatically
                    qc.invalidateQueries({ queryKey: queryKeys.onePager(onePagerId) });
                }
            )
            // Listen for unit mix changes tied to this one-pager
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'one_pager_unit_mix',
                    filter: `one_pager_id=eq.${onePagerId}`,
                },
                () => {
                    qc.invalidateQueries({ queryKey: queryKeys.unitMix(onePagerId) });
                }
            )
            // Listen for payroll changes
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'one_pager_payroll',
                    filter: `one_pager_id=eq.${onePagerId}`,
                },
                () => {
                    qc.invalidateQueries({ queryKey: queryKeys.payroll(onePagerId) });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [onePagerId, qc]);
}
