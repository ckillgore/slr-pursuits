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
