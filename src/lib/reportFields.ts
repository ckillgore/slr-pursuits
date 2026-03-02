/**
 * Report Field Registry — defines all available fields for the Reports feature.
 * Each field has metadata for display, formatting, grouping, and filtering.
 */
import type { Pursuit, OnePager, PursuitStage, ReportFieldKey, ReportDataSource } from '@/types';
import type { ReportRow, KeyDateReportRow } from '@/lib/supabase/queries';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/constants';

export type FieldType = 'text' | 'number' | 'currency' | 'percent' | 'date';

export interface ReportFieldDef {
    key: ReportFieldKey;
    label: string;
    category: 'Pursuit' | 'One-Pager' | 'Returns' | 'Budget' | 'Revenue' | 'OpEx' | 'Assumptions' | 'Land Comp' | 'Key Date' | 'Rent Comp';
    type: FieldType;
    getValue: (row: ReportRow, stages?: PursuitStage[]) => string | number | null;
    format: (value: string | number | null) => string;
    groupable: boolean;
    filterable: boolean;
    /** Override aggregation: 'sum' (default for number/currency), 'avg' (default for percent), or 'none' */
    aggregation?: 'sum' | 'avg' | 'none';
    // For key date fields, we use a separate accessor
    getKeyDateValue?: (row: KeyDateReportRow, stages?: PursuitStage[]) => string | number | null;
}

const SF_PER_ACRE = 43_560;

function fmtCurrency(v: string | number | null): string {
    if (v === null || v === '' || v === undefined) return '—';
    return formatCurrency(Number(v));
}

function fmtNumber(v: string | number | null): string {
    if (v === null || v === '' || v === undefined) return '—';
    return formatNumber(Number(v));
}

function fmtPercent(v: string | number | null): string {
    if (v === null || v === '' || v === undefined) return '—';
    return formatPercent(Number(v));
}

function fmtText(v: string | number | null): string {
    if (v === null || v === '' || v === undefined) return '—';
    return String(v);
}

function fmtDate(v: string | number | null): string {
    if (v === null || v === '' || v === undefined) return '—';
    return new Date(String(v)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const REPORT_FIELDS: ReportFieldDef[] = [
    // ── Pursuit fields ────────────────────────────────
    { key: 'pursuit_name', label: 'Pursuit Name', category: 'Pursuit', type: 'text', groupable: false, filterable: true, getValue: (r) => r.pursuit.name, format: fmtText },
    { key: 'address', label: 'Address', category: 'Pursuit', type: 'text', groupable: false, filterable: true, getValue: (r) => r.pursuit.address, format: fmtText },
    { key: 'city', label: 'City', category: 'Pursuit', type: 'text', groupable: true, filterable: true, getValue: (r) => r.pursuit.city, format: fmtText },
    { key: 'state', label: 'State', category: 'Pursuit', type: 'text', groupable: true, filterable: true, getValue: (r) => r.pursuit.state, format: fmtText },
    { key: 'county', label: 'County', category: 'Pursuit', type: 'text', groupable: true, filterable: true, getValue: (r) => r.pursuit.county, format: fmtText },
    { key: 'zip', label: 'Zip', category: 'Pursuit', type: 'text', groupable: true, filterable: true, getValue: (r) => r.pursuit.zip, format: fmtText },
    { key: 'region', label: 'Region', category: 'Pursuit', type: 'text', groupable: true, filterable: true, getValue: (r) => r.pursuit.region, format: fmtText },
    {
        key: 'stage', label: 'Stage', category: 'Pursuit', type: 'text', groupable: true, filterable: true, getValue: (r, stages) => {
            const s = r.pursuit.stage ?? stages?.find(s => s.id === r.pursuit.stage_id);
            return s?.name ?? '—';
        }, format: fmtText
    },
    { key: 'site_area_sf', label: 'Site Area (SF)', category: 'Pursuit', type: 'number', groupable: false, filterable: true, getValue: (r) => r.pursuit.site_area_sf, format: fmtNumber },
    { key: 'site_area_acres', label: 'Site Area (Ac)', category: 'Pursuit', type: 'number', groupable: false, filterable: true, getValue: (r) => r.pursuit.site_area_sf > 0 ? r.pursuit.site_area_sf / SF_PER_ACRE : null, format: (v) => v !== null ? formatNumber(Number(v), 2) : '—' },
    { key: 'pursuit_created_at', label: 'Date Created', category: 'Pursuit', type: 'date', groupable: false, filterable: true, getValue: (r) => r.pursuit.created_at, format: fmtDate },
    { key: 'pursuit_updated_at', label: 'Last Updated', category: 'Pursuit', type: 'date', groupable: false, filterable: true, getValue: (r) => r.pursuit.updated_at, format: fmtDate },

    // ── One-Pager identity ────────────────────────────
    { key: 'one_pager_name', label: 'Scenario Name', category: 'One-Pager', type: 'text', groupable: false, filterable: true, getValue: (r) => r.onePager?.name ?? null, format: fmtText },
    { key: 'product_type', label: 'Product Type', category: 'One-Pager', type: 'text', groupable: true, filterable: true, getValue: (r) => r.onePager?.product_type?.name ?? null, format: fmtText },
    { key: 'total_units', label: 'Total Units', category: 'One-Pager', type: 'number', groupable: false, filterable: true, getValue: (r) => r.onePager?.total_units ?? null, format: fmtNumber },
    {
        key: 'unit_avg_size', label: 'Unit Avg Size (SF)', category: 'One-Pager', type: 'number', groupable: false, filterable: true, getValue: (r) => {
            const op = r.onePager;
            if (!op || !op.total_units || op.total_units === 0 || !op.calc_total_nrsf) return null;
            return op.calc_total_nrsf / op.total_units;
        }, format: fmtNumber
    },

    // ── Returns ───────────────────────────────────────
    { key: 'calc_yoc', label: 'Unlevered YoC', category: 'Returns', type: 'percent', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_yoc ?? null, format: fmtPercent },
    { key: 'calc_noi', label: 'NOI', category: 'Returns', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_noi ?? null, format: fmtCurrency },
    { key: 'calc_noi_per_unit', label: 'NOI / Unit', category: 'Returns', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_noi_per_unit ?? null, format: fmtCurrency },

    // ── Revenue ───────────────────────────────────────
    { key: 'calc_gpr', label: 'Gross Potential Revenue', category: 'Revenue', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_gpr ?? null, format: fmtCurrency },
    { key: 'calc_net_revenue', label: 'Net Revenue', category: 'Revenue', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_net_revenue ?? null, format: fmtCurrency },

    // ── Budget ────────────────────────────────────────
    { key: 'calc_total_budget', label: 'Total Budget', category: 'Budget', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_total_budget ?? null, format: fmtCurrency },
    { key: 'calc_hard_cost', label: 'Hard Cost', category: 'Budget', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_hard_cost ?? null, format: fmtCurrency },
    { key: 'calc_soft_cost', label: 'Soft Cost', category: 'Budget', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_soft_cost ?? null, format: fmtCurrency },
    { key: 'calc_cost_per_unit', label: 'Cost / Unit', category: 'Budget', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_cost_per_unit ?? null, format: fmtCurrency },
    { key: 'land_cost', label: 'Land Cost', category: 'Budget', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.land_cost ?? null, format: fmtCurrency },
    {
        key: 'land_cost_per_unit', label: 'Land Cost / Unit', category: 'Budget', type: 'currency', groupable: false, filterable: true, getValue: (r) => {
            const op = r.onePager;
            if (!op || !op.land_cost || !op.total_units || op.total_units === 0) return null;
            return op.land_cost / op.total_units;
        }, format: fmtCurrency
    },
    {
        key: 'land_cost_per_sf', label: 'Land Cost / SF (Site)', category: 'Budget', type: 'currency', groupable: false, filterable: true, getValue: (r) => {
            const op = r.onePager;
            if (!op || !op.land_cost || !r.pursuit.site_area_sf || r.pursuit.site_area_sf === 0) return null;
            return op.land_cost / r.pursuit.site_area_sf;
        }, format: fmtCurrency
    },

    // ── OpEx ──────────────────────────────────────────
    { key: 'calc_total_opex', label: 'Total OpEx', category: 'OpEx', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_total_opex ?? null, format: fmtCurrency },
    {
        key: 'opex_ratio', label: 'OpEx Ratio', category: 'OpEx', type: 'percent', groupable: false, filterable: true, getValue: (r) => {
            const op = r.onePager;
            if (!op || !op.calc_total_opex || !op.calc_net_revenue || op.calc_net_revenue === 0) return null;
            return op.calc_total_opex / op.calc_net_revenue;
        }, format: fmtPercent
    },
    {
        key: 'controllable_per_unit', label: 'Controllable / Unit', category: 'OpEx', type: 'currency', groupable: false, filterable: true, getValue: (r) => {
            const op = r.onePager as any;
            if (!op) return null;
            const controllable = (op.opex_utilities ?? 0) + (op.opex_repairs_maintenance ?? 0) + (op.opex_contract_services ?? 0) + (op.opex_marketing ?? 0) + (op.opex_general_admin ?? 0) + (op.opex_turnover ?? 0) + (op.opex_misc ?? 0);
            return controllable > 0 ? controllable : null;
        }, format: fmtCurrency
    },

    // ── Assumptions ───────────────────────────────────
    { key: 'calc_total_nrsf', label: 'Total NRSF', category: 'Assumptions', type: 'number', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_total_nrsf ?? null, format: fmtNumber },
    { key: 'calc_total_gbsf', label: 'Total GBSF', category: 'Assumptions', type: 'number', groupable: false, filterable: true, getValue: (r) => r.onePager?.calc_total_gbsf ?? null, format: fmtNumber },
    { key: 'efficiency_ratio', label: 'Efficiency Ratio', category: 'Assumptions', type: 'percent', groupable: false, filterable: true, getValue: (r) => r.onePager?.efficiency_ratio ?? null, format: fmtPercent },
    { key: 'vacancy_rate', label: 'Vacancy Rate', category: 'Assumptions', type: 'percent', groupable: false, filterable: true, getValue: (r) => r.onePager?.vacancy_rate ?? null, format: fmtPercent },
    { key: 'hard_cost_per_nrsf', label: 'Hard Cost / NRSF', category: 'Assumptions', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.hard_cost_per_nrsf ?? null, format: fmtCurrency },
    { key: 'soft_cost_pct', label: 'Soft Cost %', category: 'Assumptions', type: 'percent', groupable: false, filterable: true, getValue: (r) => r.onePager?.soft_cost_pct ?? null, format: fmtPercent },
    { key: 'other_income_per_unit_month', label: 'Other Income/Unit/Mo', category: 'Assumptions', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.onePager?.other_income_per_unit_month ?? null, format: fmtCurrency },
    { key: 'mgmt_fee_pct', label: 'Mgmt Fee %', category: 'Assumptions', type: 'percent', groupable: false, filterable: true, getValue: (r) => r.onePager?.mgmt_fee_pct ?? null, format: fmtPercent },
    { key: 'payroll_burden_pct', label: 'Payroll Burden %', category: 'Assumptions', type: 'percent', groupable: false, filterable: true, getValue: (r) => r.onePager?.payroll_burden_pct ?? null, format: fmtPercent },
    { key: 'tax_mil_rate', label: 'Tax Millage Rate', category: 'Assumptions', type: 'number', groupable: false, filterable: true, getValue: (r) => r.onePager?.tax_mil_rate ?? null, format: (v) => v !== null ? formatNumber(Number(v), 4) : '—' },
];

// ── Category sets for source filtering ──
const COMP_CATEGORIES = new Set(['Land Comp']);
const PURSUIT_CATEGORIES = new Set(['Pursuit', 'One-Pager', 'Returns', 'Budget', 'Revenue', 'OpEx', 'Assumptions']);
const KEY_DATE_CATEGORIES = new Set(['Key Date']);
const RENT_COMP_CATEGORIES = new Set(['Rent Comp']);

// ── Land comp field definitions ──
const COMP_FIELDS: ReportFieldDef[] = [
    { key: 'comp_name', label: 'Comp Name', category: 'Land Comp', type: 'text', groupable: false, filterable: true, getValue: (r) => r.comp?.name ?? r.pursuit.name, format: fmtText },
    { key: 'comp_address', label: 'Address', category: 'Land Comp', type: 'text', groupable: false, filterable: true, getValue: (r) => r.comp?.address ?? '', format: fmtText },
    { key: 'comp_city', label: 'City', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.city ?? '', format: fmtText },
    { key: 'comp_state', label: 'State', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.state ?? '', format: fmtText },
    { key: 'comp_county', label: 'County', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.county ?? '', format: fmtText },
    { key: 'comp_zip', label: 'Zip', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.zip ?? '', format: fmtText },
    { key: 'comp_site_area_sf', label: 'Site Area (SF)', category: 'Land Comp', type: 'number', groupable: false, filterable: true, getValue: (r) => r.comp?.site_area_sf ?? null, format: fmtNumber },
    { key: 'comp_site_area_acres', label: 'Site Area (Ac)', category: 'Land Comp', type: 'number', groupable: false, filterable: true, getValue: (r) => r.comp && r.comp.site_area_sf > 0 ? r.comp.site_area_sf / SF_PER_ACRE : null, format: (v) => v !== null ? formatNumber(Number(v), 2) : '—' },
    { key: 'comp_sale_price', label: 'Sale Price', category: 'Land Comp', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.comp?.sale_price ?? null, format: fmtCurrency },
    { key: 'comp_sale_price_psf', label: 'Price / SF', category: 'Land Comp', type: 'currency', groupable: false, filterable: true, getValue: (r) => r.comp?.sale_price_psf ?? null, format: fmtCurrency },
    { key: 'comp_sale_date', label: 'Sale Date', category: 'Land Comp', type: 'date', groupable: false, filterable: true, getValue: (r) => r.comp?.sale_date ?? null, format: fmtDate },
    { key: 'comp_buyer', label: 'Buyer', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.buyer ?? null, format: fmtText },
    { key: 'comp_seller', label: 'Seller', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.seller ?? null, format: fmtText },
    { key: 'comp_zoning', label: 'Zoning', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.zoning ?? null, format: fmtText },
    { key: 'comp_land_use', label: 'Land Use', category: 'Land Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.comp?.land_use ?? null, format: fmtText },
    { key: 'comp_created_at', label: 'Date Added', category: 'Land Comp', type: 'date', groupable: false, filterable: true, getValue: (r) => r.comp?.created_at ?? null, format: fmtDate },
];

// ── Key Date field definitions (flattened: one row per pursuit) ──
const KEY_DATE_FIELDS: ReportFieldDef[] = [
    {
        key: 'kd_pursuit_name', label: 'Pursuit', category: 'Key Date', type: 'text', groupable: false, filterable: true, getValue: () => null, format: fmtText,
        getKeyDateValue: (r) => r.pursuit.name
    },
    {
        key: 'kd_region', label: 'Region', category: 'Key Date', type: 'text', groupable: true, filterable: true, getValue: () => null, format: fmtText,
        getKeyDateValue: (r) => r.pursuit.region
    },
    {
        key: 'kd_stage', label: 'Stage', category: 'Key Date', type: 'text', groupable: true, filterable: true, getValue: () => null, format: fmtText,
        getKeyDateValue: (r) => r.stage?.name ?? '—'
    },
    {
        key: 'kd_contract_execution', label: 'Contract Execution', category: 'Key Date', type: 'date', groupable: false, filterable: true, getValue: () => null, format: fmtDate,
        getKeyDateValue: (r) => r.contractExecution
    },
    {
        key: 'kd_inspection_period', label: 'Inspection Period', category: 'Key Date', type: 'date', groupable: false, filterable: true, getValue: () => null, format: fmtDate,
        getKeyDateValue: (r) => r.inspectionPeriod
    },
    {
        key: 'kd_closing_date', label: 'Closing Date', category: 'Key Date', type: 'date', groupable: false, filterable: true, getValue: () => null, format: fmtDate,
        getKeyDateValue: (r) => r.closingDate
    },
    {
        key: 'kd_next_date_label', label: 'Next Milestone', category: 'Key Date', type: 'text', groupable: false, filterable: true, getValue: () => null, format: fmtText,
        getKeyDateValue: (r) => r.nextDate?.label ?? null
    },
    {
        key: 'kd_next_date_value', label: 'Next Date', category: 'Key Date', type: 'date', groupable: false, filterable: true, getValue: () => null, format: fmtDate,
        getKeyDateValue: (r) => r.nextDate?.date ?? null
    },
    {
        key: 'kd_next_date_days', label: 'Days Until', category: 'Key Date', type: 'number', groupable: false, filterable: true, getValue: () => null, format: fmtNumber,
        getKeyDateValue: (r) => r.nextDate?.daysUntil ?? null
    },
    {
        key: 'kd_total_dates', label: 'Total Dates', category: 'Key Date', type: 'number', groupable: false, filterable: true, getValue: () => null, format: fmtNumber,
        getKeyDateValue: (r) => r.totalDates
    },
    {
        key: 'kd_overdue_count', label: 'Overdue', category: 'Key Date', type: 'number', groupable: false, filterable: true, getValue: () => null, format: fmtNumber,
        getKeyDateValue: (r) => r.overdueCount
    },
];

// Merge into master list
REPORT_FIELDS.push(...COMP_FIELDS);
REPORT_FIELDS.push(...KEY_DATE_FIELDS);

// ── Rent Comp field definitions ──
const RENT_COMP_FIELDS: ReportFieldDef[] = [
    { key: 'rc_pursuit_name', label: 'Pursuit', category: 'Rent Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.pursuit?.name ?? null, format: fmtText },
    { key: 'rc_property_name', label: 'Property Name', category: 'Rent Comp', type: 'text', groupable: false, filterable: true, getValue: (r) => r.rentComp?.property?.building_name ?? null, format: fmtText },
    { key: 'rc_address', label: 'Address', category: 'Rent Comp', type: 'text', groupable: false, filterable: true, getValue: (r) => r.rentComp?.property?.street_address ?? null, format: fmtText },
    { key: 'rc_city', label: 'City', category: 'Rent Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.rentComp?.property?.city ?? null, format: fmtText },
    { key: 'rc_state', label: 'State', category: 'Rent Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.rentComp?.property?.state ?? null, format: fmtText },
    { key: 'rc_msa', label: 'MSA', category: 'Rent Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.rentComp?.property?.msa ?? null, format: fmtText },
    { key: 'rc_comp_type', label: 'Comp Type', category: 'Rent Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => r.rentComp?.compType ?? null, format: fmtText },
    { key: 'rc_year_built', label: 'Year Built', category: 'Rent Comp', type: 'number', groupable: false, filterable: true, getValue: (r) => r.rentComp?.property?.year_built ?? null, format: (v) => v !== null ? String(v) : '—', aggregation: 'avg' },
    { key: 'rc_units', label: 'Units', category: 'Rent Comp', type: 'number', groupable: false, filterable: true, getValue: (r) => r.rentComp?.property?.number_units ?? null, format: fmtNumber },
    {
        key: 'rc_avg_sqft', label: 'Avg Sqft', category: 'Rent Comp', type: 'number', groupable: false, filterable: true,
        getValue: (r) => {
            const units = r.rentComp?.units?.filter((u: any) => u.sqft) ?? [];
            if (units.length === 0) return null;
            return Math.round(units.reduce((s: number, u: any) => s + (u.sqft ?? 0), 0) / units.length);
        }, format: fmtNumber, aggregation: 'avg'
    },
    { key: 'rc_quality', label: 'Quality', category: 'Rent Comp', type: 'text', groupable: true, filterable: true, getValue: (r) => { const q = r.rentComp?.property?.building_quality; if (!q) return null; return Object.entries(q).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(', ') || null; }, format: fmtText },
    {
        key: 'rc_asking_rent', label: 'Asking Rent', category: 'Rent Comp', type: 'currency', groupable: false, filterable: true,
        getValue: (r) => {
            const units = r.rentComp?.units?.filter((u: any) => u.price) ?? [];
            if (units.length === 0) return null;
            return Math.round(units.reduce((s: number, u: any) => s + (u.price ?? 0), 0) / units.length);
        }, format: fmtCurrency, aggregation: 'avg'
    },
    {
        key: 'rc_effective_rent', label: 'Effective Rent', category: 'Rent Comp', type: 'currency', groupable: false, filterable: true,
        getValue: (r) => {
            const units = r.rentComp?.units?.filter((u: any) => u.effective_price) ?? [];
            if (units.length === 0) return null;
            return Math.round(units.reduce((s: number, u: any) => s + (u.effective_price ?? 0), 0) / units.length);
        }, format: fmtCurrency, aggregation: 'avg'
    },
    {
        key: 'rc_asking_psf', label: 'Asking Rent/SF', category: 'Rent Comp', type: 'currency', groupable: false, filterable: true,
        getValue: (r) => {
            const units = r.rentComp?.units?.filter((u: any) => u.price && u.sqft && u.sqft > 0) ?? [];
            if (units.length === 0) return null;
            const totalRent = units.reduce((s: number, u: any) => s + (u.price ?? 0), 0);
            const totalSf = units.reduce((s: number, u: any) => s + (u.sqft ?? 0), 0);
            return totalSf > 0 ? totalRent / totalSf : null;
        }, format: (v) => v !== null ? `$${Number(v).toFixed(2)}` : '—', aggregation: 'avg'
    },
    {
        key: 'rc_effective_psf', label: 'Effective Rent/SF', category: 'Rent Comp', type: 'currency', groupable: false, filterable: true,
        getValue: (r) => {
            const units = r.rentComp?.units?.filter((u: any) => u.effective_price && u.sqft && u.sqft > 0) ?? [];
            if (units.length === 0) return null;
            const totalRent = units.reduce((s: number, u: any) => s + (u.effective_price ?? 0), 0);
            const totalSf = units.reduce((s: number, u: any) => s + (u.sqft ?? 0), 0);
            return totalSf > 0 ? totalRent / totalSf : null;
        }, format: (v) => v !== null ? `$${Number(v).toFixed(2)}` : '—', aggregation: 'avg'
    },
    {
        key: 'rc_leased_pct', label: 'Leased %', category: 'Rent Comp', type: 'percent', groupable: false, filterable: true,
        getValue: (r) => {
            const prop = r.rentComp?.property as any;
            const units = r.rentComp?.units ?? [];
            const totalUnits = prop?.number_units ?? units.length;
            if (totalUnits === 0) return null;
            // Primary: occupancy_over_time (most accurate)
            const occ = prop?.occupancy_over_time;
            if (occ?.length) {
                return occ[occ.length - 1].leased; // already 0-1 fraction
            }
            // Fallback: availability_periods on units
            const now = new Date();
            const sevenDaysOut = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
            const todayStr = now.toISOString().slice(0, 10);
            let available = 0;
            for (const u of units) {
                const periods = (u as any).availability_periods || [];
                const isAvail = periods.some((ap: any) => {
                    const entered = !ap.enter_market || ap.enter_market <= sevenDaysOut;
                    const notExited = !ap.exit_market || ap.exit_market >= todayStr;
                    return entered && notExited;
                });
                if (isAvail) available++;
            }
            return (totalUnits - available) / totalUnits;
        }, format: fmtPercent
    },
    {
        key: 'rc_concession', label: 'Concession', category: 'Rent Comp', type: 'text', groupable: false, filterable: true,
        getValue: (r) => {
            const concessions = r.rentComp?.concessions ?? [];
            if (concessions.length === 0) return null;
            return concessions.map((c: any) => c.text || c.description).filter(Boolean).join('; ') || null;
        }, format: fmtText
    },
];
REPORT_FIELDS.push(...RENT_COMP_FIELDS);

// Index by key for fast lookup
export const REPORT_FIELD_MAP: Record<ReportFieldKey, ReportFieldDef> = Object.fromEntries(
    REPORT_FIELDS.map(f => [f.key, f])
) as Record<ReportFieldKey, ReportFieldDef>;

// Grouped by category for the config panel
export const REPORT_FIELD_CATEGORIES = Array.from(
    new Set(REPORT_FIELDS.map(f => f.category))
).map(cat => ({
    category: cat,
    fields: REPORT_FIELDS.filter(f => f.category === cat),
}));

// Only groupable fields
export const GROUPABLE_FIELDS = REPORT_FIELDS.filter(f => f.groupable);

/**
 * Get field categories filtered by data source.
 * Pursuits → everything except Land Comp / Key Date category.
 * Land Comps → only Land Comp category.
 * Key Dates → only Key Date category.
 */
export function getFieldCategoriesForSource(source: ReportDataSource) {
    const allowedCategories = source === 'land_comps' ? COMP_CATEGORIES
        : source === 'key_dates' ? KEY_DATE_CATEGORIES
            : source === 'rent_comps' ? RENT_COMP_CATEGORIES
                : PURSUIT_CATEGORIES;
    return REPORT_FIELD_CATEGORIES.filter(c => allowedCategories.has(c.category));
}

export function getGroupableFieldsForSource(source: ReportDataSource) {
    const allowedCategories = source === 'land_comps' ? COMP_CATEGORIES
        : source === 'key_dates' ? KEY_DATE_CATEGORIES
            : source === 'rent_comps' ? RENT_COMP_CATEGORIES
                : PURSUIT_CATEGORIES;
    return GROUPABLE_FIELDS.filter(f => allowedCategories.has(f.category));
}
