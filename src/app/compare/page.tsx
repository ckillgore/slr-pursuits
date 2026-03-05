'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { usePursuits, useProductTypes } from '@/hooks/useSupabaseQueries';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/constants';
import { Loader2, X, Plus, ChevronDown } from 'lucide-react';
import type { OnePager, Pursuit } from '@/types';

const supabase = createClient();

type MetricRow = {
    label: string;
    getValue: (op: OnePager, pursuit?: Pursuit) => string;
    highlight?: boolean;
};

const metricSections: { title: string; rows: MetricRow[] }[] = [
    {
        title: 'Returns',
        rows: [
            { label: 'Unlevered YOC', getValue: (op) => op.calc_yoc ? formatPercent(op.calc_yoc) : '—', highlight: true },
            { label: 'NOI', getValue: (op) => op.calc_noi ? formatCurrency(op.calc_noi, 0) : '—' },
            { label: 'NOI / Unit', getValue: (op) => op.calc_noi_per_unit ? formatCurrency(op.calc_noi_per_unit, 0) : '—' },
        ],
    },
    {
        title: 'Site & Density',
        rows: [
            { label: 'Total Units', getValue: (op) => formatNumber(op.total_units) },
            { label: 'Total NRSF', getValue: (op) => op.calc_total_nrsf ? formatNumber(op.calc_total_nrsf) : '—' },
            { label: 'Total GBSF', getValue: (op) => op.calc_total_gbsf ? formatNumber(op.calc_total_gbsf) : '—' },
            { label: 'Efficiency Ratio', getValue: (op) => formatPercent(op.efficiency_ratio) },
        ],
    },
    {
        title: 'Revenue',
        rows: [
            { label: 'GPR', getValue: (op) => op.calc_gpr ? formatCurrency(op.calc_gpr, 0) : '—' },
            { label: 'Net Revenue', getValue: (op) => op.calc_net_revenue ? formatCurrency(op.calc_net_revenue, 0) : '—' },
            { label: 'Vacancy Rate', getValue: (op) => formatPercent(op.vacancy_rate) },
            { label: 'Other Income ($/unit/mo)', getValue: (op) => formatCurrency(op.other_income_per_unit_month) },
        ],
    },
    {
        title: 'Budget',
        rows: [
            { label: 'Hard Cost ($/NRSF)', getValue: (op) => formatCurrency(op.hard_cost_per_nrsf) },
            { label: 'Hard Cost (Total)', getValue: (op) => op.calc_hard_cost ? formatCurrency(op.calc_hard_cost, 0) : '—' },
            { label: 'Soft Cost', getValue: (op) => op.calc_soft_cost ? formatCurrency(op.calc_soft_cost, 0) : '—' },
            { label: 'Land Cost', getValue: (op) => formatCurrency(op.land_cost, 0) },
            { label: 'Total Budget', getValue: (op) => op.calc_total_budget ? formatCurrency(op.calc_total_budget, 0) : '—', highlight: true },
            { label: 'Cost / Unit', getValue: (op) => op.calc_cost_per_unit ? formatCurrency(op.calc_cost_per_unit, 0) : '—' },
        ],
    },
    {
        title: 'Operating Expenses',
        rows: [
            { label: 'Total OpEx', getValue: (op) => op.calc_total_opex ? formatCurrency(op.calc_total_opex, 0) : '—' },
            {
                label: 'OpEx / Unit', getValue: (op) => {
                    if (!op.calc_total_opex || !op.total_units) return '—';
                    return formatCurrency(op.calc_total_opex / op.total_units, 0);
                }
            },
            { label: 'Mgmt Fee %', getValue: (op) => formatPercent(op.mgmt_fee_pct) },
        ],
    },
    {
        title: 'Assumptions',
        rows: [
            { label: 'Soft Cost %', getValue: (op) => formatPercent(op.soft_cost_pct) },
            { label: 'Payroll Burden %', getValue: (op) => formatPercent(op.payroll_burden_pct) },
            { label: 'Tax Mil Rate', getValue: (op) => formatNumber(op.tax_mil_rate, 4) },
        ],
    },
];

/** Selected one-pager with its parent pursuit info */
interface SelectedOP {
    onePager: OnePager;
    pursuitName: string;
}

export default function CrossComparisonPage() {
    const { data: pursuits = [], isLoading: loadingPursuits } = usePursuits();
    const { data: productTypes = [] } = useProductTypes();

    const [selectedOPs, setSelectedOPs] = useState<SelectedOP[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerPursuitId, setPickerPursuitId] = useState('');
    const [pickerOnePagers, setPickerOnePagers] = useState<OnePager[]>([]);
    const [loadingPicker, setLoadingPicker] = useState(false);

    // Load one-pagers for a selected pursuit in the picker
    const handlePickerPursuitChange = async (pursuitId: string) => {
        setPickerPursuitId(pursuitId);
        if (!pursuitId) {
            setPickerOnePagers([]);
            return;
        }
        setLoadingPicker(true);
        try {
            const { data, error } = await supabase
                .from('one_pagers')
                .select('*')
                .eq('pursuit_id', pursuitId)
                .eq('is_archived', false)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setPickerOnePagers(data || []);
        } catch (e) {
            console.error('Failed to load one-pagers', e);
            setPickerOnePagers([]);
        }
        setLoadingPicker(false);
    };

    const addOnePager = (op: OnePager) => {
        if (selectedOPs.some((s) => s.onePager.id === op.id)) return;
        const pursuit = pursuits.find((p) => p.id === op.pursuit_id);
        setSelectedOPs((prev) => [...prev, { onePager: op, pursuitName: pursuit?.name || 'Unknown' }]);
        setShowPicker(false);
        setPickerPursuitId('');
        setPickerOnePagers([]);
    };

    const removeOnePager = (id: string) => {
        setSelectedOPs((prev) => prev.filter((s) => s.onePager.id !== id));
    };

    // Find best YOC among selected
    const yocValues = selectedOPs.map((s) => s.onePager.calc_yoc ?? 0);
    const bestYoc = yocValues.length > 0 ? Math.max(...yocValues) : 0;

    return (
        <AppShell>
            <div className="max-w-full mx-auto px-6 py-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Cross-Pursuit Comparison</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Compare one-pagers across different pursuits side-by-side.
                    </p>
                </div>

                {/* Selected chips + add button */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    {selectedOPs.map((s) => {
                        const pt = productTypes.find((p) => p.id === s.onePager.product_type_id);
                        return (
                            <div
                                key={s.onePager.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-subtle)] border border-[#C7D7FE] text-sm"
                            >
                                <div>
                                    <span className="font-medium text-[var(--text-primary)]">{s.onePager.name}</span>
                                    <span className="text-[var(--text-muted)] ml-1.5 text-xs">({s.pursuitName})</span>
                                    {pt && <span className="text-[var(--text-faint)] ml-1 text-[10px]">· {pt.name}</span>}
                                </div>
                                <button
                                    onClick={() => removeOnePager(s.onePager.id)}
                                    className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        );
                    })}
                    <button
                        onClick={() => setShowPicker(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--border-strong)] text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add One-Pager
                    </button>
                </div>

                {/* Empty state */}
                {selectedOPs.length < 2 && (
                    <div className="card text-center py-12">
                        <p className="text-sm text-[var(--text-muted)]">
                            {selectedOPs.length === 0
                                ? 'Add at least 2 one-pagers from any pursuits to compare.'
                                : 'Add one more one-pager to start comparing.'}
                        </p>
                    </div>
                )}

                {/* Comparison table */}
                {selectedOPs.length >= 2 && (
                    <div className="card overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 bg-[var(--bg-card)] text-left text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider py-3 px-4 border-b border-[var(--border)] min-w-[180px]">
                                        Metric
                                    </th>
                                    {selectedOPs.map((s) => {
                                        const isBest = bestYoc > 0 && s.onePager.calc_yoc === bestYoc;
                                        return (
                                            <th
                                                key={s.onePager.id}
                                                className={`text-center py-3 px-4 border-b border-[var(--border)] min-w-[150px] ${isBest ? 'bg-[var(--accent-subtle)]' : ''}`}
                                            >
                                                <div className="text-sm font-semibold text-[var(--text-primary)]">{s.onePager.name}</div>
                                                <div className="text-[10px] text-[var(--text-faint)] mt-0.5">{s.pursuitName}</div>
                                                {isBest && <div className="text-[9px] font-bold text-[var(--accent)] uppercase mt-1">★ Best YOC</div>}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {metricSections.map((section) => (
                                    <React.Fragment key={section.title}>
                                        <tr>
                                            <td
                                                colSpan={selectedOPs.length + 1}
                                                className="sticky left-0 z-10 bg-[var(--bg-primary)] text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider py-2 px-4 border-b border-[var(--table-row-border)]"
                                            >
                                                {section.title}
                                            </td>
                                        </tr>
                                        {section.rows.map((row) => (
                                            <tr key={row.label} className="hover:bg-[var(--bg-primary)] transition-colors">
                                                <td className="sticky left-0 z-10 bg-[var(--bg-card)] text-xs text-[var(--text-secondary)] py-2 px-4 border-b border-[var(--table-row-border)] whitespace-nowrap">
                                                    {row.label}
                                                </td>
                                                {selectedOPs.map((s) => {
                                                    const isBest = bestYoc > 0 && s.onePager.calc_yoc === bestYoc;
                                                    const pursuit = pursuits.find((p) => p.id === s.onePager.pursuit_id);
                                                    return (
                                                        <td
                                                            key={s.onePager.id}
                                                            className={`text-right text-xs tabular-nums py-2 px-4 border-b border-[var(--table-row-border)] ${row.highlight ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                                                } ${isBest ? 'bg-[var(--accent-subtle)]/50' : ''}`}
                                                        >
                                                            {row.getValue(s.onePager, pursuit)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Picker Dialog */}
            {showPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Select One-Pager</h2>

                        {/* Step 1: Pick pursuit */}
                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Pursuit</label>
                            <select
                                value={pickerPursuitId}
                                onChange={(e) => handlePickerPursuitChange(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                            >
                                <option value="">Select a pursuit...</option>
                                {pursuits.filter((p) => !p.is_archived).map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}{p.city ? ` — ${p.city}, ${p.state}` : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Step 2: Pick one-pager */}
                        {pickerPursuitId && (
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">One-Pager</label>
                                {loadingPicker && (
                                    <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--border-strong)]" /></div>
                                )}
                                {!loadingPicker && pickerOnePagers.length === 0 && (
                                    <p className="text-sm text-[var(--text-muted)] py-2">No one-pagers in this pursuit.</p>
                                )}
                                {!loadingPicker && pickerOnePagers.length > 0 && (
                                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                        {pickerOnePagers.map((op) => {
                                            const alreadyAdded = selectedOPs.some((s) => s.onePager.id === op.id);
                                            const pt = productTypes.find((p) => p.id === op.product_type_id);
                                            return (
                                                <button
                                                    key={op.id}
                                                    onClick={() => addOnePager(op)}
                                                    disabled={alreadyAdded}
                                                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${alreadyAdded
                                                        ? 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-faint)] cursor-not-allowed'
                                                        : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] text-[var(--text-primary)]'
                                                        }`}
                                                >
                                                    <div className="font-medium">{op.name}</div>
                                                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[var(--text-muted)]">
                                                        {pt && <span>{pt.name}</span>}
                                                        <span>{op.total_units} units</span>
                                                        {op.calc_yoc ? <span>YOC: {(op.calc_yoc * 100).toFixed(2)}%</span> : null}
                                                        {alreadyAdded && <span className="text-[var(--accent)] font-medium">Already added</span>}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => { setShowPicker(false); setPickerPursuitId(''); setPickerOnePagers([]); }}
                                className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
