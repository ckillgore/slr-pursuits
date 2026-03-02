'use client';

import { useState, useCallback, useMemo } from 'react';
import {
    Search,
    Plus,
    X,
    Building2,
    Loader2,
    Trash2,
    ChevronDown,
    ChevronUp,
    Check,
    Clock,
    Star,
} from 'lucide-react';
import {
    useHellodataSearch,
    usePursuitRentComps,
    useFetchHellodataProperty,
    useLinkRentComp,
    useUnlinkRentComp,
    useUpdateCompType,
} from '@/hooks/useHellodataQueries';
import {
    getAverageEffectiveRent,
    getAverageAskingRent,
    getAverageSqft,
    getAverageEffectivePsf,
    getAverageAskingPsf,
    getAverageConcession,
    getUnitMixSummary,
    getOccupancyRate,
    filterValidUnits,
    HELLODATA_CACHE_TTL_DAYS,
} from '@/lib/calculations/hellodataCalculations';
import type { HellodataProperty, HellodataUnit, HellodataConcession, PursuitRentComp, HellodataSearchResult } from '@/types';
import type { PropertyMetrics as SharedPropertyMetrics } from './rent-comps/types';
import { RentTrendsSection, BubbleChartSection, OccupancySection, LeasingActivitySection, ConcessionsSection, FeesSection, QualitySection, MarketContextSection, RentRollSection } from './rent-comps/RentCompSections';

interface RentCompsTabProps {
    pursuitId: string;
}

// ============================================================
// Formatting helpers
// ============================================================
function fmtCur(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined) return '—';
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function fmtNum(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined) return '—';
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number | null | undefined, dec = 1): string {
    if (v === null || v === undefined) return '—';
    return `${v.toFixed(dec)}%`;
}
function daysSince(dateStr: string | null): number | null {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function bedLabel(bed: number | null): string {
    if (bed === null) return 'Other';
    if (bed === 0) return 'Studio';
    return `${bed} BR`;
}
const BED_COLORS: Record<number, string> = { 0: '#3B82F6', 1: '#22C55E', 2: '#F59E0B', 3: '#EF4444', 4: '#8B5CF6' };
function bedColor(bed: number | null): string {
    return BED_COLORS[bed ?? -1] ?? '#94A3B8';
}

// ============================================================
// PropertyData: pre-computed metrics per property
// ============================================================
interface PropertyMetrics extends SharedPropertyMetrics {
    address: string;
    avgEffRent: number | null;
    avgAskRent: number | null;
    avgSqft: number | null;
    avgEffPsf: number | null;
    avgAskPsf: number | null;
    avgConcession: number | null;
    occupancyPct: number | null;
    leasedPct: number | null;
    qualityLabel: string;
    reviewScore: string;
    pricingStrategy: string;
    bedTypes: number[];
    compType: 'primary' | 'secondary';
    propertyId: string;
    // New Hellodata-style metrics
    concessionText: string;
    avgDaysOnMarket: number | null;
    avgDaysVacant: number | null;
    vacancies: number;
    concessionPct: number | null;
}

function computeMetrics(rc: PursuitRentComp): PropertyMetrics | null {
    const p = rc.property;
    if (!p) return null;
    const units = filterValidUnits((p.units || []) as HellodataUnit[]);
    const concessions = (p.concessions || []) as HellodataConcession[];
    const totalUnits = p.number_units ?? 0;

    // Leased % — Hellodata method: (total - units available within 7 days) / total
    let leasedPct: number | null = null;
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    if (totalUnits > 0) {
        // First try from occupancy_over_time (most accurate)
        const occ = p.occupancy_over_time;
        if (occ?.length) {
            leasedPct = occ[occ.length - 1].leased * 100;
        } else {
            // Fallback: estimate from unit availability
            let availableWithin7Days = 0;
            for (const u of units) {
                const periods = u.availability_periods || [];
                const isAvailable = periods.some(ap => {
                    const entered = !ap.enter_market || ap.enter_market <= sevenDaysOut;
                    const notExited = !ap.exit_market || ap.exit_market >= todayStr;
                    return entered && notExited;
                });
                if (isAvailable) availableWithin7Days++;
            }
            leasedPct = ((totalUnits - availableWithin7Days) / totalUnits) * 100;
        }
    }

    // Vacancies — currently on-market units
    let vacancies = 0;
    for (const u of units) {
        const periods = u.availability_periods || [];
        const isOnMarket = periods.some(ap => {
            const entered = !ap.enter_market || ap.enter_market <= todayStr;
            const notExited = !ap.exit_market || ap.exit_market >= todayStr;
            return entered && notExited;
        });
        if (isOnMarket) vacancies++;
    }

    // Days on market — average of units with data
    const domValues = units.map(u => u.days_on_market).filter((v): v is number => v !== null && v !== undefined);
    const avgDaysOnMarket = domValues.length > 0 ? domValues.reduce((s, v) => s + v, 0) / domValues.length : null;

    // Average days vacant — approximate from availability periods  
    const vacantDays = units.flatMap(u => (u.availability_periods || []).map(ap => ap.days_on_market)).filter((v): v is number => v !== null && v !== undefined);
    const avgDaysVacant = vacantDays.length > 0 ? vacantDays.reduce((s, v) => s + v, 0) / vacantDays.length : null;

    // Concession text — latest concession
    const sortedConcessions = [...concessions].sort((a, b) => (b.from_date || '').localeCompare(a.from_date || ''));
    const latestConcession = sortedConcessions[0];
    let concessionText = '—';
    if (latestConcession?.concession_text) {
        concessionText = latestConcession.concession_text;
    }

    // Concession % — concession amount as percentage of asking rent
    const askingRent = getAverageAskingRent(units);
    const effectiveRent = getAverageEffectiveRent(units);
    const avgConcession = getAverageConcession(units);
    const concessionPct = (askingRent && avgConcession) ? (avgConcession / askingRent) * 100 : null;

    const quality = p.building_quality?.property_overall_quality;
    const bedTypes = [...new Set(units.map(u => u.bed).filter(b => b !== null))] as number[];
    bedTypes.sort((a, b) => a - b);

    return {
        name: p.building_name || p.street_address || 'Unknown',
        address: `${p.street_address || ''}, ${p.city || ''}, ${p.state || ''} ${p.zip_code || ''}`,
        property: p,
        units,
        concessions,
        availableUnits: vacancies,
        askingRent,
        effectiveRent,
        rentPSF: getAverageAskingPsf(units),
        avgEffRent: effectiveRent,
        avgAskRent: askingRent,
        avgSqft: getAverageSqft(units),
        avgEffPsf: getAverageEffectivePsf(units),
        avgAskPsf: getAverageAskingPsf(units),
        avgConcession,
        occupancyPct: leasedPct,
        leasedPct,
        qualityLabel: quality !== undefined ? `${(quality * 100).toFixed(0)}%` : '—',
        reviewScore: p.review_analysis?.avg_score?.toFixed(1) ?? '—',
        pricingStrategy: p.pricing_strategy?.is_using_rev_management
            ? `Rev Mgmt: Yes\nUpdates: Every ${p.pricing_strategy.avg_duration?.toFixed(2) ?? '?'} days`
            : 'Rev Mgmt: No',
        bedTypes,
        compType: rc.comp_type || 'primary',
        propertyId: rc.property_id,
        concessionText,
        avgDaysOnMarket,
        avgDaysVacant,
        vacancies,
        concessionPct,
    };
}

// ============================================================
// Main Component
// ============================================================

type SectionKey = 'overview' | 'unitBreakdown' | 'rankings' | 'amenities' | 'rentTrends' | 'bubbleChart' | 'occupancy' | 'leasing' | 'rentRoll' | 'concessions' | 'fees' | 'quality' | 'market';

export default function RentCompsTab({ pursuitId }: RentCompsTabProps) {
    const { data: rentComps = [], isLoading } = usePursuitRentComps(pursuitId);
    const { results: searchResults, isSearching, searchError, search, clearResults } = useHellodataSearch();
    const fetchProperty = useFetchHellodataProperty();
    const linkComp = useLinkRentComp();
    const unlinkComp = useUnlinkRentComp();
    const updateCompType = useUpdateCompType();

    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [addingPropertyId, setAddingPropertyId] = useState<string | null>(null);
    const [unlinkConfirmId, setUnlinkConfirmId] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<SectionKey>('overview');
    const [compFilter, setCompFilter] = useState<'all' | 'primary'>('all');

    // Pre-compute metrics for all comps
    const allCompMetrics = useMemo(
        () => rentComps.map(computeMetrics).filter(Boolean) as PropertyMetrics[],
        [rentComps]
    );

    // Filtered comps based on primary/all toggle
    const compMetrics = useMemo(
        () => compFilter === 'primary' ? allCompMetrics.filter(c => c.compType === 'primary') : allCompMetrics,
        [allCompMetrics, compFilter]
    );

    const primaryCount = allCompMetrics.filter(c => c.compType === 'primary').length;
    const secondaryCount = allCompMetrics.filter(c => c.compType === 'secondary').length;

    // All unique bed types across all comps
    const allBedTypes = useMemo(() => {
        const beds = new Set<number>();
        compMetrics.forEach(m => m.bedTypes.forEach(b => beds.add(b)));
        return [...beds].sort((a, b) => a - b);
    }, [compMetrics]);

    const linkedHdIds = new Set(rentComps.map(rc => rc.property?.hellodata_id).filter((id): id is string => !!id));

    const handleToggleCompType = useCallback((propertyId: string, currentType: 'primary' | 'secondary') => {
        const newType = currentType === 'primary' ? 'secondary' : 'primary';
        updateCompType.mutate({ pursuitId, propertyId, compType: newType });
    }, [pursuitId, updateCompType]);

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        search(query);
    }, [search]);

    const [addError, setAddError] = useState<string | null>(null);

    const handleAddComp = useCallback(async (hellodataId: string) => {
        setAddingPropertyId(hellodataId);
        setAddError(null);
        try {
            console.log('[AddComp] Step 1: Fetching property data for', hellodataId);
            const result = await fetchProperty.mutateAsync({ hellodataId });
            console.log('[AddComp] Step 2: Got property result', {
                id: result.property?.id,
                hellodata_id: result.property?.hellodata_id,
                name: result.property?.building_name,
                source: result.source,
            });

            if (!result.property?.id) {
                throw new Error('Property fetch succeeded but no property ID returned');
            }

            console.log('[AddComp] Step 3: Linking to pursuit', pursuitId, 'with property_id', result.property.id);
            await linkComp.mutateAsync({ pursuitId, propertyId: result.property.id });
            console.log('[AddComp] Step 4: Link success!');

            clearResults();
            setSearchQuery('');
            setShowSearch(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[AddComp] FAILED:', message, err);
            setAddError(`Failed to add comp: ${message}`);
        } finally {
            setAddingPropertyId(null);
        }
    }, [pursuitId, fetchProperty, linkComp, clearResults]);

    const handleUnlink = useCallback(async (propertyId: string) => {
        await unlinkComp.mutateAsync({ pursuitId, propertyId });
        setUnlinkConfirmId(null);
    }, [pursuitId, unlinkComp]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
                <span className="ml-3 text-sm text-[#7A8599]">Loading rent comps...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-[#1A1F2B]">Rent Comps</h2>
                    <p className="text-xs sm:text-sm text-[#7A8599] mt-0.5 truncate">
                        {allCompMetrics.length} propert{allCompMetrics.length === 1 ? 'y' : 'ies'} tracked
                        {primaryCount > 0 && secondaryCount > 0 && (
                            <span> · {primaryCount} primary, {secondaryCount} secondary</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {/* Primary / All Filter */}
                    {secondaryCount > 0 && (
                        <div className="flex rounded-lg border border-[#E2E5EA] overflow-hidden">
                            {(['all', 'primary'] as const).map(f => (
                                <button key={f} onClick={() => setCompFilter(f)}
                                    className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium ${compFilter === f ? 'bg-[#2563EB] text-white' : 'text-[#7A8599] hover:bg-[#F4F5F7]'}`}>
                                    {f === 'all' ? `All (${allCompMetrics.length})` : `Primary (${primaryCount})`}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => setShowSearch(true)}
                        className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-medium transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Comp</span>
                        <span className="sm:hidden">Add</span>
                    </button>
                </div>
            </div>

            {/* Search Panel */}
            {showSearch && <SearchPanel
                searchQuery={searchQuery}
                onSearch={handleSearch}
                searchResults={searchResults}
                isSearching={isSearching}
                searchError={searchError}
                linkedHdIds={linkedHdIds}
                addingPropertyId={addingPropertyId}
                onAdd={handleAddComp}
                onClose={() => { setShowSearch(false); clearResults(); setSearchQuery(''); }}
            />}

            {/* Add error display */}
            {addError && (
                <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#DC2626]">
                    <span>{addError}</span>
                    <button onClick={() => setAddError(null)} className="text-[#DC2626] hover:underline text-xs ml-4">Dismiss</button>
                </div>
            )}
            {/* Empty State */}
            {compMetrics.length === 0 && !showSearch && (
                <div className="text-center py-16 border border-dashed border-[#E2E5EA] rounded-xl bg-[#FBFBFC]">
                    <Building2 className="w-10 h-10 text-[#CBD2DC] mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-[#4A5568] mb-1">No rent comps yet</h3>
                    <p className="text-xs text-[#7A8599] mb-4 max-w-xs mx-auto">
                        Search and add competitive properties to track rents, occupancy, and concessions.
                    </p>
                    <button
                        onClick={() => setShowSearch(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        <Search className="w-4 h-4" /> Search Properties
                    </button>
                </div>
            )}

            {/* Dashboard Sections — only when comps exist */}
            {compMetrics.length > 0 && (
                <>
                    {/* Section Tabs */}
                    <div className="flex items-center gap-0.5 border-b border-[#E2E5EA] overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                        {([
                            { key: 'overview' as SectionKey, label: 'Overview' },
                            { key: 'unitBreakdown' as SectionKey, label: 'Units' },
                            { key: 'rankings' as SectionKey, label: 'Rankings' },
                            { key: 'rentTrends' as SectionKey, label: 'Trends' },
                            { key: 'bubbleChart' as SectionKey, label: 'Rent/Size' },
                            { key: 'occupancy' as SectionKey, label: 'Occ.' },
                            { key: 'leasing' as SectionKey, label: 'Leasing' },
                            { key: 'rentRoll' as SectionKey, label: 'Rent Roll' },
                            { key: 'concessions' as SectionKey, label: 'Conc.' },
                            { key: 'fees' as SectionKey, label: 'Fees' },
                            { key: 'quality' as SectionKey, label: 'Quality' },
                            { key: 'amenities' as SectionKey, label: 'Amen.' },
                            { key: 'market' as SectionKey, label: 'Market' },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveSection(tab.key)}
                                className={`px-2 sm:px-3 py-2 sm:py-2.5 text-[11px] sm:text-xs font-medium transition-colors relative whitespace-nowrap shrink-0 ${activeSection === tab.key
                                    ? 'text-[#2563EB]'
                                    : 'text-[#7A8599] hover:text-[#4A5568]'
                                    }`}
                            >
                                {tab.label}
                                {activeSection === tab.key && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* SECTION: Comp Overview Grid */}
                    {activeSection === 'overview' && (
                        <CompOverviewGrid
                            comps={compMetrics}
                            onRemove={(propId) => setUnlinkConfirmId(propId)}
                            onToggleType={handleToggleCompType}
                        />
                    )}

                    {/* SECTION: Unit Breakdown */}
                    {activeSection === 'unitBreakdown' && (
                        <UnitBreakdownSection comps={compMetrics} bedTypes={allBedTypes} />
                    )}

                    {/* SECTION: Property Rankings */}
                    {activeSection === 'rankings' && (
                        <PropertyRankingsSection comps={compMetrics} bedTypes={allBedTypes} />
                    )}

                    {/* NEW SECTIONS */}
                    {activeSection === 'rentTrends' && <RentTrendsSection comps={compMetrics} />}
                    {activeSection === 'bubbleChart' && <BubbleChartSection comps={compMetrics} />}
                    {activeSection === 'occupancy' && <OccupancySection comps={compMetrics} />}
                    {activeSection === 'leasing' && <LeasingActivitySection comps={compMetrics} />}
                    {activeSection === 'rentRoll' && <RentRollSection comps={compMetrics} />}
                    {activeSection === 'concessions' && <ConcessionsSection comps={compMetrics} />}
                    {activeSection === 'fees' && <FeesSection comps={compMetrics} />}
                    {activeSection === 'quality' && <QualitySection comps={compMetrics} />}
                    {activeSection === 'market' && <MarketContextSection comps={compMetrics} />}

                    {/* SECTION: Amenities */}
                    {activeSection === 'amenities' && (
                        <AmenitiesGrid comps={compMetrics} />
                    )}

                    <p className="text-[11px] text-[#A0AABB] text-center">
                        Data refreshed weekly for active pursuits · Cache TTL: {HELLODATA_CACHE_TTL_DAYS} days · Source: HelloData
                    </p>
                </>
            )}

            {/* Unlink Confirmation */}
            {unlinkConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in mx-4">
                        <h2 className="text-lg font-semibold text-[#1A1F2B] mb-2">Remove Comp</h2>
                        <p className="text-sm text-[#7A8599] mb-6">
                            Remove this property from this pursuit&apos;s comp set?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setUnlinkConfirmId(null)} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:bg-[#F4F5F7]">Cancel</button>
                            <button
                                onClick={() => handleUnlink(unlinkConfirmId)}
                                disabled={unlinkComp.isPending}
                                className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-medium"
                            >
                                {unlinkComp.isPending ? 'Removing...' : 'Remove'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// Search Panel
// ============================================================
function SearchPanel({
    searchQuery, onSearch, searchResults, isSearching, searchError, linkedHdIds, addingPropertyId, onAdd, onClose,
}: {
    searchQuery: string;
    onSearch: (q: string) => void;
    searchResults: HellodataSearchResult[];
    isSearching: boolean;
    searchError: string | null;
    linkedHdIds: Set<string>;
    addingPropertyId: string | null;
    onAdd: (id: string) => void;
    onClose: () => void;
}) {
    return (
        <div className="border border-[#E2E5EA] rounded-xl bg-white p-4 shadow-sm animate-fade-in">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#1A1F2B]">Search HelloData Properties</h3>
                <button onClick={onClose} className="p-1 rounded hover:bg-[#F4F5F7] text-[#7A8599]"><X className="w-4 h-4" /></button>
            </div>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => onSearch(e.target.value)}
                    placeholder="Search by property name, address, city, or zip..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#F9FAFB] border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                    autoFocus
                />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[#2563EB]" />}
            </div>
            {searchError && <p className="mt-2 text-xs text-[#DC2626]">{searchError}</p>}
            {searchResults.length > 0 && (
                <div className="mt-3 max-h-80 overflow-y-auto space-y-1">
                    {searchResults.map(r => {
                        const isLinked = linkedHdIds.has(r.id);
                        const isAdding = addingPropertyId === r.id;
                        return (
                            <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#F4F5F7]">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#1A1F2B] truncate">{r.building_name || r.street_address}</p>
                                    <p className="text-xs text-[#7A8599] truncate">
                                        {r.street_address}, {r.city}, {r.state} {r.zip_code}
                                        {r.year_built ? ` · ${r.year_built}` : ''}
                                        {r.number_units ? ` · ${r.number_units} units` : ''}
                                    </p>
                                </div>
                                {isLinked ? (
                                    <span className="ml-3 text-xs text-[#10B981] font-medium px-2 py-1 bg-[#ECFDF5] rounded-full shrink-0">Added</span>
                                ) : (
                                    <button onClick={() => onAdd(r.id)} disabled={isAdding} className="ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EBF1FF] text-[#2563EB] text-xs font-medium hover:bg-[#DBEAFE] disabled:opacity-50 shrink-0">
                                        {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                        {isAdding ? 'Adding...' : 'Add'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && !searchError && (
                <p className="mt-3 text-sm text-[#7A8599] text-center py-4">No properties found</p>
            )}
        </div>
    );
}

// ============================================================
// SECTION 1: Comp Overview Grid (Hellodata-style side-by-side)
// ============================================================

function CompOverviewGrid({ comps, onRemove, onToggleType }: { comps: PropertyMetrics[]; onRemove: (id: string) => void; onToggleType: (propertyId: string, currentType: 'primary' | 'secondary') => void }) {
    // Comp average row
    const compAvg = useMemo(() => {
        const avg = (vals: (number | null)[]) => {
            const valid = vals.filter((v): v is number => v !== null);
            return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
        };
        return {
            avgEffRent: avg(comps.map(c => c.avgEffRent)),
            avgAskRent: avg(comps.map(c => c.avgAskRent)),
            avgSqft: avg(comps.map(c => c.avgSqft)),
            avgEffPsf: avg(comps.map(c => c.avgEffPsf)),
            avgAskPsf: avg(comps.map(c => c.avgAskPsf)),
            leasedPct: avg(comps.map(c => c.leasedPct)),
            avgConcession: avg(comps.map(c => c.avgConcession)),
            concessionPct: avg(comps.map(c => c.concessionPct)),
            avgDaysOnMarket: avg(comps.map(c => c.avgDaysOnMarket)),
            avgDaysVacant: avg(comps.map(c => c.avgDaysVacant)),
            totalUnits: comps.reduce((s, c) => s + (c.property.number_units ?? 0), 0),
            yearBuilt: avg(comps.map(c => c.property.year_built)),
            vacancies: Math.round(comps.reduce((s, c) => s + c.vacancies, 0) / comps.length),
        };
    }, [comps]);

    type Row = {
        label: string;
        avgValue: string;
        values: (compIndex: number) => string;
        bold?: boolean;
        multiline?: boolean;
    };

    const rows: Row[] = [
        { label: 'Management Company', avgValue: '—', values: (i) => comps[i].property.management_company || '—' },
        { label: 'Year Built', avgValue: compAvg.yearBuilt ? Math.round(compAvg.yearBuilt).toString() : '—', values: (i) => comps[i].property.year_built?.toString() || '—' },
        { label: '# Units', avgValue: fmtNum(compAvg.totalUnits / comps.length), values: (i) => fmtNum(comps[i].property.number_units) },
        { label: 'Leased %', avgValue: fmtPct(compAvg.leasedPct), values: (i) => fmtPct(comps[i].leasedPct) },
        { label: 'Quality', avgValue: '—', values: (i) => comps[i].qualityLabel },
        { label: 'Reviews', avgValue: '—', values: (i) => comps[i].reviewScore },
        { label: 'Pricing Strategy', avgValue: '—', values: (i) => comps[i].pricingStrategy, multiline: true },
        { label: '# Vacancies', avgValue: `${compAvg.vacancies} vacancies`, values: (i) => `${comps[i].vacancies} vacancies` },
        { label: 'Days on Market', avgValue: compAvg.avgDaysOnMarket !== null ? `${Math.round(compAvg.avgDaysOnMarket)} days` : '—', values: (i) => comps[i].avgDaysOnMarket !== null ? `${Math.round(comps[i].avgDaysOnMarket!)} days` : '—' },
        { label: 'Days Vacant', avgValue: compAvg.avgDaysVacant !== null ? `${Math.round(compAvg.avgDaysVacant)} days` : '—', values: (i) => comps[i].avgDaysVacant !== null ? `${Math.round(comps[i].avgDaysVacant!)} days` : '—' },
        { label: 'Rent', avgValue: fmtCur(compAvg.avgAskRent), values: (i) => fmtCur(comps[i].avgAskRent), bold: true },
        { label: 'Average Sqft', avgValue: fmtNum(compAvg.avgSqft, 0), values: (i) => `${fmtNum(comps[i].avgSqft, 0)} ft²` },
        { label: 'NER', avgValue: `${fmtCur(compAvg.avgEffRent)} NER`, values: (i) => `${fmtCur(comps[i].avgEffRent)} NER`, bold: true },
        { label: 'Rent/ft²', avgValue: fmtCur(compAvg.avgAskPsf, 2), values: (i) => `${fmtCur(comps[i].avgAskPsf, 2)}/ft²` },
        { label: 'NER/ft²', avgValue: fmtCur(compAvg.avgEffPsf, 2), values: (i) => `${fmtCur(comps[i].avgEffPsf, 2)}/ft²`, bold: true },
        { label: 'Concession %', avgValue: compAvg.concessionPct !== null ? `${compAvg.concessionPct.toFixed(1)}%` : '—', values: (i) => comps[i].concessionPct !== null ? `${comps[i].concessionPct!.toFixed(1)}%` : '0.0%' },
        { label: 'Concession Amount', avgValue: fmtCur(compAvg.avgConcession), values: (i) => fmtCur(comps[i].avgConcession) },
        { label: 'Concessions', avgValue: '—', values: (i) => comps[i].concessionText, multiline: true },
    ];

    return (
        <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
            <table className="w-full text-xs min-w-[600px]">
                <thead>
                    <tr className="border-b-2 border-[#E2E5EA] bg-[#F9FAFB]">
                        <th className="text-left py-3 px-4 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[140px]"></th>
                        <th className="text-center py-3 px-3 font-semibold text-[#7A8599] min-w-[100px]">
                            <div className="text-[10px] uppercase tracking-wider">Comp Avg</div>
                            <div className="text-[10px] text-[#A0AABB]">{comps.length} Properties</div>
                        </th>
                        {comps.map((c, i) => (
                            <th key={i} className="text-center py-3 px-3 min-w-[140px]">
                                <div className="text-sm font-semibold text-[#2563EB] truncate">{c.name}</div>
                                <div className="text-[10px] text-[#7A8599] truncate">{c.property.street_address}</div>
                                <div className="flex items-center justify-center gap-2 mt-1">
                                    <button
                                        onClick={() => onToggleType(c.propertyId, c.compType)}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${c.compType === 'primary'
                                            ? 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'
                                            : 'bg-[#F4F5F7] text-[#7A8599] hover:bg-[#E2E5EA]'
                                            }`}
                                        title={`Click to switch to ${c.compType === 'primary' ? 'secondary' : 'primary'}`}
                                    >
                                        {c.compType === 'primary' && <Star className="w-2.5 h-2.5" />}
                                        {c.compType === 'primary' ? 'Primary' : 'Secondary'}
                                    </button>
                                    <button
                                        onClick={() => onRemove(c.property.id)}
                                        className="text-[10px] text-[#DC2626] hover:underline"
                                    >
                                        remove
                                    </button>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, ri) => (
                        <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                            <td className="py-2.5 px-4 font-medium text-[#4A5568] sticky left-0 bg-inherit z-10">{row.label}</td>
                            <td className={`py-2.5 px-3 text-center text-[#7A8599] ${row.bold ? 'font-semibold' : ''} ${row.multiline ? 'text-left max-w-[180px]' : ''}`}>
                                {row.multiline ? <span className="line-clamp-3 text-[11px]">{row.avgValue}</span> : row.avgValue}
                            </td>
                            {comps.map((_, ci) => (
                                <td key={ci} className={`py-2.5 px-3 text-center text-[#1A1F2B] ${row.bold ? 'font-semibold' : ''} ${row.multiline ? 'text-left max-w-[180px]' : ''}`}>
                                    {row.multiline
                                        ? <span className="line-clamp-3 text-[11px]">{row.values(ci)}</span>
                                        : row.values(ci).split('\n').map((line, li) => <div key={li}>{line}</div>)
                                    }
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ============================================================
// SECTION 2: Unit Breakdown — per bedroom type
// ============================================================

function UnitBreakdownSection({ comps, bedTypes }: { comps: PropertyMetrics[]; bedTypes: number[] }) {
    const [expandedBed, setExpandedBed] = useState<number | null>(bedTypes[0] ?? null);

    return (
        <div className="space-y-4">
            {/* Summary Cards (Hellodata trailing 1-month style) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {bedTypes.map(bed => {
                    const allUnits = comps.flatMap(c => c.units.filter(u => u.bed === bed));
                    const avgSqft = getAverageSqft(allUnits);
                    const askRent = getAverageAskingRent(allUnits);
                    const effRent = getAverageEffectiveRent(allUnits);
                    const askPsf = getAverageAskingPsf(allUnits);
                    const effPsf = getAverageEffectivePsf(allUnits);
                    const avgDom = allUnits.filter(u => u.days_on_market !== null).length
                        ? allUnits.reduce((s, u) => s + (u.days_on_market ?? 0), 0) / allUnits.filter(u => u.days_on_market !== null).length
                        : null;

                    return (
                        <div key={bed} className="rounded-xl border border-[#E2E5EA] bg-white overflow-hidden">
                            <div className="h-1" style={{ backgroundColor: bedColor(bed) }} />
                            <div className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold text-[#1A1F2B]">{bedLabel(bed)}</h4>
                                    <span className="text-[10px] text-[#A0AABB]">Trailing 1 Month</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between"><span className="text-[#7A8599]"># Listings</span><span className="font-medium text-[#1A1F2B]">{allUnits.length}</span></div>
                                    <div className="flex justify-between"><span className="text-[#7A8599]">Days on Market</span><span className="font-medium text-[#1A1F2B]">{avgDom !== null ? Math.round(avgDom) : '—'}</span></div>
                                    <div className="flex justify-between"><span className="text-[#7A8599]">Avg Sqft</span><span className="font-medium text-[#1A1F2B]">{fmtNum(avgSqft)} ft²</span></div>
                                    <div className="flex justify-between"><span className="text-[#7A8599]">Asking Rent / PSF</span><span className="font-medium text-[#1A1F2B]">{fmtCur(askRent)} / {fmtCur(askPsf, 2)}</span></div>
                                    <div className="flex justify-between"><span className="text-[#7A8599]">Effective Rent / PSF</span><span className="font-medium text-[#1A1F2B]">{fmtCur(effRent)} / {fmtCur(effPsf, 2)}</span></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Detailed per-bed comparison grid */}
            {bedTypes.map(bed => (
                <div key={bed} className="border border-[#E2E5EA] rounded-xl overflow-hidden">
                    <button
                        onClick={() => setExpandedBed(expandedBed === bed ? null : bed)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-[#F9FAFB] hover:bg-[#F4F5F7] transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bedColor(bed) }} />
                            <h4 className="text-sm font-semibold text-[#1A1F2B]">{bedLabel(bed)}</h4>
                        </div>
                        {expandedBed === bed ? <ChevronUp className="w-4 h-4 text-[#7A8599]" /> : <ChevronDown className="w-4 h-4 text-[#7A8599]" />}
                    </button>
                    {expandedBed === bed && (
                        <div className="overflow-x-auto">
                            <BedTypeGrid comps={comps} bed={bed} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function BedTypeGrid({ comps, bed }: { comps: PropertyMetrics[]; bed: number }) {
    // Per-comp metrics for this bed type
    const perComp = comps.map(c => {
        const bedUnits = c.units.filter(u => u.bed === bed);
        return {
            name: c.name,
            count: bedUnits.length,
            askRent: getAverageAskingRent(bedUnits),
            effRent: getAverageEffectiveRent(bedUnits),
            avgSqft: getAverageSqft(bedUnits),
            askPsf: getAverageAskingPsf(bedUnits),
            effPsf: getAverageEffectivePsf(bedUnits),
            concessionPct: (() => {
                const ask = getAverageAskingRent(bedUnits);
                const eff = getAverageEffectiveRent(bedUnits);
                if (ask && eff && ask > 0) return ((ask - eff) / ask) * 100;
                return null;
            })(),
        };
    });

    // Comp average
    const avg = (vals: (number | null)[]) => {
        const v = vals.filter((x): x is number => x !== null);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const compAvg = {
        count: Math.round(perComp.reduce((s, c) => s + c.count, 0) / perComp.length),
        askRent: avg(perComp.map(c => c.askRent)),
        effRent: avg(perComp.map(c => c.effRent)),
        avgSqft: avg(perComp.map(c => c.avgSqft)),
        askPsf: avg(perComp.map(c => c.askPsf)),
        effPsf: avg(perComp.map(c => c.effPsf)),
        concessionPct: avg(perComp.map(c => c.concessionPct)),
    };

    type Row = { label: string; avgValue: string; values: string[]; bold?: boolean };
    const rows: Row[] = [
        { label: 'Available Units', avgValue: `${compAvg.count} units`, values: perComp.map(c => `${c.count} units`) },
        { label: 'Rent', avgValue: fmtCur(compAvg.askRent), values: perComp.map(c => fmtCur(c.askRent)) },
        { label: 'Average Sqft', avgValue: `${fmtNum(compAvg.avgSqft)} ft²`, values: perComp.map(c => `${fmtNum(c.avgSqft)} ft²`) },
        { label: 'NER', avgValue: `${fmtCur(compAvg.effRent)} NER`, values: perComp.map(c => `${fmtCur(c.effRent)} NER`), bold: true },
        { label: 'Rent/ft²', avgValue: `${fmtCur(compAvg.askPsf, 2)}/ft²`, values: perComp.map(c => `${fmtCur(c.askPsf, 2)}/ft²`) },
        { label: 'NER/ft²', avgValue: `${fmtCur(compAvg.effPsf, 2)}/ft²`, values: perComp.map(c => `${fmtCur(c.effPsf, 2)}/ft²`), bold: true },
        { label: 'Concession %', avgValue: fmtPct(compAvg.concessionPct), values: perComp.map(c => fmtPct(c.concessionPct)) },
    ];

    return (
        <table className="w-full text-xs min-w-[500px]">
            <thead>
                <tr className="border-b border-[#E2E5EA] bg-[#FBFBFC]">
                    <th className="text-left py-2 px-4 font-semibold text-[#7A8599] min-w-[120px]">{bedLabel(bed)}</th>
                    <th className="text-center py-2 px-3 font-semibold text-[#7A8599] min-w-[90px]">Comp Avg</th>
                    {perComp.map((c, i) => (
                        <th key={i} className="text-center py-2 px-3 font-semibold text-[#1A1F2B] min-w-[110px] truncate">{c.name}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, ri) => (
                    <tr key={ri} className={`border-b border-[#F4F5F7] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                        <td className="py-2 px-4 font-medium text-[#4A5568]">{row.label}</td>
                        <td className={`py-2 px-3 text-center text-[#7A8599] ${row.bold ? 'font-semibold' : ''}`}>{row.avgValue}</td>
                        {row.values.map((v, vi) => (
                            <td key={vi} className={`py-2 px-3 text-center text-[#1A1F2B] ${row.bold ? 'font-semibold' : ''}`}>{v}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ============================================================
// SECTION 3: Property Rankings (horizontal bar charts)
// ============================================================

function PropertyRankingsSection({ comps, bedTypes }: { comps: PropertyMetrics[]; bedTypes: number[] }) {
    const [metric, setMetric] = useState<'asking' | 'effective'>('asking');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">Property Rankings</h3>
                    <p className="text-xs text-[#7A8599]">Compare rents by bedroom count across your comp set.</p>
                </div>
                <select
                    value={metric}
                    onChange={e => setMetric(e.target.value as 'asking' | 'effective')}
                    className="text-xs border border-[#E2E5EA] rounded-lg px-3 py-1.5 text-[#4A5568] bg-white"
                >
                    <option value="asking">Asking Rent</option>
                    <option value="effective">Effective Rent</option>
                </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {bedTypes.map(bed => (
                    <RankingColumn key={bed} comps={comps} bed={bed} metric={metric} />
                ))}
            </div>
        </div>
    );
}

function RankingColumn({ comps, bed, metric }: { comps: PropertyMetrics[]; bed: number; metric: 'asking' | 'effective' }) {
    // Compute per-property average rent for this bed type
    const rankings = comps
        .map(c => {
            const bedUnits = c.units.filter(u => u.bed === bed);
            const rent = metric === 'asking' ? getAverageAskingRent(bedUnits) : getAverageEffectiveRent(bedUnits);
            return { name: c.name, rent };
        })
        .filter(r => r.rent !== null)
        .sort((a, b) => (b.rent ?? 0) - (a.rent ?? 0)) as { name: string; rent: number }[];

    const maxRent = rankings.length ? rankings[0].rent : 0;

    return (
        <div className="border border-[#E2E5EA] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b" style={{ borderBottomColor: bedColor(bed) }}>
                <div className="h-1 rounded-full mb-2" style={{ backgroundColor: bedColor(bed) }} />
                <h4 className="text-sm font-semibold text-[#1A1F2B]">{bedLabel(bed)}</h4>
            </div>
            <div className="p-3 space-y-2">
                {rankings.length === 0 && (
                    <p className="text-xs text-[#7A8599] text-center py-4">No data</p>
                )}
                {rankings.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-[#4A5568] truncate w-24 shrink-0" title={r.name}>{r.name}</span>
                        <div className="flex-1 h-4 bg-[#F4F5F7] rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all"
                                style={{
                                    width: `${maxRent > 0 ? (r.rent / maxRent) * 100 : 0}%`,
                                    backgroundColor: bedColor(bed),
                                    opacity: 0.7 + (i === 0 ? 0.3 : 0),
                                }}
                            />
                        </div>
                        <span className="text-xs font-medium text-[#1A1F2B] w-16 text-right shrink-0">{fmtCur(r.rent)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================
// SECTION 4: Amenities Comparison Grid
// ============================================================

function AmenitiesGrid({ comps }: { comps: PropertyMetrics[] }) {
    const [type, setType] = useState<'building' | 'unit'>('building');

    // Collect all unique amenities across all properties
    const allAmenities = useMemo(() => {
        const set = new Set<string>();
        comps.forEach(c => {
            const list = type === 'building' ? c.property.building_amenities : c.property.unit_amenities;
            list.forEach(a => set.add(a));
        });
        return [...set].sort();
    }, [comps, type]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#1A1F2B]">
                        {type === 'building' ? 'Building' : 'Unit'} Amenities
                    </h3>
                    <p className="text-xs text-[#7A8599]">Benchmark amenities against competitors.</p>
                </div>
                <select
                    value={type}
                    onChange={e => setType(e.target.value as 'building' | 'unit')}
                    className="text-xs border border-[#E2E5EA] rounded-lg px-3 py-1.5 text-[#4A5568] bg-white"
                >
                    <option value="building">Building Amenities</option>
                    <option value="unit">Unit Amenities</option>
                </select>
            </div>
            {allAmenities.length === 0 ? (
                <p className="text-sm text-[#7A8599] text-center py-8">No amenity data available</p>
            ) : (
                <div className="overflow-x-auto border border-[#E2E5EA] rounded-xl">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-[#E2E5EA] bg-[#F9FAFB]">
                                <th className="text-left py-2.5 px-4 font-semibold text-[#4A5568] sticky left-0 bg-[#F9FAFB] z-10 min-w-[140px]">
                                    {type === 'building' ? 'Building' : 'Unit'} Amenities
                                </th>
                                {allAmenities.map(a => (
                                    <th key={a} className="text-center py-2.5 px-2 font-medium text-[#7A8599] min-w-[80px] max-w-[120px]">
                                        <span className="block truncate text-[10px]">{a}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {comps.map((c, i) => {
                                const amenities = type === 'building' ? c.property.building_amenities : c.property.unit_amenities;
                                return (
                                    <tr key={i} className={`border-b border-[#F4F5F7] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFC]'}`}>
                                        <td className="py-2 px-4 font-medium text-[#2563EB] sticky left-0 bg-inherit z-10 truncate">{c.name}</td>
                                        {allAmenities.map(a => (
                                            <td key={a} className="py-2 px-2 text-center">
                                                {amenities.includes(a) ? (
                                                    <Check className="w-4 h-4 text-[#22C55E] mx-auto" />
                                                ) : null}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
