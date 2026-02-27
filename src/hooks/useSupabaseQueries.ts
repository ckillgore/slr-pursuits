'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as queries from '@/lib/supabase/queries';
import type { Pursuit, PursuitStage, ProductType, LandComp } from '@/types';

// ============================================================
// Query Keys
// ============================================================
export const queryKeys = {
    stages: ['stages'] as const,
    productTypes: ['product-types'] as const,
    pursuits: ['pursuits'] as const,
    pursuit: (id: string) => ['pursuits', id] as const,
    onePagers: (pursuitId: string) => ['one-pagers', pursuitId] as const,
    onePager: (id: string) => ['one-pager', id] as const,
    unitMix: (onePagerId: string) => ['unit-mix', onePagerId] as const,
    payroll: (onePagerId: string) => ['payroll', onePagerId] as const,
    softCosts: (onePagerId: string) => ['soft-costs', onePagerId] as const,
    reportTemplates: ['report-templates'] as const,
    reportData: ['report-data'] as const,
    analyticsData: ['analytics-data'] as const,
    landComps: ['land-comps'] as const,
    landComp: (id: string) => ['land-comps', id] as const,
};

// ============================================================
// Stages
// ============================================================

export function useStages() {
    return useQuery({
        queryKey: queryKeys.stages,
        queryFn: queries.fetchStages,
    });
}

export function useUpsertStage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (stage: Partial<PursuitStage> & { id?: string }) =>
            queries.upsertStage(stage),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stages }),
    });
}

export function useDeleteStage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deleteStage(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stages }),
    });
}

// ============================================================
// Product Types
// ============================================================

export function useProductTypes() {
    return useQuery({
        queryKey: queryKeys.productTypes,
        queryFn: queries.fetchProductTypes,
    });
}

export function useUpsertProductType() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (pt: Partial<ProductType> & { id?: string }) =>
            queries.upsertProductType(pt),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.productTypes }),
    });
}

export function useDeleteProductType() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deleteProductType(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.productTypes }),
    });
}

// ============================================================
// Pursuits
// ============================================================

export function usePursuits() {
    return useQuery({
        queryKey: queryKeys.pursuits,
        queryFn: queries.fetchPursuits,
    });
}

export function usePursuit(id: string) {
    return useQuery({
        queryKey: queryKeys.pursuit(id),
        queryFn: () => queries.fetchPursuit(id),
        enabled: !!id,
    });
}

export function useCreatePursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: queries.createPursuit,
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pursuits }),
    });
}

export function useUpdatePursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Pursuit> }) =>
            queries.updatePursuit(id, updates),
        onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuit(id) });
            qc.invalidateQueries({ queryKey: queryKeys.pursuits });
        },
    });
}

export function useDeletePursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deletePursuit(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pursuits }),
    });
}

// ============================================================
// One-Pagers
// ============================================================

export function useOnePagers(pursuitId: string) {
    return useQuery({
        queryKey: queryKeys.onePagers(pursuitId),
        queryFn: () => queries.fetchOnePagersByPursuit(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useOnePager(id: string) {
    return useQuery({
        queryKey: queryKeys.onePager(id),
        queryFn: () => queries.fetchOnePager(id),
        enabled: !!id,
    });
}

export function useCreateOnePager() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: queries.createOnePager,
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: queryKeys.onePagers(data.pursuit_id) });
        },
    });
}

export function useUpdateOnePager() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<import('@/types').OnePager> }) =>
            queries.updateOnePager(id, updates),
        // Optimistic: update cache immediately
        onMutate: async ({ id, updates }) => {
            await qc.cancelQueries({ queryKey: queryKeys.onePager(id) });
            const prev = qc.getQueryData(queryKeys.onePager(id));
            qc.setQueryData(queryKeys.onePager(id), (old: any) =>
                old ? { ...old, ...updates } : old
            );
            return { prev };
        },
        onError: (_err, { id }, ctx) => {
            if (ctx?.prev) qc.setQueryData(queryKeys.onePager(id), ctx.prev);
        },
        onSettled: (_, __, { id }) => {
            // Don't refetch aggressively during auto-save — just invalidate quietly
            qc.invalidateQueries({ queryKey: queryKeys.onePager(id), refetchType: 'none' });
        },
    });
}

export function useDeleteOnePager() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.deleteOnePager(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.onePagers(pursuitId) });
        },
    });
}

// ============================================================
// Unit Mix
// ============================================================

export function useUnitMix(onePagerId: string) {
    return useQuery({
        queryKey: queryKeys.unitMix(onePagerId),
        queryFn: () => queries.fetchUnitMix(onePagerId),
        enabled: !!onePagerId,
    });
}

export function useUpsertUnitMixRow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (row: Partial<import('@/types').UnitMixRow> & { id: string }) =>
            queries.upsertUnitMixRow(row),
        onMutate: async (row) => {
            const key = queryKeys.unitMix(row.one_pager_id!);
            await qc.cancelQueries({ queryKey: key });
            const prev = qc.getQueryData(key);
            qc.setQueryData(key, (old: any[] | undefined) => {
                if (!old) return [row];
                const exists = old.some((r: any) => r.id === row.id);
                if (exists) {
                    return old.map((r: any) => (r.id === row.id ? { ...r, ...row } : r));
                }
                return [...old, row];
            });
            return { prev, key };
        },
        onError: (_err, _row, ctx) => {
            if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
        },
        onSettled: (_data, _err, row) => {
            qc.invalidateQueries({ queryKey: queryKeys.unitMix(row.one_pager_id!) });
        },
    });
}

export function useUpsertUnitMixRows() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (rows: import('@/types').UnitMixRow[]) =>
            queries.upsertUnitMixRows(rows),
        onSuccess: (_, rows) => {
            if (rows.length > 0) {
                qc.invalidateQueries({ queryKey: queryKeys.unitMix(rows[0].one_pager_id) });
            }
        },
    });
}

export function useDeleteUnitMixRow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, onePagerId }: { id: string; onePagerId: string }) =>
            queries.deleteUnitMixRow(id),
        onMutate: async ({ id, onePagerId }) => {
            const key = queryKeys.unitMix(onePagerId);
            await qc.cancelQueries({ queryKey: key });
            const prev = qc.getQueryData(key);
            qc.setQueryData(key, (old: any[] | undefined) =>
                old ? old.filter((r: any) => r.id !== id) : old
            );
            return { prev, key };
        },
        onError: (err, _vars, ctx) => {
            console.error('Delete unit mix row failed:', err);
            if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
        },
        onSettled: (_, __, { onePagerId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.unitMix(onePagerId) });
        },
    });
}

// ============================================================
// Payroll
// ============================================================

export function usePayroll(onePagerId: string) {
    return useQuery({
        queryKey: queryKeys.payroll(onePagerId),
        queryFn: () => queries.fetchPayroll(onePagerId),
        enabled: !!onePagerId,
    });
}

export function useUpsertPayrollRow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (row: Partial<import('@/types').PayrollRow> & { one_pager_id: string }) =>
            queries.upsertPayrollRow(row),
        onSuccess: (_, row) => {
            qc.invalidateQueries({ queryKey: queryKeys.payroll(row.one_pager_id) });
        },
    });
}

export function useDeletePayrollRow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, onePagerId }: { id: string; onePagerId: string }) =>
            queries.deletePayrollRow(id),
        onSuccess: (_, { onePagerId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.payroll(onePagerId) });
        },
    });
}

// ============================================================
// Soft Cost Details
// ============================================================

export function useSoftCostDetails(onePagerId: string) {
    return useQuery({
        queryKey: queryKeys.softCosts(onePagerId),
        queryFn: () => queries.fetchSoftCostDetails(onePagerId),
        enabled: !!onePagerId,
    });
}

export function useUpsertSoftCostRow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (row: Partial<import('@/types').SoftCostDetailRow> & { id?: string; one_pager_id: string }) =>
            queries.upsertSoftCostRow(row),
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: queryKeys.softCosts(variables.one_pager_id) });
        },
    });
}

export function useDeleteSoftCostRow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, onePagerId }: { id: string; onePagerId: string }) =>
            queries.deleteSoftCostRow(id),
        onSuccess: (_, { onePagerId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.softCosts(onePagerId) });
        },
    });
}

// ============================================================
// Duplicate & Archive
// ============================================================

export function useDuplicateOnePager() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ sourceId, newName }: { sourceId: string; newName: string }) =>
            queries.duplicateOnePager(sourceId, newName),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: queryKeys.onePagers(data.pursuit_id) });
            qc.invalidateQueries({ queryKey: queryKeys.pursuits });
        },
    });
}

export function useArchiveOnePager() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.archiveOnePager(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.onePagers(pursuitId) });
            qc.invalidateQueries({ queryKey: queryKeys.pursuits });
        },
    });
}

export function useArchivePursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.archivePursuit(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuits });
        },
    });
}

// ============================================================
// Data Model Templates
// ============================================================

export function useTemplates() {
    return useQuery({
        queryKey: ['templates'],
        queryFn: () => queries.fetchTemplates(),
    });
}

export function useUpsertTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (template: Partial<import('@/types').DataModelTemplate> & { id?: string }) =>
            queries.upsertTemplate(template),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['templates'] });
        },
    });
}

export function useDeleteTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deleteTemplate(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['templates'] });
        },
    });
}

export function useUpsertPayrollDefault() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (row: Partial<import('@/types').DataModelPayrollDefault> & { id?: string; data_model_id: string }) =>
            queries.upsertPayrollDefault(row),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['templates'] });
        },
    });
}

export function useDeletePayrollDefault() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deletePayrollDefault(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['templates'] });
        },
    });
}

// ============================================================
// Report Templates
// ============================================================

export function useReportTemplates() {
    return useQuery({
        queryKey: queryKeys.reportTemplates,
        queryFn: queries.fetchReportTemplates,
    });
}

export function useCreateReportTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: queries.createReportTemplate,
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reportTemplates }),
    });
}

export function useUpdateReportTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<import('@/types').ReportTemplate> }) =>
            queries.updateReportTemplate(id, updates),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reportTemplates }),
    });
}

export function useDeleteReportTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deleteReportTemplate(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reportTemplates }),
    });
}

export function useShareReportTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.shareReportTemplate(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reportTemplates }),
    });
}

export function useUnshareReportTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.unshareReportTemplate(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reportTemplates }),
    });
}

// ============================================================
// Report Data
// ============================================================

export function useReportData() {
    return useQuery({
        queryKey: queryKeys.reportData,
        queryFn: queries.fetchReportData,
    });
}

export function useAnalyticsData() {
    return useQuery({
        queryKey: queryKeys.analyticsData,
        queryFn: queries.fetchAnalyticsData,
    });
}

export function useUpdateStageHistoryDate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, changed_at }: { id: string; changed_at: string }) =>
            queries.updateStageHistoryDate(id, changed_at),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.analyticsData });
        },
    });
}

export function useLandCompReportData() {
    return useQuery({
        queryKey: ['land-comp-report-data'] as const,
        queryFn: queries.fetchLandCompReportData,
    });
}

// ============================================================
// Land Comps
// ============================================================

export function useLandComps() {
    return useQuery({
        queryKey: queryKeys.landComps,
        queryFn: queries.fetchLandComps,
    });
}

export function useLandComp(id: string) {
    return useQuery({
        queryKey: queryKeys.landComp(id),
        queryFn: () => queries.fetchLandComp(id),
        enabled: !!id,
    });
}

export function useCreateLandComp() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: queries.createLandComp,
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.landComps }),
    });
}

export function useUpdateLandComp() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<LandComp> }) =>
            queries.updateLandComp(id, updates),
        onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: queryKeys.landComp(id) });
            qc.invalidateQueries({ queryKey: queryKeys.landComps });
        },
    });
}

export function useDeleteLandComp() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deleteLandComp(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.landComps }),
    });
}

// ============================================================
// Pre-Dev Budgets
// ============================================================

export function usePredevBudget(pursuitId: string) {
    return useQuery({
        queryKey: ['predev-budget', pursuitId] as const,
        queryFn: () => queries.fetchPredevBudget(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useCreatePredevBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId, startDate, durationMonths }: {
            pursuitId: string; startDate: string; durationMonths: number;
        }) => queries.createPredevBudget(pursuitId, startDate, durationMonths),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', data.pursuit_id] });
        },
    });
}

export function useUpdatePredevBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId, updates }: {
            id: string;
            pursuitId: string;
            updates: Partial<Pick<import('@/types').PredevBudget, 'start_date' | 'duration_months' | 'notes'>>;
        }) => queries.updatePredevBudget(id, updates),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId] });
        },
    });
}

export function useUpsertLineItemValues() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ lineItemId, monthlyValues, pursuitId }: {
            lineItemId: string;
            monthlyValues: Record<string, import('@/types').MonthlyCell>;
            pursuitId: string;
        }) => queries.upsertLineItemValues(lineItemId, monthlyValues),
        onMutate: async ({ lineItemId, monthlyValues, pursuitId }) => {
            const key = ['predev-budget', pursuitId] as const;
            await qc.cancelQueries({ queryKey: key });
            const prev = qc.getQueryData(key);
            qc.setQueryData(key, (old: any) => {
                if (!old?.line_items) return old;
                return {
                    ...old,
                    line_items: old.line_items.map((li: any) =>
                        li.id === lineItemId ? { ...li, monthly_values: monthlyValues } : li
                    ),
                };
            });
            return { prev, key };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
        },
        onSettled: (_, __, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId], refetchType: 'none' });
        },
    });
}

export function useAddCustomLineItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ budgetId, label, pursuitId }: {
            budgetId: string; label: string; pursuitId: string;
        }) => queries.addCustomLineItem(budgetId, label),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId] });
        },
    });
}

export function useDeleteLineItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.deleteLineItem(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId] });
        },
    });
}

export function useUpdateLineItemLabel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, label, pursuitId }: { id: string; label: string; pursuitId: string }) =>
            queries.updateLineItemLabel(id, label),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId] });
        },
    });
}

export function useAllPredevBudgets() {
    return useQuery({
        queryKey: ['all-predev-budgets'] as const,
        queryFn: queries.fetchAllPredevBudgets,
    });
}

// ============================================================
// Key Date Types (Admin)
// ============================================================

export function useKeyDateTypes() {
    return useQuery({
        queryKey: ['key-date-types'] as const,
        queryFn: queries.fetchKeyDateTypes,
    });
}

export function useUpsertKeyDateType() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (type: Partial<import('@/types').KeyDateType> & { id?: string }) =>
            queries.upsertKeyDateType(type),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['key-date-types'] }),
    });
}

export function useDeleteKeyDateType() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deleteKeyDateType(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['key-date-types'] }),
    });
}

// ============================================================
// Key Dates (Per-Pursuit)
// ============================================================

export function useKeyDates(pursuitId: string) {
    return useQuery({
        queryKey: ['key-dates', pursuitId] as const,
        queryFn: () => queries.fetchKeyDates(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useUpsertKeyDate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (keyDate: Partial<import('@/types').KeyDate> & { pursuit_id: string }) =>
            queries.upsertKeyDate(keyDate),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['key-dates', data.pursuit_id] });
        },
    });
}

export function useDeleteKeyDate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.deleteKeyDate(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['key-dates', pursuitId] });
        },
    });
}

export function useKeyDateReportData() {
    return useQuery({
        queryKey: ['key-date-report-data'] as const,
        queryFn: queries.fetchKeyDateReportData,
    });
}

