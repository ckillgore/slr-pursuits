/**
 * Itemized other income. When a one-pager itemizes, the lines replace the
 * single $/unit/month assumption: their total is converted back to a per-unit
 * figure so every calculation (and the stored field reports read) stays on
 * the one formula in calcRevenue — subject to vacancy, not scaled by rent.
 */
import type { OnePager, OtherIncomeRow } from '@/types';

export const STANDARD_OTHER_INCOME_ITEMS = [
    'Parking',
    'Storage',
    'Pet Rent',
    'Pet Fees',
    'Utility Reimbursement (RUBS)',
    'Admin & Application Fees',
    'Amenity Fee',
    'Valet Trash',
    'Late & Misc. Fees',
] as const;

export function otherIncomeLineAnnual(line: Pick<OtherIncomeRow, 'unit_count' | 'amount_per_month'>): number {
    return (Number(line.unit_count) || 0) * (Number(line.amount_per_month) || 0) * 12;
}

export function otherIncomeAnnual(lines: OtherIncomeRow[]): number {
    return lines.reduce((sum, line) => sum + otherIncomeLineAnnual(line), 0);
}

/** The one-pager with other_income_per_unit_month set from its lines when it itemizes. */
export function withItemizedOtherIncome(onePager: OnePager, lines: OtherIncomeRow[], totalUnits: number): OnePager {
    if (!onePager.use_detailed_other_income) return onePager;
    const perUnitMonth = totalUnits > 0 ? otherIncomeAnnual(lines) / totalUnits / 12 : 0;
    return { ...onePager, other_income_per_unit_month: perUnitMonth };
}
