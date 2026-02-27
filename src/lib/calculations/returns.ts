/**
 * Returns / NOI / YOC Calculations — PRD §4.7
 */

export interface ReturnsCalc {
    noi: number;
    noi_per_unit: number;
    noi_per_sf: number;
    unlevered_yield_on_cost: number;
}

export function calcReturns(
    netRevenue: number,
    totalOpex: number,
    totalBudget: number,
    totalUnits: number,
    totalNrsf: number
): ReturnsCalc {
    const noi = netRevenue - totalOpex;
    const noi_per_unit = totalUnits > 0 ? noi / totalUnits : 0;
    const noi_per_sf = totalNrsf > 0 ? noi / totalNrsf : 0;
    const unlevered_yield_on_cost = totalBudget > 0 ? noi / totalBudget : 0;

    return {
        noi,
        noi_per_unit,
        noi_per_sf,
        unlevered_yield_on_cost,
    };
}
