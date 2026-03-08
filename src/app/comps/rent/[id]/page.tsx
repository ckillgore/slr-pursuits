'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { useHellodataPropertyDetail, usePursuitsForProperty, useLinkRentComp, hellodataKeys } from '@/hooks/useHellodataQueries';
import { usePursuits } from '@/hooks/useSupabaseQueries';
import { useQueryClient } from '@tanstack/react-query';
import {
    ChevronLeft, Loader2, Building2, MapPin, Calendar, ExternalLink,
    Star, Users, Wifi, Home, TrendingUp, RefreshCw, Link2, Check,
    ChevronDown, DollarSign, Clock, Filter,
} from 'lucide-react';
import { RentTrendsSection } from '@/components/pursuits/rent-comps/RentCompSections';
import type { HellodataUnit, HellodataProperty } from '@/types';


const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function fmtCurrency(val: number | null | undefined) {
    if (val == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

// ════════════════════════════════════════════════════════════
// Property Map
// ════════════════════════════════════════════════════════════

function PropertyMap({ lat, lon, name }: { lat: number; lon: number; name: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);

    useEffect(() => {
        if (!MAPBOX_TOKEN || !containerRef.current) return;
        import('mapbox-gl').then((mapboxgl) => {
            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;
            if (containerRef.current) containerRef.current.innerHTML = '';
            const map = new mbgl.Map({
                container: containerRef.current!,
                style: 'mapbox://styles/mapbox/light-v11',
                center: [lon, lat],
                zoom: 14,
                interactive: true,
            });
            map.addControl(new mbgl.NavigationControl({ showCompass: false }), 'top-right');
            new mbgl.Marker({ color: '#2563EB' }).setLngLat([lon, lat]).addTo(map);
            mapRef.current = map;
        });
        return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lat, lon]);

    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden" style={{ height: 280 }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Overview Tab
// ════════════════════════════════════════════════════════════

function OverviewTab({ property }: { property: HellodataProperty }) {
    const occupancy = useMemo(() => {
        if (!property.occupancy_over_time || !Array.isArray(property.occupancy_over_time) || property.occupancy_over_time.length === 0) return null;
        const latest = property.occupancy_over_time[property.occupancy_over_time.length - 1];
        return latest?.leased != null ? Math.round(latest.leased * 100) : null;
    }, [property.occupancy_over_time]);

    const buildingFlags = useMemo(() => {
        const flags: string[] = [];
        if (property.is_apartment) flags.push('Apartment');
        if (property.is_condo) flags.push('Condo');
        if (property.is_single_family) flags.push('Single Family');
        if (property.is_senior) flags.push('Senior Living');
        if (property.is_student) flags.push('Student Housing');
        if (property.is_build_to_rent) flags.push('Build-to-Rent');
        if (property.is_affordable) flags.push('Affordable');
        if (property.is_lease_up) flags.push('Lease-Up');
        return flags;
    }, [property]);

    const qualityScores = property.building_quality ? Object.entries(property.building_quality) : [];
    const fees = property.fees ? Object.entries(property.fees).filter(([, v]) => v != null && v !== '') : [];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Property Facts */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Property Facts</h3>
                <div className="space-y-3">
                    {[
                        { label: 'Total Units', value: property.number_units },
                        { label: 'Year Built', value: property.year_built },
                        { label: 'Stories', value: property.number_stories },
                        { label: 'Management', value: property.management_company },
                        { label: 'MSA', value: property.msa },
                        { label: 'Current Occupancy', value: occupancy != null ? `${occupancy}%` : null },
                    ].filter(r => r.value != null).map(r => (
                        <div key={r.label} className="flex justify-between items-center text-sm">
                            <span className="text-[var(--text-muted)]">{r.label}</span>
                            <span className="font-medium text-[var(--text-primary)]">{r.value}</span>
                        </div>
                    ))}
                </div>
                {buildingFlags.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[var(--table-row-border)]">
                        <div className="flex flex-wrap gap-1.5">
                            {buildingFlags.map(f => (
                                <span key={f} className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-600">{f}</span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Quality Scores */}
            {qualityScores.length > 0 && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Building Quality</h3>
                    <div className="space-y-2.5">
                        {qualityScores.map(([key, val]) => (
                            <div key={key} className="flex items-center gap-3">
                                <span className="text-xs text-[var(--text-muted)] w-24 capitalize">{key.replace(/_/g, ' ')}</span>
                                <div className="flex-1 bg-[var(--bg-primary)] rounded-full h-2 overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, (val as number) * 20)}%` }} />
                                </div>
                                <span className="text-xs font-semibold text-[var(--text-primary)] w-8 text-right">{(val as number).toFixed(1)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Reviews */}
            {property.review_analysis && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Reviews</h3>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-1">
                            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                            <span className="text-lg font-bold text-[var(--text-primary)]">{property.review_analysis.avg_score?.toFixed(1) ?? '—'}</span>
                        </div>
                        <span className="text-sm text-[var(--text-muted)]">{property.review_analysis.count_reviews ?? 0} reviews</span>
                    </div>
                    {property.review_analysis.positive_counts && Object.keys(property.review_analysis.positive_counts).length > 0 && (
                        <div className="mb-3">
                            <p className="text-[10px] font-semibold text-emerald-600 uppercase mb-1.5">Top Positive</p>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(property.review_analysis.positive_counts).sort(([, a], [, b]) => b - a).slice(0, 6).map(([k, v]) => (
                                    <span key={k} className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-600">{k} ({v})</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {property.review_analysis.negative_counts && Object.keys(property.review_analysis.negative_counts).length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold text-red-500 uppercase mb-1.5">Top Negative</p>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(property.review_analysis.negative_counts).sort(([, a], [, b]) => b - a).slice(0, 6).map(([k, v]) => (
                                    <span key={k} className="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-500">{k} ({v})</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Fees */}
            {fees.length > 0 && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Fees</h3>
                    <div className="space-y-2">
                        {fees.map(([key, val]) => (
                            <div key={key} className="flex justify-between items-center text-sm">
                                <span className="text-[var(--text-muted)] capitalize">{key.replace(/_/g, ' ')}</span>
                                <span className="font-medium text-[var(--text-primary)]">{typeof val === 'number' ? fmtCurrency(val) : val}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pricing Strategy */}
            {property.pricing_strategy && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Pricing Strategy</h3>
                    <div className="space-y-3 text-sm">
                        {property.pricing_strategy.is_using_rev_management != null && (
                            <div className="flex justify-between">
                                <span className="text-[var(--text-muted)]">Revenue Management</span>
                                <span className={`font-medium ${property.pricing_strategy.is_using_rev_management ? 'text-emerald-500' : 'text-[var(--text-secondary)]'}`}>
                                    {property.pricing_strategy.is_using_rev_management ? 'Yes' : 'No'}
                                </span>
                            </div>
                        )}
                        {property.pricing_strategy.avg_duration != null && (
                            <div className="flex justify-between">
                                <span className="text-[var(--text-muted)]">Avg Lease Duration</span>
                                <span className="font-medium text-[var(--text-primary)]">{property.pricing_strategy.avg_duration} months</span>
                            </div>
                        )}
                        {property.pricing_strategy.avg_time_on_market != null && (
                            <div className="flex justify-between">
                                <span className="text-[var(--text-muted)]">Avg Time on Market</span>
                                <span className="font-medium text-[var(--text-primary)]">{property.pricing_strategy.avg_time_on_market} days</span>
                            </div>
                        )}
                        {property.pricing_strategy.count_prices != null && (
                            <div className="flex justify-between">
                                <span className="text-[var(--text-muted)]">Price Points Tracked</span>
                                <span className="font-medium text-[var(--text-primary)]">{property.pricing_strategy.count_prices}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Amenities */}
            {(property.building_amenities?.length > 0 || property.unit_amenities?.length > 0) && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 lg:col-span-2">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Amenities</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {property.building_amenities?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">Building</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {property.building_amenities.map(a => (
                                        <span key={a} className="px-2 py-0.5 text-[10px] rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)]">{a}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {property.unit_amenities?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">Unit</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {property.unit_amenities.map(a => (
                                        <span key={a} className="px-2 py-0.5 text-[10px] rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)]">{a}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Unit Details Tab
// ════════════════════════════════════════════════════════════

function UnitDetailsTab({ units }: { units: HellodataUnit[] }) {
    const [bedFilter, setBedFilter] = useState<number | 'all'>('all');
    const [sortKey, setSortKey] = useState<'bed' | 'price' | 'sqft' | 'dom'>('bed');

    const allBeds = useMemo(() => {
        const beds = new Set<number>();
        units.forEach(u => { if (u.bed != null) beds.add(u.bed); });
        return [...beds].sort((a, b) => a - b);
    }, [units]);

    const filtered = useMemo(() => {
        let list = bedFilter === 'all' ? [...units] : units.filter(u => u.bed === bedFilter);
        switch (sortKey) {
            case 'bed': list.sort((a, b) => (a.bed ?? 0) - (b.bed ?? 0) || (a.sqft ?? 0) - (b.sqft ?? 0)); break;
            case 'price': list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0)); break;
            case 'sqft': list.sort((a, b) => (a.sqft ?? 0) - (b.sqft ?? 0)); break;
            case 'dom': list.sort((a, b) => (b.days_on_market ?? 0) - (a.days_on_market ?? 0)); break;
        }
        return list;
    }, [units, bedFilter, sortKey]);

    return (
        <div>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5">
                    <button
                        onClick={() => setBedFilter('all')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${bedFilter === 'all' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                    >All</button>
                    {allBeds.map(b => (
                        <button
                            key={b}
                            onClick={() => setBedFilter(b)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${bedFilter === b ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >{b === 0 ? 'Studio' : `${b}BR`}</button>
                    ))}
                </div>
                <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)]"
                >
                    <option value="bed">Sort: Bed/Bath</option>
                    <option value="price">Sort: Price</option>
                    <option value="sqft">Sort: Sq Ft</option>
                    <option value="dom">Sort: Days on Market</option>
                </select>
                <span className="text-xs text-[var(--text-faint)]">{filtered.length} unit{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Table */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                    <thead>
                        <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-primary)]">
                            <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Unit / Floorplan</th>
                            <th className="text-center py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Bed</th>
                            <th className="text-center py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Bath</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Sq Ft</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Asking Rent</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Effective</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">$/SF</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-[var(--text-secondary)]">DOM</th>
                            <th className="text-center py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Lease Term</th>
                            <th className="text-center py-2.5 px-3 font-semibold text-[var(--text-secondary)]">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((u, i) => {
                            const rentPerSf = u.price && u.sqft ? (u.price / u.sqft).toFixed(2) : '—';
                            return (
                                <tr key={u.id || i} className={`border-b border-[var(--bg-elevated)] ${i % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-primary)]'}`}>
                                    <td className="py-2 px-3">
                                        <div className="font-medium text-[var(--text-primary)]">{u.unit_name || u.floorplan_name || '—'}</div>
                                        {u.floor != null && <div className="text-[10px] text-[var(--text-faint)]">Floor {u.floor}</div>}
                                    </td>
                                    <td className="py-2 px-3 text-center text-[var(--text-secondary)]">{u.bed === 0 ? 'Studio' : u.bed ?? '—'}</td>
                                    <td className="py-2 px-3 text-center text-[var(--text-secondary)]">{u.bath ?? '—'}</td>
                                    <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{u.sqft ? u.sqft.toLocaleString() : '—'}</td>
                                    <td className="py-2 px-3 text-right tabular-nums font-medium text-[var(--text-primary)]">{u.price ? fmtCurrency(u.price) : '—'}</td>
                                    <td className="py-2 px-3 text-right tabular-nums text-emerald-600">{u.effective_price ? fmtCurrency(u.effective_price) : '—'}</td>
                                    <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">${rentPerSf}</td>
                                    <td className="py-2 px-3 text-right tabular-nums text-[var(--text-muted)]">{u.days_on_market ?? '—'}</td>
                                    <td className="py-2 px-3 text-center text-[var(--text-muted)]">{u.lease_term ? `${u.lease_term}mo` : '—'}</td>
                                    <td className="py-2 px-3 text-center">
                                        {u.availability ? (
                                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${u.availability === 'available' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
                                                {u.availability}
                                            </span>
                                        ) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Concessions Tab
// ════════════════════════════════════════════════════════════

function ConcessionsTab({ property }: { property: HellodataProperty }) {
    const concessions = property.concessions ?? [];
    if (concessions.length === 0) {
        return (
            <div className="text-center py-16">
                <DollarSign className="w-10 h-10 text-[var(--border-strong)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No concession data available</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {concessions.map((c, i) => (
                <div key={c.id || i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                        <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{c.concession_text || 'Concession'}</p>
                            {(c.from_date || c.to_date) && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    {c.from_date && new Date(c.from_date).toLocaleDateString()}{c.to_date ? ` — ${new Date(c.to_date).toLocaleDateString()}` : ''}
                                </p>
                            )}
                        </div>
                    </div>
                    {c.items && c.items.length > 0 && (
                        <div className="space-y-2 mt-3 pt-3 border-t border-[var(--table-row-border)]">
                            {c.items.map((item, j) => (
                                <div key={j} className="text-xs text-[var(--text-secondary)] space-y-1">
                                    {item.free_months_count && <p className="text-emerald-600 font-medium">🎉 {item.free_months_count} month{item.free_months_count > 1 ? 's' : ''} free</p>}
                                    {item.free_weeks_count && <p className="text-emerald-600 font-medium">🎉 {item.free_weeks_count} week{item.free_weeks_count > 1 ? 's' : ''} free</p>}
                                    {item.recurring_dollars_off_amount && <p className="text-emerald-600 font-medium">${item.recurring_dollars_off_amount}/mo off</p>}
                                    {item.one_time_dollars_off_amount && <p className="text-blue-600">${item.one_time_dollars_off_amount} one-time discount</p>}
                                    {item.waived_application_fee && <p>✓ Application fee waived</p>}
                                    {item.waived_security_deposit && <p>✓ Security deposit waived</p>}
                                    {item.waived_administrative_fee && <p>✓ Admin fee waived</p>}
                                    {item.waived_move_in_fee && <p>✓ Move-in fee waived</p>}
                                    {item.condition_bedrooms && <p className="text-[var(--text-faint)]">Applies to: {item.condition_bedrooms.map(b => b === 0 ? 'Studio' : `${b}BR`).join(', ')}</p>}
                                    {item.condition_lease_term_months && <p className="text-[var(--text-faint)]">Lease term: {item.condition_lease_term_months.join(', ')} months</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Occupancy Tab
// ════════════════════════════════════════════════════════════

function OccupancyTab({ property }: { property: HellodataProperty }) {
    const data = property.occupancy_over_time ?? [];
    if (data.length === 0) {
        return (
            <div className="text-center py-16">
                <TrendingUp className="w-10 h-10 text-[var(--border-strong)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No occupancy history available</p>
            </div>
        );
    }

    const maxLeased = Math.max(...data.map(d => d.leased));
    const minLeased = Math.min(...data.map(d => d.leased));

    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Occupancy Over Time</h3>
            <div className="h-48 flex items-end gap-1">
                {data.map((d, i) => {
                    const pct = d.leased * 100;
                    return (
                        <div key={i} className="flex-1 group relative flex flex-col items-center">
                            <div
                                className={`w-full rounded-t transition-colors ${pct >= 95 ? 'bg-emerald-500' : pct >= 90 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ height: `${Math.max(4, (d.leased / Math.max(maxLeased, 1)) * 160)}px` }}
                            />
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[var(--bg-card)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-sm z-10">
                                {pct.toFixed(1)}% — {d.as_of}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-[var(--text-faint)]">
                <span>{data[0]?.as_of}</span>
                <span>{data[data.length - 1]?.as_of}</span>
            </div>
            <div className="flex items-center gap-6 mt-4 pt-3 border-t border-[var(--table-row-border)] text-sm">
                <div>
                    <span className="text-[var(--text-muted)]">Current: </span>
                    <span className="font-semibold text-[var(--text-primary)]">{(data[data.length - 1].leased * 100).toFixed(1)}%</span>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">High: </span>
                    <span className="font-medium text-emerald-600">{(maxLeased * 100).toFixed(1)}%</span>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Low: </span>
                    <span className="font-medium text-red-500">{(minLeased * 100).toFixed(1)}%</span>
                </div>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Main Detail Page
// ════════════════════════════════════════════════════════════

export default function RentCompDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const id = params.id as string;
    const { data: property, isLoading } = useHellodataPropertyDetail(id);
    const { data: linkedPursuits = [] } = usePursuitsForProperty(id);
    const { data: allPursuits = [] } = usePursuits();
    const linkMutation = useLinkRentComp();

    const [activeTab, setActiveTab] = useState<'overview' | 'units' | 'trends' | 'concessions' | 'occupancy'>('overview');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showLinkDropdown, setShowLinkDropdown] = useState(false);

    // Pursuits not yet linked
    const unlinkPursuits = useMemo(() => {
        const linkedIds = new Set(linkedPursuits.map(l => l.pursuit_id));
        return allPursuits.filter(p => !linkedIds.has(p.id));
    }, [allPursuits, linkedPursuits]);

    const handleRefresh = useCallback(async () => {
        if (!property) return;
        setIsRefreshing(true);
        try {
            await fetch(`/api/hellodata/property?hellodataId=${encodeURIComponent(property.hellodata_id)}&forceRefresh=true`);
            queryClient.invalidateQueries({ queryKey: hellodataKeys.propertyDetail(id) });
        } catch (err) {
            console.error('Refresh failed', err);
        } finally {
            setIsRefreshing(false);
        }
    }, [property, id, queryClient]);

    const handleLinkPursuit = useCallback(async (pursuitId: string) => {
        if (!property) return;
        try {
            await linkMutation.mutateAsync({ pursuitId, propertyId: property.id });
            queryClient.invalidateQueries({ queryKey: hellodataKeys.linkedPursuits(id) });
            setShowLinkDropdown(false);
        } catch (err) {
            console.error('Link failed', err);
        }
    }, [property, id, linkMutation, queryClient]);

    const compMetrics = useMemo(() => {
        if (!property) return [];
        return [{
            name: property.building_name || property.street_address || 'Property',
            property,
            units: (property.units || []) as any[],
            concessions: (property.concessions || []) as any[],
        }] as any[];
    }, [property]);

    if (isLoading) {
        return (
            <AppShell>
                <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" /></div>
            </AppShell>
        );
    }

    if (!property) {
        return (
            <AppShell>
                <div className="max-w-7xl mx-auto px-6 py-12 text-center">
                    <p className="text-[var(--text-muted)]">Property not found.</p>
                </div>
            </AppShell>
        );
    }

    const address = [property.street_address, property.city, property.state, property.zip_code].filter(Boolean).join(', ');
    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: Home },
        { id: 'units' as const, label: `Units (${property.units?.length ?? 0})`, icon: Building2 },
        { id: 'trends' as const, label: 'Rent Trends', icon: TrendingUp },
        { id: 'concessions' as const, label: 'Concessions', icon: DollarSign },
        { id: 'occupancy' as const, label: 'Occupancy', icon: Users },
    ];

    return (
        <AppShell>
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
                {/* Header */}
                <div className="mb-6">
                    <Link
                        href="/comps"
                        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-3"
                    >
                        <ChevronLeft className="w-4 h-4" /> Back to Comps
                    </Link>

                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Left: Info */}
                        <div className="flex-1">
                            <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">
                                {property.building_name || property.street_address || 'Unknown Property'}
                            </h1>
                            <p className="text-sm text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" /> {address || 'No address'}
                            </p>

                            {/* Website */}
                            {property.building_website && (
                                <a
                                    href={property.building_website.startsWith('http') ? property.building_website : `https://${property.building_website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm text-[#2563EB] hover:underline mt-2"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" /> Website
                                </a>
                            )}

                            {/* KPI bar */}
                            <div className="flex flex-wrap gap-4 mt-4">
                                {property.number_units != null && (
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-[var(--text-primary)]">{property.number_units}</div>
                                        <div className="text-[10px] text-[var(--text-faint)] uppercase">Units</div>
                                    </div>
                                )}
                                {property.year_built != null && (
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-[var(--text-primary)]">{property.year_built}</div>
                                        <div className="text-[10px] text-[var(--text-faint)] uppercase">Year Built</div>
                                    </div>
                                )}
                                {property.number_stories != null && (
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-[var(--text-primary)]">{property.number_stories}</div>
                                        <div className="text-[10px] text-[var(--text-faint)] uppercase">Stories</div>
                                    </div>
                                )}
                            </div>

                            {/* Linked Pursuits */}
                            {linkedPursuits.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    <span className="text-xs text-[var(--text-faint)]">Linked to:</span>
                                    {linkedPursuits.map(lp => (
                                        <Link
                                            key={lp.pursuit_id}
                                            href={`/pursuits/${lp.pursuit_short_id}`}
                                            className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                                        >
                                            {lp.pursuit_name}
                                        </Link>
                                    ))}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-3 mt-4">
                                {/* Add to Pursuit */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowLinkDropdown(!showLinkDropdown)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        <Link2 className="w-3.5 h-3.5" /> Add to Pursuit <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {showLinkDropdown && (
                                        <div className="absolute top-full left-0 mt-1 w-60 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                            {unlinkPursuits.length === 0 ? (
                                                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Already linked to all pursuits</div>
                                            ) : (
                                                unlinkPursuits.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => handleLinkPursuit(p.id)}
                                                        className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
                                                    >
                                                        {p.name}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Refresh */}
                                <button
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    {isRefreshing ? 'Refreshing…' : 'Refresh Data'}
                                </button>

                                {/* Last refreshed */}
                                <span className="text-[10px] text-[var(--text-faint)]">
                                    Last refreshed: {new Date(property.fetched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                            </div>
                        </div>

                        {/* Right: Map */}
                        {property.lat != null && property.lon != null && (
                            <div className="w-full lg:w-96 flex-shrink-0">
                                <PropertyMap lat={property.lat} lon={property.lon} name={property.building_name || ''} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 mb-6 border-b border-[var(--border)] overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${activeTab === tab.id ? 'text-[#2563EB] border-[#2563EB]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'}`}
                        >
                            <tab.icon className="w-4 h-4" /> {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && <OverviewTab property={property} />}
                {activeTab === 'units' && <UnitDetailsTab units={property.units ?? []} />}
                {activeTab === 'trends' && <RentTrendsSection comps={compMetrics} />}
                {activeTab === 'concessions' && <ConcessionsTab property={property} />}
                {activeTab === 'occupancy' && <OccupancyTab property={property} />}
            </div>
        </AppShell>
    );
}
