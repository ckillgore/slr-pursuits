'use client';

import { useQuery } from '@tanstack/react-query';
import { formatNumber } from '@/lib/constants';

export interface RegridUsage {
    records: number;
    recordLimit: number;
    tiles: number;
    tileLimit: number;
    cycleStart: string;
    cycleEnd: string;
}

export interface RegridUsageLogRow {
    id: string;
    created_at: string;
    user_id: string;
    user_name: string;
    purpose: 'lookup' | 'nearby' | 'find' | 'refresh';
    records: number;
    detail: Record<string, unknown> | null;
}

interface RegridUsageResponse {
    usage: RegridUsage;
    overagePerRecord: number;
    log: RegridUsageLogRow[];
}

export const REGRID_USAGE_KEY = ['regrid-usage'];

/** This cycle's Regrid totals (account-wide), plus the who/what log for admins */
export function useRegridUsage() {
    return useQuery({
        queryKey: REGRID_USAGE_KEY,
        queryFn: async (): Promise<RegridUsageResponse> => {
            const res = await fetch('/api/regrid/usage');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Regrid usage is unavailable');
            return data;
        },
        staleTime: 60_000,
    });
}

/** Warn at 80% of the included records; past 100% each record is billed */
export function usageLevel(u: RegridUsage): 'ok' | 'warn' | 'over' {
    const pct = u.records / u.recordLimit;
    return pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok';
}

const LEVEL_COLOR = { ok: 'var(--accent)', warn: 'var(--warning)', over: 'var(--danger)' } as const;

function shortDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Parcel records used this billing cycle, as a labeled bar */
export function RegridUsageMeter({ usage, compact = false }: { usage: RegridUsage; compact?: boolean }) {
    const level = usageLevel(usage);
    const pct = Math.min(100, (usage.records / usage.recordLimit) * 100);
    const remaining = usage.recordLimit - usage.records;
    return (
        <div>
            <div className={`flex items-baseline justify-between gap-2 ${compact ? 'text-[11px]' : 'text-sm'}`}>
                <span className="text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatNumber(usage.records)}</span>
                    {' / '}{formatNumber(usage.recordLimit)} parcel records
                </span>
                <span className={`tabular-nums ${level === 'ok' ? 'text-[var(--text-muted)]' : level === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>
                    {remaining >= 0 ? `${formatNumber(remaining)} left` : `${formatNumber(-remaining)} over`}
                </span>
            </div>
            <div
                className={`${compact ? 'h-1.5 mt-1' : 'h-2 mt-1.5'} rounded-full bg-[var(--bg-elevated)] overflow-hidden`}
                role="meter"
                aria-label="Regrid parcel records used this cycle"
                aria-valuemin={0}
                aria-valuemax={usage.recordLimit}
                aria-valuenow={usage.records}
            >
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: LEVEL_COLOR[level] }} />
            </div>
            <div className={`${compact ? 'text-[10px] mt-1' : 'text-xs mt-1.5'} text-[var(--text-faint)]`}>
                Cycle {shortDate(usage.cycleStart)} – {shortDate(usage.cycleEnd)}
                {!compact && <> · {formatNumber(usage.tiles)} / {formatNumber(usage.tileLimit)} map tiles</>}
            </div>
        </div>
    );
}
