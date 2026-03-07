'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import {
    usePursuit,
    useUpdatePursuit,
    useOnePagers,
    usePursuitLandComps,
    usePursuitSaleComps,
} from '@/hooks/useSupabaseQueries';
import { usePursuitRentComps } from '@/hooks/useHellodataQueries';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { LocationCard } from '@/components/pursuits/LocationCard';
import {
    RentTrendsSection,
    BubbleChartSection,
    LeasingActivitySection,
    ConcessionsSection,
    MarketContextSection,
} from '@/components/pursuits/rent-comps/RentCompSections';
import {
    ChevronLeft,
    Loader2,
    Printer,
    Map,
    Building2,
    DollarSign,
    BarChart3,
    Landmark,
    TrendingUp,
} from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/constants';
import type { OnePager } from '@/types';

// ═══════════════════════════════════════════════════════════════
// Inline Exhibit Components (self-contained, no external deps)
// ═══════════════════════════════════════════════════════════════

/** Exhibit: Primary One-Pager Financial Summary */
function OnePagerExhibit({ onePager }: { onePager: OnePager }) {
    const sections: { title: string; rows: { label: string; value: string }[] }[] = [
        {
            title: 'Development Program',
            rows: [
                { label: 'Total Units', value: formatNumber(onePager.total_units) },
                { label: 'Total NRSF', value: onePager.calc_total_nrsf ? formatNumber(onePager.calc_total_nrsf) : '—' },
                { label: 'Total GBSF', value: onePager.calc_total_gbsf ? formatNumber(onePager.calc_total_gbsf) : '—' },
                { label: 'Efficiency Ratio', value: formatPercent(onePager.efficiency_ratio) },
                { label: 'Avg Unit Size', value: onePager.calc_total_nrsf && onePager.total_units ? `${formatNumber(Math.round(onePager.calc_total_nrsf / onePager.total_units))} SF` : '—' },
            ],
        },
        {
            title: 'Revenue Assumptions',
            rows: [
                { label: 'Gross Potential Rent', value: onePager.calc_gpr ? formatCurrency(onePager.calc_gpr, 0) : '—' },
                { label: 'Net Revenue', value: onePager.calc_net_revenue ? formatCurrency(onePager.calc_net_revenue, 0) : '—' },
                { label: 'Vacancy Rate', value: formatPercent(onePager.vacancy_rate) },
                { label: 'Other Income ($/unit/mo)', value: formatCurrency(onePager.other_income_per_unit_month) },
            ],
        },
        {
            title: 'Development Budget',
            rows: [
                { label: 'Hard Cost ($/NRSF)', value: formatCurrency(onePager.hard_cost_per_nrsf) },
                { label: 'Hard Cost (Total)', value: onePager.calc_hard_cost ? formatCurrency(onePager.calc_hard_cost, 0) : '—' },
                { label: 'Soft Cost %', value: formatPercent(onePager.soft_cost_pct) },
                { label: 'Soft Cost (Total)', value: onePager.calc_soft_cost ? formatCurrency(onePager.calc_soft_cost, 0) : '—' },
                { label: 'Land Cost', value: formatCurrency(onePager.land_cost, 0) },
                { label: 'Total Budget', value: onePager.calc_total_budget ? formatCurrency(onePager.calc_total_budget, 0) : '—' },
                { label: 'Cost Per Unit', value: onePager.calc_cost_per_unit ? formatCurrency(onePager.calc_cost_per_unit, 0) : '—' },
            ],
        },
        {
            title: 'Return Metrics',
            rows: [
                { label: 'Stabilized NOI', value: onePager.calc_noi ? formatCurrency(onePager.calc_noi, 0) : '—' },
                { label: 'NOI Per Unit', value: onePager.calc_noi_per_unit ? formatCurrency(onePager.calc_noi_per_unit, 0) : '—' },
                { label: 'Yield on Cost (YOC)', value: onePager.calc_yoc ? formatPercent(onePager.calc_yoc) : '—' },
                { label: 'Total OpEx', value: onePager.calc_total_opex ? formatCurrency(onePager.calc_total_opex, 0) : '—' },
                { label: 'Mgmt Fee %', value: formatPercent(onePager.mgmt_fee_pct) },
            ],
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sections.map(section => (
                    <div key={section.title} className="border border-[var(--border)] rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-[var(--bg-primary)] border-b border-[var(--border)]">
                            <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{section.title}</h4>
                        </div>
                        <div className="divide-y divide-[var(--table-row-border)]">
                            {section.rows.map(row => (
                                <div key={row.label} className="flex justify-between items-center px-4 py-2 text-xs">
                                    <span className="text-[var(--text-muted)]">{row.label}</span>
                                    <span className="font-medium text-[var(--text-primary)] tabular-nums">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Exhibit: Land Comps Summary */
function LandCompsExhibit({ comps }: { comps: any[] }) {
    return (
        <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
            <table className="w-full text-xs min-w-[600px]">
                <thead>
                    <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                        <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Property</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Acres</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Sale Price</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Price/Acre</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Price/SF</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Sale Date</th>
                        <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Buyer</th>
                    </tr>
                </thead>
                <tbody>
                    {comps.map((c: any, i: number) => (
                        <tr key={c.id || i} className={`border-b border-[var(--bg-elevated)] ${i % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                            <td className="py-2 px-3">
                                <div className="font-medium text-[var(--text-primary)]">{c.name || c.address || '—'}</div>
                                <div className="text-[10px] text-[var(--text-faint)]">{[c.city, c.state].filter(Boolean).join(', ')}</div>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{c.site_area_acres ? c.site_area_acres.toFixed(2) : '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-medium text-[var(--text-primary)]">{c.sale_price ? `$${Number(c.sale_price).toLocaleString()}` : '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{c.price_per_acre ? `$${Number(c.price_per_acre).toLocaleString()}` : '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{c.price_per_sf ? `$${Number(c.price_per_sf).toFixed(2)}` : '—'}</td>
                            <td className="py-2 px-3 text-center text-[var(--text-secondary)]">{c.sale_date || '—'}</td>
                            <td className="py-2 px-3 text-[var(--text-secondary)] truncate max-w-[120px]">{c.buyer || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Exhibit: Sale Comps Summary */
function SaleCompsExhibit({ comps }: { comps: any[] }) {
    return (
        <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
            <table className="w-full text-xs min-w-[650px]">
                <thead>
                    <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                        <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Property</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Units</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Year Built</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Sale Price</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Price/Unit</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Cap Rate</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Sale Date</th>
                    </tr>
                </thead>
                <tbody>
                    {comps.map((c: any, i: number) => (
                        <tr key={c.id || i} className={`border-b border-[var(--bg-elevated)] ${i % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                            <td className="py-2 px-3">
                                <div className="font-medium text-[var(--text-primary)]">{c.name || c.address || '—'}</div>
                                <div className="text-[10px] text-[var(--text-faint)]">{[c.city, c.state].filter(Boolean).join(', ')}</div>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{c.units ?? '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{c.year_built ?? '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-medium text-[var(--text-primary)]">{c.sale_price ? `$${Number(c.sale_price).toLocaleString()}` : '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{c.price_per_unit ? `$${Number(c.price_per_unit).toLocaleString()}` : '—'}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{c.cap_rate ? `${(Number(c.cap_rate) * 100).toFixed(2)}%` : '—'}</td>
                            <td className="py-2 px-3 text-center text-[var(--text-secondary)]">{c.sale_date || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function MemoPage() {
    const params = useParams();
    const pursuitId = params.id as string;

    const { data: pursuit, isLoading: loadingPursuit } = usePursuit(pursuitId);
    const pursuitUuid = pursuit?.id ?? '';
    const { data: onePagers = [] } = useOnePagers(pursuitUuid);
    const { data: rentComps = [] } = usePursuitRentComps(pursuitId);
    const { data: landComps = [] } = usePursuitLandComps(pursuitUuid);
    const { data: saleComps = [] } = usePursuitSaleComps(pursuitUuid);
    const { mutate: updatePursuit } = useUpdatePursuit();

    // Primary one-pager (or first active)
    const primaryOnePager = useMemo(() => {
        if (!pursuit) return null;
        const primary = onePagers.find(op => op.id === pursuit.primary_one_pager_id);
        if (primary) return primary;
        return onePagers.filter(op => !op.is_archived)[0] ?? null;
    }, [pursuit, onePagers]);

    const handleSaveMemo = (json: Record<string, unknown>, html?: string) => {
        if (!pursuit || !html) return;
        updatePursuit({
            id: pursuit.id,
            updates: { executive_memo: html }
        });
    };

    // Build PropertyMetrics for the chart components
    const compMetrics = useMemo(() => {
        return rentComps
            .filter(rc => rc.property)
            .map(rc => {
                const p = rc.property!;
                return {
                    name: p.building_name || p.street_address || 'Unknown',
                    property: p,
                    units: (p.units || []) as any[],
                    concessions: (p.concessions || []) as any[],
                };
            }) as any[];
    }, [rentComps]);

    if (loadingPursuit) {
        return (
            <AppShell>
                <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" /></div>
            </AppShell>
        );
    }

    if (!pursuit) {
        return (
            <AppShell>
                <div className="max-w-7xl mx-auto px-6 py-12 text-center">
                    <p className="text-[var(--text-muted)]">Pursuit not found.</p>
                </div>
            </AppShell>
        );
    }

    // Track exhibit letters dynamically
    let exhibitIndex = 0;
    const nextExhibit = () => String.fromCharCode(65 + exhibitIndex++); // A, B, C, D...

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-6 py-8 memo-print-container">
                {/* Header (Hidden when printing) */}
                <div className="flex items-center justify-between mb-8 print:hidden">
                    <div>
                        <Link
                            href={`/pursuits/${pursuitId}`}
                            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-2"
                        >
                            <ChevronLeft className="w-4 h-4" /> Back to {pursuit.name}
                        </Link>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Investment Memo</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                            Editable AI-generated deal summary for {pursuit.name}
                        </p>
                    </div>

                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        <Printer className="w-4 h-4" /> Print to PDF
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="print-content-wrapper">
                    {/* The editor UI */}
                    <div className="mb-12">
                        {pursuit.executive_memo ? (
                            <RichTextEditor
                                content={pursuit.executive_memo as string}
                                onChange={handleSaveMemo}
                                placeholder="Investment memo is empty. Go back and click 'Generate Investment Memo' to create one."
                                debounceMs={1500}
                            />
                        ) : (
                            <div className="card text-center py-16 print:hidden">
                                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No Memo Found</h3>
                                <p className="text-[var(--text-muted)] max-w-md mx-auto mb-6">
                                    You haven&apos;t generated an investment memo for this pursuit yet. 
                                </p>
                                <Link 
                                    href={`/pursuits/${pursuitId}`}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Return to Pursuit Dashboard
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* ─── EXHIBITS ─── */}
                    {pursuit.executive_memo && (
                        <div className="mt-16 pt-12 border-t border-[var(--border)] space-y-16">

                            {/* Exhibit: Site & Location Map */}
                            <div className="page-break-avoid">
                                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                                    <Map className="w-5 h-5 text-[var(--accent)]" />
                                    Exhibit {nextExhibit()}: Site &amp; Location Map
                                </h2>
                                <LocationCard pursuit={pursuit} onUpdate={() => {}} />
                            </div>

                            {/* Exhibit: Primary One-Pager Financial Summary */}
                            {primaryOnePager && (
                                <div className="page-break-before">
                                    <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-[var(--accent)]" />
                                        Exhibit {nextExhibit()}: Financial Summary — {primaryOnePager.name}
                                    </h2>
                                    <OnePagerExhibit onePager={primaryOnePager} />
                                </div>
                            )}

                            {/* Exhibit: Rent Comp Charts */}
                            {compMetrics.length > 0 && (
                                <div className="page-break-before">
                                    <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-[var(--accent)]" />
                                        Exhibit {nextExhibit()}: Competitive Rent Analysis
                                    </h2>
                                    <div className="space-y-8">
                                        <div className="card p-6">
                                            <BubbleChartSection comps={compMetrics} />
                                        </div>
                                        <div className="card p-6">
                                            <RentTrendsSection comps={compMetrics} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Exhibit: Leasing Activity & Concessions */}
                            {compMetrics.length > 0 && (
                                <div className="page-break-before">
                                    <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
                                        Exhibit {nextExhibit()}: Leasing Activity, Concessions &amp; Market Context
                                    </h2>
                                    <div className="space-y-8">
                                        <div className="card p-6">
                                            <LeasingActivitySection comps={compMetrics} />
                                        </div>
                                        <div className="card p-6">
                                            <ConcessionsSection comps={compMetrics} />
                                        </div>
                                        <div className="card p-6">
                                            <MarketContextSection comps={compMetrics} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Exhibit: Land Comps */}
                            {landComps.length > 0 && (
                                <div className="page-break-before">
                                    <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                                        <Landmark className="w-5 h-5 text-[var(--accent)]" />
                                        Exhibit {nextExhibit()}: Land Comparable Sales
                                    </h2>
                                    <LandCompsExhibit comps={landComps} />
                                </div>
                            )}

                            {/* Exhibit: Sale Comps */}
                            {saleComps.length > 0 && (
                                <div className="page-break-before">
                                    <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5 text-[var(--accent)]" />
                                        Exhibit {nextExhibit()}: Investment Sale Comparables
                                    </h2>
                                    <SaleCompsExhibit comps={saleComps} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { margin: 0.75in; }
                    body { 
                        background: white !important; 
                        color: black !important;
                    }
                    header, nav, aside { display: none !important; }
                    .print\\:hidden { display: none !important; }
                    .rich-text-editor { 
                        border: none !important; 
                        box-shadow: none !important;
                    }
                    .rich-text-editor > div:first-child { 
                        display: none !important; 
                    }
                    .rich-text-editor-content {
                        font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
                        font-size: 11pt;
                        line-height: 1.6;
                        color: black !important;
                    }
                    .rich-text-editor-content h1, 
                    .rich-text-editor-content h2, 
                    .rich-text-editor-content h3 {
                        page-break-after: avoid;
                        color: black !important;
                    }
                    .rich-text-editor-content table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 1em 0;
                    }
                    .rich-text-editor-content th,
                    .rich-text-editor-content td {
                        border: 1px solid #ccc;
                        padding: 6px 10px;
                        text-align: left;
                    }
                    .rich-text-editor-content th {
                        background-color: #f5f5f5 !important;
                        -webkit-print-color-adjust: exact;
                        font-weight: bold;
                    }
                    .page-break-before { page-break-before: always; }
                    .page-break-avoid { page-break-inside: avoid; }
                }
            `}} />
        </AppShell>
    );
}
