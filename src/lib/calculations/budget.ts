/**
 * Budget Calculations — PRD §4.4
 */

import type { SoftCostDetailRow } from '@/types';

export interface BudgetCalc {
    hard_cost: number;
    hard_cost_per_gbsf: number;
    soft_cost: number;
    soft_cost_pct_display: number;
    total_budget: number;
    cost_per_unit: number;
    cost_per_nrsf: number;
    cost_per_gbsf: number;
    land_cost_per_unit: number;
    land_cost_per_sf: number;
}

export function calcBudget(
    hardCostPerNrsf: number,
    totalNrsf: number,
    totalGbsf: number,
    landCost: number,
    softCostPct: number,
    useDetailedSoftCosts: boolean,
    softCostDetails: SoftCostDetailRow[],
    totalUnits: number,
    siteAreaSf: number
): BudgetCalc {
    const hard_cost = hardCostPerNrsf * totalNrsf;
    const hard_cost_per_gbsf = totalGbsf > 0 ? hard_cost / totalGbsf : 0;

    let soft_cost: number;
    let soft_cost_pct_display: number;

    if (useDetailedSoftCosts) {
        soft_cost = softCostDetails.reduce((sum, d) => sum + d.amount, 0);
        soft_cost_pct_display = hard_cost > 0 ? soft_cost / hard_cost : 0;
    } else {
        soft_cost = softCostPct * hard_cost;
        soft_cost_pct_display = softCostPct;
    }

    const total_budget = hard_cost + landCost + soft_cost;
    const cost_per_unit = totalUnits > 0 ? total_budget / totalUnits : 0;
    const cost_per_nrsf = totalNrsf > 0 ? total_budget / totalNrsf : 0;
    const cost_per_gbsf = totalGbsf > 0 ? total_budget / totalGbsf : 0;
    const land_cost_per_unit = totalUnits > 0 ? landCost / totalUnits : 0;
    const land_cost_per_sf = siteAreaSf > 0 ? landCost / siteAreaSf : 0;

    return {
        hard_cost,
        hard_cost_per_gbsf,
        soft_cost,
        soft_cost_pct_display,
        total_budget,
        cost_per_unit,
        cost_per_nrsf,
        cost_per_gbsf,
        land_cost_per_unit,
        land_cost_per_sf,
    };
}
