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

// --- Formatting Helpers ---
export const formatCurrency = (value: number, decimals = 0): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
};

export const formatPercent = (value: number, decimals = 2): string => {
    return `${(value * 100).toFixed(decimals)}%`;
};

export const formatNumber = (value: number, decimals = 0): string => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
};

export const formatCurrencyCompact = (value: number): string => {
    if (Math.abs(value) >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
        return `$${(value / 1_000).toFixed(0)}K`;
    }
    return formatCurrency(value);
};

// --- Conversion Constants ---
export const SF_PER_ACRE = 43_560;

// --- Auto-save ---
export const AUTO_SAVE_DEBOUNCE_MS = 300;
