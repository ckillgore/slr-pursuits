'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import {
    usePursuit,
    useUpdatePursuit,
    useStages,
    useProductTypes,
    useOnePagers,
    useCreateOnePager,
    useDeleteOnePager,
    useDeletePursuit,
    useTemplates,
    usePredevBudget,
    useKeyDates,
} from '@/hooks/useSupabaseQueries';
import { upsertPayrollRow } from '@/lib/supabase/queries';
import { formatCurrency, formatNumber, SF_PER_ACRE } from '@/lib/constants';
import { LocationCard } from '@/components/pursuits/LocationCard';
import { DemographicsCard } from '@/components/pursuits/DemographicsCard';
import { DriveTimeMap } from '@/components/pursuits/DriveTimeMap';
import { GrowthTrendsCard } from '@/components/pursuits/GrowthTrendsCard';
import { IncomeHeatMap } from '@/components/pursuits/IncomeHeatMap';
import { PublicInfoTab } from '@/components/pursuits/PublicInfoTab';
import { PredevBudgetTab } from '@/components/pursuits/PredevBudgetTab';
import { KeyDatesTab } from '@/components/pursuits/KeyDatesTab';
import ChecklistTab from '@/components/pursuits/ChecklistTab';
import { InlineInput } from '@/components/one-pager/InlineInput';
import {
    ChevronLeft,
    Plus,
    FileText,
    MapPin,
    Pencil,
    Loader2,
    BarChart3,
    Trash2,
    Sparkles,
    RefreshCw,
    AlertCircle,
    X,
    Star,
    Calendar,
    DollarSign,
    TrendingUp,
    TrendingDown,
    Building2,
    Clock,
} from 'lucide-react';
import type { OnePager } from '@/types';
import { RichTextEditor } from '@/components/shared/RichTextEditor';

export default function PursuitDetailPage() {
    const params = useParams();
    const router = useRouter();
    const pursuitId = params.id as string;
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab');

    const { data: pursuit, isLoading: loadingPursuit } = usePursuit(pursuitId);
    const { data: stages = [] } = useStages();
    const { data: productTypes = [] } = useProductTypes();
    const { data: onePagers = [], isLoading: loadingOnePagers } = useOnePagers(pursuitId);
    const updatePursuit = useUpdatePursuit();
    const createOnePager = useCreateOnePager();
    const deleteOnePager = useDeleteOnePager();
    const deletePursuit = useDeletePursuit();

    const [showNewOnePagerDialog, setShowNewOnePagerDialog] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deletePursuitConfirm, setDeletePursuitConfirm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newProductTypeId, setNewProductTypeId] = useState('');
    const [newSubProductTypeId, setNewSubProductTypeId] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'onepagers' | 'demographics' | 'publicinfo' | 'predev' | 'keydates' | 'checklist'>(
        initialTab === 'onepagers' ? 'onepagers' : initialTab === 'predev' ? 'predev' : initialTab === 'keydates' ? 'keydates' : initialTab === 'checklist' ? 'checklist' : 'overview'
    );

    // KPI data hooks
    const { data: predevBudget } = usePredevBudget(pursuitId);
    const { data: keyDates = [] } = useKeyDates(pursuitId);

    // AI Summary state
    const [aiSummary, setAiSummary] = useState<string | null>(
        (pursuit?.parcel_data as any)?.aiSummary || null
    );
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const generateSummary = useCallback(async () => {
        if (!pursuit) return;
        setAiLoading(true);
        setAiError(null);
        try {
            const res = await fetch('/api/ai-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parcelData: pursuit.parcel_data || null,
                    demographics: pursuit.demographics,
                    onePagers,
                }),
            });
            const data = await res.json();
            if (data.error) {
                setAiError(data.error);
            } else if (data.summary) {
                setAiSummary(data.summary);
                // Cache in parcel_data
                handleUpdatePursuit({
                    parcel_data: {
                        ...(pursuit.parcel_data || {}),
                        aiSummary: data.summary,
                    },
                } as any);
            }
        } catch (err: any) {
            setAiError(err.message || 'Failed to generate summary');
        } finally {
            setAiLoading(false);
        }
    }, [pursuit, onePagers]);

    const { data: templates = [] } = useTemplates();
    const matchingTemplates = templates.filter(
        (t) => t.is_active && (!newProductTypeId || t.product_type_id === newProductTypeId)
    );

    if (loadingPursuit) {
        return (
            <AppShell>
                <div className="flex justify-center py-24">
                    <Loader2 className="w-8 h-8 animate-spin text-[#C8CDD5]" />
                </div>
            </AppShell>
        );
    }

    if (!pursuit) {
        return (
            <AppShell>
                <div className="max-w-4xl mx-auto px-6 py-16 text-center">
                    <h2 className="text-xl text-[#4A5568]">Pursuit not found</h2>
                    <Link href="/" className="text-[#2563EB] text-sm mt-2 inline-block hover:underline">
                        Back to Dashboard
                    </Link>
                </div>
            </AppShell>
        );
    }

    const stage = pursuit.stage ?? stages.find((s) => s.id === pursuit.stage_id);
    const selectedProductType = productTypes.find((pt) => pt.id === newProductTypeId);
    const subTypes = selectedProductType?.sub_product_types ?? [];

    const handleUpdatePursuit = (updates: Partial<typeof pursuit>) => {
        updatePursuit.mutate({ id: pursuitId, updates });
    };

    const handleCreateOnePager = async () => {
        if (!newName.trim() || !newProductTypeId) return;
        const tpl = templates.find((t) => t.id === selectedTemplateId);
        try {
            const op = await createOnePager.mutateAsync({
                pursuit_id: pursuitId,
                name: newName.trim(),
                product_type_id: newProductTypeId,
                sub_product_type_id: newSubProductTypeId || null,
                created_by: null,
                is_archived: false,
                total_units: 0,
                efficiency_ratio: tpl?.default_efficiency_ratio ?? 0.85,
                other_income_per_unit_month: tpl?.default_other_income_per_unit_month ?? 0,
                vacancy_rate: tpl?.default_vacancy_rate ?? 0.07,
                hard_cost_per_nrsf: tpl?.default_hard_cost_per_nrsf ?? 0,
                land_cost: 0,
                soft_cost_pct: tpl?.default_soft_cost_pct ?? 0.30,
                use_detailed_soft_costs: false,
                opex_utilities: tpl?.default_opex_utilities ?? 0,
                opex_repairs_maintenance: tpl?.default_opex_repairs_maintenance ?? 0,
                opex_contract_services: tpl?.default_opex_contract_services ?? 0,
                opex_marketing: tpl?.default_opex_marketing ?? 0,
                opex_general_admin: tpl?.default_opex_general_admin ?? 0,
                opex_turnover: tpl?.default_opex_turnover ?? 0,
                opex_misc: tpl?.default_opex_misc ?? 0,
                opex_insurance: tpl?.default_opex_insurance ?? 0,
                mgmt_fee_pct: tpl?.default_mgmt_fee_pct ?? 0.03,
                payroll_burden_pct: tpl?.default_payroll_burden_pct ?? 0.30,
                tax_mil_rate: tpl?.default_tax_mil_rate ?? 0,
                tax_assessed_pct_hard: tpl?.default_tax_assessed_pct_hard ?? 1,
                tax_assessed_pct_land: tpl?.default_tax_assessed_pct_land ?? 1,
                tax_assessed_pct_soft: tpl?.default_tax_assessed_pct_soft ?? 1,
                sensitivity_rent_steps: [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15],
                sensitivity_hard_cost_steps: [-15, -10, -5, 0, 5, 10, 15],
                sensitivity_land_cost_steps: [-2000000, -1000000, -500000, 0, 500000, 1000000, 2000000],
            } as Omit<OnePager, 'id' | 'created_at' | 'updated_at' | 'unit_mix' | 'payroll' | 'soft_cost_details' | 'product_type' | 'sub_product_type'>);

            // Copy payroll defaults from template
            if (tpl?.payroll_defaults && tpl.payroll_defaults.length > 0) {
                await Promise.all(
                    tpl.payroll_defaults.map((pd) =>
                        upsertPayrollRow({
                            one_pager_id: op.id,
                            line_type: pd.line_type,
                            role_name: pd.role_name,
                            headcount: pd.headcount,
                            base_compensation: pd.base_compensation,
                            bonus_pct: pd.bonus_pct,
                            fixed_amount: pd.fixed_amount,
                            sort_order: pd.sort_order,
                        })
                    )
                );
            }

            setNewName('');
            setNewProductTypeId('');
            setNewSubProductTypeId('');
            setSelectedTemplateId('');
            setShowNewOnePagerDialog(false);
            router.push(`/pursuits/${pursuitId}/one-pagers/${op.id}`);
        } catch (err) {
            console.error('Failed to create one-pager:', err);
        }
    };

    return (
        <AppShell>
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
                {/* Breadcrumb */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-sm text-[#7A8599] hover:text-[#4A5568] transition-colors mb-6"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back to Dashboard
                </Link>

                {/* Header Card */}
                <div className="card mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            {isEditingName ? (
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onBlur={() => {
                                        if (editName.trim()) handleUpdatePursuit({ name: editName.trim() });
                                        setIsEditingName(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (editName.trim()) handleUpdatePursuit({ name: editName.trim() });
                                            setIsEditingName(false);
                                        }
                                        if (e.key === 'Escape') setIsEditingName(false);
                                    }}
                                    className="text-2xl font-bold text-[#1A1F2B] bg-transparent border-b-2 border-[#2563EB] outline-none w-full"
                                    autoFocus
                                />
                            ) : (
                                <h1
                                    className="text-2xl font-bold text-[#1A1F2B] cursor-pointer hover:text-[#2563EB] transition-colors group flex items-center gap-2"
                                    onClick={() => { setEditName(pursuit.name); setIsEditingName(true); }}
                                >
                                    {pursuit.name}
                                    <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity" />
                                </h1>
                            )}
                            {(pursuit.city || pursuit.state) && (
                                <div className="flex items-center gap-1.5 mt-2 text-[#7A8599] text-sm">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {[pursuit.address, pursuit.city, pursuit.state].filter(Boolean).join(', ')}
                                </div>
                            )}
                        </div>
                        <select
                            value={pursuit.stage_id || ''}
                            onChange={(e) => handleUpdatePursuit({ stage_id: e.target.value, stage_changed_at: new Date().toISOString() })}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                            style={{
                                backgroundColor: stage ? `${stage.color}10` : '#F4F5F7',
                                color: stage?.color ?? '#4A5568',
                                borderColor: stage ? `${stage.color}30` : '#E2E5EA',
                            }}
                        >
                            {stages.filter((s) => s.is_active).map((s) => (
                                <option key={s.id} value={s.id} style={{ background: '#fff', color: '#1A1F2B' }}>{s.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => setDeletePursuitConfirm(true)}
                            className="ml-auto p-2 rounded-lg text-[#A0AABB] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                            title="Delete pursuit"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-4 border-t border-[#F0F1F4]">
                        <div>
                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Site Area (SF)</div>
                            <InlineInput value={pursuit.site_area_sf} onChange={(val) => handleUpdatePursuit({ site_area_sf: val })} format="number" decimals={0} align="left" className="text-lg font-semibold" />
                        </div>
                        <div>
                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Site Area (Acres)</div>
                            <div className="text-lg font-semibold text-[#4A5568]">{pursuit.site_area_sf > 0 ? formatNumber(pursuit.site_area_sf / SF_PER_ACRE, 2) : '—'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Region</div>
                            <input type="text" value={pursuit.region} onChange={(e) => handleUpdatePursuit({ region: e.target.value })} placeholder="e.g., DFW" className="inline-input text-sm text-[#4A5568] w-full" style={{ textAlign: 'left' }} />
                        </div>
                        <div>
                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Created</div>
                            <input
                                type="date"
                                value={pursuit.created_at ? new Date(pursuit.created_at).toISOString().split('T')[0] : ''}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleUpdatePursuit({ created_at: new Date(e.target.value + 'T12:00:00').toISOString() });
                                    }
                                }}
                                className="inline-input text-sm text-[#7A8599] w-full cursor-pointer"
                                style={{ textAlign: 'left' }}
                            />
                        </div>
                        <div>
                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Stage Since</div>
                            <input
                                type="date"
                                value={pursuit.stage_changed_at ? new Date(pursuit.stage_changed_at).toISOString().split('T')[0] : ''}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleUpdatePursuit({ stage_changed_at: new Date(e.target.value + 'T12:00:00').toISOString() });
                                    }
                                }}
                                className="inline-input text-sm text-[#7A8599] w-full cursor-pointer"
                                style={{ textAlign: 'left' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex items-center gap-1 mb-6 border-b border-[#E2E5EA] overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === 'overview'
                            ? 'text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        Overview
                        {activeTab === 'overview' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('onepagers')}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === 'onepagers'
                            ? 'text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        One-Pagers
                        {onePagers.filter(op => !op.is_archived).length > 0 && (
                            <span className="ml-1.5 text-[10px] bg-[#EBF1FF] text-[#2563EB] px-1.5 py-0.5 rounded-full font-medium">
                                {onePagers.filter(op => !op.is_archived).length}
                            </span>
                        )}
                        {activeTab === 'onepagers' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('demographics')}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === 'demographics'
                            ? 'text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        Demographic Data
                        {activeTab === 'demographics' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('publicinfo')}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === 'publicinfo'
                            ? 'text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        Public Information
                        {activeTab === 'publicinfo' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('predev')}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === 'predev'
                            ? 'text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        Pre-Dev Budget
                        {activeTab === 'predev' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('keydates')}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === 'keydates'
                            ? 'text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        Key Dates
                        {activeTab === 'keydates' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('checklist')}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === 'checklist'
                            ? 'text-[#2563EB]'
                            : 'text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        Checklist
                        {activeTab === 'checklist' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                        )}
                    </button>
                </div>

                {/* ===== OVERVIEW TAB ===== */}
                {activeTab === 'overview' && (
                    <>
                        {/* KPI Summary Cards */}
                        {(() => {
                            const primaryOp = pursuit.primary_one_pager_id
                                ? onePagers.find(op => op.id === pursuit.primary_one_pager_id)
                                : onePagers.filter(o => !o.is_archived).length === 1 ? onePagers.filter(o => !o.is_archived)[0] : null;

                            // Pre-dev budget totals
                            const budgetItems = predevBudget?.line_items || [];
                            const totalProjected = budgetItems.reduce((sum, item) => {
                                return sum + Object.values(item.monthly_values || {}).reduce((s, cell) => s + (cell.projected || 0), 0);
                            }, 0);
                            const totalActual = budgetItems.reduce((sum, item) => {
                                return sum + Object.values(item.monthly_values || {}).reduce((s, cell) => s + (cell.actual || 0), 0);
                            }, 0);
                            const budgetVariance = totalProjected - totalActual;

                            // Key dates
                            const now = new Date();
                            const upcomingDates = keyDates
                                .filter(kd => kd.status === 'upcoming' && kd.date_value)
                                .sort((a, b) => new Date(a.date_value).getTime() - new Date(b.date_value).getTime());
                            const nextDate = upcomingDates[0] || null;
                            const overdueDates = keyDates.filter(kd => kd.status === 'overdue' || (kd.status === 'upcoming' && kd.date_value && new Date(kd.date_value) < now));

                            return (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    {/* Primary One-Pager KPIs */}
                                    <div className="card">
                                        <div className="flex items-center gap-1.5 mb-3">
                                            <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Primary Scenario</h3>
                                            {primaryOp && (
                                                <span className="text-[9px] bg-[#F59E0B]/10 text-[#F59E0B] px-1.5 py-0.5 rounded-full font-medium ml-auto">
                                                    <Star className="w-2.5 h-2.5 inline fill-current -mt-px" /> {primaryOp.name}
                                                </span>
                                            )}
                                        </div>
                                        {primaryOp ? (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Units</div>
                                                    <div className="text-xl font-bold text-[#1A1F2B]">{primaryOp.total_units || '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">YOC</div>
                                                    <div className="text-xl font-bold text-[#0D7A3E]">{primaryOp.calc_yoc ? `${(primaryOp.calc_yoc * 100).toFixed(2)}%` : '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Total Budget</div>
                                                    <div className="text-sm font-semibold text-[#1A1F2B]">{primaryOp.calc_total_budget ? formatCurrency(primaryOp.calc_total_budget, 0) : '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">NOI</div>
                                                    <div className="text-sm font-semibold text-[#1A1F2B]">{primaryOp.calc_noi ? formatCurrency(primaryOp.calc_noi, 0) : '—'}</div>
                                                </div>
                                                <div className="col-span-2 pt-2 border-t border-[#F0F1F4]">
                                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Cost / Unit</div>
                                                    <div className="text-sm font-semibold text-[#1A1F2B]">{primaryOp.calc_cost_per_unit ? formatCurrency(primaryOp.calc_cost_per_unit, 0) : '—'}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-4">
                                                <p className="text-xs text-[#A0AABB]">No primary scenario set</p>
                                                <button
                                                    onClick={() => setActiveTab('onepagers')}
                                                    className="text-xs text-[#2563EB] hover:underline mt-1"
                                                >
                                                    Go to One-Pagers →
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Pre-Dev Budget KPIs */}
                                    <div className="card">
                                        <div className="flex items-center gap-1.5 mb-3">
                                            <DollarSign className="w-3.5 h-3.5 text-[#0D7A3E]" />
                                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Pre-Dev Budget</h3>
                                        </div>
                                        {predevBudget && budgetItems.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Projected</div>
                                                        <div className="text-xl font-bold text-[#1A1F2B]">{formatCurrency(totalProjected, 0)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Actual</div>
                                                        <div className="text-xl font-bold text-[#1A1F2B]">{formatCurrency(totalActual, 0)}</div>
                                                    </div>
                                                </div>
                                                <div className="pt-2 border-t border-[#F0F1F4]">
                                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Variance (Under / Over)</div>
                                                    <div className={`text-sm font-semibold flex items-center gap-1 ${budgetVariance >= 0 ? 'text-[#0D7A3E]' : 'text-[#DC2626]'}`}>
                                                        {budgetVariance >= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                                        {formatCurrency(Math.abs(budgetVariance), 0)}
                                                        <span className="text-[10px] font-normal text-[#7A8599] ml-1">{budgetVariance >= 0 ? 'under' : 'over'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-4">
                                                <p className="text-xs text-[#A0AABB]">No pre-dev budget yet</p>
                                                <button
                                                    onClick={() => setActiveTab('predev')}
                                                    className="text-xs text-[#2563EB] hover:underline mt-1"
                                                >
                                                    Set Up Budget →
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Key Dates KPIs */}
                                    <div className="card">
                                        <div className="flex items-center gap-1.5 mb-3">
                                            <Calendar className="w-3.5 h-3.5 text-[#8B5CF6]" />
                                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Key Dates</h3>
                                            {overdueDates.length > 0 && (
                                                <span className="text-[9px] bg-[#DC2626]/10 text-[#DC2626] px-1.5 py-0.5 rounded-full font-medium ml-auto">
                                                    {overdueDates.length} overdue
                                                </span>
                                            )}
                                        </div>
                                        {keyDates.length > 0 ? (
                                            <div className="space-y-3">
                                                {nextDate ? (
                                                    <div>
                                                        <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Next Upcoming</div>
                                                        <div className="text-sm font-semibold text-[#1A1F2B] mt-0.5">
                                                            {nextDate.key_date_type?.name || nextDate.custom_label || 'Date'}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-1">
                                                            <Clock className="w-3 h-3 text-[#7A8599]" />
                                                            <span className="text-xs text-[#4A5568]">
                                                                {new Date(nextDate.date_value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                            <span className="text-[10px] text-[#7A8599]">
                                                                ({Math.ceil((new Date(nextDate.date_value).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} days)
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Next Upcoming</div>
                                                        <div className="text-xs text-[#7A8599] mt-0.5">No upcoming dates</div>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#F0F1F4]">
                                                    <div>
                                                        <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Total Dates</div>
                                                        <div className="text-sm font-semibold text-[#1A1F2B]">{keyDates.length}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Completed</div>
                                                        <div className="text-sm font-semibold text-[#0D7A3E]">{keyDates.filter(kd => kd.status === 'completed').length}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-4">
                                                <p className="text-xs text-[#A0AABB]">No key dates tracked</p>
                                                <button
                                                    onClick={() => setActiveTab('keydates')}
                                                    className="text-xs text-[#2563EB] hover:underline mt-1"
                                                >
                                                    Add Key Dates →
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Location + Notes side by side */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                            <div className="card">
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Pursuit Notes</h3>
                                <RichTextEditor
                                    content={pursuit.exec_summary}
                                    onChange={(json) => handleUpdatePursuit({ exec_summary: json })}
                                    placeholder="Enter pursuit notes..."
                                />
                            </div>
                            <LocationCard pursuit={pursuit} onUpdate={handleUpdatePursuit} />
                        </div>

                        {/* AI Site Assessment Card */}
                        <div className="card relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#8B5CF6] via-[#6366F1] to-[#2563EB]" />
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">AI Site Assessment</h3>
                                    {onePagers.length > 0 && (
                                        <span className="text-[9px] bg-[#8B5CF6]/10 text-[#8B5CF6] px-1.5 py-0.5 rounded-full font-medium">
                                            {onePagers.length} scenario{onePagers.length !== 1 ? 's' : ''} included
                                        </span>
                                    )}
                                </div>
                                {aiSummary && !aiLoading && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={generateSummary}
                                            className="flex items-center gap-1 text-[10px] text-[#8B5CF6] hover:text-[#7C3AED] font-medium transition-colors"
                                        >
                                            <RefreshCw className="w-3 h-3" /> Regenerate
                                        </button>
                                        <span className="text-[#E2E5EA]">|</span>
                                        <button
                                            onClick={() => {
                                                setAiSummary(null);
                                                handleUpdatePursuit({
                                                    parcel_data: {
                                                        ...(pursuit.parcel_data || {}),
                                                        aiSummary: null,
                                                    },
                                                } as any);
                                            }}
                                            className="flex items-center gap-1 text-[10px] text-[#A0AABB] hover:text-red-500 font-medium transition-colors"
                                        >
                                            <X className="w-3 h-3" /> Clear
                                        </button>
                                    </div>
                                )}
                            </div>

                            {aiLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Sparkles className="w-5 h-5 animate-pulse text-[#8B5CF6] mr-2" />
                                    <span className="text-sm text-[#7A8599]">Generating site assessment...</span>
                                </div>
                            ) : aiError ? (
                                <div className="flex items-center gap-2 py-4 text-sm text-red-600">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>{aiError}</span>
                                    <button onClick={generateSummary} className="ml-auto text-[10px] text-[#2563EB] hover:underline">Retry</button>
                                </div>
                            ) : aiSummary ? (
                                <div className="max-h-[500px] overflow-y-auto">
                                    {(() => {
                                        // Parse markdown into structured blocks
                                        const lines = aiSummary.split('\n');
                                        const blocks: { type: 'heading' | 'paragraph' | 'bullet'; content: string }[] = [];
                                        let currentBullets: string[] = [];

                                        const flushBullets = () => {
                                            if (currentBullets.length > 0) {
                                                blocks.push({ type: 'bullet', content: currentBullets.join('\n') });
                                                currentBullets = [];
                                            }
                                        };

                                        for (const line of lines) {
                                            const trimmed = line.trim();
                                            if (!trimmed) { flushBullets(); continue; }

                                            // Heading (## or #)
                                            const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
                                            if (headingMatch) {
                                                flushBullets();
                                                blocks.push({ type: 'heading', content: headingMatch[1] });
                                                continue;
                                            }

                                            // Bullet (* or -)
                                            const bulletMatch = trimmed.match(/^[\-\*]\s+(.+)/);
                                            if (bulletMatch) {
                                                currentBullets.push(bulletMatch[1]);
                                                continue;
                                            }

                                            // Regular text — append to previous paragraph or create new
                                            flushBullets();
                                            const lastBlock = blocks[blocks.length - 1];
                                            if (lastBlock?.type === 'paragraph') {
                                                lastBlock.content += ' ' + trimmed;
                                            } else {
                                                blocks.push({ type: 'paragraph', content: trimmed });
                                            }
                                        }
                                        flushBullets();

                                        const renderInline = (text: string) =>
                                            text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-[#1A1F2B] font-semibold">$1</strong>');

                                        return (
                                            <div className="space-y-1">
                                                {blocks.map((block, i) => {
                                                    if (block.type === 'heading') {
                                                        return (
                                                            <div key={i} className="flex items-center gap-2 pt-3 pb-1 first:pt-0">
                                                                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-[#8B5CF6] to-[#6366F1]" />
                                                                <h4 className="text-[13px] font-bold text-[#1A1F2B] tracking-tight">{block.content}</h4>
                                                            </div>
                                                        );
                                                    }
                                                    if (block.type === 'bullet') {
                                                        return (
                                                            <ul key={i} className="space-y-1.5 pl-3 py-1">
                                                                {block.content.split('\n').map((item, j) => (
                                                                    <li key={j} className="flex items-start gap-2 text-[12px] leading-relaxed text-[#4A5568]">
                                                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#8B5CF6]/40 flex-shrink-0" />
                                                                        <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        );
                                                    }
                                                    return (
                                                        <p key={i} className="text-[12px] leading-relaxed text-[#4A5568] pl-3"
                                                            dangerouslySetInnerHTML={{ __html: renderInline(block.content) }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6">
                                    <button
                                        onClick={generateSummary}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] text-white text-sm font-semibold hover:from-[#7C3AED] hover:to-[#4F46E5] transition-all shadow-sm hover:shadow-md"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Generate Site Assessment
                                    </button>
                                    <p className="text-[10px] text-[#A0AABB] mt-2">
                                        Powered by Gemini · Analyzes parcel, zoning, tax, FMR, demographics{onePagers.length > 0 ? ' & scenarios' : ''}
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ===== ONE-PAGERS TAB ===== */}
                {activeTab === 'onepagers' && (
                    <>
                        {/* One-Pagers */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-[#1A1F2B]">One-Pagers</h2>
                            <div className="flex items-center gap-2">
                                {onePagers.filter(op => !op.is_archived).length >= 2 && (
                                    <Link
                                        href={`/pursuits/${pursuitId}/compare`}
                                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[#E2E5EA] text-[#4A5568] hover:text-[#2563EB] hover:border-[#2563EB] text-sm font-medium transition-colors"
                                    >
                                        <BarChart3 className="w-4 h-4" /> Compare
                                    </Link>
                                )}
                                <button
                                    onClick={() => setShowNewOnePagerDialog(true)}
                                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4" /> New One-Pager
                                </button>
                            </div>
                        </div>

                        {loadingOnePagers && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C8CDD5]" /></div>}

                        {!loadingOnePagers && onePagers.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {onePagers.map((op) => {
                                    const pt = op.product_type ?? productTypes.find((p) => p.id === op.product_type_id);
                                    const isPrimary = pursuit.primary_one_pager_id
                                        ? pursuit.primary_one_pager_id === op.id
                                        : onePagers.filter(o => !o.is_archived).length === 1;
                                    return (
                                        <div key={op.id} className="relative group/card">
                                            <Link href={`/pursuits/${pursuitId}/one-pagers/${op.id}`}>
                                                <div className={`card group cursor-pointer ${isPrimary ? 'ring-2 ring-[#F59E0B]/40' : ''}`}>
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <h3 className="text-base font-semibold text-[#1A1F2B] group-hover:text-[#2563EB] transition-colors flex items-center gap-1.5">
                                                                {op.name}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleUpdatePursuit({ primary_one_pager_id: isPrimary ? null : op.id });
                                                                    }}
                                                                    className={`p-0.5 rounded transition-all ${isPrimary
                                                                        ? 'text-[#F59E0B] opacity-100'
                                                                        : 'text-[#A0AABB] opacity-0 group-hover/card:opacity-100 hover:text-[#F59E0B]'
                                                                        }`}
                                                                    title={isPrimary ? 'Primary scenario (used in reports)' : 'Set as primary scenario'}
                                                                >
                                                                    <Star className={`w-3.5 h-3.5 ${isPrimary ? 'fill-current' : ''}`} />
                                                                </button>
                                                            </h3>
                                                            {pt && <span className="text-xs text-[#7A8599] mt-1 inline-block">{pt.name}</span>}
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-medium">YOC</div>
                                                            <div className="text-lg font-bold text-[#0D7A3E]">{op.calc_yoc ? `${(op.calc_yoc * 100).toFixed(2)}%` : '—'}</div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#F0F1F4]">
                                                        <div><div className="text-[10px] text-[#A0AABB] font-medium uppercase">Units</div><div className="text-sm font-semibold text-[#1A1F2B]">{op.total_units || '—'}</div></div>
                                                        <div><div className="text-[10px] text-[#A0AABB] font-medium uppercase">Budget</div><div className="text-sm font-semibold text-[#1A1F2B]">{op.calc_total_budget ? formatCurrency(op.calc_total_budget, 0) : '—'}</div></div>
                                                        <div><div className="text-[10px] text-[#A0AABB] font-medium uppercase">NOI</div><div className="text-sm font-semibold text-[#1A1F2B]">{op.calc_noi ? formatCurrency(op.calc_noi, 0) : '—'}</div></div>
                                                    </div>
                                                </div>
                                            </Link>
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirmId(op.id); }}
                                                className="absolute bottom-3 right-3 p-1.5 rounded-md opacity-0 group-hover/card:opacity-100 text-[#A0AABB] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-all z-10"
                                                title="Delete one-pager"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!loadingOnePagers && onePagers.length === 0 && (
                            <div className="card flex flex-col items-center py-12 text-center">
                                <FileText className="w-10 h-10 text-[#C8CDD5] mb-3" />
                                <p className="text-sm text-[#7A8599]">No one-pagers yet. Create one to start your feasibility analysis.</p>
                            </div>
                        )}
                    </>
                )}

                {/* ===== DEMOGRAPHIC DATA TAB ===== */}
                {activeTab === 'demographics' && (
                    <>
                        {/* Demographics */}
                        <div className="mb-6">
                            <DemographicsCard pursuit={pursuit} onUpdate={handleUpdatePursuit} />
                        </div>

                        {/* Growth Trends & Market Indicators */}
                        <div className="mb-6">
                            <GrowthTrendsCard pursuit={pursuit} />
                        </div>

                        {/* Drive-Time Analysis */}
                        <div className="mb-6">
                            <DriveTimeMap
                                latitude={pursuit.latitude}
                                longitude={pursuit.longitude}
                                pursuitName={pursuit.name}
                                savedDriveTimeData={pursuit.drive_time_data as any}
                                onSaveDriveTimeData={(data) => handleUpdatePursuit({ drive_time_data: data } as any)}
                            />
                        </div>

                        {/* Income Heat Map */}
                        <div className="mb-6">
                            <IncomeHeatMap
                                latitude={pursuit.latitude}
                                longitude={pursuit.longitude}
                                pursuitName={pursuit.name}
                                savedIncomeData={pursuit.income_heatmap_data as any}
                                onSaveIncomeData={(data) => handleUpdatePursuit({ income_heatmap_data: data } as any)}
                            />
                        </div>
                    </>
                )}

                {/* ===== PUBLIC INFORMATION TAB ===== */}
                {activeTab === 'publicinfo' && (
                    <PublicInfoTab
                        latitude={pursuit.latitude}
                        longitude={pursuit.longitude}
                        pursuitName={pursuit.name}
                        pursuitAddress={`${pursuit.address}, ${pursuit.city}, ${pursuit.state} ${pursuit.zip}`}
                        siteAreaSF={pursuit.site_area_sf}
                        savedParcelData={pursuit.parcel_data}
                        onSaveParcelData={(data) => handleUpdatePursuit({
                            parcel_data: data,
                            parcel_data_updated_at: new Date().toISOString(),
                        } as any)}
                        savedAssemblage={pursuit.parcel_assemblage}
                        onSaveAssemblage={(data) => handleUpdatePursuit({
                            parcel_assemblage: data,
                        } as any)}
                    />
                )}

                {/* ===== PRE-DEV BUDGET TAB ===== */}
                {activeTab === 'predev' && (
                    <PredevBudgetTab pursuitId={pursuitId} />
                )}

                {/* ===== KEY DATES TAB ===== */}
                {activeTab === 'keydates' && (
                    <KeyDatesTab pursuitId={pursuitId} />
                )}

                {/* ===== CHECKLIST TAB ===== */}
                {activeTab === 'checklist' && (
                    <ChecklistTab pursuitId={pursuitId} />
                )}

                {/* New One-Pager Dialog */}
                {showNewOnePagerDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in mx-4">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-4">New One-Pager</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Scenario Name <span className="text-[#DC2626]">*</span></label>
                                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder='e.g., "Scheme A — 4-Story Wrap"' className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none" autoFocus />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Product Type <span className="text-[#DC2626]">*</span></label>
                                    <select value={newProductTypeId} onChange={(e) => { setNewProductTypeId(e.target.value); setNewSubProductTypeId(''); }} className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none">
                                        <option value="">Select product type...</option>
                                        {productTypes.filter((pt) => pt.is_active).map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                                    </select>
                                </div>
                                {subTypes.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Sub-Product Type</label>
                                        <select value={newSubProductTypeId} onChange={(e) => setNewSubProductTypeId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none">
                                            <option value="">None</option>
                                            {subTypes.filter((st: { is_active: boolean }) => st.is_active).map((st: { id: string; name: string }) => <option key={st.id} value={st.id}>{st.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                {matchingTemplates.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Load Defaults From Template</label>
                                        <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none">
                                            <option value="">None — start from scratch</option>
                                            {matchingTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.region ? ` (${t.region})` : ''}</option>)}
                                        </select>
                                        {selectedTemplateId && (
                                            <p className="text-[10px] text-[#7A8599] mt-1">Template defaults will be applied to the new one-pager.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowNewOnePagerDialog(false)} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors">Cancel</button>
                                <button onClick={handleCreateOnePager} disabled={!newName.trim() || !newProductTypeId || createOnePager.isPending} className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm">{createOnePager.isPending ? 'Creating...' : 'Create & Open'}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Dialog */}
                {deleteConfirmId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in mx-4">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-2">Delete One-Pager</h2>
                            <p className="text-sm text-[#7A8599] mb-1">
                                Are you sure you want to permanently delete <span className="font-medium text-[#1A1F2B]">{onePagers.find(op => op.id === deleteConfirmId)?.name}</span>?
                            </p>
                            <p className="text-xs text-[#DC2626] mb-6">This action cannot be undone.</p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        await deleteOnePager.mutateAsync({ id: deleteConfirmId, pursuitId });
                                        setDeleteConfirmId(null);
                                    }}
                                    disabled={deleteOnePager.isPending}
                                    className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                                >
                                    {deleteOnePager.isPending ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Pursuit Confirmation Dialog */}
                {deletePursuitConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in mx-4">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-2">Delete Pursuit</h2>
                            <p className="text-sm text-[#7A8599] mb-1">
                                Are you sure you want to permanently delete <span className="font-medium text-[#1A1F2B]">{pursuit.name}</span> and all its one-pagers?
                            </p>
                            <p className="text-xs text-[#DC2626] mb-6">This action cannot be undone.</p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setDeletePursuitConfirm(false)}
                                    className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        await deletePursuit.mutateAsync(pursuitId);
                                        router.push('/');
                                    }}
                                    disabled={deletePursuit.isPending}
                                    className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                                >
                                    {deletePursuit.isPending ? 'Deleting...' : 'Delete Pursuit'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell >
    );
}
