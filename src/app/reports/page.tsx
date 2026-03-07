'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ReportTable } from '@/components/reports/ReportTable';
import { ReportConfigPanel } from '@/components/reports/ReportConfigPanel';
import { PredevBudgetReport } from '@/components/reports/PredevBudgetReport';
import { KeyDateReport } from '@/components/reports/KeyDateReport';
import { TemplateSaveDialog } from '@/components/reports/TemplateSaveDialog';
import {
    useReportTemplates,
    useCreateReportTemplate,
    useUpdateReportTemplate,
    useDeleteReportTemplate,
    useShareReportTemplate,
    useUnshareReportTemplate,
    useReportData,
    useLandCompReportData,
    useKeyDateReportData,
    useRentCompReportData,
    useSaleCompReportData,
    useStages,
} from '@/hooks/useSupabaseQueries';
import { useReportEngine } from '@/hooks/useReportEngine';
import { useAuth } from '@/components/AuthProvider';
import type { ReportConfig, ReportFieldKey, ReportTemplate, ReportDataSource } from '@/types';
import {
    Loader2,
    Settings2,
    Save,
    Copy,
    Trash2,
    Plus,
    FileSpreadsheet,
    ChevronDown,
    Globe,
    Lock,
    Users,
    Landmark,
    Building2,
    DollarSign,
    Calendar,
    Home,
    FileDown,
} from 'lucide-react';

const DEFAULT_PURSUIT_CONFIG: ReportConfig = {
    dataSource: 'pursuits',
    groupBy: ['region', 'stage'],
    columns: ['pursuit_name', 'product_type', 'total_units', 'calc_yoc', 'calc_total_budget', 'calc_noi', 'calc_cost_per_unit'],
    filters: [],
    sortBy: undefined,
};

const DEFAULT_COMP_CONFIG: ReportConfig = {
    dataSource: 'land_comps',
    groupBy: ['comp_city'],
    columns: ['comp_name', 'comp_address', 'comp_city', 'comp_state', 'comp_sale_price', 'comp_sale_price_psf', 'comp_site_area_sf', 'comp_sale_date', 'comp_buyer'],
    filters: [],
    sortBy: undefined,
};

const DEFAULT_KEY_DATES_CONFIG: ReportConfig = {
    dataSource: 'key_dates',
    groupBy: ['kd_region'],
    columns: ['kd_pursuit_name', 'kd_region', 'kd_stage', 'kd_contract_execution', 'kd_inspection_period', 'kd_closing_date', 'kd_next_date_label', 'kd_next_date_value', 'kd_next_date_days', 'kd_overdue_count'],
    filters: [],
    sortBy: undefined,
};

const DEFAULT_RENT_COMP_CONFIG: ReportConfig = {
    dataSource: 'rent_comps',
    groupBy: ['rc_pursuit_name'],
    columns: ['rc_pursuit_name', 'rc_property_name', 'rc_city', 'rc_state', 'rc_units', 'rc_year_built', 'rc_asking_rent', 'rc_effective_rent', 'rc_asking_psf', 'rc_effective_psf', 'rc_leased_pct'],
    filters: [],
    sortBy: undefined,
};

const DEFAULT_SALE_COMP_CONFIG: ReportConfig = {
    dataSource: 'sale_comps',
    groupBy: ['sc_city'],
    columns: ['sc_name', 'sc_address', 'sc_city', 'sc_state', 'sc_property_type', 'sc_total_units', 'sc_year_built', 'sc_sale_price', 'sc_cap_rate', 'sc_price_per_unit', 'sc_sale_date'],
    filters: [],
    sortBy: undefined,
};

export default function ReportsPage() {
    const { data: templates = [], isLoading: loadingTemplates } = useReportTemplates();
    const { data: reportData, isLoading: loadingData } = useReportData();
    const { data: compReportData, isLoading: loadingCompData } = useLandCompReportData();
    const { data: keyDateReportData, isLoading: loadingKeyDateData } = useKeyDateReportData();
    const { data: rentCompReportData, isLoading: loadingRentCompData } = useRentCompReportData();
    const { data: saleCompReportData, isLoading: loadingSaleCompData } = useSaleCompReportData();
    const { data: stages = [] } = useStages();
    const { user, profile, isAdminOrOwner } = useAuth();
    const createTemplate = useCreateReportTemplate();
    const updateTemplate = useUpdateReportTemplate();
    const deleteTemplate = useDeleteReportTemplate();
    const shareTemplate = useShareReportTemplate();
    const unshareTemplate = useUnshareReportTemplate();

    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<ReportDataSource>('pursuits');
    const [config, setConfig] = useState<ReportConfig>(DEFAULT_PURSUIT_CONFIG);
    const [showConfig, setShowConfig] = useState(true);
    const [showSaveDialog, setShowSaveDialog] = useState<'save' | 'save_as' | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingXlsx, setIsExportingXlsx] = useState(false);

    // Load template config when selected
    useEffect(() => {
        if (selectedTemplateId) {
            const tpl = templates.find(t => t.id === selectedTemplateId);
            if (tpl) {
                setConfig(tpl.config);
                setDataSource(tpl.config.dataSource || 'pursuits');
            }
        }
    }, [selectedTemplateId, templates]);

    const selectedTemplate = selectedTemplateId
        ? templates.find(t => t.id === selectedTemplateId) ?? null
        : null;

    // ── Permission helpers ──────────────────────────────────
    const canEditTemplate = useMemo(() => {
        if (!selectedTemplate) return false;
        // User's own template → can edit
        if (selectedTemplate.created_by === user?.id) return true;
        // Shared template → only admin/owner can edit
        if (selectedTemplate.is_shared && isAdminOrOwner) return true;
        return false;
    }, [selectedTemplate, user, isAdminOrOwner]);

    const canDeleteTemplate = canEditTemplate; // Same permission model

    const canShareTemplate = useMemo(() => {
        if (!selectedTemplate) return false;
        // Only the creator or admin/owner can share/unshare
        if (selectedTemplate.created_by === user?.id) return true;
        if (isAdminOrOwner) return true;
        return false;
    }, [selectedTemplate, user, isAdminOrOwner]);

    // Split templates into personal and shared for the dropdown
    const personalTemplates = useMemo(() =>
        templates.filter(t => !t.is_shared && t.created_by === user?.id),
        [templates, user]
    );
    const sharedTemplates = useMemo(() =>
        templates.filter(t => t.is_shared),
        [templates]
    );

    // Report engine — use the appropriate data source
    const activeData = dataSource === 'land_comps' ? compReportData : dataSource === 'rent_comps' ? rentCompReportData : dataSource === 'sale_comps' ? saleCompReportData : reportData;
    const { filteredRows, groupTree, totalAggregates, isGrouped } = useReportEngine(
        activeData,
        config,
        stages,
    );

    const handleDataSourceChange = (source: ReportDataSource) => {
        setDataSource(source);
        setSelectedTemplateId(null);
        if (source === 'land_comps') setConfig(DEFAULT_COMP_CONFIG);
        else if (source === 'key_dates') setConfig(DEFAULT_KEY_DATES_CONFIG);
        else if (source === 'rent_comps') setConfig(DEFAULT_RENT_COMP_CONFIG);
        else if (source === 'sale_comps') setConfig(DEFAULT_SALE_COMP_CONFIG);
        else if (source === 'pursuits') setConfig(DEFAULT_PURSUIT_CONFIG);
        // For predev_budgets, config panel is not used — the budget report has its own controls
    };

    const handleSort = useCallback((field: ReportFieldKey) => {
        setConfig(prev => ({
            ...prev,
            sortBy: prev.sortBy?.field === field
                ? { field, direction: prev.sortBy.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: 'asc' },
        }));
    }, []);

    const handleSelectTemplate = (id: string | null) => {
        setSelectedTemplateId(id);
        setTemplateDropdownOpen(false);
        if (!id) {
            setConfig(dataSource === 'land_comps' ? DEFAULT_COMP_CONFIG : DEFAULT_PURSUIT_CONFIG);
        }
    };

    const handleSave = async (name: string, description: string) => {
        if (showSaveDialog === 'save' && selectedTemplate) {
            await updateTemplate.mutateAsync({
                id: selectedTemplate.id,
                updates: { name, description, config },
            });
        } else {
            const created = await createTemplate.mutateAsync({
                name,
                description,
                config,
                is_shared: false,
                created_by: user?.id ?? null,
                is_archived: false,
            });
            setSelectedTemplateId(created.id);
        }
        setShowSaveDialog(null);
    };

    const handleDelete = async () => {
        if (!selectedTemplate) return;
        await deleteTemplate.mutateAsync(selectedTemplate.id);
        setSelectedTemplateId(null);
        setConfig(dataSource === 'land_comps' ? DEFAULT_COMP_CONFIG : DEFAULT_PURSUIT_CONFIG);
        setShowDeleteConfirm(false);
    };

    const handleToggleShare = async () => {
        if (!selectedTemplate) return;
        if (selectedTemplate.is_shared) {
            await unshareTemplate.mutateAsync(selectedTemplate.id);
        } else {
            await shareTemplate.mutateAsync(selectedTemplate.id);
        }
    };

    const isLoading = loadingTemplates || loadingData || loadingCompData || loadingKeyDateData || loadingRentCompData || loadingSaleCompData;

    return (
        <AppShell>
            <div className="flex flex-col h-[calc(100vh-56px)]">
                {/* ── Toolbar ────────────────────────────── */}
                <div className="flex flex-col gap-2 px-3 sm:px-4 md:px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
                    {/* Top row: title + action buttons */}
                    <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                        <h1 className="text-lg font-semibold text-[var(--text-primary)] mr-2 whitespace-nowrap">Reports</h1>

                        {/* Shared badge — inline on desktop, hidden on mobile (shown below) */}
                        <div className="hidden sm:block">
                            {selectedTemplate && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${selectedTemplate.is_shared
                                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                                    }`}>
                                    {selectedTemplate.is_shared ? (
                                        <><Globe className="w-3 h-3" /> Shared</>
                                    ) : (
                                        <><Lock className="w-3 h-3" /> Personal</>
                                    )}
                                </span>
                            )}
                        </div>

                        {/* Template Selector */}
                        <div className="relative shrink-0">
                            <button
                                onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors bg-[var(--bg-card)] min-w-[140px] sm:min-w-[180px]"
                        >
                            <span className="truncate flex items-center gap-1.5">
                                {selectedTemplate ? (
                                    <>
                                        {selectedTemplate.is_shared ? (
                                            <Globe className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                        ) : (
                                            <Lock className="w-3 h-3 text-[var(--text-faint)] shrink-0" />
                                        )}
                                        {selectedTemplate.name}
                                    </>
                                ) : (
                                    'New Report'
                                )}
                            </span>
                            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-faint)] ml-auto shrink-0" />
                        </button>
                        {templateDropdownOpen && (
                            <div className="absolute top-full mt-1 left-0 w-80 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl py-1 z-20 animate-fade-in max-h-96 overflow-y-auto">
                                <button
                                    onClick={() => handleSelectTemplate(null)}
                                    className="w-full px-4 py-2 text-sm text-left text-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors flex items-center gap-2"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    New Report
                                </button>

                                {/* Shared companywide templates */}
                                {sharedTemplates.length > 0 && (
                                    <>
                                        <div className="px-4 py-1.5 text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider border-t border-[var(--table-row-border)] mt-1">
                                            <Globe className="w-3 h-3 inline mr-1" /> Shared Companywide
                                        </div>
                                        {sharedTemplates.map(tpl => (
                                            <button
                                                key={tpl.id}
                                                onClick={() => handleSelectTemplate(tpl.id)}
                                                className={`w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg-elevated)] transition-colors ${tpl.id === selectedTemplateId ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                <div className="font-medium flex items-center gap-1.5">
                                                    <Globe className="w-3 h-3 text-[var(--accent)]" />
                                                    {tpl.name}
                                                </div>
                                                {tpl.description && (
                                                    <div className="text-[11px] text-[var(--text-faint)] truncate ml-[18px]">{tpl.description}</div>
                                                )}
                                            </button>
                                        ))}
                                    </>
                                )}

                                {/* Personal templates */}
                                {personalTemplates.length > 0 && (
                                    <>
                                        <div className="px-4 py-1.5 text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider border-t border-[var(--table-row-border)] mt-1">
                                            <Lock className="w-3 h-3 inline mr-1" /> My Reports
                                        </div>
                                        {personalTemplates.map(tpl => (
                                            <button
                                                key={tpl.id}
                                                onClick={() => handleSelectTemplate(tpl.id)}
                                                className={`w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg-elevated)] transition-colors ${tpl.id === selectedTemplateId ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                <div className="font-medium flex items-center gap-1.5">
                                                    <Lock className="w-3 h-3 text-[var(--text-faint)]" />
                                                    {tpl.name}
                                                </div>
                                                {tpl.description && (
                                                    <div className="text-[11px] text-[var(--text-faint)] truncate ml-[18px]">{tpl.description}</div>
                                                )}
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                        </div>

                        {/* Shared badge — mobile only */}
                        <div className="sm:hidden">
                            {selectedTemplate && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${selectedTemplate.is_shared
                                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                                    }`}>
                                    {selectedTemplate.is_shared ? (
                                        <><Globe className="w-3 h-3" /> Shared</>
                                    ) : (
                                        <><Lock className="w-3 h-3" /> Personal</>
                                    )}
                                </span>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 ml-auto">
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showConfig
                                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                                }`}
                        >
                            <Settings2 className="w-4 h-4" />
                            Configure
                        </button>

                        {/* Export XLSX */}
                        <button
                            onClick={async () => {
                                setIsExportingXlsx(true);
                                try {
                                    const { exportReportToExcel } = await import('@/components/export/exportReportExcel');
                                    await exportReportToExcel({ config, groupTree, flatRows: filteredRows, isGrouped, totalAggregates, stages });
                                } catch (err) {
                                    console.error('XLSX export failed:', err);
                                }
                                setIsExportingXlsx(false);
                            }}
                            disabled={isExportingXlsx || filteredRows.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 transition-colors"
                            title="Export Excel"
                        >
                            {isExportingXlsx ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                            XLSX
                        </button>

                        {/* Export PDF */}
                        <button
                            onClick={async () => {
                                setIsExportingPdf(true);
                                try {
                                    const { pdf } = await import('@react-pdf/renderer');
                                    const { ReportPDF } = await import('@/components/export/ReportPDF');
                                    const doc = <ReportPDF config={config} groupTree={groupTree} flatRows={filteredRows} isGrouped={isGrouped} totalAggregates={totalAggregates} stages={stages} />;
                                    const blob = await pdf(doc).toBlob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    const dateStr = new Date().toISOString().slice(0, 10);
                                    const src = config.dataSource === 'land_comps' ? 'Land_Comps' : config.dataSource === 'rent_comps' ? 'Rent_Comps' : config.dataSource === 'sale_comps' ? 'Sale_Comps' : 'Pursuits';
                                    a.download = `${src}_Report_${dateStr}.pdf`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                } catch (err) {
                                    console.error('PDF export failed:', err);
                                }
                                setIsExportingPdf(false);
                            }}
                            disabled={isExportingPdf || filteredRows.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 transition-colors"
                            title="Export PDF"
                        >
                            {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                            PDF
                        </button>

                        {/* Share / Unshare button — visible to creator or admin/owner */}
                        {selectedTemplate && canShareTemplate && (
                            <button
                                onClick={handleToggleShare}
                                disabled={shareTemplate.isPending || unshareTemplate.isPending}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedTemplate.is_shared
                                    ? 'text-[var(--accent)] hover:bg-[var(--accent-subtle)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                                    }`}
                                title={selectedTemplate.is_shared ? 'Make personal (remove from companywide)' : 'Share companywide'}
                            >
                                {selectedTemplate.is_shared ? (
                                    <><Lock className="w-4 h-4" /> Make Personal</>
                                ) : (
                                    <><Users className="w-4 h-4" /> Share Companywide</>
                                )}
                            </button>
                        )}

                        {/* Save — only if can edit */}
                        {selectedTemplate && canEditTemplate && (
                            <button
                                onClick={() => setShowSaveDialog('save')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                            >
                                <Save className="w-4 h-4" />
                                Save
                            </button>
                        )}

                        {/* Save As — always available (creates a new personal copy) */}
                        <button
                            onClick={() => setShowSaveDialog('save_as')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                            <Copy className="w-4 h-4" />
                            Save As
                        </button>

                        {/* Delete — only if can delete */}
                        {selectedTemplate && canDeleteTemplate && (
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>{/* end action buttons */}
                    </div>{/* end top row */}

                    {/* Bottom row: data source toggle */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mb-0.5">
                        {/* Data Source Toggle */}
                        <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5 shrink-0">
                            <button
                                onClick={() => handleDataSourceChange('pursuits')}
                                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${dataSource === 'pursuits' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <Building2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Pursuits</span><span className="sm:hidden">Purs.</span>
                            </button>
                            <button
                                onClick={() => handleDataSourceChange('rent_comps')}
                                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${dataSource === 'rent_comps' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <Home className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Rent Comps</span><span className="sm:hidden">Rent</span>
                            </button>
                            <button
                                onClick={() => handleDataSourceChange('land_comps')}
                                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${dataSource === 'land_comps' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <Landmark className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Land Comps</span><span className="sm:hidden">Land</span>
                            </button>
                            <button
                                onClick={() => handleDataSourceChange('predev_budgets')}
                                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${dataSource === 'predev_budgets' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <DollarSign className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Pre-Dev</span><span className="sm:hidden">Pre-D</span>
                            </button>
                            <button
                                onClick={() => handleDataSourceChange('key_dates')}
                                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${dataSource === 'key_dates' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <Calendar className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Key Dates</span><span className="sm:hidden">Dates</span>
                            </button>
                            <button
                                onClick={() => handleDataSourceChange('sale_comps')}
                                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${dataSource === 'sale_comps' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <Building2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sale Comps</span><span className="sm:hidden">Sales</span>
                            </button>
                        </div>
                    </div>{/* end bottom row */}
                </div>{/* end toolbar */}

                {/* ── Read-only banner for shared templates the user can't edit ── */}
                {selectedTemplate && selectedTemplate.is_shared && !canEditTemplate && (
                    <div className="flex items-center gap-2 px-4 md:px-6 py-2 bg-[var(--accent-subtle)] border-b border-[#D4DEF7] text-xs text-[var(--accent)]">
                        <Globe className="w-3.5 h-3.5" />
                        This is a shared companywide report. You can view and use &quot;Save As&quot; to create your own copy, but only admins or owners can edit the original.
                    </div>
                )}

                {/* ── Main content area ──────────────────── */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Config panel (sidebar) — not shown for predev_budgets */}
                    {showConfig && dataSource !== 'predev_budgets' && dataSource !== 'key_dates' && (
                        <ReportConfigPanel
                            config={config}
                            onChange={setConfig}
                            onClose={() => setShowConfig(false)}
                            dataSource={dataSource}
                            data={activeData}
                        />
                    )}

                    {/* Report table */}
                    <div className="flex-1 overflow-auto p-4 md:p-6">
                        {dataSource === 'predev_budgets' ? (
                            <PredevBudgetReport />
                        ) : dataSource === 'key_dates' ? (
                            <KeyDateReport />
                        ) : isLoading ? (
                            <div className="flex justify-center py-24">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <FileSpreadsheet className="w-12 h-12 text-[var(--border-strong)] mb-3" />
                                <p className="text-sm text-[var(--text-muted)] mb-1">No data to display</p>
                                <p className="text-xs text-[var(--text-faint)]">
                                    {reportData && reportData.length > 0
                                        ? 'Try adjusting your filters to see results.'
                                        : 'Create some pursuits with one-pagers to populate reports.'}
                                </p>
                            </div>
                        ) : (
                            <ReportTable
                                config={config}
                                groupTree={groupTree}
                                flatRows={filteredRows}
                                isGrouped={isGrouped}
                                totalAggregates={totalAggregates}
                                stages={stages}
                                onSort={handleSort}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* ── Save Dialog ────────────────────────── */}
            {showSaveDialog && (
                <TemplateSaveDialog
                    mode={showSaveDialog === 'save' ? 'save' : 'save_as'}
                    initialName={showSaveDialog === 'save' && selectedTemplate ? selectedTemplate.name : ''}
                    initialDescription={showSaveDialog === 'save' && selectedTemplate ? selectedTemplate.description : ''}
                    onSave={handleSave}
                    onClose={() => setShowSaveDialog(null)}
                    isPending={createTemplate.isPending || updateTemplate.isPending}
                />
            )}

            {/* ── Delete Confirmation ────────────────── */}
            {showDeleteConfirm && selectedTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Delete Template</h2>
                        <p className="text-sm text-[var(--text-muted)] mb-1">
                            Are you sure you want to delete <span className="font-medium text-[var(--text-primary)]">{selectedTemplate.name}</span>?
                        </p>
                        {selectedTemplate.is_shared && (
                            <p className="text-xs text-[var(--danger)] mb-1 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                This is a shared companywide report. Deleting it will remove it for all users.
                            </p>
                        )}
                        <p className="text-xs text-[var(--danger)] mb-6">This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteTemplate.isPending}
                                className="px-4 py-2 rounded-lg bg-[var(--danger)] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                {deleteTemplate.isPending ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
