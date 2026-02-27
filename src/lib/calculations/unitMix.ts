/**
 * Unit Mix Calculations — PRD §4.2
 * Pure functions for per-row and aggregate unit mix calcs.
 */

import type { UnitMixRow } from '@/types';

export interface UnitMixRowCalc {
    total_sf: number;
    effective_monthly_rent: number;
    effective_rent_per_sf: number;
    annual_rental_revenue: number;
}

export interface UnitMixAggregates {
    total_units: number;
    total_nrsf: number;
    total_gbsf: number;
    weighted_avg_unit_sf: number;
    weighted_avg_rent_per_sf: number;
    gross_potential_rent: number;
}

/** Calculate derived values for a single unit mix row */
export function calcUnitMixRow(row: UnitMixRow): UnitMixRowCalc {
    const total_sf = row.unit_count * row.avg_unit_sf;

    const effective_monthly_rent =
        row.rent_input_mode === 'per_sf'
            ? row.rent_per_sf * row.avg_unit_sf
            : row.rent_whole_dollar;

    const effective_rent_per_sf =
        row.avg_unit_sf > 0 ? effective_monthly_rent / row.avg_unit_sf : 0;

    const annual_rental_revenue = row.unit_count * effective_monthly_rent * 12;

    return {
        total_sf,
        effective_monthly_rent,
        effective_rent_per_sf,
        annual_rental_revenue,
    };
}

/** Calculate aggregate unit mix metrics across all rows */
export function calcUnitMixAggregates(
    rows: UnitMixRow[],
    efficiencyRatio: number
): UnitMixAggregates {
    const activeRows = rows.filter((r) => r.unit_count > 0);

    const total_units = activeRows.reduce((sum, r) => sum + r.unit_count, 0);

    const rowCalcs = activeRows.map((r) => ({
        row: r,
        calc: calcUnitMixRow(r),
    }));

    const total_nrsf = rowCalcs.reduce((sum, { calc }) => sum + calc.total_sf, 0);
    const total_gbsf = efficiencyRatio > 0 ? total_nrsf / efficiencyRatio : 0;

    const weighted_avg_unit_sf = total_units > 0 ? total_nrsf / total_units : 0;

    const gross_potential_rent = rowCalcs.reduce(
        (sum, { calc }) => sum + calc.annual_rental_revenue,
        0
    );

    const weighted_avg_rent_per_sf =
        total_nrsf > 0 ? gross_potential_rent / total_nrsf / 12 : 0;

    return {
        total_units,
        total_nrsf,
        total_gbsf,
        weighted_avg_unit_sf,
        weighted_avg_rent_per_sf,
        gross_potential_rent,
    };
}
