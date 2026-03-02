// ============================================================
// SLR One-Pager — Core Type Definitions
// Matches PRD §3 schema exactly
// ============================================================

// --- Lookup / Reference Tables ---

export interface PursuitStage {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_active: boolean;
}

export interface ProductType {
  id: string;
  name: string;
  density_low: number;
  density_high: number;
  sort_order: number;
  is_active: boolean;
  sub_product_types?: SubProductType[];
}

export interface SubProductType {
  id: string;
  product_type_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// --- Pursuit ---

export interface Pursuit {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  county: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  site_area_sf: number;
  stage_id: string | null;
  stage_changed_at: string;
  exec_summary: Record<string, unknown> | null;
  arch_notes: Record<string, unknown> | null;
  region: string;
  demographics: Record<string, unknown> | null;
  demographics_updated_at: string | null;
  parcel_data: Record<string, unknown> | null;
  parcel_data_updated_at: string | null;
  drive_time_data: Record<string, unknown> | null;
  income_heatmap_data: Record<string, unknown> | null;
  parcel_assemblage: Record<string, unknown>[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  primary_one_pager_id: string | null;
  // Joined
  stage?: PursuitStage;
  one_pagers?: OnePager[];
  primary_one_pager?: OnePager;
  // Virtual
  site_area_acres?: number;
  // Aggregates from queries
  best_yoc?: number | null;
  primary_units?: number | null;
  one_pager_count?: number;
}

// --- Land Comps ---

export interface LandComp {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  county: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  site_area_sf: number;
  sale_price: number | null;
  sale_price_psf: number | null;
  sale_date: string | null;
  buyer: string | null;
  seller: string | null;
  zoning: string | null;
  land_use: string | null;
  notes: Record<string, unknown> | null;
  parcel_data: Record<string, unknown> | null;
  parcel_data_updated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Unit Mix ---

export type UnitType =
  | 'studio'
  | 'one_bed'
  | 'two_bed'
  | 'three_bed'
  | 'penthouse'
  | 'townhome'
  | 'other';

export type RentInputMode = 'per_sf' | 'whole_dollar';

export interface UnitMixRow {
  id: string;
  one_pager_id: string;
  unit_type: UnitType;
  unit_type_label: string;
  unit_count: number;
  avg_unit_sf: number;
  rent_input_mode: RentInputMode;
  rent_per_sf: number;
  rent_whole_dollar: number;
  sort_order: number;
  // Calculated (virtual)
  total_sf?: number;
  effective_monthly_rent?: number;
  effective_rent_per_sf?: number;
  annual_rental_revenue?: number;
}

// --- Payroll ---

export type PayrollLineType = 'employee' | 'contract';

export interface PayrollRow {
  id: string;
  one_pager_id: string;
  line_type: PayrollLineType;
  role_name: string;
  headcount: number;
  base_compensation: number;
  bonus_pct: number;
  fixed_amount: number;
  sort_order: number;
  // Calculated (virtual)
  total_comp_burdened?: number;
}

// --- Soft Cost Detail ---

export interface SoftCostDetailRow {
  id: string;
  one_pager_id: string;
  line_item_name: string;
  amount: number;
  sort_order: number;
}

// --- One-Pager ---

export interface OnePager {
  id: string;
  pursuit_id: string;
  name: string;
  product_type_id: string;
  sub_product_type_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  // Site & Density
  total_units: number;
  efficiency_ratio: number;
  // Revenue
  other_income_per_unit_month: number;
  vacancy_rate: number;
  // Budget
  hard_cost_per_nrsf: number;
  land_cost: number;
  soft_cost_pct: number;
  use_detailed_soft_costs: boolean;
  // OpEx ($/unit/year)
  opex_utilities: number;
  opex_repairs_maintenance: number;
  opex_contract_services: number;
  opex_marketing: number;
  opex_general_admin: number;
  opex_turnover: number;
  opex_misc: number;
  opex_insurance: number;
  mgmt_fee_pct: number;
  // Payroll
  payroll_burden_pct: number;
  // Property Tax
  tax_mil_rate: number;
  tax_assessed_pct_hard: number;
  tax_assessed_pct_land: number;
  tax_assessed_pct_soft: number;
  // Sensitivity
  sensitivity_rent_steps: number[];
  sensitivity_hard_cost_steps: number[];
  sensitivity_land_cost_steps: number[];
  // Stored calc values
  calc_total_nrsf?: number;
  calc_total_gbsf?: number;
  calc_gpr?: number;
  calc_net_revenue?: number;
  calc_total_budget?: number;
  calc_hard_cost?: number;
  calc_soft_cost?: number;
  calc_total_opex?: number;
  calc_noi?: number;
  calc_yoc?: number;
  calc_cost_per_unit?: number;
  calc_noi_per_unit?: number;
  // Joined child tables
  unit_mix?: UnitMixRow[];
  payroll?: PayrollRow[];
  soft_cost_details?: SoftCostDetailRow[];
  // Joined references
  product_type?: ProductType;
  sub_product_type?: SubProductType;
}

// --- Data Model Templates ---

export interface DataModel {
  id: string;
  name: string;
  product_type_id: string;
  region: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // All default_ prefixed assumption fields
  default_efficiency_ratio: number;
  default_other_income_per_unit_month: number;
  default_vacancy_rate: number;
  default_hard_cost_per_nrsf: number;
  default_soft_cost_pct: number;
  default_opex_utilities: number;
  default_opex_repairs_maintenance: number;
  default_opex_contract_services: number;
  default_opex_marketing: number;
  default_opex_general_admin: number;
  default_opex_turnover: number;
  default_opex_misc: number;
  default_opex_insurance: number;
  default_mgmt_fee_pct: number;
  default_payroll_burden_pct: number;
  default_tax_mil_rate: number;
  default_tax_assessed_pct_hard: number;
  default_tax_assessed_pct_land: number;
  default_tax_assessed_pct_soft: number;
  // Joined
  payroll_defaults?: DataModelPayrollDefault[];
  product_type?: ProductType;
}

export interface DataModelPayrollDefault {
  id: string;
  data_model_id: string;
  line_type: PayrollLineType;
  role_name: string;
  headcount: number;
  base_compensation: number;
  bonus_pct: number;
  fixed_amount: number;
  sort_order: number;
}

// --- Stage History ---

export interface PursuitStageHistory {
  id: string;
  pursuit_id: string;
  stage_id: string;
  changed_at: string;
  changed_by: string;
}

// --- User ---

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
}

// --- Key Date Types (Admin Lookup) ---

export type KeyDateCategory = 'contract' | 'pre_development';
export type KeyDateStatus = 'upcoming' | 'completed' | 'overdue' | 'waived';

export interface KeyDateType {
  id: string;
  name: string;
  category: KeyDateCategory;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface KeyDate {
  id: string;
  pursuit_id: string;
  key_date_type_id: string | null;
  custom_label: string | null;
  date_value: string; // ISO date
  status: KeyDateStatus;
  notes: string | null;
  contract_reference: string | null;
  ai_extracted: boolean;
  ai_confidence: number | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  key_date_type?: KeyDateType;
}

// --- Pre-Dev Budget ---

export interface MonthlyCell {
  projected: number;
  actual: number | null;
}

export interface PredevBudgetLineItem {
  id: string;
  budget_id: string;
  category: string;
  label: string;
  sort_order: number;
  is_custom: boolean;
  monthly_values: Record<string, MonthlyCell>; // keyed by "YYYY-MM"
}

export interface PredevBudget {
  id: string;
  pursuit_id: string;
  start_date: string; // ISO date
  duration_months: number;
  notes: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  line_items?: PredevBudgetLineItem[];
}

// --- Calculation Results (used by useCalculations hook) ---

export interface CalculationResults {
  // Site & Density
  site_area_acres: number;
  density_units_per_acre: number;
  recommended_units_low: number;
  recommended_units_high: number;
  total_nrsf: number;
  total_gbsf: number;
  weighted_avg_unit_sf: number;
  // Revenue
  gross_potential_rent: number;
  other_income: number;
  gross_potential_revenue: number;
  vacancy_loss: number;
  net_revenue: number;
  weighted_avg_rent_per_sf: number;
  // Budget
  hard_cost: number;
  hard_cost_per_gbsf: number;
  soft_cost: number;
  total_budget: number;
  cost_per_unit: number;
  cost_per_nrsf: number;
  cost_per_gbsf: number;
  land_cost_per_unit: number;
  land_cost_per_sf: number;
  // OpEx
  opex_categories_total: number;
  payroll_total: number;
  mgmt_fee_total: number;
  property_tax_total: number;
  total_opex: number;
  opex_per_unit: number;
  opex_ratio: number;
  // Property Tax detail
  assessed_value: number;
  property_tax_per_unit: number;
  // Returns
  noi: number;
  noi_per_unit: number;
  noi_per_sf: number;
  unlevered_yield_on_cost: number;
}

// --- Data Model Templates ---

export interface DataModelTemplate {
  id: string;
  name: string;
  product_type_id: string;
  region: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Default assumptions
  default_efficiency_ratio: number;
  default_other_income_per_unit_month: number;
  default_vacancy_rate: number;
  default_hard_cost_per_nrsf: number;
  default_soft_cost_pct: number;
  default_opex_utilities: number;
  default_opex_repairs_maintenance: number;
  default_opex_contract_services: number;
  default_opex_marketing: number;
  default_opex_general_admin: number;
  default_opex_turnover: number;
  default_opex_misc: number;
  default_opex_insurance: number;
  default_mgmt_fee_pct: number;
  default_payroll_burden_pct: number;
  default_tax_mil_rate: number;
  default_tax_assessed_pct_hard: number;
  default_tax_assessed_pct_land: number;
  default_tax_assessed_pct_soft: number;
  // Joined
  payroll_defaults?: DataModelPayrollDefault[];
  product_type?: ProductType;
}

export interface DataModelPayrollDefault {
  id: string;
  data_model_id: string;
  line_type: 'employee' | 'contract';
  role_name: string;
  headcount: number;
  base_compensation: number;
  bonus_pct: number;
  fixed_amount: number;
  sort_order: number;
}

// --- Report Templates ---

export type ReportFieldKey =
  // Pursuit fields
  | 'pursuit_name' | 'address' | 'city' | 'state' | 'county' | 'zip'
  | 'region' | 'stage' | 'site_area_sf' | 'site_area_acres'
  | 'pursuit_created_at' | 'pursuit_updated_at'
  // One-pager fields
  | 'one_pager_name' | 'product_type' | 'total_units' | 'efficiency_ratio'
  | 'vacancy_rate' | 'land_cost' | 'hard_cost_per_nrsf' | 'soft_cost_pct'
  | 'other_income_per_unit_month' | 'mgmt_fee_pct' | 'payroll_burden_pct'
  | 'tax_mil_rate'
  // Calculated fields
  | 'calc_total_nrsf' | 'calc_total_gbsf' | 'calc_gpr' | 'calc_net_revenue'
  | 'calc_total_budget' | 'calc_hard_cost' | 'calc_soft_cost'
  | 'calc_total_opex' | 'calc_noi' | 'calc_yoc'
  | 'calc_cost_per_unit' | 'calc_noi_per_unit'
  | 'unit_avg_size' | 'opex_ratio' | 'controllable_per_unit'
  | 'land_cost_per_unit' | 'land_cost_per_sf'
  // Land Comp fields
  | 'comp_name' | 'comp_address' | 'comp_city' | 'comp_state' | 'comp_county'
  | 'comp_zip' | 'comp_site_area_sf' | 'comp_site_area_acres'
  | 'comp_sale_price' | 'comp_sale_price_psf' | 'comp_sale_date'
  | 'comp_buyer' | 'comp_seller' | 'comp_zoning' | 'comp_land_use'
  | 'comp_created_at'
  // Key Date fields (flattened: one row per pursuit)
  | 'kd_pursuit_name' | 'kd_region' | 'kd_stage'
  | 'kd_contract_execution' | 'kd_inspection_period' | 'kd_closing_date'
  | 'kd_next_date_label' | 'kd_next_date_value' | 'kd_next_date_days'
  | 'kd_total_dates' | 'kd_overdue_count';

export type ReportFilterOperator = 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';

export interface ReportFilter {
  field: ReportFieldKey;
  operator: ReportFilterOperator;
  value: string;
}

export type ReportDataSource = 'pursuits' | 'land_comps' | 'predev_budgets' | 'key_dates';

export interface ReportConfig {
  dataSource: ReportDataSource;
  groupBy: ReportFieldKey[];
  columns: ReportFieldKey[];
  filters: ReportFilter[];
  sortBy?: { field: ReportFieldKey; direction: 'asc' | 'desc' };
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  config: ReportConfig;
  is_shared: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

// --- Checklist Types ---

export type ChecklistTaskStatus = 'not_started' | 'in_progress' | 'in_review' | 'complete' | 'not_applicable' | 'blocked';

export type MilestoneKey = 'loi_execution' | 'dd_expiration' | 'hard_deposit' | 'closing' | 'construction_start' | 'first_unit_delivery';

export type TaskActivityAction =
  | 'status_changed' | 'assigned' | 'note_added' | 'file_linked' | 'file_removed'
  | 'due_date_changed' | 'task_edited' | 'checklist_item_toggled';

// --- Checklist Templates (Admin) ---

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  phases?: ChecklistTemplatePhase[];
}

export interface ChecklistTemplatePhase {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  default_milestone: string | null;
  color: string | null;
  // Joined
  tasks?: ChecklistTemplateTask[];
}

export interface ChecklistTemplateTask {
  id: string;
  phase_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  default_status: string;
  relative_due_days: number | null;
  relative_milestone: string | null;
  depends_on_task_id: string | null;
  is_critical_path: boolean;
  external_assignable: boolean;
  // Joined
  checklist_items?: ChecklistTemplateChecklistItem[];
}

export interface ChecklistTemplateChecklistItem {
  id: string;
  task_id: string;
  label: string;
  sort_order: number;
}

// --- Pursuit Checklist Instances ---

export interface PursuitChecklistInstance {
  id: string;
  pursuit_id: string;
  source_template_id: string | null;
  source_template_version: number | null;
  applied_at: string;
  applied_by: string | null;
}

export interface PursuitMilestone {
  id: string;
  pursuit_id: string;
  milestone_key: string;
  milestone_label: string;
  target_date: string | null; // ISO date
  is_confirmed: boolean;
  sort_order: number;
}

export interface PursuitChecklistPhase {
  id: string;
  instance_id: string;
  pursuit_id: string;
  source_phase_id: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  default_milestone: string | null;
  color: string | null;
  // Joined
  tasks?: PursuitChecklistTask[];
}

export interface PursuitChecklistTask {
  id: string;
  phase_id: string;
  pursuit_id: string;
  source_task_id: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  status: ChecklistTaskStatus;
  assigned_to: string | null;
  assigned_to_type: 'internal' | 'external';
  due_date: string | null; // ISO date
  due_date_is_manual: boolean;
  relative_due_days: number | null;
  relative_milestone: string | null;
  depends_on_task_id: string | null;
  is_critical_path: boolean;
  external_assignable: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  checklist_items?: PursuitChecklistItem[];
  assigned_user?: UserProfile;
}

export interface PursuitChecklistItem {
  id: string;
  task_id: string;
  label: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  sort_order: number;
}

// --- Task Notes & Activity ---

export interface TaskNote {
  id: string;
  task_id: string;
  author_id: string;
  author_type: 'internal' | 'external';
  content: string;
  parent_note_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  author?: UserProfile;
}

export interface TaskActivityLog {
  id: string;
  task_id: string;
  pursuit_id: string;
  user_id: string | null;
  action: TaskActivityAction;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  // Joined
  user?: UserProfile;
}

// --- Hellodata Rent Comps ---

export interface HellodataProperty {
  id: string;
  hellodata_id: string;
  building_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  lat: number | null;
  lon: number | null;
  year_built: number | null;
  number_units: number | null;
  number_stories: number | null;
  msa: string | null;
  management_company: string | null;
  building_website: string | null;
  building_phone: string | null;
  is_single_family: boolean;
  is_apartment: boolean;
  is_condo: boolean;
  is_senior: boolean;
  is_student: boolean;
  is_build_to_rent: boolean;
  is_affordable: boolean;
  is_lease_up: boolean;
  building_quality: Record<string, number> | null;
  pricing_strategy: {
    is_using_rev_management?: boolean;
    avg_duration?: number;
    avg_price_change?: number;
    avg_time_on_market?: number;
    day_of_week_distribution?: number[];
    count_prices?: number;
  } | null;
  review_analysis: {
    avg_score?: number;
    count_reviews?: number;
    positive_counts?: Record<string, number>;
    negative_counts?: Record<string, number>;
  } | null;
  demographics: Record<string, unknown> | null;
  fees: Record<string, number | string> | null;
  occupancy_over_time: { as_of: string; leased: number; exposure: number }[] | null;
  building_amenities: string[];
  unit_amenities: string[];
  raw_response: Record<string, unknown> | null;
  fetched_at: string;
  data_as_of: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  units?: HellodataUnit[];
  concessions?: HellodataConcession[];
}

export interface HellodataUnit {
  id: string;
  property_id: string;
  hellodata_unit_id: string | null;
  is_floorplan: boolean;
  bed: number | null;
  bath: number | null;
  partial_bath: number;
  sqft: number | null;
  min_sqft: number | null;
  max_sqft: number | null;
  floorplan_name: string | null;
  unit_name: string | null;
  floor: number | null;
  price: number | null;
  min_price: number | null;
  max_price: number | null;
  effective_price: number | null;
  min_effective_price: number | null;
  max_effective_price: number | null;
  days_on_market: number | null;
  lease_term: number | null;
  enter_market: string | null;
  exit_market: string | null;
  availability: string | null;
  amenities: string[];
  tags: string[];
  history: {
    from_date: string;
    to_date: string;
    price: number | null;
    effective_price: number | null;
    period_id: number;
    min_price: number | null;
    max_price: number | null;
    min_effective_price: number | null;
    max_effective_price: number | null;
    lease_term: number | null;
  }[] | null;
  availability_periods: {
    period_id: number;
    enter_market: string | null;
    exit_market: string | null;
    days_on_market: number | null;
    availability: string | null;
    deposit: number | null;
    price_plans: {
      duration_in_months: number;
      specials: string | null;
      price: number | null;
      effective_price: number | null;
      monthly_rent: number | null;
    }[];
  }[] | null;
  price_plans: {
    duration_in_months: number;
    specials: string | null;
    price: number | null;
    effective_price: number | null;
    monthly_rent: number | null;
  }[] | null;
  created_at: string;
  updated_at: string;
}

export interface HellodataConcession {
  id: string;
  property_id: string;
  hellodata_concession_id: string | null;
  concession_text: string | null;
  from_date: string | null;
  to_date: string | null;
  items: {
    condition_lease_term_months?: number[];
    condition_deadline?: string;
    condition_bedrooms?: number[];
    condition_unit_names?: string[];
    condition_floorplans?: string[];
    free_weeks_count?: number;
    free_months_count?: number;
    free_months_until?: string;
    one_time_dollars_off_amount?: number;
    one_time_dollars_off_percentage?: number;
    recurring_dollars_off_amount?: number;
    recurring_dollars_off_percentage?: number;
    waived_application_fee?: boolean;
    waived_security_deposit?: boolean;
    waived_administrative_fee?: boolean;
    waived_move_in_fee?: boolean;
  }[] | null;
  created_at: string;
}

export interface PursuitRentComp {
  id: string;
  pursuit_id: string;
  property_id: string;
  added_by: string | null;
  added_at: string;
  notes: string | null;
  sort_order: number;
  comp_type: 'primary' | 'secondary';
  // Joined
  property?: HellodataProperty;
}

export interface HellodataSearchResult {
  id: string;
  lat: number;
  lon: number;
  building_name: string | null;
  building_name_alias: string[];
  street_address: string;
  street_address_alias: string[];
  city: string;
  state: string;
  zip_code: string;
  year_built: number | null;
  number_units: number | null;
}

export interface HellodataComparable {
  id: string;
  lat: number;
  lon: number;
  year_built: number | null;
  number_units: number | null;
  street_address: string;
  street_address_alias: string[];
  city: string;
  state: string;
  zip_code: string;
  building_name: string | null;
  building_name_alias: string[];
  similarity_score: {
    distance_meters: number;
    distance_miles: number;
    distance: number;
    number_units: number;
    vintage: number;
    number_stories: number;
    quality: number;
    building_amenities: number;
    unit_amenities: number;
    unit_mix: Record<string, number>;
    overall: number;
  };
}

export interface HellodataFetchLog {
  id: string;
  hellodata_id: string;
  endpoint: string;
  response_status: number | null;
  fetched_by: string | null;
  fetched_at: string;
}
