/**
 * Solve for a target yield on cost: what rent, land price or hard cost gets a
 * one-pager to the target, holding everything else fixed. Built on the
 * sensitivity engine (one step at a time), so every answer reproduces exactly
 * what the one-pager would show after making that change — including property
 * tax moving with land and hard cost.
 */
import type { OnePager, UnitMixRow, PayrollRow, SoftCostDetailRow, UnitPremium } from '@/types';
import { calcUnitMixAggregates } from './unitMix';
import { calcRentSensitivity, calcHardCostSensitivity, calcLandCostSensitivity } from './sensitivity';

export interface SolveResult {
    targetYoc: number;
    /** Weighted average rent $/SF/month needed; null when no rent gets there */
    requiredRentPsf: number | null;
    currentRentPsf: number;
    /** Most the land can cost; null when even free land misses the target */
    maxLandCost: number | null;
    /** Most hard cost $/NRSF can be; null when even $0 misses the target */
    maxHardCostPerNrsf: number | null;
}

/** Bisection on a yield that rises (or falls) monotonically with x. */
function solveMonotonic(yocAt: (x: number) => number, target: number, lo: number, hi: number, rising: boolean): number | null {
    const below = (x: number) => (rising ? yocAt(x) < target : yocAt(x) > target);
    if (below(hi) === below(lo)) return null; // target outside the searchable range
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

export function solveForTargetYoc(
    onePager: OnePager,
    unitMix: UnitMixRow[],
    payroll: PayrollRow[],
    softCostDetails: SoftCostDetailRow[],
    targetYoc: number,
    unitPremiums?: UnitPremium[],
): SolveResult {
    const agg = calcUnitMixAggregates(unitMix, onePager.efficiency_ratio);
    const currentRentPsf = agg.weighted_avg_rent_per_sf;
    const result: SolveResult = { targetYoc, requiredRentPsf: null, currentRentPsf, maxLandCost: null, maxHardCostPerNrsf: null };
    if (!(targetYoc > 0) || agg.total_units <= 0 || agg.total_nrsf <= 0) return result;

    const one = (rows: { yoc: number }[]) => rows[0]?.yoc ?? 0;

    if (currentRentPsf > 0) {
        // Rent steps are $/SF deltas on the weighted average rent
        const delta = solveMonotonic(
            (d) => one(calcRentSensitivity(onePager, unitMix, payroll, softCostDetails, [d], unitPremiums)),
            targetYoc, -currentRentPsf, currentRentPsf * 4, true,
        );
        result.requiredRentPsf = delta === null ? null : currentRentPsf + delta;
    }

    // Land and hard cost steps are absolute deltas; search from $0 up to a generous ceiling
    const landDelta = solveMonotonic(
        (d) => one(calcLandCostSensitivity(onePager, unitMix, payroll, softCostDetails, [d], unitPremiums)),
        targetYoc, -onePager.land_cost, Math.max(onePager.land_cost, 1_000_000) * 20, false,
    );
    result.maxLandCost = landDelta === null ? null : Math.max(0, onePager.land_cost + landDelta);

    const hcDelta = solveMonotonic(
        (d) => one(calcHardCostSensitivity(onePager, unitMix, payroll, softCostDetails, [d], unitPremiums)),
        targetYoc, -onePager.hard_cost_per_nrsf, Math.max(onePager.hard_cost_per_nrsf, 100) * 10, false,
    );
    result.maxHardCostPerNrsf = hcDelta === null ? null : Math.max(0, onePager.hard_cost_per_nrsf + hcDelta);

    return result;
}
