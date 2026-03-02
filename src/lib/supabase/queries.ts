/**
 * Supabase query functions — thin wrappers around the Supabase client.
 * Used by TanStack Query hooks for caching, deduplication, and optimistic updates.
 */
import { createClient } from './client';
import type {
    Pursuit,
    OnePager,
    UnitMixRow,
    PayrollRow,
    SoftCostDetailRow,
    PursuitStage,
    ProductType,
    DataModelTemplate,
    DataModelPayrollDefault,
    ReportTemplate,
    LandComp,
    PredevBudget,
    PredevBudgetLineItem,
    MonthlyCell,
    KeyDateType,
    KeyDate,
    KeyDateStatus,
    ChecklistTemplate,
    ChecklistTemplatePhase,
    ChecklistTemplateTask,
    ChecklistTemplateChecklistItem,
    PursuitChecklistInstance,
    PursuitMilestone,
    PursuitChecklistPhase,
    PursuitChecklistTask,
    PursuitChecklistItem,
    ChecklistTaskStatus,
    TaskNote,
    TaskActivityLog,
    HellodataUnit,
    HellodataConcession,
} from '@/types';

const supabase = createClient();

// ============================================================
// Pursuit Stages
// ============================================================

export async function fetchStages(): Promise<PursuitStage[]> {
    const { data, error } = await supabase
        .from('pursuit_stages')
        .select('*')
        .order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function upsertStage(stage: Partial<PursuitStage> & { id?: string }) {
    const { data, error } = await supabase
        .from('pursuit_stages')
        .upsert(stage)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteStage(id: string) {
    const { error } = await supabase.from('pursuit_stages').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Product Types (with sub-product types)
// ============================================================

export async function fetchProductTypes(): Promise<ProductType[]> {
    const { data, error } = await supabase
        .from('product_types')
        .select('*, sub_product_types(*)')
        .order('sort_order');
    if (error) throw error;
    return (data ?? []).map((pt: any) => ({
        ...pt,
        sub_product_types: (pt.sub_product_types ?? []).sort(
            (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
        ),
    }));
}

export async function upsertProductType(pt: Partial<ProductType> & { id?: string }) {
    // Strip sub_product_types before upserting - it's a joined relation
    const { sub_product_types, ...payload } = pt as ProductType;
    const { data, error } = await supabase
        .from('product_types')
        .upsert(payload)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteProductType(id: string) {
    const { error } = await supabase.from('product_types').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Pursuits
// ============================================================

export async function fetchPursuits(): Promise<Pursuit[]> {
    // Run both queries in parallel — no need to wait for pursuits before fetching one-pagers
    const [pursuitsResult, onePagersResult] = await Promise.all([
        supabase
            .from('pursuits')
            // Only select columns the dashboard actually uses — skip large JSON blobs
            // (demographics, parcel_data, drive_time_data, income_heatmap_data,
            //  parcel_assemblage, exec_summary, arch_notes) that are only needed on detail pages
            .select(`
                id, name, address, city, state, county, zip,
                latitude, longitude, site_area_sf, stage_id,
                stage_changed_at, region, created_by, created_at,
                updated_at, is_archived, primary_one_pager_id,
                pursuit_stages(*)
            `)
            .eq('is_archived', false)
            .order('updated_at', { ascending: false }),
        supabase
            .from('one_pagers')
            .select('id, pursuit_id, calc_yoc, total_units')
            .eq('is_archived', false),
    ]);

    const { data, error } = pursuitsResult;
    if (error) throw error;
    const { data: allOnePagers, error: opError } = onePagersResult;
    if (opError) throw opError;

    // Index one-pagers by pursuit_id
    const opsByPursuit = new Map<string, typeof allOnePagers>();
    for (const op of (allOnePagers ?? [])) {
        const list = opsByPursuit.get(op.pursuit_id) || [];
        list.push(op);
        opsByPursuit.set(op.pursuit_id, list);
    }

    return (data ?? []).map((p: any) => {
        const pursuitOps = opsByPursuit.get(p.id) || [];
        // Determine primary one-pager YOC and units
        let primaryYoc: number | null = null;
        let primaryUnits: number | null = null;
        if (p.primary_one_pager_id) {
            const primary = pursuitOps.find((op: any) => op.id === p.primary_one_pager_id);
            primaryYoc = primary?.calc_yoc ?? null;
            primaryUnits = primary?.total_units ?? null;
        } else if (pursuitOps.length === 1) {
            primaryYoc = pursuitOps[0].calc_yoc ?? null;
            primaryUnits = pursuitOps[0].total_units ?? null;
        }
        return {
            ...p,
            stage: p.pursuit_stages,
            best_yoc: primaryYoc,
            primary_units: primaryUnits,
            one_pager_count: pursuitOps.length,
        } as unknown as Pursuit;
    });
}

export async function fetchPursuit(id: string): Promise<Pursuit> {
    const { data, error } = await supabase
        .from('pursuits')
        .select('*, pursuit_stages(*)')
        .eq('id', id)
        .single();
    if (error) throw error;
    return { ...data, stage: data.pursuit_stages };
}

export async function createPursuit(
    pursuit: Omit<Pursuit, 'id' | 'created_at' | 'updated_at' | 'stage' | 'one_pagers' | 'site_area_acres' | 'best_yoc' | 'primary_units' | 'one_pager_count'>
): Promise<Pursuit> {
    const { data, error } = await supabase
        .from('pursuits')
        .insert(pursuit)
        .select('*, pursuit_stages(*)')
        .single();
    if (error) throw error;
    return { ...data, stage: data.pursuit_stages };
}

export async function updatePursuit(id: string, updates: Partial<Pursuit>) {
    // Strip virtual/joined fields
    const { stage, one_pagers, primary_one_pager, site_area_acres, best_yoc, primary_units, one_pager_count, ...payload } = updates as Pursuit;
    const { data, error } = await supabase
        .from('pursuits')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deletePursuit(id: string) {
    const { error } = await supabase
        .from('pursuits')
        .update({ is_archived: true })
        .eq('id', id);
    if (error) throw error;
}

// ============================================================
// One-Pagers
// ============================================================

export async function fetchOnePagersByPursuit(pursuitId: string): Promise<OnePager[]> {
    const { data, error } = await supabase
        .from('one_pagers')
        .select('*, product_types(name, density_low, density_high)')
        .eq('pursuit_id', pursuitId)
        .eq('is_archived', false)
        .order('created_at');
    if (error) throw error;
    return (data ?? []).map((op: any) => ({
        ...op,
        product_type: op.product_types,
    }));
}

export async function fetchOnePager(id: string): Promise<OnePager> {
    const { data, error } = await supabase
        .from('one_pagers')
        .select('*, product_types(*)')
        .eq('id', id)
        .single();
    if (error) throw error;
    return { ...data, product_type: data.product_types };
}

export async function createOnePager(
    onePager: Omit<OnePager, 'id' | 'created_at' | 'updated_at' | 'unit_mix' | 'payroll' | 'soft_cost_details' | 'product_type' | 'sub_product_type'>
): Promise<OnePager> {
    // Strip calculated fields
    const {
        calc_total_nrsf, calc_total_gbsf, calc_gpr, calc_net_revenue,
        calc_total_budget, calc_hard_cost, calc_soft_cost, calc_total_opex,
        calc_noi, calc_yoc, calc_cost_per_unit, calc_noi_per_unit,
        ...payload
    } = onePager as OnePager;
    const { data, error } = await supabase
        .from('one_pagers')
        .insert(payload)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateOnePager(id: string, updates: Partial<OnePager>, expectedUpdatedAt?: string) {
    // Strip joined/virtual fields
    const { unit_mix, payroll, soft_cost_details, product_type, sub_product_type, ...payload } = updates as OnePager;

    let query = supabase
        .from('one_pagers')
        .update(payload)
        .eq('id', id);

    // Multi-user staleness guard: if caller knows the expected updated_at,
    // only apply the update if the row hasn't been modified since.
    // With ~10 users, conflicts are rare; silently refetch on conflict.
    if (expectedUpdatedAt) {
        query = query.eq('updated_at', expectedUpdatedAt);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
}

/**
 * Duplicate a one-pager: deep copies the one-pager record
 * plus all child rows (unit mix, payroll, soft cost details).
 * Returns the new one-pager.
 */
export async function duplicateOnePager(sourceId: string, newName: string): Promise<OnePager> {
    // 1. Fetch the source one-pager
    const source = await fetchOnePager(sourceId);

    // 2. Strip IDs, timestamps, computed, and joined fields — keep assumptions only
    const {
        id: _id, created_at: _ca, updated_at: _ua,
        unit_mix: _um, payroll: _pr, soft_cost_details: _scd,
        product_type: _pt, sub_product_type: _spt, product_types: _pts,
        calc_total_nrsf, calc_total_gbsf, calc_gpr, calc_net_revenue,
        calc_total_budget, calc_hard_cost, calc_soft_cost, calc_total_opex,
        calc_noi, calc_yoc, calc_cost_per_unit, calc_noi_per_unit,
        ...assumptions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = source as any;

    // 3. Insert new one-pager
    const { data: newOP, error: opError } = await supabase
        .from('one_pagers')
        .insert({ ...assumptions, name: newName })
        .select()
        .single();
    if (opError) throw opError;

    // 4. Copy unit mix rows
    const unitMix = await fetchUnitMix(sourceId);
    if (unitMix.length > 0) {
        const umPayload = unitMix.map(({ id: _rowId, one_pager_id: _opId, total_sf, effective_monthly_rent, effective_rent_per_sf, annual_rental_revenue, ...row }) => ({
            ...row,
            one_pager_id: newOP.id,
        }));
        const { error: umError } = await supabase.from('one_pager_unit_mix').insert(umPayload);
        if (umError) throw umError;
    }

    // 5. Copy payroll rows
    const payrollRows = await fetchPayroll(sourceId);
    if (payrollRows.length > 0) {
        const prPayload = payrollRows.map(({ id: _rowId, one_pager_id: _opId, total_comp_burdened, ...row }) => ({
            ...row,
            one_pager_id: newOP.id,
        }));
        const { error: prError } = await supabase.from('one_pager_payroll').insert(prPayload);
        if (prError) throw prError;
    }

    // 6. Copy soft cost details
    const softCosts = await fetchSoftCostDetails(sourceId);
    if (softCosts.length > 0) {
        const scPayload = softCosts.map(({ id: _rowId, one_pager_id: _opId, ...row }) => ({
            ...row,
            one_pager_id: newOP.id,
        }));
        const { error: scError } = await supabase.from('one_pager_soft_cost_detail').insert(scPayload);
        if (scError) throw scError;
    }

    return newOP;
}

/**
 * Archive (soft-delete) a one-pager.
 */
export async function archiveOnePager(id: string) {
    const { error } = await supabase
        .from('one_pagers')
        .update({ is_archived: true })
        .eq('id', id);
    if (error) throw error;
}

/**
 * Hard-delete a one-pager and all its child rows (cascade).
 */
export async function deleteOnePager(id: string) {
    // Delete children first (in case no cascade constraint)
    await supabase.from('one_pager_unit_mix').delete().eq('one_pager_id', id);
    await supabase.from('one_pager_payroll').delete().eq('one_pager_id', id);
    await supabase.from('one_pager_soft_cost_detail').delete().eq('one_pager_id', id);
    const { error } = await supabase.from('one_pagers').delete().eq('id', id);
    if (error) throw error;
}

/**
 * Archive (soft-delete) a pursuit.
 */
export async function archivePursuit(id: string) {
    const { error } = await supabase
        .from('pursuits')
        .update({ is_archived: true })
        .eq('id', id);
    if (error) throw error;
}

// ============================================================
// Unit Mix
// ============================================================

export async function fetchUnitMix(onePagerId: string): Promise<UnitMixRow[]> {
    const { data, error } = await supabase
        .from('one_pager_unit_mix')
        .select('*')
        .eq('one_pager_id', onePagerId)
        .order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function upsertUnitMixRows(rows: UnitMixRow[]) {
    // Strip virtual fields
    const payload = rows.map(({ total_sf, effective_monthly_rent, effective_rent_per_sf, annual_rental_revenue, ...r }) => r);
    const { data, error } = await supabase
        .from('one_pager_unit_mix')
        .upsert(payload)
        .select();
    if (error) throw error;
    return data;
}

export async function upsertUnitMixRow(row: Partial<UnitMixRow> & { id: string }) {
    const { total_sf, effective_monthly_rent, effective_rent_per_sf, annual_rental_revenue, ...payload } = row as UnitMixRow;
    const { data, error } = await supabase
        .from('one_pager_unit_mix')
        .upsert(payload)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteUnitMixRow(id: string) {
    const { error } = await supabase.from('one_pager_unit_mix').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Payroll
// ============================================================

export async function fetchPayroll(onePagerId: string): Promise<PayrollRow[]> {
    const { data, error } = await supabase
        .from('one_pager_payroll')
        .select('*')
        .eq('one_pager_id', onePagerId)
        .order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function upsertPayrollRow(row: Partial<PayrollRow> & { id?: string }) {
    const { total_comp_burdened, ...payload } = row as PayrollRow;
    const { data, error } = await supabase
        .from('one_pager_payroll')
        .upsert(payload)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deletePayrollRow(id: string) {
    const { error } = await supabase.from('one_pager_payroll').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Soft Cost Details
// ============================================================

export async function fetchSoftCostDetails(onePagerId: string): Promise<SoftCostDetailRow[]> {
    const { data, error } = await supabase
        .from('one_pager_soft_cost_detail')
        .select('*')
        .eq('one_pager_id', onePagerId)
        .order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function upsertSoftCostRow(row: Partial<SoftCostDetailRow> & { id?: string }) {
    const { data, error } = await supabase
        .from('one_pager_soft_cost_detail')
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteSoftCostRow(id: string) {
    const { error } = await supabase.from('one_pager_soft_cost_detail').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Data Model Templates
// ============================================================

export async function fetchTemplates(): Promise<DataModelTemplate[]> {
    const { data, error } = await supabase
        .from('data_model_templates')
        .select('*, product_type:product_types(*), payroll_defaults:data_model_payroll_defaults(*)')
        .order('name');
    if (error) throw error;
    return data ?? [];
}

export async function upsertTemplate(template: Partial<DataModelTemplate> & { id?: string }) {
    // Strip joined relations before upserting
    const { payroll_defaults, product_type, ...row } = template as DataModelTemplate;
    const { data, error } = await supabase
        .from('data_model_templates')
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteTemplate(id: string) {
    const { error } = await supabase.from('data_model_templates').delete().eq('id', id);
    if (error) throw error;
}

export async function fetchPayrollDefaults(templateId: string): Promise<DataModelPayrollDefault[]> {
    const { data, error } = await supabase
        .from('data_model_payroll_defaults')
        .select('*')
        .eq('data_model_id', templateId)
        .order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function upsertPayrollDefault(row: Partial<DataModelPayrollDefault> & { id?: string; data_model_id: string }) {
    const { data, error } = await supabase
        .from('data_model_payroll_defaults')
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deletePayrollDefault(id: string) {
    const { error } = await supabase.from('data_model_payroll_defaults').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Report Templates
// ============================================================

export async function fetchReportTemplates(): Promise<ReportTemplate[]> {
    // Get current user ID
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    // Fetch templates visible to this user: their own OR shared companywide
    const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .eq('is_archived', false)
        .or(`created_by.eq.${userId},is_shared.eq.true`)
        .order('name');
    if (error) throw error;
    return data ?? [];
}

export async function fetchReportTemplate(id: string): Promise<ReportTemplate> {
    const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function createReportTemplate(
    template: Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>
): Promise<ReportTemplate> {
    const { data, error } = await supabase
        .from('report_templates')
        .insert(template)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateReportTemplate(id: string, updates: Partial<ReportTemplate>) {
    const { data, error } = await supabase
        .from('report_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteReportTemplate(id: string) {
    const { error } = await supabase
        .from('report_templates')
        .update({ is_archived: true })
        .eq('id', id);
    if (error) throw error;
}

export async function shareReportTemplate(id: string) {
    const { data, error } = await supabase
        .from('report_templates')
        .update({ is_shared: true })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function unshareReportTemplate(id: string) {
    const { data, error } = await supabase
        .from('report_templates')
        .update({ is_shared: false })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ============================================================
// Report Data — Pursuits + Primary One-Pagers
// ============================================================

export interface ReportRow {
    pursuit: Pursuit;
    onePager: OnePager | null;
    comp?: LandComp;
    rentComp?: {
        property: HellodataProperty;
        units: HellodataUnit[];
        concessions: HellodataConcession[];
        compType: 'primary' | 'secondary';
    };
    _source: 'pursuit' | 'land_comp' | 'rent_comp';
}

export async function fetchReportData(): Promise<ReportRow[]> {
    // Fetch all active pursuits with stage
    const { data: pursuits, error: pError } = await supabase
        .from('pursuits')
        .select('*, pursuit_stages(*)')
        .eq('is_archived', false)
        .order('updated_at', { ascending: false });
    if (pError) throw pError;

    // Fetch all active one-pagers with product type
    const { data: onePagers, error: opError } = await supabase
        .from('one_pagers')
        .select('*, product_types(name, density_low, density_high)')
        .eq('is_archived', false);
    if (opError) throw opError;

    // Index one-pagers by id and by pursuit_id
    const opById = new Map<string, OnePager>();
    const opsByPursuit = new Map<string, OnePager[]>();
    for (const op of (onePagers ?? [])) {
        const mapped = { ...op, product_type: (op as any).product_types } as OnePager;
        opById.set(mapped.id, mapped);
        const list = opsByPursuit.get(mapped.pursuit_id) || [];
        list.push(mapped);
        opsByPursuit.set(mapped.pursuit_id, list);
    }

    return (pursuits ?? []).map((p: any) => {
        const pursuit = { ...p, stage: p.pursuit_stages } as Pursuit;
        // Determine primary one-pager:
        // 1. Explicit primary_one_pager_id
        // 2. Auto-select if only one one-pager
        // 3. null if none
        const pursuitOps = opsByPursuit.get(pursuit.id) || [];
        let primary: OnePager | null = null;
        if (pursuit.primary_one_pager_id && opById.has(pursuit.primary_one_pager_id)) {
            primary = opById.get(pursuit.primary_one_pager_id)!;
        } else if (pursuitOps.length === 1) {
            primary = pursuitOps[0];
        }
        return { pursuit, onePager: primary, _source: 'pursuit' as const };
    });
}

/**
 * Fetch land comps as ReportRow[] for the report engine.
 * Each comp is mapped to a minimal pursuit stub so the shared engine works.
 */
export async function fetchLandCompReportData(): Promise<ReportRow[]> {
    const comps = await fetchLandComps();
    return comps.map((c): ReportRow => ({
        pursuit: {
            id: c.id,
            name: c.name,
            address: c.address,
            city: c.city,
            state: c.state,
            county: c.county,
            zip: c.zip,
            latitude: c.latitude,
            longitude: c.longitude,
            site_area_sf: c.site_area_sf,
            region: '',
            stage_id: null,
            stage_changed_at: null,
            exec_summary: null,
            arch_notes: null,
            demographics: null,
            demographics_updated_at: null,
            parcel_data: c.parcel_data,
            parcel_data_updated_at: c.parcel_data_updated_at,
            drive_time_data: null,
            income_heatmap_data: null,
            parcel_assemblage: null,
            created_by: c.created_by,
            created_at: c.created_at,
            updated_at: c.updated_at,
            is_archived: false,
            primary_one_pager_id: null,
        } as unknown as Pursuit,
        onePager: null,
        comp: c,
        _source: 'land_comp',
    }));
}

// ============================================================
// Stage History — Date Editing
// ============================================================

export async function updateStageHistoryDate(id: string, changed_at: string) {
    const { error } = await supabase
        .from('pursuit_stage_history')
        .update({ changed_at })
        .eq('id', id);
    if (error) throw error;
}

// ============================================================
// Analytics Data — Pursuits + Stage History
// ============================================================

export interface AnalyticsData {
    pursuits: Pursuit[];
    stageHistory: import('@/types').PursuitStageHistory[];
    onePagers: OnePager[];
}

export async function fetchAnalyticsData(): Promise<AnalyticsData> {
    // Fetch all pursuits with stages (including archived for historical analysis)
    const { data: pursuits, error: pError } = await supabase
        .from('pursuits')
        .select('*, pursuit_stages(*)')
        .order('created_at', { ascending: false });
    if (pError) throw pError;

    // Fetch all stage history
    const { data: stageHistory, error: shError } = await supabase
        .from('pursuit_stage_history')
        .select('*')
        .order('changed_at', { ascending: true });
    if (shError) throw shError;

    // Fetch one-pagers for product type association
    const { data: onePagers, error: opError } = await supabase
        .from('one_pagers')
        .select('id, pursuit_id, product_type_id, product_types(name)')
        .eq('is_archived', false);
    if (opError) throw opError;

    return {
        pursuits: (pursuits ?? []).map((p: any) => ({ ...p, stage: p.pursuit_stages } as Pursuit)),
        stageHistory: stageHistory ?? [],
        onePagers: (onePagers ?? []).map((op: any) => ({ ...op, product_type: (op as any).product_types }) as unknown as OnePager),
    };
}

// ============================================================
// Land Comps
// ============================================================

export async function fetchLandComps(): Promise<LandComp[]> {
    const { data, error } = await supabase
        .from('land_comps')
        .select('*')
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
}

export async function fetchLandComp(id: string): Promise<LandComp> {
    const { data, error } = await supabase
        .from('land_comps')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function createLandComp(
    comp: Omit<LandComp, 'id' | 'created_at' | 'updated_at' | 'created_by'>
): Promise<LandComp> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('land_comps')
        .insert({ ...comp, created_by: user?.id ?? null })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateLandComp(id: string, updates: Partial<LandComp>) {
    const { data, error } = await supabase
        .from('land_comps')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteLandComp(id: string) {
    const { error } = await supabase.from('land_comps').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Pre-Dev Budgets
// ============================================================

const DEFAULT_LINE_ITEMS: { category: string; label: string; sort_order: number }[] = [
    { category: 'land_cost', label: 'Land Cost', sort_order: 1 },
    { category: 'earnest_money', label: 'Earnest Money', sort_order: 2 },
    { category: 'legal_fees', label: 'Legal Fees', sort_order: 3 },
    { category: 'arch_design', label: 'Architectural / Design Fees', sort_order: 4 },
    { category: 'environmental', label: 'Environmental Report', sort_order: 5 },
    { category: 'geotech', label: 'Geotech Report', sort_order: 6 },
    { category: 'civil_survey', label: 'Civil Engineering / Survey', sort_order: 7 },
    { category: 'structural_eng', label: 'Structural Engineering', sort_order: 8 },
    { category: 'mep_eng', label: 'MEP Engineering', sort_order: 9 },
    { category: 'interior_design', label: 'Interior Design', sort_order: 10 },
    { category: 'landscape_design', label: 'Landscape Design', sort_order: 11 },
    { category: 'city_permits', label: 'City Permit Fees', sort_order: 12 },
    { category: 'feasibility', label: 'Feasibility Reports', sort_order: 13 },
    { category: 'market_studies', label: 'Market Studies', sort_order: 14 },
    { category: 'misc_consultants', label: 'Misc. Other Consultants', sort_order: 15 },
    { category: 'other_dev_costs', label: 'Other Development Costs', sort_order: 16 },
];

export async function fetchPredevBudget(pursuitId: string): Promise<PredevBudget | null> {
    const { data, error } = await supabase
        .from('predev_budgets')
        .select('*, predev_budget_line_items(*)')
        .eq('pursuit_id', pursuitId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        ...data,
        line_items: (data.predev_budget_line_items ?? []).sort(
            (a: PredevBudgetLineItem, b: PredevBudgetLineItem) => a.sort_order - b.sort_order
        ),
    } as PredevBudget;
}

export async function createPredevBudget(
    pursuitId: string,
    startDate: string,
    durationMonths: number,
): Promise<PredevBudget> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('predev_budgets')
        .insert({
            pursuit_id: pursuitId,
            start_date: startDate,
            duration_months: durationMonths,
            created_by: user?.id ?? null,
        })
        .select()
        .single();
    if (error) throw error;

    // Seed default line items
    const lineItems = DEFAULT_LINE_ITEMS.map((li) => ({
        budget_id: data.id,
        ...li,
        is_custom: false,
        monthly_values: {},
    }));
    const { error: liError } = await supabase
        .from('predev_budget_line_items')
        .insert(lineItems);
    if (liError) throw liError;

    // Refetch with line items
    return (await fetchPredevBudget(pursuitId))!;
}

export async function updatePredevBudget(
    id: string,
    updates: Partial<Pick<PredevBudget, 'start_date' | 'duration_months' | 'notes'>>,
) {
    const { data, error } = await supabase
        .from('predev_budgets')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function upsertLineItemValues(
    lineItemId: string,
    monthlyValues: Record<string, MonthlyCell>,
) {
    const { data, error } = await supabase
        .from('predev_budget_line_items')
        .update({ monthly_values: monthlyValues })
        .eq('id', lineItemId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function addCustomLineItem(
    budgetId: string,
    label: string,
): Promise<PredevBudgetLineItem> {
    // Get max sort_order
    const { data: existing } = await supabase
        .from('predev_budget_line_items')
        .select('sort_order')
        .eq('budget_id', budgetId)
        .order('sort_order', { ascending: false })
        .limit(1);
    const maxSort = existing?.[0]?.sort_order ?? 16;

    const { data, error } = await supabase
        .from('predev_budget_line_items')
        .insert({
            budget_id: budgetId,
            category: `custom_${Date.now()}`,
            label,
            sort_order: maxSort + 1,
            is_custom: true,
            monthly_values: {},
        })
        .select()
        .single();
    if (error) throw error;
    return data as PredevBudgetLineItem;
}

export async function deleteLineItem(id: string) {
    const { error } = await supabase
        .from('predev_budget_line_items')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

export async function updateLineItemLabel(id: string, label: string) {
    const { data, error } = await supabase
        .from('predev_budget_line_items')
        .update({ label })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data as PredevBudgetLineItem;
}

/**
 * Fetch all pre-dev budgets for portfolio rollup.
 * Returns budget + pursuit metadata (name, region, stage).
 */
export interface PredevBudgetReportRow {
    budget: PredevBudget;
    pursuit: Pick<Pursuit, 'id' | 'name' | 'region' | 'stage_id' | 'city' | 'state'>;
    stage?: PursuitStage;
}

export async function fetchAllPredevBudgets(): Promise<PredevBudgetReportRow[]> {
    const { data, error } = await supabase
        .from('predev_budgets')
        .select(`
            *,
            predev_budget_line_items(*),
            pursuits!inner(id, name, region, stage_id, city, state, is_archived,
                pursuit_stages(*))
        `)
        .order('created_at', { ascending: false });
    if (error) throw error;

    return (data ?? [])
        .filter((d: any) => !d.pursuits?.is_archived)
        .map((d: any) => ({
            budget: {
                ...d,
                line_items: (d.predev_budget_line_items ?? []).sort(
                    (a: PredevBudgetLineItem, b: PredevBudgetLineItem) => a.sort_order - b.sort_order
                ),
                predev_budget_line_items: undefined,
                pursuits: undefined,
            } as PredevBudget,
            pursuit: {
                id: d.pursuits.id,
                name: d.pursuits.name,
                region: d.pursuits.region,
                stage_id: d.pursuits.stage_id,
                city: d.pursuits.city,
                state: d.pursuits.state,
            },
            stage: d.pursuits.pursuit_stages ?? undefined,
        }));
}

// ============================================================
// Key Date Types (Admin Lookup)
// ============================================================

export async function fetchKeyDateTypes(): Promise<KeyDateType[]> {
    const { data, error } = await supabase
        .from('key_date_types')
        .select('*')
        .order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function upsertKeyDateType(type: Partial<KeyDateType> & { id?: string }) {
    const { data, error } = await supabase
        .from('key_date_types')
        .upsert(type)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteKeyDateType(id: string) {
    const { error } = await supabase.from('key_date_types').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Key Dates (Per-Pursuit)
// ============================================================

export async function fetchKeyDates(pursuitId: string): Promise<KeyDate[]> {
    const { data, error } = await supabase
        .from('key_dates')
        .select('*, key_date_types(*)')
        .eq('pursuit_id', pursuitId)
        .order('sort_order')
        .order('date_value');
    if (error) throw error;
    return (data ?? []).map((d: any) => ({
        ...d,
        key_date_type: d.key_date_types ?? undefined,
        key_date_types: undefined,
    }));
}

export async function upsertKeyDate(keyDate: Partial<KeyDate> & { pursuit_id: string }) {
    // Strip joined fields
    const { key_date_type, ...payload } = keyDate as KeyDate;
    const { data, error } = await supabase
        .from('key_dates')
        .upsert(payload)
        .select('*, key_date_types(*)')
        .single();
    if (error) throw error;
    return {
        ...data,
        key_date_type: (data as any).key_date_types ?? undefined,
    } as KeyDate;
}

export async function deleteKeyDate(id: string) {
    const { error } = await supabase.from('key_dates').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Key Dates — Report Data (Flattened: one row per pursuit)
// ============================================================

export interface KeyDateReportRow {
    pursuit: Pick<Pursuit, 'id' | 'name' | 'region' | 'stage_id' | 'city' | 'state'>;
    stage?: PursuitStage;
    keyDates: KeyDate[];
    contractExecution: string | null;
    inspectionPeriod: string | null;
    closingDate: string | null;
    nextDate: { label: string; date: string; daysUntil: number } | null;
    totalDates: number;
    overdueCount: number;
}

export async function fetchKeyDateReportData(): Promise<KeyDateReportRow[]> {
    // Fetch all key dates with pursuit + stage
    const { data, error } = await supabase
        .from('key_dates')
        .select(`
            *,
            key_date_types(*),
            pursuits!inner(id, name, region, stage_id, city, state, is_archived,
                pursuit_stages(*))
        `)
        .order('date_value');
    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Group by pursuit
    const byPursuit = new Map<string, {
        pursuit: any;
        stage: any;
        dates: KeyDate[];
    }>();

    for (const row of (data ?? [])) {
        const p = (row as any).pursuits;
        if (p?.is_archived) continue;

        const pursuitId = p.id;
        if (!byPursuit.has(pursuitId)) {
            byPursuit.set(pursuitId, {
                pursuit: { id: p.id, name: p.name, region: p.region, stage_id: p.stage_id, city: p.city, state: p.state },
                stage: p.pursuit_stages ?? undefined,
                dates: [],
            });
        }
        byPursuit.get(pursuitId)!.dates.push({
            ...row,
            key_date_type: (row as any).key_date_types ?? undefined,
            pursuits: undefined,
            key_date_types: undefined,
        } as unknown as KeyDate);
    }

    return Array.from(byPursuit.values()).map((g) => {
        const dates = g.dates;
        // Find standard dates by type name
        const findByTypeName = (name: string) => {
            const d = dates.find(d => d.key_date_type?.name === name);
            return d?.date_value ?? null;
        };

        // Find next upcoming date
        const upcoming = dates
            .filter(d => d.status === 'upcoming' && new Date(d.date_value) >= today)
            .sort((a, b) => new Date(a.date_value).getTime() - new Date(b.date_value).getTime());
        const next = upcoming.length > 0 ? upcoming[0] : null;
        const nextLabel = next
            ? (next.key_date_type?.name ?? next.custom_label ?? 'Custom')
            : null;
        const nextDaysUntil = next
            ? Math.ceil((new Date(next.date_value).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        return {
            pursuit: g.pursuit,
            stage: g.stage,
            keyDates: dates,
            contractExecution: findByTypeName('Contract Execution'),
            inspectionPeriod: findByTypeName('Inspection Period End'),
            closingDate: findByTypeName('Closing Date'),
            nextDate: next ? { label: nextLabel!, date: next.date_value, daysUntil: nextDaysUntil } : null,
            totalDates: dates.length,
            overdueCount: dates.filter(d => d.status === 'overdue').length,
        };
    });
}

// ============================================================
// Checklist Templates (Admin)
// ============================================================

export async function fetchChecklistTemplates(): Promise<ChecklistTemplate[]> {
    const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .order('name');
    if (error) throw error;
    return data ?? [];
}

export async function fetchChecklistTemplate(id: string): Promise<ChecklistTemplate> {
    const { data, error } = await supabase
        .from('checklist_templates')
        .select(`
            *,
            checklist_template_phases(
                *,
                checklist_template_tasks(
                    *,
                    checklist_template_checklist_items(*)
                )
            )
        `)
        .eq('id', id)
        .single();
    if (error) throw error;
    const template = data as any;
    return {
        ...template,
        phases: (template.checklist_template_phases ?? []).map((p: any) => ({
            ...p,
            tasks: (p.checklist_template_tasks ?? []).map((t: any) => ({
                ...t,
                checklist_items: (t.checklist_template_checklist_items ?? []).sort(
                    (a: any, b: any) => a.sort_order - b.sort_order
                ),
                checklist_template_checklist_items: undefined,
            })).sort((a: any, b: any) => a.sort_order - b.sort_order),
            checklist_template_tasks: undefined,
        })).sort((a: any, b: any) => a.sort_order - b.sort_order),
        checklist_template_phases: undefined,
    } as ChecklistTemplate;
}

export async function upsertChecklistTemplate(template: Partial<ChecklistTemplate> & { id?: string }) {
    const { phases, ...row } = template as ChecklistTemplate;
    const { data, error } = await supabase
        .from('checklist_templates')
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return data as ChecklistTemplate;
}

export async function upsertTemplatePhase(phase: Partial<ChecklistTemplatePhase> & { template_id: string }) {
    const { tasks, ...row } = phase as ChecklistTemplatePhase;
    const { data, error } = await supabase
        .from('checklist_template_phases')
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return data as ChecklistTemplatePhase;
}

export async function deleteTemplatePhase(id: string) {
    const { error } = await supabase.from('checklist_template_phases').delete().eq('id', id);
    if (error) throw error;
}

export async function upsertTemplateTask(task: Partial<ChecklistTemplateTask> & { phase_id: string }) {
    const { checklist_items, ...row } = task as ChecklistTemplateTask;
    const { data, error } = await supabase
        .from('checklist_template_tasks')
        .upsert(row)
        .select()
        .single();
    if (error) throw error;
    return data as ChecklistTemplateTask;
}

export async function deleteTemplateTask(id: string) {
    const { error } = await supabase.from('checklist_template_tasks').delete().eq('id', id);
    if (error) throw error;
}

export async function upsertTemplateChecklistItem(item: Partial<ChecklistTemplateChecklistItem> & { task_id: string }) {
    const { data, error } = await supabase
        .from('checklist_template_checklist_items')
        .upsert(item)
        .select()
        .single();
    if (error) throw error;
    return data as ChecklistTemplateChecklistItem;
}

export async function deleteTemplateChecklistItem(id: string) {
    const { error } = await supabase.from('checklist_template_checklist_items').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Pursuit Checklist Instances
// ============================================================

export async function fetchPursuitChecklistInstance(pursuitId: string): Promise<PursuitChecklistInstance | null> {
    const { data, error } = await supabase
        .from('pursuit_checklist_instances')
        .select('*')
        .eq('pursuit_id', pursuitId)
        .maybeSingle();
    if (error) throw error;
    return data as PursuitChecklistInstance | null;
}

export async function applyTemplateToPursuit(pursuitId: string, templateId: string): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc('apply_template_to_pursuit', {
        p_pursuit_id: pursuitId,
        p_template_id: templateId,
        p_applied_by: user?.id ?? null,
    });
    if (error) throw error;
    return data as string;
}

// ============================================================
// Pursuit Milestones
// ============================================================

export async function fetchPursuitMilestones(pursuitId: string): Promise<PursuitMilestone[]> {
    const { data, error } = await supabase
        .from('pursuit_milestones')
        .select('*')
        .eq('pursuit_id', pursuitId)
        .order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function upsertPursuitMilestone(milestone: Partial<PursuitMilestone> & { id: string }) {
    const { data, error } = await supabase
        .from('pursuit_milestones')
        .update({ target_date: milestone.target_date, is_confirmed: milestone.is_confirmed })
        .eq('id', milestone.id)
        .select()
        .single();
    if (error) throw error;
    return data as PursuitMilestone;
}

// ============================================================
// Pursuit Checklist — Phases & Tasks
// ============================================================

export async function fetchPursuitChecklist(pursuitId: string): Promise<PursuitChecklistPhase[]> {
    const { data, error } = await supabase
        .from('pursuit_checklist_phases')
        .select(`
            *,
            pursuit_checklist_tasks(
                *,
                pursuit_checklist_items(*)
            )
        `)
        .eq('pursuit_id', pursuitId)
        .order('sort_order');
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
        ...p,
        tasks: (p.pursuit_checklist_tasks ?? []).map((t: any) => ({
            ...t,
            checklist_items: (t.pursuit_checklist_items ?? []).sort(
                (a: any, b: any) => a.sort_order - b.sort_order
            ),
            pursuit_checklist_items: undefined,
        })).sort((a: any, b: any) => a.sort_order - b.sort_order),
        pursuit_checklist_tasks: undefined,
    })) as PursuitChecklistPhase[];
}

export async function updateChecklistTask(
    taskId: string,
    updates: Partial<Pick<PursuitChecklistTask, 'status' | 'assigned_to' | 'due_date' | 'due_date_is_manual' | 'name' | 'description'>>
) {
    const { data, error } = await supabase
        .from('pursuit_checklist_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();
    if (error) throw error;
    return data as PursuitChecklistTask;
}

export async function addChecklistTask(
    phaseId: string,
    pursuitId: string,
    task: { name: string; sort_order: number }
): Promise<PursuitChecklistTask> {
    const { data, error } = await supabase
        .from('pursuit_checklist_tasks')
        .insert({ phase_id: phaseId, pursuit_id: pursuitId, ...task })
        .select()
        .single();
    if (error) throw error;
    return data as PursuitChecklistTask;
}

export async function deleteChecklistTask(id: string) {
    const { error } = await supabase.from('pursuit_checklist_tasks').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Pursuit Checklist Items (Sub-checkboxes)
// ============================================================

export async function toggleChecklistItem(itemId: string, isChecked: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('pursuit_checklist_items')
        .update({
            is_checked: isChecked,
            checked_by: isChecked ? user?.id ?? null : null,
            checked_at: isChecked ? new Date().toISOString() : null,
        })
        .eq('id', itemId)
        .select()
        .single();
    if (error) throw error;
    return data as PursuitChecklistItem;
}

export async function addChecklistItem(
    taskId: string,
    label: string,
    sortOrder: number
): Promise<PursuitChecklistItem> {
    const { data, error } = await supabase
        .from('pursuit_checklist_items')
        .insert({ task_id: taskId, label, sort_order: sortOrder })
        .select()
        .single();
    if (error) throw error;
    return data as PursuitChecklistItem;
}

export async function deleteChecklistItem(id: string) {
    const { error } = await supabase.from('pursuit_checklist_items').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// Task Notes
// ============================================================

export async function fetchTaskNotes(taskId: string): Promise<TaskNote[]> {
    const { data, error } = await supabase
        .from('task_notes')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at');
    if (error) throw error;
    return (data ?? []) as TaskNote[];
}

export async function createTaskNote(taskId: string, content: string): Promise<TaskNote> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('task_notes')
        .insert({ task_id: taskId, author_id: user?.id ?? '', content, author_type: 'internal' })
        .select()
        .single();
    if (error) throw error;
    return data as TaskNote;
}

// ============================================================
// Task Activity Log (Read-only — populated by triggers)
// ============================================================

export async function fetchTaskActivity(taskId: string): Promise<TaskActivityLog[]> {
    const { data, error } = await supabase
        .from('task_activity_log')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return (data ?? []) as TaskActivityLog[];
}

// ============================================================
// Hellodata Rent Comps
// ============================================================

import type { PursuitRentComp, HellodataProperty } from '@/types';

/** Fetch ALL rent comps across all pursuits — for reports */
export async function fetchAllRentComps(): Promise<ReportRow[]> {
    const { data, error } = await supabase
        .from('pursuit_rent_comps')
        .select(`
            *,
            pursuit:pursuits!pursuit_id(id, name, region, stage_id, city, state),
            property:hellodata_properties(
                id, hellodata_id, building_name, street_address, city, state, zip_code,
                lat, lon, year_built, number_units, number_stories, msa,
                management_company, building_quality, pricing_strategy,
                building_amenities, unit_amenities, occupancy_over_time,
                units:hellodata_units(*),
                concessions:hellodata_concessions(*)
            )
        `)
        .order('pursuit_id');
    if (error) throw error;

    return (data ?? []).map((row: any) => ({
        pursuit: row.pursuit as Pursuit,
        onePager: null,
        rentComp: {
            property: row.property as HellodataProperty,
            units: (row.property?.units ?? []) as HellodataUnit[],
            concessions: (row.property?.concessions ?? []) as HellodataConcession[],
            compType: row.comp_type ?? 'primary',
        },
        _source: 'rent_comp' as const,
    }));
}


/** Fetch rent comps linked to a pursuit, with joined property + units + concessions */
export async function fetchPursuitRentComps(pursuitId: string): Promise<PursuitRentComp[]> {
    const { data, error } = await supabase
        .from('pursuit_rent_comps')
        .select(`
            *,
            property:hellodata_properties(
                id, hellodata_id, building_name, street_address, city, state, zip_code,
                lat, lon, year_built, number_units, number_stories, msa,
                management_company, building_website, building_phone,
                is_single_family, is_apartment, is_condo, is_senior, is_student,
                is_build_to_rent, is_affordable, is_lease_up,
                building_quality, pricing_strategy, review_analysis,
                demographics, fees, occupancy_over_time,
                building_amenities, unit_amenities,
                fetched_at, data_as_of, created_at, updated_at,
                units:hellodata_units(*),
                concessions:hellodata_concessions(*)
            )
        `)
        .eq('pursuit_id', pursuitId)
        .order('sort_order');
    if (error) throw error;
    return (data ?? []) as unknown as PursuitRentComp[];
}

/** Link a Hellodata property as a rent comp for a pursuit */
export async function linkRentCompToPursuit(
    pursuitId: string,
    propertyId: string,
    notes?: string
): Promise<PursuitRentComp> {
    // Use getSession() instead of getUser() — getSession reads local cache,
    // getUser makes a network call that can hang intermittently
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    console.log('[linkRentComp] Step A: got session, userId:', userId);

    const { error } = await supabase
        .from('pursuit_rent_comps')
        .upsert({
            pursuit_id: pursuitId,
            property_id: propertyId,
            added_by: userId,
            notes: notes ?? null,
        }, { onConflict: 'pursuit_id, property_id' });

    console.log('[linkRentComp] Step B: upsert complete, error:', error?.message ?? 'none');

    if (error) {
        throw error;
    }

    // Return a minimal object — the full data is refetched by query invalidation
    return {
        id: '',
        pursuit_id: pursuitId,
        property_id: propertyId,
        added_by: userId,
        added_at: new Date().toISOString(),
        notes: notes ?? null,
        sort_order: 0,
        comp_type: 'primary',
    };
}

/** Remove a rent comp link from a pursuit (does NOT delete the cached property) */
export async function unlinkRentCompFromPursuit(pursuitId: string, propertyId: string) {
    const { error } = await supabase
        .from('pursuit_rent_comps')
        .delete()
        .eq('pursuit_id', pursuitId)
        .eq('property_id', propertyId);
    if (error) throw error;
}

/** Look up a cached Hellodata property by its Hellodata ID */
export async function fetchHellodataPropertyByHdId(hellodataId: string): Promise<HellodataProperty | null> {
    const { data, error } = await supabase
        .from('hellodata_properties')
        .select('*, hellodata_units(*), hellodata_concessions(*)')
        .eq('hellodata_id', hellodataId)
        .maybeSingle();
    if (error) throw error;
    return data as unknown as HellodataProperty | null;
}

/** Update the comp_type (primary/secondary) for a pursuit rent comp */
export async function updateRentCompType(
    pursuitId: string,
    propertyId: string,
    compType: 'primary' | 'secondary'
): Promise<void> {
    const { error } = await supabase
        .from('pursuit_rent_comps')
        .update({ comp_type: compType })
        .eq('pursuit_id', pursuitId)
        .eq('property_id', propertyId);
    if (error) throw error;
}
