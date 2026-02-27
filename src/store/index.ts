'use client';

import { create } from 'zustand';
import type { Pursuit, OnePager, UnitMixRow, PayrollRow, SoftCostDetailRow, PursuitStage, ProductType } from '@/types';
import { UNIT_TYPES, UNIT_TYPE_LABELS } from '@/lib/constants';

// ============================================================
// Mock Data Store — will be replaced with Supabase queries
// ============================================================

interface AppState {
    // Reference data
    stages: PursuitStage[];
    productTypes: ProductType[];
    // Pursuits
    pursuits: Pursuit[];
    // One-Pagers and children
    onePagers: OnePager[];
    unitMixRows: UnitMixRow[];
    payrollRows: PayrollRow[];
    softCostDetails: SoftCostDetailRow[];
    // Actions
    addPursuit: (p: Pursuit) => void;
    updatePursuit: (id: string, updates: Partial<Pursuit>) => void;
    deletePursuit: (id: string) => void;
    addOnePager: (op: OnePager) => void;
    updateOnePager: (id: string, updates: Partial<OnePager>) => void;
    deleteOnePager: (id: string) => void;
    setUnitMix: (onePagerId: string, rows: UnitMixRow[]) => void;
    updateUnitMixRow: (id: string, updates: Partial<UnitMixRow>) => void;
    setPayroll: (onePagerId: string, rows: PayrollRow[]) => void;
    addPayrollRow: (row: PayrollRow) => void;
    updatePayrollRow: (id: string, updates: Partial<PayrollRow>) => void;
    deletePayrollRow: (id: string) => void;
    addStage: (s: PursuitStage) => void;
    updateStage: (id: string, updates: Partial<PursuitStage>) => void;
    deleteStage: (id: string) => void;
    addProductType: (pt: ProductType) => void;
    updateProductType: (id: string, updates: Partial<ProductType>) => void;
    deleteProductType: (id: string) => void;
}

// Default stages
const defaultStages: PursuitStage[] = [
    { id: 's1', name: 'Screening', sort_order: 1, color: '#94A3B8', is_active: true },
    { id: 's2', name: 'Initial Analysis', sort_order: 2, color: '#3B82F6', is_active: true },
    { id: 's3', name: 'LOI', sort_order: 3, color: '#8B5CF6', is_active: true },
    { id: 's4', name: 'Under Contract', sort_order: 4, color: '#F59E0B', is_active: true },
    { id: 's5', name: 'Due Diligence', sort_order: 5, color: '#F97316', is_active: true },
    { id: 's6', name: 'Closed', sort_order: 6, color: '#10B981', is_active: true },
    { id: 's7', name: 'Passed', sort_order: 7, color: '#EF4444', is_active: true },
    { id: 's8', name: 'Dead', sort_order: 8, color: '#6B7280', is_active: true },
];

const defaultProductTypes: ProductType[] = [
    { id: 'pt1', name: 'Townhomes', density_low: 12, density_high: 20, sort_order: 1, is_active: true, sub_product_types: [] },
    { id: 'pt2', name: 'Garden', density_low: 20, density_high: 30, sort_order: 2, is_active: true, sub_product_types: [] },
    { id: 'pt3', name: 'Hybrid', density_low: 25, density_high: 40, sort_order: 3, is_active: true, sub_product_types: [] },
    {
        id: 'pt4', name: 'Wrap', density_low: 35, density_high: 55, sort_order: 4, is_active: true,
        sub_product_types: [
            { id: 'spt1', product_type_id: 'pt4', name: '3-Story Wrap', sort_order: 1, is_active: true },
            { id: 'spt2', product_type_id: 'pt4', name: '4-Story Wrap', sort_order: 2, is_active: true },
            { id: 'spt3', product_type_id: 'pt4', name: '5-Story Wrap', sort_order: 3, is_active: true },
            { id: 'spt4', product_type_id: 'pt4', name: '5 Over 1 Wrap', sort_order: 4, is_active: true },
            { id: 'spt5', product_type_id: 'pt4', name: '5 Over 2 Wrap', sort_order: 5, is_active: true },
        ],
    },
    { id: 'pt5', name: 'Mid Rise', density_low: 50, density_high: 80, sort_order: 5, is_active: true, sub_product_types: [] },
    {
        id: 'pt6', name: 'High Rise', density_low: 80, density_high: 150, sort_order: 6, is_active: true,
        sub_product_types: [
            { id: 'spt6', product_type_id: 'pt6', name: 'High Rise with Adjacent Garage', sort_order: 1, is_active: true },
            { id: 'spt7', product_type_id: 'pt6', name: 'High Rise Podium', sort_order: 2, is_active: true },
        ],
    },
    { id: 'pt7', name: 'Other', density_low: 10, density_high: 150, sort_order: 7, is_active: true, sub_product_types: [] },
];

/** Create default unit mix rows for a new one-pager */
export function createDefaultUnitMix(onePagerId: string): UnitMixRow[] {
    return UNIT_TYPES.map((type, idx) => ({
        id: `um-${onePagerId}-${type}`,
        one_pager_id: onePagerId,
        unit_type: type,
        unit_type_label: UNIT_TYPE_LABELS[type],
        unit_count: 0,
        avg_unit_sf: 0,
        rent_input_mode: 'per_sf' as const,
        rent_per_sf: 0,
        rent_whole_dollar: 0,
        sort_order: idx,
    }));
}

export const useAppStore = create<AppState>((set) => ({
    stages: defaultStages,
    productTypes: defaultProductTypes,
    pursuits: [],
    onePagers: [],
    unitMixRows: [],
    payrollRows: [],
    softCostDetails: [],

    addPursuit: (p) => set((s) => ({ pursuits: [...s.pursuits, p] })),
    updatePursuit: (id, updates) =>
        set((s) => ({
            pursuits: s.pursuits.map((p) => (p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p)),
        })),
    deletePursuit: (id) =>
        set((s) => ({
            pursuits: s.pursuits.filter((p) => p.id !== id),
            onePagers: s.onePagers.filter((op) => op.pursuit_id !== id),
        })),

    addOnePager: (op) =>
        set((s) => ({
            onePagers: [...s.onePagers, op],
            unitMixRows: [...s.unitMixRows, ...createDefaultUnitMix(op.id)],
        })),
    updateOnePager: (id, updates) =>
        set((s) => ({
            onePagers: s.onePagers.map((op) =>
                op.id === id ? { ...op, ...updates, updated_at: new Date().toISOString() } : op
            ),
        })),
    deleteOnePager: (id) =>
        set((s) => ({
            onePagers: s.onePagers.filter((op) => op.id !== id),
            unitMixRows: s.unitMixRows.filter((r) => r.one_pager_id !== id),
            payrollRows: s.payrollRows.filter((r) => r.one_pager_id !== id),
            softCostDetails: s.softCostDetails.filter((r) => r.one_pager_id !== id),
        })),

    setUnitMix: (onePagerId, rows) =>
        set((s) => ({
            unitMixRows: [...s.unitMixRows.filter((r) => r.one_pager_id !== onePagerId), ...rows],
        })),
    updateUnitMixRow: (id, updates) =>
        set((s) => ({
            unitMixRows: s.unitMixRows.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),

    setPayroll: (onePagerId, rows) =>
        set((s) => ({
            payrollRows: [...s.payrollRows.filter((r) => r.one_pager_id !== onePagerId), ...rows],
        })),
    addPayrollRow: (row) =>
        set((s) => ({ payrollRows: [...s.payrollRows, row] })),
    updatePayrollRow: (id, updates) =>
        set((s) => ({
            payrollRows: s.payrollRows.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),
    deletePayrollRow: (id) =>
        set((s) => ({
            payrollRows: s.payrollRows.filter((r) => r.id !== id),
        })),

    addStage: (stage) => set((s) => ({ stages: [...s.stages, stage] })),
    updateStage: (id, updates) =>
        set((s) => ({
            stages: s.stages.map((st) => (st.id === id ? { ...st, ...updates } : st)),
        })),
    deleteStage: (id) =>
        set((s) => ({ stages: s.stages.filter((st) => st.id !== id) })),

    addProductType: (pt) =>
        set((s) => ({ productTypes: [...s.productTypes, pt] })),
    updateProductType: (id, updates) =>
        set((s) => ({
            productTypes: s.productTypes.map((pt) =>
                pt.id === id ? { ...pt, ...updates } : pt
            ),
        })),
    deleteProductType: (id) =>
        set((s) => ({
            productTypes: s.productTypes.filter((pt) => pt.id !== id),
        })),
}));
