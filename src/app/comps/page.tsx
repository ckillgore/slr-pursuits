'use client';

import { useState, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useLandComps, useCreateLandComp, useDeleteLandComp, useSaleComps, useCreateSaleComp, useDeleteSaleComp, useProductTypes } from '@/hooks/useSupabaseQueries';
import { useAllHellodataProperties } from '@/hooks/useHellodataQueries';
import {
    Search, Landmark, Loader2, Plus, Trash2, MapPin, Navigation, DollarSign,
    Calendar, Ruler, LayoutGrid, List, Map, Building2, TrendingUp, AlertTriangle, Home, ExternalLink,
} from 'lucide-react';
import type { LandComp, SaleComp, HellodataProperty } from '@/types';
import { toast } from '@/lib/toast';
import { landPricePerSf } from '@/components/pursuits/compDerived';
import { CompsMap, type CompsMapPoint } from '@/components/comps/CompsMap';
import { searchPlaces, geocodeForStorage, reverseGeocode, type GeocodeResult } from '@/lib/geocoding';

function formatCurrency(val: number | null) {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}
/** $/SF keeps cents ($2.15/SF), unlike whole-dollar prices */
function fmtPsf(val: number | null) {
    if (val == null || !Number.isFinite(val) || val <= 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}
function formatNumber(val: number | null, decimals = 0) {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(val);
}

/** Cards/rows rendered per "Show more" step — the all-properties rent list can reach thousands of rows */
const PAGE_SIZE = 60;

/** Latest occupancy snapshot by as_of date (HelloData doesn't guarantee array order) */
function getOccupancy(p: HellodataProperty): number | null {
    const occ = p.occupancy_over_time;
    if (!occ || !Array.isArray(occ) || occ.length === 0) return null;
    const latest = occ.reduce((a, o) => ((o?.as_of || '') > (a?.as_of || '') ? o : a), occ[0]);
    return latest?.leased != null ? Math.round(latest.leased * 100) : null;
}

/** Keyboard/screen-reader props for a clickable card or table row that navigates */
function linkProps(label: string, go: () => void) {
    return {
        role: 'link' as const,
        tabIndex: 0,
        'aria-label': label,
        onClick: go,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); go(); } },
    };
}

const MAP_TABS = {
    rent: { accentColor: '#2563EB', emptyTitle: 'No rent comps with location data' },
    land: { accentColor: '#0D9488', emptyTitle: 'No comps with location data' },
    sales: {
        accentColor: '#6366F1',
        emptyTitle: 'No sale comps with location data',
        emptyHint: 'Add an address when creating sale comps to see them on the map',
    },
} as const;

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
    if (shown >= total) return null;
    return (
        <div className="flex flex-col items-center gap-1 mt-4">
            <button
                onClick={onMore}
                className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
                Show {Math.min(PAGE_SIZE, total - shown)} more
            </button>
            <span className="text-[11px] text-[var(--text-faint)]">Showing {shown.toLocaleString()} of {total.toLocaleString()}</span>
        </div>
    );
}

/** Date-only strings ("2024-03-01") are parsed as local dates so they don't shift a day in US timezones */
function parseDateOnly(d: string): Date {
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
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

    // Rent comps (Hellodata properties)
    const { data: rentComps = [], isLoading: loadingRentComps } = useAllHellodataProperties();

    const [activeSection, setActiveSection] = useState<'rent' | 'land' | 'sales'>('rent');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'name' | 'price'>('newest');
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
    const [rentSearchQuery, setRentSearchQuery] = useState('');
    const [rentFilterState, setRentFilterState] = useState('');
    const [rentFilterCity, setRentFilterCity] = useState('');
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
    const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
    const [locating, setLocating] = useState(false);
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
    const [saleSuggestions, setSaleSuggestions] = useState<GeocodeResult[]>([]);
    const [saleLocating, setSaleLocating] = useState(false);
    const [showSaleSuggestions, setShowSaleSuggestions] = useState(false);
    const saleSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saleSearchSeqRef = useRef(0);
    const searchSeqRef = useRef(0);

    // Product types from DB
    const { data: productTypes = [] } = useProductTypes();

    // Filter on deferred copies of the search text so typing stays responsive on long lists
    const deferredSearch = useDeferredValue(searchQuery);
    const deferredSaleSearch = useDeferredValue(saleSearchQuery);
    const deferredRentSearch = useDeferredValue(rentSearchQuery);

    // Memoized so the map view isn't torn down and rebuilt on every unrelated re-render
    const filteredRent = useMemo(() => {
        const q = deferredRentSearch.toLowerCase();
        return rentComps.filter((c) => {
            if (rentFilterState && c.state !== rentFilterState) return false;
            if (rentFilterCity && c.city !== rentFilterCity) return false;
            if (!q) return true;
            return (
                c.building_name?.toLowerCase().includes(q) ||
                c.street_address?.toLowerCase().includes(q) ||
                c.city?.toLowerCase().includes(q) ||
                c.management_company?.toLowerCase().includes(q)
            );
        });
    }, [rentComps, rentFilterState, rentFilterCity, deferredRentSearch]);
    const rentStates = useMemo(() => [...new Set(rentComps.map(c => c.state).filter(Boolean))].sort() as string[], [rentComps]);
    const rentCities = useMemo(
        () => [...new Set(rentComps.filter(c => c.state === rentFilterState).map(c => c.city).filter(Boolean))].sort() as string[],
        [rentComps, rentFilterState]
    );

    const filteredSaleComps = useMemo(() => {
        const list = saleComps.filter((c) => {
            if (filterState && c.state !== filterState) return false;
            if (filterCity && c.city !== filterCity) return false;
            if (saleFilterPropertyType && c.property_type !== saleFilterPropertyType) return false;
            if (!deferredSaleSearch) return true;
            const q = deferredSaleSearch.toLowerCase();
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
    }, [saleComps, deferredSaleSearch, saleSortBy, filterState, filterCity, saleFilterPropertyType]);

    // Sale comp address autocomplete (temporary geocodes — display only)
    const handleSaleAddressSearch = useCallback((query: string) => {
        setSaleAddressSearch(query);
        setSaleAddress(query);
        if (saleSearchTimeoutRef.current) clearTimeout(saleSearchTimeoutRef.current);
        const seq = ++saleSearchSeqRef.current;
        if (!query.trim() || query.length < 3) {
            setSaleSuggestions([]); setShowSaleSuggestions(false); return;
        }
        saleSearchTimeoutRef.current = setTimeout(async () => {
            try {
                const results = await searchPlaces(query);
                if (seq !== saleSearchSeqRef.current) return; // stale response
                setSaleSuggestions(results);
                setShowSaleSuggestions(true);
            } catch (err) {
                console.error('Address search failed:', err);
            }
        }, 300);
    }, []);

    // The picked suggestion is geocoded again in permanent mode; only that result's coordinates are saved
    const selectSaleSuggestion = useCallback(async (s: GeocodeResult) => {
        if (saleSearchTimeoutRef.current) clearTimeout(saleSearchTimeoutRef.current);
        const seq = ++saleSearchSeqRef.current;
        setSaleAddressSearch(s.label);
        setSaleSuggestions([]);
        setShowSaleSuggestions(false);
        setSaleLat(null);
        setSaleLng(null);
        setSaleLocating(true);
        try {
            const r = await geocodeForStorage(s);
            if (seq !== saleSearchSeqRef.current) return;
            if (!r) throw new Error('No permanent match');
            setSaleAddress(r.address || r.name);
            setSaleCity(r.city);
            setSaleState(r.state);
            setSaleZip(r.zip);
            setSaleCounty(r.county);
            setSaleLat(r.lat);
            setSaleLng(r.lng);
        } catch (err) {
            if (seq !== saleSearchSeqRef.current) return;
            setSaleAddress(s.address || s.name);
            setSaleCity(s.city);
            setSaleState(s.state);
            setSaleZip(s.zip);
            setSaleCounty(s.county);
            toast.error('That address could not be located — the comp will be saved without map coordinates', err);
        } finally {
            if (seq === saleSearchSeqRef.current) setSaleLocating(false);
        }
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
            setSaleAddressSearch(''); setSaleSuggestions([]); setShowSaleSuggestions(false); setSaleLocating(false);
            setShowNewSaleDialog(false);
            router.push(`/comps/sales/${created.short_id}`);
        } catch (err) {
            console.error('Failed to create sale comp:', err);
            toast.error('Failed to create sale comp', err);
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
            if (!deferredSearch) return true;
            const q = deferredSearch.toLowerCase();
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
    }, [comps, deferredSearch, sortBy, filterState, filterCity]);

    const landMapPoints = useMemo<CompsMapPoint[]>(() => filtered
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
            id: c.id, lng: c.longitude!, lat: c.latitude!, title: c.name,
            subtitle: c.sale_price ? formatCurrency(c.sale_price) : '',
            href: `/comps/${c.short_id || c.id}`,
        })), [filtered]);
    const saleMapPoints = useMemo<CompsMapPoint[]>(() => filteredSaleComps
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => {
            const latest = [...(c.sale_transactions ?? [])].sort(
                (a, b) => new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
            )[0];
            return {
                id: c.id, lng: c.longitude!, lat: c.latitude!, title: c.name,
                subtitle: latest?.sale_price ? formatCurrency(latest.sale_price) : '',
                href: `/comps/sales/${c.short_id || c.id}`,
            };
        }), [filteredSaleComps]);
    const rentMapPoints = useMemo<CompsMapPoint[]>(() => filteredRent
        .filter((c) => c.lat != null && c.lon != null)
        .map((c) => ({
            id: c.id, lng: c.lon!, lat: c.lat!, title: c.building_name || c.street_address || 'Property',
            subtitle: c.number_units ? `${c.number_units} units` : '',
            href: `/comps/rent/${c.id}`,
        })), [filteredRent]);
    const mapPoints = activeSection === 'rent' ? rentMapPoints : activeSection === 'land' ? landMapPoints : saleMapPoints;
    const sectionLoading = activeSection === 'rent' ? loadingRentComps : activeSection === 'land' ? isLoading : loadingSaleComps;

    // Incremental rendering: the visible count resets whenever the list identity (tab / view / filters) changes
    const listKey = [activeSection, viewMode, deferredSearch, deferredSaleSearch, deferredRentSearch, sortBy, saleSortBy,
        filterState, filterCity, saleFilterPropertyType, rentFilterState, rentFilterCity].join('|');
    const [shown, setShown] = useState({ key: '', count: PAGE_SIZE });
    const visibleCount = shown.key === listKey ? shown.count : PAGE_SIZE;
    const showMore = () => setShown({ key: listKey, count: visibleCount + PAGE_SIZE });

    // Address autocomplete (temporary geocodes — display only)
    const handleAddressSearch = useCallback((query: string) => {
        setAddressSearch(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const seq = ++searchSeqRef.current;
        if (!query.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const results = await searchPlaces(query);
                if (seq !== searchSeqRef.current) return; // stale response
                setSuggestions(results);
                setShowSuggestions(true);
            } catch (err) {
                console.error('Address search failed:', err);
            }
        }, 300);
    }, []);

    // The picked suggestion is geocoded again in permanent mode; only that result's coordinates are saved
    const selectSuggestion = useCallback(async (s: GeocodeResult) => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const seq = ++searchSeqRef.current;
        setAddressSearch(s.label);
        setSuggestions([]);
        setShowSuggestions(false);
        setNewLat(null);
        setNewLng(null);
        setLocating(true);
        try {
            const r = await geocodeForStorage(s);
            if (seq !== searchSeqRef.current) return;
            if (!r) throw new Error('No permanent match');
            setNewAddress(r.address || r.name);
            setNewCity(r.city);
            setNewState(r.state);
            setNewZip(r.zip);
            setNewCounty(r.county);
            setNewLat(r.lat);
            setNewLng(r.lng);
        } catch (err) {
            if (seq !== searchSeqRef.current) return;
            setNewAddress(s.address || s.name);
            setNewCity(s.city);
            setNewState(s.state);
            setNewZip(s.zip);
            setNewCounty(s.county);
            toast.error('That address could not be located — the comp will be saved without map coordinates', err);
        } finally {
            if (seq === searchSeqRef.current) setLocating(false);
        }
    }, []);

    // Typed coordinates are saved as-is; the address for them comes from a permanent reverse geocode
    const applyCoords = async () => {
        const lat = parseFloat(coordLatStr);
        const lng = parseFloat(coordLngStr);
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
        const seq = ++searchSeqRef.current;
        setNewLat(lat);
        setNewLng(lng);
        setLocating(true);
        try {
            const r = await reverseGeocode(lng, lat, { permanent: true });
            if (seq !== searchSeqRef.current || !r) return;
            setNewAddress(r.address || r.name);
            setNewCity(r.city);
            setNewState(r.state);
            setNewZip(r.zip);
            setNewCounty(r.county);
        } catch (err) {
            console.error('Reverse geocode failed:', err);
        } finally {
            if (seq === searchSeqRef.current) setLocating(false);
        }
    };

    const resetForm = () => {
        setNewName(''); setNewAddress(''); setNewCity(''); setNewState('');
        setNewCounty(''); setNewZip(''); setNewLat(null); setNewLng(null);
        setAddressSearch(''); setCoordLatStr(''); setCoordLngStr('');
        setSuggestions([]); setShowSuggestions(false); setAddressMode('search');
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchSeqRef.current++; // drop any in-flight geocode
        setLocating(false);
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
            toast.error('Failed to create land comp', err);
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
                            {activeSection === 'rent'
                                ? `${rentComps.length} rent comp${rentComps.length !== 1 ? 's' : ''}`
                                : activeSection === 'land'
                                ? `${comps.length} land comp${comps.length !== 1 ? 's' : ''}`
                                : `${saleComps.length} sale comp${saleComps.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* View Mode Toggle */}
                        <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5">
                            <button
                                onClick={() => setViewMode('grid')}
                                aria-pressed={viewMode === 'grid'}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <LayoutGrid className="w-4 h-4" /> Grid
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                aria-pressed={viewMode === 'list'}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <List className="w-4 h-4" /> List
                            </button>
                            <button
                                onClick={() => setViewMode('map')}
                                aria-pressed={viewMode === 'map'}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'map' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                            >
                                <Map className="w-4 h-4" /> Map
                            </button>
                        </div>
                        {activeSection !== 'rent' && (
                            <button
                                onClick={() => activeSection === 'land' ? setShowNewDialog(true) : setShowNewSaleDialog(true)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors shadow-sm ${activeSection === 'land' ? 'bg-[#0D9488] hover:bg-[#0F766E]' : 'bg-[var(--accent)] hover:bg-[#4F46E5]'}`}
                            >
                                <Plus className="w-4 h-4" />
                                {activeSection === 'land' ? 'New Land Comp' : 'New Sale Comp'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 mb-6 border-b border-[var(--border)] overflow-x-auto">
                    <button
                        onClick={() => { setActiveSection('rent'); setRentFilterState(''); setRentFilterCity(''); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${activeSection === 'rent' ? 'text-[#2563EB] border-[#2563EB]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'}`}
                    >
                        <Home className="w-4 h-4" /> Rent Comps
                    </button>
                    <button
                        onClick={() => { setActiveSection('land'); setFilterState(''); setFilterCity(''); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${activeSection === 'land' ? 'text-[#0D9488] border-[#0D9488]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'}`}
                    >
                        <Landmark className="w-4 h-4" /> Land Comps
                    </button>
                    <button
                        onClick={() => { setActiveSection('sales'); setFilterState(''); setFilterCity(''); setSaleFilterPropertyType(''); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${activeSection === 'sales' ? 'text-[var(--accent)] border-[#6366F1]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'}`}
                    >
                        <Building2 className="w-4 h-4" /> Sale Comps
                    </button>
                </div>

                {/* ═══ RENT COMPS SECTION ═══ */}
                {activeSection === 'rent' && (<>
                    {/* Filter Bar */}
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <div className="flex-1 min-w-[200px] relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                            <input
                                type="text"
                                value={rentSearchQuery}
                                onChange={(e) => setRentSearchQuery(e.target.value)}
                                placeholder="Search rent comps..."
                                aria-label="Search rent comps"
                                className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 focus:outline-none transition-all"
                            />
                        </div>
                        {(
                            <>
                                <select
                                    value={rentFilterState}
                                    onChange={(e) => { setRentFilterState(e.target.value); setRentFilterCity(''); }}
                                    className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#2563EB] focus:outline-none"
                                >
                                    <option value="">All States</option>
                                    {rentStates.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {rentFilterState && (
                                    <select
                                        value={rentFilterCity}
                                        onChange={(e) => setRentFilterCity(e.target.value)}
                                        className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#2563EB] focus:outline-none"
                                    >
                                        <option value="">All Cities</option>
                                        {rentCities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                )}
                            </>
                        )}
                    </div>

                    {/* Loading */}
                    {loadingRentComps && (
                        <div className="flex justify-center py-24">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
                        </div>
                    )}

                    <>
                            {/* Grid View */}
                            {!loadingRentComps && viewMode === 'grid' && filteredRent.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredRent.slice(0, visibleCount).map((c) => {
                                        const occ = getOccupancy(c);
                                        return (
                                            <div
                                                key={c.id}
                                                className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-[#2563EB]/40 hover:shadow-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                                                {...linkProps(`Open ${c.building_name || c.street_address || 'property'}`, () => router.push(`/comps/rent/${c.id}`))}
                                            >
                                                <div className="mb-3">
                                                    <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate pr-4">{c.building_name || c.street_address || 'Unknown Property'}</h3>
                                                    <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                                        {[c.street_address, c.city, c.state].filter(Boolean).join(', ') || 'No address'}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    {c.number_units != null && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Building2 className="w-3 h-3 text-[#2563EB]" />
                                                            <div>
                                                                <div className="text-[10px] text-[var(--text-faint)] uppercase">Units</div>
                                                                <div className="text-xs font-semibold text-[var(--text-primary)]">{c.number_units}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {c.year_built != null && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                                                            <div>
                                                                <div className="text-[10px] text-[var(--text-faint)] uppercase">Year Built</div>
                                                                <div className="text-xs text-[var(--text-secondary)]">{c.year_built}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {occ != null && (
                                                        <div className="flex items-center gap-1.5">
                                                            <TrendingUp className="w-3 h-3 text-[var(--success)]" />
                                                            <div>
                                                                <div className="text-[10px] text-[var(--text-faint)] uppercase">Occupancy</div>
                                                                <div className={`text-xs font-semibold ${occ >= 95 ? 'text-[var(--success)]' : occ >= 90 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>{occ}%</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {c.management_company && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Landmark className="w-3 h-3 text-[var(--text-muted)]" />
                                                            <div>
                                                                <div className="text-[10px] text-[var(--text-faint)] uppercase">Manager</div>
                                                                <div className="text-xs text-[var(--text-secondary)] truncate max-w-[100px]">{c.management_company}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-3 pt-2 border-t border-[var(--table-row-border)] flex items-center justify-between">
                                                    <span className="text-[10px] text-[var(--text-faint)]">
                                                        {c.is_lease_up && <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--warning)]/10 text-[var(--warning)] font-medium mr-1">Lease-Up</span>}
                                                        {c.number_stories ? `${c.number_stories} stories` : ''}
                                                    </span>
                                                    {c.building_website && (
                                                        <ExternalLink className="w-3 h-3 text-[var(--text-faint)]" />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* List View */}
                            {!loadingRentComps && viewMode === 'list' && filteredRent.length > 0 && (
                                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                                                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Property</th>
                                                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden sm:table-cell">Location</th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Units</th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Year Built</th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Occupancy</th>
                                                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden lg:table-cell">Manager</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRent.slice(0, visibleCount).map((c) => {
                                                const occ = getOccupancy(c);
                                                return (
                                                    <tr
                                                        key={c.id}
                                                        className="group border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors focus:outline-none focus-visible:bg-[var(--bg-elevated)]"
                                                        {...linkProps(`Open ${c.building_name || c.street_address || 'property'}`, () => router.push(`/comps/rent/${c.id}`))}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <span className="font-semibold text-[var(--text-primary)] hover:text-[#2563EB] transition-colors">{c.building_name || c.street_address || 'Unknown'}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-[var(--text-muted)] hidden sm:table-cell">
                                                            {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                                                            {c.number_units ?? '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden md:table-cell">
                                                            {c.year_built ?? '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right hidden md:table-cell">
                                                            {occ != null ? (
                                                                <span className={`font-semibold ${occ >= 95 ? 'text-[var(--success)]' : occ >= 90 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>{occ}%</span>
                                                            ) : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-[var(--text-muted)] hidden lg:table-cell truncate max-w-[150px]">
                                                            {c.management_company ?? '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!loadingRentComps && viewMode !== 'map' && (
                                <ShowMore shown={Math.min(visibleCount, filteredRent.length)} total={filteredRent.length} onMore={showMore} />
                            )}

                            {/* Empty State */}
                            {!loadingRentComps && filteredRent.length === 0 && viewMode !== 'map' && (
                                <div className="text-center py-16">
                                    <Home className="w-12 h-12 text-[var(--border-strong)] mx-auto mb-3" />
                                    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">{rentComps.length === 0 ? 'No rent comps yet' : 'No matching rent comps'}</h3>
                                    <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                                        {rentComps.length === 0
                                            ? <>Rent comps are loaded from Hellodata when added to a pursuit. Go to a pursuit&apos;s Rent Comps tab to search and add properties.</>
                                            : 'Try adjusting your search or filters.'}
                                    </p>
                                </div>
                            )}
                        </>
                </>)}

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
                                aria-label="Search land comps"
                                className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/10 focus:outline-none transition-all"
                            />
                        </div>
                        {(
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
                                {viewMode !== 'map' && <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as any)}
                                    className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[#0D9488] focus:outline-none"
                                >
                                    <option value="newest">Newest First</option>
                                    <option value="name">Name A→Z</option>
                                    <option value="price">Highest Price</option>
                                </select>}
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
                            {filtered.slice(0, visibleCount).map((comp) => (
                                <div
                                    key={comp.id}
                                    className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-[#0D9488]/40 hover:shadow-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                                    {...linkProps(`Open ${comp.name}`, () => router.push(`/comps/${comp.short_id}`))}
                                >
                                    {/* Delete button — admin/owner only */}
                                    {isAdminOrOwner && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteCompId(comp.id); }}
                                            onKeyDown={(e) => e.stopPropagation()}
                                            aria-label={`Delete ${comp.name}`}
                                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-md hover:bg-[var(--danger-bg)] text-[var(--text-faint)] hover:text-[var(--danger)] transition-all"
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
                                        {landPricePerSf(comp).value != null && (
                                            <div className="flex items-center gap-1.5">
                                                <Ruler className="w-3 h-3 text-[#0D9488]" />
                                                <div>
                                                    <div className="text-[10px] text-[var(--text-faint)] uppercase">Price/SF{landPricePerSf(comp).derived ? ' (calc.)' : ''}</div>
                                                    <div className="text-xs font-semibold text-[var(--text-primary)]">{fmtPsf(landPricePerSf(comp).value)}</div>
                                                </div>
                                            </div>
                                        )}
                                        {comp.sale_date && (
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                                                <div>
                                                    <div className="text-[10px] text-[var(--text-faint)] uppercase">Sale Date</div>
                                                    <div className="text-xs text-[var(--text-secondary)]">{parseDateOnly(comp.sale_date).toLocaleDateString()}</div>
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
                        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-x-auto">
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
                                    {filtered.slice(0, visibleCount).map((c) => (
                                        <tr
                                            key={c.id}
                                            className="group border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors focus:outline-none focus-visible:bg-[var(--bg-elevated)]"
                                            {...linkProps(`Open ${c.name}`, () => router.push(`/comps/${c.short_id}`))}
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
                                            <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden md:table-cell" title={landPricePerSf(c).derived ? 'Calculated from sale price ÷ site area' : undefined}>
                                                {fmtPsf(landPricePerSf(c).value)}{landPricePerSf(c).derived ? '*' : ''}
                                            </td>
                                            <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden md:table-cell">
                                                {c.site_area_sf > 0 ? formatNumber(c.site_area_sf) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-[var(--text-muted)] hidden lg:table-cell">
                                                {c.sale_date ? parseDateOnly(c.sale_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                            </td>
                                            {isAdminOrOwner && (
                                                <td className="px-4 py-1 text-right">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDeleteCompId(c.id); }}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        title="Delete comp"
                                                        aria-label={`Delete ${c.name}`}
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

                    {!isLoading && viewMode !== 'map' && (
                        <ShowMore shown={Math.min(visibleCount, filtered.length)} total={filtered.length} onMore={showMore} />
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
                                    aria-label="Search sale comps"
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

                        {!loadingSaleComps && filteredSaleComps.length > 0 && viewMode === 'grid' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredSaleComps.slice(0, visibleCount).map((sc) => {
                                    const txs = [...(sc.sale_transactions ?? [])].sort(
                                        (a, b) => new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
                                    );
                                    const latest = txs[0];
                                    return (
                                        <div
                                            key={sc.id}
                                            className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-[#6366F1]/40 hover:shadow-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]"
                                            {...linkProps(`Open ${sc.name}`, () => router.push(`/comps/sales/${sc.short_id}`))}
                                        >
                                            {isAdminOrOwner && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteSaleCompId(sc.id); }}
                                                    onKeyDown={(e) => e.stopPropagation()}
                                                    aria-label={`Delete ${sc.name}`}
                                                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-md hover:bg-[var(--danger-bg)] text-[var(--text-faint)] hover:text-[var(--danger)] transition-all"
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
                                                {sc.total_units != null && sc.total_units > 0 && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Landmark className="w-3 h-3 text-[var(--accent)]" />
                                                        <div>
                                                            <div className="text-[10px] text-[var(--text-faint)] uppercase">Units</div>
                                                            <div className="text-xs font-semibold text-[var(--text-primary)]">{sc.total_units}</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {latest?.sale_price ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <DollarSign className="w-3 h-3 text-[var(--accent)]" />
                                                        <div>
                                                            <div className="text-[10px] text-[var(--text-faint)] uppercase">Last Sale</div>
                                                            <div className="text-xs font-semibold text-[var(--text-primary)]">{formatCurrency(latest.sale_price)}</div>
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {latest?.cap_rate ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <TrendingUp className="w-3 h-3 text-[var(--accent)]" />
                                                        <div>
                                                            <div className="text-[10px] text-[var(--text-faint)] uppercase">Cap Rate</div>
                                                            <div className="text-xs font-semibold text-[var(--text-primary)]">{(latest.cap_rate * 100).toFixed(2)}%</div>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-[var(--table-row-border)] flex items-center justify-between">
                                                <span className="text-[10px] text-[var(--text-faint)]">Added {new Date(sc.created_at).toLocaleDateString()}</span>
                                                {txs.length > 0 && (
                                                    <span className="text-[10px] bg-[var(--accent-subtle)] text-[var(--accent)] px-1.5 py-0.5 rounded-full font-medium">
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
                            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-x-auto">
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
                                        {filteredSaleComps.slice(0, visibleCount).map((sc) => {
                                            const txs = [...(sc.sale_transactions ?? [])].sort(
                                                (a, b) => new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
                                            );
                                            const latest = txs[0];
                                            return (
                                                <tr
                                                    key={sc.id}
                                                    className="group border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors focus:outline-none focus-visible:bg-[var(--bg-elevated)]"
                                                    {...linkProps(`Open ${sc.name}`, () => router.push(`/comps/sales/${sc.short_id}`))}
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
                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                                title="Delete sale comp"
                                                                aria-label={`Delete ${sc.name}`}
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

                        {!loadingSaleComps && viewMode !== 'map' && (
                            <ShowMore shown={Math.min(visibleCount, filteredSaleComps.length)} total={filteredSaleComps.length} onMore={showMore} />
                        )}

                        {!loadingSaleComps && filteredSaleComps.length === 0 && viewMode !== 'map' && (
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

                {/* One map for every tab: switching tabs or filters updates it in place */}
                {viewMode === 'map' && !sectionLoading && (
                    <CompsMap points={mapPoints} {...MAP_TABS[activeSection]} />
                )}
            </div>

            {/* ═══ Create Comp Dialog ═══ */}
            {showNewDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={() => { setShowNewDialog(false); resetForm(); }}>
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
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning)]/30 text-[var(--warning)]">
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
                                            {suggestions.map((s) => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => void selectSuggestion(s)}
                                                    className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                                >
                                                    <div className="font-medium text-xs">{s.name}</div>
                                                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.secondary}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input value={coordLatStr} onChange={(e) => setCoordLatStr(e.target.value)} placeholder="Latitude" className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#0D9488] focus:outline-none" />
                                    <input value={coordLngStr} onChange={(e) => setCoordLngStr(e.target.value)} placeholder="Longitude" className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[#0D9488] focus:outline-none" />
                                    <button onClick={() => void applyCoords()} className="px-3 py-2 rounded-lg bg-[#0D9488]/10 text-[#0D9488] text-sm font-medium hover:bg-[#0D9488]/20 transition-colors">Apply</button>
                                </div>
                            )}

                            {locating && (
                                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Locating address…
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
                                disabled={!newName.trim() || createComp.isPending || locating}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={() => setDeleteCompId(null)}>
                    <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Delete Comp?</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-4">This will permanently delete this comp and its data. This action cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteCompId(null)} className="px-4 py-2 text-sm text-[var(--text-muted)]">Cancel</button>
                            <button
                                onClick={async () => {
                                    try {
                                        await deleteCompMutation.mutateAsync(deleteCompId);
                                        setDeleteCompId(null);
                                    } catch (err) {
                                        console.error('Failed to delete comp:', err);
                                        toast.error('Failed to delete comp', err);
                                    }
                                }}
                                disabled={deleteCompMutation.isPending}
                                className="px-4 py-2 rounded-lg bg-[var(--danger)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Create Sale Comp Dialog ═══ */}
            {showNewSaleDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={() => setShowNewSaleDialog(false)}>
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
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning)]/30 text-[var(--warning)]">
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
                                        {saleSuggestions.map((s) => (
                                            <button
                                                key={s.id}
                                                onClick={() => void selectSaleSuggestion(s)}
                                                className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                                            >
                                                <div className="font-medium text-xs">{s.name}</div>
                                                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.secondary}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {saleLocating && (
                                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Locating address…
                                </div>
                            )}
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
                                disabled={!saleName.trim() || createSaleComp.isPending || saleLocating}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={() => setDeleteSaleCompId(null)}>
                    <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Delete Sale Comp?</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-4">This will permanently delete this sale comp and all its transactions. This action cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDeleteSaleCompId(null)} className="px-4 py-2 text-sm text-[var(--text-muted)]">Cancel</button>
                            <button
                                onClick={async () => {
                                    try {
                                        await deleteSaleCompMutation.mutateAsync(deleteSaleCompId);
                                        setDeleteSaleCompId(null);
                                    } catch (err) {
                                        console.error('Failed to delete sale comp:', err);
                                        toast.error('Failed to delete sale comp', err);
                                    }
                                }}
                                disabled={deleteSaleCompMutation.isPending}
                                className="px-4 py-2 rounded-lg bg-[var(--danger)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
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
