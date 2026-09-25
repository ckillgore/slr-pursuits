'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ReportFieldDef } from '@/lib/reportFields';
import type { DocumentProps } from '@react-pdf/renderer';
import { AppShell } from '@/components/layout/AppShell';
import { ReportTable } from '@/components/reports/ReportTable';
import { ReportConfigPanel } from '@/components/reports/ReportConfigPanel';
import { PredevBudgetReport } from '@/components/reports/PredevBudgetReport';
import { KeyDateReport } from '@/components/reports/KeyDateReport';
import { PursuitCostReport } from '@/components/reports/PursuitCostReport';
import { TemplateSaveDialog } from '@/components/reports/TemplateSaveDialog';
import { ReportExportProvider, type ReportExportBuilder } from '@/components/reports/ReportExportContext';
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
    useUpdatePursuit,
    useUpdateOnePager,
    useUpdateLandComp,
    useUpdateSaleComp,
    useUpdateSaleTransaction,
} from '@/hooks/useSupabaseQueries';
import { useReportEngine } from '@/hooks/useReportEngine';
import { useAuth } from '@/components/AuthProvider';
import { toast } from '@/lib/toast';
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
    Pencil,
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

/** Starting config when a data source is picked or a template is cleared. */
function defaultConfigFor(source: ReportDataSource): ReportConfig {
    switch (source) {
        case 'land_comps': return DEFAULT_COMP_CONFIG;
        case 'key_dates': return DEFAULT_KEY_DATES_CONFIG;
        case 'rent_comps': return DEFAULT_RENT_COMP_CONFIG;
        case 'sale_comps': return DEFAULT_SALE_COMP_CONFIG;
        default: return DEFAULT_PURSUIT_CONFIG;
    }
}

export default function ReportsPage() {
    const { data: templates = [], isLoading: loadingTemplates } = useReportTemplates();
    const { data: stages = [] } = useStages();
    const { user, profile, isAdminOrOwner } = useAuth();
    const createTemplate = useCreateReportTemplate();
    const updateTemplate = useUpdateReportTemplate();
    const deleteTemplate = useDeleteReportTemplate();
    const shareTemplate = useShareReportTemplate();
    const unshareTemplate = useUnshareReportTemplate();

    const updatePursuit = useUpdatePursuit();
    const updateOnePager = useUpdateOnePager();
    const updateLandComp = useUpdateLandComp();
    const updateSaleComp = useUpdateSaleComp();
    const updateSaleTransaction = useUpdateSaleTransaction();

    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<ReportDataSource>('pursuits');

    // ── Only fetch the active data source (gated queries) ──────────
    const { data: reportData, isLoading: loadingData } = useReportData({ enabled: dataSource === 'pursuits' });
    const { data: compReportData, isLoading: loadingCompData } = useLandCompReportData({ enabled: dataSource === 'land_comps' });
    const { data: keyDateReportData, isLoading: loadingKeyDateData } = useKeyDateReportData({ enabled: dataSource === 'key_dates' });
    const { data: rentCompReportData, isLoading: loadingRentCompData } = useRentCompReportData({ enabled: dataSource === 'rent_comps' });
    const { data: saleCompReportData, isLoading: loadingSaleCompData } = useSaleCompReportData({ enabled: dataSource === 'sale_comps' });

    const [config, setConfig] = useState<ReportConfig>(DEFAULT_PURSUIT_CONFIG);
    const [showConfig, setShowConfig] = useState(true);
    const [showSaveDialog, setShowSaveDialog] = useState<'save' | 'save_as' | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingXlsx, setIsExportingXlsx] = useState(false);
    const [editMode, setEditMode] = useState(false);

    // ── Export ownership ───────────────────────────────────────────
    // Tabs that render their own grid register a builder here; the toolbar
    // exports whatever the active tab hands over instead of the engine output.
    const [tabExport, setTabExport] = useState<{ build: ReportExportBuilder } | null>(null);
    const registerTabExport = useCallback((build: ReportExportBuilder | null) => {
        setTabExport(build ? { build } : null);
    }, []);

    // Deep link: /reports?source=pursuit_costs opens that tab (used by the
    // unmapped-property drilldown's back button). Read once on mount.
    useEffect(() => {
        const requested = new URLSearchParams(window.location.search).get('source');
        const known: ReportDataSource[] = ['pursuits', 'rent_comps', 'land_comps', 'predev_budgets', 'key_dates', 'sale_comps', 'pursuit_costs'];
        if (requested && (known as string[]).includes(requested)) {
            const source = requested as ReportDataSource;
            setDataSource(source);
            setConfig(defaultConfigFor(source));
        }
    }, []);

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
        // For predev_budgets and pursuit_costs, config panel is not used — they have their own controls
    };

    const handleSort = useCallback((field: ReportFieldKey) => {
        setConfig(prev => ({
            ...prev,
            sortBy: prev.sortBy?.field === field
                ? { field, direction: prev.sortBy.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: 'asc' },
        }));
    }, []);

    const handleCellEdit = useCallback((row: import('@/lib/supabase/queries').ReportRow, field: ReportFieldDef, rawValue: string | number | null) => {
        if (!field.editTarget || !field.dbColumn) return;

        const updates = { [field.dbColumn]: rawValue };

        switch (field.editTarget) {
            case 'pursuit':
                updatePursuit.mutate({ id: row.pursuit.id, updates });
                break;
            case 'one_pager':
                if (row.onePager?.id) {
                    updateOnePager.mutate({ id: row.onePager.id, updates });
                }
                break;
            case 'land_comp':
                if (row.comp?.id) {
                    updateLandComp.mutate({ id: row.comp.id, updates });
                }
                break;
            case 'sale_comp':
                if (row.saleComp?.id) {
                    updateSaleComp.mutate({ id: row.saleComp.id, updates });
                }
                break;
            case 'sale_transaction': {
                // Find the latest transaction ID
                const txs = row.saleComp?.sale_transactions ?? [];
                const sorted = [...txs].sort((a, b) =>
                    new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
                );
                const txId = sorted[0]?.id;
                if (txId) {
                    // Cap rate is stored normally as a decimal
                    const txUpdates = updates;
                    updateSaleTransaction.mutate({ id: txId, updates: txUpdates });
                }
                break;
            }
        }
    }, [updatePursuit, updateOnePager, updateLandComp, updateSaleComp, updateSaleTransaction]);

    const handleSelectTemplate = (id: string | null) => {
        setSelectedTemplateId(id);
        setTemplateDropdownOpen(false);
        if (!id) {
            setConfig(defaultConfigFor(dataSource));
        }
    };

    // Mutation failures used to surface only as unhandled promise rejections;
    // keep the dialog open and say what went wrong instead.
    const handleSave = async (name: string, description: string) => {
        try {
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
            toast.success(`Saved "${name}"`);
        } catch (err) {
            console.error('Failed to save report template:', err);
            toast.error('Failed to save report template', err);
        }
    };

    const handleDelete = async () => {
        if (!selectedTemplate) return;
        try {
            await deleteTemplate.mutateAsync(selectedTemplate.id);
            setSelectedTemplateId(null);
            setConfig(defaultConfigFor(dataSource));
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error('Failed to delete report template:', err);
            toast.error('Failed to delete report template', err);
        }
    };

    const handleToggleShare = async () => {
        if (!selectedTemplate) return;
        try {
            if (selectedTemplate.is_shared) {
                await unshareTemplate.mutateAsync(selectedTemplate.id);
                toast.success('Report is now personal');
            } else {
                await shareTemplate.mutateAsync(selectedTemplate.id);
                toast.success('Report shared companywide');
            }
        } catch (err) {
            console.error('Failed to change report sharing:', err);
            toast.error('Failed to change sharing', err);
        }
    };

    const isLoading = loadingTemplates || loadingData || loadingCompData || loadingKeyDateData || loadingRentCompData || loadingSaleCompData;

    // Tabs with their own grid must export through their registered builder —
    // never through the engine, which holds a different data source.
    const usesOwnGrid = dataSource === 'predev_budgets' || dataSource === 'pursuit_costs' || dataSource === 'key_dates';
    const canExport = usesOwnGrid ? tabExport !== null : filteredRows.length > 0;

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
                        {/* Edit mode toggle */}
                        {dataSource !== 'predev_budgets' && dataSource !== 'pursuit_costs' && dataSource !== 'key_dates' && dataSource !== 'rent_comps' && (
                            <button
                                onClick={() => setEditMode(!editMode)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editMode
                                    ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                                    }`}
                                title={editMode ? 'Exit edit mode' : 'Edit cells inline'}
                            >
                                <Pencil className="w-4 h-4" />
                                {editMode ? 'Editing' : 'Edit'}
                            </button>
                        )}
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
                                    if (tabExport) {
                                        const { exportTableToExcel } = await import('@/components/export/tableExport');
                                        await exportTableToExcel(tabExport.build());
                                    } else {
                                        const { exportReportToExcel } = await import('@/components/export/exportReportExcel');
                                        await exportReportToExcel({ config, groupTree, flatRows: filteredRows, isGrouped, totalAggregates, stages });
                                    }
                                } catch (err) {
                                    console.error('XLSX export failed:', err);
                                    toast.error('Excel export failed', err);
                                } finally {
                                    setIsExportingXlsx(false);
                                }
                            }}
                            disabled={isExportingXlsx || isExportingPdf || !canExport}
                            aria-busy={isExportingXlsx}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 transition-colors"
                            title={canExport ? 'Export Excel' : 'Nothing to export yet'}
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
                                    let doc: React.ReactElement<DocumentProps>;
                                    let fileName: string;

                                    if (tabExport) {
                                        const { TablePDF } = await import('@/components/export/TablePDF');
                                        const { downloadFileName } = await import('@/components/export/tableExport');
                                        const spec = tabExport.build();
                                        doc = <TablePDF spec={spec} />;
                                        fileName = downloadFileName(spec.fileBase, 'pdf');
                                    } else {
                                        const { ReportPDF } = await import('@/components/export/ReportPDF');
                                        const { downloadFileName } = await import('@/components/export/tableExport');
                                        doc = <ReportPDF config={config} groupTree={groupTree} flatRows={filteredRows} isGrouped={isGrouped} totalAggregates={totalAggregates} stages={stages} />;
                                        const src = config.dataSource === 'land_comps' ? 'Land_Comps' : config.dataSource === 'rent_comps' ? 'Rent_Comps' : config.dataSource === 'sale_comps' ? 'Sale_Comps' : 'Pursuits';
                                        // Local date: toISOString() is UTC and names evening exports for tomorrow.
                                        fileName = downloadFileName(`${src}_Report`, 'pdf');
                                    }

                                    const blob = await pdf(doc).toBlob();
                                    const { downloadBlob } = await import('@/components/export/download');
                                    downloadBlob(blob, fileName);
                                } catch (err) {
                                    console.error('PDF export failed:', err);
                                    toast.error('PDF export failed', err);
                                } finally {
                                    setIsExportingPdf(false);
                                }
                            }}
                            disabled={isExportingPdf || isExportingXlsx || !canExport}
                            aria-busy={isExportingPdf}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 transition-colors"
                            title={canExport ? 'Export PDF' : 'Nothing to export yet'}
                        >
                            {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                            {isExportingPdf ? 'Building…' : 'PDF'}
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
                            <button
                                onClick={() => handleDataSourceChange('pursuit_costs')}
                                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${dataSource === 'pursuit_costs' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <DollarSign className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Pursuit Costs</span><span className="sm:hidden">Costs</span>
                            </button>
                        </div>
                    </div>{/* end bottom row */}
                </div>{/* end toolbar */}

                {/* ── Read-only banner for shared templates the user can't edit ── */}
                {selectedTemplate && selectedTemplate.is_shared && !canEditTemplate && (
                    <div className="flex items-center gap-2 px-4 md:px-6 py-2 bg-[var(--accent-subtle)] border-b border-[var(--accent)]/20 text-xs text-[var(--accent)]">
                        <Globe className="w-3.5 h-3.5" />
                        This is a shared companywide report. You can view and use &quot;Save As&quot; to create your own copy, but only admins or owners can edit the original.
                    </div>
                )}

                {/* ── Main content area ──────────────────── */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Config panel (sidebar) — not shown for predev_budgets, pursuit_costs, or key_dates */}
                    {showConfig && dataSource !== 'predev_budgets' && dataSource !== 'pursuit_costs' && dataSource !== 'key_dates' && (
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
                        <ReportExportProvider register={registerTabExport}>
                        {dataSource === 'predev_budgets' ? (
                            <PredevBudgetReport />
                        ) : dataSource === 'pursuit_costs' ? (
                            <PursuitCostReport />
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
                                    {activeData && activeData.length > 0
                                        ? 'Try adjusting your filters to see results.'
                                        : dataSource === 'pursuits'
                                            ? 'Create some pursuits with one-pagers to populate reports.'
                                            : 'There are no records for this data source yet.'}
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
                                editMode={editMode}
                                onCellEdit={handleCellEdit}
                            />
                        )}
                        </ReportExportProvider>
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
                                className="px-4 py-2 rounded-lg bg-[var(--danger)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
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
