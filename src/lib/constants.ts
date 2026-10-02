import type { UnitType } from '@/types';

// --- Unit Type Display Labels ---
export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
    studio: 'Studio',
    one_bed: '1 BR',
    two_bed: '2 BR',
    three_bed: '3 BR',
    penthouse: 'PH',
    townhome: 'TH',
    other: 'Other',
};

export const UNIT_TYPES: UnitType[] = [
    'studio',
    'one_bed',
    'two_bed',
    'three_bed',
    'penthouse',
    'townhome',
    'other',
];

// --- Default Sensitivity Steps ---
export const DEFAULT_RENT_STEPS = [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15];
export const DEFAULT_HARD_COST_STEPS = [-15, -10, -5, 0, 5, 10, 15];
export const DEFAULT_LAND_COST_STEPS = [-2_000_000, -1_000_000, -500_000, 0, 500_000, 1_000_000, 2_000_000];

// --- Fallback Assumptions ---
// Used when a one-pager is created without a data model template, and as the
// starting values for a new template. Medians of SLR one-pagers as of Oct 2026;
// product-specific standards live in the data model templates.
export const DEFAULT_ASSUMPTIONS = {
    efficiency_ratio: 0.85,
    vacancy_rate: 0.05,
    soft_cost_pct: 0.177,
    /** Carry as a share of hard + soft + land */
    carry_cost_pct: 0.04,
    mgmt_fee_pct: 0.0225,
    payroll_burden_pct: 0.28,
    tax_assessed_pct_hard: 0.90,
    tax_assessed_pct_land: 1,
    tax_assessed_pct_soft: 0,
} as const;

// --- Formatting Helpers ---
// Divide-by-zero / missing inputs upstream produce NaN or Infinity; render a dash
// instead of "$NaN" / "NaN%" / "$∞".
const NON_FINITE = '—';

export const formatCurrency = (value: number, decimals = 0): string => {
    if (!Number.isFinite(value)) return NON_FINITE;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
};

export const formatPercent = (value: number, decimals = 2): string => {
    if (!Number.isFinite(value)) return NON_FINITE;
    return `${(value * 100).toFixed(decimals)}%`;
};

export const formatNumber = (value: number, decimals = 0): string => {
    if (!Number.isFinite(value)) return NON_FINITE;
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
};

export const formatCurrencyCompact = (value: number): string => {
    if (!Number.isFinite(value)) return NON_FINITE;
    // Sign goes before the "$" ("-$1.5M", not "$-1.5M")
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    // 999,600 would otherwise render as "$1000K"
    if (abs >= 999_500) {
        return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    }
    if (abs >= 1_000) {
        return `${sign}$${(abs / 1_000).toFixed(0)}K`;
    }
    return formatCurrency(value);
};

// --- Conversion Constants ---
export const SF_PER_ACRE = 43_560;

// --- Auto-save ---
export const AUTO_SAVE_DEBOUNCE_MS = 300;
