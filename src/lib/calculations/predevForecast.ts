/**
 * Pre-dev forecast cell rule — shared by the pursuit Pre-Dev tab and the
 * portfolio Pre-Dev Budget report so both produce the same number for a given
 * pursuit, line item and month.
 */

import type { MonthlyCell } from '@/types';

/** A month is "closed" once 15+ days have passed since its last day. */
export function isMonthClosed(monthKey: string, today: Date): boolean {
    const [y, m] = monthKey.split('-').map(Number);
    const monthEnd = new Date(y, m, 0); // day 0 of next month = last day of this month
    const daysSinceMonthEnd = Math.floor((today.getTime() - monthEnd.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceMonthEnd >= 15;
}

/**
 * Plain-language statement of how forecastCellValue treats months, for UI and
 * export footnotes. Keep it in step with the function below: the pending-close
 * month adds Yardi posted to date on top of the full projection, so it can read
 * high until the month closes and switches to actuals.
 */
export const OPEN_MONTH_NOTE =
    'Closed months (15+ days after month end) show actuals: a manual override, else Yardi, ' +
    'else the entered actual, else the projection. ' +
    'Open months (the current month, future months and any month still awaiting close) show ' +
    'Yardi cost posted to date plus that month\'s full projection, so an open month can read high ' +
    'until it closes and switches to actuals.';

/**
 * Forecast value for one line-item month.
 * Closed: manual-override actual → Yardi (non-zero) → entered actual → projected.
 * Pending / future: Yardi posted to date plus the remaining projection.
 */
export function forecastCellValue(cell: MonthlyCell, yardiVal: number | null, closed: boolean): number {
    if (closed) {
        if (cell.manual_override && cell.actual !== null && cell.actual !== undefined) return cell.actual;
        if (yardiVal !== null && yardiVal !== 0) return yardiVal;
        if (cell.actual !== null && cell.actual !== undefined) return cell.actual;
        return cell.projected;
    }
    return (yardiVal ?? 0) + cell.projected;
}

/**
 * The per-pursuit Yardi feed returns a 2-digit group rollup row ("50") next to
 * the detail rows ("50-00100") it was summed from. Summing both double counts,
 * so drop a group row whenever detail rows exist for the same group + month.
 * A group row with no detail rows that month is spend posted without a detail
 * code and is kept. Shared by the Pre-Dev tab and the portfolio report.
 * Cached per aggregate array.
 */
const dedupedAggsCache = new WeakMap<object, unknown[]>();
export function dedupeYardiAggs<T extends { category_code: string; month: string }>(aggs: T[]): T[] {
    const cached = dedupedAggsCache.get(aggs);
    if (cached) return cached as T[];
    const hasDetail = new Set<string>();
    for (const a of aggs) {
        if (a.category_code.length > 2) hasDetail.add(`${a.category_code.substring(0, 2)}|${a.month}`);
    }
    const result = aggs.filter(a => a.category_code.length > 2 || !hasDetail.has(`${a.category_code}|${a.month}`));
    dedupedAggsCache.set(aggs, result);
    return result;
}
