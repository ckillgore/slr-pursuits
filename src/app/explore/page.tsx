'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useCreatePursuit, useStages, useCreateLandComp } from '@/hooks/useSupabaseQueries';
import {
    Search, MapPin, Loader2, X, Building2, User, DollarSign, Layers,
    Calendar, Ruler, Home, FileText, LandPlot, Shield, Mountain, Compass,
    Plus, Landmark, ExternalLink, ChevronRight, Eye,
} from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ======================== Types ========================

interface ParcelTooltipData {
    address: string | null;
    owner: string | null;
    zoning: string | null;
    zoningType: string | null;
    usedesc: string | null;
    lotAcres: number | null;
    lotSqft: number | null;
    assessedValue: number | null;
    yearBuilt: number | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    parcelNumber: string | null;
}

// From the existing Regrid API response
interface ParcelZoning {
    type: string | null;
    subtype: string | null;
    code: string | null;
    description: string | null;
    rawDescription: string | null;
    municipality: string | null;
    maxBuildingHeightFt: number | null;
    maxFAR: number | null;
    maxDensityPerAcre: number | null;
    maxCoveragePct: number | null;
    maxImperviousPct: number | null;
    minLotAreaSF: number | null;
    minLotWidthFt: number | null;
    minFrontSetbackFt: number | null;
    minRearSetbackFt: number | null;
    minSideSetbackFt: number | null;
    minLandscapedPct: number | null;
    minOpenSpacePct: number | null;
    permittedUses: string[];
    conditionalUses: string[];
    zoningCodeLink: string | null;
    zoningLastUpdated: string | null;
}

interface ParcelTax {
    totalValue: number | null;
    landValue: number | null;
    improvementValue: number | null;
    taxAmount: number | null;
    valuationType: string | null;
    assessedYear: string | null;
}

interface ParcelOwner {
    name: string | null;
    name2: string | null;
    mailingAddress: string | null;
    mailingCity: string | null;
    mailingState: string | null;
    mailingZip: string | null;
}

interface ParcelDetails {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    parcelNumber: string | null;
    altParcelNumber: string | null;
    lotSizeSF: number | null;
    lotSizeAcres: number | null;
    yearBuilt: number | null;
    useCode: string | null;
    useCodeDescription: string | null;
    legalDescription: string | null;
    landUse: string | null;
    buildingSF: number | null;
    numberOfUnits: number | null;
    numberOfBuildings: number | null;
    stories: number | null;
    femaNriRiskRating: string | null;
    femaFloodZone: string | null;
    femaFloodZoneSubtype: string | null;
    highestElevation: number | null;
    lowestElevation: number | null;
    populationDensity: number | null;
    populationGrowthPast5: number | null;
    populationGrowthNext5: number | null;
    housingGrowthPast5: number | null;
    housingGrowthNext5: number | null;
    householdIncomeGrowthNext5: number | null;
    medianHouseholdIncome: number | null;
    housingAffordabilityIndex: number | null;
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    qualifiedOpportunityZone: string | null;
    censusTract: string | null;
    censusBlock: string | null;
    censusBlockGroup: string | null;
    censusSchoolDistrict: string | null;
    countyFips: string | null;
}

interface ParcelData {
    details: ParcelDetails;
    zoning: ParcelZoning;
    tax: ParcelTax;
    owner: ParcelOwner;
    geometry: any | null;
    regridId: string | null;
    dataDate: string | null;
    recordType: 'real_property' | 'personal_property' | 'unknown';
}

// ======================== Helpers ========================

function formatCurrency(val: number | null): string {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function formatNumber(val: number | null, decimals = 0): string {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(val);
}

function getRiskColor(rating: string): string {
    const r = rating.toLowerCase();
    if (r.includes('very low')) return 'bg-green-50 text-green-700 border border-green-200';
    if (r.includes('relatively low')) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (r.includes('relatively moderate') || r.includes('moderate')) return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
    if (r.includes('relatively high')) return 'bg-orange-50 text-orange-700 border border-orange-200';
    if (r.includes('very high')) return 'bg-red-50 text-red-700 border border-red-200';
    return 'bg-gray-50 text-gray-700 border border-gray-200';
}

// ======================== Info Row ========================

function InfoRow({ label, value, icon: Icon, highlight }: {
    label: string;
    value: string | number | null | undefined;
    icon?: any;
    highlight?: boolean;
}) {
    const displayValue = value === null || value === undefined || value === '' ? '—' : String(value);
    return (
        <div className="flex items-start gap-2.5 py-1.5 border-b border-[#F4F5F7] last:border-0">
            {Icon && <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${highlight ? 'text-[#2563EB]' : 'text-[#A0AABB]'}`} />}
            <div className="flex-1 min-w-0">
                <div className="text-[9px] text-[#A0AABB] uppercase tracking-wider font-semibold">{label}</div>
                <div className={`text-xs ${highlight ? 'font-semibold text-[#1A1F2B]' : 'text-[#4A5568]'} ${displayValue.length > 60 ? 'text-[10px] leading-relaxed' : ''}`}>
                    {displayValue}
                </div>
            </div>
        </div>
    );
}

// ======================== Component ========================

export default function ExplorePage() {
    // Map refs
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const mbglRef = useRef<any>(null);
    const hoveredParcelIdRef = useRef<string | null>(null);
    const isTouchDeviceRef = useRef(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Map state
    type MapStyleId = 'light' | 'satellite';
    const [activeStyle, setActiveStyle] = useState<MapStyleId>('light');
    const STYLES: Record<MapStyleId, { url: string; label: string }> = {
        light: { url: 'mapbox://styles/mapbox/light-v11', label: 'Map' },
        satellite: { url: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Satellite' },
    };

    // Tooltip state
    const [tooltip, setTooltip] = useState<{ x: number; y: number; data: ParcelTooltipData } | null>(null);

    // Detail panel state
    const [panelOpen, setPanelOpen] = useState(false);
    const [panelLoading, setPanelLoading] = useState(false);
    const [panelParcel, setPanelParcel] = useState<ParcelData | null>(null);
    const [panelError, setPanelError] = useState<string | null>(null);
    const [clickedLngLat, setClickedLngLat] = useState<[number, number] | null>(null);

    // Mobile tap popup state (shows summary before loading full details)
    const [mobilePopup, setMobilePopup] = useState<{ data: ParcelTooltipData; lngLat: [number, number]; props: Record<string, any> } | null>(null);

    // Create actions
    const [showCreateDialog, setShowCreateDialog] = useState<'pursuit' | 'comp' | null>(null);
    const [createName, setCreateName] = useState('');
    const createPursuit = useCreatePursuit();
    const createComp = useCreateLandComp();
    const { data: stages = [] } = useStages();

    // Track zoom for parcel visibility message
    const [currentZoom, setCurrentZoom] = useState(4);

    // ── Regrid tile source helper ──
    const addRegridSource = useCallback((map: any) => {
        if (map.getSource('regrid-parcels')) return;

        map.addSource('regrid-parcels', {
            type: 'vector',
            tiles: [`${window.location.origin}/api/explore?z={z}&x={x}&y={y}`],
            minzoom: 13,
            maxzoom: 21,
            promoteId: { parcels: 'parcelnumb' }, // Use parcel number as unique ID for feature-state
        });

        // Parcel fill — transparent by default, blue on hover
        map.addLayer({
            id: 'parcels-fill',
            type: 'fill',
            source: 'regrid-parcels',
            'source-layer': 'parcels',
            minzoom: 13,
            paint: {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    '#2563EB',
                    'transparent',
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.15,
                    0,
                ],
            },
        });

        // Parcel outlines
        map.addLayer({
            id: 'parcels-outline',
            type: 'line',
            source: 'regrid-parcels',
            'source-layer': 'parcels',
            minzoom: 13,
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    '#2563EB',
                    '#94A3B8',
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    2,
                    0.5,
                ],
                'line-opacity': 0.7,
            },
        });
    }, []);

    // ── Initialize map ──
    useEffect(() => {
        if (!MAPBOX_TOKEN || !mapContainerRef.current) return;

        let map: any;
        let cancelled = false;

        import('mapbox-gl').then((mapboxgl) => {
            if (cancelled || !mapContainerRef.current) return;

            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;
            mbglRef.current = mbgl;

            mapContainerRef.current!.innerHTML = '';

            map = new mbgl.Map({
                container: mapContainerRef.current!,
                style: STYLES.light.url,
                center: [-96.7970, 32.7767], // Default: DFW area
                zoom: 4,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: true }), 'top-right');

            map.on('load', () => {
                if (cancelled) return;
                addRegridSource(map);
            });

            // Track zoom level
            map.on('zoomend', () => {
                setCurrentZoom(Math.round(map.getZoom()));
            });

            // Detect touch device
            map.getCanvas().addEventListener('touchstart', () => {
                isTouchDeviceRef.current = true;
            }, { once: true, passive: true });

            // ── Hover handlers (desktop only — touch devices use tap) ──
            map.on('mousemove', 'parcels-fill', (e: any) => {
                // Skip hover on touch devices
                if (isTouchDeviceRef.current) return;
                if (!e.features?.length) return;
                map.getCanvas().style.cursor = 'pointer';

                const feature = e.features[0];
                const props = feature.properties || {};

                // Update hover state
                if (hoveredParcelIdRef.current !== null) {
                    map.setFeatureState(
                        { source: 'regrid-parcels', sourceLayer: 'parcels', id: hoveredParcelIdRef.current },
                        { hover: false }
                    );
                }
                hoveredParcelIdRef.current = feature.id;
                map.setFeatureState(
                    { source: 'regrid-parcels', sourceLayer: 'parcels', id: feature.id },
                    { hover: true }
                );

                // Build tooltip data
                const data: ParcelTooltipData = {
                    address: props.address || null,
                    owner: props.owner || null,
                    zoning: props.zoning || null,
                    zoningType: props.zoning_type || null,
                    usedesc: props.usedesc || null,
                    lotAcres: props.ll_gisacre ? parseFloat(props.ll_gisacre) : null,
                    lotSqft: props.ll_gissqft ? parseFloat(props.ll_gissqft) : null,
                    assessedValue: props.parval ? parseFloat(props.parval) : null,
                    yearBuilt: props.yearbuilt ? parseInt(props.yearbuilt) : null,
                    city: props.scity || null,
                    state: props.state2 || null,
                    zip: props.szip5 || null,
                    parcelNumber: props.parcelnumb || null,
                };

                setTooltip({ x: e.point.x, y: e.point.y, data });
            });

            map.on('mouseleave', 'parcels-fill', () => {
                map.getCanvas().style.cursor = '';
                if (hoveredParcelIdRef.current !== null) {
                    map.setFeatureState(
                        { source: 'regrid-parcels', sourceLayer: 'parcels', id: hoveredParcelIdRef.current },
                        { hover: false }
                    );
                    hoveredParcelIdRef.current = null;
                }
                setTooltip(null);
            });

            // ── Click handler ──
            map.on('click', 'parcels-fill', (e: any) => {
                if (!e.features?.length) return;
                const lngLat = e.lngLat;
                const props = e.features[0].properties || {};

                // On touch devices, show mobile popup first instead of immediately loading details
                if (isTouchDeviceRef.current) {
                    const data: ParcelTooltipData = {
                        address: props.address || null,
                        owner: props.owner || null,
                        zoning: props.zoning || null,
                        zoningType: props.zoning_type || null,
                        usedesc: props.usedesc || null,
                        lotAcres: props.ll_gisacre ? parseFloat(props.ll_gisacre) : null,
                        lotSqft: props.ll_gissqft ? parseFloat(props.ll_gissqft) : null,
                        assessedValue: props.parval ? parseFloat(props.parval) : null,
                        yearBuilt: props.yearbuilt ? parseInt(props.yearbuilt) : null,
                        city: props.scity || null,
                        state: props.state2 || null,
                        zip: props.szip5 || null,
                        parcelNumber: props.parcelnumb || null,
                    };
                    setMobilePopup({ data, lngLat: [lngLat.lng, lngLat.lat], props });
                    return;
                }

                // Desktop: immediately load full details
                setClickedLngLat([lngLat.lng, lngLat.lat]);
                setTooltip(null);

                // Fetch full parcel detail
                setPanelOpen(true);
                setPanelLoading(true);
                setPanelError(null);
                setPanelParcel(null);

                fetch('/api/regrid', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        latitude: lngLat.lat,
                        longitude: lngLat.lng,
                        address: props.address || undefined,
                    }),
                })
                    .then((res) => res.json())
                    .then((data) => {
                        if (data.parcel) {
                            setPanelParcel(data.parcel);
                        } else {
                            setPanelError('No parcel data found at this location.');
                        }
                    })
                    .catch((err) => {
                        setPanelError(err.message || 'Failed to fetch parcel data');
                    })
                    .finally(() => {
                        setPanelLoading(false);
                    });
            });

            mapRef.current = map;
        });

        return () => {
            cancelled = true;
            if (map) map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Handle style change ──
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        map.setStyle(STYLES[activeStyle].url);

        map.once('style.load', () => {
            addRegridSource(map);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeStyle]);

    // ── Search autocomplete ──
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!query.trim() || query.length < 3 || !MAPBOX_TOKEN) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,place,postcode,locality&country=US&limit=5`
                );
                const data = await res.json();
                setSuggestions(data.features || []);
                setShowSuggestions(true);
            } catch { /* ignore */ }
        }, 300);
    }, []);

    const selectSuggestion = useCallback((feature: any) => {
        const [lng, lat] = feature.center;
        setSearchQuery(feature.place_name);
        setSuggestions([]);
        setShowSuggestions(false);

        const map = mapRef.current;
        if (map) {
            map.flyTo({ center: [lng, lat], zoom: 16, duration: 1500 });
        }
    }, []);

    // Close search on outside click
    useEffect(() => {
        const handleClick = () => { setShowSuggestions(false); };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    // ── Create Pursuit from parcel ──
    const handleCreatePursuit = useCallback(async () => {
        if (!panelParcel || !createName.trim()) return;
        const d = panelParcel.details;
        const defaultStage = stages[0];
        try {
            const newPursuit = await createPursuit.mutateAsync({
                name: createName.trim(),
                address: d.address || '',
                city: d.city || '',
                state: d.state || '',
                county: d.county || '',
                zip: d.zip || '',
                latitude: clickedLngLat ? clickedLngLat[1] : null,
                longitude: clickedLngLat ? clickedLngLat[0] : null,
                site_area_sf: d.lotSizeSF || 0,
                stage_id: defaultStage?.id ?? null,
                stage_changed_at: new Date().toISOString(),
                exec_summary: null,
                arch_notes: null,
                region: '',
                demographics: null,
                demographics_updated_at: null,
                parcel_data: null,
                parcel_data_updated_at: null,
                drive_time_data: null,
                income_heatmap_data: null,
                parcel_assemblage: null,
                created_by: null,
                is_archived: false,
                primary_one_pager_id: null,
            });
            setShowCreateDialog(null);
            setCreateName('');
            window.location.href = `/pursuits/${newPursuit.id}`;
        } catch (err) {
            console.error('Failed to create pursuit:', err);
        }
    }, [panelParcel, createName, clickedLngLat, stages, createPursuit]);

    // ── Create Comp from parcel ──
    const handleCreateComp = useCallback(async () => {
        if (!panelParcel || !createName.trim()) return;
        const d = panelParcel.details;
        try {
            const newComp = await createComp.mutateAsync({
                name: createName.trim(),
                address: d.address || '',
                city: d.city || '',
                state: d.state || '',
                county: d.county || '',
                zip: d.zip || '',
                latitude: clickedLngLat ? clickedLngLat[1] : null,
                longitude: clickedLngLat ? clickedLngLat[0] : null,
                site_area_sf: d.lotSizeSF || 0,
                sale_price: d.lastSalePrice || null,
                sale_price_psf: d.lastSalePrice && d.lotSizeSF ? Math.round(d.lastSalePrice / d.lotSizeSF * 100) / 100 : null,
                sale_date: d.lastSaleDate || null,
                buyer: null,
                seller: panelParcel.owner.name || null,
                zoning: panelParcel.zoning.code || panelParcel.zoning.type || null,
                land_use: d.useCodeDescription || d.landUse || null,
                notes: null,
                parcel_data: null,
                parcel_data_updated_at: null,
            });
            setShowCreateDialog(null);
            setCreateName('');
            window.location.href = `/comps/${newComp.id}`;
        } catch (err) {
            console.error('Failed to create comp:', err);
        }
    }, [panelParcel, createName, clickedLngLat, createComp]);

    // ── Derived ──
    const showZoomMsg = currentZoom < 13;

    return (
        <AppShell>
            <div className="relative" style={{ height: 'calc(100vh - 56px)' }}>
                {/* Search Bar — floating overlay */}
                <div className="absolute top-4 left-4 z-20 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-[#E2E5EA] rounded-xl shadow-lg px-4 py-2.5">
                            <Search className="w-4 h-4 text-[#A0AABB] flex-shrink-0" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Search address, city, or zip code..."
                                className="flex-1 bg-transparent text-sm text-[#1A1F2B] outline-none placeholder:text-[#A0AABB]"
                            />
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); setSuggestions([]); }} className="text-[#A0AABB] hover:text-[#4A5568]">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-[#E2E5EA] rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                                {suggestions.map((s: any) => (
                                    <button
                                        key={s.id}
                                        onClick={() => selectSuggestion(s)}
                                        className="w-full text-left px-4 py-3 hover:bg-[#EBF1FF] transition-colors border-b border-[#F0F1F4] last:border-b-0"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <MapPin className="w-3.5 h-3.5 mt-0.5 text-[#A0AABB] flex-shrink-0" />
                                            <div>
                                                <div className="text-sm font-medium text-[#1A1F2B]">{s.text}</div>
                                                <div className="text-[10px] text-[#7A8599] mt-0.5">{s.place_name}</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Basemap Toggle — top-right */}
                <div className="absolute top-4 right-4 z-20 flex bg-white/95 backdrop-blur-sm rounded-lg border border-[#E2E5EA] shadow-lg overflow-hidden">
                    {(Object.keys(STYLES) as MapStyleId[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => setActiveStyle(key)}
                            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${activeStyle === key
                                ? 'bg-[#2563EB] text-white'
                                : 'text-[#4A5568] hover:bg-[#F4F5F7]'
                                }`}
                        >
                            {STYLES[key].label}
                        </button>
                    ))}
                </div>

                {/* Zoom message */}
                {showZoomMsg && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-sm border border-[#E2E5EA] rounded-xl shadow-lg px-5 py-3 flex items-center gap-3">
                        <Eye className="w-4 h-4 text-[#A0AABB]" />
                        <div>
                            <p className="text-sm font-medium text-[#4A5568]">Zoom in to see parcels</p>
                            <p className="text-[10px] text-[#A0AABB]">Parcel boundaries appear at zoom level 13+</p>
                        </div>
                    </div>
                )}

                {/* Map Container */}
                {MAPBOX_TOKEN ? (
                    <div ref={mapContainerRef} className="w-full h-full" />
                ) : (
                    <div className="w-full h-full bg-[#FAFBFC] flex items-center justify-center">
                        <div className="text-center">
                            <Compass className="w-10 h-10 text-[#C8CDD5] mx-auto mb-3" />
                            <p className="text-sm text-[#7A8599]">
                                Add <code className="text-xs bg-[#F4F5F7] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local
                            </p>
                        </div>
                    </div>
                )}

                {/* Hover Tooltip (desktop only) */}
                {tooltip && (
                    <div
                        className="absolute z-30 pointer-events-none hidden md:block"
                        style={{ left: tooltip.x + 12, top: tooltip.y - 8, maxWidth: 280 }}
                    >
                        <div className="bg-white/95 backdrop-blur-sm border border-[#E2E5EA] rounded-lg shadow-xl px-3 py-2.5">
                            {tooltip.data.address && (
                                <div className="text-xs font-semibold text-[#1A1F2B] mb-1">{tooltip.data.address}</div>
                            )}
                            {(tooltip.data.city || tooltip.data.state) && (
                                <div className="text-[10px] text-[#7A8599] mb-1.5">
                                    {[tooltip.data.city, tooltip.data.state, tooltip.data.zip].filter(Boolean).join(', ')}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                                {tooltip.data.owner && (
                                    <div><span className="text-[#A0AABB]">Owner:</span> <span className="text-[#4A5568]">{tooltip.data.owner}</span></div>
                                )}
                                {tooltip.data.parcelNumber && (
                                    <div><span className="text-[#A0AABB]">Parcel:</span> <span className="text-[#4A5568]">{tooltip.data.parcelNumber}</span></div>
                                )}
                                {tooltip.data.zoning && (
                                    <div><span className="text-[#A0AABB]">Zoning:</span> <span className="text-[#4A5568] font-medium">{tooltip.data.zoning}</span></div>
                                )}
                                {tooltip.data.usedesc && (
                                    <div><span className="text-[#A0AABB]">Use:</span> <span className="text-[#4A5568]">{tooltip.data.usedesc}</span></div>
                                )}
                                {tooltip.data.lotAcres != null && tooltip.data.lotAcres > 0 && (
                                    <div>
                                        <span className="text-[#A0AABB]">Size:</span>{' '}
                                        <span className="text-[#4A5568] font-medium">
                                            {formatNumber(tooltip.data.lotAcres, 2)} ac
                                            {tooltip.data.lotSqft ? ` (${formatNumber(tooltip.data.lotSqft)} SF)` : ''}
                                        </span>
                                    </div>
                                )}
                                {tooltip.data.assessedValue != null && tooltip.data.assessedValue > 0 && (
                                    <div><span className="text-[#A0AABB]">Value:</span> <span className="text-[#4A5568]">{formatCurrency(tooltip.data.assessedValue)}</span></div>
                                )}
                                {tooltip.data.yearBuilt != null && tooltip.data.yearBuilt > 0 && (
                                    <div><span className="text-[#A0AABB]">Built:</span> <span className="text-[#4A5568]">{tooltip.data.yearBuilt}</span></div>
                                )}
                            </div>
                            <div className="text-[9px] text-[#A0AABB] mt-1.5 border-t border-[#F0F1F4] pt-1">Click for full details</div>
                        </div>
                    </div>
                )}

                {/* Mobile Tap Popup — fixed at bottom of screen */}
                {mobilePopup && (
                    <div className="absolute bottom-0 left-0 right-0 z-30 md:hidden animate-fade-in">
                        <div className="bg-white/95 backdrop-blur-sm border-t border-[#E2E5EA] shadow-2xl px-4 py-3 safe-area-pb">
                            {/* Close button */}
                            <button
                                onClick={() => setMobilePopup(null)}
                                className="absolute top-2 right-3 p-1 rounded-md text-[#A0AABB] hover:text-[#4A5568]"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            {mobilePopup.data.address && (
                                <div className="text-sm font-semibold text-[#1A1F2B] mb-0.5 pr-6">{mobilePopup.data.address}</div>
                            )}
                            {(mobilePopup.data.city || mobilePopup.data.state) && (
                                <div className="text-[10px] text-[#7A8599] mb-2">
                                    {[mobilePopup.data.city, mobilePopup.data.state, mobilePopup.data.zip].filter(Boolean).join(', ')}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] mb-3">
                                {mobilePopup.data.owner && (
                                    <div><span className="text-[#A0AABB]">Owner:</span> <span className="text-[#4A5568]">{mobilePopup.data.owner}</span></div>
                                )}
                                {mobilePopup.data.parcelNumber && (
                                    <div><span className="text-[#A0AABB]">Parcel:</span> <span className="text-[#4A5568]">{mobilePopup.data.parcelNumber}</span></div>
                                )}
                                {mobilePopup.data.zoning && (
                                    <div><span className="text-[#A0AABB]">Zoning:</span> <span className="text-[#4A5568] font-medium">{mobilePopup.data.zoning}</span></div>
                                )}
                                {mobilePopup.data.usedesc && (
                                    <div><span className="text-[#A0AABB]">Use:</span> <span className="text-[#4A5568]">{mobilePopup.data.usedesc}</span></div>
                                )}
                                {mobilePopup.data.lotAcres != null && mobilePopup.data.lotAcres > 0 && (
                                    <div>
                                        <span className="text-[#A0AABB]">Size:</span>{' '}
                                        <span className="text-[#4A5568] font-medium">
                                            {formatNumber(mobilePopup.data.lotAcres, 2)} ac
                                            {mobilePopup.data.lotSqft ? ` (${formatNumber(mobilePopup.data.lotSqft)} SF)` : ''}
                                        </span>
                                    </div>
                                )}
                                {mobilePopup.data.assessedValue != null && mobilePopup.data.assessedValue > 0 && (
                                    <div><span className="text-[#A0AABB]">Value:</span> <span className="text-[#4A5568]">{formatCurrency(mobilePopup.data.assessedValue)}</span></div>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    const lngLat = mobilePopup.lngLat;
                                    const props = mobilePopup.props;
                                    setMobilePopup(null);
                                    setClickedLngLat(lngLat);

                                    setPanelOpen(true);
                                    setPanelLoading(true);
                                    setPanelError(null);
                                    setPanelParcel(null);

                                    fetch('/api/regrid', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            latitude: lngLat[1],
                                            longitude: lngLat[0],
                                            address: props.address || undefined,
                                        }),
                                    })
                                        .then((res) => res.json())
                                        .then((data) => {
                                            if (data.parcel) {
                                                setPanelParcel(data.parcel);
                                            } else {
                                                setPanelError('No parcel data found at this location.');
                                            }
                                        })
                                        .catch((err) => {
                                            setPanelError(err.message || 'Failed to fetch parcel data');
                                        })
                                        .finally(() => {
                                            setPanelLoading(false);
                                        });
                                }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                                View Full Details
                            </button>
                        </div>
                    </div>
                )}

                {/* Detail Panel — slide-in from right */}
                <div
                    className={`absolute top-0 right-0 h-full z-30 transition-transform duration-300 ease-in-out ${panelOpen ? 'translate-x-0' : 'translate-x-full'
                        }`}
                    style={{ width: 'min(380px, 100vw)' }}
                >
                    <div className="h-full bg-white border-l border-[#E2E5EA] shadow-2xl flex flex-col">
                        {/* Panel Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E5EA] bg-[#FAFBFC]">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[#F59E0B]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Parcel Detail</h3>
                            </div>
                            <button
                                onClick={() => { setPanelOpen(false); setPanelParcel(null); setPanelError(null); }}
                                className="p-1 rounded-md text-[#A0AABB] hover:text-[#4A5568] hover:bg-[#F4F5F7] transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Panel Content */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                            {panelLoading && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#C8CDD5]" />
                                </div>
                            )}

                            {panelError && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA]">
                                    <X className="w-3.5 h-3.5 mt-0.5 text-[#DC2626] flex-shrink-0" />
                                    <p className="text-xs text-[#DC2626]">{panelError}</p>
                                </div>
                            )}

                            {panelParcel && (
                                <>
                                    {/* Address header */}
                                    <div className="pb-2 border-b border-[#E2E5EA]">
                                        <h4 className="text-sm font-bold text-[#1A1F2B]">{panelParcel.details.address || 'Unknown Address'}</h4>
                                        <p className="text-xs text-[#7A8599] mt-0.5">
                                            {[panelParcel.details.city, panelParcel.details.state, panelParcel.details.zip].filter(Boolean).join(', ')}
                                        </p>
                                        {panelParcel.details.county && (
                                            <p className="text-[10px] text-[#A0AABB] mt-0.5">{panelParcel.details.county} County</p>
                                        )}
                                    </div>

                                    {/* Quick Stats */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-[#FAFBFC] border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-center">
                                            <div className="text-[8px] text-[#A0AABB] uppercase tracking-wider font-semibold">Lot Size</div>
                                            <div className="text-xs font-bold text-[#1A1F2B]">
                                                {panelParcel.details.lotSizeAcres ? `${formatNumber(panelParcel.details.lotSizeAcres, 2)} ac` : '—'}
                                            </div>
                                        </div>
                                        <div className="bg-[#FAFBFC] border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-center">
                                            <div className="text-[8px] text-[#A0AABB] uppercase tracking-wider font-semibold">Zoning</div>
                                            <div className="text-xs font-bold text-[#8B5CF6]">
                                                {panelParcel.zoning.code || panelParcel.zoning.type || '—'}
                                            </div>
                                        </div>
                                        <div className="bg-[#FAFBFC] border border-[#E2E5EA] rounded-lg px-2 py-1.5 text-center">
                                            <div className="text-[8px] text-[#A0AABB] uppercase tracking-wider font-semibold">Value</div>
                                            <div className="text-xs font-bold text-[#1A1F2B]">
                                                {formatCurrency(panelParcel.tax.totalValue)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Property Details */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <Home className="w-3 h-3 text-[#F59E0B]" />
                                            <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Property</h5>
                                        </div>
                                        <InfoRow label="Parcel #" value={panelParcel.details.parcelNumber} icon={FileText} highlight />
                                        <InfoRow
                                            label="Lot Size"
                                            value={panelParcel.details.lotSizeAcres
                                                ? `${formatNumber(panelParcel.details.lotSizeAcres, 2)} ac (${formatNumber(panelParcel.details.lotSizeSF)} SF)`
                                                : null}
                                            icon={Ruler}
                                        />
                                        <InfoRow label="Building Area" value={panelParcel.details.buildingSF ? `${formatNumber(panelParcel.details.buildingSF)} SF` : null} />
                                        <InfoRow label="Year Built" value={panelParcel.details.yearBuilt} icon={Calendar} />
                                        <InfoRow label="Stories" value={panelParcel.details.stories} />
                                        <InfoRow label="Units" value={panelParcel.details.numberOfUnits} />
                                        <InfoRow label="Use" value={panelParcel.details.useCodeDescription || panelParcel.details.useCode} />
                                        <InfoRow label="Land Use" value={panelParcel.details.landUse} />
                                    </div>

                                    {/* Zoning */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <Layers className="w-3 h-3 text-[#8B5CF6]" />
                                            <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Zoning</h5>
                                        </div>
                                        <InfoRow label="Code" value={panelParcel.zoning.code} icon={Layers} highlight />
                                        <InfoRow label="Type" value={panelParcel.zoning.type} />
                                        <InfoRow label="Subtype" value={panelParcel.zoning.subtype} />
                                        <InfoRow label="Description" value={panelParcel.zoning.description} />
                                        {panelParcel.zoning.municipality && <InfoRow label="Municipality" value={panelParcel.zoning.municipality} />}
                                        {panelParcel.zoning.maxBuildingHeightFt && <InfoRow label="Max Height" value={`${panelParcel.zoning.maxBuildingHeightFt} ft`} />}
                                        {panelParcel.zoning.maxFAR && <InfoRow label="Max FAR" value={panelParcel.zoning.maxFAR} />}
                                        {panelParcel.zoning.maxDensityPerAcre && <InfoRow label="Max Density" value={`${panelParcel.zoning.maxDensityPerAcre} du/ac`} />}
                                        {panelParcel.zoning.zoningCodeLink && (
                                            <a href={panelParcel.zoning.zoningCodeLink} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:underline mt-1">
                                                View Zoning Code <ExternalLink className="w-2.5 h-2.5" />
                                            </a>
                                        )}
                                    </div>

                                    {/* Tax & Valuation */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <DollarSign className="w-3 h-3 text-[#0D7A3E]" />
                                            <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Tax & Valuation</h5>
                                        </div>
                                        <InfoRow label="Total Value" value={formatCurrency(panelParcel.tax.totalValue)} icon={DollarSign} highlight />
                                        <InfoRow label="Land Value" value={formatCurrency(panelParcel.tax.landValue)} />
                                        <InfoRow label="Improvement Value" value={formatCurrency(panelParcel.tax.improvementValue)} />
                                        <InfoRow label="Annual Tax" value={formatCurrency(panelParcel.tax.taxAmount)} />
                                        <InfoRow label="Type" value={panelParcel.tax.valuationType} />
                                        <InfoRow label="Tax Year" value={panelParcel.tax.assessedYear} />
                                        {panelParcel.details.lotSizeSF && panelParcel.tax.landValue ? (
                                            <InfoRow label="Land $/SF" value={formatCurrency(panelParcel.tax.landValue / panelParcel.details.lotSizeSF)} />
                                        ) : null}
                                    </div>

                                    {/* Owner */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <User className="w-3 h-3 text-[#2563EB]" />
                                            <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Ownership</h5>
                                        </div>
                                        <InfoRow label="Owner" value={panelParcel.owner.name} icon={User} highlight />
                                        {panelParcel.owner.name2 && <InfoRow label="Owner 2" value={panelParcel.owner.name2} />}
                                        <InfoRow label="Mailing Address" value={panelParcel.owner.mailingAddress} />
                                        <InfoRow label="Mail City/State" value={
                                            [panelParcel.owner.mailingCity, panelParcel.owner.mailingState, panelParcel.owner.mailingZip]
                                                .filter(Boolean).join(', ') || null
                                        } />
                                    </div>

                                    {/* Sale History */}
                                    {(panelParcel.details.lastSalePrice || panelParcel.details.lastSaleDate) && (
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Calendar className="w-3 h-3 text-[#F59E0B]" />
                                                <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Sale History</h5>
                                            </div>
                                            <InfoRow label="Last Sale Price" value={formatCurrency(panelParcel.details.lastSalePrice)} highlight />
                                            <InfoRow label="Last Sale Date" value={panelParcel.details.lastSaleDate} />
                                            {panelParcel.details.lastSalePrice && panelParcel.details.lotSizeSF ? (
                                                <InfoRow label="Sale $/SF" value={formatCurrency(panelParcel.details.lastSalePrice / panelParcel.details.lotSizeSF)} />
                                            ) : null}
                                        </div>
                                    )}

                                    {/* FEMA & Risk */}
                                    {(panelParcel.details.femaFloodZone || panelParcel.details.femaNriRiskRating) && (
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Shield className="w-3 h-3 text-[#DC2626]" />
                                                <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">FEMA & Risk</h5>
                                            </div>
                                            {panelParcel.details.femaFloodZone && (
                                                <InfoRow label="Flood Zone" value={panelParcel.details.femaFloodZone} />
                                            )}
                                            {panelParcel.details.femaFloodZoneSubtype && (
                                                <InfoRow label="Flood Subtype" value={panelParcel.details.femaFloodZoneSubtype} />
                                            )}
                                            {panelParcel.details.femaNriRiskRating && (
                                                <div className="py-1">
                                                    <div className="text-[9px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-0.5">NRI Risk Rating</div>
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${getRiskColor(panelParcel.details.femaNriRiskRating)}`}>
                                                        {panelParcel.details.femaNriRiskRating}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Demographics */}
                                    {panelParcel.details.medianHouseholdIncome && (
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <LandPlot className="w-3 h-3 text-[#7C3AED]" />
                                                <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Demographics</h5>
                                            </div>
                                            <InfoRow label="Median HH Income" value={formatCurrency(panelParcel.details.medianHouseholdIncome)} highlight />
                                            <InfoRow label="Pop. Density" value={panelParcel.details.populationDensity ? `${formatNumber(panelParcel.details.populationDensity)} / sq mi` : null} />
                                            <InfoRow label="Pop. Growth (5yr)" value={panelParcel.details.populationGrowthNext5 ? `${(panelParcel.details.populationGrowthNext5 * 100).toFixed(2)}%` : null} />
                                            <InfoRow label="Housing Growth (5yr)" value={panelParcel.details.housingGrowthNext5 ? `${(panelParcel.details.housingGrowthNext5 * 100).toFixed(2)}%` : null} />
                                            {panelParcel.details.qualifiedOpportunityZone === 'Yes' && (
                                                <div className="mt-1">
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Qualified Opportunity Zone
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Census / Other */}
                                    {panelParcel.details.censusTract && (
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <MapPin className="w-3 h-3 text-[#A0AABB]" />
                                                <h5 className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider">Census</h5>
                                            </div>
                                            <InfoRow label="Census Tract" value={panelParcel.details.censusTract} />
                                            <InfoRow label="Block Group" value={panelParcel.details.censusBlockGroup} />
                                            {panelParcel.details.censusSchoolDistrict && (
                                                <InfoRow label="School District" value={panelParcel.details.censusSchoolDistrict} />
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Panel Footer — Action buttons */}
                        {panelParcel && (
                            <div className="px-4 py-3 border-t border-[#E2E5EA] bg-[#FAFBFC] space-y-2">
                                <button
                                    onClick={() => { setCreateName(panelParcel.details.address || 'New Pursuit'); setShowCreateDialog('pursuit'); }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-xs font-medium transition-colors shadow-sm"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Create Pursuit
                                </button>
                                <button
                                    onClick={() => { setCreateName(panelParcel.details.address || 'New Comp'); setShowCreateDialog('comp'); }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-medium transition-colors shadow-sm"
                                >
                                    <Landmark className="w-3.5 h-3.5" />
                                    Create Comp
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Create Dialog */}
                {showCreateDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">
                                {showCreateDialog === 'pursuit' ? 'Create Pursuit' : 'Create Comp'}
                            </h2>
                            <p className="text-xs text-[#7A8599] mb-4">
                                {panelParcel?.details.address && (
                                    <>From parcel: <span className="font-medium text-[#4A5568]">{panelParcel.details.address}</span></>
                                )}
                            </p>
                            <div>
                                <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                    Name <span className="text-[#DC2626]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={createName}
                                    onChange={(e) => setCreateName(e.target.value)}
                                    placeholder={showCreateDialog === 'pursuit' ? 'e.g., Main & Elm Site' : 'e.g., 123 Main St Sale'}
                                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            showCreateDialog === 'pursuit' ? handleCreatePursuit() : handleCreateComp();
                                        }
                                    }}
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => { setShowCreateDialog(null); setCreateName(''); }}
                                    className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={showCreateDialog === 'pursuit' ? handleCreatePursuit : handleCreateComp}
                                    disabled={
                                        !createName.trim() ||
                                        (showCreateDialog === 'pursuit' ? createPursuit.isPending : createComp.isPending)
                                    }
                                    className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors shadow-sm disabled:opacity-50 ${showCreateDialog === 'pursuit'
                                        ? 'bg-[#2563EB] hover:bg-[#1D4FD7]'
                                        : 'bg-[#0D9488] hover:bg-[#0F766E]'
                                        }`}
                                >
                                    {(showCreateDialog === 'pursuit' ? createPursuit.isPending : createComp.isPending)
                                        ? 'Creating...'
                                        : showCreateDialog === 'pursuit' ? 'Create Pursuit' : 'Create Comp'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
