'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Loader2, FileDown, FileSpreadsheet } from 'lucide-react';
import { usePursuitRentComps } from '@/hooks/useHellodataQueries';
import {
    getAverageAskingRent,
    getAverageEffectiveRent,
    getAverageAskingPsf,
    getAverageEffectivePsf,
    getAverageSqft,
    filterValidUnits,
} from '@/lib/calculations/hellodataCalculations';
import type { HellodataUnit, PursuitRentComp } from '@/types';

// ============================================================
// Constants
// ============================================================
const COMP_COLORS = ['#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const BED_LABELS: Record<number, string> = { 0: 'Studio', 1: '1BR', 2: '2BR', 3: '3BR', 4: '4BR' };
const BED_COLORS: Record<number, string> = { 0: '#3B82F6', 1: '#22C55E', 2: '#F59E0B', 3: '#EF4444', 4: '#8B5CF6' };

// ============================================================
// Formatting helpers
// ============================================================
function fmtCur(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function fmtNum(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ============================================================
// Types
// ============================================================
interface CompSummary {
    name: string;
    mapNode: number;
    projectType: string;
    yearBuilt: number | null;
    unitCount: number;
    avgUnitSize: number | null;
    marketRent: number | null;
    marketRentSf: number | null;
    effectiveRent: number | null;
    effectiveRentSf: number | null;
    lat: number | null;
    lon: number | null;
    color: string;
}

interface StockRow {
    label: string;
    unitCount: number;
    avgUnitSize: number | null;
    marketRent: number | null;
    marketRentSf: number | null;
    effectiveRent: number | null;
    effectiveRentSf: number | null;
    isSubtotal?: boolean;
    isGrandTotal?: boolean;
    bed?: number;
}

// SF range bucket helpers
function getSfRange(sqft: number): string {
    if (sqft < 500) return '<500';
    if (sqft >= 2500) return '>2500';
    const lower = Math.floor(sqft / 100) * 100;
    return `${lower}-${lower + 99}`;
}

function getSfRangeSortKey(label: string): number {
    if (label === '<500') return 0;
    if (label.startsWith('>')) return 99999;
    const num = parseInt(label.split('-')[0]);
    return isNaN(num) ? 0 : num;
}

// ============================================================
// Main Component
// ============================================================
interface MarketStudyTabProps {
    pursuitId: string;
    pursuitName?: string;
}

export default function MarketStudyTab({ pursuitId, pursuitName }: MarketStudyTabProps) {
    const { data: rentComps = [], isLoading } = usePursuitRentComps(pursuitId);

    // Compute summary data per comp
    const compSummaries = useMemo((): CompSummary[] => {
        return rentComps
            .filter((rc: PursuitRentComp) => rc.property)
            .map((rc: PursuitRentComp, i: number) => {
                const p = rc.property!;
                const units = filterValidUnits((p.units || []) as HellodataUnit[]);
                // Derive project type from boolean flags
                const projectType = p.is_single_family ? 'SFR' : p.is_condo ? 'Condo' : p.is_senior ? 'Senior' : p.is_student ? 'Student' : p.is_build_to_rent ? 'BTR' : p.is_affordable ? 'Affordable' : p.is_apartment ? 'Apartment' : '—';
                return {
                    name: p.building_name || p.street_address || 'Unknown',
                    mapNode: i + 1,
                    projectType,
                    yearBuilt: p.year_built ?? null,
                    unitCount: p.number_units ?? 0,
                    avgUnitSize: getAverageSqft(units),
                    marketRent: getAverageAskingRent(units),
                    marketRentSf: getAverageAskingPsf(units),
                    effectiveRent: getAverageEffectiveRent(units),
                    effectiveRentSf: getAverageEffectivePsf(units),
                    lat: p.lat ?? null,
                    lon: p.lon ?? null,
                    color: COMP_COLORS[i % COMP_COLORS.length],
                };
            });
    }, [rentComps]);

    // Grand totals for summary table
    const summaryTotals = useMemo(() => {
        if (compSummaries.length === 0) return null;
        const avg = (vals: (number | null)[]) => {
            const v = vals.filter((x): x is number => x !== null && !isNaN(x));
            return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
        };
        return {
            unitCount: compSummaries.reduce((s, c) => s + c.unitCount, 0),
            avgUnitSize: avg(compSummaries.map(c => c.avgUnitSize)),
            marketRent: avg(compSummaries.map(c => c.marketRent)),
            marketRentSf: avg(compSummaries.map(c => c.marketRentSf)),
            effectiveRent: avg(compSummaries.map(c => c.effectiveRent)),
            effectiveRentSf: avg(compSummaries.map(c => c.effectiveRentSf)),
        };
    }, [compSummaries]);

    // Market stock by unit type — group all units by bed → SF range
    const stockRows = useMemo((): StockRow[] => {
        const allUnits = rentComps
            .filter((rc: PursuitRentComp) => rc.property)
            .flatMap((rc: PursuitRentComp) => filterValidUnits((rc.property!.units || []) as HellodataUnit[]));

        // Group by bed type
        const bedGroups: Record<number, HellodataUnit[]> = {};
        allUnits.forEach(u => {
            const bed = u.bed ?? -1;
            if (!bedGroups[bed]) bedGroups[bed] = [];
            bedGroups[bed].push(u);
        });

        const rows: StockRow[] = [];
        const sortedBeds = Object.keys(bedGroups).map(Number).sort((a, b) => a - b);

        sortedBeds.forEach(bed => {
            const bedUnits = bedGroups[bed];

            // Subtotal for this bed type
            const bedAvg = (fn: (units: HellodataUnit[]) => number | null) => fn(bedUnits);
            rows.push({
                label: BED_LABELS[bed] || (bed === -1 ? 'Other' : `${bed}BR`),
                unitCount: bedUnits.length,
                avgUnitSize: bedAvg(getAverageSqft),
                marketRent: bedAvg(getAverageAskingRent),
                marketRentSf: bedAvg(getAverageAskingPsf),
                effectiveRent: bedAvg(getAverageEffectiveRent),
                effectiveRentSf: bedAvg(getAverageEffectivePsf),
                isSubtotal: true,
                bed,
            });

            // Sub-group by SF range
            const sfGroups: Record<string, HellodataUnit[]> = {};
            bedUnits.forEach(u => {
                if (!u.sqft) return;
                const range = getSfRange(u.sqft);
                if (!sfGroups[range]) sfGroups[range] = [];
                sfGroups[range].push(u);
            });

            const sortedRanges = Object.keys(sfGroups).sort(
                (a, b) => getSfRangeSortKey(a) - getSfRangeSortKey(b)
            );

            sortedRanges.forEach(range => {
                const rangeUnits = sfGroups[range];
                rows.push({
                    label: range,
                    unitCount: rangeUnits.length,
                    avgUnitSize: getAverageSqft(rangeUnits),
                    marketRent: getAverageAskingRent(rangeUnits),
                    marketRentSf: getAverageAskingPsf(rangeUnits),
                    effectiveRent: getAverageEffectiveRent(rangeUnits),
                    effectiveRentSf: getAverageEffectivePsf(rangeUnits),
                    bed,
                });
            });
        });

        // Grand total
        if (allUnits.length > 0) {
            rows.push({
                label: 'Grand Total',
                unitCount: allUnits.length,
                avgUnitSize: getAverageSqft(allUnits),
                marketRent: getAverageAskingRent(allUnits),
                marketRentSf: getAverageAskingPsf(allUnits),
                effectiveRent: getAverageEffectiveRent(allUnits),
                effectiveRentSf: getAverageEffectivePsf(allUnits),
                isGrandTotal: true,
            });
        }

        return rows;
    }, [rentComps]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                <span className="ml-3 text-sm text-[var(--text-muted)]">Loading market data...</span>
            </div>
        );
    }

    if (compSummaries.length === 0) {
        return (
            <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-primary)]">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">No rent comps linked</h3>
                <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
                    Add rent comps in the Rent Comps tab to generate a market study.
                </p>
            </div>
        );
    }

    const now = new Date();
    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingXlsx, setIsExportingXlsx] = useState(false);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        {pursuitName ? `${pursuitName} — ` : ''}Rent Comps — {monthLabel}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{compSummaries.length} properties · Source: HelloData</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Export Excel */}
                    <button
                        onClick={async () => {
                            setIsExportingXlsx(true);
                            try {
                                const { exportMarketStudyToExcel } = await import('@/components/export/exportMarketStudyExcel');
                                await exportMarketStudyToExcel({ pursuitName, compSummaries, summaryTotals, stockRows });
                            } catch (err) {
                                console.error('Excel export failed:', err);
                            }
                            setIsExportingXlsx(false);
                        }}
                        disabled={isExportingXlsx}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 transition-colors"
                        title="Export to Excel"
                    >
                        {isExportingXlsx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                        XLSX
                    </button>
                    {/* Export PDF */}
                    <button
                        onClick={async () => {
                            setIsExportingPdf(true);
                            try {
                                const { pdf } = await import('@react-pdf/renderer');
                                const { MarketStudyPDF } = await import('@/components/export/MarketStudyPDF');
                                const doc = <MarketStudyPDF pursuitName={pursuitName} compSummaries={compSummaries} summaryTotals={summaryTotals} stockRows={stockRows} />;
                                const blob = await pdf(doc).toBlob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                const safeName = (pursuitName || 'Market_Study').replace(/[^a-zA-Z0-9-_ ]/g, '');
                                a.download = `${safeName}_Market_Study.pdf`;
                                a.click();
                                URL.revokeObjectURL(url);
                            } catch (err) {
                                console.error('PDF export failed:', err);
                            }
                            setIsExportingPdf(false);
                        }}
                        disabled={isExportingPdf}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 transition-colors"
                        title="Export to PDF"
                    >
                        {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                        PDF
                    </button>
                </div>
            </div>

            {/* ── Market Summary Table (full width) ── */}
            <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Market Summary</h3>
                <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="bg-[var(--accent)] text-white">
                                <th className="py-1.5 px-1.5 text-left font-semibold">Property</th>
                                <th className="py-1.5 px-1 text-center font-semibold w-8">#</th>
                                <th className="py-1.5 px-1.5 text-left font-semibold">Type</th>
                                <th className="py-1.5 px-1 text-center font-semibold">Built</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold">Units</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold">Avg SF</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold">Mkt Rent</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold">Rent/SF</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold">Eff Rent</th>
                                <th className="py-1.5 px-1.5 text-right font-semibold">Eff/SF</th>
                            </tr>
                        </thead>
                        <tbody>
                            {compSummaries.map((c, i) => (
                                <tr key={i} className="border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)]">
                                    <td className="py-1 px-1.5 font-semibold text-[var(--accent)] whitespace-nowrap truncate max-w-[180px]">{c.name}</td>
                                    <td className="py-1 px-1 text-center">
                                        <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: c.color }}>{c.mapNode}</span>
                                    </td>
                                    <td className="py-1 px-1.5 text-[var(--text-secondary)]">{c.projectType}</td>
                                    <td className="py-1 px-1 text-center text-[var(--text-secondary)]">{c.yearBuilt ?? '—'}</td>
                                    <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-primary)]">{fmtNum(c.unitCount)}</td>
                                    <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-secondary)]">{fmtNum(c.avgUnitSize)}</td>
                                    <td className="py-1 px-1.5 text-right tabular-nums font-medium text-[var(--text-primary)]">{fmtCur(c.marketRent)}</td>
                                    <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(c.marketRentSf, 2)}</td>
                                    <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-primary)]">{fmtCur(c.effectiveRent)}</td>
                                    <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(c.effectiveRentSf, 2)}</td>
                                </tr>
                            ))}
                            {summaryTotals && (
                                <tr className="bg-[var(--bg-elevated)] font-bold border-t-2 border-[var(--border)]">
                                    <td className="py-1.5 px-1.5 text-[var(--text-primary)]">Grand Total</td>
                                    <td></td><td></td><td></td>
                                    <td className="py-1.5 px-1.5 text-right tabular-nums text-[var(--text-primary)]">{fmtNum(summaryTotals.unitCount)}</td>
                                    <td className="py-1.5 px-1.5 text-right tabular-nums text-[var(--text-secondary)]">{fmtNum(summaryTotals.avgUnitSize)}</td>
                                    <td className="py-1.5 px-1.5 text-right tabular-nums text-[var(--text-primary)]">{fmtCur(summaryTotals.marketRent)}</td>
                                    <td className="py-1.5 px-1.5 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(summaryTotals.marketRentSf, 2)}</td>
                                    <td className="py-1.5 px-1.5 text-right tabular-nums text-[var(--text-primary)]">{fmtCur(summaryTotals.effectiveRent)}</td>
                                    <td className="py-1.5 px-1.5 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(summaryTotals.effectiveRentSf, 2)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Two-column: Stock Table + Map ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {/* Market Stock by Unit Type */}
                <div className="space-y-1.5">
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Market Stock by Unit Type</h3>
                    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                        <div className="overflow-y-auto" style={{ maxHeight: '520px' }}>
                            <table className="w-full text-[11px]">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-[var(--accent)] text-white">
                                        <th className="py-1.5 px-1.5 text-left font-semibold">Unit Mix Analysis</th>
                                        <th className="py-1.5 px-1.5 text-right font-semibold">Units</th>
                                        <th className="py-1.5 px-1.5 text-right font-semibold">Avg SF</th>
                                        <th className="py-1.5 px-1.5 text-right font-semibold">Mkt Rent</th>
                                        <th className="py-1.5 px-1.5 text-right font-semibold">Rent/SF</th>
                                        <th className="py-1.5 px-1.5 text-right font-semibold">Eff Rent</th>
                                        <th className="py-1.5 px-1.5 text-right font-semibold">Eff/SF</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockRows.map((row, i) => {
                                        const isSubtotal = row.isSubtotal;
                                        const isGrandTotal = row.isGrandTotal;
                                        const bedColor = isSubtotal && row.bed !== undefined ? BED_COLORS[row.bed] ?? '#94A3B8' : undefined;
                                        return (
                                            <tr key={i} className={`border-b border-[var(--table-row-border)] last:border-b-0
                                                ${isGrandTotal ? 'bg-[var(--bg-elevated)] font-bold border-t-2 border-[var(--border)]' : ''}
                                                ${isSubtotal ? 'bg-[var(--bg-primary)] font-semibold' : ''}
                                                ${!isSubtotal && !isGrandTotal ? 'hover:bg-[var(--bg-primary)]' : ''}
                                            `}>
                                                <td className={`py-1 px-1.5 whitespace-nowrap ${isSubtotal || isGrandTotal ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] pl-5'}`}>
                                                    <div className="flex items-center gap-1.5">
                                                        {isSubtotal && bedColor && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bedColor }} />}
                                                        {row.label}
                                                    </div>
                                                </td>
                                                <td className={`py-1 px-1.5 text-right tabular-nums ${isSubtotal || isGrandTotal ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{fmtNum(row.unitCount)}</td>
                                                <td className={`py-1 px-1.5 text-right tabular-nums ${isSubtotal || isGrandTotal ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{fmtNum(row.avgUnitSize)}</td>
                                                <td className={`py-1 px-1.5 text-right tabular-nums ${isSubtotal || isGrandTotal ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>{fmtCur(row.marketRent)}</td>
                                                <td className={`py-1 px-1.5 text-right tabular-nums ${isSubtotal || isGrandTotal ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{fmtCur(row.marketRentSf, 2)}</td>
                                                <td className={`py-1 px-1.5 text-right tabular-nums ${isSubtotal || isGrandTotal ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>{fmtCur(row.effectiveRent)}</td>
                                                <td className={`py-1 px-1.5 text-right tabular-nums ${isSubtotal || isGrandTotal ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{fmtCur(row.effectiveRentSf, 2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Embedded Map (right column) */}
                <StudyMap comps={compSummaries} />
            </div>
        </div>
    );
}

// ============================================================
// Embedded Map (numbered markers matching summary table)
// ============================================================
function StudyMap({ comps }: { comps: CompSummary[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<unknown>(null);

    const mappable = useMemo(() => comps.filter(c => c.lat && c.lon), [comps]);

    const initMap = useCallback(() => {
        if (!MAPBOX_TOKEN || !containerRef.current || mappable.length === 0) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        import('mapbox-gl').then((mapboxgl: any) => {
            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;

            const lats = mappable.map(c => c.lat!);
            const lons = mappable.map(c => c.lon!);
            const center: [number, number] = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];

            const map = new mbgl.Map({
                container: containerRef.current!,
                style: 'mapbox://styles/mapbox/streets-v12',
                center,
                zoom: 12,
                attributionControl: false,
            });
            mapRef.current = map;

            map.on('load', () => {
                if (mappable.length > 1) {
                    const pad = 0.005;
                    map.fitBounds(
                        [[Math.min(...lons) - pad, Math.min(...lats) - pad], [Math.max(...lons) + pad, Math.max(...lats) + pad]],
                        { padding: 60, maxZoom: 14 }
                    );
                }

                mappable.forEach((c) => {
                    // Custom numbered marker
                    const el = document.createElement('div');
                    el.className = 'market-study-marker';
                    el.style.cssText = `
                        width: 28px; height: 28px; border-radius: 50%; background: ${c.color};
                        color: white; font-size: 12px; font-weight: 700; display: flex;
                        align-items: center; justify-content: center; border: 2px solid white;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer;
                    `;
                    el.textContent = String(c.mapNode);

                    const popup = new mbgl.Popup({ offset: 20, closeButton: false, maxWidth: '240px' })
                        .setHTML(`
                            <div style="font-family: system-ui; padding: 4px;">
                                <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">${c.name}</div>
                                <div style="font-size: 11px; color: #64748B; display: grid; grid-template-columns: 1fr 1fr; gap: 1px 10px;">
                                    <span>Units:</span><span style="font-weight: 500;">${c.unitCount}</span>
                                    <span>Rent:</span><span style="font-weight: 500;">${fmtCur(c.marketRent)}</span>
                                    <span>Eff:</span><span style="font-weight: 500;">${fmtCur(c.effectiveRent)}</span>
                                    <span>Built:</span><span style="font-weight: 500;">${c.yearBuilt ?? '—'}</span>
                                </div>
                            </div>
                        `);

                    new mbgl.Marker({ element: el })
                        .setLngLat([c.lon!, c.lat!])
                        .setPopup(popup)
                        .addTo(map);
                });
            });
        });

        return () => {
            if (mapRef.current) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (mapRef.current as any).remove();
                mapRef.current = null;
            }
        };
    }, [mappable]);

    useEffect(() => {
        const cleanup = initMap();
        return () => { if (cleanup) cleanup(); };
    }, [initMap]);

    if (!MAPBOX_TOKEN) {
        return (
            <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-primary)]">
                <p className="text-sm text-[var(--text-muted)]">Map requires <code className="text-[10px] bg-[var(--bg-elevated)] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code></p>
            </div>
        );
    }

    if (mappable.length === 0) {
        return (
            <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-primary)]">
                <p className="text-sm text-[var(--text-muted)]">No comp locations available for mapping.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Comp Map</h3>
            <div className="border border-[var(--border)] rounded-xl overflow-hidden" style={{ height: '400px' }}>
                <div ref={containerRef} className="w-full h-full" />
            </div>
            <div className="flex flex-wrap gap-3 px-1">
                {mappable.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: c.color }}>{c.mapNode}</span>
                        <span className="text-[var(--text-secondary)] truncate max-w-[130px]">{c.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
