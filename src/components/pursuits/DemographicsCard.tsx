'use client';

import { useState } from 'react';
import { RefreshCw, Users, DollarSign, Home, Loader2, AlertCircle } from 'lucide-react';
import type { Pursuit } from '@/types';

interface DemographicsCardProps {
    pursuit: Pursuit;
    onUpdate: (updates: Partial<Pursuit>) => void;
}

function fmt(val: unknown, dec = 0): string {
    if (val == null || typeof val !== 'number' || val < -999999) return '—';
    return val.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCurr(val: unknown): string {
    if (val == null || typeof val !== 'number' || val < -999999) return '—';
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(val: unknown, dec = 1): string {
    if (val == null || typeof val !== 'number') return '—';
    return `${val.toFixed(dec)}%`;
}

type TabId = 'rings' | 'block_group';

export function DemographicsCard({ pursuit, onUpdate }: DemographicsCardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('rings');

    const d = (pursuit.demographics as Record<string, any>) || null;
    const hasLocation = pursuit.latitude != null && pursuit.longitude != null;
    const rings = d?.rings || null;
    const bg = d?.block_group || null;
    const hasRings = rings && Object.keys(rings).length > 0;
    const hasBg = bg && Object.keys(bg).some((k: string) => !k.startsWith('_') && bg[k] != null);
    const hasData = hasRings || hasBg;

    // Auto-select the tab that has data
    const effectiveTab = activeTab === 'rings' && !hasRings && hasBg ? 'block_group' : activeTab;

    const handleRefresh = async () => {
        if (!hasLocation && !pursuit.address) {
            setError('Set a location or address first');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const body: Record<string, any> = {};
            if (hasLocation) {
                body.latitude = pursuit.latitude;
                body.longitude = pursuit.longitude;
            } else {
                body.address = [pursuit.address, pursuit.city, pursuit.state, pursuit.zip].filter(Boolean).join(', ');
            }

            const res = await fetch('/api/demographics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch demographics');
            }

            onUpdate({
                demographics: data.demographics,
                demographics_updated_at: new Date().toISOString(),
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }

        setIsLoading(false);
    };

    const lastUpdated = pursuit.demographics_updated_at
        ? new Date(pursuit.demographics_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : null;

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Demographics</h3>
                <div className="flex items-center gap-2">
                    {lastUpdated && (
                        <span className="text-[10px] text-[#A0AABB]">Updated {lastUpdated}</span>
                    )}
                    <button
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-[#2563EB] hover:bg-[#EBF1FF] disabled:opacity-50 transition-colors"
                        title="Refresh demographics"
                    >
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {hasData ? 'Refresh' : 'Load'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-xs text-[#DC2626] mb-3 px-2 py-1.5 rounded-md bg-[#FEF2F2]">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {error}
                </div>
            )}

            {!hasData && !isLoading && !error && (
                <div className="text-center py-6">
                    <Users className="w-6 h-6 text-[#C8CDD5] mx-auto mb-2" />
                    <p className="text-xs text-[#A0AABB]">
                        {hasLocation || pursuit.address ? 'Click "Load" to pull demographics for this location.' : 'Set a location first, then load demographics.'}
                    </p>
                </div>
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-8 gap-2 text-sm text-[#7A8599]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching demographics...
                </div>
            )}

            {hasData && !isLoading && (
                <>
                    {/* Tabs */}
                    {(hasRings || hasBg) && (
                        <div className="flex items-center gap-1 mb-3 border-b border-[#F0F1F4]">
                            {hasRings && (
                                <button
                                    onClick={() => setActiveTab('rings')}
                                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${effectiveTab === 'rings' ? 'border-[#2563EB] text-[#2563EB]' : 'border-transparent text-[#7A8599] hover:text-[#4A5568]'}`}
                                >
                                    Trade Area (1/3/5 mi)
                                </button>
                            )}
                            {hasBg && (
                                <button
                                    onClick={() => setActiveTab('block_group')}
                                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${effectiveTab === 'block_group' ? 'border-[#2563EB] text-[#2563EB]' : 'border-transparent text-[#7A8599] hover:text-[#4A5568]'}`}
                                >
                                    Census Tract
                                </button>
                            )}
                        </div>
                    )}

                    {effectiveTab === 'rings' && hasRings && <RingTable rings={rings} />}

                    {effectiveTab === 'block_group' && hasBg && <BlockGroupView data={bg} />}
                </>
            )}
        </div>
    );
}

// =============== Ring Table ===============

function RingTable({ rings }: { rings: Record<string, any> }) {
    const radii = ['1mi', '3mi', '5mi'];
    const available = radii.filter((r) => rings[r]);
    if (available.length === 0) return null;

    const rows: { label: string; format: (v: any) => string; key: string; highlight?: boolean }[] = [
        { label: 'Population', format: fmt, key: 'population', highlight: true },
        { label: 'Households', format: fmt, key: 'total_households' },
        { label: 'Avg HH Size', format: (v) => fmt(v, 2), key: 'avg_household_size' },
        { label: 'Pop. Density (sq mi)', format: (v) => fmt(v, 1), key: 'population_density' },
        { label: 'Median HH Income', format: fmtCurr, key: 'median_household_income', highlight: true },
        { label: 'Avg HH Income', format: fmtCurr, key: 'avg_household_income' },
        { label: 'Per Capita Income', format: fmtCurr, key: 'per_capita_income' },
        { label: 'Median Age', format: (v) => fmt(v, 1), key: 'median_age' },
        { label: 'Housing Units', format: fmt, key: 'total_housing_units' },
        { label: 'Renter Occupied', format: fmtPct, key: 'renter_pct', highlight: true },
        { label: 'Owner Occupied', format: fmtPct, key: 'owner_pct' },
        { label: 'Vacancy Rate', format: fmtPct, key: 'vacancy_rate_pct' },
        { label: 'Median Home Value', format: fmtCurr, key: 'median_home_value', highlight: true },
        { label: 'Median Rent', format: fmtCurr, key: 'median_rent', highlight: true },
    ];

    return (
        <div>
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-[#E2E5EA]">
                        <th className="text-left text-[10px] font-semibold text-[#A0AABB] uppercase tracking-wider py-2 pr-3">Metric</th>
                        {available.map((r) => (
                            <th key={r} className="text-right text-[10px] font-semibold text-[#A0AABB] uppercase tracking-wider py-2 px-2 whitespace-nowrap">
                                {r.replace('mi', ' Mile')}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.key} className="border-b border-[#F0F1F4] last:border-b-0">
                            <td className={`py-1.5 pr-3 ${row.highlight ? 'font-semibold text-[#1A1F2B]' : 'text-[#4A5568]'}`}>
                                {row.label}
                            </td>
                            {available.map((r) => (
                                <td key={r} className={`py-1.5 px-2 text-right tabular-nums ${row.highlight ? 'font-semibold text-[#1A1F2B]' : 'text-[#4A5568]'}`}>
                                    {row.format(rings[r]?.[row.key])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-[10px] text-[#A0AABB] mt-2">Source: ESRI ArcGIS GeoEnrichment · US Census Bureau ACS</p>
        </div>
    );
}

// =============== Block Group View ===============

function BlockGroupView({ data }: { data: Record<string, any> }) {
    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <div>
                    <div className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider mb-1 mt-1">Population & Income</div>
                    <MetricRow icon={Users} label="Population" value={fmt(data.population)} highlight />
                    <MetricRow icon={Users} label="Median Age" value={fmt(data.median_age, 1)} />
                    <MetricRow icon={DollarSign} label="Median HH Income" value={fmtCurr(data.median_household_income)} highlight />
                    <MetricRow icon={DollarSign} label="Per Capita Income" value={fmtCurr(data.per_capita_income)} />
                    <MetricRow icon={DollarSign} label="Households" value={fmt(data.number_of_households)} />
                </div>
                <div>
                    <div className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider mb-1 mt-1">Housing</div>
                    <MetricRow icon={Home} label="Median Rent" value={fmtCurr(data.median_rent)} highlight />
                    <MetricRow icon={Home} label="Median Home Value" value={fmtCurr(data.median_home_value)} />
                    <MetricRow icon={Home} label="Renter Occupied" value={fmtPct(data.renter_occupied_pct)} highlight />
                    <MetricRow icon={Home} label="Owner Occupied" value={fmtPct(data.owner_occupied_pct)} />
                    <MetricRow icon={Home} label="Vacancy Rate" value={fmtPct(data.vacancy_rate_pct)} />
                    <MetricRow icon={Home} label="Housing Units" value={fmt(data.total_housing_units)} />
                </div>
            </div>
            {/* Race/Ethnicity */}
            <div className="mt-2 pt-2 border-t border-[#E2E5EA]">
                <div className="text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider mb-1">Race & Ethnicity</div>
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { label: 'White', value: fmtPct(data.race_white_pct) },
                        { label: 'Black', value: fmtPct(data.race_black_pct) },
                        { label: 'Hispanic', value: fmtPct(data.race_hispanic_pct) },
                        { label: 'Asian', value: fmtPct(data.race_asian_pct) },
                    ].map((item) => (
                        <div key={item.label} className="text-center">
                            <div className="text-sm font-semibold text-[#1A1F2B] tabular-nums">{item.value}</div>
                            <div className="text-[10px] text-[#A0AABB]">{item.label}</div>
                        </div>
                    ))}
                </div>
            </div>
            {data._formatted_address && (
                <p className="text-[10px] text-[#A0AABB] mt-2">
                    Census {data._geography || 'block group'} · {data._formatted_address}
                    {data._survey_years ? ` · ACS ${data._survey_years}` : ''}
                </p>
            )}
        </div>
    );
}

function MetricRow({ icon: Icon, label, value, highlight }: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`flex items-center justify-between py-2 border-b border-[#F0F1F4] last:border-b-0 ${highlight ? 'bg-[#FAFBFE]' : ''}`}>
            <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 ${highlight ? 'text-[#2563EB]' : 'text-[#A0AABB]'}`} />
                <span className="text-xs text-[#4A5568]">{label}</span>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${highlight ? 'text-[#2563EB]' : 'text-[#1A1F2B]'}`}>{value}</span>
        </div>
    );
}
