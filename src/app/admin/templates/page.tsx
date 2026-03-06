'use client';

import { useState, useEffect } from 'react';
import { DebouncedTextInput } from '@/components/shared/DebouncedTextInput';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    useTemplates,
    useUpsertTemplate,
    useDeleteTemplate,
    useProductTypes,
    useUpsertPayrollDefault,
    useDeletePayrollDefault,
} from '@/hooks/useSupabaseQueries';
import type { DataModelTemplate, DataModelPayrollDefault } from '@/types';
import { Plus, Loader2, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/constants';

export default function TemplatesPage() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const { data: templates = [], isLoading } = useTemplates();
    const { data: productTypes = [] } = useProductTypes();
    const upsertTemplate = useUpsertTemplate();
    const deleteTemplate = useDeleteTemplate();
    const upsertPayrollDefault = useUpsertPayrollDefault();
    const deletePayrollDefaultMutation = useDeletePayrollDefault();

    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newProductTypeId, setNewProductTypeId] = useState('');
    const [newRegion, setNewRegion] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleAdd = () => {
        if (!newName.trim() || !newProductTypeId) return;
        upsertTemplate.mutate({
            name: newName.trim(),
            product_type_id: newProductTypeId,
            region: newRegion.trim() || null,
            is_active: true,
            default_efficiency_ratio: 0.85,
            default_other_income_per_unit_month: 0,
            default_vacancy_rate: 0.07,
            default_hard_cost_per_nrsf: 0,
            default_soft_cost_pct: 0.30,
            default_opex_utilities: 0,
            default_opex_repairs_maintenance: 0,
            default_opex_contract_services: 0,
            default_opex_marketing: 0,
            default_opex_general_admin: 0,
            default_opex_turnover: 0,
            default_opex_misc: 0,
            default_opex_insurance: 0,
            default_opex_capex_reserves: 0,
            default_mgmt_fee_pct: 0.03,
            default_payroll_burden_pct: 0.30,
            default_tax_mil_rate: 0,
            default_tax_assessed_pct_hard: 1,
            default_tax_assessed_pct_land: 1,
            default_tax_assessed_pct_soft: 1,
        });
        setNewName(''); setNewProductTypeId(''); setNewRegion(''); setShowAdd(false);
    };

    const updateField = (template: DataModelTemplate, field: string, value: number | string | boolean) => {
        upsertTemplate.mutate({ id: template.id, [field]: value });
    };

    return (
        <AppShell>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Key Date Types</Link>
                    <Link href="/admin/checklist-templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Checklists</Link>
                </div>
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Data Model Templates</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1">Define default assumptions by product type and region. Applied when creating new one-pagers.</p>
                    </div>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> New Template
                    </button>
                </div>

                {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--border-strong)]" /></div>}

                <div className="space-y-3">
                    {templates.map((t) => {
                        const pt = t.product_type ?? productTypes.find((p) => p.id === t.product_type_id);
                        const isExpanded = expandedId === t.id;
                        const payrollDefaults = t.payroll_defaults ?? [];

                        return (
                            <div key={t.id} className="card">
                                <div className="flex items-center justify-between">
                                    <button onClick={() => setExpandedId(isExpanded ? null : t.id)} className="flex items-center gap-2 text-left">
                                        {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                                        <div>
                                            <div className="text-sm font-semibold text-[var(--text-primary)]">{t.name}</div>
                                            <div className="text-xs text-[var(--text-muted)]">{pt?.name ?? '—'}{t.region ? ` · ${t.region}` : ''}</div>
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => updateField(t, 'is_active', !t.is_active)} className={`text-xs px-2 py-0.5 rounded ${t.is_active ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'}`}>
                                            {t.is_active ? 'Active' : 'Inactive'}
                                        </button>
                                        <button onClick={() => { if (confirm('Delete this template?')) deleteTemplate.mutate(t.id); }} className="text-[var(--border-strong)] hover:text-[var(--danger)] transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="mt-4 pt-4 border-t border-[var(--table-row-border)] animate-fade-in">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {/* Header */}
                                            <div className="space-y-3">
                                                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)]">General</h4>
                                                <TemplateField label="Name" value={t.name} type="text" onChange={(v) => updateField(t, 'name', v)} />
                                                <TemplateField label="Region" value={t.region ?? ''} type="text" onChange={(v) => updateField(t, 'region', v)} />
                                                <div className="space-y-1">
                                                    <span className="text-xs text-[var(--text-muted)]">Product Type</span>
                                                    <select value={t.product_type_id} onChange={(e) => updateField(t, 'product_type_id', e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none">
                                                        {productTypes.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Revenue & Budget */}
                                            <div className="space-y-3">
                                                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)]">Revenue & Budget</h4>
                                                <TemplateField label="Efficiency Ratio" value={t.default_efficiency_ratio} type="percent" onChange={(v) => updateField(t, 'default_efficiency_ratio', Number(v))} />
                                                <TemplateField label="Other Income ($/unit/mo)" value={t.default_other_income_per_unit_month} type="currency" onChange={(v) => updateField(t, 'default_other_income_per_unit_month', Number(v))} />
                                                <TemplateField label="Vacancy Rate" value={t.default_vacancy_rate} type="percent" onChange={(v) => updateField(t, 'default_vacancy_rate', Number(v))} />
                                                <TemplateField label="Hard Cost ($/NRSF)" value={t.default_hard_cost_per_nrsf} type="currency" onChange={(v) => updateField(t, 'default_hard_cost_per_nrsf', Number(v))} />
                                                <TemplateField label="Soft Cost (% of HC)" value={t.default_soft_cost_pct} type="percent" onChange={(v) => updateField(t, 'default_soft_cost_pct', Number(v))} />
                                                <TemplateField label="Mgmt Fee (%)" value={t.default_mgmt_fee_pct} type="percent" onChange={(v) => updateField(t, 'default_mgmt_fee_pct', Number(v))} />
                                            </div>

                                            {/* OpEx */}
                                            <div className="space-y-3">
                                                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)]">OpEx ($/unit/yr)</h4>
                                                <TemplateField label="Utilities" value={t.default_opex_utilities} type="currency" onChange={(v) => updateField(t, 'default_opex_utilities', Number(v))} />
                                                <TemplateField label="Repairs & Maint." value={t.default_opex_repairs_maintenance} type="currency" onChange={(v) => updateField(t, 'default_opex_repairs_maintenance', Number(v))} />
                                                <TemplateField label="Contract Svcs" value={t.default_opex_contract_services} type="currency" onChange={(v) => updateField(t, 'default_opex_contract_services', Number(v))} />
                                                <TemplateField label="Marketing" value={t.default_opex_marketing} type="currency" onChange={(v) => updateField(t, 'default_opex_marketing', Number(v))} />
                                                <TemplateField label="G&A" value={t.default_opex_general_admin} type="currency" onChange={(v) => updateField(t, 'default_opex_general_admin', Number(v))} />
                                                <TemplateField label="Turnover" value={t.default_opex_turnover} type="currency" onChange={(v) => updateField(t, 'default_opex_turnover', Number(v))} />
                                                <TemplateField label="Misc" value={t.default_opex_misc} type="currency" onChange={(v) => updateField(t, 'default_opex_misc', Number(v))} />
                                                <TemplateField label="Insurance" value={t.default_opex_insurance} type="currency" onChange={(v) => updateField(t, 'default_opex_insurance', Number(v))} />
                                                <TemplateField label="Capex Reserves" value={t.default_opex_capex_reserves} type="currency" onChange={(v) => updateField(t, 'default_opex_capex_reserves', Number(v))} />
                                            </div>
                                        </div>

                                        {/* Tax */}
                                        <div className="mt-4 pt-4 border-t border-[var(--table-row-border)]">
                                            <h4 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)] mb-3">Property Tax</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <TemplateField label="Millage Rate" value={t.default_tax_mil_rate} type="number" onChange={(v) => updateField(t, 'default_tax_mil_rate', Number(v))} />
                                                <TemplateField label="Assessed % (Hard)" value={t.default_tax_assessed_pct_hard} type="percent" onChange={(v) => updateField(t, 'default_tax_assessed_pct_hard', Number(v))} />
                                                <TemplateField label="Assessed % (Land)" value={t.default_tax_assessed_pct_land} type="percent" onChange={(v) => updateField(t, 'default_tax_assessed_pct_land', Number(v))} />
                                                <TemplateField label="Assessed % (Soft)" value={t.default_tax_assessed_pct_soft} type="percent" onChange={(v) => updateField(t, 'default_tax_assessed_pct_soft', Number(v))} />
                                            </div>
                                        </div>

                                        {/* Payroll Defaults */}
                                        <div className="mt-4 pt-4 border-t border-[var(--table-row-border)]">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)]">Default Payroll Roles</h4>
                                                <button
                                                    onClick={() => upsertPayrollDefault.mutate({ data_model_id: t.id, role_name: '', headcount: 1, base_compensation: 0, bonus_pct: 0, fixed_amount: 0, line_type: 'employee', sort_order: payrollDefaults.length })}
                                                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
                                                >
                                                    + Add Role
                                                </button>
                                            </div>
                                            {payrollDefaults.length === 0 && <p className="text-xs text-[var(--text-faint)]">No default payroll roles. Click &quot;Add Role&quot; to define staff that will auto-populate when using this template.</p>}
                                            {payrollDefaults.length > 0 && (
                                                <table className="data-table">
                                                    <thead><tr><th>Role</th><th className="text-right"># Staff</th><th className="text-right">Base Salary</th><th className="text-right">Bonus %</th><th></th></tr></thead>
                                                    <tbody>
                                                        {payrollDefaults.sort((a, b) => a.sort_order - b.sort_order).map((pr) => (
                                                            <tr key={pr.id}>
                                                                <td>
                                                                    <DebouncedTextInput
                                                                        value={pr.role_name}
                                                                        placeholder="Role name"
                                                                        className="inline-input text-xs text-left w-full"
                                                                        onCommit={(v) => upsertPayrollDefault.mutate({ id: pr.id, data_model_id: t.id, role_name: v })}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input type="number" value={pr.headcount} onChange={(e) => upsertPayrollDefault.mutate({ id: pr.id, data_model_id: t.id, headcount: Number(e.target.value) })} className="inline-input text-xs w-16" step="1" />
                                                                </td>
                                                                <td>
                                                                    <input type="number" value={pr.base_compensation} onChange={(e) => upsertPayrollDefault.mutate({ id: pr.id, data_model_id: t.id, base_compensation: Number(e.target.value) })} className="inline-input text-xs w-24" step="1000" />
                                                                </td>
                                                                <td>
                                                                    <input type="number" value={pr.bonus_pct} onChange={(e) => upsertPayrollDefault.mutate({ id: pr.id, data_model_id: t.id, bonus_pct: Number(e.target.value) })} className="inline-input text-xs w-16" step="0.01" />
                                                                </td>
                                                                <td>
                                                                    <button onClick={() => deletePayrollDefaultMutation.mutate(pr.id)} className="text-[var(--border-strong)] hover:text-[var(--danger)] transition-colors">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {!isLoading && templates.length === 0 && (
                    <div className="card flex flex-col items-center py-12 text-center">
                        <p className="text-sm text-[var(--text-muted)]">No templates yet. Create one to define default assumptions for new one-pagers.</p>
                    </div>
                )}
            </div>

            {/* Add Template Dialog */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">New Template</h2>
                        <div className="space-y-4">
                            <div><label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Template Name <span className="text-[var(--danger)]">*</span></label><input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder='e.g., "DFW Garden — Standard"' className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none" autoFocus /></div>
                            <div><label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Product Type <span className="text-[var(--danger)]">*</span></label>
                                <select value={newProductTypeId} onChange={(e) => setNewProductTypeId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none">
                                    <option value="">Select...</option>
                                    {productTypes.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Region (optional)</label><input type="text" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder="e.g., DFW" className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none" /></div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                            <button onClick={handleAdd} disabled={!newName.trim() || !newProductTypeId || upsertTemplate.isPending} className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm">{upsertTemplate.isPending ? 'Creating...' : 'Create'}</button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}

function TemplateField({ label, value, type, onChange }: { label: string; value: string | number; type: 'text' | 'currency' | 'percent' | 'number'; onChange: (v: string | number) => void }) {
    return (
        <div className="space-y-1">
            <span className="text-xs text-[var(--text-muted)]">{label}</span>
            <input
                type={type === 'text' ? 'text' : 'number'}
                value={value}
                onChange={(e) => onChange(type === 'text' ? e.target.value : Number(e.target.value))}
                step={type === 'percent' ? 0.01 : type === 'currency' ? 1 : 0.01}
                className="w-full inline-input text-xs text-left"
            />
        </div>
    );
}
