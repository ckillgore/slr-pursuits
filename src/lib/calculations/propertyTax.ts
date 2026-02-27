/**
 * Property Tax Calculations — PRD §4.6
 */

export interface PropertyTaxCalc {
    assessed_value_hard: number;
    assessed_value_land: number;
    assessed_value_soft: number;
    assessed_value: number;
    property_tax: number;
    property_tax_per_unit: number;
}

export function calcPropertyTax(
    hardCost: number,
    landCost: number,
    softCost: number,
    taxAssessedPctHard: number,
    taxAssessedPctLand: number,
    taxAssessedPctSoft: number,
    taxMilRate: number,
    totalUnits: number
): PropertyTaxCalc {
    const assessed_value_hard = taxAssessedPctHard * hardCost;
    const assessed_value_land = taxAssessedPctLand * landCost;
    const assessed_value_soft = taxAssessedPctSoft * softCost;
    const assessed_value =
        assessed_value_hard + assessed_value_land + assessed_value_soft;

    const property_tax = (assessed_value * taxMilRate) / 1000;
    const property_tax_per_unit =
        totalUnits > 0 ? property_tax / totalUnits : 0;

    return {
        assessed_value_hard,
        assessed_value_land,
        assessed_value_soft,
        assessed_value,
        property_tax,
        property_tax_per_unit,
    };
}
