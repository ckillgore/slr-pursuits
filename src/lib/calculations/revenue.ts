/**
 * Revenue Calculations — PRD §4.3
 */

export interface RevenueCalc {
    gross_potential_rent: number;
    other_income: number;
    gross_potential_revenue: number;
    vacancy_loss: number;
    net_revenue: number;
}

export function calcRevenue(
    grossPotentialRent: number,
    otherIncomePerUnitMonth: number,
    totalUnits: number,
    vacancyRate: number
): RevenueCalc {
    const other_income = otherIncomePerUnitMonth * totalUnits * 12;
    const gross_potential_revenue = grossPotentialRent + other_income;
    const vacancy_loss = gross_potential_revenue * vacancyRate;
    const net_revenue = gross_potential_revenue - vacancy_loss;

    return {
        gross_potential_rent: grossPotentialRent,
        other_income,
        gross_potential_revenue,
        vacancy_loss,
        net_revenue,
    };
}
