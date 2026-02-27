'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useLandComps, useCreateLandComp, useDeleteLandComp } from '@/hooks/useSupabaseQueries';
import {
    Search, Landmark, Loader2, Plus, Trash2, MapPin, Navigation, DollarSign,
    Calendar, Ruler, LayoutGrid, List, Map,
} from 'lucide-react';
import type { LandComp } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function formatCurrency(val: number | null) {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}
function formatNumber(val: number | null, decimals = 0) {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(val);
}

// ======================== Comps Map ========================

function CompsMap({ comps }: { comps: LandComp[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);

    const locatedComps = useMemo(
        () => comps.filter((c) => c.latitude != null && c.longitude != null),
        [comps]
    );

    useEffect(() => {
        if (!MAPBOX_TOKEN || !containerRef.current) return;

        let map: any;
        import('mapbox-gl').then((mapboxgl) => {
            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;

            let center: [number, number] = [-97.7431, 32.0];
            let zoom = 4;
            if (locatedComps.length === 1) {
                center = [locatedComps[0].longitude!, locatedComps[0].latitude!];
                zoom = 12;
            } else if (locatedComps.length > 1) {
                const bounds = new mbgl.LngLatBounds();
                locatedComps.forEach((c) => bounds.extend([c.longitude!, c.latitude!]));
                center = bounds.getCenter().toArray() as [number, number];
            }

            if (containerRef.current) containerRef.current.innerHTML = '';

            map = new mbgl.Map({
                container: containerRef.current!,
                style: 'mapbox://styles/mapbox/light-v11',
                center,
                zoom,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: true }), 'top-right');
            mapRef.current = map;

            map.on('load', () => {
                if (locatedComps.length > 1) {
                    const bounds = new mbgl.LngLatBounds();
                    locatedComps.forEach((c) => bounds.extend([c.longitude!, c.latitude!]));
                    map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
                }

                // Add markers
                locatedComps.forEach((c) => {
                    const priceLabel = c.sale_price ? formatCurrency(c.sale_price) : '';
                    const el = document.createElement('div');
                    el.style.cssText = 'cursor:pointer;display:flex;flex-direction:column;align-items:center;';
                    el.innerHTML = `
                        <div style="background:#0D9488;color:#fff;font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.15);line-height:1.3;text-align:center;">
                            ${c.name}
                            ${priceLabel ? `<div style="font-weight:400;font-size:8px;opacity:0.85;">${priceLabel}</div>` : ''}
                        </div>
                        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #0D9488;"></div>
                    `;
                    const marker = new mbgl.Marker({ element: el })
                        .setLngLat([c.longitude!, c.latitude!])
                        .addTo(map);
                    el.addEventListener('click', () => { window.location.href = `/comps/${c.id}`; });
                    markersRef.current.push(marker);
                });
            });
        });

        return () => {
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locatedComps]);

    if (locatedComps.length === 0) {
        return (
            <div className="flex items-center justify-center py-20 text-center">
                <div>
                    <MapPin className="w-8 h-8 text-[#C8CDD5] mx-auto mb-2" />
                    <p className="text-sm text-[#7A8599]">No comps with location data</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative bg-white border border-[#E2E5EA] rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}

// ======================== Main Page ========================

export default function CompsPage() {
    const router = useRouter();
    const { isAdminOrOwner } = useAuth();
    const { data: comps = [], isLoading } = useLandComps();
    const createComp = useCreateLandComp();
    const deleteCompMutation = useDeleteLandComp();

    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'name' | 'price'>('newest');
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [deleteCompId, setDeleteCompId] = useState<string | null>(null);

    // Create form state
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newCity, setNewCity] = useState('');
    const [newState, setNewState] = useState('');
    const [newCounty, setNewCounty] = useState('');
    const [newZip, setNewZip] = useState('');
    const [newLat, setNewLat] = useState<number | null>(null);
    const [newLng, setNewLng] = useState<number | null>(null);
    const [addressMode, setAddressMode] = useState<'search' | 'coords'>('search');
    const [addressSearch, setAddressSearch] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [coordLatStr, setCoordLatStr] = useState('');
    const [coordLngStr, setCoordLngStr] = useState('');
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const filtered = useMemo(() => {
        const list = comps.filter((c) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (
                c.name.toLowerCase().includes(q) ||
                c.address?.toLowerCase().includes(q) ||
                c.city?.toLowerCase().includes(q) ||
                c.buyer?.toLowerCase().includes(q) ||
                c.seller?.toLowerCase().includes(q)
            );
        });
        switch (sortBy) {
            case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
            case 'price': list.sort((a, b) => (b.sale_price ?? 0) - (a.sale_price ?? 0)); break;
            default: list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
        return list;
    }, [comps, searchQuery, sortBy]);

    // Address autocomplete
    const handleAddressSearch = useCallback((query: string) => {
        setAddressSearch(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!query.trim() || !MAPBOX_TOKEN) { setSuggestions([]); setShowSuggestions(false); return; }
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,place&country=US&limit=5`
                );
                const data = await res.json();
                setSuggestions(data.features || []);
                setShowSuggestions(true);
            } catch { /* ignore */ }
        }, 300);
    }, []);

    const selectSuggestion = useCallback((feature: any) => {
        const [lng, lat] = feature.center;
        const context = feature.context || [];
        const findCtx = (type: string) => context.find((c: any) => c.id?.startsWith(type))?.text || '';
        const parts = feature.place_name.split(',');
        setNewAddress(parts[0]?.trim() || '');
        setNewCity(findCtx('place') || '');
        setNewState(findCtx('region') || '');
        setNewZip(findCtx('postcode') || '');
        setNewCounty(findCtx('district') || '');
        setNewLat(lat);
        setNewLng(lng);
        setAddressSearch(feature.place_name);
        setSuggestions([]);
        setShowSuggestions(false);
    }, []);

    const applyCoords = () => {
        const lat = parseFloat(coordLatStr);
        const lng = parseFloat(coordLngStr);
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
        setNewLat(lat);
        setNewLng(lng);
        if (MAPBOX_TOKEN) {
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address,place`)
                .then(r => r.json())
                .then(data => {
                    if (data.features?.length > 0) {
                        const f = data.features[0];
                        const ctx = f.context || [];
                        const findCtx = (type: string) => ctx.find((c: any) => c.id?.startsWith(type))?.text || '';
                        const parts = f.place_name.split(',');
                        setNewAddress(parts[0]?.trim() || '');
                        setNewCity(findCtx('place') || '');
                        setNewState(findCtx('region') || '');
                        setNewZip(findCtx('postcode') || '');
                        setNewCounty(findCtx('district') || '');
                    }
                }).catch(() => { });
        }
    };

    const resetForm = () => {
        setNewName(''); setNewAddress(''); setNewCity(''); setNewState('');
        setNewCounty(''); setNewZip(''); setNewLat(null); setNewLng(null);
        setAddressSearch(''); setCoordLatStr(''); setCoordLngStr('');
        setSuggestions([]); setShowSuggestions(false); setAddressMode('search');
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        try {
            const created = await createComp.mutateAsync({
                name: newName.trim(),
                address: newAddress,
                city: newCity,
                state: newState,
                county: newCounty,
                zip: newZip,
                latitude: newLat,
                longitude: newLng,
                site_area_sf: 0,
                sale_price: null,
                sale_price_psf: null,
                sale_date: null,
                buyer: null,
                seller: null,
                zoning: null,
                land_use: null,
                notes: null,
                parcel_data: null,
                parcel_data_updated_at: null,
            });
            resetForm();
            setShowNewDialog(false);
            router.push(`/comps/${created.id}`);
        } catch (err) {
            console.error('Failed to create comp:', err);
        }
    };

    return (
        <AppShell>
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
                {/* Header */}
                <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-[#1A1F2B]">Land Comps</h1>
                        <p className="text-sm text-[#7A8599] mt-0.5">
                            {comps.length} comp{comps.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* View Mode Toggle */}
                        <div className="flex items-center rounded-lg bg-[#F4F5F7] p-0.5">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599] hover:text-[#4A5568]'}`}
                            >
                                <LayoutGrid className="w-4 h-4" /> Grid
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599] hover:text-[#4A5568]'}`}
                            >
                                <List className="w-4 h-4" /> List
                            </button>
                            <button
                                onClick={() => setViewMode('map')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'map' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599] hover:text-[#4A5568]'}`}
                            >
                                <Map className="w-4 h-4" /> Map
                            </button>
                        </div>
                        <button
                            onClick={() => setShowNewDialog(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-medium transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            New Comp
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search comps..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/10 focus:outline-none transition-all"
                        />
                    </div>
                    {(viewMode === 'grid' || viewMode === 'list') && (
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#4A5568] focus:border-[#0D9488] focus:outline-none"
                        >
                            <option value="newest">Newest First</option>
                            <option value="name">Name A→Z</option>
                            <option value="price">Highest Price</option>
                        </select>
                    )}
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="flex justify-center py-24">
                        <Loader2 className="w-8 h-8 animate-spin text-[#C8CDD5]" />
                    </div>
                )}

                {/* === GRID VIEW === */}
                {!isLoading && viewMode === 'grid' && filtered.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((comp) => (
                            <div
                                key={comp.id}
                                className="group relative bg-white border border-[#E2E5EA] rounded-xl p-4 hover:border-[#0D9488]/40 hover:shadow-md transition-all cursor-pointer"
                                onClick={() => router.push(`/comps/${comp.id}`)}
                            >
                                {/* Delete button — admin/owner only */}
                                {isAdminOrOwner && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setDeleteCompId(comp.id); }}
                                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 text-[#A0AABB] hover:text-red-500 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}

                                <div className="mb-3">
                                    <h3 className="text-sm font-semibold text-[#1A1F2B] truncate pr-8">{comp.name}</h3>
                                    <p className="text-xs text-[#7A8599] truncate mt-0.5">
                                        {[comp.address, comp.city, comp.state].filter(Boolean).join(', ') || 'No address'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    {comp.sale_price != null && comp.sale_price > 0 && (
                                        <div className="flex items-center gap-1.5">
                                            <DollarSign className="w-3 h-3 text-[#0D9488]" />
                                            <div>
                                                <div className="text-[10px] text-[#A0AABB] uppercase">Sale Price</div>
                                                <div className="text-xs font-semibold text-[#1A1F2B]">{formatCurrency(comp.sale_price)}</div>
                                            </div>
                                        </div>
                                    )}
                                    {comp.sale_price_psf != null && comp.sale_price_psf > 0 && (
                                        <div className="flex items-center gap-1.5">
                                            <Ruler className="w-3 h-3 text-[#0D9488]" />
                                            <div>
                                                <div className="text-[10px] text-[#A0AABB] uppercase">Price/SF</div>
                                                <div className="text-xs font-semibold text-[#1A1F2B]">{formatCurrency(comp.sale_price_psf)}</div>
                                            </div>
                                        </div>
                                    )}
                                    {comp.sale_date && (
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3 h-3 text-[#7A8599]" />
                                            <div>
                                                <div className="text-[10px] text-[#A0AABB] uppercase">Sale Date</div>
                                                <div className="text-xs text-[#4A5568]">{new Date(comp.sale_date).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                    )}
                                    {comp.site_area_sf > 0 && (
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3 h-3 text-[#7A8599]" />
                                            <div>
                                                <div className="text-[10px] text-[#A0AABB] uppercase">Site Area</div>
                                                <div className="text-xs text-[#4A5568]">{formatNumber(comp.site_area_sf)} SF</div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3 pt-2 border-t border-[#F0F1F4] text-[10px] text-[#A0AABB]">
                                    Added {new Date(comp.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* === LIST VIEW === */}
                {!isLoading && viewMode === 'list' && filtered.length > 0 && (
                    <div className="bg-white border border-[#E2E5EA] rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#E2E5EA] bg-[#FAFBFC]">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider">Name</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden sm:table-cell">Location</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider">Sale Price</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden md:table-cell">Price/SF</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden md:table-cell">Site (SF)</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden lg:table-cell">Sale Date</th>
                                    {isAdminOrOwner && <th className="w-10"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((c) => (
                                    <tr
                                        key={c.id}
                                        className="group border-b border-[#F0F1F4] last:border-b-0 hover:bg-[#FAFBFC] cursor-pointer transition-colors"
                                        onClick={() => router.push(`/comps/${c.id}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-semibold text-[#1A1F2B] hover:text-[#0D9488] transition-colors">{c.name}</span>
                                        </td>
                                        <td className="px-4 py-3 text-[#7A8599] hidden sm:table-cell">
                                            {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-[#1A1F2B]">
                                            {c.sale_price ? formatCurrency(c.sale_price) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-[#4A5568] hidden md:table-cell">
                                            {c.sale_price_psf ? formatCurrency(c.sale_price_psf) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-[#4A5568] hidden md:table-cell">
                                            {c.site_area_sf > 0 ? formatNumber(c.site_area_sf) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs text-[#7A8599] hidden lg:table-cell">
                                            {c.sale_date ? new Date(c.sale_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </td>
                                        {isAdminOrOwner && (
                                            <td className="px-4 py-1 text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteCompId(c.id); }}
                                                    className="p-1.5 rounded-md text-[#A0AABB] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-all opacity-0 group-hover:opacity-100"
                                                    title="Delete comp"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* === MAP VIEW === */}
                {!isLoading && viewMode === 'map' && (
                    <CompsMap comps={filtered} />
                )}

                {/* Empty State */}
                {!isLoading && filtered.length === 0 && viewMode !== 'map' && (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-[#F4F5F7] flex items-center justify-center mb-4">
                            <Landmark className="w-8 h-8 text-[#A0AABB]" />
                        </div>
                        <h3 className="text-lg font-semibold text-[#4A5568] mb-2">
                            {comps.length === 0 ? 'No comps yet' : 'No matching comps'}
                        </h3>
                        <p className="text-sm text-[#7A8599] max-w-md">
                            {comps.length === 0
                                ? 'Add your first land sale comparable to start tracking market data.'
                                : 'Try adjusting your search.'}
                        </p>
                        {comps.length === 0 && (
                            <button
                                onClick={() => setShowNewDialog(true)}
                                className="mt-6 px-4 py-2 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                Add First Comp
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ Create Comp Dialog ═══ */}
            {showNewDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowNewDialog(false); resetForm(); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-[#1A1F2B] mb-4">New Land Comp</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-[#7A8599] uppercase mb-1 block">Name *</label>
                                <input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="e.g. 123 Main St Assemblage"
                                    className="w-full px-3 py-2 rounded-lg border border-[#E2E5EA] text-sm focus:border-[#0D9488] focus:outline-none"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAddressMode('search')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${addressMode === 'search' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[#7A8599] border border-[#E2E5EA] hover:bg-[#F4F5F7]'}`}
                                >
                                    <MapPin className="w-3 h-3" /> Address Search
                                </button>
                                <button
                                    onClick={() => setAddressMode('coords')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${addressMode === 'coords' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[#7A8599] border border-[#E2E5EA] hover:bg-[#F4F5F7]'}`}
                                >
                                    <Navigation className="w-3 h-3" /> Coordinates
                                </button>
                            </div>

                            {addressMode === 'search' ? (
                                <div className="relative">
                                    <input
                                        value={addressSearch}
                                        onChange={(e) => handleAddressSearch(e.target.value)}
                                        placeholder="Search for an address..."
                                        className="w-full px-3 py-2 rounded-lg border border-[#E2E5EA] text-sm focus:border-[#0D9488] focus:outline-none"
                                    />
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E5EA] rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                            {suggestions.map((s: any) => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => selectSuggestion(s)}
                                                    className="w-full text-left px-3 py-2 text-sm text-[#4A5568] hover:bg-[#F4F5F7] transition-colors"
                                                >
                                                    {s.place_name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input value={coordLatStr} onChange={(e) => setCoordLatStr(e.target.value)} placeholder="Latitude" className="flex-1 px-3 py-2 rounded-lg border border-[#E2E5EA] text-sm focus:border-[#0D9488] focus:outline-none" />
                                    <input value={coordLngStr} onChange={(e) => setCoordLngStr(e.target.value)} placeholder="Longitude" className="flex-1 px-3 py-2 rounded-lg border border-[#E2E5EA] text-sm focus:border-[#0D9488] focus:outline-none" />
                                    <button onClick={applyCoords} className="px-3 py-2 rounded-lg bg-[#0D9488]/10 text-[#0D9488] text-sm font-medium hover:bg-[#0D9488]/20 transition-colors">Apply</button>
                                </div>
                            )}

                            {newLat && newLng && (
                                <div className="text-xs text-[#0D7A3E] bg-[#ECFDF3] px-2.5 py-1.5 rounded-md">
                                    ✓ Location set: {newLat.toFixed(4)}, {newLng.toFixed(4)}
                                    {newAddress && ` — ${newAddress}`}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => { setShowNewDialog(false); resetForm(); }} className="px-4 py-2 text-sm text-[#7A8599] hover:text-[#4A5568] transition-colors">Cancel</button>
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || createComp.isPending}
                                className="px-4 py-2 rounded-lg bg-[#0D9488] text-white text-sm font-medium hover:bg-[#0F766E] disabled:opacity-50 transition-colors"
                            >
                                {createComp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Comp'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Delete Confirm (admin/owner only) ═══ */}
            {deleteCompId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteCompId(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-[#1A1F2B] mb-2">Delete Comp?</h3>
                        <p className="text-sm text-[#7A8599] mb-4">This will permanently delete this comp and its data. This action cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteCompId(null)} className="px-4 py-2 text-sm text-[#7A8599]">Cancel</button>
                            <button
                                onClick={async () => {
                                    await deleteCompMutation.mutateAsync(deleteCompId);
                                    setDeleteCompId(null);
                                }}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
