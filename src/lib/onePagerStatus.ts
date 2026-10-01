import type { OnePager } from '@/types';

type CompletenessFields = Pick<OnePager, 'total_units' | 'hard_cost_per_nrsf' | 'land_cost'> & { calc_total_budget?: number | null };

/**
 * What a one-pager is missing before its yield means anything, e.g.
 * ['units', 'land cost']. Placeholders (0 units, $0 cost) and $0-land scenarios
 * produce yields that look comparable but aren't, so cross-deal averages,
 * "best yield" highlights and primary auto-selection skip them.
 */
export function onePagerGaps(op: Partial<CompletenessFields>): string[] {
    const gaps: string[] = [];
    if (!(Number(op.total_units) > 0)) gaps.push('units');
    if (!(Number(op.hard_cost_per_nrsf) > 0)) gaps.push('hard cost');
    if (!(Number(op.land_cost) > 0)) gaps.push('land cost');
    if (gaps.length === 0 && op.calc_total_budget !== undefined && !(Number(op.calc_total_budget) > 0)) gaps.push('budget');
    return gaps;
}

export function isOnePagerComplete(op: Partial<CompletenessFields>): boolean {
    return onePagerGaps(op).length === 0;
}

/**
 * The one-pager that represents a pursuit: the one marked primary, else the
 * only complete one, else the only one. Null when it's ambiguous.
 * `onePagers` should already exclude archived ones.
 */
export function pickPrimaryOnePager<T extends { id: string } & Partial<CompletenessFields>>(
    primaryId: string | null | undefined,
    onePagers: T[],
): T | null {
    const explicit = primaryId ? onePagers.find((op) => op.id === primaryId) : undefined;
    if (explicit) return explicit;
    const complete = onePagers.filter(isOnePagerComplete);
    if (complete.length === 1) return complete[0];
    return onePagers.length === 1 ? onePagers[0] : null;
}
