'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    useProductTypes,
    useUpdateOnePager,
    useUpdatePursuit,
    useUnitMix,
    usePayroll,
    useSoftCostDetails,
    useUpsertUnitMixRow,
    useDeleteUnitMixRow,
    useUpsertPayrollRow,
    useDeletePayrollRow,
    useUpsertSoftCostRow,
    useDeleteSoftCostRow,
    useDuplicateOnePager,
    useArchiveOnePager,
} from '@/hooks/useSupabaseQueries';
import { useCalculations } from '@/hooks/useCalculations';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useRealtimeOnePager } from '@/hooks/useRealtimeOnePager';
import { InlineInput } from './InlineInput';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { calcUnitMixRow, calcPayrollRowTotal } from '@/lib/calculations';
import {
    calcRentSensitivity,
    calcHardCostSensitivity,
    calcLandCostSensitivity,
    calcSensitivityMatrix,
} from '@/lib/calculations/sensitivity';
import { formatCurrency, formatPercent, formatNumber, SF_PER_ACRE } from '@/lib/constants';
import type { Pursuit, OnePager } from '@/types';
import {
    ChevronLeft,
    Pencil,
    PencilOff,
    Trash2,
    Plus,
    ChevronDown,
    ChevronRight,
    Loader2,
    Copy,
    Archive,
    Undo2,
    Redo2,
    FileDown,
    X,
} from 'lucide-react';
import * as queries from '@/lib/supabase/queries';

interface OnePagerEditorProps {
    pursuit: Pursuit;
    onePager: OnePager;
}

export function OnePagerEditor({ pursuit, onePager }: OnePagerEditorProps) {
    const router = useRouter();
    const { data: productTypes = [] } = useProductTypes();
    const { data: unitMixRows = [], isLoading: loadingUnitMix } = useUnitMix(onePager.id);
    const { data: payrollRows = [], isLoading: loadingPayroll } = usePayroll(onePager.id);
    const { data: softCostDetails = [] } = useSoftCostDetails(onePager.id);

    const updateOnePagerMutation = useUpdateOnePager();
    const updatePursuitMutation = useUpdatePursuit();
    const upsertUnitMixRow = useUpsertUnitMixRow();
    const deleteUnitMixRowMutation = useDeleteUnitMixRow();
    const upsertPayrollRow = useUpsertPayrollRow();
    const deletePayrollRowMutation = useDeletePayrollRow();
    const upsertSoftCostRow = useUpsertSoftCostRow();
    const deleteSoftCostRowMutation = useDeleteSoftCostRow();
    const duplicateOnePager = useDuplicateOnePager();
    const archiveOnePager = useArchiveOnePager();

    const productType = productTypes.find((pt) => pt.id === onePager.product_type_id);

    const [payrollExpanded, setPayrollExpanded] = useState(true);
    const [taxExpanded, setTaxExpanded] = useState(false);
    const [sensitivityExpanded, setSensitivityExpanded] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState('');
    const [softCostExpanded, setSoftCostExpanded] = useState(false);
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateName, setDuplicateName] = useState('');
    const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [editAllMode, setEditAllMode] = useState(false);

    // Realtime subscription for multi-user sync
    useRealtimeOnePager(onePager.id);

    const { save, status: saveStatus } = useAutoSave(async (data: { id: string; updates: Partial<OnePager> }) => {
        await queries.updateOnePager(data.id, data.updates);
    });

    const sortedUnitMix = useMemo(() => [...unitMixRows].sort((a, b) => a.sort_order - b.sort_order), [unitMixRows]);
    const sortedPayroll = useMemo(() => [...payrollRows].sort((a, b) => a.sort_order - b.sort_order), [payrollRows]);

    const calc = useCalculations({
        onePager,
        unitMix: sortedUnitMix,
        payroll: sortedPayroll,
        softCostDetails,
        siteAreaSf: pursuit.site_area_sf,
        productTypeDensityLow: productType?.density_low,
        productTypeDensityHigh: productType?.density_high,
    });

    // ============================================================
    // Undo/Redo System
    // ============================================================

    const applyUndoRedo = useCallback(
        (action: import('@/hooks/useUndoRedo').UndoAction, direction: 'undo' | 'redo') => {
            const value = direction === 'undo' ? action.oldValue : action.newValue;

            switch (action.entity) {
                case 'onePager': {
                    const updates: Partial<OnePager> = { [action.field]: value };
                    updateOnePagerMutation.mutate({ id: action.entityId, updates });
                    save({ id: action.entityId, updates });
                    break;
                }
                case 'unitMix': {
                    upsertUnitMixRow.mutate({ id: action.entityId, one_pager_id: onePager.id, [action.field]: value });
                    break;
                }
                case 'payroll': {
                    upsertPayrollRow.mutate({ id: action.entityId, one_pager_id: onePager.id, [action.field]: value });
                    break;
                }
            }
        },
        [updateOnePagerMutation, upsertUnitMixRow, upsertPayrollRow, onePager.id, save]
    );

    const { push: pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo(applyUndoRedo);

    // ============================================================
    // Field Update Helpers (with undo tracking)
    // ============================================================

    const updateField = useCallback(
        (field: string, value: number | boolean | string) => {
            const oldValue = (onePager as unknown as Record<string, unknown>)[field];
            pushUndo({ entity: 'onePager', entityId: onePager.id, field, oldValue, newValue: value });

            const updates: Partial<OnePager> = {
                [field]: value,
                total_units: sortedUnitMix.reduce((s, r) => s + r.unit_count, 0),
                calc_total_nrsf: calc.total_nrsf,
                calc_total_gbsf: calc.total_gbsf,
                calc_gpr: calc.gross_potential_rent,
                calc_net_revenue: calc.net_revenue,
                calc_total_budget: calc.total_budget,
                calc_hard_cost: calc.hard_cost,
                calc_soft_cost: calc.soft_cost,
                calc_total_opex: calc.total_opex,
                calc_noi: calc.noi,
                calc_yoc: calc.unlevered_yield_on_cost,
                calc_cost_per_unit: calc.cost_per_unit,
                calc_noi_per_unit: calc.noi_per_unit,
            };
            updateOnePagerMutation.mutate({ id: onePager.id, updates });
            save({ id: onePager.id, updates });
        },
        [updateOnePagerMutation, onePager, calc, save, pushUndo]
    );

    const handleUnitMixChange = useCallback(
        (rowId: string, field: string, value: number | string, oldValue: unknown) => {
            pushUndo({ entity: 'unitMix', entityId: rowId, field, oldValue, newValue: value });
            upsertUnitMixRow.mutate({ id: rowId, one_pager_id: onePager.id, [field]: value });

            // Persist total_units to the one_pagers row so dashboard/overview can read it
            if (field === 'unit_count') {
                const currentTotal = sortedUnitMix.reduce((s, r) => s + r.unit_count, 0);
                const delta = (typeof value === 'number' ? value : 0) - (typeof oldValue === 'number' ? oldValue : 0);
                const newTotal = currentTotal + delta;
                const calcUpdates: Partial<OnePager> = { total_units: newTotal };
                updateOnePagerMutation.mutate({ id: onePager.id, updates: calcUpdates });
                save({ id: onePager.id, updates: calcUpdates });
            }
        },
        [upsertUnitMixRow, updateOnePagerMutation, onePager.id, pushUndo, sortedUnitMix, save]
    );

    const handleAddPayroll = useCallback(
        (lineType: 'employee' | 'contract') => {
            upsertPayrollRow.mutate({
                one_pager_id: onePager.id,
                line_type: lineType,
                role_name: '',
                headcount: lineType === 'employee' ? 1 : 0,
                base_compensation: 0,
                bonus_pct: 0,
                fixed_amount: 0,
                sort_order: payrollRows.length,
            });
        },
        [upsertPayrollRow, onePager.id, payrollRows.length]
    );

    const handleUpdatePayroll = useCallback(
        (rowId: string, field: string, value: unknown, oldValue: unknown) => {
            pushUndo({ entity: 'payroll', entityId: rowId, field, oldValue, newValue: value });
            upsertPayrollRow.mutate({ id: rowId, one_pager_id: onePager.id, [field]: value });
        },
        [upsertPayrollRow, onePager.id, pushUndo]
    );

    // ============================================================
    // Duplicate & Archive
    // ============================================================

    const handleDuplicate = async () => {
        const name = duplicateName.trim() || `Copy of ${onePager.name}`;
        try {
            const newOp = await duplicateOnePager.mutateAsync({ sourceId: onePager.id, newName: name });
            setShowDuplicateDialog(false);
            setDuplicateName('');
            router.push(`/pursuits/${pursuit.id}/one-pagers/${newOp.id}`);
        } catch (err) {
            console.error('Duplicate failed:', err);
        }
    };

    const handleArchive = async () => {
        try {
            await archiveOnePager.mutateAsync({ id: onePager.id, pursuitId: pursuit.id });
            router.push(`/pursuits/${pursuit.id}`);
        } catch (err) {
            console.error('Archive failed:', err);
        }
    };

    // Density status
    const densityStatus = (() => {
        if (!productType || calc.density_units_per_acre === 0) return null;
        if (calc.density_units_per_acre < productType.density_low) return 'below';
        if (calc.density_units_per_acre > productType.density_high) return 'above';
        return 'within';
    })();

    // ============================================================
    // Sensitivity Analysis (memoized)
    // ============================================================

    const rentSteps = onePager.sensitivity_rent_steps ?? [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15];
    const hardCostSteps = onePager.sensitivity_hard_cost_steps ?? [-15, -10, -5, 0, 5, 10, 15];
    const landCostSteps = onePager.sensitivity_land_cost_steps ?? [-2000000, -1000000, -500000, 0, 500000, 1000000, 2000000];

    const rentSensitivity = useMemo(
        () => sensitivityExpanded ? calcRentSensitivity(onePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps) : [],
        [sensitivityExpanded, onePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps]
    );

    const hardCostSensitivity = useMemo(
        () => sensitivityExpanded ? calcHardCostSensitivity(onePager, sortedUnitMix, sortedPayroll, softCostDetails, hardCostSteps) : [],
        [sensitivityExpanded, onePager, sortedUnitMix, sortedPayroll, softCostDetails, hardCostSteps]
    );

    const landCostSensitivity = useMemo(
        () => sensitivityExpanded ? calcLandCostSensitivity(onePager, sortedUnitMix, sortedPayroll, softCostDetails, landCostSteps) : [],
        [sensitivityExpanded, onePager, sortedUnitMix, sortedPayroll, softCostDetails, landCostSteps]
    );

    const sensitivityMatrix = useMemo(
        () => sensitivityExpanded ? calcSensitivityMatrix(onePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps, hardCostSteps) : null,
        [sensitivityExpanded, onePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps, hardCostSteps]
    );

    if (loadingUnitMix || loadingPayroll) {
        return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#C8CDD5]" /></div>;
    }

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link href={`/pursuits/${pursuit.id}`} className="text-sm text-[#7A8599] hover:text-[#4A5568] transition-colors">
                        <ChevronLeft className="w-4 h-4 inline mr-1" />{pursuit.name}
                    </Link>
                    <span className="text-[#C8CDD5]">/</span>
                    {isEditingName ? (
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => { if (editName.trim()) updateOnePagerMutation.mutate({ id: onePager.id, updates: { name: editName.trim() } }); setIsEditingName(false); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { if (editName.trim()) updateOnePagerMutation.mutate({ id: onePager.id, updates: { name: editName.trim() } }); setIsEditingName(false); } if (e.key === 'Escape') setIsEditingName(false); }}
                            className="text-lg font-semibold text-[#1A1F2B] bg-transparent border-b-2 border-[#2563EB] outline-none"
                            autoFocus
                        />
                    ) : (
                        <button className="text-lg font-semibold text-[#1A1F2B] hover:text-[#2563EB] transition-colors group flex items-center gap-1.5" onClick={() => { setEditName(onePager.name); setIsEditingName(true); }}>
                            {onePager.name}
                            <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                        </button>
                    )}
                    {productType && <span className="text-xs text-[#7A8599] px-2.5 py-0.5 rounded-md bg-[#F4F5F7] font-medium">{productType.name}</span>}
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center gap-2">
                    {/* Edit All Toggle */}
                    <button
                        onClick={() => setEditAllMode(!editAllMode)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${editAllMode
                            ? 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4FD7]'
                            : 'text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7]'
                            }`}
                        title={editAllMode ? 'Done Editing' : 'Edit All Fields'}
                    >
                        {editAllMode ? <PencilOff className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        {editAllMode ? 'Done' : 'Edit All'}
                    </button>

                    <div className="w-px h-5 bg-[#E2E5EA] mx-1" />

                    {/* Undo/Redo */}
                    <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded-md text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Undo (Ctrl+Z)">
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded-md text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Redo (Ctrl+Shift+Z)">
                        <Redo2 className="w-4 h-4" />
                    </button>

                    <div className="w-px h-5 bg-[#E2E5EA] mx-1" />

                    {/* PDF Export */}
                    <button
                        onClick={async () => {
                            setIsExportingPdf(true);
                            try {
                                const { pdf } = await import('@react-pdf/renderer');
                                const { OnePagerPDF } = await import('@/components/export/OnePagerPDF');
                                const pt = productTypes?.find((p) => p.id === onePager.product_type_id);
                                const doc = <OnePagerPDF onePager={onePager} pursuit={pursuit} calc={calc} productTypeName={pt?.name} unitMix={sortedUnitMix} payroll={sortedPayroll} softCostDetails={softCostDetails} />;
                                const blob = await pdf(doc).toBlob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${onePager.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.pdf`;
                                a.click();
                                URL.revokeObjectURL(url);
                            } catch (err) {
                                console.error('PDF export failed:', err);
                            }
                            setIsExportingPdf(false);
                        }}
                        disabled={isExportingPdf}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] disabled:opacity-50 transition-colors"
                        title="Export PDF"
                    >
                        {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                        PDF
                    </button>

                    {/* Excel Export */}
                    <button
                        onClick={async () => {
                            setIsExportingExcel(true);
                            try {
                                const { exportOnePagerToExcel } = await import('@/components/export/exportExcel');
                                const pt = productTypes?.find((p) => p.id === onePager.product_type_id);
                                await exportOnePagerToExcel({ onePager, pursuit, calc, productTypeName: pt?.name });
                            } catch (err) {
                                console.error('Excel export failed:', err);
                            }
                            setIsExportingExcel(false);
                        }}
                        disabled={isExportingExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] disabled:opacity-50 transition-colors"
                        title="Export Excel"
                    >
                        {isExportingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                        Excel
                    </button>

                    {/* Duplicate */}
                    <button onClick={() => { setDuplicateName(`Copy of ${onePager.name}`); setShowDuplicateDialog(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors" title="Duplicate">
                        <Copy className="w-3.5 h-3.5" /> Duplicate
                    </button>

                    {/* Archive */}
                    <button onClick={() => setShowArchiveConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[#7A8599] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors" title="Archive">
                        <Archive className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-5 bg-[#E2E5EA] mx-1" />

                    {/* Save Status */}
                    {saveStatus !== 'idle' && (
                        <span className={`save-indicator ${saveStatus}`}>
                            {saveStatus === 'saving' && '● Saving...'}
                            {saveStatus === 'saved' && '✓ Saved'}
                            {saveStatus === 'error' && '✕ Error saving'}
                        </span>
                    )}
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ gridAutoFlow: 'dense' }}>
                {/* ===== RETURNS SUMMARY ===== */}
                <div className="lg:col-span-3 card-returns card">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <div>
                                <div className="text-[10px] text-[#7A8599] uppercase tracking-wider font-semibold mb-1">Unlevered Yield on Cost</div>
                                <div className="text-4xl font-bold text-[#2563EB]">
                                    {calc.unlevered_yield_on_cost > 0 ? formatPercent(calc.unlevered_yield_on_cost) : '—'}
                                </div>
                            </div>
                            <div className="h-12 w-px bg-[#E2E5EA]" />
                            <div className="grid grid-cols-4 gap-6">
                                <MetricCell label="NOI" value={calc.noi} format="currency" />
                                <MetricCell label="NOI / Unit" value={calc.noi_per_unit} format="currency" />
                                <MetricCell label="Total Budget" value={calc.total_budget} format="currency" />
                                <MetricCell label="Cost / Unit" value={calc.cost_per_unit} format="currency" />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-6">
                            <MetricCell label="Rent / SF" value={calc.weighted_avg_rent_per_sf} format="currency" decimals={2} />
                            <MetricCell label="OpEx Ratio" value={calc.opex_ratio} format="percent" />
                            <MetricCell label="Cost / NRSF" value={calc.cost_per_nrsf} format="currency" />
                        </div>
                    </div>
                </div>

                {/* ===== EXECUTIVE SUMMARY (full width) ===== */}
                <div className="lg:col-span-3 card">
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Executive Summary</h3>
                    <RichTextEditor
                        content={pursuit.exec_summary}
                        onChange={(json) => updatePursuitMutation.mutate({ id: pursuit.id, updates: { exec_summary: json } })}
                        placeholder="Enter executive summary..."
                    />
                </div>

                {/* ===== SITE & DENSITY ===== */}
                <div className="card">
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-4">Site & Density</h3>
                    <div className="space-y-3">
                        <FieldRow label="Site Area (SF)" value={formatNumber(pursuit.site_area_sf)} display />
                        <FieldRow label="Site Area (Acres)" value={formatNumber(pursuit.site_area_sf / SF_PER_ACRE, 2)} display />
                        <FieldRow label="Total Units" value={formatNumber(sortedUnitMix.reduce((sum, r) => sum + r.unit_count, 0))} display />
                        <FieldRow label="Density (Units/Acre)" value={formatNumber(calc.density_units_per_acre, 1)} display />
                        {productType && (
                            <div className={`text-xs px-2.5 py-1.5 rounded-md ${densityStatus === 'within' ? 'bg-[#ECFDF3] text-[#0D7A3E]' :
                                densityStatus ? 'bg-[#FFFBEB] text-[#B45309]' : 'text-[#7A8599]'
                                }`}>
                                {densityStatus === 'within' && `✓ Within range for ${productType.name} (${productType.density_low}–${productType.density_high})`}
                                {densityStatus === 'below' && `⚠ Below range for ${productType.name} (${productType.density_low}–${productType.density_high})`}
                                {densityStatus === 'above' && `⚠ Above range for ${productType.name} (${productType.density_low}–${productType.density_high})`}
                                {!densityStatus && `Range: ${productType.density_low}–${productType.density_high} units/acre`}
                            </div>
                        )}
                        {productType && pursuit.site_area_sf > 0 && calc.recommended_units_low > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[#A0AABB]">
                                    Suggested: {formatNumber(calc.recommended_units_low, 0)}–{formatNumber(calc.recommended_units_high, 0)} units
                                </span>
                            </div>
                        )}
                        <FieldRow label="Efficiency Ratio"><InlineInput value={onePager.efficiency_ratio} onChange={(v) => updateField('efficiency_ratio', v)} format="percent" decimals={1} editAllMode={editAllMode} /></FieldRow>
                        <FieldRow label="Total NRSF" value={formatNumber(calc.total_nrsf)} display />
                        <FieldRow label="Total GBSF" value={formatNumber(calc.total_gbsf)} display />
                        {pursuit.site_area_sf > 0 && calc.total_gbsf > 0 && (
                            <FieldRow label="FAR (GBSF / Site SF)" value={formatNumber(calc.total_gbsf / pursuit.site_area_sf, 2)} display />
                        )}
                    </div>
                </div>

                {/* ===== REVENUE ===== */}
                <div className="card">
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-4">Revenue</h3>
                    <div className="space-y-3">
                        <FieldRow label="Gross Potential Rent" value={formatCurrency(calc.gross_potential_rent)} display />
                        <FieldRow label="Other Income ($/unit/mo)"><InlineInput value={onePager.other_income_per_unit_month} onChange={(v) => updateField('other_income_per_unit_month', v)} format="currency" editAllMode={editAllMode} /></FieldRow>
                        <FieldRow label="Other Income (Annual)" value={formatCurrency(calc.other_income)} display />
                        <FieldRow label="Gross Potential Revenue" value={formatCurrency(calc.gross_potential_revenue)} display />
                        <FieldRow label="Vacancy & Loss"><InlineInput value={onePager.vacancy_rate} onChange={(v) => updateField('vacancy_rate', v)} format="percent" decimals={1} editAllMode={editAllMode} /></FieldRow>
                        <FieldRow label="Vacancy Amount" value={`(${formatCurrency(calc.vacancy_loss)})`} display className="text-[#DC2626]" />
                        <div className="pt-2 border-t border-[#F0F1F4]">
                            <FieldRow label="Net Revenue" value={formatCurrency(calc.net_revenue)} display className="font-bold text-[#1A1F2B]" />
                        </div>
                    </div>
                </div>

                {/* ===== UNIT MIX + PRO FORMA (spans 2 columns) ===== */}
                <div className="lg:col-span-2 lg:self-start space-y-4">
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Unit Mix</h3>
                            <button
                                onClick={() => {
                                    const newId = crypto.randomUUID();
                                    upsertUnitMixRow.mutate({
                                        id: newId,
                                        one_pager_id: onePager.id,
                                        unit_type: 'other',
                                        unit_type_label: 'New Unit Type',
                                        unit_count: 0,
                                        avg_unit_sf: 0,
                                        rent_per_sf: 0,
                                        rent_whole_dollar: 0,
                                        rent_input_mode: 'per_sf',
                                        sort_order: sortedUnitMix.length,
                                    } as any);
                                }}
                                className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4FD7] font-medium transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Row
                            </button>
                        </div>
                        <div className="-mx-5">
                            <table className="data-table">
                                <thead><tr><th className="text-left">Type</th><th className="text-right"># Units</th><th className="text-right">Avg SF</th><th className="text-right">Total SF</th><th className="text-right">% of Total</th><th className="text-right">Rent/SF</th><th className="text-right">Mo. Rent</th><th className="text-right">Annual Rev</th></tr></thead>
                                <tbody>
                                    {sortedUnitMix.map((row) => {
                                        const rc = calcUnitMixRow(row);
                                        const isPsf = row.rent_input_mode === 'per_sf';
                                        return (
                                            <tr key={row.id}>
                                                <td>
                                                    <div className="flex items-center gap-1 group/row">
                                                        <UnitTypeInput
                                                            value={row.unit_type_label}
                                                            onChange={(v) => handleUnitMixChange(row.id, 'unit_type_label', v, row.unit_type_label)}
                                                        />
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteUnitMixRowMutation.mutate({ id: row.id, onePagerId: onePager.id }); }}
                                                            className="text-[#C8CDD5] hover:text-[#DC2626] transition-colors opacity-0 group-hover/row:opacity-100 flex-shrink-0 p-0.5"
                                                            title="Delete row"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td><InlineInput value={row.unit_count} onChange={(v) => handleUnitMixChange(row.id, 'unit_count', Math.round(v), row.unit_count)} format="integer" className="text-xs" editAllMode={editAllMode} /></td>
                                                <td><InlineInput value={row.avg_unit_sf} onChange={(v) => handleUnitMixChange(row.id, 'avg_unit_sf', v, row.avg_unit_sf)} format="number" decimals={0} className="text-xs" editAllMode={editAllMode} /></td>
                                                <td className="text-right text-xs text-[#7A8599] tabular-nums">{rc.total_sf > 0 ? formatNumber(rc.total_sf) : '—'}</td>
                                                <td className="text-right text-xs text-[#7A8599] tabular-nums">{rc.total_sf > 0 && calc.total_nrsf > 0 ? formatPercent(rc.total_sf / calc.total_nrsf, 1) : '—'}</td>
                                                <td>
                                                    {isPsf
                                                        ? <InlineInput value={row.rent_per_sf} onChange={(v) => handleUnitMixChange(row.id, 'rent_per_sf', v, row.rent_per_sf)} format="currency" decimals={2} className="text-xs" editAllMode={editAllMode} />
                                                        : <button onClick={() => handleUnitMixChange(row.id, 'rent_input_mode', 'per_sf', row.rent_input_mode)} className="text-right text-xs text-[#7A8599] tabular-nums block w-full text-right hover:text-[#2563EB]" title="Click to switch to $/SF input">{rc.effective_rent_per_sf > 0 ? formatCurrency(rc.effective_rent_per_sf, 2) : '—'}</button>
                                                    }
                                                </td>
                                                <td>
                                                    {isPsf
                                                        ? <button onClick={() => handleUnitMixChange(row.id, 'rent_input_mode', 'whole_dollar', row.rent_input_mode)} className="text-right text-xs text-[#7A8599] tabular-nums block w-full text-right hover:text-[#2563EB]" title="Click to switch to whole dollar input">{rc.effective_monthly_rent > 0 ? formatCurrency(rc.effective_monthly_rent) : '—'}</button>
                                                        : <InlineInput value={row.rent_whole_dollar} onChange={(v) => handleUnitMixChange(row.id, 'rent_whole_dollar', v, row.rent_whole_dollar)} format="currency" decimals={0} className="text-xs" editAllMode={editAllMode} />
                                                    }
                                                </td>
                                                <td className="text-right text-xs text-[#7A8599] tabular-nums">{rc.annual_rental_revenue > 0 ? formatCurrency(rc.annual_rental_revenue) : '—'}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="total-row">
                                        <td>Total</td>
                                        <td className="text-right tabular-nums">{formatNumber(sortedUnitMix.reduce((s, r) => s + r.unit_count, 0))}</td>
                                        <td className="text-right tabular-nums">{calc.weighted_avg_unit_sf > 0 ? formatNumber(calc.weighted_avg_unit_sf, 0) : '—'}</td>
                                        <td className="text-right tabular-nums">{calc.total_nrsf > 0 ? formatNumber(calc.total_nrsf) : '—'}</td>
                                        <td className="text-right tabular-nums">{calc.total_nrsf > 0 ? '100%' : '—'}</td>
                                        <td className="text-right tabular-nums">{calc.weighted_avg_rent_per_sf > 0 ? formatCurrency(calc.weighted_avg_rent_per_sf, 2) : '—'}</td>
                                        <td className="text-right tabular-nums">—</td>
                                        <td className="text-right tabular-nums">{calc.gross_potential_rent > 0 ? formatCurrency(calc.gross_potential_rent) : '—'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ===== PRO FORMA ===== */}
                    <div className="card">
                        <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-4">Pro Forma</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">$/Unit</th>
                                    <th className="text-right">$/SF</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="text-[#4A5568] text-xs font-medium">Net Revenue</td>
                                    <td className="text-right text-xs tabular-nums text-[#1A1F2B] font-medium">{formatCurrency(calc.net_revenue)}</td>
                                    <td className="text-right text-xs tabular-nums text-[#7A8599]">{onePager.total_units > 0 ? formatCurrency(calc.net_revenue / onePager.total_units) : '—'}</td>
                                    <td className="text-right text-xs tabular-nums text-[#7A8599]">{calc.total_nrsf > 0 ? formatCurrency(calc.net_revenue / calc.total_nrsf, 2) : '—'}</td>
                                </tr>
                                <tr>
                                    <td className="text-[#DC2626] text-xs font-medium">Total Operating Expenses</td>
                                    <td className="text-right text-xs tabular-nums text-[#DC2626]">{calc.total_opex > 0 ? `(${formatCurrency(calc.total_opex)})` : '—'}</td>
                                    <td className="text-right text-xs tabular-nums text-[#DC2626]">{calc.opex_per_unit > 0 ? `(${formatCurrency(calc.opex_per_unit)})` : '—'}</td>
                                    <td className="text-right text-xs tabular-nums text-[#DC2626]">{calc.total_nrsf > 0 && calc.total_opex > 0 ? `(${formatCurrency(calc.total_opex / calc.total_nrsf, 2)})` : '—'}</td>
                                </tr>
                                <tr className="total-row">
                                    <td className="font-bold">Net Operating Income</td>
                                    <td className="text-right tabular-nums font-bold text-[#0D7A3E]">{formatCurrency(calc.noi)}</td>
                                    <td className="text-right tabular-nums font-bold">{formatCurrency(calc.noi_per_unit)}</td>
                                    <td className="text-right tabular-nums font-bold">{formatCurrency(calc.noi_per_sf, 2)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="mt-3 pt-2 border-t border-[#F0F1F4] flex items-center justify-between">
                            <span className="text-xs font-bold text-[#7A8599]">Yield on Cost</span>
                            <span className={`text-lg font-bold tabular-nums ${calc.unlevered_yield_on_cost > 0.06 ? 'text-[#0D7A3E]' : calc.unlevered_yield_on_cost > 0 ? 'text-[#B45309]' : 'text-[#7A8599]'}`}>
                                {calc.unlevered_yield_on_cost > 0 ? formatPercent(calc.unlevered_yield_on_cost) : '—'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ===== DEVELOPMENT BUDGET ===== */}
                <div className="space-y-4">
                    <div className="card">
                        <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-4">Development Budget</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Uses</th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">$/Unit</th>
                                    <th className="text-right">$/NRSF</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="text-[#4A5568] text-xs font-medium">Land Cost</td>
                                    <td><InlineInput value={onePager.land_cost} onChange={(v) => updateField('land_cost', v)} format="currency" decimals={0} className="text-xs" editAllMode={editAllMode} /></td>
                                    <td className="text-right text-xs tabular-nums text-[#7A8599]">{calc.land_cost_per_unit > 0 ? formatCurrency(calc.land_cost_per_unit) : '—'}</td>
                                    <td className="text-right text-xs tabular-nums text-[#7A8599]">{calc.total_nrsf > 0 ? formatCurrency(onePager.land_cost / calc.total_nrsf, 2) : '—'}</td>
                                </tr>
                                <tr>
                                    <td className="text-[#4A5568] text-xs font-medium">Hard Cost</td>
                                    <td className="text-right text-xs tabular-nums text-[#1A1F2B]">{calc.hard_cost > 0 ? formatCurrency(calc.hard_cost) : '—'}</td>
                                    <td className="text-right text-xs tabular-nums text-[#7A8599]">{calc.cost_per_unit > 0 ? formatCurrency(calc.hard_cost / Math.max(onePager.total_units, 1)) : '—'}</td>
                                    <td><InlineInput value={onePager.hard_cost_per_nrsf} onChange={(v) => updateField('hard_cost_per_nrsf', v)} format="currency" decimals={2} className="text-xs" editAllMode={editAllMode} /></td>
                                </tr>
                                <tr>
                                    <td className="text-[#4A5568] text-xs font-medium">
                                        <div className="flex items-center gap-1.5">
                                            Soft Cost
                                            <button
                                                onClick={() => {
                                                    updateField('use_detailed_soft_costs', !onePager.use_detailed_soft_costs);
                                                    if (!onePager.use_detailed_soft_costs) setSoftCostExpanded(true);
                                                }}
                                                className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${onePager.use_detailed_soft_costs
                                                    ? 'bg-[#2563EB] text-white'
                                                    : 'bg-[#F4F5F7] text-[#7A8599] hover:text-[#2563EB] hover:bg-[#EBF1FF]'
                                                    }`}
                                            >
                                                {onePager.use_detailed_soft_costs ? 'Detail' : `${formatPercent(onePager.soft_cost_pct, 0)} HC`}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="text-right text-xs tabular-nums text-[#1A1F2B]">{calc.soft_cost > 0 ? formatCurrency(calc.soft_cost) : '—'}</td>
                                    <td className="text-right text-xs tabular-nums text-[#7A8599]">{onePager.total_units > 0 ? formatCurrency(calc.soft_cost / onePager.total_units) : '—'}</td>
                                    <td className="text-right text-xs tabular-nums text-[#7A8599]">{calc.total_nrsf > 0 ? formatCurrency(calc.soft_cost / calc.total_nrsf, 2) : '—'}</td>
                                </tr>
                                <tr className="total-row">
                                    <td>Total Budget</td>
                                    <td className="text-right tabular-nums">{formatCurrency(calc.total_budget)}</td>
                                    <td className="text-right tabular-nums">{formatCurrency(calc.cost_per_unit)}</td>
                                    <td className="text-right tabular-nums">{formatCurrency(calc.cost_per_nrsf, 2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Soft cost controls below table */}
                        {!onePager.use_detailed_soft_costs && (
                            <div className="mt-3">
                                <FieldRow label="Soft Cost (% of HC)"><InlineInput value={onePager.soft_cost_pct} onChange={(v) => updateField('soft_cost_pct', v)} format="percent" decimals={1} editAllMode={editAllMode} /></FieldRow>
                            </div>
                        )}
                        {onePager.use_detailed_soft_costs && (
                            <div className="mt-3 animate-fade-in">
                                <button
                                    onClick={() => setSoftCostExpanded(!softCostExpanded)}
                                    className="flex items-center gap-1 text-[#2563EB] hover:text-[#1D4FD7] text-xs font-medium mb-2"
                                >
                                    {softCostExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    {softCostDetails.length} line items — {formatCurrency(calc.soft_cost)}
                                </button>
                                {softCostExpanded && (
                                    <div className="space-y-1">
                                        {softCostDetails.map((row) => (
                                            <div key={row.id} className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={row.line_item_name}
                                                    onChange={(e) => upsertSoftCostRow.mutate({ id: row.id, one_pager_id: onePager.id, line_item_name: e.target.value })}
                                                    placeholder="Line item"
                                                    className="inline-input text-xs flex-1 text-left"
                                                />
                                                <InlineInput
                                                    value={row.amount}
                                                    onChange={(v) => upsertSoftCostRow.mutate({ id: row.id, one_pager_id: onePager.id, amount: v })}
                                                    format="currency"
                                                    decimals={0}
                                                    className="text-xs w-24"
                                                />
                                                <button
                                                    onClick={() => deleteSoftCostRowMutation.mutate({ id: row.id, onePagerId: onePager.id })}
                                                    className="text-[#C8CDD5] hover:text-[#DC2626] transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => upsertSoftCostRow.mutate({ one_pager_id: onePager.id, line_item_name: '', amount: 0, sort_order: softCostDetails.length })}
                                            className="text-xs text-[#2563EB] hover:text-[#1D4FD7] font-medium"
                                        >
                                            + Add Line Item
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Additional metrics below */}
                        <div className="mt-3 pt-2 border-t border-[#F0F1F4] space-y-1">
                            <FieldRow label="Hard Cost ($/GBSF)" value={formatCurrency(calc.hard_cost_per_gbsf, 2)} display />
                            <FieldRow label="Land $/SF of Site" value={pursuit.site_area_sf > 0 ? formatCurrency(onePager.land_cost / pursuit.site_area_sf, 2) : '—'} display />
                        </div>
                    </div>

                </div>

                {/* ===== OPERATING EXPENSES ===== */}
                <div className="card">
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-4">Operating Expenses</h3>
                    <table className="data-table">
                        <thead><tr><th>Category</th><th className="text-right">$/Unit/Yr</th><th className="text-right">Annual Total</th></tr></thead>
                        <tbody>
                            <OpExRow label="Utilities" value={onePager.opex_utilities} units={onePager.total_units} onChange={(v) => updateField('opex_utilities', v)} editAllMode={editAllMode} />
                            <OpExRow label="Repairs & Maint." value={onePager.opex_repairs_maintenance} units={onePager.total_units} onChange={(v) => updateField('opex_repairs_maintenance', v)} editAllMode={editAllMode} />
                            <OpExRow label="Contract Svcs" value={onePager.opex_contract_services} units={onePager.total_units} onChange={(v) => updateField('opex_contract_services', v)} editAllMode={editAllMode} />
                            <OpExRow label="Marketing" value={onePager.opex_marketing} units={onePager.total_units} onChange={(v) => updateField('opex_marketing', v)} editAllMode={editAllMode} />
                            <OpExRow label="G&A" value={onePager.opex_general_admin} units={onePager.total_units} onChange={(v) => updateField('opex_general_admin', v)} editAllMode={editAllMode} />
                            <OpExRow label="Turnover" value={onePager.opex_turnover} units={onePager.total_units} onChange={(v) => updateField('opex_turnover', v)} editAllMode={editAllMode} />
                            <OpExRow label="Miscellaneous" value={onePager.opex_misc} units={onePager.total_units} onChange={(v) => updateField('opex_misc', v)} editAllMode={editAllMode} />
                            <tr>
                                <td><button onClick={() => setPayrollExpanded(!payrollExpanded)} className="flex items-center gap-1 text-[#2563EB] hover:text-[#1D4FD7] text-sm font-medium">
                                    {payrollExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Payroll & Related
                                </button></td>
                                <td className="text-right text-xs tabular-nums text-[#7A8599]">{onePager.total_units > 0 ? formatCurrency(calc.payroll_total / onePager.total_units) : '—'}</td>
                                <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(calc.payroll_total)}</td>
                            </tr>
                            {(() => {
                                const controllablePerUnit = onePager.opex_utilities + onePager.opex_repairs_maintenance + onePager.opex_contract_services + onePager.opex_marketing + onePager.opex_general_admin + onePager.opex_turnover + onePager.opex_misc;
                                const controllableTotal = (controllablePerUnit * onePager.total_units) + calc.payroll_total;
                                const controllablePerUnitWithPayroll = onePager.total_units > 0 ? controllableTotal / onePager.total_units : controllablePerUnit;
                                return (
                                    <tr style={{ borderTop: '2px solid #C8CDD5' }}>
                                        <td className="text-[#1A1F2B] text-xs font-bold py-1.5">Controllable Expenses</td>
                                        <td className="text-right text-xs tabular-nums font-bold text-[#1A1F2B] py-1.5">{formatCurrency(controllablePerUnitWithPayroll)}</td>
                                        <td className="text-right text-xs tabular-nums font-bold text-[#1A1F2B] py-1.5">{controllableTotal > 0 ? formatCurrency(controllableTotal) : '—'}</td>
                                    </tr>
                                );
                            })()}
                            <OpExRow label="Insurance" value={onePager.opex_insurance} units={onePager.total_units} onChange={(v) => updateField('opex_insurance', v)} editAllMode={editAllMode} />
                            <tr>
                                <td className="text-[#4A5568] text-xs">Mgmt Fee</td>
                                <td><InlineInput value={onePager.mgmt_fee_pct} onChange={(v) => updateField('mgmt_fee_pct', v)} format="percent" decimals={1} className="text-xs" editAllMode={editAllMode} /></td>
                                <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(calc.mgmt_fee_total)}</td>
                            </tr>
                            <tr>
                                <td><button onClick={() => setTaxExpanded(!taxExpanded)} className="flex items-center gap-1 text-[#2563EB] hover:text-[#1D4FD7] text-sm font-medium">
                                    {taxExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Property Tax
                                </button></td>
                                <td className="text-right text-xs tabular-nums text-[#7A8599]">{calc.property_tax_per_unit > 0 ? formatCurrency(calc.property_tax_per_unit) : '—'}</td>
                                <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(calc.property_tax_total)}</td>
                            </tr>
                            <tr className="total-row">
                                <td>Total Operating Expenses</td>
                                <td className="text-right tabular-nums">{formatCurrency(calc.opex_per_unit)}</td>
                                <td className="text-right tabular-nums">{formatCurrency(calc.total_opex)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="mt-2 text-xs text-[#7A8599]">OpEx Ratio: {calc.opex_ratio > 0 ? formatPercent(calc.opex_ratio, 1) : '—'}</div>
                </div>


                {/* ===== PAYROLL DETAIL ===== */}
                {payrollExpanded && (
                    <div className="card animate-fade-in">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Payroll Detail</h3>
                            <div className="flex gap-2">
                                <button onClick={() => handleAddPayroll('employee')} className="text-xs text-[#2563EB] hover:text-[#1D4FD7] font-medium">+ Employee</button>
                                <button onClick={() => handleAddPayroll('contract')} className="text-xs text-[#2563EB] hover:text-[#1D4FD7] font-medium">+ Contract</button>
                            </div>
                        </div>
                        <table className="data-table">
                            <thead><tr><th>Role</th><th className="text-right">HC</th><th className="text-right">Base</th><th className="text-right">Bonus%</th><th className="text-right">Total</th><th></th></tr></thead>
                            <tbody>
                                {sortedPayroll.map((row) => {
                                    const total = calcPayrollRowTotal(row, onePager.payroll_burden_pct);
                                    return (
                                        <tr key={row.id}>
                                            <td><input type="text" value={row.role_name} onChange={(e) => handleUpdatePayroll(row.id, 'role_name', e.target.value, row.role_name)} placeholder={row.line_type === 'employee' ? 'Role name' : 'Contract desc'} className="inline-input text-xs w-full text-left" /></td>
                                            {row.line_type === 'employee' ? (
                                                <>
                                                    <td><InlineInput value={row.headcount} onChange={(v) => handleUpdatePayroll(row.id, 'headcount', v, row.headcount)} format="number" decimals={1} className="text-xs" /></td>
                                                    <td><InlineInput value={row.base_compensation} onChange={(v) => handleUpdatePayroll(row.id, 'base_compensation', v, row.base_compensation)} format="currency" decimals={0} className="text-xs" /></td>
                                                    <td><InlineInput value={row.bonus_pct} onChange={(v) => handleUpdatePayroll(row.id, 'bonus_pct', v, row.bonus_pct)} format="percent" decimals={0} className="text-xs" /></td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="text-center text-[#C8CDD5] text-xs">—</td>
                                                    <td className="text-center text-[#C8CDD5] text-xs">—</td>
                                                    <td><InlineInput value={row.fixed_amount} onChange={(v) => handleUpdatePayroll(row.id, 'fixed_amount', v, row.fixed_amount)} format="currency" decimals={0} className="text-xs" /></td>
                                                </>
                                            )}
                                            <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(total)}</td>
                                            <td><button onClick={() => deletePayrollRowMutation.mutate({ id: row.id, onePagerId: onePager.id })} className="text-[#C8CDD5] hover:text-[#DC2626] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="mt-2 flex items-center justify-between text-xs text-[#7A8599]">
                            <span>Burden: {formatPercent(onePager.payroll_burden_pct)}</span>
                            <InlineInput value={onePager.payroll_burden_pct} onChange={(v) => updateField('payroll_burden_pct', v)} format="percent" decimals={0} className="text-xs w-20" />
                        </div>
                    </div>
                )}

                {/* ===== PROPERTY TAX DETAIL ===== */}
                {taxExpanded && (
                    <div className="card animate-fade-in">
                        <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Property Tax Detail</h3>
                        <div className="space-y-3">
                            <FieldRow label="Mil Rate"><InlineInput value={onePager.tax_mil_rate} onChange={(v) => updateField('tax_mil_rate', v)} format="number" decimals={4} /></FieldRow>
                            <FieldRow label="Assessed % — Hard"><InlineInput value={onePager.tax_assessed_pct_hard} onChange={(v) => updateField('tax_assessed_pct_hard', v)} format="percent" decimals={0} /></FieldRow>
                            <FieldRow label="Assessed % — Land"><InlineInput value={onePager.tax_assessed_pct_land} onChange={(v) => updateField('tax_assessed_pct_land', v)} format="percent" decimals={0} /></FieldRow>
                            <FieldRow label="Assessed % — Soft"><InlineInput value={onePager.tax_assessed_pct_soft} onChange={(v) => updateField('tax_assessed_pct_soft', v)} format="percent" decimals={0} /></FieldRow>
                            <div className="pt-2 border-t border-[#F0F1F4]">
                                <FieldRow label="Assessed Value" value={formatCurrency(calc.assessed_value)} display />
                                <FieldRow label="Annual Property Tax" value={formatCurrency(calc.property_tax_total)} display className="font-bold" />
                                <FieldRow label="Tax / Unit" value={formatCurrency(calc.property_tax_per_unit)} display />
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== SENSITIVITY ANALYSIS (full width, collapsible) ===== */}
                <div className="lg:col-span-3">
                    <button
                        onClick={() => setSensitivityExpanded(!sensitivityExpanded)}
                        className="card w-full flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                    >
                        <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider flex items-center gap-2">
                            {sensitivityExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            Sensitivity Analysis
                        </h3>
                        <span className="text-xs text-[#A0AABB]">{sensitivityExpanded ? 'Click to collapse' : 'Click to expand'}</span>
                    </button>

                    {sensitivityExpanded && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 animate-fade-in">
                            {/* Rent Sensitivity */}
                            <div className="card">
                                <h4 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Rent PSF Sensitivity</h4>
                                <table className="data-table">
                                    <thead><tr><th>Rent/SF</th><th className="text-right">GPR</th><th className="text-right">NOI</th><th className="text-right">YOC</th></tr></thead>
                                    <tbody>
                                        {rentSensitivity.map((row, i) => {
                                            const isBase = row.step === 0;
                                            return (
                                                <tr key={i} className={isBase ? 'bg-[#EBF1FF]' : ''}>
                                                    <td className={`tabular-nums ${isBase ? 'font-bold text-[#2563EB]' : 'text-[#4A5568]'}`}>{formatCurrency(row.adjustedValue, 2)}</td>
                                                    <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(row.gpr)}</td>
                                                    <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(row.noi)}</td>
                                                    <td className={`text-right text-xs tabular-nums font-semibold ${yocColor(row.yoc, calc.unlevered_yield_on_cost)}`}>{row.yoc > 0 ? formatPercent(row.yoc) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Hard Cost Sensitivity */}
                            <div className="card">
                                <h4 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Hard Cost Sensitivity</h4>
                                <table className="data-table">
                                    <thead><tr><th>HC/NRSF</th><th className="text-right">Budget</th><th className="text-right">NOI</th><th className="text-right">YOC</th></tr></thead>
                                    <tbody>
                                        {hardCostSensitivity.map((row, i) => {
                                            const isBase = row.step === 0;
                                            return (
                                                <tr key={i} className={isBase ? 'bg-[#EBF1FF]' : ''}>
                                                    <td className={`tabular-nums ${isBase ? 'font-bold text-[#2563EB]' : 'text-[#4A5568]'}`}>{formatCurrency(row.adjustedValue, 2)}</td>
                                                    <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(row.totalBudget)}</td>
                                                    <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(row.noi)}</td>
                                                    <td className={`text-right text-xs tabular-nums font-semibold ${yocColor(row.yoc, calc.unlevered_yield_on_cost)}`}>{row.yoc > 0 ? formatPercent(row.yoc) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Land Cost Sensitivity */}
                            <div className="card">
                                <h4 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Land Cost Sensitivity</h4>
                                <table className="data-table">
                                    <thead><tr><th>Land Cost</th><th className="text-right">Budget</th><th className="text-right">NOI</th><th className="text-right">YOC</th></tr></thead>
                                    <tbody>
                                        {landCostSensitivity.map((row, i) => {
                                            const isBase = row.step === 0;
                                            return (
                                                <tr key={i} className={isBase ? 'bg-[#EBF1FF]' : ''}>
                                                    <td className={`tabular-nums ${isBase ? 'font-bold text-[#2563EB]' : 'text-[#4A5568]'}`}>{formatCurrency(row.adjustedValue, 0)}</td>
                                                    <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(row.totalBudget)}</td>
                                                    <td className="text-right text-xs tabular-nums text-[#4A5568]">{formatCurrency(row.noi)}</td>
                                                    <td className={`text-right text-xs tabular-nums font-semibold ${yocColor(row.yoc, calc.unlevered_yield_on_cost)}`}>{row.yoc > 0 ? formatPercent(row.yoc) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* 2D Rent × Hard Cost Matrix */}
                            {sensitivityMatrix && (
                                <div className="lg:col-span-2 card">
                                    <h4 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Rent PSF vs. Hard Cost — YOC Matrix</h4>
                                    <div className="overflow-x-auto -mx-5">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th className="text-[10px]">Rent \ HC</th>
                                                    {sensitivityMatrix.hardCostSteps.map((step, j) => (
                                                        <th key={j} className="text-right text-[10px]">{step === 0 ? 'Base' : `${step > 0 ? '+' : ''}$${step}`}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sensitivityMatrix.values.map((row, i) => (
                                                    <tr key={i}>
                                                        <td className={`text-xs tabular-nums ${i === sensitivityMatrix.baseRentIdx ? 'font-bold text-[#2563EB]' : 'text-[#4A5568]'}`}>
                                                            {sensitivityMatrix.rentSteps[i] === 0 ? 'Base' : `${sensitivityMatrix.rentSteps[i] > 0 ? '+' : ''}$${sensitivityMatrix.rentSteps[i].toFixed(2)}`}
                                                        </td>
                                                        {row.map((yoc, j) => {
                                                            const isBase = i === sensitivityMatrix.baseRentIdx && j === sensitivityMatrix.baseHcIdx;
                                                            return (
                                                                <td
                                                                    key={j}
                                                                    className={`text-right text-xs tabular-nums font-medium ${isBase ? 'ring-2 ring-[#2563EB] ring-inset rounded' : ''}`}
                                                                    style={{ backgroundColor: yocBgColor(yoc, calc.unlevered_yield_on_cost) }}
                                                                >
                                                                    {yoc > 0 ? formatPercent(yoc) : '—'}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== ARCHITECTURE & PLANNING NOTES (full width) ===== */}
            <div className="card mt-4">
                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Architecture & Planning Notes</h3>
                <RichTextEditor
                    content={pursuit.arch_notes}
                    onChange={(json) => updatePursuitMutation.mutate({ id: pursuit.id, updates: { arch_notes: json } })}
                    placeholder="Enter architecture and planning notes..."
                />
            </div>

            {/* ===== DIALOGS ===== */}

            {/* Duplicate Dialog */}
            {
                showDuplicateDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-4">Duplicate One-Pager</h2>
                            <p className="text-sm text-[#7A8599] mb-4">
                                Creates a full copy of this one-pager including all unit mix, payroll, and soft cost data.
                            </p>
                            <div>
                                <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Name for the copy</label>
                                <input
                                    type="text"
                                    value={duplicateName}
                                    onChange={(e) => setDuplicateName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleDuplicate()}
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowDuplicateDialog(false)} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors">Cancel</button>
                                <button onClick={handleDuplicate} disabled={duplicateOnePager.isPending} className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm">
                                    {duplicateOnePager.isPending ? 'Duplicating...' : 'Duplicate'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Archive Confirm */}
            {
                showArchiveConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-2">Archive One-Pager</h2>
                            <p className="text-sm text-[#7A8599] mb-4">
                                Archive &ldquo;{onePager.name}&rdquo;? This hides it from the active list but doesn&rsquo;t delete any data.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowArchiveConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors">Cancel</button>
                                <button onClick={handleArchive} disabled={archiveOnePager.isPending} className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm">
                                    {archiveOnePager.isPending ? 'Archiving...' : 'Archive'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

// ============================================================
// Helper Components & Utils
// ============================================================

function UnitTypeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [local, setLocal] = useState(value);
    const [editing, setEditing] = useState(false);

    // Sync from props when not editing
    useEffect(() => {
        if (!editing) setLocal(value);
    }, [value, editing]);

    return (
        <input
            type="text"
            value={local}
            onChange={(e) => { setLocal(e.target.value); setEditing(true); }}
            onBlur={() => { setEditing(false); if (local !== value) onChange(local); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="inline-input text-xs w-full text-left font-medium text-[#1A1F2B] min-w-0"
            style={{ textAlign: 'left' }}
        />
    );
}

function MetricCell({ label, value, format, decimals = 0 }: { label: string; value: number; format: 'currency' | 'percent'; decimals?: number; }) {
    return (
        <div>
            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">{label}</div>
            <div className="text-sm font-semibold text-[#1A1F2B] tabular-nums mt-0.5">
                {value !== 0 ? (format === 'currency' ? formatCurrency(value, decimals) : formatPercent(value, decimals)) : '—'}
            </div>
        </div>
    );
}

function FieldRow({ label, value, display, className, children }: { label: string; value?: string; display?: boolean; className?: string; children?: React.ReactNode; }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[#7A8599] whitespace-nowrap">{label}</span>
            {display ? <span className={`text-xs tabular-nums text-[#1A1F2B] ${className || ''}`}>{value}</span> : <div className="w-28">{children}</div>}
        </div>
    );
}

function OpExRow({ label, value, units, onChange, editAllMode }: { label: string; value: number; units: number; onChange: (v: number) => void; editAllMode?: boolean; }) {
    return (
        <tr>
            <td className="text-[#7A8599] text-xs">{label}</td>
            <td><InlineInput value={value} onChange={onChange} format="currency" decimals={0} className="text-xs" editAllMode={editAllMode} /></td>
            <td className="text-right text-xs tabular-nums text-[#1A1F2B]">{units > 0 ? formatCurrency(value * units) : '—'}</td>
        </tr>
    );
}

/** Color YOC text based on comparison to base */
function yocColor(yoc: number, base: number): string {
    if (yoc <= 0 || base <= 0) return 'text-[#7A8599]';
    if (yoc > base * 1.005) return 'text-[#0D7A3E]';
    if (yoc < base * 0.995) return 'text-[#DC2626]';
    return 'text-[#2563EB]';
}

/** Background color for YOC matrix cells */
function yocBgColor(yoc: number, base: number): string {
    if (yoc <= 0 || base <= 0) return 'transparent';
    const ratio = yoc / base;
    if (ratio >= 1.10) return '#DCFCE7'; // deep green
    if (ratio >= 1.05) return '#ECFDF3'; // light green
    if (ratio >= 1.01) return '#F0FFF4'; // faint green
    if (ratio <= 0.90) return '#FEE2E2'; // deep red
    if (ratio <= 0.95) return '#FEF2F2'; // light red
    if (ratio <= 0.99) return '#FFFBEB'; // faint amber
    return 'transparent';
}
