import { after, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createTtlCache } from '@/app/api/_lib/upstream';

/**
 * Regrid usage: the plan's monthly allowance, the live totals from Regrid's
 * /usage endpoint (account-wide — every token, including MCP use), and a
 * who/what log in `regrid_usage_log`.
 */

const REGRID_API_KEY = process.env.REGRID_API_KEY || '';

/** Bundle Access (Premium): parcel records and tiles included per billing cycle */
export const REGRID_MONTHLY_RECORDS = Number(process.env.REGRID_MONTHLY_RECORDS) || 2000;
export const REGRID_MONTHLY_TILES = 200_000;
export const REGRID_OVERAGE_PER_RECORD = 0.15;

export interface RegridUsage {
    records: number;
    recordLimit: number;
    tiles: number;
    tileLimit: number;
    cycleStart: string;
    cycleEnd: string;
}

// /usage is free, but every paid call checks it — a short cache keeps that cheap
const usageCache = createTtlCache<RegridUsage>(60_000, 1);

export async function getRegridUsage(): Promise<RegridUsage | null> {
    if (!REGRID_API_KEY) return null;
    try {
        return await usageCache.getOrLoad('usage', async () => {
            const res = await fetch(`https://app.regrid.com/api/v2/usage?token=${REGRID_API_KEY}`, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) throw new Error(`Regrid usage: HTTP ${res.status}`);
            const { usage } = await res.json();
            return {
                records: Number(usage?.cycle_usage?.results) || 0,
                recordLimit: REGRID_MONTHLY_RECORDS,
                tiles: Number(usage?.cycle_usage?.tiles) || 0,
                tileLimit: REGRID_MONTHLY_TILES,
                cycleStart: new Date(Number(usage?.cycle_dates?.begin) * 1000).toISOString(),
                cycleEnd: new Date(Number(usage?.cycle_dates?.end) * 1000).toISOString(),
            };
        });
    } catch (err) {
        console.error('[Regrid usage]', err);
        return null;
    }
}

async function isAdmin(userId: string): Promise<boolean> {
    const supabase = await createClient();
    const { data } = await supabase.from('user_profiles').select('role').eq('id', userId).single();
    return data?.role === 'owner' || data?.role === 'admin';
}

/**
 * Refuses a call that could take the cycle past its included records, unless an
 * owner/admin explicitly allows overage. If Regrid's usage can't be read, the
 * call goes ahead — the per-call `limit` still caps it.
 */
export async function checkRecordBudget(
    userId: string,
    maxRecords: number,
    allowOverage = false,
): Promise<{ usage: RegridUsage | null; response: NextResponse | null }> {
    const usage = await getRegridUsage();
    if (!usage || usage.records + maxRecords <= usage.recordLimit) return { usage, response: null };
    if (allowOverage && (await isAdmin(userId))) return { usage, response: null };
    const remaining = Math.max(0, usage.recordLimit - usage.records);
    return {
        usage,
        response: NextResponse.json(
            {
                error: remaining > 0
                    ? `Only ${remaining} Regrid parcel records left this cycle (this needs up to ${maxRecords}).`
                    : `This cycle's ${usage.recordLimit.toLocaleString()} Regrid parcel records are used up.`,
                code: 'regrid_budget',
                usage,
            },
            { status: 429 },
        ),
    };
}

/** Logs records used after the response is sent, and drops the cached totals */
export function logRegridUsage(purpose: 'lookup' | 'nearby' | 'find' | 'refresh', records: number, detail?: Record<string, unknown>) {
    if (records > 0) usageCache.delete('usage');
    after(async () => {
        try {
            const supabase = await createClient();
            const { error } = await supabase.from('regrid_usage_log').insert({ purpose, records, detail: detail ?? null });
            if (error) console.error('[Regrid usage log]', error.message);
        } catch (err) {
            console.error('[Regrid usage log]', err);
        }
    });
}
