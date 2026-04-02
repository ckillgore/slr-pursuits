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
    unitPremiums: (onePagerId: string) => ['unit-premiums', onePagerId] as const,
    reportTemplates: ['report-templates'] as const,
    reportData: ['report-data'] as const,
    analyticsData: ['analytics-data'] as const,
    landComps: ['land-comps'] as const,
    landComp: (id: string) => ['land-comps', id] as const,
    checklistTemplates: ['checklist-templates'] as const,
    checklistTemplate: (id: string) => ['checklist-template', id] as const,
    pursuitChecklist: (pursuitId: string) => ['pursuit-checklist', pursuitId] as const,
    pursuitMilestones: (pursuitId: string) => ['pursuit-milestones', pursuitId] as const,
    taskNotes: (taskId: string) => ['task-notes', taskId] as const,
    taskActivity: (taskId: string) => ['task-activity', taskId] as const,
    entityComments: (entityType: string, entityId: string) => ['entity-comments', entityType, entityId] as const,
    users: ['users'] as const,
    myMentionCount: (userId: string) => ['my-mention-count', userId] as const,
    saleComps: ['sale-comps'] as const,
    saleComp: (id: string) => ['sale-comps', id] as const,
    pursuitLandComps: (pursuitId: string) => ['pursuit-land-comps', pursuitId] as const,
    pursuitSaleComps: (pursuitId: string) => ['pursuit-sale-comps', pursuitId] as const,
    pursuitTeamMembers: (pursuitId: string) => ['pursuit-team-members', pursuitId] as const,
    externalTaskParties: ['external-task-parties'] as const,
    myTasks: (userId: string) => ['my-tasks', userId] as const,
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

export function useProductTypes(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.productTypes,
        queryFn: queries.fetchProductTypes,
        enabled: opts?.enabled ?? true,
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

export function usePursuit(idOrShortId: string) {
    const qc = useQueryClient();
    const isUuid = idOrShortId.length === 36 && idOrShortId.includes('-');
    return useQuery({
        queryKey: queryKeys.pursuit(idOrShortId),
        queryFn: async () => {
            const data = isUuid ? await queries.fetchPursuit(idOrShortId) : await queries.fetchPursuitByShortId(idOrShortId);
            // Cross-populate cache so UUID and short_id share data
            const altKey = isUuid ? data.short_id : data.id;
            if (altKey && altKey !== idOrShortId) {
                qc.setQueryData(queryKeys.pursuit(altKey), data);
            }
            return data;
        },
        enabled: !!idOrShortId,
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
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Pursuit>; queryId?: string }) =>
            queries.updatePursuit(id, updates),
        onSuccess: (_, { id, queryId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuit(id) });
            if (queryId && queryId !== id) {
                qc.invalidateQueries({ queryKey: queryKeys.pursuit(queryId) });
            }
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

export function useOnePager(idOrShortId: string) {
    const qc = useQueryClient();
    const isUuid = idOrShortId.length === 36 && idOrShortId.includes('-');
    return useQuery({
        queryKey: queryKeys.onePager(idOrShortId),
        queryFn: async () => {
            const data = isUuid ? await queries.fetchOnePager(idOrShortId) : await queries.fetchOnePagerByShortId(idOrShortId);
            const altKey = isUuid ? data.short_id : data.id;
            if (altKey && altKey !== idOrShortId) {
                qc.setQueryData(queryKeys.onePager(altKey), data);
            }
            return data;
        },
        enabled: !!idOrShortId,
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
        mutationFn: ({ id, updates }: { id: string; updates: Partial<import('@/types').OnePager>; queryId?: string }) =>
            queries.updateOnePager(id, updates),
        // Optimistic: update cache immediately
        onMutate: async ({ id, updates, queryId }) => {
            // Cancel both possible query keys (UUID and short_id)
            await qc.cancelQueries({ queryKey: queryKeys.onePager(id) });
            if (queryId && queryId !== id) {
                await qc.cancelQueries({ queryKey: queryKeys.onePager(queryId) });
            }

            const prev = qc.getQueryData(queryKeys.onePager(id));
            const prevByQueryId = queryId && queryId !== id ? qc.getQueryData(queryKeys.onePager(queryId)) : undefined;

            // Update cache for UUID key
            qc.setQueryData(queryKeys.onePager(id), (old: any) =>
                old ? { ...old, ...updates } : old
            );
            // Also update cache for the short_id key (the one the reading component uses)
            if (queryId && queryId !== id) {
                qc.setQueryData(queryKeys.onePager(queryId), (old: any) =>
                    old ? { ...old, ...updates } : old
                );
            }
            return { prev, prevByQueryId, queryId };
        },
        onError: (_err, { id, queryId }, ctx) => {
            if (ctx?.prev) qc.setQueryData(queryKeys.onePager(id), ctx.prev);
            if (ctx?.prevByQueryId && ctx?.queryId && ctx.queryId !== id) {
                qc.setQueryData(queryKeys.onePager(ctx.queryId), ctx.prevByQueryId);
            }
        },
        onSettled: (_, __, { id, queryId }) => {
            // Invalidate the single one-pager (quiet — don't refetch while auto-saving)
            qc.invalidateQueries({ queryKey: queryKeys.onePager(id), refetchType: 'none' });
            if (queryId && queryId !== id) {
                qc.invalidateQueries({ queryKey: queryKeys.onePager(queryId), refetchType: 'none' });
            }

            // Also invalidate the one-pagers list and parent pursuit so Overview KPIs
            // and One-Pagers tab cards reflect the latest calculated fields.
            const cached = (qc.getQueryData(queryKeys.onePager(id)) || qc.getQueryData(queryKeys.onePager(queryId || id))) as any;
            const pursuitId = cached?.pursuit_id;
            if (pursuitId) {
                qc.invalidateQueries({ queryKey: queryKeys.onePagers(pursuitId) });
                qc.invalidateQueries({ queryKey: queryKeys.pursuit(pursuitId) });
                qc.invalidateQueries({ queryKey: queryKeys.pursuits });
            }
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
// Unit Premiums
// ============================================================

export function useUnitPremiums(onePagerId: string) {
    return useQuery({
        queryKey: queryKeys.unitPremiums(onePagerId),
        queryFn: () => queries.fetchUnitPremiums(onePagerId),
        enabled: !!onePagerId,
    });
}

export function useUpsertUnitPremium() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (row: Partial<import('@/types').UnitPremium> & { id?: string; one_pager_id: string }) =>
            queries.upsertUnitPremium(row),
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: queryKeys.unitPremiums(variables.one_pager_id) });
        },
    });
}

export function useDeleteUnitPremium() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, onePagerId }: { id: string; onePagerId: string }) =>
            queries.deleteUnitPremium(id),
        onSuccess: (_, { onePagerId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.unitPremiums(onePagerId) });
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

export function useTemplates(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['templates'],
        queryFn: () => queries.fetchTemplates(),
        enabled: opts?.enabled ?? true,
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

export function useReportData(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.reportData,
        queryFn: queries.fetchReportData,
        enabled: opts?.enabled ?? true,
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

export function useLandCompReportData(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['land-comp-report-data'] as const,
        queryFn: queries.fetchLandCompReportData,
        enabled: opts?.enabled ?? true,
    });
}

export function useRentCompReportData(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['rent-comp-report-data'] as const,
        queryFn: queries.fetchAllRentComps,
        enabled: opts?.enabled ?? true,
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

export function useLandComp(idOrShortId: string) {
    const qc = useQueryClient();
    const isUuid = idOrShortId.length === 36 && idOrShortId.includes('-');
    return useQuery({
        queryKey: queryKeys.landComp(idOrShortId),
        queryFn: async () => {
            const data = isUuid ? await queries.fetchLandComp(idOrShortId) : await queries.fetchLandCompByShortId(idOrShortId);
            const altKey = isUuid ? data.short_id : data.id;
            if (altKey && altKey !== idOrShortId) {
                qc.setQueryData(queryKeys.landComp(altKey), data);
            }
            return data;
        },
        enabled: !!idOrShortId,
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
        mutationFn: ({ id, updates }: { id: string; updates: Partial<LandComp>; queryId?: string }) =>
            queries.updateLandComp(id, updates),
        onSuccess: (_, { id, queryId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.landComp(id) });
            if (queryId && queryId !== id) {
                qc.invalidateQueries({ queryKey: queryKeys.landComp(queryId) });
            }
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

export function usePredevBudget(pursuitId: string, opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['predev-budget', pursuitId] as const,
        queryFn: () => queries.fetchPredevBudget(pursuitId),
        enabled: !!pursuitId && (opts?.enabled ?? true),
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

export function useAllPortfolioJobCostAggregates() {
    return useQuery({
        queryKey: ['all-portfolio-jobcost-aggregates'] as const,
        queryFn: async () => {
            const { fetchAllPortfolioJobCostAggregates } = await import('@/app/actions/accounting');
            return fetchAllPortfolioJobCostAggregates();
        },
    });
}

// ============================================================
// Budget Snapshots & Amendments
// ============================================================

export function useSnapshotBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ budgetId, pursuitId }: { budgetId: string; pursuitId: string }) =>
            queries.snapshotBudget(budgetId, pursuitId),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId] });
        },
    });
}

export function useAmendBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ budgetId, pursuitId, reason }: {
            budgetId: string; pursuitId: string; reason: string | null;
        }) => queries.amendBudget(budgetId, pursuitId, reason),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId] });
        },
    });
}

export function useBudgetAmendments(budgetId: string) {
    return useQuery({
        queryKey: ['budget-amendments', budgetId] as const,
        queryFn: () => queries.fetchBudgetAmendments(budgetId),
        enabled: !!budgetId,
    });
}

// ============================================================
// Funding Partners
// ============================================================

export function useFundingPartners(pursuitId: string) {
    return useQuery({
        queryKey: ['funding-partners', pursuitId] as const,
        queryFn: () => queries.fetchFundingPartners(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useAllFundingPartners() {
    return useQuery({
        queryKey: ['all-funding-partners'] as const,
        queryFn: () => queries.fetchAllFundingPartners(),
    });
}

export function useCreateFundingPartner() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (partner: { pursuit_id: string; name: string; is_slrh?: boolean; default_split_pct: number }) =>
            queries.createFundingPartner(partner),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['funding-partners', data.pursuit_id] });
        },
    });
}

export function useUpdateFundingPartner() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId, updates }: {
            id: string; pursuitId: string;
            updates: Partial<Pick<import('@/types').PursuitFundingPartner, 'name' | 'default_split_pct'>>;
        }) => queries.updateFundingPartner(id, updates),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['funding-partners', pursuitId] });
        },
    });
}

export function useDeleteFundingPartner() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.deleteFundingPartner(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['funding-partners', pursuitId] });
        },
    });
}

// ============================================================
// Funding Splits
// ============================================================

export function useFundingSplits(budgetId: string) {
    return useQuery({
        queryKey: ['funding-splits', budgetId] as const,
        queryFn: () => queries.fetchFundingSplits(budgetId),
        enabled: !!budgetId,
    });
}

export function useAllFundingSplits() {
    return useQuery({
        queryKey: ['all-funding-splits'] as const,
        queryFn: () => queries.fetchAllFundingSplits(),
    });
}

export function useUpsertFundingSplit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ split, budgetId }: {
            split: { budget_id: string; partner_id: string; month_key: string; split_pct: number };
            budgetId: string;
        }) => queries.upsertFundingSplit(split),
        onSuccess: (_, { budgetId }) => {
            qc.invalidateQueries({ queryKey: ['funding-splits', budgetId] });
        },
    });
}

// ============================================================
// Line Item Cost Groups
// ============================================================

export function useUpdateLineItemCostGroups() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ lineItemId, yardiCostGroups, pursuitId }: {
            lineItemId: string; yardiCostGroups: string[]; pursuitId: string;
        }) => queries.updateLineItemCostGroups(lineItemId, yardiCostGroups),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: ['predev-budget', pursuitId] });
        },
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

export function useKeyDates(pursuitId: string, opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['key-dates', pursuitId] as const,
        queryFn: () => queries.fetchKeyDates(pursuitId),
        enabled: !!pursuitId && (opts?.enabled ?? true),
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

export function useKeyDateReportData(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['key-date-report-data'] as const,
        queryFn: queries.fetchKeyDateReportData,
        enabled: opts?.enabled ?? true,
    });
}

// ============================================================
// Checklist Templates (Admin)
// ============================================================

export function useChecklistTemplates() {
    return useQuery({
        queryKey: queryKeys.checklistTemplates,
        queryFn: queries.fetchChecklistTemplates,
    });
}

export function useChecklistTemplate(id: string) {
    return useQuery({
        queryKey: queryKeys.checklistTemplate(id),
        queryFn: () => queries.fetchChecklistTemplate(id),
        enabled: !!id,
    });
}

export function useUpsertChecklistTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (template: Partial<import('@/types').ChecklistTemplate> & { id?: string }) =>
            queries.upsertChecklistTemplate(template),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.checklistTemplates }),
    });
}

export function useUpsertTemplatePhase() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (phase: Partial<import('@/types').ChecklistTemplatePhase> & { template_id: string }) =>
            queries.upsertTemplatePhase(phase),
        onSuccess: (_, { template_id }) => {
            qc.invalidateQueries({ queryKey: queryKeys.checklistTemplate(template_id) });
            qc.invalidateQueries({ queryKey: queryKeys.checklistTemplates });
        },
    });
}

export function useDeleteTemplatePhase() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, templateId }: { id: string; templateId: string }) =>
            queries.deleteTemplatePhase(id),
        onSuccess: (_, { templateId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.checklistTemplate(templateId) });
        },
    });
}

export function useUpsertTemplateTask() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ task, templateId }: { task: Partial<import('@/types').ChecklistTemplateTask> & { phase_id: string }; templateId: string }) =>
            queries.upsertTemplateTask(task),
        onSuccess: (_, { templateId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.checklistTemplate(templateId) });
        },
    });
}

export function useDeleteTemplateTask() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, templateId }: { id: string; templateId: string }) =>
            queries.deleteTemplateTask(id),
        onSuccess: (_, { templateId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.checklistTemplate(templateId) });
        },
    });
}

// ============================================================
// Pursuit Checklist
// ============================================================

export function usePursuitChecklist(pursuitId: string) {
    return useQuery({
        queryKey: queryKeys.pursuitChecklist(pursuitId),
        queryFn: () => queries.fetchPursuitChecklist(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useApplyTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId, templateId }: { pursuitId: string; templateId: string }) =>
            queries.applyTemplateToPursuit(pursuitId, templateId),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
            qc.invalidateQueries({ queryKey: queryKeys.pursuitMilestones(pursuitId) });
        },
    });
}

export function usePursuitMilestones(pursuitId: string) {
    return useQuery({
        queryKey: queryKeys.pursuitMilestones(pursuitId),
        queryFn: () => queries.fetchPursuitMilestones(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useUpsertMilestone() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (milestone: Partial<import('@/types').PursuitMilestone> & { id: string; pursuit_id?: string }) =>
            queries.upsertPursuitMilestone(milestone),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitMilestones(data.pursuit_id) });
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(data.pursuit_id) });
        },
    });
}

export function useUpdateChecklistTask() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, pursuitId, updates }: {
            taskId: string;
            pursuitId: string;
            updates: Partial<Pick<import('@/types').PursuitChecklistTask, 'status' | 'assigned_to' | 'assigned_to_type' | 'assigned_external_party_id' | 'external_portal_token' | 'external_portal_enabled' | 'due_date' | 'due_date_is_manual' | 'name' | 'description' | 'relative_milestone' | 'relative_due_days' | 'box_links'>>;
        }) => queries.updateChecklistTask(taskId, updates),
        onMutate: async ({ taskId, pursuitId, updates }) => {
            const queryKey = queryKeys.pursuitChecklist(pursuitId);
            await qc.cancelQueries({ queryKey });
            const previous = qc.getQueryData(queryKey);

            // Optimistically update the cache
            qc.setQueryData(queryKey, (old: import('@/types').PursuitChecklistPhase[] | undefined) => {
                if (!old) return old;
                return old.map(phase => ({
                    ...phase,
                    tasks: (phase.tasks ?? []).map(t => t.id === taskId ? { ...t, ...updates } : t)
                }));
            });

            return { previous, queryKey };
        },
        onError: (err, newTodo, context) => {
            if (context?.previous) {
                qc.setQueryData(context.queryKey, context.previous);
            }
        },
        onSettled: (_, __, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
            qc.invalidateQueries({ queryKey: ['my-tasks'] });
            qc.invalidateQueries({ queryKey: ['my-mention-count'] });
            qc.invalidateQueries({ queryKey: ['my-incomplete-tasks-count'] });
        },
    });
}

export function useAddChecklistPhase() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId, name, sortOrder }: { pursuitId: string; name: string; sortOrder: number }) =>
            queries.addChecklistPhase(pursuitId, name, sortOrder),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
        },
    });
}

export function useToggleChecklistItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ itemId, isChecked, pursuitId }: { itemId: string; isChecked: boolean; pursuitId: string }) =>
            queries.toggleChecklistItem(itemId, isChecked),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
        },
    });
}

export function useAddChecklistTask() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ phaseId, pursuitId, task }: {
            phaseId: string; pursuitId: string; task: { name: string; sort_order: number };
        }) => queries.addChecklistTask(phaseId, pursuitId, task),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
            qc.invalidateQueries({ queryKey: ['my-tasks'] });
            qc.invalidateQueries({ queryKey: ['my-mention-count'] });
        },
    });
}

export function useDeleteChecklistTask() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.deleteChecklistTask(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
            qc.invalidateQueries({ queryKey: ['my-tasks'] });
            qc.invalidateQueries({ queryKey: ['my-mention-count'] });
        },
    });
}

export function useAddChecklistItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, label, sortOrder, pursuitId }: {
            taskId: string; label: string; sortOrder: number; pursuitId: string;
        }) => queries.addChecklistItem(taskId, label, sortOrder),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
        },
    });
}

export function useDeleteChecklistItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.deleteChecklistItem(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
        },
    });
}

export function useDeleteChecklistPhase() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuitId }: { id: string; pursuitId: string }) =>
            queries.deleteChecklistPhase(id),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
        },
    });
}

export function useDeleteChecklistInstance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId }: { pursuitId: string }) =>
            queries.deleteChecklistInstance(pursuitId),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
            qc.invalidateQueries({ queryKey: queryKeys.pursuitMilestones(pursuitId) });
        },
    });
}

export function useReorderChecklistTasks() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ phaseId, orderedIds, pursuitId }: {
            phaseId: string; orderedIds: string[]; pursuitId: string;
        }) => queries.reorderChecklistTasks(phaseId, orderedIds),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
        },
    });
}

export function useReorderChecklistItems() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, orderedIds, pursuitId }: {
            taskId: string; orderedIds: string[]; pursuitId: string;
        }) => queries.reorderChecklistItems(taskId, orderedIds),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitChecklist(pursuitId) });
        },
    });
}

// ============================================================
// Task Notes & Activity
// ============================================================

export function useTaskNotes(taskId: string) {
    return useQuery({
        queryKey: queryKeys.taskNotes(taskId),
        queryFn: () => queries.fetchTaskNotes(taskId),
        enabled: !!taskId,
    });
}

export function useCreateTaskNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
            queries.createTaskNote(taskId, content),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: queryKeys.taskNotes(data.task_id) });
            qc.invalidateQueries({ queryKey: queryKeys.taskActivity(data.task_id) });
        },
    });
}

export function useTaskActivity(taskId: string) {
    return useQuery({
        queryKey: queryKeys.taskActivity(taskId),
        queryFn: () => queries.fetchTaskActivity(taskId),
        enabled: !!taskId,
    });
}

// ============================================================
// Task Attachments
// ============================================================

export function useTaskAttachments(taskId: string) {
    return useQuery({
        queryKey: ['task-attachments', taskId] as const,
        queryFn: () => queries.fetchTaskAttachments(taskId),
        enabled: !!taskId,
    });
}

export function useCreateTaskAttachment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (attachment: Partial<import('@/types').TaskAttachment>) => queries.createTaskAttachmentRecord(attachment),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['task-attachments', data.task_id] });
        },
    });
}

export function useDeleteTaskAttachment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, taskId }: { id: string; taskId: string }) => 
            queries.deleteTaskAttachmentRecord(id),
        onSuccess: (_, { taskId }) => {
            qc.invalidateQueries({ queryKey: ['task-attachments', taskId] });
        },
    });
}

// ============================================================
// Entity Comments
// ============================================================

export function useEntityComments(entityType: import('@/types').CommentEntityType, entityId: string) {
    return useQuery({
        queryKey: queryKeys.entityComments(entityType, entityId),
        queryFn: () => queries.fetchEntityComments(entityType, entityId),
        enabled: !!entityId,
    });
}

export function useCreateComment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ entityType, entityId, authorId, content, mentions }: {
            entityType: import('@/types').CommentEntityType;
            entityId: string;
            authorId: string;
            content: string;
            mentions: string[];
        }) => queries.createEntityComment(entityType, entityId, authorId, content, mentions),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: queryKeys.entityComments(data.entity_type, data.entity_id) });
        },
    });
}

export function useUsers() {
    return useQuery({
        queryKey: queryKeys.users,
        queryFn: queries.fetchAllUsers,
        staleTime: 5 * 60 * 1000,
    });
}

export function useMyMentionCount(userId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.myMentionCount(userId ?? ''),
        queryFn: () => queries.fetchMyMentionCount(userId!),
        enabled: !!userId,
        refetchInterval: 60 * 1000,
    });
}

export function useMyIncompleteTaskCount(userId: string | undefined) {
    return useQuery({
        queryKey: ['my-incomplete-tasks-count', userId],
        queryFn: () => queries.fetchMyIncompleteTaskCount(userId!),
        enabled: !!userId,
        refetchInterval: 60 * 1000,
    });
}

// ============================================================
// Sale Comps
// ============================================================

export function useSaleComps() {
    return useQuery({
        queryKey: queryKeys.saleComps,
        queryFn: queries.fetchSaleComps,
    });
}

export function useSaleComp(idOrShortId: string) {
    const qc = useQueryClient();
    const isUuid = idOrShortId.length === 36 && idOrShortId.includes('-');
    return useQuery({
        queryKey: queryKeys.saleComp(idOrShortId),
        queryFn: async () => {
            const data = isUuid ? await queries.fetchSaleComp(idOrShortId) : await queries.fetchSaleCompByShortId(idOrShortId);
            const altKey = isUuid ? data.short_id : data.id;
            if (altKey && altKey !== idOrShortId) {
                qc.setQueryData(queryKeys.saleComp(altKey), data);
            }
            return data;
        },
        enabled: !!idOrShortId,
    });
}

export function useCreateSaleComp() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: queries.createSaleComp,
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.saleComps }),
    });
}

export function useUpdateSaleComp() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<import('@/types').SaleComp>; queryId?: string }) =>
            queries.updateSaleComp(id, updates),
        onSuccess: (_, { id, queryId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.saleComp(id) });
            if (queryId && queryId !== id) {
                qc.invalidateQueries({ queryKey: queryKeys.saleComp(queryId) });
            }
            qc.invalidateQueries({ queryKey: queryKeys.saleComps });
        },
    });
}

export function useDeleteSaleComp() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => queries.deleteSaleComp(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.saleComps }),
    });
}

export function useUpsertSaleTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (tx: Partial<import('@/types').SaleTransaction> & { sale_comp_id: string }) =>
            queries.upsertSaleTransaction(tx),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: queryKeys.saleComp(data.sale_comp_id) });
            qc.invalidateQueries({ queryKey: queryKeys.saleComps });
        },
    });
}

export function useDeleteSaleTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, saleCompId }: { id: string; saleCompId: string }) =>
            queries.deleteSaleTransaction(id),
        onSuccess: (_, { saleCompId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.saleComp(saleCompId) });
            qc.invalidateQueries({ queryKey: queryKeys.saleComps });
        },
    });
}

export function useUpdateSaleTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<import('@/types').SaleTransaction> }) =>
            queries.updateSaleTransaction(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.saleComps });
            qc.invalidateQueries({ queryKey: ['sale-comp-report-data'] });
        },
    });
}

export function useSaleCompReportData(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['sale-comp-report-data'] as const,
        queryFn: queries.fetchSaleCompReportData,
        enabled: opts?.enabled ?? true,
    });
}

// ============================================================
// Pursuit Land Comps
// ============================================================

export function usePursuitLandComps(pursuitId: string) {
    return useQuery({
        queryKey: queryKeys.pursuitLandComps(pursuitId),
        queryFn: () => queries.fetchPursuitLandComps(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useLinkLandCompToPursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId, landCompId }: { pursuitId: string; landCompId: string }) =>
            queries.linkLandCompToPursuit(pursuitId, landCompId),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitLandComps(pursuitId) });
        },
    });
}

export function useUnlinkLandCompFromPursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId, landCompId }: { pursuitId: string; landCompId: string }) =>
            queries.unlinkLandCompFromPursuit(pursuitId, landCompId),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitLandComps(pursuitId) });
        },
    });
}

// ============================================================
// Pursuit Sale Comps
// ============================================================

export function usePursuitSaleComps(pursuitId: string) {
    return useQuery({
        queryKey: queryKeys.pursuitSaleComps(pursuitId),
        queryFn: () => queries.fetchPursuitSaleComps(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useLinkSaleCompToPursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId, saleCompId }: { pursuitId: string; saleCompId: string }) =>
            queries.linkSaleCompToPursuit(pursuitId, saleCompId),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitSaleComps(pursuitId) });
        },
    });
}

export function useUnlinkSaleCompFromPursuit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ pursuitId, saleCompId }: { pursuitId: string; saleCompId: string }) =>
            queries.unlinkSaleCompFromPursuit(pursuitId, saleCompId),
        onSuccess: (_, { pursuitId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.pursuitSaleComps(pursuitId) });
        },
    });
}

// ============================================================
// Deal Teams & External Parties
// ============================================================

export function usePursuitTeamMembers(pursuitId: string) {
    return useQuery({
        queryKey: queryKeys.pursuitTeamMembers(pursuitId),
        queryFn: () => queries.fetchPursuitTeamMembers(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useExternalTaskParties() {
    return useQuery({
        queryKey: queryKeys.externalTaskParties,
        queryFn: () => queries.fetchExternalTaskParties(),
    });
}

export function useAddExternalTaskParty() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (party: Omit<import('@/types').ExternalTaskParty, 'id' | 'created_at'>) => queries.addExternalTaskParty(party),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.externalTaskParties });
        },
    });
}

export function useMyTasks(userId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.myTasks(userId!),
        queryFn: () => queries.fetchMyTasks(userId!),
        enabled: !!userId,
    });
}

// ============================================================
// Accounting Entity Mapping
// ============================================================

export function usePursuitAccountingEntities() {
    return useQuery({
        queryKey: ['pursuit-accounting-entities'],
        queryFn: () => queries.fetchPursuitAccountingEntities(),
    });
}

export function usePursuitAccountingEntity(pursuitId: string) {
    return useQuery({
        queryKey: ['pursuit-accounting-entity', pursuitId],
        queryFn: () => queries.fetchPursuitAccountingEntity(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useUpsertPursuitAccountingEntity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (entity: Partial<import('@/types').PursuitAccountingEntity> & { pursuit_id: string, property_code: string }) => 
            queries.upsertPursuitAccountingEntity(entity),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['pursuit-accounting-entities'] });
            qc.invalidateQueries({ queryKey: ['pursuit-accounting-entity', data.pursuit_id] });
        },
    });
}

export function useDeletePursuitAccountingEntity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, pursuit_id }: { id: string, pursuit_id: string }) => queries.deletePursuitAccountingEntity(id),
        onSuccess: (_, { pursuit_id }) => {
            qc.invalidateQueries({ queryKey: ['pursuit-accounting-entities'] });
            qc.invalidateQueries({ queryKey: ['pursuit-accounting-entity', pursuit_id] });
        },
    });
}
