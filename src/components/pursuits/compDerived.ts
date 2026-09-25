import type { LandComp, SaleComp, SaleTransaction } from '@/types';

// ============================================================
// Display-time derivations for land / sale comps.
//
// Users often enter a sale price and an area but leave $/SF or $/unit blank.
// These helpers fill the gap for DISPLAY only (nothing is written back), and
// report whether the value was derived so the UI can label it as calculated.
// ============================================================

export interface DerivedValue {
    value: number | null;
    /** true when `value` was computed rather than entered */
    derived: boolean;
}

const positive = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function pick(stored: number | null | undefined, numerator: number | null | undefined, denominator: number | null | undefined): DerivedValue {
    if (positive(stored)) return { value: stored, derived: false };
    if (positive(numerator) && positive(denominator)) return { value: numerator / denominator, derived: true };
    return { value: null, derived: false };
}

/** Land $/SF of site area */
export function landPricePerSf(c: Pick<LandComp, 'sale_price' | 'sale_price_psf' | 'site_area_sf'>): DerivedValue {
    return pick(c.sale_price_psf, c.sale_price, c.site_area_sf);
}

/** Sale-transaction $/unit, falling back to sale price ÷ the property's total units */
export function salePricePerUnit(tx: Pick<SaleTransaction, 'sale_price' | 'price_per_unit'>, comp: Pick<SaleComp, 'total_units'>): DerivedValue {
    return pick(tx.price_per_unit, tx.sale_price, comp.total_units);
}

/** Sale-transaction $/SF, falling back to sale price ÷ the property's total building SF */
export function salePricePerSf(tx: Pick<SaleTransaction, 'sale_price' | 'price_per_sf'>, comp: Pick<SaleComp, 'total_sf'>): DerivedValue {
    return pick(tx.price_per_sf, tx.sale_price, comp.total_sf);
}
