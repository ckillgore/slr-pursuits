'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AssemblageMap } from './AssemblageMap';
import {
    Building2,
    MapPin,
    Loader2,
    AlertCircle,
    LandPlot,
    DollarSign,
    User,
    Search,
    ExternalLink,
    Layers,
    Calendar,
    Ruler,
    Home,
    FileText,
    Shield,
    Mountain,
    BadgeDollarSign,
    MapPinned,
    X,
    Info,
    Plus,
    Minus,
    CheckCircle2,
    Radar,
} from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ======================== Types ========================

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
    // Growth & Trend
    populationDensity: number | null;
    populationGrowthPast5: number | null;
    populationGrowthNext5: number | null;
    housingGrowthPast5: number | null;
    housingGrowthNext5: number | null;
    householdIncomeGrowthNext5: number | null;
    medianHouseholdIncome: number | null;
    housingAffordabilityIndex: number | null;
    // Sale History
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    qualifiedOpportunityZone: string | null;
    censusTract: string | null;
    censusBlock: string | null;
    censusBlockGroup: string | null;
    censusSchoolDistrict: string | null;
    countyFips: string | null;
}

interface BuildingFootprint {
    footprintSF: number;
    geometry: any;
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

interface TaxSummary {
    totalRealPropertyValue: number;
    totalLandValue: number;
    totalImprovementValue: number;
    totalPersonalPropertyValue: number;
    realPropertyCount: number;
    personalPropertyCount: number;
}

interface RegridResponse {
    parcel: ParcelData;
    associatedRecords: ParcelData[];
    taxSummary: TaxSummary;
}

interface NearbyParcel {
    regridId: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    parcelNumber: string | null;
    ownerName: string | null;
    lotSizeSF: number | null;
    lotSizeAcres: number | null;
    landUse: string | null;
    zoningCode: string | null;
    zoningType: string | null;
    totalAssessedValue: number | null;
    landValue: number | null;
    improvementValue: number | null;
    yearBuilt: number | null;
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    geometry: any | null;
}

interface PublicInfoTabProps {
    latitude: number | null;
    longitude: number | null;
    pursuitName?: string;
    pursuitAddress?: string;
    siteAreaSF?: number;
    savedParcelData?: Record<string, unknown> | null;
    onSaveParcelData?: (data: Record<string, unknown>) => void;
    savedAssemblage?: Record<string, unknown>[] | null;
    onSaveAssemblage?: (data: Record<string, unknown>[]) => void;
    hideAssemblage?: boolean;
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

function InfoRow({ label, value, icon: Icon, highlight, subtext }: {
    label: string;
    value: string | number | null | undefined;
    icon?: any;
    highlight?: boolean;
    subtext?: string;
}) {
    const displayValue = value === null || value === undefined || value === '' ? '—' : String(value);
    return (
        <div className="flex items-start gap-3 py-2 border-b border-[#F4F5F7] last:border-0">
            {Icon && <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${highlight ? 'text-[#2563EB]' : 'text-[#A0AABB]'}`} />}
            <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">{label}</div>
                <div className={`text-sm ${highlight ? 'font-semibold text-[#1A1F2B]' : 'text-[#4A5568]'} ${displayValue.length > 60 ? 'text-xs leading-relaxed' : ''}`}>
                    {displayValue}
                </div>
                {subtext && <div className="text-[10px] text-[#A0AABB] mt-0.5">{subtext}</div>}
            </div>
        </div>
    );
}

// ======================== Stat Pill ========================

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="bg-white border border-[#E2E5EA] rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-0.5">{label}</div>
            <div className="text-base font-bold text-[#1A1F2B]">{value}</div>
            {sub && <div className="text-[10px] text-[#7A8599]">{sub}</div>}
        </div>
    );
}

// ======================== Component ========================

export function PublicInfoTab({ latitude, longitude, pursuitName, pursuitAddress, siteAreaSF, savedParcelData, onSaveParcelData, savedAssemblage, onSaveAssemblage, hideAssemblage }: PublicInfoTabProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const mbglRef = useRef<any>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [parcel, setParcel] = useState<ParcelData | null>(
        savedParcelData?.parcel ? (savedParcelData.parcel as unknown as ParcelData) : null
    );
    const [associatedRecords, setAssociatedRecords] = useState<ParcelData[]>(
        (savedParcelData?.associatedRecords as unknown as ParcelData[]) || []
    );
    const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(
        (savedParcelData?.taxSummary as unknown as TaxSummary) || null
    );
    const [showAssociated, setShowAssociated] = useState(false);
    const [showZoningModal, setShowZoningModal] = useState(false);
    const [buildings, setBuildings] = useState<BuildingFootprint[]>(
        (savedParcelData?.buildings as unknown as BuildingFootprint[]) || []
    );
    const [fmrData, setFmrData] = useState<any>(savedParcelData?.fmr || null);
    const [fmrLoading, setFmrLoading] = useState(false);
    const walkScoreRef = useRef<HTMLDivElement>(null);
    const [hasFetched, setHasFetched] = useState(!!savedParcelData && Object.keys(savedParcelData).length > 0);

    // ── Assemblage state ──
    const [nearbyParcels, setNearbyParcels] = useState<NearbyParcel[]>([]);
    const [nearbyLoading, setNearbyLoading] = useState(false);
    const [nearbyError, setNearbyError] = useState<string | null>(null);
    const [showNearby, setShowNearby] = useState(false);
    const [assemblage, setAssemblage] = useState<NearbyParcel[]>(
        (savedAssemblage as unknown as NearbyParcel[]) || []
    );
    const [nearbyRadius, setNearbyRadius] = useState(200); // meters

    // Track latest cache value to prevent race conditions between saves
    const latestCacheRef = useRef<Record<string, unknown>>(savedParcelData || {});
    const saveToCache = useCallback((update: Record<string, unknown>) => {
        const merged = { ...latestCacheRef.current, ...update };
        latestCacheRef.current = merged;
        if (onSaveParcelData) {
            onSaveParcelData(merged);
        }
    }, [onSaveParcelData]);

    const hasLocation = latitude !== null && longitude !== null;
    const center: [number, number] = hasLocation
        ? [longitude!, latitude!]
        : [-96.7970, 32.7767];

    // Initialize map AND render parcel boundary
    // The map container only exists when parcel data is loaded (it's inside {parcel && ...})
    // so we must init the map when parcel changes, not on mount.
    useEffect(() => {
        if (!MAPBOX_TOKEN || !parcel || !mapContainerRef.current) return;

        // Clean up any existing map
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }

        let map: any;
        let cancelled = false;

        import('mapbox-gl').then((mapboxgl) => {
            if (cancelled || !mapContainerRef.current) return;

            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;
            mbglRef.current = mbgl;

            mapContainerRef.current.innerHTML = '';

            map = new mbgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/light-v11',
                center: hasLocation ? [longitude!, latitude!] : [-96.7970, 32.7767],
                zoom: hasLocation ? 16 : 10,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: false }), 'top-right');

            // Add location marker
            if (hasLocation) {
                new mbgl.Marker({ color: '#2563EB' })
                    .setLngLat([longitude!, latitude!])
                    .addTo(map);
            }

            mapRef.current = map;

            // Add parcel boundary on load
            if (parcel.geometry) {
                map.on('load', () => {
                    if (cancelled) return;

                    const geojson = {
                        type: 'Feature' as const,
                        properties: {},
                        geometry: parcel.geometry,
                    };

                    map.addSource('parcel', { type: 'geojson', data: geojson });

                    map.addLayer({
                        id: 'parcel-fill',
                        type: 'fill',
                        source: 'parcel',
                        paint: {
                            'fill-color': '#F59E0B',
                            'fill-opacity': 0.2,
                        },
                    });

                    map.addLayer({
                        id: 'parcel-outline',
                        type: 'line',
                        source: 'parcel',
                        paint: {
                            'line-color': '#F59E0B',
                            'line-width': 2.5,
                            'line-opacity': 0.9,
                        },
                    });

                    // Fit to parcel bounds
                    if (parcel.geometry.coordinates) {
                        const bounds = new mbgl.LngLatBounds();
                        const coords = parcel.geometry.type === 'MultiPolygon'
                            ? parcel.geometry.coordinates.flat(2)
                            : parcel.geometry.coordinates.flat(1);
                        coords.forEach(([lng, lat]: number[]) => bounds.extend([lng, lat]));
                        map.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 18 });
                    }
                });
            }

            // Add building footprints on load
            if (buildings.length > 0) {
                map.on('load', () => {
                    if (cancelled) return;
                    if (map.getSource('buildings')) return; // already added by parcel handler

                    const buildingGeojson = {
                        type: 'FeatureCollection' as const,
                        features: buildings.map((b, i) => ({
                            type: 'Feature' as const,
                            properties: { footprintSF: b.footprintSF, index: i },
                            geometry: b.geometry,
                        })),
                    };

                    map.addSource('buildings', { type: 'geojson', data: buildingGeojson });

                    map.addLayer({
                        id: 'buildings-fill',
                        type: 'fill',
                        source: 'buildings',
                        paint: {
                            'fill-color': '#3B82F6',
                            'fill-opacity': 0.25,
                        },
                    });

                    map.addLayer({
                        id: 'buildings-outline',
                        type: 'line',
                        source: 'buildings',
                        paint: {
                            'line-color': '#3B82F6',
                            'line-width': 1.5,
                            'line-opacity': 0.7,
                        },
                    });
                });
            }
        });

        return () => {
            cancelled = true;
            if (map) map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parcel, buildings]);

    // Update assemblage parcels on the main map without recreating it
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Wait for the map to be loaded before modifying sources
        const updateAssemblage = () => {
            const asmWithGeom = assemblage.filter(p => p.geometry);
            const features = asmWithGeom.map(p => ({
                type: 'Feature' as const,
                properties: {
                    address: p.address || 'Unknown',
                    parcelNumber: p.parcelNumber || '',
                },
                geometry: p.geometry,
            }));
            const geojsonData = { type: 'FeatureCollection' as const, features };

            // If source exists, just update data; otherwise create source + layers
            const existingSource = map.getSource('assemblage-parcels');
            if (existingSource) {
                (existingSource as any).setData(geojsonData);
            } else if (asmWithGeom.length > 0) {
                map.addSource('assemblage-parcels', { type: 'geojson', data: geojsonData });
                map.addLayer({
                    id: 'assemblage-fill',
                    type: 'fill',
                    source: 'assemblage-parcels',
                    paint: { 'fill-color': '#7C3AED', 'fill-opacity': 0.2 },
                });
                map.addLayer({
                    id: 'assemblage-outline',
                    type: 'line',
                    source: 'assemblage-parcels',
                    paint: { 'line-color': '#7C3AED', 'line-width': 2, 'line-opacity': 0.8 },
                });
            }

            // Re-fit bounds to include assemblage
            if (asmWithGeom.length > 0 && parcel?.geometry?.coordinates) {
                import('mapbox-gl').then((mbgl) => {
                    const mgl = mbgl.default || mbgl;
                    const bounds = new mgl.LngLatBounds();
                    // Primary parcel coords
                    const pCoords = parcel!.geometry.type === 'MultiPolygon'
                        ? parcel!.geometry.coordinates.flat(2)
                        : parcel!.geometry.coordinates.flat(1);
                    pCoords.forEach(([lng, lat]: number[]) => bounds.extend([lng, lat]));
                    // Assemblage coords
                    for (const ap of asmWithGeom) {
                        const flatten = (arr: any[]): void => {
                            for (const item of arr) {
                                if (typeof item[0] === 'number') bounds.extend(item as [number, number]);
                                else flatten(item);
                            }
                        };
                        if (ap.geometry?.coordinates) flatten(ap.geometry.coordinates);
                    }
                    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 600, maxZoom: 18 });
                });
            }
        };

        if (map.isStyleLoaded()) {
            updateAssemblage();
        } else {
            map.on('load', updateAssemblage);
        }
    }, [assemblage, parcel]);

    // Fetch parcel data
    const fetchParcel = useCallback(async () => {
        if (!hasLocation && !pursuitAddress) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/regrid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude, longitude, address: pursuitAddress }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch parcel data');
            }

            if (!data.parcel) {
                setError('No parcel found at this location. The area may not have parcel data coverage.');
                setParcel(null);
                setAssociatedRecords([]);
                setTaxSummary(null);
                setBuildings([]);
                setFmrData(null);
            } else {
                setFmrData(null); // Reset so FMR re-fetches
                fmrFetchedRef.current = false;
                setParcel(data.parcel);
                setAssociatedRecords(data.associatedRecords || []);
                setTaxSummary(data.taxSummary || null);
                setBuildings(data.buildings || []);
                // Save full response to Supabase for caching
                saveToCache({
                    parcel: data.parcel,
                    associatedRecords: data.associatedRecords || [],
                    taxSummary: data.taxSummary || null,
                    buildings: data.buildings || [],
                });
            }
            setHasFetched(true);
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    }, [latitude, longitude, hasLocation, pursuitAddress]);

    // Auto-fetch on mount if location is set
    useEffect(() => {
        if (hasLocation && !hasFetched && !loading) {
            fetchParcel();
        }
    }, [hasLocation, hasFetched, loading, fetchParcel]);

    // Fetch HUD FMR data when parcel loads
    const fmrFetchedRef = useRef(false);
    useEffect(() => {
        const zip = parcel?.details?.zip;
        const state = parcel?.details?.state;

        if (!zip || !state || fmrData || fmrFetchedRef.current) return;
        fmrFetchedRef.current = true;

        const fetchFMR = async () => {
            setFmrLoading(true);
            try {
                const res = await fetch('/api/hud-fmr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        zip,
                        stateAbbr: state,
                        countyFips: parcel?.details?.countyFips,
                    }),
                });
                const data = await res.json();
                if (data.fmr) {
                    setFmrData(data.fmr);
                    saveToCache({ fmr: data.fmr });
                }
            } catch (err) {
                console.error('[FMR] Fetch error:', err);
            } finally {
                setFmrLoading(false);
            }
        };
        fetchFMR();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parcel]);

    // Walk Score URL
    const walkScoreUrl = parcel?.details?.address && hasLocation
        ? `https://www.walkscore.com/score/${encodeURIComponent((parcel.details.address || '') + (parcel.details.city ? ', ' + parcel.details.city : '') + (parcel.details.state ? ', ' + parcel.details.state : ''))}`
        : null;

    if (!hasLocation) {
        return (
            <div className="card">
                <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-[#A0AABB]" />
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Public Information</h3>
                </div>
                <div className="flex items-center justify-center py-12 text-center">
                    <div>
                        <MapPin className="w-6 h-6 text-[#C8CDD5] mx-auto mb-2" />
                        <p className="text-xs text-[#A0AABB]">Set a location to view public parcel information</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with refresh */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#F59E0B]" />
                    <h2 className="text-sm font-bold text-[#7A8599] uppercase tracking-wider">Public Parcel Information</h2>
                </div>
                <button
                    onClick={fetchParcel}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F59E0B] hover:bg-[#D97706] disabled:opacity-50 text-white text-xs font-medium transition-colors"
                >
                    {loading ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Fetching...</>
                    ) : (
                        <><Search className="w-3 h-3" /> {parcel ? 'Refresh' : 'Fetch Parcel Data'}</>
                    )}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA]">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-[#DC2626] flex-shrink-0" />
                    <p className="text-xs text-[#DC2626]">{error}</p>
                </div>
            )}

            {/* Loading skeleton */}
            {loading && !parcel && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="card animate-pulse">
                            <div className="h-4 bg-[#F0F1F4] rounded w-32 mb-3" />
                            <div className="space-y-2">
                                <div className="h-3 bg-[#F0F1F4] rounded w-full" />
                                <div className="h-3 bg-[#F0F1F4] rounded w-3/4" />
                                <div className="h-3 bg-[#F0F1F4] rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Parcel Data */}
            {parcel && (
                <>
                    {/* Quick Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        <StatPill
                            label={assemblage.length > 0 ? 'Lot Size (combined)' : 'Lot Size'}
                            value={(() => {
                                const primaryAc = parcel.details.lotSizeAcres || 0;
                                const asmAc = assemblage.reduce((s, p) => s + (p.lotSizeAcres || 0), 0);
                                const totalAc = primaryAc + asmAc;
                                return totalAc > 0 ? `${formatNumber(totalAc, 2)} ac` : '—';
                            })()}
                            sub={(() => {
                                const primarySF = parcel.details.lotSizeSF || 0;
                                const asmSF = assemblage.reduce((s, p) => s + (p.lotSizeSF || 0), 0);
                                const totalSF = primarySF + asmSF;
                                return totalSF > 0 ? `${formatNumber(totalSF)} SF` : undefined;
                            })()}
                        />
                        <StatPill label="Zoning" value={parcel.zoning.code || parcel.zoning.type || '—'} sub={parcel.zoning.subtype || undefined} />
                        <StatPill
                            label={assemblage.length > 0 ? 'Assessed Value (combined)' : 'Assessed Value'}
                            value={formatCurrency(
                                (parcel.tax.totalValue || 0) + assemblage.reduce((s, p) => s + (p.totalAssessedValue || 0), 0)
                            )}
                            sub={parcel.tax.valuationType || undefined}
                        />
                        <StatPill label="Annual Tax" value={formatCurrency(parcel.tax.taxAmount)} sub={parcel.tax.assessedYear ? `FY ${parcel.tax.assessedYear}` : undefined} />
                        <StatPill label="Year Built" value={parcel.details.yearBuilt ? String(parcel.details.yearBuilt) : '—'} />
                        <StatPill
                            label={assemblage.length > 0 ? 'Price/SF (combined)' : 'Price/SF'}
                            value={(() => {
                                const totalLand = (parcel.tax.landValue || 0) + assemblage.reduce((s, p) => s + (p.landValue || 0), 0);
                                const totalSF = (parcel.details.lotSizeSF || 0) + assemblage.reduce((s, p) => s + (p.lotSizeSF || 0), 0);
                                return totalLand > 0 && totalSF > 0 ? formatCurrency(totalLand / totalSF) : '—';
                            })()}
                            sub="Land assessed"
                        />
                    </div>

                    {/* Map + Cards Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Map */}
                        <div className="lg:col-span-2">
                            {MAPBOX_TOKEN ? (
                                <div
                                    ref={mapContainerRef}
                                    className="w-full h-[420px] rounded-lg overflow-hidden border border-[#E2E5EA]"
                                />
                            ) : (
                                <div className="w-full h-[420px] rounded-lg border border-[#E2E5EA] bg-[#FAFBFC] flex items-center justify-center">
                                    <p className="text-xs text-[#A0AABB]">Add <code className="text-[10px] bg-[#F4F5F7] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local</p>
                                </div>
                            )}
                            {parcel.geometry && (
                                <p className="text-[10px] text-[#A0AABB] mt-1.5 text-center">
                                    Parcel boundary for {parcel.details.address || pursuitName || 'location'} ·
                                    {parcel.details.parcelNumber && ` Parcel #${parcel.details.parcelNumber}`}
                                    {parcel.dataDate && ` · Updated ${parcel.dataDate}`}
                                </p>
                            )}
                        </div>

                        {/* Property Details Card */}
                        <div className="card max-h-[460px] overflow-y-auto">
                            <div className="flex items-center gap-1.5 mb-3">
                                <Home className="w-3.5 h-3.5 text-[#F59E0B]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Property Details</h3>
                            </div>
                            <InfoRow label="Address" value={parcel.details.address} icon={MapPin} highlight />
                            <InfoRow label="City / State / ZIP" value={[parcel.details.city, parcel.details.state, parcel.details.zip].filter(Boolean).join(', ') || null} />
                            <InfoRow label="County" value={parcel.details.county} />
                            <InfoRow label="Parcel #" value={parcel.details.parcelNumber} icon={FileText} highlight />
                            <InfoRow
                                label={assemblage.length > 0 ? 'Lot Size (combined)' : 'Lot Size'}
                                value={(() => {
                                    const primaryAc = parcel.details.lotSizeAcres || 0;
                                    const primarySF = parcel.details.lotSizeSF || 0;
                                    const asmAc = assemblage.reduce((s, p) => s + (p.lotSizeAcres || 0), 0);
                                    const asmSF = assemblage.reduce((s, p) => s + (p.lotSizeSF || 0), 0);
                                    const totalAc = primaryAc + asmAc;
                                    const totalSF = primarySF + asmSF;
                                    return totalAc > 0 ? `${formatNumber(totalAc, 2)} acres (${formatNumber(totalSF)} SF)` : null;
                                })()}
                                icon={Ruler}
                            />
                            <InfoRow label="Building Area" value={parcel.details.buildingSF ? `${formatNumber(parcel.details.buildingSF)} SF` : null} />
                            <InfoRow label="Year Built" value={parcel.details.yearBuilt} icon={Calendar} />
                            <InfoRow label="Stories" value={parcel.details.stories} />
                            <InfoRow label="Units" value={parcel.details.numberOfUnits} />
                            <InfoRow label="Use Code" value={parcel.details.useCodeDescription || parcel.details.useCode} />
                            <InfoRow label="Land Use" value={parcel.details.landUse} />
                        </div>
                    </div>

                    {/* Bottom Cards Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Zoning & Development Standards Card */}
                        <div className="card">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-[#8B5CF6]" />
                                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Zoning & Development</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    {parcel.zoning.zoningCodeLink && (
                                        <a href={parcel.zoning.zoningCodeLink} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:underline">
                                            View Code <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                    )}
                                    <button
                                        onClick={() => setShowZoningModal(true)}
                                        className="flex items-center gap-1 text-[10px] text-[#8B5CF6] hover:text-[#7C3AED] font-medium transition-colors"
                                    >
                                        <Info className="w-2.5 h-2.5" /> Details
                                    </button>
                                </div>
                            </div>
                            {parcel.zoning.type || parcel.zoning.code ? (
                                <>
                                    {parcel.zoning.code && (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 mb-3">
                                            <span className="text-lg font-bold text-[#8B5CF6]">{parcel.zoning.code}</span>
                                        </div>
                                    )}
                                    {parcel.zoning.municipality && (
                                        <InfoRow label="Municipality" value={parcel.zoning.municipality} />
                                    )}
                                    <InfoRow label="Type" value={parcel.zoning.type} icon={Layers} highlight />
                                    <InfoRow label="Subtype" value={parcel.zoning.subtype} />
                                    {parcel.zoning.description && (
                                        <InfoRow label="Description" value={parcel.zoning.description} />
                                    )}

                                    {/* Development Standards */}
                                    {(parcel.zoning.maxBuildingHeightFt || parcel.zoning.maxFAR || parcel.zoning.maxDensityPerAcre) && (
                                        <div className="mt-3 p-2.5 rounded-lg bg-[#8B5CF6]/5 border border-[#8B5CF6]/15">
                                            <div className="text-[10px] text-[#8B5CF6] uppercase tracking-wider font-semibold mb-2">Development Standards</div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                                {parcel.zoning.maxBuildingHeightFt && (
                                                    <div>
                                                        <div className="text-[10px] text-[#7A8599]">Max Height</div>
                                                        <div className="text-sm font-semibold text-[#1A1F2B]">{parcel.zoning.maxBuildingHeightFt} ft</div>
                                                    </div>
                                                )}
                                                {parcel.zoning.maxFAR && (
                                                    <div>
                                                        <div className="text-[10px] text-[#7A8599]">Max FAR</div>
                                                        <div className="text-sm font-semibold text-[#1A1F2B]">{parcel.zoning.maxFAR}</div>
                                                    </div>
                                                )}
                                                {parcel.zoning.maxDensityPerAcre && (
                                                    <div>
                                                        <div className="text-[10px] text-[#7A8599]">Max Density</div>
                                                        <div className="text-sm font-semibold text-[#1A1F2B]">{parcel.zoning.maxDensityPerAcre} DU/ac</div>
                                                    </div>
                                                )}
                                                {parcel.zoning.maxCoveragePct && (
                                                    <div>
                                                        <div className="text-[10px] text-[#7A8599]">Max Coverage</div>
                                                        <div className="text-sm font-semibold text-[#1A1F2B]">{parcel.zoning.maxCoveragePct}%</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Setbacks */}
                                    {(parcel.zoning.minFrontSetbackFt || parcel.zoning.minRearSetbackFt || parcel.zoning.minSideSetbackFt) && (
                                        <div className="mt-2 p-2.5 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                                            <div className="text-[10px] text-[#7A8599] uppercase tracking-wider font-semibold mb-1.5">Setbacks</div>
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <div className="text-[10px] text-[#A0AABB]">Front</div>
                                                    <div className="text-xs font-semibold text-[#4A5568]">{parcel.zoning.minFrontSetbackFt ? `${parcel.zoning.minFrontSetbackFt} ft` : '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-[#A0AABB]">Side</div>
                                                    <div className="text-xs font-semibold text-[#4A5568]">{parcel.zoning.minSideSetbackFt ? `${parcel.zoning.minSideSetbackFt} ft` : '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-[#A0AABB]">Rear</div>
                                                    <div className="text-xs font-semibold text-[#4A5568]">{parcel.zoning.minRearSetbackFt ? `${parcel.zoning.minRearSetbackFt} ft` : '—'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Permitted Uses — compact summary */}
                                    {parcel.zoning.permittedUses && parcel.zoning.permittedUses.length > 0 && (
                                        <div className="mt-2">
                                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Permitted Uses</div>
                                            <div className="flex flex-wrap gap-1">
                                                {parcel.zoning.permittedUses.slice(0, 6).map((use, i) => (
                                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#4A5568] capitalize">{use}</span>
                                                ))}
                                                {parcel.zoning.permittedUses.length > 6 && (
                                                    <button
                                                        onClick={() => setShowZoningModal(true)}
                                                        className="text-[10px] px-1.5 py-0.5 text-[#8B5CF6] hover:text-[#7C3AED] font-medium transition-colors"
                                                    >
                                                        +{parcel.zoning.permittedUses.length - 6} more →
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-3 p-2 rounded-md bg-[#FAFBFC] border border-[#F0F1F4]">
                                        <p className="text-[10px] text-[#7A8599] leading-relaxed">
                                            Zoning data sourced from local jurisdiction records. Always verify with the local planning department before making development decisions.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center py-6 text-center">
                                    <div>
                                        <Layers className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No zoning data available</p>
                                        <p className="text-[10px] text-[#C8CDD5] mt-1">Check local planning department</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ===== Zoning Detail Modal ===== */}
                        {showZoningModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowZoningModal(false)}>
                                <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-lg shadow-xl animate-fade-in max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-[#8B5CF6]" />
                                            <h2 className="text-lg font-semibold text-[#1A1F2B]">Zoning Details</h2>
                                            {parcel.zoning.code && (
                                                <span className="text-sm font-bold text-[#8B5CF6] bg-[#8B5CF6]/10 px-2 py-0.5 rounded-md">{parcel.zoning.code}</span>
                                            )}
                                        </div>
                                        <button onClick={() => setShowZoningModal(false)} className="p-1 rounded-md hover:bg-[#F4F5F7] text-[#7A8599] hover:text-[#1A1F2B] transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Raw Description */}
                                    {parcel.zoning.rawDescription && (
                                        <div className="mb-4">
                                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Raw Zoning Description (Local Source)</div>
                                            <p className="text-sm text-[#4A5568] leading-relaxed bg-[#FAFBFC] border border-[#F0F1F4] rounded-lg p-3">{parcel.zoning.rawDescription}</p>
                                        </div>
                                    )}

                                    {/* Standardized Description */}
                                    {parcel.zoning.description && (
                                        <div className="mb-4">
                                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Standardized Description</div>
                                            <p className="text-sm text-[#4A5568] leading-relaxed">{parcel.zoning.description}</p>
                                        </div>
                                    )}

                                    {/* Permitted Uses — full list */}
                                    {parcel.zoning.permittedUses && parcel.zoning.permittedUses.length > 0 && (
                                        <div className="mb-4">
                                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1.5">Permitted Uses ({parcel.zoning.permittedUses.length})</div>
                                            <div className="flex flex-wrap gap-1">
                                                {parcel.zoning.permittedUses.map((use, i) => (
                                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#4A5568] capitalize">{use}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Conditional / Special Permitted Uses */}
                                    {parcel.zoning.conditionalUses && parcel.zoning.conditionalUses.length > 0 && (
                                        <div className="mb-4">
                                            <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1.5">Conditional / Special Uses ({parcel.zoning.conditionalUses.length})</div>
                                            <div className="flex flex-wrap gap-1">
                                                {parcel.zoning.conditionalUses.map((use, i) => (
                                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] capitalize">{use}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Municipality & Data Freshness */}
                                    <div className="pt-3 border-t border-[#F0F1F4] space-y-1.5">
                                        {parcel.zoning.municipality && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-[#7A8599]">Municipality</span>
                                                <span className="font-medium text-[#4A5568]">{parcel.zoning.municipality}</span>
                                            </div>
                                        )}
                                        {parcel.zoning.zoningLastUpdated && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-[#7A8599]">Zoning Data Last Updated</span>
                                                <span className="font-medium text-[#4A5568]">{parcel.zoning.zoningLastUpdated}</span>
                                            </div>
                                        )}
                                        {parcel.zoning.zoningCodeLink && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-[#7A8599]">Local Ordinance</span>
                                                <a href={parcel.zoning.zoningCodeLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#2563EB] hover:underline font-medium">
                                                    View Code <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        )}
                                    </div>

                                    {/* Disclaimer */}
                                    <div className="mt-4 p-2.5 rounded-md bg-[#FAFBFC] border border-[#F0F1F4]">
                                        <p className="text-[10px] text-[#7A8599] leading-relaxed">
                                            Zoning data sourced from local jurisdiction records via Zoneomics. Always verify with the local planning department before making development decisions.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tax & Valuation Card */}
                        <div className="card">
                            <div className="flex items-center gap-1.5 mb-3">
                                <DollarSign className="w-3.5 h-3.5 text-[#0D7A3E]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Tax & Valuation</h3>
                            </div>

                            {/* Site-wide tax summary (if multiple records) */}
                            {taxSummary && (taxSummary.realPropertyCount > 1 || taxSummary.personalPropertyCount > 0) && (
                                <div className="mb-3 p-2.5 rounded-lg bg-[#0D7A3E]/5 border border-[#0D7A3E]/15">
                                    <div className="text-[10px] text-[#0D7A3E] uppercase tracking-wider font-semibold mb-1.5">Site-Wide Total ({taxSummary.realPropertyCount} real property + {taxSummary.personalPropertyCount} BPP records)</div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Total Real Property</div>
                                            <div className="text-sm font-bold text-[#1A1F2B]">{formatCurrency(taxSummary.totalRealPropertyValue)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Total Personal Property</div>
                                            <div className="text-sm font-bold text-[#1A1F2B]">{formatCurrency(taxSummary.totalPersonalPropertyValue)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Land Value</div>
                                            <div className="text-xs font-semibold text-[#4A5568]">{formatCurrency(taxSummary.totalLandValue)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Improvements</div>
                                            <div className="text-xs font-semibold text-[#4A5568]">{formatCurrency(taxSummary.totalImprovementValue)}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Primary record details */}
                            {parcel.tax.totalValue || parcel.tax.taxAmount ? (
                                <>
                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">
                                        Primary Record · {parcel.details.useCodeDescription || 'Real Property'}
                                    </div>
                                    <InfoRow
                                        label={assemblage.length > 0 ? 'Total Assessed Value (combined)' : 'Total Assessed Value'}
                                        value={formatCurrency(
                                            (parcel.tax.totalValue || 0) + assemblage.reduce((s, p) => s + (p.totalAssessedValue || 0), 0)
                                        )}
                                        icon={DollarSign}
                                        highlight
                                    />
                                    <InfoRow
                                        label={assemblage.length > 0 ? 'Land Value (combined)' : 'Land Value'}
                                        value={formatCurrency(
                                            (parcel.tax.landValue || 0) + assemblage.reduce((s, p) => s + (p.landValue || 0), 0)
                                        )}
                                        subtext={(() => {
                                            const totalVal = (parcel.tax.totalValue || 0) + assemblage.reduce((s, p) => s + (p.totalAssessedValue || 0), 0);
                                            const totalLand = (parcel.tax.landValue || 0) + assemblage.reduce((s, p) => s + (p.landValue || 0), 0);
                                            return totalVal > 0 && totalLand > 0 ? `${((totalLand / totalVal) * 100).toFixed(0)}% of total` : undefined;
                                        })()}
                                    />
                                    <InfoRow
                                        label={assemblage.length > 0 ? 'Improvement Value (combined)' : 'Improvement Value'}
                                        value={formatCurrency(
                                            (parcel.tax.improvementValue || 0) + assemblage.reduce((s, p) => s + (p.improvementValue || 0), 0)
                                        )}
                                        subtext={(() => {
                                            const totalVal = (parcel.tax.totalValue || 0) + assemblage.reduce((s, p) => s + (p.totalAssessedValue || 0), 0);
                                            const totalImp = (parcel.tax.improvementValue || 0) + assemblage.reduce((s, p) => s + (p.improvementValue || 0), 0);
                                            return totalVal > 0 && totalImp > 0 ? `${((totalImp / totalVal) * 100).toFixed(0)}% of total` : undefined;
                                        })()}
                                    />
                                    <InfoRow label="Annual Tax Amount" value={formatCurrency(parcel.tax.taxAmount)} icon={DollarSign} highlight />
                                    <InfoRow label="Valuation Method" value={parcel.tax.valuationType} />
                                    <InfoRow label="Tax Year" value={parcel.tax.assessedYear} icon={Calendar} />
                                    {parcel.details.lastSalePrice != null && (
                                        <InfoRow label="Last Sale Price" value={formatCurrency(parcel.details.lastSalePrice)} icon={DollarSign} highlight />
                                    )}
                                    {parcel.details.lastSaleDate && (
                                        <InfoRow label="Last Sale Date" value={new Date(parcel.details.lastSaleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} icon={Calendar} />
                                    )}

                                    {/* Computed metrics */}
                                    {(() => {
                                        const totalLand = (parcel.tax.landValue || 0) + assemblage.reduce((s, p) => s + (p.landValue || 0), 0);
                                        const totalSF = (parcel.details.lotSizeSF || 0) + assemblage.reduce((s, p) => s + (p.lotSizeSF || 0), 0);
                                        const totalAc = (parcel.details.lotSizeAcres || 0) + assemblage.reduce((s, p) => s + (p.lotSizeAcres || 0), 0);
                                        const totalVal = (parcel.tax.totalValue || 0) + assemblage.reduce((s, p) => s + (p.totalAssessedValue || 0), 0);
                                        const totalTax = parcel.tax.taxAmount || 0;
                                        if (totalLand <= 0 || totalSF <= 0) return null;
                                        return (
                                            <div className="mt-3 p-2.5 rounded-lg bg-[#0D7A3E]/5 border border-[#0D7A3E]/15">
                                                <div className="text-[10px] text-[#0D7A3E] uppercase tracking-wider font-semibold mb-1">
                                                    Computed Metrics{assemblage.length > 0 ? ' (combined)' : ''}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <div className="text-[10px] text-[#7A8599]">Land $/SF</div>
                                                        <div className="text-sm font-semibold text-[#0D7A3E]">{formatCurrency(totalLand / totalSF)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-[#7A8599]">Land $/Acre</div>
                                                        <div className="text-sm font-semibold text-[#0D7A3E]">{totalAc > 0 ? formatCurrency(totalLand / totalAc) : '—'}</div>
                                                    </div>
                                                </div>
                                                {totalTax > 0 && totalVal > 0 && (
                                                    <div className="mt-1.5">
                                                        <div className="text-[10px] text-[#7A8599]">Effective Tax Rate</div>
                                                        <div className="text-sm font-semibold text-[#0D7A3E]">{((totalTax / totalVal) * 100).toFixed(2)}%</div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </>
                            ) : (
                                <div className="flex items-center justify-center py-6 text-center">
                                    <div>
                                        <DollarSign className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No tax data available</p>
                                    </div>
                                </div>
                            )}

                            {/* Associated Records toggle */}
                            {associatedRecords.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-[#F0F1F4]">
                                    <button
                                        onClick={() => setShowAssociated(!showAssociated)}
                                        className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:text-[#1D4ED8] font-medium uppercase tracking-wider"
                                    >
                                        {showAssociated ? '▾' : '▸'} {associatedRecords.length} Associated Record{associatedRecords.length !== 1 ? 's' : ''}
                                    </button>
                                    {showAssociated && (
                                        <div className="mt-2 space-y-2">
                                            {associatedRecords.map((rec, i) => (
                                                <div key={i} className="p-2 rounded-md bg-[#FAFBFC] border border-[#F0F1F4]">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rec.recordType === 'personal_property'
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                            }`}>
                                                            {rec.recordType === 'personal_property' ? 'BPP' : 'Real Property'}
                                                        </span>
                                                        <span className="text-xs font-semibold text-[#1A1F2B]">{formatCurrency(rec.tax.totalValue)}</span>
                                                    </div>
                                                    <div className="text-[11px] text-[#4A5568] font-medium">{rec.owner.name}</div>
                                                    <div className="text-[10px] text-[#A0AABB]">
                                                        {rec.details.useCodeDescription} · #{rec.details.parcelNumber}
                                                    </div>
                                                    {rec.tax.landValue !== null && rec.tax.landValue > 0 && (
                                                        <div className="text-[10px] text-[#7A8599] mt-0.5">
                                                            Land: {formatCurrency(rec.tax.landValue)} · Imp: {formatCurrency(rec.tax.improvementValue)}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Ownership Card */}
                        <div className="card">
                            <div className="flex items-center gap-1.5 mb-3">
                                <User className="w-3.5 h-3.5 text-[#DC6B3F]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Ownership</h3>
                            </div>
                            {parcel.owner.name ? (
                                <>
                                    <InfoRow label="Owner" value={parcel.owner.name} icon={User} highlight />
                                    {parcel.owner.name2 && (
                                        <InfoRow label="Co-Owner / Entity" value={parcel.owner.name2} />
                                    )}
                                    {(parcel.owner.mailingAddress || parcel.owner.mailingCity) && (
                                        <InfoRow
                                            label="Mailing Address"
                                            value={[
                                                parcel.owner.mailingAddress,
                                                [parcel.owner.mailingCity, parcel.owner.mailingState, parcel.owner.mailingZip].filter(Boolean).join(', '),
                                            ].filter(Boolean).join('\n')}
                                            icon={MapPin}
                                        />
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center justify-center py-6 text-center">
                                    <div>
                                        <User className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No ownership data available</p>
                                    </div>
                                </div>
                            )}

                            {/* Legal Description */}
                            {parcel.details.legalDescription && (
                                <div className="mt-3 pt-3 border-t border-[#F0F1F4]">
                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1">Legal Description</div>
                                    <p className="text-[11px] text-[#7A8599] leading-relaxed break-words">{parcel.details.legalDescription}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* FEMA Risk & Site Details - full width row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* FEMA & Risk Card */}
                        <div className="card">
                            <div className="flex items-center gap-1.5 mb-3">
                                <Shield className="w-3.5 h-3.5 text-[#2563EB]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">FEMA Risk & Hazard</h3>
                            </div>
                            {parcel.details.femaNriRiskRating ? (
                                <>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold ${getRiskColor(parcel.details.femaNriRiskRating)
                                            }`}>
                                            <Shield className="w-3.5 h-3.5" />
                                            {parcel.details.femaNriRiskRating}
                                        </span>
                                    </div>
                                    <InfoRow label="FEMA National Risk Index" value={parcel.details.femaNriRiskRating} highlight />
                                    {parcel.details.femaFloodZone && (
                                        <InfoRow label="Flood Zone" value={`${parcel.details.femaFloodZone}${parcel.details.femaFloodZoneSubtype ? ` (${parcel.details.femaFloodZoneSubtype})` : ''}`} />
                                    )}
                                    <div className="mt-2 p-2 rounded-md bg-[#FAFBFC] border border-[#F0F1F4]">
                                        <p className="text-[10px] text-[#7A8599] leading-relaxed">
                                            The FEMA NRI rates community risk based on expected annual loss from 18 natural hazards including flooding, hurricanes, earthquakes, and wildfires.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center py-6 text-center">
                                    <div>
                                        <Shield className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No FEMA risk data available</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Elevation & Building Footprint Card */}
                        <div className="card">
                            <div className="flex items-center gap-1.5 mb-3">
                                <Mountain className="w-3.5 h-3.5 text-[#059669]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Elevation & Buildings</h3>
                            </div>

                            {/* Elevation */}
                            {(parcel.details.highestElevation || parcel.details.lowestElevation) ? (
                                <div className="mb-3 p-2.5 rounded-lg bg-[#059669]/5 border border-[#059669]/15">
                                    <div className="text-[10px] text-[#059669] uppercase tracking-wider font-semibold mb-1.5">Elevation (ft above sea level)</div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Low</div>
                                            <div className="text-sm font-semibold text-[#1A1F2B]">{parcel.details.lowestElevation ? `${parcel.details.lowestElevation} ft` : '—'}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">High</div>
                                            <div className="text-sm font-semibold text-[#1A1F2B]">{parcel.details.highestElevation ? `${parcel.details.highestElevation} ft` : '—'}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Change</div>
                                            <div className="text-sm font-semibold text-[#1A1F2B]">
                                                {parcel.details.highestElevation && parcel.details.lowestElevation
                                                    ? `${(parcel.details.highestElevation - parcel.details.lowestElevation).toFixed(1)} ft`
                                                    : '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {/* Building footprint summary */}
                            {buildings.length > 0 && (
                                <div>
                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-1.5">Building Footprints</div>
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Buildings</div>
                                            <div className="text-sm font-semibold text-[#1A1F2B]">{buildings.length}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Total Footprint</div>
                                            <div className="text-sm font-semibold text-[#1A1F2B]">{formatNumber(buildings.reduce((sum, b) => sum + b.footprintSF, 0))} SF</div>
                                        </div>
                                    </div>
                                    {buildings.map((b, i) => (
                                        <div key={i} className="flex items-center justify-between py-1 border-t border-[#F0F1F4] text-[11px]">
                                            <span className="text-[#7A8599]">Building {i + 1}</span>
                                            <span className="font-medium text-[#4A5568]">{formatNumber(b.footprintSF)} SF</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!parcel.details.highestElevation && !parcel.details.lowestElevation && buildings.length === 0 && (
                                <div className="flex items-center justify-center py-6 text-center">
                                    <div>
                                        <Mountain className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No elevation or building data available</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Opportunity Zone & Census Card */}
                        <div className="card">
                            <div className="flex items-center gap-1.5 mb-3">
                                <BadgeDollarSign className="w-3.5 h-3.5 text-[#7C3AED]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Opportunity Zone & Census</h3>
                            </div>

                            {/* QOZ Status Badge */}
                            <div className="flex items-center gap-2 mb-3">
                                {parcel.details.qualifiedOpportunityZone?.toLowerCase() === 'yes' ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-green-50 text-green-700 border border-green-200">
                                        <BadgeDollarSign className="w-4 h-4" />
                                        Qualified Opportunity Zone
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-50 text-gray-600 border border-gray-200">
                                        <BadgeDollarSign className="w-4 h-4" />
                                        Not in Opportunity Zone
                                    </span>
                                )}
                            </div>

                            {/* Census details */}
                            {parcel.details.censusTract && (
                                <div className="space-y-0.5">
                                    <InfoRow label="Census Tract" value={parcel.details.censusTract} icon={MapPinned} />
                                    {parcel.details.censusBlockGroup && (
                                        <InfoRow label="Block Group" value={parcel.details.censusBlockGroup} />
                                    )}
                                    {parcel.details.countyFips && (
                                        <InfoRow label="County FIPS" value={parcel.details.countyFips} />
                                    )}
                                    {parcel.details.censusSchoolDistrict && (
                                        <InfoRow label="School District" value={parcel.details.censusSchoolDistrict} icon={Home} />
                                    )}
                                </div>
                            )}

                            {/* CDFI lookup link */}
                            <div className="mt-3 pt-3 border-t border-[#F0F1F4]">
                                <a
                                    href={`https://www.cdfifund.gov/opportunity-zones`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:text-[#1D4ED8] font-medium"
                                >
                                    <ExternalLink className="w-3 h-3" /> CDFI Opportunity Zone Resources
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* HUD Fair Market Rents & Walk Score */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* HUD FMR Card */}
                        <div className="card">
                            <div className="flex items-center gap-1.5 mb-3">
                                <Home className="w-3.5 h-3.5 text-[#0369A1]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">HUD Fair Market Rents</h3>
                            </div>
                            {fmrLoading ? (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 className="w-5 h-5 animate-spin text-[#0369A1]" />
                                    <span className="ml-2 text-xs text-[#7A8599]">Loading FMR data...</span>
                                </div>
                            ) : fmrData ? (
                                <>
                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-2">
                                        {fmrData.areaName} · FY {fmrData.year}
                                    </div>

                                    {/* Rent comparison table */}
                                    <div className="overflow-hidden rounded-lg border border-[#E2E5EA]">
                                        <table className="w-full text-[11px]">
                                            <thead>
                                                <tr className="bg-[#F7F8FA] text-[#7A8599]">
                                                    <th className="text-left px-2 py-1.5 font-semibold">Unit Type</th>
                                                    {fmrData.msaRents && <th className="text-right px-2 py-1.5 font-semibold">MSA</th>}
                                                    {fmrData.zipRents && <th className="text-right px-2 py-1.5 font-semibold">ZIP {fmrData.zip}</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[
                                                    { label: 'Studio', key: 'studio' },
                                                    { label: '1 Bedroom', key: 'oneBr' },
                                                    { label: '2 Bedroom', key: 'twoBr' },
                                                    { label: '3 Bedroom', key: 'threeBr' },
                                                    { label: '4 Bedroom', key: 'fourBr' },
                                                ].map(({ label, key }) => (
                                                    <tr key={key} className="border-t border-[#F0F1F4]">
                                                        <td className="px-2 py-1.5 text-[#4A5568] font-medium">{label}</td>
                                                        {fmrData.msaRents && (
                                                            <td className="text-right px-2 py-1.5 text-[#7A8599]">
                                                                {fmrData.msaRents[key] ? formatCurrency(fmrData.msaRents[key]) : '—'}
                                                            </td>
                                                        )}
                                                        {fmrData.zipRents && (
                                                            <td className="text-right px-2 py-1.5 font-semibold text-[#0369A1]">
                                                                {fmrData.zipRents[key] ? formatCurrency(fmrData.zipRents[key]) : '—'}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-2 flex items-center justify-between">
                                        <p className="text-[10px] text-[#A0AABB]">
                                            {fmrData.zipRents ? 'Small Area FMR (SAFMR) — ZIP-level' : 'Metro area level'}
                                        </p>
                                        <a
                                            href="https://www.huduser.gov/portal/datasets/fmr.html"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:text-[#1D4ED8] font-medium"
                                        >
                                            <ExternalLink className="w-2.5 h-2.5" /> HUD Data
                                        </a>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center py-6 text-center">
                                    <div>
                                        <Home className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No FMR data available</p>
                                        <p className="text-[10px] text-[#C8CDD5] mt-1">Check HUD API key</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Walk Score Widget */}
                        <div className="card">
                            <div className="flex items-center gap-1.5 mb-3">
                                <MapPin className="w-3.5 h-3.5 text-[#16A34A]" />
                                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Walk Score</h3>
                            </div>
                            {walkScoreUrl ? (
                                <div className="flex flex-col items-center justify-center py-6">
                                    <a
                                        href={walkScoreUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#16A34A]/10 border border-[#16A34A]/20 text-[#16A34A] hover:bg-[#16A34A]/20 transition-colors text-sm font-semibold"
                                    >
                                        <MapPin className="w-4 h-4" />
                                        View Walk Score, Transit Score & Bike Score
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                    <p className="text-[10px] text-[#A0AABB] mt-2">
                                        {parcel.details.address}{parcel.details.city ? `, ${parcel.details.city}` : ''}{parcel.details.state ? `, ${parcel.details.state}` : ''}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center py-6 text-center">
                                    <div>
                                        <MapPin className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No address available for Walk Score</p>
                                    </div>
                                </div>
                            )}
                            <div className="mt-1 text-[10px] text-[#C8CDD5] text-center">
                                Powered by Walk Score®
                            </div>
                        </div>
                    </div>
                    {/* ════════════════════ LAND ASSEMBLAGE ════════════════════ */}
                    {!hideAssemblage && (
                        <div className="card mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-[#7C3AED]" />
                                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Land Assemblage</h3>
                                    {assemblage.length > 0 && (
                                        <span className="flex items-center gap-1 text-[10px] text-[#0D7A3E] bg-[#0D7A3E]/10 px-1.5 py-0.5 rounded-full font-medium">
                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                            {assemblage.length} parcel{assemblage.length !== 1 ? 's' : ''} selected
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={nearbyRadius}
                                        onChange={(e) => setNearbyRadius(Number(e.target.value))}
                                        className="text-xs px-2 py-1 rounded-md border border-[#E2E5EA] text-[#4A5568] focus:border-[#2563EB] focus:outline-none bg-white"
                                        disabled={nearbyLoading}
                                    >
                                        <option value={100}>100m radius</option>
                                        <option value={200}>200m radius</option>
                                        <option value={500}>500m radius</option>
                                        <option value={1000}>1km radius</option>
                                    </select>
                                    <button
                                        onClick={async () => {
                                            if (!latitude || !longitude) return;
                                            setNearbyLoading(true);
                                            setNearbyError(null);
                                            try {
                                                const res = await fetch('/api/regrid/nearby', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        latitude,
                                                        longitude,
                                                        radiusMeters: nearbyRadius,
                                                        excludeRegridIds: parcel?.regridId ? [parcel.regridId] : [],
                                                    }),
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error || 'Failed to discover nearby parcels');
                                                setNearbyParcels(data.parcels || []);
                                                setShowNearby(true);
                                            } catch (err: any) {
                                                setNearbyError(err.message);
                                            } finally {
                                                setNearbyLoading(false);
                                            }
                                        }}
                                        disabled={nearbyLoading || !latitude || !longitude}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white text-xs font-medium transition-colors"
                                    >
                                        {nearbyLoading ? (
                                            <><Loader2 className="w-3 h-3 animate-spin" /> Searching...</>
                                        ) : (
                                            <><Radar className="w-3 h-3" /> Discover Nearby</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {nearbyError && (
                                <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA]">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-[#DC2626] flex-shrink-0" />
                                    <p className="text-xs text-[#DC2626]">{nearbyError}</p>
                                </div>
                            )}

                            {/* Assemblage Summary Banner */}
                            {assemblage.length > 0 && (
                                <div className="bg-[#7C3AED]/5 border border-[#7C3AED]/20 rounded-lg p-3 mb-3">
                                    <div className="text-[10px] font-bold text-[#7C3AED] uppercase tracking-wider mb-2">Assemblage Summary</div>
                                    <div className="grid grid-cols-4 gap-3">
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Parcels</div>
                                            <div className="text-sm font-bold text-[#1A1F2B]">{assemblage.length + 1}</div>
                                            <div className="text-[9px] text-[#A0AABB]">incl. primary</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Combined Site Area</div>
                                            <div className="text-sm font-bold text-[#1A1F2B]">
                                                {formatNumber(
                                                    (parcel?.details?.lotSizeSF || siteAreaSF || 0) +
                                                    assemblage.reduce((s, p) => s + (p.lotSizeSF || 0), 0)
                                                )} SF
                                            </div>
                                            <div className="text-[9px] text-[#A0AABB]">
                                                {((
                                                    (parcel?.details?.lotSizeSF || siteAreaSF || 0) +
                                                    assemblage.reduce((s, p) => s + (p.lotSizeSF || 0), 0)
                                                ) / 43560).toFixed(2)} acres
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Total Assessed Value</div>
                                            <div className="text-sm font-bold text-[#1A1F2B]">
                                                {formatCurrency(
                                                    (parcel?.tax?.totalValue || 0) +
                                                    assemblage.reduce((s, p) => s + (p.totalAssessedValue || 0), 0)
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-[#7A8599]">Total Land Value</div>
                                            <div className="text-sm font-bold text-[#1A1F2B]">
                                                {formatCurrency(
                                                    (parcel?.tax?.landValue || 0) +
                                                    assemblage.reduce((s, p) => s + (p.landValue || 0), 0)
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Selected parcel chips */}
                                    <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-[#7C3AED]/10">
                                        <div className="text-[10px] px-2 py-1 rounded-md bg-[#1A1F2B] text-white font-medium">Primary: {parcel?.details?.address || 'Current site'}</div>
                                        {assemblage.map((ap) => (
                                            <div key={ap.regridId || ap.parcelNumber} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[#7C3AED]/10 text-[#7C3AED] font-medium">
                                                {ap.address || ap.parcelNumber || 'Unknown'}
                                                <button
                                                    onClick={() => {
                                                        const updated = assemblage.filter(x => (x.regridId || x.parcelNumber) !== (ap.regridId || ap.parcelNumber));
                                                        setAssemblage(updated);
                                                        if (onSaveAssemblage) onSaveAssemblage(updated as any);
                                                    }}
                                                    className="hover:text-[#DC2626] transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Nearby parcel results — map + list */}
                            {showNearby && nearbyParcels.length > 0 && (
                                <div>
                                    <div className="text-[10px] text-[#A0AABB] mb-2">{nearbyParcels.length} nearby parcels found within {nearbyRadius}m · Click parcels on the map or list to select</div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {/* Interactive Map */}
                                        <AssemblageMap
                                            latitude={latitude!}
                                            longitude={longitude!}
                                            primaryGeometry={parcel?.geometry}
                                            nearbyParcels={nearbyParcels}
                                            assemblage={assemblage}
                                            onToggleParcel={(np) => {
                                                const isSelected = assemblage.some(a => (a.regridId || a.parcelNumber) === (np.regridId || np.parcelNumber));
                                                const updated = isSelected
                                                    ? assemblage.filter(a => (a.regridId || a.parcelNumber) !== (np.regridId || np.parcelNumber))
                                                    : [...assemblage, np];
                                                setAssemblage(updated);
                                                if (onSaveAssemblage) onSaveAssemblage(updated as any);
                                            }}
                                        />

                                        {/* Scrollable list */}
                                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                            {nearbyParcels.map((np) => {
                                                const isSelected = assemblage.some(a => (a.regridId || a.parcelNumber) === (np.regridId || np.parcelNumber));
                                                return (
                                                    <div
                                                        key={np.regridId || np.parcelNumber || np.address}
                                                        className={`flex items-start justify-between p-3 rounded-lg border transition-colors cursor-pointer ${isSelected
                                                            ? 'bg-[#7C3AED]/5 border-[#7C3AED]/30'
                                                            : 'bg-white border-[#E2E5EA] hover:border-[#7C3AED]/30 hover:bg-[#FAFBFC]'
                                                            }`}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                const updated = assemblage.filter(a => (a.regridId || a.parcelNumber) !== (np.regridId || np.parcelNumber));
                                                                setAssemblage(updated);
                                                                if (onSaveAssemblage) onSaveAssemblage(updated as any);
                                                            } else {
                                                                const updated = [...assemblage, np];
                                                                setAssemblage(updated);
                                                                if (onSaveAssemblage) onSaveAssemblage(updated as any);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-xs font-semibold text-[#1A1F2B] truncate">
                                                                    {np.address || np.parcelNumber || 'Unknown Parcel'}
                                                                </span>
                                                                {np.parcelNumber && np.address && (
                                                                    <span className="text-[10px] text-[#A0AABB] flex-shrink-0">APN: {np.parcelNumber}</span>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                                                {np.ownerName && <span className="text-[10px] text-[#7A8599]"><User className="w-2.5 h-2.5 inline mr-0.5" />{np.ownerName}</span>}
                                                                {np.lotSizeSF && <span className="text-[10px] text-[#7A8599]"><Ruler className="w-2.5 h-2.5 inline mr-0.5" />{formatNumber(np.lotSizeSF)} SF ({np.lotSizeAcres?.toFixed(2)} ac)</span>}
                                                                {np.totalAssessedValue && <span className="text-[10px] text-[#7A8599]"><DollarSign className="w-2.5 h-2.5 inline mr-0.5" />{formatCurrency(np.totalAssessedValue)}</span>}
                                                                {np.landUse && <span className="text-[10px] text-[#7A8599]"><FileText className="w-2.5 h-2.5 inline mr-0.5" />{np.landUse}</span>}
                                                                {np.zoningCode && <span className="text-[10px] text-[#7A8599]"><Shield className="w-2.5 h-2.5 inline mr-0.5" />{np.zoningCode}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex-shrink-0 ml-3">
                                                            {isSelected ? (
                                                                <div className="w-6 h-6 rounded-md bg-[#7C3AED] flex items-center justify-center">
                                                                    <Minus className="w-3.5 h-3.5 text-white" />
                                                                </div>
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-md border-2 border-[#E2E5EA] hover:border-[#7C3AED] flex items-center justify-center transition-colors">
                                                                    <Plus className="w-3.5 h-3.5 text-[#A0AABB]" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {showNearby && nearbyParcels.length === 0 && !nearbyLoading && (
                                <div className="flex items-center justify-center py-6">
                                    <div className="text-center">
                                        <Radar className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">No nearby parcels found within {nearbyRadius}m</p>
                                        <p className="text-[10px] text-[#C8CDD5] mt-0.5">Try increasing the search radius</p>
                                    </div>
                                </div>
                            )}

                            {!showNearby && assemblage.length === 0 && (
                                <div className="flex items-center justify-center py-6">
                                    <div className="text-center">
                                        <Layers className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                        <p className="text-xs text-[#A0AABB]">Click &ldquo;Discover Nearby&rdquo; to find adjacent parcels for assemblage</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Data source footer */}
                    <div className="flex items-center justify-between text-[10px] text-[#C8CDD5] pt-2">
                        <span>
                            Data provided by Regrid · Sourced from county assessor records
                            {parcel.dataDate && ` · Last updated: ${parcel.dataDate}`}
                        </span>
                        {parcel.regridId && (
                            <a
                                href={`https://app.regrid.com/us/parcel/${parcel.regridId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[#2563EB] hover:underline"
                            >
                                View on Regrid <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                        )}
                    </div>
                </>
            )
            }

            {/* Empty state before fetch */}
            {
                !parcel && !loading && !error && !hasFetched && (
                    <div className="card flex items-center justify-center py-16">
                        <div className="text-center">
                            <Building2 className="w-8 h-8 text-[#C8CDD5] mx-auto mb-3" />
                            <p className="text-sm text-[#7A8599]">Public parcel data will load automatically</p>
                            <p className="text-xs text-[#A0AABB] mt-1">Includes property details, zoning, tax assessments, and ownership records</p>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

