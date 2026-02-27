/**
 * Operating Expense Calculations — PRD §4.5
 */

import type { OnePager, PayrollRow } from '@/types';

export interface OpExCalc {
    utilities_total: number;
    repairs_maint_total: number;
    contract_services_total: number;
    marketing_total: number;
    general_admin_total: number;
    turnover_total: number;
    misc_total: number;
    insurance_total: number;
    opex_categories_total: number;
    payroll_total: number;
    mgmt_fee_total: number;
    total_opex: number; // Excludes property tax — added separately
    opex_per_unit: number;
    opex_ratio: number;
}

/** Calculate total burdened compensation for a single payroll row */
export function calcPayrollRowTotal(
    row: PayrollRow,
    payrollBurdenPct: number
): number {
    if (row.line_type === 'contract') {
        return row.fixed_amount;
    }
    // employee: headcount × base × (1 + bonus%) × (1 + burden%)
    return (
        row.headcount *
        row.base_compensation *
        (1 + row.bonus_pct) *
        (1 + payrollBurdenPct)
    );
}

/** Calculate all operating expenses */
export function calcOpEx(
    onePager: Pick<
        OnePager,
        | 'opex_utilities'
        | 'opex_repairs_maintenance'
        | 'opex_contract_services'
        | 'opex_marketing'
        | 'opex_general_admin'
        | 'opex_turnover'
        | 'opex_misc'
        | 'opex_insurance'
        | 'mgmt_fee_pct'
        | 'payroll_burden_pct'
    >,
    totalUnits: number,
    netRevenue: number,
    payrollRows: PayrollRow[],
    propertyTaxTotal: number
): OpExCalc {
    const utilities_total = onePager.opex_utilities * totalUnits;
    const repairs_maint_total = onePager.opex_repairs_maintenance * totalUnits;
    const contract_services_total = onePager.opex_contract_services * totalUnits;
    const marketing_total = onePager.opex_marketing * totalUnits;
    const general_admin_total = onePager.opex_general_admin * totalUnits;
    const turnover_total = onePager.opex_turnover * totalUnits;
    const misc_total = onePager.opex_misc * totalUnits;
    const insurance_total = onePager.opex_insurance * totalUnits;

    const opex_categories_total =
        utilities_total +
        repairs_maint_total +
        contract_services_total +
        marketing_total +
        general_admin_total +
        turnover_total +
        misc_total +
        insurance_total;

    const payroll_total = payrollRows.reduce(
        (sum, r) => sum + calcPayrollRowTotal(r, onePager.payroll_burden_pct),
        0
    );

    const mgmt_fee_total = onePager.mgmt_fee_pct * netRevenue;

    const total_opex =
        opex_categories_total + payroll_total + mgmt_fee_total + propertyTaxTotal;

    const opex_per_unit = totalUnits > 0 ? total_opex / totalUnits : 0;
    const opex_ratio = netRevenue > 0 ? total_opex / netRevenue : 0;

    return {
        utilities_total,
        repairs_maint_total,
        contract_services_total,
        marketing_total,
        general_admin_total,
        turnover_total,
        misc_total,
        insurance_total,
        opex_categories_total,
        payroll_total,
        mgmt_fee_total,
        total_opex,
        opex_per_unit,
        opex_ratio,
    };
}
