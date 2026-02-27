/**
 * Unified Calculation Engine — PRD §4
 * Chains all calculation modules into a single `calculateAll()` call.
 */

import type { OnePager, UnitMixRow, PayrollRow, SoftCostDetailRow, CalculationResults } from '@/types';
import { calcUnitMixAggregates } from './unitMix';
import { calcRevenue } from './revenue';
import { calcBudget } from './budget';
import { calcOpEx } from './opex';
import { calcPropertyTax } from './propertyTax';
import { calcReturns } from './returns';
import { SF_PER_ACRE } from '../constants';

export { calcUnitMixRow, calcUnitMixAggregates } from './unitMix';
export { calcRevenue } from './revenue';
export { calcBudget } from './budget';
export { calcOpEx, calcPayrollRowTotal } from './opex';
export { calcPropertyTax } from './propertyTax';
export { calcReturns } from './returns';
export {
    calcRentSensitivity,
    calcHardCostSensitivity,
    calcSensitivityMatrix,
} from './sensitivity';

export interface CalculateAllInput {
    onePager: OnePager;
    unitMix: UnitMixRow[];
    payroll: PayrollRow[];
    softCostDetails: SoftCostDetailRow[];
    siteAreaSf: number;
    productTypeDensityLow?: number;
    productTypeDensityHigh?: number;
}

export function calculateAll(input: CalculateAllInput): CalculationResults {
    const { onePager, unitMix, payroll, softCostDetails, siteAreaSf } = input;

    // Site & Density
    const site_area_acres = siteAreaSf / SF_PER_ACRE;
    const density_low = input.productTypeDensityLow ?? 0;
    const density_high = input.productTypeDensityHigh ?? 0;
    const recommended_units_low = site_area_acres * density_low;
    const recommended_units_high = site_area_acres * density_high;

    // Unit Mix
    const unitMixAgg = calcUnitMixAggregates(unitMix, onePager.efficiency_ratio);
    const density_units_per_acre =
        site_area_acres > 0 ? unitMixAgg.total_units / site_area_acres : 0;

    // Revenue
    const rev = calcRevenue(
        unitMixAgg.gross_potential_rent,
        onePager.other_income_per_unit_month,
        unitMixAgg.total_units,
        onePager.vacancy_rate
    );

    // Budget
    const bud = calcBudget(
        onePager.hard_cost_per_nrsf,
        unitMixAgg.total_nrsf,
        unitMixAgg.total_gbsf,
        onePager.land_cost,
        onePager.soft_cost_pct,
        onePager.use_detailed_soft_costs,
        softCostDetails,
        unitMixAgg.total_units,
        siteAreaSf
    );

    // Property Tax (needed before OpEx)
    const tax = calcPropertyTax(
        bud.hard_cost,
        onePager.land_cost,
        bud.soft_cost,
        onePager.tax_assessed_pct_hard,
        onePager.tax_assessed_pct_land,
        onePager.tax_assessed_pct_soft,
        onePager.tax_mil_rate,
        unitMixAgg.total_units
    );

    // OpEx
    const opex = calcOpEx(
        onePager,
        unitMixAgg.total_units,
        rev.net_revenue,
        payroll,
        tax.property_tax
    );

    // Returns
    const ret = calcReturns(
        rev.net_revenue,
        opex.total_opex,
        bud.total_budget,
        unitMixAgg.total_units,
        unitMixAgg.total_nrsf
    );

    return {
        // Site & Density
        site_area_acres,
        density_units_per_acre,
        recommended_units_low,
        recommended_units_high,
        total_nrsf: unitMixAgg.total_nrsf,
        total_gbsf: unitMixAgg.total_gbsf,
        weighted_avg_unit_sf: unitMixAgg.weighted_avg_unit_sf,
        // Revenue
        gross_potential_rent: unitMixAgg.gross_potential_rent,
        other_income: rev.other_income,
        gross_potential_revenue: rev.gross_potential_revenue,
        vacancy_loss: rev.vacancy_loss,
        net_revenue: rev.net_revenue,
        weighted_avg_rent_per_sf: unitMixAgg.weighted_avg_rent_per_sf,
        // Budget
        hard_cost: bud.hard_cost,
        hard_cost_per_gbsf: bud.hard_cost_per_gbsf,
        soft_cost: bud.soft_cost,
        total_budget: bud.total_budget,
        cost_per_unit: bud.cost_per_unit,
        cost_per_nrsf: bud.cost_per_nrsf,
        cost_per_gbsf: bud.cost_per_gbsf,
        land_cost_per_unit: bud.land_cost_per_unit,
        land_cost_per_sf: bud.land_cost_per_sf,
        // OpEx
        opex_categories_total: opex.opex_categories_total,
        payroll_total: opex.payroll_total,
        mgmt_fee_total: opex.mgmt_fee_total,
        property_tax_total: tax.property_tax,
        total_opex: opex.total_opex,
        opex_per_unit: opex.opex_per_unit,
        opex_ratio: opex.opex_ratio,
        // Property Tax detail
        assessed_value: tax.assessed_value,
        property_tax_per_unit: tax.property_tax_per_unit,
        // Returns
        noi: ret.noi,
        noi_per_unit: ret.noi_per_unit,
        noi_per_sf: ret.noi_per_sf,
        unlevered_yield_on_cost: ret.unlevered_yield_on_cost,
    };
}
