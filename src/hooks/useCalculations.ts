'use client';

import { useMemo } from 'react';
import { calculateAll, type CalculateAllInput } from '@/lib/calculations';
import type { OnePager, UnitMixRow, PayrollRow, SoftCostDetailRow, CalculationResults } from '@/types';

interface UseCalculationsInput {
    onePager: OnePager | null;
    unitMix: UnitMixRow[];
    payroll: PayrollRow[];
    softCostDetails: SoftCostDetailRow[];
    siteAreaSf: number;
    productTypeDensityLow?: number;
    productTypeDensityHigh?: number;
}

const EMPTY_RESULTS: CalculationResults = {
    site_area_acres: 0,
    density_units_per_acre: 0,
    recommended_units_low: 0,
    recommended_units_high: 0,
    total_nrsf: 0,
    total_gbsf: 0,
    weighted_avg_unit_sf: 0,
    gross_potential_rent: 0,
    other_income: 0,
    gross_potential_revenue: 0,
    vacancy_loss: 0,
    net_revenue: 0,
    weighted_avg_rent_per_sf: 0,
    hard_cost: 0,
    hard_cost_per_gbsf: 0,
    soft_cost: 0,
    total_budget: 0,
    cost_per_unit: 0,
    cost_per_nrsf: 0,
    cost_per_gbsf: 0,
    land_cost_per_unit: 0,
    land_cost_per_sf: 0,
    opex_categories_total: 0,
    payroll_total: 0,
    mgmt_fee_total: 0,
    property_tax_total: 0,
    total_opex: 0,
    opex_per_unit: 0,
    opex_ratio: 0,
    assessed_value: 0,
    property_tax_per_unit: 0,
    noi: 0,
    noi_per_unit: 0,
    noi_per_sf: 0,
    unlevered_yield_on_cost: 0,
};

export function useCalculations(input: UseCalculationsInput): CalculationResults {
    return useMemo(() => {
        if (!input.onePager) return EMPTY_RESULTS;

        const calcInput: CalculateAllInput = {
            onePager: input.onePager,
            unitMix: input.unitMix,
            payroll: input.payroll,
            softCostDetails: input.softCostDetails,
            siteAreaSf: input.siteAreaSf,
            productTypeDensityLow: input.productTypeDensityLow,
            productTypeDensityHigh: input.productTypeDensityHigh,
        };

        return calculateAll(calcInput);
    }, [
        input.onePager,
        input.unitMix,
        input.payroll,
        input.softCostDetails,
        input.siteAreaSf,
        input.productTypeDensityLow,
        input.productTypeDensityHigh,
    ]);
}
