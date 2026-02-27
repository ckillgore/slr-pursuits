'use client';

import { TrendingUp, TrendingDown, Home, Users, DollarSign, Activity } from 'lucide-react';
import type { Pursuit } from '@/types';

interface GrowthTrendsCardProps {
    pursuit: Pursuit;
}

function fmtPct(val: unknown, dec = 2): string {
    if (val == null || typeof val !== 'number') return '—';
    return `${val >= 0 ? '+' : ''}${val.toFixed(dec)}%`;
}

function fmtCurr(val: unknown): string {
    if (val == null || typeof val !== 'number' || val < -999999) return '—';
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmt(val: unknown, dec = 0): string {
    if (val == null || typeof val !== 'number') return '—';
    return val.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}


/** Color for CAGR values: green for positive, red for negative, gray for zero/null */
function cagrColor(val: unknown): string {
    if (val == null || typeof val !== 'number') return 'text-[#A0AABB]';
    if (val > 0) return 'text-[#0D7A3E]';
    if (val < 0) return 'text-[#DC2626]';
    return 'text-[#7A8599]';
}

function CagrIcon({ val }: { val: unknown }) {
    if (val == null || typeof val !== 'number' || val === 0) return null;
    return val > 0
        ? <TrendingUp className="w-3 h-3 text-[#0D7A3E]" />
        : <TrendingDown className="w-3 h-3 text-[#DC2626]" />;
}

/** HAI color: green >100 (affordable), amber 80-100, red <80 */
function haiColor(val: unknown): string {
    if (val == null || typeof val !== 'number') return 'text-[#A0AABB]';
    if (val >= 100) return 'text-[#0D7A3E]';
    if (val >= 80) return 'text-[#D97706]';
    return 'text-[#DC2626]';
}

function haiLabel(val: unknown): string {
    if (val == null || typeof val !== 'number') return '';
    if (val >= 120) return 'Very Affordable';
    if (val >= 100) return 'Affordable';
    if (val >= 80) return 'Moderate';
    return 'Cost-Burdened';
}

export function GrowthTrendsCard({ pursuit }: GrowthTrendsCardProps) {
    const parcel = (pursuit.parcel_data as any)?.parcel;
    if (!parcel) return null;

    const d = parcel.details || {};

    // Check if we have any growth data at all
    const hasGrowth = [
        d.populationGrowthPast5, d.populationGrowthNext5,
        d.housingGrowthPast5, d.housingGrowthNext5,
        d.householdIncomeGrowthNext5, d.housingAffordabilityIndex,
    ].some((v: any) => v != null);

    if (!hasGrowth) return null;

    return (
        <div className="card">
            <div className="flex items-center gap-1.5 mb-3">
                <Activity className="w-3.5 h-3.5 text-[#0D7A3E]" />
                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Growth Trends & Market Indicators</h3>
                <span className="text-[9px] text-[#A0AABB] ml-auto">Census Block Group · ESRI via Regrid</span>
            </div>

            {/* Growth CAGR Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                {/* Population Growth Past 5 */}
                <div className="p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Users className="w-3 h-3 text-[#7A8599]" />
                        <span className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Pop. Growth (5yr)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${cagrColor(d.populationGrowthPast5)}`}>
                            {fmtPct(d.populationGrowthPast5)}
                        </span>
                        <CagrIcon val={d.populationGrowthPast5} />
                    </div>
                    <span className="text-[9px] text-[#A0AABB]">CAGR (trailing)</span>
                </div>

                {/* Population Growth Next 5 */}
                <div className="p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Users className="w-3 h-3 text-[#7A8599]" />
                        <span className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Pop. Forecast (5yr)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${cagrColor(d.populationGrowthNext5)}`}>
                            {fmtPct(d.populationGrowthNext5)}
                        </span>
                        <CagrIcon val={d.populationGrowthNext5} />
                    </div>
                    <span className="text-[9px] text-[#A0AABB]">CAGR (projected)</span>
                </div>

                {/* Housing Growth Past 5 */}
                <div className="p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Home className="w-3 h-3 text-[#7A8599]" />
                        <span className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Housing Growth (5yr)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${cagrColor(d.housingGrowthPast5)}`}>
                            {fmtPct(d.housingGrowthPast5)}
                        </span>
                        <CagrIcon val={d.housingGrowthPast5} />
                    </div>
                    <span className="text-[9px] text-[#A0AABB]">CAGR (trailing)</span>
                </div>

                {/* Housing Growth Next 5 */}
                <div className="p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Home className="w-3 h-3 text-[#7A8599]" />
                        <span className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Housing Forecast (5yr)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${cagrColor(d.housingGrowthNext5)}`}>
                            {fmtPct(d.housingGrowthNext5)}
                        </span>
                        <CagrIcon val={d.housingGrowthNext5} />
                    </div>
                    <span className="text-[9px] text-[#A0AABB]">CAGR (projected)</span>
                </div>

                {/* Income Growth Next 5 */}
                <div className="p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                    <div className="flex items-center gap-1.5 mb-1">
                        <DollarSign className="w-3 h-3 text-[#7A8599]" />
                        <span className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Income Forecast (5yr)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${cagrColor(d.householdIncomeGrowthNext5)}`}>
                            {fmtPct(d.householdIncomeGrowthNext5)}
                        </span>
                        <CagrIcon val={d.householdIncomeGrowthNext5} />
                    </div>
                    <span className="text-[9px] text-[#A0AABB]">Median HH Income CAGR</span>
                </div>

                {/* Housing Affordability Index */}
                <div className="p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Activity className="w-3 h-3 text-[#7A8599]" />
                        <span className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Affordability Index</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${haiColor(d.housingAffordabilityIndex)}`}>
                            {fmt(d.housingAffordabilityIndex, 0)}
                        </span>
                        {d.housingAffordabilityIndex != null && (
                            <span className={`text-[10px] font-medium ${haiColor(d.housingAffordabilityIndex)}`}>
                                {haiLabel(d.housingAffordabilityIndex)}
                            </span>
                        )}
                    </div>
                    <span className="text-[9px] text-[#A0AABB]">100 = balanced · &gt;100 = affordable</span>
                </div>
            </div>

            {/* Contextual row: Pop density + median income from Regrid block group */}
            {(d.populationDensity != null || d.medianHouseholdIncome != null) && (
                <div className="flex items-center gap-6 px-1">
                    {d.populationDensity != null && (
                        <div className="text-xs text-[#4A5568]">
                            <span className="text-[#A0AABB]">Pop. Density:</span>{' '}
                            <span className="font-semibold">{fmt(d.populationDensity, 0)}</span>
                            <span className="text-[#A0AABB]"> /sq mi</span>
                        </div>
                    )}
                    {d.medianHouseholdIncome != null && (
                        <div className="text-xs text-[#4A5568]">
                            <span className="text-[#A0AABB]">Median HH Income:</span>{' '}
                            <span className="font-semibold">{fmtCurr(d.medianHouseholdIncome)}</span>
                            <span className="text-[#A0AABB]"> (block group)</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
