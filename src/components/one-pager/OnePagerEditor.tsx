'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
    useProductTypes,
    useUpdateOnePager,
    useUpdatePursuit,
    useUnitMix,
    usePayroll,
    useSoftCostDetails,
    useUnitPremiums,
    useOtherIncome,
    useUpsertOtherIncomeRow,
    useUpsertUnitMixRow,
    useDeleteUnitMixRow,
    useUpsertPayrollRow,
    useDeletePayrollRow,
    useUpsertSoftCostRow,
    useDeleteSoftCostRow,
    useUpsertUnitPremium,
    useDeleteUnitPremium,
    useDuplicateOnePager,
    useArchiveOnePager,
    useTaxJurisdictions,
    queryKeys,
} from '@/hooks/useSupabaseQueries';
import { useCalculations } from '@/hooks/useCalculations';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useRealtimeOnePager, parseTimestamp } from '@/hooks/useRealtimeOnePager';
import { toast } from '@/lib/toast';
import { InlineInput } from './InlineInput';
import './one-pager.css';
import { CollapsibleSection } from './CollapsibleSection';
import FieldNoteButton from './FieldNoteButton';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { DebouncedTextInput } from '@/components/shared/DebouncedTextInput';
import { calcUnitMixRow, calcPayrollRowTotal } from '@/lib/calculations';
import {
    calcRentSensitivity,
    calcHardCostSensitivity,
    calcLandCostSensitivity,
    calcSensitivityMatrix,
} from '@/lib/calculations/sensitivity';
import { formatCurrency, formatPercent, formatNumber, SF_PER_ACRE } from '@/lib/constants';
import { findTaxJurisdiction, taxJurisdictionLabel } from '@/lib/taxJurisdictions';
import { STANDARD_PAYROLL_ROLES, normalizePayrollRole, inferUnitType } from '@/lib/standardNames';
import { onePagerGaps } from '@/lib/onePagerStatus';
import { PrototypePicker, FloorPlanButton } from './PrototypePicker';
import { TargetYieldCard } from './TargetYieldCard';
import { OtherIncomeLines } from './OtherIncomeLines';
import { VersionsPanel } from './VersionsPanel';
import { withItemizedOtherIncome } from '@/lib/calculations/otherIncome';
import type { UnitPrototype } from '@/hooks/useUnitPrototypes';
import type { Pursuit, OnePager, UnitPremium } from '@/types';
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
    Car,
    Library,
    History,
    MoreHorizontal,
} from 'lucide-react';
import * as queries from '@/lib/supabase/queries';

// Module-level defaults keep the sensitivity memos stable (a fresh `?? [...]`
// array on every render used to recompute all four grids on each render).
const DEFAULT_RENT_STEPS = [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15];
const DEFAULT_HARD_COST_STEPS = [-15, -10, -5, 0, 5, 10, 15];
const DEFAULT_LAND_COST_STEPS = [-2000000, -1000000, -500000, 0, 500000, 1000000, 2000000];
const EMPTY_NOTES: Record<string, string> = {};

interface OnePagerEditorProps {
    pursuit: Pursuit;
    onePager: OnePager;
    /** The URL param used to fetch this one-pager (may be short_id) */
    queryId?: string;
}

export function OnePagerEditor({ pursuit, onePager, queryId }: OnePagerEditorProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: productTypes = [] } = useProductTypes();
    const { data: unitMixRows = [], isLoading: loadingUnitMix } = useUnitMix(onePager.id);
    const { data: payrollRows = [], isLoading: loadingPayroll } = usePayroll(onePager.id);
    const { data: softCostDetails = [], isLoading: loadingSoftCosts } = useSoftCostDetails(onePager.id);

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
    const { data: unitPremiums = [], isLoading: loadingPremiums } = useUnitPremiums(onePager.id);
    const { data: otherIncomeRows = [], isLoading: loadingOtherIncome } = useOtherIncome(onePager.id);
    const upsertOtherIncomeRow = useUpsertOtherIncomeRow();
    const { data: taxJurisdictions = [] } = useTaxJurisdictions();
    const taxJurisdiction = findTaxJurisdiction(taxJurisdictions, pursuit);
    const upsertUnitPremium = useUpsertUnitPremium();
    const deleteUnitPremiumMutation = useDeleteUnitPremium();

    const productType = productTypes.find((pt) => pt.id === onePager.product_type_id);
    // If a subtype has its own density range, use that; otherwise fall back to parent
    const subProductType = productType?.sub_product_types?.find((spt) => spt.id === onePager.sub_product_type_id);
    const effectiveDensityLow = (subProductType?.density_low != null ? subProductType.density_low : productType?.density_low) ?? 0;
    const effectiveDensityHigh = (subProductType?.density_high != null ? subProductType.density_high : productType?.density_high) ?? 0;
    const densityLabel = subProductType?.density_low != null ? subProductType.name : productType?.name ?? '';

    const [payrollExpanded] = useState(true); // always visible
    const [taxExpanded] = useState(true); // always visible
    const [sensitivityExpanded, setSensitivityExpanded] = useState(false);
    const [softCostExpanded, setSoftCostExpanded] = useState(false);
    const [premiumsExpanded] = useState(true); // always visible
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [editAllMode, setEditAllMode] = useState(false);
    const [showPrototypePicker, setShowPrototypePicker] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const addMenuRef = useRef<HTMLDivElement>(null);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showVersions, setShowVersions] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);

    // Close the toolbar overflow menu on outside click / Escape
    useEffect(() => {
        if (!showMoreMenu) return;
        const handleClick = (e: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
        };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMoreMenu(false); };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [showMoreMenu]);

    // Close add menu on outside click
    useEffect(() => {
        if (!showAddMenu) return;
        function handleClick(e: MouseEvent) {
            if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
                setShowAddMenu(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showAddMenu]);

    const pendingUpdatesRef = useRef<Partial<OnePager>>({});
    // Updates sent to the server but not yet acknowledged. Together with
    // pendingUpdatesRef these are re-applied if a refetch (realtime echo,
    // window focus) lands mid-edit and would otherwise revert the UI.
    const inFlightUpdatesRef = useRef<Partial<OnePager>>({});
    // Field-note edits not yet acknowledged, by note key (null = cleared).
    // field_notes is one JSONB object shared by everyone on this one-pager, so it
    // is never saved or re-applied wholesale: these keys are merged into the
    // newest known object instead, so two people editing different notes don't
    // overwrite each other.
    const pendingNoteEditsRef = useRef<Record<string, string | null>>({});
    // Newest server updated_at seen (fetch, own save response or realtime event).
    // Realtime events at or before it are echoes of our own saves or stale.
    const serverUpdatedAtRef = useRef<number | null>(parseTimestamp(onePager.updated_at));

    // Always-current one-pager for callbacks (avoids stale oldValue in undo entries)
    const onePagerRef = useRef(onePager);
    onePagerRef.current = onePager;

    // The page reads the one-pager under the URL param (usually the short id);
    // writes go to both that key and the UUID key.
    const readKey = useMemo(() => queryKeys.onePager(queryId || onePager.id), [queryId, onePager.id]);
    const patchCache = useCallback((patch: Partial<OnePager>) => {
        const apply = (old: OnePager | undefined) => (old ? { ...old, ...patch } : old);
        queryClient.setQueryData(queryKeys.onePager(onePager.id), apply);
        if (queryId && queryId !== onePager.id) queryClient.setQueryData(queryKeys.onePager(queryId), apply);
    }, [queryClient, onePager.id, queryId]);

    const withNoteEdits = useCallback((base: Record<string, string> | null | undefined) => {
        const next: Record<string, string> = { ...(base ?? {}) };
        for (const [k, v] of Object.entries(pendingNoteEditsRef.current)) {
            if (v === null) delete next[k];
            else next[k] = v;
        }
        return next;
    }, []);

    /**
     * Merge a server copy of the row (another user's realtime update, or the
     * response to our own save) into the cache. Fields with a local edit pending
     * or in flight keep the local value; field notes merge per key.
     */
    const mergeServerRow = useCallback((row: Partial<OnePager>) => {
        const cached = ((queryClient.getQueryData(readKey) as OnePager | undefined) ?? onePagerRef.current) as unknown as Record<string, unknown>;
        const local = { ...inFlightUpdatesRef.current, ...pendingUpdatesRef.current } as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        for (const [k, raw] of Object.entries(row)) {
            if (k === 'field_notes' || k === 'updated_at' || k in local) continue;
            let v: unknown = raw;
            // Guard against numeric columns arriving as strings in change payloads
            if (typeof cached[k] === 'number' && typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) v = Number(raw);
            if (JSON.stringify(cached[k]) !== JSON.stringify(v)) patch[k] = v;
        }
        if ('field_notes' in row) {
            const merged = withNoteEdits(row.field_notes);
            if (JSON.stringify(merged) !== JSON.stringify(cached.field_notes ?? {})) patch.field_notes = merged;
        }
        if (Object.keys(patch).length === 0) return;
        if (row.updated_at) patch.updated_at = row.updated_at;
        patchCache(patch as Partial<OnePager>);
    }, [queryClient, readKey, withNoteEdits, patchCache]);

    const noteServerTimestamp = (updatedAt: string | null | undefined) => {
        const ts = parseTimestamp(updatedAt);
        if (ts === null) return null;
        if (serverUpdatedAtRef.current === null || ts > serverUpdatedAtRef.current) serverUpdatedAtRef.current = ts;
        return ts;
    };

    // Keep the high-water mark current when a refetch brings a newer row
    useEffect(() => {
        const ts = parseTimestamp(onePager.updated_at);
        if (ts !== null && (serverUpdatedAtRef.current === null || ts > serverUpdatedAtRef.current)) serverUpdatedAtRef.current = ts;
    }, [onePager.updated_at]);

    // Realtime: other users' edits appear live without clobbering our own
    const handleRemoteOnePager = useCallback((row: Partial<OnePager>) => {
        const ts = parseTimestamp(row.updated_at);
        if (ts !== null) {
            // Echo of a save we already have the response for, or an out-of-order older event
            if (serverUpdatedAtRef.current !== null && ts <= serverUpdatedAtRef.current) return;
            serverUpdatedAtRef.current = ts;
        }
        // An echo that beats our save's response carries our own values for the
        // fields still in flight — mergeServerRow skips those.
        mergeServerRow(row);
    }, [mergeServerRow]);
    useRealtimeOnePager(onePager.id, { queryId, onOnePagerUpdate: handleRemoteOnePager });

    const { save, flush: flushSave, status: saveStatus } = useAutoSave(async (data: { id: string; updates: Partial<OnePager> }) => {
        // Clear the pending updates so subsequent edits accumulate in a fresh batch
        pendingUpdatesRef.current = {};
        let updates = data.updates;
        // Right before sending, re-merge our note edits into the newest field_notes we
        // know of (realtime keeps the cache current), rather than a copy taken when
        // the edit was queued.
        let noteEditsSent: Record<string, string | null> | null = null;
        if ('field_notes' in updates) {
            noteEditsSent = { ...pendingNoteEditsRef.current };
            const latest = (queryClient.getQueryData(readKey) as OnePager | undefined)?.field_notes ?? onePagerRef.current.field_notes;
            updates = { ...updates, field_notes: withNoteEdits(latest) };
        }
        inFlightUpdatesRef.current = { ...inFlightUpdatesRef.current, ...updates };
        let saved: OnePager | undefined;
        try {
            let toSend = updates;
            if (noteEditsSent && Object.keys(noteEditsSent).length > 0) {
                // Merge each edited note key server-side in one UPDATE, instead of writing
                // the whole field_notes object (which could drop a concurrent edit by
                // someone else). A null result means the RPC isn't deployed yet: keep
                // the whole-object save as the fallback.
                const results = await Promise.all(
                    Object.entries(noteEditsSent).map(([k, v]) => queries.setOnePagerFieldNote(data.id, k, v)),
                );
                if (results.every((r) => r !== null)) {
                    const rest = { ...updates };
                    delete rest.field_notes;
                    toSend = rest;
                }
            }
            if (Object.keys(toSend).length > 0) {
                saved = await updateOnePagerMutation.mutateAsync({ id: data.id, updates: toSend, queryId });
            }
        } finally {
            // Drop acknowledged keys unless a newer save already replaced them
            const inFlight = inFlightUpdatesRef.current as Record<string, unknown>;
            for (const [k, v] of Object.entries(updates)) {
                if (inFlight[k] === v) delete inFlight[k];
            }
            if (noteEditsSent) {
                const pendingNotes = pendingNoteEditsRef.current;
                for (const [k, v] of Object.entries(noteEditsSent)) {
                    if (pendingNotes[k] === v) delete pendingNotes[k];
                }
            }
        }
        // The response is the full row as of this write, so it also carries any
        // changes other users made in the meantime.
        if (saved) {
            noteServerTimestamp(saved.updated_at);
            mergeServerRow(saved);
        }
    });

    // Re-apply unsaved/in-flight local edits on top of server data after a refetch
    useEffect(() => {
        const overlay = { ...inFlightUpdatesRef.current, ...pendingUpdatesRef.current } as Record<string, unknown>;
        const current = onePager as unknown as Record<string, unknown>;
        // Notes: re-apply only our own keys on top of the fetched object
        delete overlay.field_notes;
        if (Object.keys(pendingNoteEditsRef.current).length > 0) overlay.field_notes = withNoteEdits(onePager.field_notes);
        const stale = Object.keys(overlay).some((k) => JSON.stringify(current[k] ?? {}) !== JSON.stringify(overlay[k] ?? {}));
        if (!stale) return;
        patchCache(overlay as Partial<OnePager>);
    }, [onePager, patchCache, withNoteEdits]);

    const sortedUnitMix = useMemo(() => [...unitMixRows].sort((a, b) => a.sort_order - b.sort_order), [unitMixRows]);
    const sortedPayroll = useMemo(() => [...payrollRows].sort((a, b) => a.sort_order - b.sort_order), [payrollRows]);
    const sortedOtherIncome = useMemo(() => [...otherIncomeRows].sort((a, b) => a.sort_order - b.sort_order), [otherIncomeRows]);
    const mixUnits = useMemo(() => sortedUnitMix.reduce((sum, r) => sum + r.unit_count, 0), [sortedUnitMix]);
    // With itemized other income, the lines set other_income_per_unit_month for every calculation
    const effectiveOnePager = useMemo(
        () => withItemizedOtherIncome(onePager, sortedOtherIncome, mixUnits),
        [onePager, sortedOtherIncome, mixUnits]
    );

    const calc = useCalculations({
        onePager: effectiveOnePager,
        unitMix: sortedUnitMix,
        payroll: sortedPayroll,
        softCostDetails,
        siteAreaSf: pursuit.site_area_sf,
        productTypeDensityLow: effectiveDensityLow,
        productTypeDensityHigh: effectiveDensityHigh,
        unitPremiums,
    });

    // ============================================================
    // Sync latest calc values to DB whenever they change.
    // updateField() saves calc values, but they're from the previous render
    // (one step behind). This effect ensures the DB always has the latest.
    // ============================================================
    const lastSyncedCalcRef = useRef('');
    const childDataLoading = loadingUnitMix || loadingPayroll || loadingSoftCosts || loadingPremiums || loadingOtherIncome;
    useEffect(() => {
        // Never sync while child rows are still loading — calc would be all zeros
        if (childDataLoading) return;
        const totalUnits = sortedUnitMix.reduce((s, r) => s + r.unit_count, 0);
        const calcSnapshot = {
            total_units: totalUnits,
            calc_total_nrsf: calc.total_nrsf,
            calc_total_gbsf: calc.total_gbsf,
            calc_gpr: calc.gross_potential_rent,
            calc_net_revenue: calc.net_revenue,
            calc_total_budget: calc.total_budget,
            calc_hard_cost: calc.hard_cost,
            calc_soft_cost: calc.soft_cost,
            calc_carry_cost: calc.carry_cost,
            calc_total_opex: calc.total_opex,
            calc_noi: calc.noi,
            calc_yoc: calc.unlevered_yield_on_cost,
            calc_cost_per_unit: calc.cost_per_unit,
            calc_noi_per_unit: calc.noi_per_unit,
            // Keep the stored per-unit figure equal to the itemized lines, for reports and exports
            ...(effectiveOnePager.use_detailed_other_income ? { other_income_per_unit_month: effectiveOnePager.other_income_per_unit_month } : {}),
        };
        const key = JSON.stringify(calcSnapshot);
        if (key === lastSyncedCalcRef.current) return;
        lastSyncedCalcRef.current = key;

        // Don't write when the stored values already match — otherwise merely
        // opening a one-pager issues an UPDATE (and a realtime event for everyone else).
        const stored = onePagerRef.current as unknown as Record<string, unknown>;
        const alreadyStored = Object.entries(calcSnapshot).every(([k, v]) => {
            const sv = Number(stored[k] ?? 0);
            return Math.abs(sv - v) <= Math.max(1e-6, Math.abs(v) * 1e-9);
        });
        const queued = { ...inFlightUpdatesRef.current, ...pendingUpdatesRef.current } as Record<string, unknown>;
        const hasQueuedCalc = Object.keys(calcSnapshot).some((k) => k in queued);
        if (alreadyStored && !hasQueuedCalc) return;

        // Add the calc fields to the pending queue and hit the unified debouncer
        pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...calcSnapshot };
        save({ id: onePager.id, updates: { ...pendingUpdatesRef.current } });
    }, [calc, sortedUnitMix, onePager.id, save, childDataLoading, effectiveOnePager.use_detailed_other_income, effectiveOnePager.other_income_per_unit_month]);

    // ============================================================
    // Undo/Redo System
    // ============================================================

    // Set by applyNoteEdit below (declared later; undo only runs after mount)
    const applyNoteEditRef = useRef<(fieldKey: string, note: string) => void>(() => { });

    const applyUndoRedo = useCallback(
        (action: import('@/hooks/useUndoRedo').UndoAction, direction: 'undo' | 'redo') => {
            const value = direction === 'undo' ? action.oldValue : action.newValue;

            switch (action.entity) {
                case 'onePager': {
                    // Route through the shared debounced queue so a still-pending
                    // save of the newer value can't overwrite the undo afterwards.
                    const updates = { [action.field]: value } as Partial<OnePager>;
                    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };
                    patchCache(updates);
                    save({ id: action.entityId, updates: { ...pendingUpdatesRef.current } });
                    break;
                }
                case 'fieldNote': {
                    applyNoteEditRef.current(action.field, typeof value === 'string' ? value : '');
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
        [upsertUnitMixRow, upsertPayrollRow, onePager.id, save, patchCache]
    );

    const { push: pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo(applyUndoRedo);

    // ============================================================
    // Field Update Helpers (with undo tracking)
    // ============================================================

    const updateField = useCallback(
        (field: string, value: number | boolean | string) => {
            const oldValue = (onePagerRef.current as unknown as Record<string, unknown>)[field];
            pushUndo({ entity: 'onePager', entityId: onePager.id, field, oldValue, newValue: value });

            const updates: Partial<OnePager> = { [field]: value };

            // 1. Accumulate the pending updates
            pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

            // 2. Optimistically update the query cache so UI reacts instantly
            patchCache(updates);

            // 3. Debounce save through the shared auto-save mechanism
            save({ id: onePager.id, updates: { ...pendingUpdatesRef.current } });
        },
        [onePager.id, save, pushUndo, patchCache]
    );

    // Field-level notes: one key changes per edit, merged into the latest object at save time
    const fieldNotes = onePager.field_notes ?? EMPTY_NOTES;
    const applyNoteEdit = useCallback(
        (fieldKey: string, note: string) => {
            pendingNoteEditsRef.current = { ...pendingNoteEditsRef.current, [fieldKey]: note.trim() ? note : null };
            const current = (queryClient.getQueryData(readKey) as OnePager | undefined) ?? onePagerRef.current;
            const merged = withNoteEdits(current.field_notes);
            pendingUpdatesRef.current = { ...pendingUpdatesRef.current, field_notes: merged };
            patchCache({ field_notes: merged });
            save({ id: onePager.id, updates: { ...pendingUpdatesRef.current } });
        },
        [queryClient, readKey, withNoteEdits, patchCache, save, onePager.id]
    );
    useEffect(() => { applyNoteEditRef.current = applyNoteEdit; }, [applyNoteEdit]);

    const updateFieldNote = useCallback(
        (fieldKey: string, note: string) => {
            const oldValue = (onePagerRef.current.field_notes ?? EMPTY_NOTES)[fieldKey] ?? '';
            pushUndo({ entity: 'fieldNote', entityId: onePager.id, field: fieldKey, oldValue, newValue: note });
            applyNoteEdit(fieldKey, note);
        },
        [pushUndo, applyNoteEdit, onePager.id]
    );

    const handleUnitMixChange = useCallback(
        (rowId: string, field: string, value: number | string, oldValue: unknown) => {
            pushUndo({ entity: 'unitMix', entityId: rowId, field, oldValue, newValue: value });
            // A label that names a bedroom count ("2 BR", "Penthouse") also sets the row's type
            const unitType = field === 'unit_type_label' && typeof value === 'string' ? inferUnitType(value) : null;
            upsertUnitMixRow.mutate({ id: rowId, one_pager_id: onePager.id, [field]: value, ...(unitType ? { unit_type: unitType } : {}) });

            // Persist total_units to the one_pagers row so dashboard/overview can read it
            if (field === 'unit_count') {
                const currentTotal = sortedUnitMix.reduce((s, r) => s + r.unit_count, 0);
                const delta = (typeof value === 'number' ? value : 0) - (typeof oldValue === 'number' ? oldValue : 0);
                const newTotal = currentTotal + delta;
                const calcUpdates: Partial<OnePager> = { total_units: newTotal };
                
                pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...calcUpdates };
                patchCache(calcUpdates);
                save({ id: onePager.id, updates: { ...pendingUpdatesRef.current } });
            }
        },
        [upsertUnitMixRow, onePager.id, pushUndo, sortedUnitMix, save, patchCache]
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

    // Switching to itemized keeps the current total: an existing $/unit figure becomes the first line.
    // Switching back keeps the total too, since the stored per-unit figure tracks the lines.
    const handleToggleItemizedOtherIncome = () => {
        const on = !onePager.use_detailed_other_income;
        if (on && otherIncomeRows.length === 0 && onePager.other_income_per_unit_month > 0) {
            upsertOtherIncomeRow.mutate({
                id: crypto.randomUUID(),
                one_pager_id: onePager.id,
                name: 'Other Income',
                unit_count: mixUnits,
                amount_per_month: onePager.other_income_per_unit_month,
                sort_order: 0,
            });
        }
        updateField('use_detailed_other_income', on);
    };

    // ============================================================
    // Duplicate & Archive
    // ============================================================

    const handleDuplicate = async (requestedName: string) => {
        const name = requestedName.trim() || `Copy of ${onePager.name}`;
        try {
            const newOp = await duplicateOnePager.mutateAsync({ sourceId: onePager.id, newName: name });
            setShowDuplicateDialog(false);
            router.push(`/pursuits/${pursuit.short_id}/one-pagers/${newOp.short_id}`);
        } catch (err) {
            console.error('Duplicate failed:', err);
            toast.error('Failed to duplicate one-pager', err);
        }
    };

    const handleArchive = async () => {
        try {
            await archiveOnePager.mutateAsync({ id: onePager.id, pursuitId: pursuit.id });
            router.push(`/pursuits/${pursuit.short_id}`);
        } catch (err) {
            console.error('Archive failed:', err);
            toast.error('Failed to archive one-pager', err);
        }
    };

    const handleRename = (name: string) => {
        updateOnePagerMutation.mutate(
            { id: onePager.id, updates: { name }, queryId },
            { onError: (err) => toast.error('Failed to rename one-pager', err) }
        );
    };

    // Exports load @react-pdf / exceljs only when used
    const handleExportPdf = async () => {
        setShowMoreMenu(false);
        setIsExportingPdf(true);
        try {
            const { pdf } = await import('@react-pdf/renderer');
            const { OnePagerPDF } = await import('@/components/export/OnePagerPDF');
            const doc = <OnePagerPDF onePager={effectiveOnePager} pursuit={pursuit} calc={calc} productTypeName={productType?.name} unitMix={sortedUnitMix} payroll={sortedPayroll} softCostDetails={softCostDetails} unitPremiums={unitPremiums} showPayroll={true} showPropertyTax={true} />;
            const blob = await pdf(doc).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${onePager.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.pdf`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error('PDF export failed:', err);
            toast.error('PDF export failed', err);
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleExportExcel = async () => {
        setShowMoreMenu(false);
        setIsExportingExcel(true);
        try {
            const { exportOnePagerToExcel } = await import('@/components/export/exportExcel');
            await exportOnePagerToExcel({ onePager: effectiveOnePager, pursuit, calc, productTypeName: productType?.name });
        } catch (err) {
            console.error('Excel export failed:', err);
            toast.error('Excel export failed', err);
        } finally {
            setIsExportingExcel(false);
        }
    };

    const openDuplicateDialog = () => {
        setShowMoreMenu(false);
        setShowDuplicateDialog(true);
    };

    const hasSiteArea = pursuit.site_area_sf > 0;

    // Density status — use effective (subtype-overridden) range
    const densityStatus = (() => {
        if (!productType || calc.density_units_per_acre === 0) return null;
        if (calc.density_units_per_acre < effectiveDensityLow) return 'below';
        if (calc.density_units_per_acre > effectiveDensityHigh) return 'above';
        return 'within';
    })();

    // Total premium income (annual)
    const totalPremiumIncome = unitPremiums.reduce((sum, p) => sum + (p.unit_count * p.rent_premium_per_unit_month * 12), 0);

    // ============================================================
    // Sensitivity Analysis (memoized)
    // ============================================================

    const rentSteps = onePager.sensitivity_rent_steps ?? DEFAULT_RENT_STEPS;
    const hardCostSteps = onePager.sensitivity_hard_cost_steps ?? DEFAULT_HARD_COST_STEPS;
    const landCostSteps = onePager.sensitivity_land_cost_steps ?? DEFAULT_LAND_COST_STEPS;

    const rentSensitivity = useMemo(
        () => sensitivityExpanded ? calcRentSensitivity(effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps, unitPremiums) : [],
        [sensitivityExpanded, effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps, unitPremiums]
    );

    const hardCostSensitivity = useMemo(
        () => sensitivityExpanded ? calcHardCostSensitivity(effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, hardCostSteps, unitPremiums) : [],
        [sensitivityExpanded, effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, hardCostSteps, unitPremiums]
    );

    const landCostSensitivity = useMemo(
        () => sensitivityExpanded ? calcLandCostSensitivity(effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, landCostSteps, unitPremiums) : [],
        [sensitivityExpanded, effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, landCostSteps, unitPremiums]
    );

    const sensitivityMatrix = useMemo(
        () => sensitivityExpanded ? calcSensitivityMatrix(effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps, hardCostSteps, unitPremiums) : null,
        [sensitivityExpanded, effectiveOnePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps, hardCostSteps, unitPremiums]
    );

    /** Annual dollars → per unit per month / per NRSF per month (Revenue card) */
    const perUnitMonth = (annual: number) => (onePager.total_units > 0 ? formatCurrency(annual / onePager.total_units / 12) : '—');
    const perSfMonth = (annual: number) => (calc.total_nrsf > 0 ? formatCurrency(annual / calc.total_nrsf / 12, 2) : '—');

    if (loadingUnitMix || loadingPayroll) {
        return <div className="flex justify-center py-24" role="status" aria-label="Loading one-pager"><Loader2 className="w-8 h-8 animate-spin text-[var(--text-faint)]" /></div>;
    }

    return (
        <div className="one-pager max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
            {/* Top bar — stacks below lg; the right padding keeps clear of the page's
                floating Comments button (absolute top-right on the one-pager route). */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 sm:mb-6 lg:pr-36">
                <div className="flex items-center gap-3 min-w-0 pr-12 sm:pr-36 lg:pr-0">
                    <Link href={`/pursuits/${pursuit.short_id}`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors truncate max-w-[40%] flex-shrink-0">
                        <ChevronLeft className="w-4 h-4 inline mr-1" aria-hidden />{pursuit.name}
                    </Link>
                    <span className="text-[var(--border-strong)]" aria-hidden>/</span>
                    <OnePagerNameEditor name={onePager.name} onRename={handleRename} />
                    {productType && <span className="hidden sm:inline text-xs text-[var(--text-muted)] px-2.5 py-0.5 rounded-md bg-[var(--bg-elevated)] font-medium whitespace-nowrap">{productType.name}</span>}
                    {onePagerGaps(onePager).length > 0 && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[var(--warning-bg)] text-[var(--warning)] whitespace-nowrap" title="Left out of report averages and best-yield comparisons until complete">
                            Incomplete · no {onePagerGaps(onePager).join(', ')}
                        </span>
                    )}
                </div>

                {/* Actions Toolbar — secondary actions fold into "…" below xl */}
                <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                    {/* Edit All Toggle */}
                    <button
                        onClick={() => setEditAllMode(!editAllMode)}
                        aria-pressed={editAllMode}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${editAllMode
                            ? 'bg-[var(--accent)] text-white shadow-sm hover:bg-[var(--accent-hover)]'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                            }`}
                        title={editAllMode ? 'Done Editing' : 'Edit All Fields'}
                    >
                        {editAllMode ? <PencilOff className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        {editAllMode ? 'Done' : 'Edit All'}
                    </button>

                    <div className="w-px h-5 bg-[var(--border)] mx-1" aria-hidden />

                    {/* Undo/Redo */}
                    <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Undo (Ctrl+Z)" aria-label="Undo">
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
                        <Redo2 className="w-4 h-4" />
                    </button>

                    <div className="w-px h-5 bg-[var(--border)] mx-1" aria-hidden />

                    {/* Inline secondary actions on wide screens (they wrapped the toolbar at 1280) */}
                    <div className="hidden min-[88.75rem]:flex items-center gap-2">
                        <button
                            onClick={handleExportPdf}
                            disabled={isExportingPdf}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 transition-colors"
                            title="Export PDF"
                        >
                            {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                            PDF
                        </button>
                        <button
                            onClick={handleExportExcel}
                            disabled={isExportingExcel}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 transition-colors"
                            title="Export Excel"
                        >
                            {isExportingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                            Excel
                        </button>
                        <button onClick={openDuplicateDialog} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors" title="Duplicate">
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                        </button>
                        <button onClick={() => setShowVersions(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors" title="Versions">
                            <History className="w-3.5 h-3.5" /> Versions
                        </button>
                    </div>

                    {/* Overflow menu (below xl) */}
                    <div className="relative min-[88.75rem]:hidden" ref={moreMenuRef}>
                        <button
                            onClick={() => setShowMoreMenu((o) => !o)}
                            aria-haspopup="menu"
                            aria-expanded={showMoreMenu}
                            aria-label="More actions"
                            title="More actions"
                            className="flex items-center gap-1.5 p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                            {isExportingPdf || isExportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                        </button>
                        {showMoreMenu && (
                            <div role="menu" className="absolute left-0 lg:left-auto lg:right-0 top-full mt-1 z-30 w-44 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg py-1 animate-fade-in" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                                <button role="menuitem" onClick={handleExportPdf} disabled={isExportingPdf} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50">
                                    <FileDown className="w-3.5 h-3.5" /> Export PDF
                                </button>
                                <button role="menuitem" onClick={handleExportExcel} disabled={isExportingExcel} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50">
                                    <FileDown className="w-3.5 h-3.5" /> Export Excel
                                </button>
                                <button role="menuitem" onClick={openDuplicateDialog} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                                    <Copy className="w-3.5 h-3.5" /> Duplicate
                                </button>
                                <button role="menuitem" onClick={() => { setShowMoreMenu(false); setShowVersions(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                                    <History className="w-3.5 h-3.5" /> Versions
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Archive */}
                    <button onClick={() => setShowArchiveConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors" title="Archive" aria-label="Archive one-pager">
                        <Archive className="w-3.5 h-3.5" />
                    </button>

                    {/* Save Status */}
                    <span className="min-w-[88px]" aria-live="polite">
                        {saveStatus !== 'idle' && (
                            <span className={`save-indicator ${saveStatus}`}>
                                {saveStatus === 'saving' && '● Saving...'}
                                {saveStatus === 'saved' && '✓ Saved'}
                                {saveStatus === 'error' && '✕ Error saving'}
                            </span>
                        )}
                    </span>
                </div>
            </div>

            {showVersions && (
                <VersionsPanel onePager={onePager} flushPendingSaves={flushSave} onClose={() => setShowVersions(false)} />
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 min-[88.75rem]:grid-cols-3 gap-4" style={{ gridAutoFlow: 'dense' }}>
                {/* ===== RETURNS SUMMARY ===== */}
                <div className="lg:col-span-2 min-[88.75rem]:col-span-3 card-returns card">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex items-center gap-4 sm:gap-8">
                            <div className="flex-shrink-0">
                                <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Unlevered Yield on Cost</div>
                                <div className="text-3xl sm:text-4xl font-bold text-[var(--accent)]">
                                    {calc.unlevered_yield_on_cost > 0 ? formatPercent(calc.unlevered_yield_on_cost) : '—'}
                                </div>
                            </div>
                            <div className="hidden sm:block h-12 w-px bg-[var(--border)]" />
                            <div className="hidden sm:grid grid-cols-4 gap-6">
                                <MetricCell label="NOI" value={calc.noi} format="currency" />
                                <MetricCell label="NOI / Unit" value={calc.noi_per_unit} format="currency" />
                                <MetricCell label="Total Budget" value={calc.total_budget} format="currency" />
                                <MetricCell label="Cost / Unit" value={calc.cost_per_unit} format="currency" />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-3 sm:gap-6">
                            <div className="sm:hidden"><MetricCell label="NOI" value={calc.noi} format="currency" /></div>
                            <div className="sm:hidden"><MetricCell label="Total Budget" value={calc.total_budget} format="currency" /></div>
                            <div className="sm:hidden"><MetricCell label="Cost / Unit" value={calc.cost_per_unit} format="currency" /></div>
                            <MetricCell label="Rent / SF" value={calc.weighted_avg_rent_per_sf} format="currency" decimals={2} />
                            <MetricCell label="OpEx Ratio" value={calc.opex_ratio} format="percent" />
                            <MetricCell label="Cost / NRSF" value={calc.cost_per_nrsf} format="currency" />
                        </div>
                    </div>
                </div>

                {/* ===== EXECUTIVE SUMMARY (full width) ===== */}
                <div className="lg:col-span-2 min-[88.75rem]:col-span-3 card">
                    <h3 className="op-card-title mb-3">Executive Summary</h3>
                    <RichTextEditor
                        content={pursuit.exec_summary}
                        onChange={(json) => updatePursuitMutation.mutate({ id: pursuit.id, updates: { exec_summary: json } })}
                        placeholder="Enter executive summary..."
                    />
                </div>

                {/* ===== SITE & DENSITY ===== */}
                <div className="card min-w-0">
                    <h3 className="op-card-title mb-3">Site & Density</h3>
                    <div className="space-y-3">
                        <FieldRow label="Site Area (SF)" value={hasSiteArea ? formatNumber(pursuit.site_area_sf) : '—'} display noteKey="site_area_sf" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                        <FieldRow label="Site Area (Acres)" value={hasSiteArea ? formatNumber(pursuit.site_area_sf / SF_PER_ACRE, 2) : '—'} display />
                        <FieldRow label="Total Units" value={formatNumber(sortedUnitMix.reduce((sum, r) => sum + r.unit_count, 0))} display />
                        <FieldRow label="Density (Units/Acre)" value={hasSiteArea ? formatNumber(calc.density_units_per_acre, 1) : '—'} display />
                        {productType && (
                            <div className={`text-op px-2.5 py-1.5 rounded-md ${densityStatus === 'within' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                                densityStatus ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : 'text-[var(--text-muted)]'
                                }`}>
                                {densityStatus === 'within' && `✓ Within range for ${densityLabel} (${effectiveDensityLow}–${effectiveDensityHigh})`}
                                {densityStatus === 'below' && `⚠ Below range for ${densityLabel} (${effectiveDensityLow}–${effectiveDensityHigh})`}
                                {densityStatus === 'above' && `⚠ Above range for ${densityLabel} (${effectiveDensityLow}–${effectiveDensityHigh})`}
                                {!densityStatus && `Range: ${effectiveDensityLow}–${effectiveDensityHigh} units/acre`}
                            </div>
                        )}
                        {productType && pursuit.site_area_sf > 0 && calc.recommended_units_low > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-[var(--text-faint)]">
                                    Suggested: {formatNumber(calc.recommended_units_low, 0)}–{formatNumber(calc.recommended_units_high, 0)} units
                                </span>
                            </div>
                        )}
                        <FieldRow label="Efficiency Ratio" noteKey="efficiency_ratio" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}><InlineInput value={onePager.efficiency_ratio} onChange={(v) => updateField('efficiency_ratio', v)} format="percent" decimals={1} editAllMode={editAllMode} /></FieldRow>
                        <FieldRow label="Total NRSF" value={formatNumber(calc.total_nrsf)} display />
                        <FieldRow label="Total GBSF" value={formatNumber(calc.total_gbsf)} display />
                        {pursuit.site_area_sf > 0 && calc.total_gbsf > 0 && (
                            <FieldRow label="FAR (GBSF / Site SF)" value={formatNumber(calc.total_gbsf / pursuit.site_area_sf, 2)} display />
                        )}
                        <div className="border-t border-[var(--table-row-border)] pt-3 space-y-3">
                            <FieldRow label="Parking Spaces" noteKey="parking_spaces" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}>
                                <InlineInput value={onePager.parking_spaces} onChange={(v) => updateField('parking_spaces', v)} format="number" decimals={0} editAllMode={editAllMode} zeroAs="—" />
                            </FieldRow>
                            {onePager.parking_spaces > 0 && onePager.total_units > 0 && (
                                <FieldRow label="Spaces / Unit" value={formatNumber(onePager.parking_spaces / onePager.total_units, 2)} display />
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== REVENUE ===== */}
                <div className="card min-w-0">
                    <h3 className="op-card-title mb-3">Revenue</h3>
                    <div className="op-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th className="text-left"></th>
                                <th className="text-right">Annual</th>
                                <th className="text-right" title="Per unit per month">Unit/Mo</th>
                                <th className="text-right" title="Per net rentable SF per month">SF/Mo</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="text-[var(--text-secondary)] font-medium">Gross Potential Rent</td>
                                <td className="text-right text-[var(--text-primary)] font-medium">{formatCurrency(calc.gross_potential_rent)}</td>
                                <td className="text-right text-[var(--text-muted)]">{perUnitMonth(calc.gross_potential_rent)}</td>
                                <td className="text-right text-[var(--text-muted)]">{calc.weighted_avg_rent_per_sf > 0 ? formatCurrency(calc.weighted_avg_rent_per_sf, 2) : '—'}</td>
                            </tr>
                            <tr>
                                <td>
                                    <div className="flex items-center gap-1.5 group/note">
                                        <span className="text-[var(--text-secondary)]">Other Income</span>
                                        <FieldNoteButton fieldKey="other_income_per_unit_month" note={fieldNotes['other_income_per_unit_month']} onNoteChange={updateFieldNote} />
                                        <button
                                            onClick={handleToggleItemizedOtherIncome}
                                            aria-pressed={!!onePager.use_detailed_other_income}
                                            title={onePager.use_detailed_other_income ? 'Back to a single $/unit/month figure (keeps the current total)' : 'Itemize: parking, storage, pet rent…'}
                                            className={`op-chip ${onePager.use_detailed_other_income ? 'op-chip-on' : ''}`}
                                        >
                                            Itemize
                                        </button>
                                    </div>
                                </td>
                                <td className="text-right text-[var(--text-secondary)]">{formatCurrency(calc.other_income)}</td>
                                <td className="text-right">
                                    {onePager.use_detailed_other_income ? (
                                        <span className="text-[var(--text-secondary)]" title="From the itemized lines">{formatCurrency(effectiveOnePager.other_income_per_unit_month)}</span>
                                    ) : (
                                        <InlineInput value={onePager.other_income_per_unit_month} onChange={(v) => updateField('other_income_per_unit_month', v)} format="currency" className="w-20 ml-auto" editAllMode={editAllMode} />
                                    )}
                                </td>
                                <td className="text-right text-[var(--text-muted)]">{perSfMonth(calc.other_income)}</td>
                            </tr>
                            {onePager.use_detailed_other_income && (
                                <tr className="op-nohover">
                                    <td colSpan={4} className="pb-2">
                                        <OtherIncomeLines onePagerId={onePager.id} rows={sortedOtherIncome} totalUnits={mixUnits} editAllMode={editAllMode} />
                                    </td>
                                </tr>
                            )}
                            {/* Premiums — single summary line */}
                            {totalPremiumIncome > 0 && (
                                <tr>
                                    <td className="text-[var(--accent)]">Premiums ({unitPremiums.length})</td>
                                    <td className="text-right text-[var(--text-secondary)]">{formatCurrency(totalPremiumIncome)}</td>
                                    <td className="text-right text-[var(--text-muted)]">{perUnitMonth(totalPremiumIncome)}</td>
                                    <td className="text-right text-[var(--text-muted)]">{perSfMonth(totalPremiumIncome)}</td>
                                </tr>
                            )}
                            <tr className="op-subtotal">
                                <td className="text-[var(--text-primary)] font-medium">Gross Potential Revenue</td>
                                <td className="text-right text-[var(--text-primary)] font-medium">{formatCurrency(calc.gross_potential_revenue)}</td>
                                <td className="text-right text-[var(--text-muted)]">{perUnitMonth(calc.gross_potential_revenue)}</td>
                                <td className="text-right text-[var(--text-muted)]">{perSfMonth(calc.gross_potential_revenue)}</td>
                            </tr>
                            <tr>
                                <td>
                                    <div className="flex items-center gap-1.5 group/note">
                                        <span className="text-[var(--danger)]">Vacancy & Loss</span>
                                        <FieldNoteButton fieldKey="vacancy_rate" note={fieldNotes['vacancy_rate']} onNoteChange={updateFieldNote} />
                                        <InlineInput value={onePager.vacancy_rate} onChange={(v) => updateField('vacancy_rate', v)} format="percent" decimals={1} align="left" className="w-14" editAllMode={editAllMode} />
                                    </div>
                                </td>
                                <td className="text-right text-[var(--danger)]">{calc.vacancy_loss > 0 ? `(${formatCurrency(calc.vacancy_loss)})` : '—'}</td>
                                <td className="text-right text-[var(--danger)]">{calc.vacancy_loss > 0 ? `(${perUnitMonth(calc.vacancy_loss)})` : '—'}</td>
                                <td className="text-right text-[var(--danger)]">{calc.vacancy_loss > 0 ? `(${perSfMonth(calc.vacancy_loss)})` : '—'}</td>
                            </tr>
                            <tr className="total-row">
                                <td>Net Revenue</td>
                                <td className="text-right">{formatCurrency(calc.net_revenue)}</td>
                                <td className="text-right">{perUnitMonth(calc.net_revenue)}</td>
                                <td className="text-right">{perSfMonth(calc.net_revenue)}</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                </div>

                {/* ===== UNIT MIX + PRO FORMA (spans 2 columns) ===== */}
                <div className="lg:col-span-2 lg:self-start space-y-4">
                    <div className="card">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-1.5 group/note">
                                <h3 className="op-card-title">Unit Mix</h3>
                                <FieldNoteButton fieldKey="card_unit_mix" note={fieldNotes['card_unit_mix']} onNoteChange={updateFieldNote} />
                            </div>
                            <div className="relative" ref={addMenuRef}>
                                <button
                                    onClick={() => setShowAddMenu(!showAddMenu)}
                                    className="flex items-center gap-1 text-op text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add Row <ChevronDown className="w-3 h-3 opacity-50" />
                                </button>
                                {showAddMenu && (
                                    <div className="absolute right-0 top-full mt-1 z-40 w-44 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden animate-fade-in">
                                        <button
                                            onClick={() => {
                                                setShowAddMenu(false);
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
                                            className="w-full px-3 py-2 text-left text-op text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Blank Row
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowAddMenu(false);
                                                setShowPrototypePicker(true);
                                            }}
                                            className="w-full px-3 py-2 text-left text-op text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 border-t border-[var(--border)]"
                                        >
                                            <Library className="w-3.5 h-3.5" /> From Prototype Library
                                        </button>
                                    </div>
                                )}
                                {showPrototypePicker && (
                                    <PrototypePicker
                                        onSelect={(proto: UnitPrototype) => {
                                            const newId = crypto.randomUUID();
                                            const bedroomType = proto.bedroom_category === 'Studio' ? 'studio'
                                                : proto.bedroom_category === '1 Bed' ? 'one_bed'
                                                : proto.bedroom_category === '2 Bed' ? 'two_bed'
                                                : 'three_bed';
                                            upsertUnitMixRow.mutate({
                                                id: newId,
                                                one_pager_id: onePager.id,
                                                unit_type: bedroomType,
                                                unit_type_label: proto.display_name,
                                                unit_count: 0,
                                                avg_unit_sf: proto.avg_unit_sf,
                                                rent_per_sf: 0,
                                                rent_whole_dollar: 0,
                                                rent_input_mode: 'per_sf',
                                                sort_order: sortedUnitMix.length,
                                            } as any);
                                            setShowPrototypePicker(false);
                                        }}
                                        onClose={() => setShowPrototypePicker(false)}
                                    />
                                )}
                            </div>
                        </div>
                        <div className="op-scroll">
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
                                                        <FloorPlanButton unitTypeLabel={row.unit_type_label} />
                                                        <UnitTypeInput
                                                            value={row.unit_type_label}
                                                            onChange={(v) => handleUnitMixChange(row.id, 'unit_type_label', v, row.unit_type_label)}
                                                        />
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); if (row.unit_count > 0 && !window.confirm(`Delete "${row.unit_type_label || 'this row'}" (${row.unit_count} units)? This can't be undone.`)) return; deleteUnitMixRowMutation.mutate({ id: row.id, onePagerId: onePager.id }); }}
                                                            className="text-[var(--border-strong)] hover:text-[var(--danger)] transition-colors opacity-0 group-hover/row:opacity-100 flex-shrink-0 p-0.5"
                                                            title="Delete row"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td><InlineInput value={row.unit_count} onChange={(v) => handleUnitMixChange(row.id, 'unit_count', Math.round(v), row.unit_count)} format="integer" className="text-op" editAllMode={editAllMode} /></td>
                                                <td><InlineInput value={row.avg_unit_sf} onChange={(v) => handleUnitMixChange(row.id, 'avg_unit_sf', v, row.avg_unit_sf)} format="number" decimals={0} className="text-op" editAllMode={editAllMode} /></td>
                                                <td className="text-right text-op text-[var(--text-muted)] tabular-nums">{rc.total_sf > 0 ? formatNumber(rc.total_sf) : '—'}</td>
                                                <td className="text-right text-op text-[var(--text-muted)] tabular-nums">{rc.total_sf > 0 && calc.total_nrsf > 0 ? formatPercent(rc.total_sf / calc.total_nrsf, 1) : '—'}</td>
                                                <td>
                                                    {isPsf
                                                        ? <InlineInput value={row.rent_per_sf} onChange={(v) => handleUnitMixChange(row.id, 'rent_per_sf', v, row.rent_per_sf)} format="currency" decimals={2} className="text-op" editAllMode={editAllMode} />
                                                        : <button onClick={() => handleUnitMixChange(row.id, 'rent_input_mode', 'per_sf', row.rent_input_mode)} className="text-right text-op text-[var(--text-muted)] tabular-nums block w-full text-right hover:text-[var(--accent)]" title="Click to switch to $/SF input">{rc.effective_rent_per_sf > 0 ? formatCurrency(rc.effective_rent_per_sf, 2) : '—'}</button>
                                                    }
                                                </td>
                                                <td>
                                                    {isPsf
                                                        ? <button onClick={() => handleUnitMixChange(row.id, 'rent_input_mode', 'whole_dollar', row.rent_input_mode)} className="text-right text-op text-[var(--text-muted)] tabular-nums block w-full text-right hover:text-[var(--accent)]" title="Click to switch to whole dollar input">{rc.effective_monthly_rent > 0 ? formatCurrency(rc.effective_monthly_rent) : '—'}</button>
                                                        : <InlineInput value={row.rent_whole_dollar} onChange={(v) => handleUnitMixChange(row.id, 'rent_whole_dollar', v, row.rent_whole_dollar)} format="currency" decimals={0} className="text-op" editAllMode={editAllMode} />
                                                    }
                                                </td>
                                                <td className="text-right text-op text-[var(--text-muted)] tabular-nums">{rc.annual_rental_revenue > 0 ? formatCurrency(rc.annual_rental_revenue) : '—'}</td>
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
                                        <td className="text-right tabular-nums">{onePager.total_units > 0 && calc.gross_potential_rent > 0 ? formatCurrency(calc.gross_potential_rent / onePager.total_units / 12) : '—'}</td>
                                        <td className="text-right tabular-nums">{calc.gross_potential_rent > 0 ? formatCurrency(calc.gross_potential_rent) : '—'}</td>
                                    </tr>
                                    {totalPremiumIncome > 0 && (
                                        <tr className="border-t border-[var(--table-row-border)]">
                                            <td className="text-op text-[var(--accent)] font-medium">Premiums</td>
                                            <td></td><td></td><td></td><td></td>
                                            <td className="text-right text-op tabular-nums text-[var(--accent)]">{calc.total_nrsf > 0 ? formatCurrency(totalPremiumIncome / calc.total_nrsf / 12, 2) : '—'}</td>
                                            <td className="text-right text-op tabular-nums text-[var(--accent)]">{onePager.total_units > 0 ? formatCurrency(totalPremiumIncome / onePager.total_units / 12) : '—'}</td>
                                            <td className="text-right text-op tabular-nums text-[var(--accent)]">{formatCurrency(totalPremiumIncome)}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ===== PRO FORMA ===== */}
                    <div className="card">
                        <h3 className="op-card-title mb-3">Pro Forma</h3>
                        <div className="op-scroll">
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
                                    <td className="text-[var(--text-secondary)] text-op font-medium">Net Revenue</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-primary)] font-medium">{formatCurrency(calc.net_revenue)}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{onePager.total_units > 0 ? formatCurrency(calc.net_revenue / onePager.total_units) : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.total_nrsf > 0 ? formatCurrency(calc.net_revenue / calc.total_nrsf, 2) : '—'}</td>
                                </tr>
                                <tr>
                                    <td className="text-[var(--danger)] text-op font-medium">Total Operating Expenses</td>
                                    <td className="text-right text-op tabular-nums text-[var(--danger)]">{calc.total_opex > 0 ? `(${formatCurrency(calc.total_opex)})` : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--danger)]">{calc.opex_per_unit > 0 ? `(${formatCurrency(calc.opex_per_unit)})` : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--danger)]">{calc.total_nrsf > 0 && calc.total_opex > 0 ? `(${formatCurrency(calc.total_opex / calc.total_nrsf, 2)})` : '—'}</td>
                                </tr>
                                <tr className="total-row">
                                    <td className="font-bold">Net Operating Income</td>
                                    <td className="text-right tabular-nums font-bold text-[var(--success)]">{formatCurrency(calc.noi)}</td>
                                    <td className="text-right tabular-nums font-bold">{formatCurrency(calc.noi_per_unit)}</td>
                                    <td className="text-right tabular-nums font-bold">{formatCurrency(calc.noi_per_sf, 2)}</td>
                                </tr>
                            </tbody>
                        </table>
                        </div>
                        <div className="mt-3 pt-3 border-t border-[var(--table-row-border)] flex items-center justify-between">
                            <span className="text-op font-bold text-[var(--text-muted)]">Yield on Cost</span>
                            <span className={`text-lg font-bold tabular-nums ${calc.unlevered_yield_on_cost > 0.06 ? 'text-[var(--success)]' : calc.unlevered_yield_on_cost > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                                {calc.unlevered_yield_on_cost > 0 ? formatPercent(calc.unlevered_yield_on_cost) : '—'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ===== DEVELOPMENT BUDGET ===== */}
                <div className="space-y-4">
                    <div className="card min-w-0 h-full">
                        <h3 className="op-card-title mb-3">Development Budget</h3>
                        <div className="op-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th className="text-left">Uses</th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">$/Unit</th>
                                    <th className="text-right">$/NRSF</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="text-[var(--text-secondary)] font-medium"><span className="flex items-center gap-1.5 group/note">Land Cost<FieldNoteButton fieldKey="land_cost" note={fieldNotes['land_cost']} onNoteChange={updateFieldNote} /></span></td>
                                    <td><InlineInput value={onePager.land_cost} onChange={(v) => updateField('land_cost', v)} format="currency" decimals={0} className="text-op" editAllMode={editAllMode} /></td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.land_cost_per_unit > 0 ? formatCurrency(calc.land_cost_per_unit) : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.total_nrsf > 0 ? formatCurrency(onePager.land_cost / calc.total_nrsf, 2) : '—'}</td>
                                </tr>
                                <tr>
                                    <td className="text-[var(--text-secondary)] font-medium"><span className="flex items-center gap-1.5 group/note">Hard Cost<FieldNoteButton fieldKey="hard_cost_per_nrsf" note={fieldNotes['hard_cost_per_nrsf']} onNoteChange={updateFieldNote} /></span></td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-primary)]">{calc.hard_cost > 0 ? formatCurrency(calc.hard_cost) : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.cost_per_unit > 0 ? formatCurrency(calc.hard_cost / Math.max(onePager.total_units, 1)) : '—'}</td>
                                    <td><InlineInput value={onePager.hard_cost_per_nrsf} onChange={(v) => updateField('hard_cost_per_nrsf', v)} format="currency" decimals={2} className="text-op" editAllMode={editAllMode} /></td>
                                </tr>
                                <tr>
                                    <td className="text-[var(--text-secondary)] text-op font-medium">
                                        <div className="flex items-center gap-1.5 group/note">
                                            Soft Cost
                                            <FieldNoteButton fieldKey="card_soft_costs" note={fieldNotes['card_soft_costs']} onNoteChange={updateFieldNote} />
                                            <button
                                                onClick={() => {
                                                    updateField('use_detailed_soft_costs', !onePager.use_detailed_soft_costs);
                                                    if (!onePager.use_detailed_soft_costs) setSoftCostExpanded(true);
                                                }}
                                                className={`op-chip ${onePager.use_detailed_soft_costs ? 'op-chip-on' : ''}`}
                                                title={onePager.use_detailed_soft_costs ? 'Back to a % of hard cost' : 'Itemize soft costs'}
                                            >
                                                {onePager.use_detailed_soft_costs ? 'Detail' : `${formatPercent(onePager.soft_cost_pct, 0)} HC`}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-primary)]">{calc.soft_cost > 0 ? formatCurrency(calc.soft_cost) : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{onePager.total_units > 0 ? formatCurrency(calc.soft_cost / onePager.total_units) : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.total_nrsf > 0 ? formatCurrency(calc.soft_cost / calc.total_nrsf, 2) : '—'}</td>
                                </tr>
                                <tr>
                                    <td className="text-[var(--text-secondary)] text-op font-medium">
                                        <div className="flex items-center gap-1.5 group/note">
                                            Carry
                                            <FieldNoteButton fieldKey="carry_cost_pct" note={fieldNotes['carry_cost_pct']} onNoteChange={updateFieldNote} />
                                            <span className="inline-flex items-center gap-1 op-hint" title="Construction-period interest, taxes and insurance, as a share of hard + soft + land">
                                                <InlineInput value={onePager.carry_cost_pct ?? 0} onChange={(v) => updateField('carry_cost_pct', v)} format="percent" decimals={1} align="left" className="w-14" editAllMode={editAllMode} />
                                                of cost
                                            </span>
                                        </div>
                                    </td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-primary)]">{calc.carry_cost > 0 ? formatCurrency(calc.carry_cost) : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.carry_cost > 0 && onePager.total_units > 0 ? formatCurrency(calc.carry_cost / onePager.total_units) : '—'}</td>
                                    <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.carry_cost > 0 && calc.total_nrsf > 0 ? formatCurrency(calc.carry_cost / calc.total_nrsf, 2) : '—'}</td>
                                </tr>
                                <tr className="total-row">
                                    <td>Total Budget</td>
                                    <td className="text-right tabular-nums">{formatCurrency(calc.total_budget)}</td>
                                    <td className="text-right tabular-nums">{formatCurrency(calc.cost_per_unit)}</td>
                                    <td className="text-right tabular-nums">{formatCurrency(calc.cost_per_nrsf, 2)}</td>
                                </tr>
                            </tbody>
                        </table>
                        </div>

                        {/* Soft cost controls below table */}
                        {!onePager.use_detailed_soft_costs && (
                            <div className="mt-3">
                                <FieldRow label="Soft Cost (% of HC)" noteKey="soft_cost_pct" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}><InlineInput value={onePager.soft_cost_pct} onChange={(v) => updateField('soft_cost_pct', v)} format="percent" decimals={1} editAllMode={editAllMode} /></FieldRow>
                            </div>
                        )}
                        {onePager.use_detailed_soft_costs && (
                            <div className="mt-3 animate-fade-in">
                                <button
                                    onClick={() => setSoftCostExpanded(!softCostExpanded)}
                                    className="flex items-center gap-1 text-[var(--accent)] hover:text-[var(--accent-hover)] text-op font-medium mb-2"
                                >
                                    {softCostExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    {softCostDetails.length} line items — {formatCurrency(calc.soft_cost)}
                                </button>
                                {softCostExpanded && (
                                    <div className="space-y-1">
                                        {softCostDetails.map((row) => (
                                            <div key={row.id} className="flex items-center gap-2">
                                                <DebouncedTextInput
                                                    value={row.line_item_name}
                                                    onCommit={(v) => upsertSoftCostRow.mutate({ id: row.id, one_pager_id: onePager.id, line_item_name: v })}
                                                    placeholder="Line item"
                                                    className="inline-input text-op flex-1 text-left"
                                                />
                                                <InlineInput
                                                    value={row.amount}
                                                    onChange={(v) => upsertSoftCostRow.mutate({ id: row.id, one_pager_id: onePager.id, amount: v })}
                                                    format="currency"
                                                    decimals={0}
                                                    className="text-op w-24"
                                                />
                                                <button
                                                    onClick={() => deleteSoftCostRowMutation.mutate({ id: row.id, onePagerId: onePager.id })}
                                                    className="text-[var(--border-strong)] hover:text-[var(--danger)] transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => upsertSoftCostRow.mutate({ one_pager_id: onePager.id, line_item_name: '', amount: 0, sort_order: softCostDetails.length })}
                                            className="text-op text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
                                        >
                                            + Add Line Item
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Additional metrics below */}
                        <div className="mt-3 pt-3 border-t border-[var(--table-row-border)] space-y-3">
                            <FieldRow label="Hard Cost ($/GBSF)" value={formatCurrency(calc.hard_cost_per_gbsf, 2)} display />
                            <FieldRow label="Land $/SF of Site" value={pursuit.site_area_sf > 0 ? formatCurrency(onePager.land_cost / pursuit.site_area_sf, 2) : '—'} display />
                        </div>
                    </div>

                </div>

                {/* ===== OPERATING EXPENSES ===== */}
                <div className="card">
                    <h3 className="op-card-title mb-3">Operating Expenses</h3>
                    <div className="op-scroll">
                    <table className="data-table">
                        <thead><tr><th className="text-left">Category</th><th className="text-right">$/Unit/Yr</th><th className="text-right">Annual Total</th></tr></thead>
                        <tbody>
                            <OpExRow label="Utilities" value={onePager.opex_utilities} units={onePager.total_units} onChange={(v) => updateField('opex_utilities', v)} editAllMode={editAllMode} noteKey="opex_utilities" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <OpExRow label="Repairs & Maint." value={onePager.opex_repairs_maintenance} units={onePager.total_units} onChange={(v) => updateField('opex_repairs_maintenance', v)} editAllMode={editAllMode} noteKey="opex_repairs_maintenance" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <OpExRow label="Contract Svcs" value={onePager.opex_contract_services} units={onePager.total_units} onChange={(v) => updateField('opex_contract_services', v)} editAllMode={editAllMode} noteKey="opex_contract_services" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <OpExRow label="Marketing" value={onePager.opex_marketing} units={onePager.total_units} onChange={(v) => updateField('opex_marketing', v)} editAllMode={editAllMode} noteKey="opex_marketing" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <OpExRow label="G&A" value={onePager.opex_general_admin} units={onePager.total_units} onChange={(v) => updateField('opex_general_admin', v)} editAllMode={editAllMode} noteKey="opex_general_admin" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <OpExRow label="Turnover" value={onePager.opex_turnover} units={onePager.total_units} onChange={(v) => updateField('opex_turnover', v)} editAllMode={editAllMode} noteKey="opex_turnover" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <OpExRow label="Miscellaneous" value={onePager.opex_misc} units={onePager.total_units} onChange={(v) => updateField('opex_misc', v)} editAllMode={editAllMode} noteKey="opex_misc" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <tr>
                                <td><span className="text-[var(--accent)] text-op font-medium">Payroll & Related</span></td>
                                <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{onePager.total_units > 0 ? formatCurrency(calc.payroll_total / onePager.total_units) : '—'}</td>
                                <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(calc.payroll_total)}</td>
                            </tr>
                            {(() => {
                                const controllablePerUnit = onePager.opex_utilities + onePager.opex_repairs_maintenance + onePager.opex_contract_services + onePager.opex_marketing + onePager.opex_general_admin + onePager.opex_turnover + onePager.opex_misc;
                                const controllableTotal = (controllablePerUnit * onePager.total_units) + calc.payroll_total;
                                const controllablePerUnitWithPayroll = onePager.total_units > 0 ? controllableTotal / onePager.total_units : controllablePerUnit;
                                return (
                                    <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                                        <td className="text-[var(--text-primary)] text-op font-bold py-1.5">Controllable Expenses</td>
                                        <td className="text-right text-op tabular-nums font-bold text-[var(--text-primary)] py-1.5">{formatCurrency(controllablePerUnitWithPayroll)}</td>
                                        <td className="text-right text-op tabular-nums font-bold text-[var(--text-primary)] py-1.5">{controllableTotal > 0 ? formatCurrency(controllableTotal) : '—'}</td>
                                    </tr>
                                );
                            })()}
                            <OpExRow label="Insurance" value={onePager.opex_insurance} units={onePager.total_units} onChange={(v) => updateField('opex_insurance', v)} editAllMode={editAllMode} noteKey="opex_insurance" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <tr>
                                <td className="text-[var(--text-secondary)] text-op">Mgmt Fee</td>
                                <td><InlineInput value={onePager.mgmt_fee_pct} onChange={(v) => updateField('mgmt_fee_pct', v)} format="percent" decimals={2} className="text-op" editAllMode={editAllMode} /></td>
                                <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(calc.mgmt_fee_total)}</td>
                            </tr>
                            <tr>
                                <td><span className="text-[var(--accent)] text-op font-medium">Property Tax</span></td>
                                <td className="text-right text-op tabular-nums text-[var(--text-muted)]">{calc.property_tax_per_unit > 0 ? formatCurrency(calc.property_tax_per_unit) : '—'}</td>
                                <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(calc.property_tax_total)}</td>
                            </tr>
                            <OpExRow label="Capex Reserves" value={onePager.opex_capex_reserves} units={onePager.total_units} onChange={(v) => updateField('opex_capex_reserves', v)} editAllMode={editAllMode} noteKey="opex_capex_reserves" fieldNotes={fieldNotes} onNoteChange={updateFieldNote} />
                            <tr className="total-row">
                                <td>Total Operating Expenses</td>
                                <td className="text-right tabular-nums">{formatCurrency(calc.opex_per_unit)}</td>
                                <td className="text-right tabular-nums">{formatCurrency(calc.total_opex)}</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--table-row-border)]">
                        <FieldRow label="OpEx Ratio (of net revenue)" value={calc.opex_ratio > 0 ? formatPercent(calc.opex_ratio, 1) : '—'} display />
                    </div>
                </div>


                {/* ===== PAYROLL DETAIL (always visible) ===== */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5 group/note">
                                <h3 className="op-card-title">Payroll Detail</h3>
                                <FieldNoteButton fieldKey="card_payroll" note={fieldNotes['card_payroll']} onNoteChange={updateFieldNote} />
                                <datalist id="payroll-role-options">
                                    {STANDARD_PAYROLL_ROLES.map((role) => <option key={role} value={role} />)}
                                </datalist>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={(e) => { e.preventDefault(); handleAddPayroll('employee'); }} className="px-3 py-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors text-op font-semibold">+ Employee</button>
                                <button type="button" onClick={(e) => { e.preventDefault(); handleAddPayroll('contract'); }} className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors text-op font-semibold">+ Contract</button>
                            </div>
                        </div>
                        <div className="op-scroll">
                        <table className="data-table table-fixed min-w-[26rem]">
                            <colgroup><col /><col className="w-12" /><col className="w-[5.5rem]" /><col className="w-14" /><col className="w-[5.5rem]" /><col className="w-6" /></colgroup>
                            <thead><tr><th className="text-left">Role</th><th className="text-right" title="Headcount">HC</th><th className="text-right">Base</th><th className="text-right">Bonus</th><th className="text-right">Total</th><th><span className="sr-only">Delete</span></th></tr></thead>
                            <tbody>
                                {sortedPayroll.map((row) => {
                                    const total = calcPayrollRowTotal(row, onePager.payroll_burden_pct);
                                    return (
                                        <tr key={row.id}>
                                            <td><DebouncedTextInput value={row.role_name} onCommit={(v) => handleUpdatePayroll(row.id, 'role_name', normalizePayrollRole(v), row.role_name)} list="payroll-role-options" placeholder={row.line_type === 'employee' ? 'Role name' : 'Contract desc'} className="inline-input text-op w-full text-ellipsis" style={{ textAlign: 'left' }} title={row.role_name || undefined} /></td>
                                            {row.line_type === 'employee' ? (
                                                <>
                                                    <td><InlineInput value={row.headcount} onChange={(v) => handleUpdatePayroll(row.id, 'headcount', v, row.headcount)} format="number" decimals={1} className="text-op" /></td>
                                                    <td><InlineInput value={row.base_compensation} onChange={(v) => handleUpdatePayroll(row.id, 'base_compensation', v, row.base_compensation)} format="currency" decimals={0} className="text-op" /></td>
                                                    <td><InlineInput value={row.bonus_pct} onChange={(v) => handleUpdatePayroll(row.id, 'bonus_pct', v, row.bonus_pct)} format="percent" decimals={0} className="text-op" /></td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="text-center text-[var(--border-strong)] text-op">—</td>
                                                    <td className="text-center text-[var(--border-strong)] text-op">—</td>
                                                    <td><InlineInput value={row.fixed_amount} onChange={(v) => handleUpdatePayroll(row.id, 'fixed_amount', v, row.fixed_amount)} format="currency" decimals={0} className="text-op" /></td>
                                                </>
                                            )}
                                            <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(total)}</td>
                                            <td><button onClick={() => { if (row.role_name && !window.confirm(`Delete payroll line "${row.role_name}"? This can't be undone.`)) return; deletePayrollRowMutation.mutate({ id: row.id, onePagerId: onePager.id }); }} title="Delete row" className="text-[var(--border-strong)] hover:text-[var(--danger)] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                        <div className="mt-3 pt-3 border-t border-[var(--table-row-border)]">
                            <FieldRow label="Payroll Burden (taxes & benefits)" noteKey="payroll_burden_pct" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}>
                                <InlineInput value={onePager.payroll_burden_pct} onChange={(v) => updateField('payroll_burden_pct', v)} format="percent" decimals={0} editAllMode={editAllMode} />
                            </FieldRow>
                        </div>
                    </div>

                {/* ===== PROPERTY TAX DETAIL (always visible) ===== */}
                    <div className="card">
                        <h3 className="op-card-title mb-3">Property Tax Detail</h3>
                        <div className="space-y-3">
                            <FieldRow label="Tax Rate" noteKey="tax_mil_rate" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}><InlineInput value={onePager.tax_mil_rate} onChange={(v) => updateField('tax_mil_rate', v)} format="percent" decimals={4} /></FieldRow>
                            {taxJurisdiction && (() => {
                                const j = taxJurisdiction;
                                const matches = Math.abs(onePager.tax_mil_rate - j.tax_rate) < 0.0000005
                                    && onePager.tax_assessed_pct_hard === j.assessed_pct_hard
                                    && onePager.tax_assessed_pct_land === j.assessed_pct_land
                                    && onePager.tax_assessed_pct_soft === j.assessed_pct_soft;
                                return (
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] -mt-1">
                                        <span title={j.notes ?? undefined}>
                                            On file for {taxJurisdictionLabel(j)}: {formatPercent(j.tax_rate, 3)} · {formatPercent(j.assessed_pct_hard, 0)}/{formatPercent(j.assessed_pct_land, 0)}/{formatPercent(j.assessed_pct_soft, 0)} assessed{!j.is_verified && ' (unverified)'}
                                        </span>
                                        {!matches && (
                                            <button
                                                onClick={() => {
                                                    updateField('tax_mil_rate', j.tax_rate);
                                                    updateField('tax_assessed_pct_hard', j.assessed_pct_hard);
                                                    updateField('tax_assessed_pct_land', j.assessed_pct_land);
                                                    updateField('tax_assessed_pct_soft', j.assessed_pct_soft);
                                                }}
                                                className="text-[var(--accent)] font-medium hover:underline flex-shrink-0"
                                            >
                                                Apply
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}
                            <FieldRow label="Assessed % — Hard" noteKey="tax_assessed_pct_hard" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}><InlineInput value={onePager.tax_assessed_pct_hard} onChange={(v) => updateField('tax_assessed_pct_hard', v)} format="percent" decimals={0} /></FieldRow>
                            <FieldRow label="Assessed % — Land" noteKey="tax_assessed_pct_land" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}><InlineInput value={onePager.tax_assessed_pct_land} onChange={(v) => updateField('tax_assessed_pct_land', v)} format="percent" decimals={0} /></FieldRow>
                            <FieldRow label="Assessed % — Soft" noteKey="tax_assessed_pct_soft" fieldNotes={fieldNotes} onNoteChange={updateFieldNote}><InlineInput value={onePager.tax_assessed_pct_soft} onChange={(v) => updateField('tax_assessed_pct_soft', v)} format="percent" decimals={0} /></FieldRow>
                            <div className="pt-3 border-t border-[var(--table-row-border)] space-y-3">
                                <FieldRow label="Assessed Value" value={formatCurrency(calc.assessed_value)} display />
                                <FieldRow label="Annual Property Tax" value={formatCurrency(calc.property_tax_total)} display className="font-bold" />
                                <FieldRow label="Tax / Unit" value={formatCurrency(calc.property_tax_per_unit)} display />
                            </div>
                        </div>
                    </div>

                {/* ===== PREMIUMS CARD (always visible) — full row at two columns, so it doesn't sit beside a gap ===== */}
                <div className="card lg:col-span-2 min-[88.75rem]:col-span-1">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <h3 className="op-card-title">Premiums</h3>
                            {unitPremiums.length > 0 && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold"
                                >{unitPremiums.length}</span>
                            )}
                        </div>
                        <span className="text-op tabular-nums text-[var(--text-secondary)] font-medium">{formatCurrency(totalPremiumIncome)}/yr</span>
                    </div>
                        <div className="op-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th className="text-left">Name</th>
                                        <th className="text-right">Units</th>
                                        <th className="text-right">$/Unit/Mo</th>
                                        <th className="text-right">Annual</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unitPremiums.map((premium) => {
                                        const premiumAnnual = premium.unit_count * premium.rent_premium_per_unit_month * 12;
                                        return (
                                            <tr key={premium.id}>
                                                <td>
                                                    <div className="flex items-center gap-1 group/prem">
                                                        <DebouncedTextInput
                                                            value={premium.name}
                                                            onCommit={(v: string) => upsertUnitPremium.mutate({ ...premium, name: v })}
                                                            className="inline-input text-op w-full min-w-[8rem] text-[var(--text-secondary)]"
                                                            style={{ textAlign: 'left' }}
                                                        />
                                                        <button
                                                            onClick={() => deleteUnitPremiumMutation.mutate({ id: premium.id, onePagerId: onePager.id })}
                                                            className="text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors opacity-0 group-hover/prem:opacity-100"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td><InlineInput value={premium.unit_count} onChange={(v) => upsertUnitPremium.mutate({ ...premium, unit_count: v as number })} format="number" decimals={0} className="text-op w-12" editAllMode={editAllMode} /></td>
                                                <td><InlineInput value={premium.rent_premium_per_unit_month} onChange={(v) => upsertUnitPremium.mutate({ ...premium, rent_premium_per_unit_month: v as number })} format="currency" className="text-op w-16" editAllMode={editAllMode} /></td>
                                                <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(premiumAnnual)}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr>
                                        <td colSpan={4}>
                                            <button
                                                onClick={() => { upsertUnitPremium.mutate({
                                                    one_pager_id: onePager.id,
                                                    name: 'New Premium',
                                                    unit_count: 0,
                                                    rent_premium_per_unit_month: 0,
                                                    sort_order: unitPremiums.length,
                                                }); }}
                                                className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 transition-colors"
                                            >
                                                <Plus className="w-3 h-3" /> Add Premium
                                            </button>
                                        </td>
                                    </tr>
                                    {unitPremiums.length > 0 && (
                                        <tr className="total-row">
                                            <td>Total Premiums</td>
                                            <td className="text-right tabular-nums">{unitPremiums.reduce((s, p) => s + p.unit_count, 0)}</td>
                                            <td></td>
                                            <td className="text-right tabular-nums font-bold">{formatCurrency(totalPremiumIncome)}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                </div>

                {/* ===== TARGET YIELD (full width, collapsible) ===== */}
                <TargetYieldCard
                    pursuitId={pursuit.id}
                    onePager={effectiveOnePager}
                    unitMix={sortedUnitMix}
                    payroll={sortedPayroll}
                    softCostDetails={softCostDetails}
                    unitPremiums={unitPremiums}
                    currentYoc={calc.unlevered_yield_on_cost}
                />

                {/* ===== SENSITIVITY ANALYSIS (full width, collapsible) ===== */}
                <CollapsibleSection
                    title="Sensitivity Analysis"
                    summary="Yield on cost as rent, hard cost and land move"
                    expanded={sensitivityExpanded}
                    onToggle={() => setSensitivityExpanded(!sensitivityExpanded)}
                >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Rent Sensitivity */}
                            <div className="card">
                                <h4 className="op-card-title mb-3">Rent PSF Sensitivity</h4>
                                <div className="op-scroll">
                                <table className="data-table">
                                    <thead><tr><th>Rent/SF</th><th className="text-right">GPR</th><th className="text-right">NOI</th><th className="text-right">YOC</th></tr></thead>
                                    <tbody>
                                        {rentSensitivity.map((row, i) => {
                                            const isBase = row.step === 0;
                                            return (
                                                <tr key={i} className={isBase ? 'bg-[var(--accent-subtle)]' : ''}>
                                                    <td className={`tabular-nums ${isBase ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>{formatCurrency(row.adjustedValue, 2)}</td>
                                                    <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(row.gpr)}</td>
                                                    <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(row.noi)}</td>
                                                    <td className={`text-right text-op tabular-nums font-semibold ${yocColor(row.yoc, calc.unlevered_yield_on_cost)}`}>{row.yoc > 0 ? formatPercent(row.yoc) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                </div>
                            </div>

                            {/* Hard Cost Sensitivity */}
                            <div className="card">
                                <h4 className="op-card-title mb-3">Hard Cost Sensitivity</h4>
                                <div className="op-scroll">
                                <table className="data-table">
                                    <thead><tr><th>HC/NRSF</th><th className="text-right">Budget</th><th className="text-right">NOI</th><th className="text-right">YOC</th></tr></thead>
                                    <tbody>
                                        {hardCostSensitivity.map((row, i) => {
                                            const isBase = row.step === 0;
                                            return (
                                                <tr key={i} className={isBase ? 'bg-[var(--accent-subtle)]' : ''}>
                                                    <td className={`tabular-nums ${isBase ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>{formatCurrency(row.adjustedValue, 0)}</td>
                                                    <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(row.totalBudget)}</td>
                                                    <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(row.noi)}</td>
                                                    <td className={`text-right text-op tabular-nums font-semibold ${yocColor(row.yoc, calc.unlevered_yield_on_cost)}`}>{row.yoc > 0 ? formatPercent(row.yoc) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                </div>
                            </div>

                            {/* Land Cost Sensitivity */}
                            <div className="card">
                                <h4 className="op-card-title mb-3">Land Cost Sensitivity</h4>
                                <div className="op-scroll">
                                <table className="data-table">
                                    <thead><tr><th>Land Cost</th><th className="text-right">Budget</th><th className="text-right">NOI</th><th className="text-right">YOC</th></tr></thead>
                                    <tbody>
                                        {landCostSensitivity.map((row, i) => {
                                            const isBase = row.step === 0;
                                            return (
                                                <tr key={i} className={isBase ? 'bg-[var(--accent-subtle)]' : ''}>
                                                    <td className={`tabular-nums ${isBase ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>{formatCurrency(row.adjustedValue, 0)}</td>
                                                    <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(row.totalBudget)}</td>
                                                    <td className="text-right text-op tabular-nums text-[var(--text-secondary)]">{formatCurrency(row.noi)}</td>
                                                    <td className={`text-right text-op tabular-nums font-semibold ${yocColor(row.yoc, calc.unlevered_yield_on_cost)}`}>{row.yoc > 0 ? formatPercent(row.yoc) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                </div>
                            </div>

                            {/* 2D Rent × Hard Cost Matrix */}
                            {sensitivityMatrix && (
                                <div className="lg:col-span-2 card">
                                    <h4 className="op-card-title mb-3">Rent PSF vs. Hard Cost — YOC Matrix</h4>
                                    <div className="op-scroll">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th className="text-left">Rent \ HC</th>
                                                    {sensitivityMatrix.hardCostSteps.map((step, j) => (
                                                        <th key={j} className="text-right">{step === 0 ? 'Base' : `${step > 0 ? '+' : ''}$${step}`}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sensitivityMatrix.values.map((row, i) => (
                                                    <tr key={i}>
                                                        <td className={`text-op tabular-nums ${i === sensitivityMatrix.baseRentIdx ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                                                            {sensitivityMatrix.rentSteps[i] === 0 ? 'Base' : `${sensitivityMatrix.rentSteps[i] > 0 ? '+' : ''}$${sensitivityMatrix.rentSteps[i].toFixed(2)}`}
                                                        </td>
                                                        {row.map((yoc, j) => {
                                                            const isBase = i === sensitivityMatrix.baseRentIdx && j === sensitivityMatrix.baseHcIdx;
                                                            return (
                                                                <td
                                                                    key={j}
                                                                    className={`text-right text-op tabular-nums font-medium ${isBase ? 'ring-2 ring-[var(--accent)] ring-inset rounded' : ''}`}
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
                </CollapsibleSection>
            </div>

            {/* ===== ARCHITECTURE & PLANNING NOTES (full width) ===== */}
            <div className="card mt-4">
                <h3 className="op-card-title mb-3">Architecture & Planning Notes</h3>
                <RichTextEditor
                    content={pursuit.arch_notes}
                    onChange={(json) => updatePursuitMutation.mutate({ id: pursuit.id, updates: { arch_notes: json } })}
                    placeholder="Enter architecture and planning notes..."
                />
            </div>

            {/* ===== DIALOGS ===== */}

            {/* Duplicate Dialog */}
            {showDuplicateDialog && (
                <DuplicateDialog
                    defaultName={`Copy of ${onePager.name}`}
                    isPending={duplicateOnePager.isPending}
                    onCancel={() => setShowDuplicateDialog(false)}
                    onConfirm={handleDuplicate}
                />
            )}

            {/* Archive Confirm */}
            {
                showArchiveConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onKeyDown={(e) => { if (e.key === 'Escape') setShowArchiveConfirm(false); }}>
                        <div role="alertdialog" aria-modal="true" aria-labelledby="archive-one-pager-title" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 id="archive-one-pager-title" className="text-lg font-semibold text-[var(--text-primary)] mb-2">Archive One-Pager</h2>
                            <p className="text-sm text-[var(--text-muted)] mb-4">
                                Archive &ldquo;{onePager.name}&rdquo;? This hides it from the active list but doesn&rsquo;t delete any data.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowArchiveConfirm(false)} autoFocus className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                                <button onClick={handleArchive} disabled={archiveOnePager.isPending} className="px-4 py-2 rounded-lg bg-[var(--danger)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium transition-opacity shadow-sm">
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

/** Click-to-rename title. Holds its own draft so typing doesn't re-render the editor. */
function OnePagerNameEditor({ name, onRename }: { name: string; onRename: (name: string) => void }) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const cancelledRef = useRef(false);

    if (isEditing) {
        return (
            <input
                type="text"
                aria-label="One-pager name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                    const next = draft.trim();
                    if (!cancelledRef.current && next && next !== name) onRename(next);
                    setIsEditing(false);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { cancelledRef.current = true; setIsEditing(false); }
                }}
                className="min-w-0 flex-1 text-lg font-semibold text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--accent)] outline-none"
                autoFocus
            />
        );
    }
    return (
        <button
            className="min-w-0 text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors group flex items-center gap-1.5"
            onClick={() => { cancelledRef.current = false; setDraft(name); setIsEditing(true); }}
            title="Rename"
        >
            <span className="truncate">{name}</span>
            <Pencil className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-40 group-focus-visible:opacity-40 transition-opacity" aria-hidden />
        </button>
    );
}

function DuplicateDialog({ defaultName, isPending, onCancel, onConfirm }: { defaultName: string; isPending: boolean; onCancel: () => void; onConfirm: (name: string) => void }) {
    const [name, setName] = useState(defaultName);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onKeyDown={(e) => { if (e.key === 'Escape' && !isPending) onCancel(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="duplicate-one-pager-title" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                <h2 id="duplicate-one-pager-title" className="text-lg font-semibold text-[var(--text-primary)] mb-4">Duplicate One-Pager</h2>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                    Creates a full copy of this one-pager including all unit mix, payroll, and soft cost data.
                </p>
                <form onSubmit={(e) => { e.preventDefault(); if (!isPending) onConfirm(name); }}>
                    <label htmlFor="duplicate-one-pager-name" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Name for the copy</label>
                    <input
                        id="duplicate-one-pager-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none"
                        autoFocus
                    />
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                        <button type="submit" disabled={isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm">
                            {isPending ? 'Duplicating...' : 'Duplicate'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

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
            className="inline-input text-op w-full text-left font-medium text-[var(--text-primary)] min-w-0"
            style={{ textAlign: 'left' }}
        />
    );
}

function MetricCell({ label, value, format, decimals = 0 }: { label: string; value: number; format: 'currency' | 'percent'; decimals?: number; }) {
    return (
        <div>
            <div className="text-[11px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">{label}</div>
            <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums mt-0.5">
                {value !== 0 ? (format === 'currency' ? formatCurrency(value, decimals) : formatPercent(value, decimals)) : '—'}
            </div>
        </div>
    );
}

function FieldRow({ label, value, display, className, children, noteKey, fieldNotes, onNoteChange }: { label: string; value?: string; display?: boolean; className?: string; children?: React.ReactNode; noteKey?: string; fieldNotes?: Record<string, string>; onNoteChange?: (key: string, note: string) => void; }) {
    return (
        <div className="flex items-center justify-between gap-4 group/note">
            <span className="text-op text-[var(--text-muted)] whitespace-nowrap flex items-center gap-1">
                {label}
                {noteKey && fieldNotes && onNoteChange && (
                    <FieldNoteButton fieldKey={noteKey} note={fieldNotes[noteKey]} onNoteChange={onNoteChange} />
                )}
            </span>
            {display ? <span className={`text-op tabular-nums text-[var(--text-primary)] ${className || ''}`}>{value}</span> : <div className="w-28">{children}</div>}
        </div>
    );
}

function OpExRow({ label, value, units, onChange, editAllMode, noteKey, fieldNotes, onNoteChange }: { label: string; value: number; units: number; onChange: (v: number) => void; editAllMode?: boolean; noteKey?: string; fieldNotes?: Record<string, string>; onNoteChange?: (key: string, note: string) => void; }) {
    return (
        <tr>
            <td className="text-[var(--text-secondary)] group/note">
                <span className="flex items-center gap-1">
                    {label}
                    {noteKey && fieldNotes && onNoteChange && (
                        <FieldNoteButton fieldKey={noteKey} note={fieldNotes[noteKey]} onNoteChange={onNoteChange} />
                    )}
                </span>
            </td>
            <td><InlineInput value={value} onChange={onChange} format="currency" decimals={0} className="text-op" editAllMode={editAllMode} /></td>
            <td className="text-right text-op tabular-nums text-[var(--text-primary)]">{units > 0 ? formatCurrency(value * units) : '—'}</td>
        </tr>
    );
}

/** Color YOC text based on comparison to base */
function yocColor(yoc: number, base: number): string {
    if (yoc <= 0 || base <= 0) return 'text-[var(--text-muted)]';
    if (yoc > base * 1.005) return 'text-[var(--success)]';
    if (yoc < base * 0.995) return 'text-[var(--danger)]';
    return 'text-[var(--accent)]';
}

/** Background color for YOC matrix cells */
function yocBgColor(yoc: number, base: number): string {
    if (yoc <= 0 || base <= 0) return 'transparent';
    const ratio = yoc / base;
    if (ratio >= 1.10) return 'var(--sensitivity-deep-green)';
    if (ratio >= 1.05) return 'var(--success-bg)';
    if (ratio >= 1.01) return 'var(--sensitivity-faint-green)';
    if (ratio <= 0.90) return 'var(--sensitivity-deep-red)';
    if (ratio <= 0.95) return 'var(--danger-bg)';
    if (ratio <= 0.99) return 'var(--warning-bg)';
    return 'transparent';
}
