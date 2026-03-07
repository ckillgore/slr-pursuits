'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { usePursuit, useUpdatePursuit } from '@/hooks/useSupabaseQueries';
import { usePursuitRentComps } from '@/hooks/useHellodataQueries';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { LocationCard } from '@/components/pursuits/LocationCard';
import { RentTrendsSection, BubbleChartSection } from '@/components/pursuits/rent-comps/RentCompSections';
import { ChevronLeft, Loader2, Printer, Map, Building2 } from 'lucide-react';

export default function MemoPage() {
    const params = useParams();
    const pursuitId = params.id as string;

    const { data: pursuit, isLoading: loadingPursuit } = usePursuit(pursuitId);
    const { data: rentComps = [] } = usePursuitRentComps(pursuitId);
    const { mutate: updatePursuit } = useUpdatePursuit();

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
            });
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

    return (
        <AppShell>
            {/* The "memo-print-container" class is used for targeting PDF print styling */}
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
                            Editable AI-generated executive summary for {pursuit.name}
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
                    {/* The editor UI will hide toolbars automatically via CSS when printing */}
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
                                    You haven't generated an investment memo for this pursuit yet. 
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

                    {/* Exhibits Section (Visible on screen and Print) */}
                    {pursuit.executive_memo && (
                        <div className="mt-16 pt-12 border-t border-[var(--border)]">
                            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-8 flex items-center gap-2">
                                <Map className="w-5 h-5 text-[var(--accent)]" /> 
                                Exhibit A: Site & Location Map
                            </h2>
                            <div className="mb-16 page-break-avoid">
                                <LocationCard pursuit={pursuit} onUpdate={() => {}} />
                            </div>

                            {compMetrics.length > 0 && (
                                <div className="page-break-before">
                                    <h2 className="text-xl font-bold text-[var(--text-primary)] mb-8 flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-[var(--accent)]" /> 
                                        Exhibit B: Competitive Rent Comparables
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
                        </div>
                    )}
                </div>
            </div>

            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { margin: 1in; }
                    body { 
                        background: white !important; 
                        color: black !important;
                    }
                    /* Hide AppShell chrome navigation */
                    header, nav, aside { display: none !important; }
                    /* Hide Editor Toolbar and border */
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
                        margin-top: 1.5em;
                        margin-bottom: 0.5em;
                    }
                    .rich-text-editor-content h2 { font-size: 16pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
                    .rich-text-editor-content h3 { font-size: 13pt; }
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
                }
            `}} />
        </AppShell>
    );
}
