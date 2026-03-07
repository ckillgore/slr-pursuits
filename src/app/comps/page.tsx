'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useLandComps, useCreateLandComp, useDeleteLandComp, useSaleComps, useCreateSaleComp, useDeleteSaleComp, useProductTypes } from '@/hooks/useSupabaseQueries';
import {
    Search, Landmark, Loader2, Plus, Trash2, MapPin, Navigation, DollarSign,
    Calendar, Ruler, LayoutGrid, List, Map, Building2, TrendingUp, AlertTriangle,
} from 'lucide-react';
import type { LandComp, SaleComp } from '@/types';

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
                    <MapPin className="w-8 h-8 text-[var(--border-strong)] mx-auto mb-2" />
                    <p className="text-sm text-[var(--text-muted)]">No comps with location data</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}

// ======================== Sale Comps Map ========================

function SaleCompsMap({ comps }: { comps: SaleComp[] }) {
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

                locatedComps.forEach((c) => {
                    const txs = (c.sale_transactions ?? []).sort(
                        (a, b) => new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
                    );
                    const latest = txs[0];
                    const priceLabel = latest?.sale_price ? formatCurrency(latest.sale_price) : '';
                    const el = document.createElement('div');
                    el.style.cssText = 'cursor:pointer;display:flex;flex-direction:column;align-items:center;';
                    el.innerHTML = `
                        <div style="background:#6366F1;color:#fff;font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.15);line-height:1.3;text-align:center;">
                            ${c.name}
                            ${priceLabel ? `<div style="font-weight:400;font-size:8px;opacity:0.85;">${priceLabel}</div>` : ''}
                        </div>
                        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #6366F1;"></div>
                    `;
                    const marker = new mbgl.Marker({ element: el })
                        .setLngLat([c.longitude!, c.latitude!])
                        .addTo(map);
                    el.addEventListener('click', () => { window.location.href = `/comps/sales/${c.short_id}`; });
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
                    <MapPin className="w-8 h-8 text-[var(--border-strong)] mx-auto mb-2" />
                    <p className="text-sm text-[var(--text-muted)]">No sale comps with location data</p>
                    <p className="text-xs text-[var(--text-faint)] mt-1">Add an address when creating sale comps to see them on the map</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
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

    // Sale comps
    const { data: saleComps = [], isLoading: loadingSaleComps } = useSaleComps();
    const createSaleComp = useCreateSaleComp();
    const deleteSaleCompMutation = useDeleteSaleComp();

    const [activeSection, setActiveSection] = useState<'land' | 'sales'>('land');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'name' | 'price'>('newest');
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [deleteCompId, setDeleteCompId] = useState<string | null>(null);

    // Shared filters
    const [filterState, setFilterState] = useState('');
    const [filterCity, setFilterCity] = useState('');
    const [saleFilterPropertyType, setSaleFilterPropertyType] = useState('');

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

    // Sale comp form state
    const [showNewSaleDialog, setShowNewSaleDialog] = useState(false);
    const [deleteSaleCompId, setDeleteSaleCompId] = useState<string | null>(null);
    const [saleName, setSaleName] = useState('');
    const [saleAddress, setSaleAddress] = useState('');
    const [saleCity, setSaleCity] = useState('');
    const [saleState, setSaleState] = useState('');
    const [salePropertyType, setSalePropertyType] = useState('');
    const [saleSearchQuery, setSaleSearchQuery] = useState('');
    const [saleSortBy, setSaleSortBy] = useState<'newest' | 'name'>('newest');
    const [saleLat, setSaleLat] = useState<number | null>(null);
    const [saleLng, setSaleLng] = useState<number | null>(null);
    const [saleCounty, setSaleCounty] = useState('');
    const [saleZip, setSaleZip] = useState('');
    const [saleAddressSearch, setSaleAddressSearch] = useState('');
    const [saleSuggestions, setSaleSuggestions] = useState<any[]>([]);
    const [showSaleSuggestions, setShowSaleSuggestions] = useState(false);
    const saleSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Product types from DB
    const { data: productTypes = [] } = useProductTypes();

    const filteredSaleComps = useMemo(() => {
        const list = saleComps.filter((c) => {
            if (filterState && c.state !== filterState) return false;
            if (filterCity && c.city !== filterCity) return false;
            if (saleFilterPropertyType && c.property_type !== saleFilterPropertyType) return false;
            if (!saleSearchQuery) return true;
            const q = saleSearchQuery.toLowerCase();
            return (
                c.name.toLowerCase().includes(q) ||
                c.address?.toLowerCase().includes(q) ||
                c.city?.toLowerCase().includes(q) ||
                c.property_type?.toLowerCase().includes(q)
            );
        });
        switch (saleSortBy) {
            case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
            default: list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
        return list;
    }, [saleComps, saleSearchQuery, saleSortBy, filterState, filterCity, saleFilterPropertyType]);

    // Sale comp address autocomplete
    const handleSaleAddressSearch = useCallback((query: string) => {
        setSaleAddressSearch(query);
        setSaleAddress(query);
        if (saleSearchTimeoutRef.current) clearTimeout(saleSearchTimeoutRef.current);
        if (!query.trim() || query.length < 3 || !MAPBOX_TOKEN) {
            setSaleSuggestions([]); setShowSaleSuggestions(false); return;
        }
        saleSearchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,place&country=US&limit=5`
                );
                const data = await res.json();
                setSaleSuggestions(data.features || []);
                setShowSaleSuggestions(true);
            } catch { /* ignore */ }
        }, 300);
    }, []);

    const selectSaleSuggestion = useCallback((feature: any) => {
        const [lng, lat] = feature.center;
        const context = feature.context || [];
        const findCtx = (type: string) => context.find((c: any) => c.id?.startsWith(type))?.text || '';
        const parts = feature.place_name.split(',');
        setSaleAddress(parts[0]?.trim() || '');
        setSaleCity(findCtx('place') || '');
        setSaleState(findCtx('region') || '');
        setSaleZip(findCtx('postcode') || '');
        setSaleCounty(findCtx('district') || '');
        setSaleLat(lat);
        setSaleLng(lng);
        setSaleAddressSearch(feature.place_name);
        setSaleSuggestions([]);
        setShowSaleSuggestions(false);
    }, []);

    const handleCreateSaleComp = async () => {
        if (!saleName.trim()) return;
        try {
            const created = await createSaleComp.mutateAsync({
                name: saleName.trim(),
                address: saleAddress,
                city: saleCity,
                state: saleState,
                county: saleCounty,
                zip: saleZip,
                latitude: saleLat,
                longitude: saleLng,
                property_type: salePropertyType || null,
                year_built: null,
                total_units: null,
                total_sf: null,
                lot_size_sf: 0,
                notes: null,
                parcel_data: null,
                parcel_data_updated_at: null,
            });
            setSaleName(''); setSaleAddress(''); setSaleCity(''); setSaleState(''); setSalePropertyType('');
            setSaleLat(null); setSaleLng(null); setSaleCounty(''); setSaleZip('');
            setSaleAddressSearch(''); setSaleSuggestions([]); setShowSaleSuggestions(false);
            setShowNewSaleDialog(false);
            router.push(`/comps/sales/${created.short_id}`);
        } catch (err) {
            console.error('Failed to create sale comp:', err);
        }
    };

    // Derive unique filter values for land comps
    const landStates = useMemo(() => {
        const states = [...new Set(comps.map(c => c.state).filter(Boolean))] as string[];
        return states.sort();
    }, [comps]);
    const landCities = useMemo(() => {
        const cities = [...new Set(
            comps.filter(c => !filterState || c.state === filterState).map(c => c.city).filter(Boolean)
        )] as string[];
        return cities.sort();
    }, [comps, filterState]);

    // Derive unique filter values for sale comps
    const saleStates = useMemo(() => {
        const states = [...new Set(saleComps.map(c => c.state).filter(Boolean))] as string[];
        return states.sort();
    }, [saleComps]);
    const saleCities = useMemo(() => {
        const cities = [...new Set(
            saleComps.filter(c => !filterState || c.state === filterState).map(c => c.city).filter(Boolean)
        )] as string[];
        return cities.sort();
    }, [saleComps, filterState]);
    const salePropertyTypes = useMemo(() => {
        const types = [...new Set(saleComps.map(c => c.property_type).filter(Boolean))] as string[];
        return types.sort();
    }, [saleComps]);

    // Duplicate detection for land comps
    const landDuplicates = useMemo(() => {
        const matches: LandComp[] = [];
        const trimmedName = newName.trim().toLowerCase();
        const trimmedAddr = newAddress.trim().toLowerCase();
        if (!trimmedName && !trimmedAddr) return matches;
        for (const c of comps) {
            if (trimmedName && trimmedName.length >= 3 && c.name.toLowerCase().includes(trimmedName)) {
                matches.push(c);
            } else if (trimmedAddr && trimmedAddr.length >= 3 && c.address?.toLowerCase().includes(trimmedAddr)) {
                matches.push(c);
            }
        }
        return matches;
    }, [comps, newName, newAddress]);

    // Duplicate detection for sale comps
    const saleDuplicates = useMemo(() => {
        const matches: SaleComp[] = [];
        const trimmedName = saleName.trim().toLowerCase();
        const trimmedAddr = saleAddress.trim().toLowerCase();
        if (!trimmedName && !trimmedAddr) return matches;
        for (const c of saleComps) {
            if (trimmedName && trimmedName.length >= 3 && c.name.toLowerCase().includes(trimmedName)) {
                matches.push(c);
            } else if (trimmedAddr && trimmedAddr.length >= 3 && c.address?.toLowerCase().includes(trimmedAddr)) {
                matches.push(c);
            }
        }
        return matches;
    }, [saleComps, saleName, saleAddress]);

    const filtered = useMemo(() => {
        const list = comps.filter((c) => {
            if (filterState && c.state !== filterState) return false;
            if (filterCity && c.city !== filterCity) return false;
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
    }, [comps, searchQuery, sortBy, filterState, filterCity]);

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
            router.push(`/comps/${created.short_id}`);
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
                        <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">Comps</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">
                            {activeSection === 'land'
                                ? `${comps.length} land comp${comps.length !== 1 ? 's' : ''}`
                                : `${saleComps.length} sale comp${saleComps.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* View Mode Toggle */}
                        <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <LayoutGrid className="w-4 h-4" /> Grid
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <List className="w-4 h-4" /> List
                            </button>
                            <button
                                onClick={() => setViewMode('map')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'map' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <Map className="w-4 h-4" /> Map
                            </button>
                        </div>
                        <button
                            onClick={() => activeSection === 'land' ? setShowNewDialog(true) : setShowNewSaleDialog(true)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors shadow-sm ${activeSection === 'land' ? 'bg-[#0D9488] hover:bg-[#0F766E]' : 'bg-[var(--accent)] hover:bg-[#4F46E5]'}`}
                        >
                            <Plus className="w-4 h-4" />
                            {activeSection === 'land' ? 'New Land Comp' : 'New Sale Comp'}
                        </button>
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
                    <button
                        onClick={() => { setActiveSection('land'); setFilterState(''); setFilterCity(''); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeSection === 'land' ? 'text-[#0D9488] border-[#0D9488]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'}`}
                    >
                        <Landmark className="w-4 h-4" /> Land Comps
                    </button>
                    <button
                        onClick={() => { setActiveSection('sales'); setFilterState(''); setFilterCity(''); setSaleFilterPropertyType(''); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeSection === 'sales' ? 'text-[var(--accent)] border-[#6366F1]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'}`}
                    >
                        <Building2 className="w-4 h-4" /> Sale Comps
                    </button>
                </div>

                {/* ═══ LAND COMPS SECTION ═══ */}
                {activeSection === 'land' && (<>

                    {/* Filter Bar */}
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <div className="flex-1 min-w-[200px] relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search comps..."
                                className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/10 focus:outline-none transition-all"
                            />
                        </div>
                        {(viewMode === 'grid' || viewMode === 'list') && (
                            <>
                                <select
                                    value={filterState}
                                    onChange={(e) => { setFilterState(e.target.value); setFilterCity(''); }}
                                    className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#0D9488] focus:outline-none"
                                >
                                    <option value="">All States</option>
                                    {landStates.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {filterState && landCities.length > 0 && (
                                    <select
                                        value={filterCity}
                                        onChange={(e) => setFilterCity(e.target.value)}
                                        className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#0D9488] focus:outline-none"
                                    >
                                        <option value="">All Cities</option>
                                        {landCities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                )}
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as any)}
                                    className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#0D9488] focus:outline-none"
                                >
                                    <option value="newest">Newest First</option>
                                    <option value="name">Name A→Z</option>
                                    <option value="price">Highest Price</option>
                                </select>
                            </>
                        )}
                    </div>

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex justify-center py-24">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
                        </div>
                    )}

                    {/* === GRID VIEW === */}
                    {!isLoading && viewMode === 'grid' && filtered.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filtered.map((comp) => (
                                <div
                                    key={comp.id}
                                    className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-[#0D9488]/40 hover:shadow-md transition-all cursor-pointer"
                                    onClick={() => router.push(`/comps/${comp.short_id}`)}
                                >
                                    {/* Delete button — admin/owner only */}
                                    {isAdminOrOwner && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteCompId(comp.id); }}
                                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 text-[var(--text-faint)] hover:text-red-500 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}

                                    <div className="mb-3">
                                        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate pr-8">{comp.name}</h3>
                                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                            {[comp.address, comp.city, comp.state].filter(Boolean).join(', ') || 'No address'}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        {comp.sale_price != null && comp.sale_price > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <DollarSign className="w-3 h-3 text-[#0D9488]" />
                                                <div>
                                                    <div className="text-[10px] text-[var(--text-faint)] uppercase">Sale Price</div>
                                                    <div className="text-xs font-semibold text-[var(--text-primary)]">{formatCurrency(comp.sale_price)}</div>
                                                </div>
                                            </div>
                                        )}
                                        {comp.sale_price_psf != null && comp.sale_price_psf > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <Ruler className="w-3 h-3 text-[#0D9488]" />
                                                <div>
                                                    <div className="text-[10px] text-[var(--text-faint)] uppercase">Price/SF</div>
                                                    <div className="text-xs font-semibold text-[var(--text-primary)]">{formatCurrency(comp.sale_price_psf)}</div>
                                                </div>
                                            </div>
                                        )}
                                        {comp.sale_date && (
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                                                <div>
                                                    <div className="text-[10px] text-[var(--text-faint)] uppercase">Sale Date</div>
                                                    <div className="text-xs text-[var(--text-secondary)]">{new Date(comp.sale_date).toLocaleDateString()}</div>
                                                </div>
                                            </div>
                                        )}
                                        {comp.site_area_sf > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <MapPin className="w-3 h-3 text-[var(--text-muted)]" />
                                                <div>
                                                    <div className="text-[10px] text-[var(--text-faint)] uppercase">Site Area</div>
                                                    <div className="text-xs text-[var(--text-secondary)]">{formatNumber(comp.site_area_sf)} SF</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-[var(--table-row-border)] text-[10px] text-[var(--text-faint)]">
                                        Added {new Date(comp.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* === LIST VIEW === */}
                    {!isLoading && viewMode === 'list' && filtered.length > 0 && (
                        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Name</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden sm:table-cell">Location</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Sale Price</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Price/SF</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Site (SF)</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden lg:table-cell">Sale Date</th>
                                        {isAdminOrOwner && <th className="w-10"></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((c) => (
                                        <tr
                                            key={c.id}
                                            className="group border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors"
                                            onClick={() => router.push(`/comps/${c.short_id}`)}
                                        >
                                            <td className="px-4 py-3">
                                                <span className="font-semibold text-[var(--text-primary)] hover:text-[#0D9488] transition-colors">{c.name}</span>
                                            </td>
                                            <td className="px-4 py-3 text-[var(--text-muted)] hidden sm:table-cell">
                                                {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                                                {c.sale_price ? formatCurrency(c.sale_price) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden md:table-cell">
                                                {c.sale_price_psf ? formatCurrency(c.sale_price_psf) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden md:table-cell">
                                                {c.site_area_sf > 0 ? formatNumber(c.site_area_sf) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-[var(--text-muted)] hidden lg:table-cell">
                                                {c.sale_date ? new Date(c.sale_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                            </td>
                                            {isAdminOrOwner && (
                                                <td className="px-4 py-1 text-right">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDeleteCompId(c.id); }}
                                                        className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all opacity-0 group-hover:opacity-100"
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
                            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center mb-4">
                                <Landmark className="w-8 h-8 text-[var(--text-faint)]" />
                            </div>
                            <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">
                                {comps.length === 0 ? 'No comps yet' : 'No matching comps'}
                            </h3>
                            <p className="text-sm text-[var(--text-muted)] max-w-md">
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
                </>)}

                {/* ═══ SALE COMPS SECTION ═══ */}
                {activeSection === 'sales' && (
                    <>
                        {/* Sale Comps Controls */}
                        <div className="flex flex-wrap items-center gap-3 mb-6">
                            <div className="flex-1 min-w-[200px] relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                                <input
                                    type="text"
                                    value={saleSearchQuery}
                                    onChange={(e) => setSaleSearchQuery(e.target.value)}
                                    placeholder="Search sale comps..."
                                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10 focus:outline-none transition-all"
                                />
                            </div>
                            <select
                                value={filterState}
                                onChange={(e) => { setFilterState(e.target.value); setFilterCity(''); }}
                                className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#6366F1] focus:outline-none"
                            >
                                <option value="">All States</option>
                                {saleStates.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {filterState && saleCities.length > 0 && (
                                <select
                                    value={filterCity}
                                    onChange={(e) => setFilterCity(e.target.value)}
                                    className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#6366F1] focus:outline-none"
                                >
                                    <option value="">All Cities</option>
                                    {saleCities.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            )}
                            {salePropertyTypes.length > 0 && (
                                <select
                                    value={saleFilterPropertyType}
                                    onChange={(e) => setSaleFilterPropertyType(e.target.value)}
                                    className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#6366F1] focus:outline-none"
                                >
                                    <option value="">All Types</option>
                                    {salePropertyTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            )}
                            <select
                                value={saleSortBy}
                                onChange={(e) => setSaleSortBy(e.target.value as any)}
                                className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#6366F1] focus:outline-none"
                            >
                                <option value="newest">Newest First</option>
                                <option value="name">Name A→Z</option>
                            </select>
                        </div>

                        {loadingSaleComps && (
                            <div className="flex justify-center py-24">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
                            </div>
                        )}

                        {!loadingSaleComps && filteredSaleComps.length > 0 && (viewMode === 'grid' || viewMode === 'map') && viewMode === 'grid' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredSaleComps.map((sc) => {
                                    const txs = (sc.sale_transactions ?? []).sort(
                                        (a, b) => new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
                                    );
                                    const latest = txs[0];
                                    return (
                                        <div
                                            key={sc.id}
                                            className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-[#6366F1]/40 hover:shadow-md transition-all cursor-pointer"
                                            onClick={() => router.push(`/comps/sales/${sc.short_id}`)}
                                        >
                                            {isAdminOrOwner && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteSaleCompId(sc.id); }}
                                                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 text-[var(--text-faint)] hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <div className="mb-3">
                                                <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate pr-8">{sc.name}</h3>
                                                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                                    {[sc.address, sc.city, sc.state].filter(Boolean).join(', ') || 'No address'}
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {sc.property_type && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Building2 className="w-3 h-3 text-[var(--accent)]" />
                                                        <div>
                                                            <div className="text-[10px] text-[var(--text-faint)] uppercase">Type</div>
                                                            <div className="text-xs font-semibold text-[var(--text-primary)]">{sc.property_type}</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {sc.total_units && sc.total_units > 0 && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Landmark className="w-3 h-3 text-[var(--accent)]" />
                                                        <div>
                                                            <div className="text-[10px] text-[var(--text-faint)] uppercase">Units</div>
                                                            <div className="text-xs font-semibold text-[var(--text-primary)]">{sc.total_units}</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {latest?.sale_price && (
                                                    <div className="flex items-center gap-1.5">
                                                        <DollarSign className="w-3 h-3 text-[var(--accent)]" />
                                                        <div>
                                                            <div className="text-[10px] text-[var(--text-faint)] uppercase">Last Sale</div>
                                                            <div className="text-xs font-semibold text-[var(--text-primary)]">{formatCurrency(latest.sale_price)}</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {latest?.cap_rate && (
                                                    <div className="flex items-center gap-1.5">
                                                        <TrendingUp className="w-3 h-3 text-[var(--accent)]" />
                                                        <div>
                                                            <div className="text-[10px] text-[var(--text-faint)] uppercase">Cap Rate</div>
                                                            <div className="text-xs font-semibold text-[var(--text-primary)]">{(latest.cap_rate * 100).toFixed(2)}%</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-[var(--table-row-border)] flex items-center justify-between">
                                                <span className="text-[10px] text-[var(--text-faint)]">Added {new Date(sc.created_at).toLocaleDateString()}</span>
                                                {txs.length > 0 && (
                                                    <span className="text-[10px] bg-[#EEF2FF] text-[var(--accent)] px-1.5 py-0.5 rounded-full font-medium">
                                                        {txs.length} sale{txs.length > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Sale Comps List View */}
                        {!loadingSaleComps && viewMode === 'list' && filteredSaleComps.length > 0 && (
                            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Name</th>
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden sm:table-cell">Location</th>
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Type</th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Units</th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Last Sale</th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden lg:table-cell">Cap Rate</th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden lg:table-cell">Year Built</th>
                                            {isAdminOrOwner && <th className="w-10"></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSaleComps.map((sc) => {
                                            const txs = (sc.sale_transactions ?? []).sort(
                                                (a, b) => new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
                                            );
                                            const latest = txs[0];
                                            return (
                                                <tr
                                                    key={sc.id}
                                                    className="group border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors"
                                                    onClick={() => router.push(`/comps/sales/${sc.short_id}`)}
                                                >
                                                    <td className="px-4 py-3">
                                                        <span className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">{sc.name}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-[var(--text-muted)] hidden sm:table-cell">
                                                        {[sc.city, sc.state].filter(Boolean).join(', ') || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                                                        {sc.property_type || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden md:table-cell">
                                                        {sc.total_units || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                                                        {latest?.sale_price ? formatCurrency(latest.sale_price) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden lg:table-cell">
                                                        {latest?.cap_rate ? `${(latest.cap_rate * 100).toFixed(2)}%` : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs text-[var(--text-muted)] hidden lg:table-cell">
                                                        {sc.year_built ?? '—'}
                                                    </td>
                                                    {isAdminOrOwner && (
                                                        <td className="px-4 py-1 text-right">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setDeleteSaleCompId(sc.id); }}
                                                                className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all opacity-0 group-hover:opacity-100"
                                                                title="Delete sale comp"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Sale Comps Map View */}
                        {!loadingSaleComps && viewMode === 'map' && (
                            <SaleCompsMap comps={filteredSaleComps} />
                        )}

                        {!loadingSaleComps && filteredSaleComps.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center mb-4">
                                    <Building2 className="w-8 h-8 text-[var(--text-faint)]" />
                                </div>
                                <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">
                                    {saleComps.length === 0 ? 'No sale comps yet' : 'No matching sale comps'}
                                </h3>
                                <p className="text-sm text-[var(--text-muted)] max-w-md">
                                    {saleComps.length === 0
                                        ? 'Add your first building sale comparable to start tracking market data.'
                                        : 'Try adjusting your search.'}
                                </p>
                                {saleComps.length === 0 && (
                                    <button
                                        onClick={() => setShowNewSaleDialog(true)}
                                        className="mt-6 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[#4F46E5] text-white text-sm font-medium transition-colors shadow-sm"
                                    >
                                        Add First Sale Comp
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ═══ Create Comp Dialog ═══ */}
            {showNewDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowNewDialog(false); resetForm(); }}>
                    <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">New Land Comp</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-1 block">Name *</label>
                                <input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="e.g. 123 Main St Assemblage"
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#0D9488] focus:outline-none"
                                    autoFocus
                                />
                            </div>

                            {landDuplicates.length > 0 && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs">
                                        <span className="font-semibold">Possible duplicate{landDuplicates.length > 1 ? 's' : ''}:</span>{' '}
                                        {landDuplicates.slice(0, 3).map(d => d.name).join(', ')}
                                        {landDuplicates.length > 3 && ` +${landDuplicates.length - 3} more`}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAddressMode('search')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${addressMode === 'search' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--bg-elevated)]'}`}
                                >
                                    <MapPin className="w-3 h-3" /> Address Search
                                </button>
                                <button
                                    onClick={() => setAddressMode('coords')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${addressMode === 'coords' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--bg-elevated)]'}`}
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
                                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#0D9488] focus:outline-none"
                                    />
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                            {suggestions.map((s: any) => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => selectSuggestion(s)}
                                                    className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                                >
                                                    {s.place_name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input value={coordLatStr} onChange={(e) => setCoordLatStr(e.target.value)} placeholder="Latitude" className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#0D9488] focus:outline-none" />
                                    <input value={coordLngStr} onChange={(e) => setCoordLngStr(e.target.value)} placeholder="Longitude" className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#0D9488] focus:outline-none" />
                                    <button onClick={applyCoords} className="px-3 py-2 rounded-lg bg-[#0D9488]/10 text-[#0D9488] text-sm font-medium hover:bg-[#0D9488]/20 transition-colors">Apply</button>
                                </div>
                            )}

                            {newLat && newLng && (
                                <div className="text-xs text-[var(--success)] bg-[var(--success-bg)] px-2.5 py-1.5 rounded-md">
                                    ✓ Location set: {newLat.toFixed(4)}, {newLng.toFixed(4)}
                                    {newAddress && ` — ${newAddress}`}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => { setShowNewDialog(false); resetForm(); }} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Cancel</button>
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
                    <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Delete Comp?</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-4">This will permanently delete this comp and its data. This action cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteCompId(null)} className="px-4 py-2 text-sm text-[var(--text-muted)]">Cancel</button>
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

            {/* ═══ Create Sale Comp Dialog ═══ */}
            {showNewSaleDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowNewSaleDialog(false)}>
                    <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">New Sale Comp</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-1 block">Property Name *</label>
                                <input
                                    value={saleName}
                                    onChange={(e) => setSaleName(e.target.value)}
                                    placeholder="e.g. The Residences at Main"
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#6366F1] focus:outline-none"
                                    autoFocus
                                />
                            </div>

                            {saleDuplicates.length > 0 && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs">
                                        <span className="font-semibold">Possible duplicate{saleDuplicates.length > 1 ? 's' : ''}:</span>{' '}
                                        {saleDuplicates.slice(0, 3).map(d => d.name).join(', ')}
                                        {saleDuplicates.length > 3 && ` +${saleDuplicates.length - 3} more`}
                                    </div>
                                </div>
                            )}

                            <div className="relative">
                                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-1 block">Address</label>
                                <div className="relative flex items-center">
                                    <Search className="absolute left-2.5 w-3.5 h-3.5 text-[var(--text-faint)] pointer-events-none" />
                                    <input
                                        value={saleAddressSearch}
                                        onChange={(e) => handleSaleAddressSearch(e.target.value)}
                                        placeholder="Search for an address..."
                                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#6366F1] focus:outline-none"
                                    />
                                </div>
                                {showSaleSuggestions && saleSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                        {saleSuggestions.map((s: any) => (
                                            <button
                                                key={s.id}
                                                onClick={() => selectSaleSuggestion(s)}
                                                className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                            >
                                                <div className="font-medium text-xs">{s.text}</div>
                                                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.place_name}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {saleLat !== null && (
                                <div className="text-xs text-[var(--success)] bg-[var(--success-bg)] px-2.5 py-1.5 rounded-md">
                                    ✓ Location set: {saleLat.toFixed(4)}, {saleLng!.toFixed(4)}
                                    {saleAddress && ` — ${saleAddress}`}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-1 block">City</label>
                                    <input
                                        value={saleCity}
                                        onChange={(e) => setSaleCity(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#6366F1] focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-1 block">State</label>
                                    <input
                                        value={saleState}
                                        onChange={(e) => setSaleState(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#6366F1] focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-1 block">Property Type</label>
                                <select
                                    value={salePropertyType}
                                    onChange={(e) => setSalePropertyType(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#6366F1] focus:outline-none"
                                >
                                    <option value="">Select type...</option>
                                    {productTypes.filter(pt => pt.is_active).map(pt => (
                                        <option key={pt.id} value={pt.name}>{pt.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowNewSaleDialog(false)} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Cancel</button>
                            <button
                                onClick={handleCreateSaleComp}
                                disabled={!saleName.trim() || createSaleComp.isPending}
                                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[#4F46E5] disabled:opacity-50 transition-colors"
                            >
                                {createSaleComp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Sale Comp'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Delete Sale Comp Confirm ═══ */}
            {deleteSaleCompId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteSaleCompId(null)}>
                    <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Delete Sale Comp?</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-4">This will permanently delete this sale comp and all its transactions. This action cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteSaleCompId(null)} className="px-4 py-2 text-sm text-[var(--text-muted)]">Cancel</button>
                            <button
                                onClick={async () => {
                                    await deleteSaleCompMutation.mutateAsync(deleteSaleCompId);
                                    setDeleteSaleCompId(null);
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
