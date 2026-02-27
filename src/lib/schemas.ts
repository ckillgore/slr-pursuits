import { z } from 'zod';

// --- Pursuit ---
export const pursuitSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    address: z.string().trim().default(''),
    city: z.string().trim().default(''),
    state: z.string().trim().default(''),
    county: z.string().trim().default(''),
    zip: z.string().trim().default(''),
    latitude: z.number().nullable().default(null),
    longitude: z.number().nullable().default(null),
    site_area_sf: z.number().min(0).default(0),
    stage_id: z.string().uuid(),
    region: z.string().trim().default(''),
});

export type PursuitFormValues = z.infer<typeof pursuitSchema>;

// --- One-Pager ---
export const onePagerSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    product_type_id: z.string().uuid(),
    sub_product_type_id: z.string().uuid().nullable().default(null),
    // Site & Density
    total_units: z.number().int().min(0).default(0),
    efficiency_ratio: z.number().min(0).max(1).default(0.85),
    // Revenue
    other_income_per_unit_month: z.number().min(0).default(0),
    vacancy_rate: z.number().min(0).max(1).default(0.07),
    // Budget
    hard_cost_per_nrsf: z.number().min(0).default(0),
    land_cost: z.number().min(0).default(0),
    soft_cost_pct: z.number().min(0).max(1).default(0.30),
    use_detailed_soft_costs: z.boolean().default(false),
    // OpEx
    opex_utilities: z.number().min(0).default(0),
    opex_repairs_maintenance: z.number().min(0).default(0),
    opex_contract_services: z.number().min(0).default(0),
    opex_marketing: z.number().min(0).default(0),
    opex_general_admin: z.number().min(0).default(0),
    opex_turnover: z.number().min(0).default(0),
    opex_misc: z.number().min(0).default(0),
    opex_insurance: z.number().min(0).default(0),
    mgmt_fee_pct: z.number().min(0).max(1).default(0.03),
    // Payroll
    payroll_burden_pct: z.number().min(0).max(1).default(0.30),
    // Property Tax
    tax_mil_rate: z.number().min(0).default(0),
    tax_assessed_pct_hard: z.number().min(0).max(1).default(1),
    tax_assessed_pct_land: z.number().min(0).max(1).default(1),
    tax_assessed_pct_soft: z.number().min(0).max(1).default(1),
});

export type OnePagerFormValues = z.infer<typeof onePagerSchema>;

// --- Unit Mix Row ---
export const unitMixRowSchema = z.object({
    unit_type: z.enum([
        'studio', 'one_bed', 'two_bed', 'three_bed',
        'penthouse', 'townhome', 'other',
    ]),
    unit_type_label: z.string().trim(),
    unit_count: z.number().int().min(0).default(0),
    avg_unit_sf: z.number().min(0).default(0),
    rent_input_mode: z.enum(['per_sf', 'whole_dollar']).default('per_sf'),
    rent_per_sf: z.number().min(0).default(0),
    rent_whole_dollar: z.number().min(0).default(0),
    sort_order: z.number().int().default(0),
});

// --- Payroll Row ---
export const payrollRowSchema = z.object({
    line_type: z.enum(['employee', 'contract']),
    role_name: z.string().trim().min(1, 'Role name is required'),
    headcount: z.number().min(0).default(0),
    base_compensation: z.number().min(0).default(0),
    bonus_pct: z.number().min(0).max(1).default(0),
    fixed_amount: z.number().min(0).default(0),
    sort_order: z.number().int().default(0),
});

// --- Soft Cost Detail ---
export const softCostDetailSchema = z.object({
    line_item_name: z.string().trim().min(1, 'Name is required'),
    amount: z.number().min(0).default(0),
    sort_order: z.number().int().default(0),
});

// --- Product Type ---
export const productTypeSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    density_low: z.number().min(0),
    density_high: z.number().min(0),
    sort_order: z.number().int().default(0),
    is_active: z.boolean().default(true),
});

// --- Sub-Product Type ---
export const subProductTypeSchema = z.object({
    product_type_id: z.string().uuid(),
    name: z.string().trim().min(1, 'Name is required'),
    sort_order: z.number().int().default(0),
    is_active: z.boolean().default(true),
});

// --- Pursuit Stage ---
export const pursuitStageSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    sort_order: z.number().int(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color'),
    is_active: z.boolean().default(true),
});
