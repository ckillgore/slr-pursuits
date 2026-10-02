'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from './useSupabaseQueries';
import type { OnePager } from '@/types';

/**
 * Parse a Postgres timestamptz as sent by PostgREST ("2026-09-25T14:03:11.123456+00:00")
 * or by Realtime (which may use a space separator and a "+00" offset) into epoch
 * milliseconds, keeping microseconds as a fraction so two writes in the same
 * millisecond still order correctly. Returns null when unparseable.
 */
export function parseTimestamp(value: string | null | undefined): number | null {
    if (!value) return null;
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(value.trim());
    if (!m) {
        const t = Date.parse(value);
        return Number.isFinite(t) ? t : null;
    }
    const [, date, time, fraction = '', zoneRaw] = m;
    let zone = zoneRaw ? zoneRaw.toUpperCase() : 'Z';
    if (zone !== 'Z') {
        const digits = zone.slice(1).replace(':', '');
        zone = `${zone[0]}${digits.slice(0, 2)}:${(digits.slice(2) || '00').padEnd(2, '0')}`;
    }
    const base = Date.parse(`${date}T${time}${zone}`);
    if (!Number.isFinite(base)) return null;
    const micros = Number((fraction + '000000').slice(0, 6));
    return base + micros / 1000;
}

interface RealtimeOnePagerOptions {
    /**
     * The key the page reads the one-pager under when it isn't the UUID
     * (the route uses the short id). Used when falling back to invalidation.
     */
    queryId?: string;
    /**
     * Receives the new row for UPDATEs to this one-pager (including echoes of
     * this client's own saves — the caller decides what to keep). When omitted,
     * or when the payload can't be used, the one-pager query is refetched instead.
     */
    onOnePagerUpdate?: (row: Partial<OnePager>) => void;
}

/**
 * Subscribe to Supabase Realtime changes for a one-pager and its child rows so
 * other users' edits show up live.
 *
 * - one_pagers: the changed row is handed to `onOnePagerUpdate` so the editor
 *   can merge it field by field without clobbering local edits.
 * - child tables: the matching query is refetched once this client has no
 *   mutations in flight; most of these events are echoes of our own optimistic
 *   upserts, and refetching mid-mutation would briefly revert them.
 *
 * Requires the tables to be in the `supabase_realtime` publication.
 */
export function useRealtimeOnePager(onePagerId: string, options: RealtimeOnePagerOptions = {}) {
    const qc = useQueryClient();
    const { queryId } = options;
    const onUpdateRef = useRef(options.onOnePagerUpdate);
    useEffect(() => {
        onUpdateRef.current = options.onOnePagerUpdate;
    });

    useEffect(() => {
        if (!onePagerId) return;

        const supabase = createClient();
        const timers = new Set<ReturnType<typeof setTimeout>>();

        const refetchWhenIdle = (queryKey: QueryKey, attempt = 0) => {
            // Give up waiting after ~5s so a stuck mutation can't block updates forever
            if (qc.isMutating() > 0 && attempt < 16) {
                const t = setTimeout(() => {
                    timers.delete(t);
                    refetchWhenIdle(queryKey, attempt + 1);
                }, 300);
                timers.add(t);
                return;
            }
            qc.invalidateQueries({ queryKey });
        };

        const refetchOnePager = () => {
            refetchWhenIdle(queryKeys.onePager(onePagerId));
            if (queryId && queryId !== onePagerId) refetchWhenIdle(queryKeys.onePager(queryId));
        };

        const childTables: { table: string; queryKey: QueryKey }[] = [
            { table: 'one_pager_unit_mix', queryKey: queryKeys.unitMix(onePagerId) },
            { table: 'one_pager_payroll', queryKey: queryKeys.payroll(onePagerId) },
            { table: 'one_pager_soft_cost_detail', queryKey: queryKeys.softCosts(onePagerId) },
            { table: 'unit_premiums', queryKey: queryKeys.unitPremiums(onePagerId) },
            { table: 'one_pager_other_income', queryKey: queryKeys.otherIncome(onePagerId) },
        ];

        let channel = supabase
            .channel(`one-pager-${onePagerId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'one_pagers',
                    filter: `id=eq.${onePagerId}`,
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    const row = payload.new as Partial<OnePager> | undefined;
                    const handler = onUpdateRef.current;
                    // Oversized payloads arrive with `errors` and a partial record
                    const hasErrors = !!(payload as { errors?: unknown }).errors;
                    if (payload.eventType === 'UPDATE' && handler && row?.id && !hasErrors) {
                        handler(row);
                    } else {
                        refetchOnePager();
                    }
                }
            );

        for (const { table, queryKey } of childTables) {
            channel = channel.on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table,
                    filter: `one_pager_id=eq.${onePagerId}`,
                },
                () => refetchWhenIdle(queryKey)
            );
        }

        channel.subscribe();

        return () => {
            timers.forEach(clearTimeout);
            supabase.removeChannel(channel);
        };
    }, [onePagerId, queryId, qc]);
}
