/**
 * Hellodata Calculation Utilities
 * 
 * Implements Hellodata's recommended calculation methods for deriving
 * metrics from raw unit data. These match the HelloData platform's outputs.
 * 
 * Key rules from Hellodata docs:
 * 1. Filter floorplans when actual units exist
 * 2. Handle null values with fallbacks (min_price, min_effective_price, min_sqft)
 * 3. PSF is WEIGHTED: sum(prices) / sum(sqfts), not average(price/sqft)
 */

import type { HellodataUnit, HellodataProperty } from '@/types';

// ============================================================
// Configuration
// ============================================================

/** Cache TTL in days — how often to refresh property data from Hellodata */
export const HELLODATA_CACHE_TTL_DAYS = 7;

/** Free development property IDs (no API cost) */
export const HELLODATA_FREE_PROPERTIES = [
    { id: 'e8769b06-1334-5ab6-b9c6-6dfccbf9ea78', name: 'Reserve at Glenview', address: '195 Waukegan Road, Glenview, IL 60025' },
    { id: '20e4945a-ce78-5f2c-9053-6bdaca39044b', name: '7229-33 S Yates Blvd', address: '7229 South Yates Boulevard, Chicago, IL 60649' },
    { id: '0e628031-57b8-5394-821d-13779318fef4', name: 'OneEleven', address: '111 West Wacker Drive, Chicago, IL 60601' },
];

// ============================================================
// Unit Filtering
// ============================================================

/** Filter units: skip floorplans when actual units exist, per Hellodata docs */
export function filterValidUnits(units: HellodataUnit[]): HellodataUnit[] {
    const hasActualUnits = units.some(u => !u.is_floorplan);
    if (hasActualUnits) {
        return units.filter(u => !u.is_floorplan);
    }
    return units;
}

// ============================================================
// Rent Calculations
// ============================================================

/** Average effective rent — price after discounts/concessions */
export function getAverageEffectiveRent(units: HellodataUnit[]): number | null {
    const valid = filterValidUnits(units);
    const prices = valid
        .map(u => u.effective_price ?? u.min_effective_price)
        .filter((p): p is number => p !== null);
    if (prices.length === 0) return null;
    return prices.reduce((sum, p) => sum + p, 0) / prices.length;
}

/** Average asking rent — advertised price before discounts */
export function getAverageAskingRent(units: HellodataUnit[]): number | null {
    const valid = filterValidUnits(units);
    const prices = valid
        .map(u => u.price ?? u.min_price)
        .filter((p): p is number => p !== null);
    if (prices.length === 0) return null;
    return prices.reduce((sum, p) => sum + p, 0) / prices.length;
}

/** Average square footage */
export function getAverageSqft(units: HellodataUnit[]): number | null {
    const valid = filterValidUnits(units);
    const sqfts = valid
        .map(u => u.sqft ?? u.min_sqft)
        .filter((s): s is number => s !== null);
    if (sqfts.length === 0) return null;
    return sqfts.reduce((sum, s) => sum + s, 0) / sqfts.length;
}

// ============================================================
// PSF Calculations (Weighted)
// ============================================================

/** Average effective PSF — WEIGHTED: sum(effective_prices) / sum(sqfts) */
export function getAverageEffectivePsf(units: HellodataUnit[]): number | null {
    const valid = filterValidUnits(units);
    const pairs: { price: number; sqft: number }[] = [];
    for (const u of valid) {
        const price = u.effective_price ?? u.min_effective_price;
        const sqft = u.sqft ?? u.min_sqft;
        if (price !== null && sqft !== null && sqft > 0) {
            pairs.push({ price, sqft });
        }
    }
    if (pairs.length === 0) return null;
    const totalPrice = pairs.reduce((s, p) => s + p.price, 0);
    const totalSqft = pairs.reduce((s, p) => s + p.sqft, 0);
    return totalPrice / totalSqft;
}

/** Average asking PSF — WEIGHTED: sum(asking_prices) / sum(sqfts) */
export function getAverageAskingPsf(units: HellodataUnit[]): number | null {
    const valid = filterValidUnits(units);
    const pairs: { price: number; sqft: number }[] = [];
    for (const u of valid) {
        const price = u.price ?? u.min_price;
        const sqft = u.sqft ?? u.min_sqft;
        if (price !== null && sqft !== null && sqft > 0) {
            pairs.push({ price, sqft });
        }
    }
    if (pairs.length === 0) return null;
    const totalPrice = pairs.reduce((s, p) => s + p.price, 0);
    const totalSqft = pairs.reduce((s, p) => s + p.sqft, 0);
    return totalPrice / totalSqft;
}

// ============================================================
// Concession Calculations
// ============================================================

/** Average concession amount — diff between asking and effective rent */
export function getAverageConcession(units: HellodataUnit[]): number | null {
    const valid = filterValidUnits(units);
    const concessions: number[] = [];
    for (const u of valid) {
        const asking = u.price ?? u.min_price;
        const effective = u.effective_price ?? u.min_effective_price;
        if (asking !== null && effective !== null) {
            concessions.push(asking - effective);
        }
    }
    if (concessions.length === 0) return null;
    return concessions.reduce((s, c) => s + c, 0) / concessions.length;
}

// ============================================================
// Occupancy
// ============================================================

/** Simplified occupancy rate as a percentage */
export function getOccupancyRate(
    property: HellodataProperty,
    units: HellodataUnit[],
    asOfDate?: string
): number | null {
    if (!property.number_units || property.number_units === 0) return null;
    const dateStr = asOfDate || new Date().toISOString().split('T')[0];
    const valid = filterValidUnits(units);

    let availableUnits = 0;
    for (const unit of valid) {
        const hasActivePeriod = (unit.availability_periods || []).some(period => {
            const entered = !period.enter_market || period.enter_market <= dateStr;
            const notExited = !period.exit_market || period.exit_market >= dateStr;
            return entered && notExited;
        });
        if (hasActivePeriod) availableUnits++;
    }

    const occupied = property.number_units - availableUnits;
    return (occupied / property.number_units) * 100;
}

// ============================================================
// Unit Mix Summary
// ============================================================

export interface UnitMixSummary {
    bed: number | null;
    bath: number | null;
    unitCount: number;
    avgSqft: number | null;
    avgAskingRent: number | null;
    avgEffectiveRent: number | null;
    avgAskingPsf: number | null;
    avgEffectivePsf: number | null;
    avgDaysOnMarket: number | null;
}

/** Group units by bed/bath and compute metrics per group */
export function getUnitMixSummary(units: HellodataUnit[]): UnitMixSummary[] {
    const valid = filterValidUnits(units);
    const groups = new Map<string, HellodataUnit[]>();

    for (const u of valid) {
        const key = `${u.bed ?? 'null'}-${u.bath ?? 'null'}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(u);
    }

    const summaries: UnitMixSummary[] = [];
    for (const [, groupUnits] of groups) {
        const first = groupUnits[0];
        summaries.push({
            bed: first.bed,
            bath: first.bath,
            unitCount: groupUnits.length,
            avgSqft: avg(groupUnits.map(u => u.sqft ?? u.min_sqft)),
            avgAskingRent: avg(groupUnits.map(u => u.price ?? u.min_price)),
            avgEffectiveRent: avg(groupUnits.map(u => u.effective_price ?? u.min_effective_price)),
            avgAskingPsf: weightedPsf(groupUnits, 'asking'),
            avgEffectivePsf: weightedPsf(groupUnits, 'effective'),
            avgDaysOnMarket: avg(groupUnits.map(u => u.days_on_market)),
        });
    }

    return summaries.sort((a, b) => (a.bed ?? -1) - (b.bed ?? -1));
}

// ============================================================
// Cache Helpers
// ============================================================

/** Check if cached data needs refresh */
export function isCacheStale(fetchedAt: string | null, ttlDays: number = HELLODATA_CACHE_TTL_DAYS): boolean {
    if (!fetchedAt) return true;
    const fetchedDate = new Date(fetchedAt);
    const now = new Date();
    const diffMs = now.getTime() - fetchedDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > ttlDays;
}

/** Check if a Hellodata ID is a free development property */
export function isFreeProperty(hellodataId: string): boolean {
    return HELLODATA_FREE_PROPERTIES.some(p => p.id === hellodataId);
}

// ============================================================
// Internal helpers
// ============================================================

function avg(values: (number | null | undefined)[]): number | null {
    const valid = values.filter((v): v is number => v !== null && v !== undefined);
    if (valid.length === 0) return null;
    return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function weightedPsf(units: HellodataUnit[], type: 'asking' | 'effective'): number | null {
    const pairs: { price: number; sqft: number }[] = [];
    for (const u of units) {
        const price = type === 'effective'
            ? (u.effective_price ?? u.min_effective_price)
            : (u.price ?? u.min_price);
        const sqft = u.sqft ?? u.min_sqft;
        if (price !== null && sqft !== null && sqft > 0) {
            pairs.push({ price, sqft });
        }
    }
    if (pairs.length === 0) return null;
    return pairs.reduce((s, p) => s + p.price, 0) / pairs.reduce((s, p) => s + p.sqft, 0);
}
