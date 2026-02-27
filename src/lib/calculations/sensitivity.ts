/**
 * Sensitivity Analysis — PRD §4.8
 * (Phase 3 feature, but engine included here for completeness)
 */

import { calcRevenue } from './revenue';
import { calcBudget } from './budget';
import { calcOpEx } from './opex';
import { calcPropertyTax } from './propertyTax';
import { calcReturns } from './returns';
import type { OnePager, UnitMixRow, PayrollRow, SoftCostDetailRow } from '@/types';
import { calcUnitMixAggregates } from './unitMix';

export interface SensitivityRow {
    step: number;
    adjustedValue: number;
    totalBudget: number;
    gpr: number;
    noi: number;
    yoc: number;
}

export interface SensitivityMatrix {
    rentSteps: number[];
    hardCostSteps: number[];
    /** matrix[rentIdx][hcIdx] = yoc */
    values: number[][];
    baseRentIdx: number;
    baseHcIdx: number;
}

/** Rent sensitivity: vary weighted avg rent PSF by step deltas */
export function calcRentSensitivity(
    onePager: OnePager,
    unitMix: UnitMixRow[],
    payroll: PayrollRow[],
    softCostDetails: SoftCostDetailRow[],
    rentSteps: number[]
): SensitivityRow[] {
    const agg = calcUnitMixAggregates(unitMix, onePager.efficiency_ratio);
    const baseRentPsf = agg.weighted_avg_rent_per_sf;

    return rentSteps.map((step) => {
        const adjustedRentPsf = baseRentPsf + step;
        // Scale GPR proportionally
        const scaleFactor = baseRentPsf > 0 ? adjustedRentPsf / baseRentPsf : 1;
        const adjustedGpr = agg.gross_potential_rent * scaleFactor;

        const rev = calcRevenue(
            adjustedGpr,
            onePager.other_income_per_unit_month,
            agg.total_units,
            onePager.vacancy_rate
        );

        const bud = calcBudget(
            onePager.hard_cost_per_nrsf,
            agg.total_nrsf,
            agg.total_gbsf,
            onePager.land_cost,
            onePager.soft_cost_pct,
            onePager.use_detailed_soft_costs,
            softCostDetails,
            agg.total_units,
            0 // site area not needed for sensitivity
        );

        const tax = calcPropertyTax(
            bud.hard_cost,
            onePager.land_cost,
            bud.soft_cost,
            onePager.tax_assessed_pct_hard,
            onePager.tax_assessed_pct_land,
            onePager.tax_assessed_pct_soft,
            onePager.tax_mil_rate,
            agg.total_units
        );

        const opex = calcOpEx(
            onePager,
            agg.total_units,
            rev.net_revenue,
            payroll,
            tax.property_tax
        );

        const ret = calcReturns(
            rev.net_revenue,
            opex.total_opex,
            bud.total_budget,
            agg.total_units,
            agg.total_nrsf
        );

        return {
            step,
            adjustedValue: adjustedRentPsf,
            totalBudget: bud.total_budget,
            gpr: adjustedGpr,
            noi: ret.noi,
            yoc: ret.unlevered_yield_on_cost,
        };
    });
}

/** Hard cost sensitivity: vary HC/NRSF by step deltas */
export function calcHardCostSensitivity(
    onePager: OnePager,
    unitMix: UnitMixRow[],
    payroll: PayrollRow[],
    softCostDetails: SoftCostDetailRow[],
    hardCostSteps: number[]
): SensitivityRow[] {
    const agg = calcUnitMixAggregates(unitMix, onePager.efficiency_ratio);

    const rev = calcRevenue(
        agg.gross_potential_rent,
        onePager.other_income_per_unit_month,
        agg.total_units,
        onePager.vacancy_rate
    );

    return hardCostSteps.map((step) => {
        const adjustedHcPerNrsf = onePager.hard_cost_per_nrsf + step;

        const bud = calcBudget(
            adjustedHcPerNrsf,
            agg.total_nrsf,
            agg.total_gbsf,
            onePager.land_cost,
            onePager.soft_cost_pct,
            onePager.use_detailed_soft_costs,
            softCostDetails,
            agg.total_units,
            0
        );

        const tax = calcPropertyTax(
            bud.hard_cost,
            onePager.land_cost,
            bud.soft_cost,
            onePager.tax_assessed_pct_hard,
            onePager.tax_assessed_pct_land,
            onePager.tax_assessed_pct_soft,
            onePager.tax_mil_rate,
            agg.total_units
        );

        const opex = calcOpEx(
            onePager,
            agg.total_units,
            rev.net_revenue,
            payroll,
            tax.property_tax
        );

        const ret = calcReturns(
            rev.net_revenue,
            opex.total_opex,
            bud.total_budget,
            agg.total_units,
            agg.total_nrsf
        );

        return {
            step,
            adjustedValue: adjustedHcPerNrsf,
            totalBudget: bud.total_budget,
            gpr: agg.gross_potential_rent,
            noi: ret.noi,
            yoc: ret.unlevered_yield_on_cost,
        };
    });
}

/** Land cost sensitivity: vary land cost by step deltas (absolute $) */
export function calcLandCostSensitivity(
    onePager: OnePager,
    unitMix: UnitMixRow[],
    payroll: PayrollRow[],
    softCostDetails: SoftCostDetailRow[],
    landCostSteps: number[]
): SensitivityRow[] {
    const agg = calcUnitMixAggregates(unitMix, onePager.efficiency_ratio);

    const rev = calcRevenue(
        agg.gross_potential_rent,
        onePager.other_income_per_unit_month,
        agg.total_units,
        onePager.vacancy_rate
    );

    return landCostSteps.map((step) => {
        const adjustedLandCost = onePager.land_cost + step;

        const bud = calcBudget(
            onePager.hard_cost_per_nrsf,
            agg.total_nrsf,
            agg.total_gbsf,
            adjustedLandCost,
            onePager.soft_cost_pct,
            onePager.use_detailed_soft_costs,
            softCostDetails,
            agg.total_units,
            0
        );

        const tax = calcPropertyTax(
            bud.hard_cost,
            adjustedLandCost,
            bud.soft_cost,
            onePager.tax_assessed_pct_hard,
            onePager.tax_assessed_pct_land,
            onePager.tax_assessed_pct_soft,
            onePager.tax_mil_rate,
            agg.total_units
        );

        const opex = calcOpEx(
            onePager,
            agg.total_units,
            rev.net_revenue,
            payroll,
            tax.property_tax
        );

        const ret = calcReturns(
            rev.net_revenue,
            opex.total_opex,
            bud.total_budget,
            agg.total_units,
            agg.total_nrsf
        );

        return {
            step,
            adjustedValue: adjustedLandCost,
            totalBudget: bud.total_budget,
            gpr: agg.gross_potential_rent,
            noi: ret.noi,
            yoc: ret.unlevered_yield_on_cost,
        };
    });
}

/** 2D matrix: rent PSF vs hard cost for YOC */
export function calcSensitivityMatrix(
    onePager: OnePager,
    unitMix: UnitMixRow[],
    payroll: PayrollRow[],
    softCostDetails: SoftCostDetailRow[],
    rentSteps: number[],
    hardCostSteps: number[]
): SensitivityMatrix {
    const agg = calcUnitMixAggregates(unitMix, onePager.efficiency_ratio);
    const baseRentPsf = agg.weighted_avg_rent_per_sf;

    const baseRentIdx = rentSteps.indexOf(0);
    const baseHcIdx = hardCostSteps.indexOf(0);

    const values = rentSteps.map((rentStep) => {
        const adjustedRentPsf = baseRentPsf + rentStep;
        const scaleFactor = baseRentPsf > 0 ? adjustedRentPsf / baseRentPsf : 1;
        const adjustedGpr = agg.gross_potential_rent * scaleFactor;

        const rev = calcRevenue(
            adjustedGpr,
            onePager.other_income_per_unit_month,
            agg.total_units,
            onePager.vacancy_rate
        );

        return hardCostSteps.map((hcStep) => {
            const adjustedHcPerNrsf = onePager.hard_cost_per_nrsf + hcStep;

            const bud = calcBudget(
                adjustedHcPerNrsf,
                agg.total_nrsf,
                agg.total_gbsf,
                onePager.land_cost,
                onePager.soft_cost_pct,
                onePager.use_detailed_soft_costs,
                softCostDetails,
                agg.total_units,
                0
            );

            const tax = calcPropertyTax(
                bud.hard_cost,
                onePager.land_cost,
                bud.soft_cost,
                onePager.tax_assessed_pct_hard,
                onePager.tax_assessed_pct_land,
                onePager.tax_assessed_pct_soft,
                onePager.tax_mil_rate,
                agg.total_units
            );

            const opex = calcOpEx(
                onePager,
                agg.total_units,
                rev.net_revenue,
                payroll,
                tax.property_tax
            );

            const ret = calcReturns(
                rev.net_revenue,
                opex.total_opex,
                bud.total_budget,
                agg.total_units,
                agg.total_nrsf
            );

            return ret.unlevered_yield_on_cost;
        });
    });

    return {
        rentSteps,
        hardCostSteps,
        values,
        baseRentIdx: baseRentIdx >= 0 ? baseRentIdx : Math.floor(rentSteps.length / 2),
        baseHcIdx: baseHcIdx >= 0 ? baseHcIdx : Math.floor(hardCostSteps.length / 2),
    };
}
