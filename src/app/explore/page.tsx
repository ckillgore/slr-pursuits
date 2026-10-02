'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Map as MapboxMap, MapMouseEvent, GeoJSONFeature } from 'mapbox-gl';
import { AppShell } from '@/components/layout/AppShell';
import { toast } from '@/lib/toast';
import { useCreatePursuit, useStages, useCreateLandComp } from '@/hooks/useSupabaseQueries';
import { searchPlaces, type GeocodeResult } from '@/lib/geocoding';
import { useMapboxMap, useIsDarkTheme } from '@/components/map/useMapboxMap';
import { MapStatusOverlay } from '@/components/map/MapStatusOverlay';
import { addLayerOnce } from '@/components/map/mapHelpers';
import type { Basemap } from '@/components/map/mapStyle';
import {
    Search, MapPin, Loader2, X, Building2, User, DollarSign, Layers,
    Calendar, Ruler, Home, FileText, LandPlot, Shield,
    Plus, Landmark, ExternalLink, ChevronRight, Eye,
} from 'lucide-react';

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

/** Theme-token badge classes for a FEMA NRI rating (fixed Tailwind palettes washed out in dark mode) */
function getRiskColor(rating: string): string {
    const r = rating.toLowerCase();
    if (r.includes('very low') || r.includes('relatively low')) return 'bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/30';
    if (r.includes('moderate')) return 'bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/30';
    if (r.includes('high')) return 'bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/30';
    return 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]';
}

/** Regrid growth fields are CAGR percentages already (1.25 = 1.25%/yr) — same convention as GrowthTrendsCard */
function fmtCagr(val: number | null): string | null {
    if (val == null || !Number.isFinite(val)) return null;
    return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%/yr`;
}

/** Full /api/regrid response, kept so a pursuit/comp created from it starts with a warm parcel cache */
interface RegridLookup {
    parcel: ParcelData;
    associatedRecords?: unknown[];
    taxSummary?: unknown;
    buildings?: unknown[];
}

// ======================== Regrid parcel layers ========================

const REGRID_SOURCE = 'regrid-parcels';
const PARCEL_FILL_LAYER = 'parcels-fill';
const PARCEL_OUTLINE_LAYER = 'parcels-outline';

const BASEMAP_LABELS: Record<Basemap, string> = { standard: 'Map', satellite: 'Satellite' };

/** Attributes of a Regrid parcel vector-tile feature that the tooltip and lookups read */
interface ParcelTileProps {
    address?: string;
    owner?: string;
    zoning?: string;
    zoning_type?: string;
    usedesc?: string;
    ll_gisacre?: string | number;
    ll_gissqft?: string | number;
    parval?: string | number;
    yearbuilt?: string | number;
    scity?: string;
    state2?: string;
    szip5?: string;
    parcelnumb?: string;
}

const toNum = (v: string | number | undefined) => (v ? parseFloat(String(v)) : null);

function tooltipDataFromProps(props: ParcelTileProps): ParcelTooltipData {
    return {
        address: props.address || null,
        owner: props.owner || null,
        zoning: props.zoning || null,
        zoningType: props.zoning_type || null,
        usedesc: props.usedesc || null,
        lotAcres: toNum(props.ll_gisacre),
        lotSqft: toNum(props.ll_gissqft),
        assessedValue: toNum(props.parval),
        yearBuilt: props.yearbuilt ? parseInt(String(props.yearbuilt)) : null,
        city: props.scity || null,
        state: props.state2 || null,
        zip: props.szip5 || null,
        parcelNumber: props.parcelnumb || null,
    };
}

/** Of overlapping features, the highest-value (main) property — skips business/personal property records */
function mainParcelFeature(features: GeoJSONFeature[] | undefined): GeoJSONFeature | null {
    if (!features?.length) return null;
    const value = (f: GeoJSONFeature) => toNum((f.properties as ParcelTileProps | null)?.parval) ?? 0;
    return features.reduce((best, f) => (value(f) > value(best) ? f : best), features[0]);
}

/** Parcel outline that reads on the faded day basemap, at night and on satellite */
function parcelOutlineColor(isDark: boolean, basemap: Basemap): string {
    return isDark || basemap === 'satellite' ? '#E2E8F0' : '#475569';
}

/** Regrid vector tiles; parcels sit in the `middle` slot so street labels stay on top. Idempotent. */
function addRegridLayers(map: MapboxMap, outlineColor: string) {
    if (!map.getSource(REGRID_SOURCE)) {
        map.addSource(REGRID_SOURCE, {
            type: 'vector',
            tiles: [`${window.location.origin}/api/explore?z={z}&x={x}&y={y}`],
            minzoom: 14,
            maxzoom: 21,
            promoteId: { parcels: 'parcelnumb' }, // Unique parcel ID for cross-tile feature-state hover
        });
    }

    // Parcel fill — transparent by default, blue on hover
    addLayerOnce(map, {
        id: PARCEL_FILL_LAYER,
        type: 'fill',
        source: REGRID_SOURCE,
        'source-layer': 'parcels',
        minzoom: 14,
        paint: {
            'fill-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#2563EB', 'transparent'],
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.15, 0],
        },
    });

    // Parcel outlines
    addLayerOnce(map, {
        id: PARCEL_OUTLINE_LAYER,
        type: 'line',
        source: REGRID_SOURCE,
        'source-layer': 'parcels',
        minzoom: 14,
        paint: {
            'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#2563EB', outlineColor],
            'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0.8],
            'line-opacity': 0.8,
        },
    });
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
        <div className="flex items-start gap-2.5 py-1.5 border-b border-[var(--bg-elevated)] last:border-0">
            {Icon && <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${highlight ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'}`} />}
            <div className="flex-1 min-w-0">
                <div className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">{label}</div>
                <div className={`text-xs ${highlight ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'} ${displayValue.length > 60 ? 'text-[10px] leading-relaxed' : ''}`}>
                    {displayValue}
                </div>
            </div>
        </div>
    );
}

// ======================== Component ========================

export default function ExplorePage() {
    const router = useRouter();
    // Map refs
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const hoveredParcelIdRef = useRef<string | number | null>(null);
    const isTouchDeviceRef = useRef(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchSeqRef = useRef(0);

    // Map state — the Map basemap follows the app's light/dark theme (handled by the map hook)
    const [basemap, setBasemap] = useState<Basemap>('standard');

    // Tooltip state
    const [tooltip, setTooltip] = useState<{ x: number; y: number; data: ParcelTooltipData } | null>(null);

    // Detail panel state
    const [panelOpen, setPanelOpen] = useState(false);
    const [panelLoading, setPanelLoading] = useState(false);
    const [panelParcel, setPanelParcel] = useState<ParcelData | null>(null);
    const [panelLookup, setPanelLookup] = useState<RegridLookup | null>(null);
    // Session cache of parcel lookups — /api/regrid is a paid call, and users often re-click the same parcel
    const regridCacheRef = useRef(new Map<string, RegridLookup | null>());
    // Coalesce hover-tooltip updates to one per animation frame (mousemove fires far faster than paint)
    const tooltipFrameRef = useRef<number | null>(null);
    const [panelError, setPanelError] = useState<string | null>(null);
    const [clickedLngLat, setClickedLngLat] = useState<[number, number] | null>(null);

    // Mobile tap popup state (shows summary before loading full details)
    const [mobilePopup, setMobilePopup] = useState<{ data: ParcelTooltipData; lngLat: [number, number]; props: ParcelTileProps } | null>(null);

    // Create actions
    const [showCreateDialog, setShowCreateDialog] = useState<'pursuit' | 'comp' | null>(null);
    const [createName, setCreateName] = useState('');
    const createPursuit = useCreatePursuit();
    const createComp = useCreateLandComp();
    const { data: stages = [] } = useStages();

    // Track zoom for parcel visibility message
    const [showZoomMsg, setShowZoomMsg] = useState(true);

    // ── Parcel detail loader (shared by desktop click + mobile "View Full Details") ──
    // A sequence number guards against an older, slower response overwriting the parcel the user clicked last.
    const parcelReqSeqRef = useRef(0);
    const loadParcelDetail = useCallback((lngLat: [number, number], address?: string, parcelId?: string | null) => {
        const seq = ++parcelReqSeqRef.current;
        setClickedLngLat(lngLat);
        setPanelOpen(true);
        setPanelError(null);
        setPanelParcel(null);
        setPanelLookup(null);

        // APNs are only unique within a county, so qualify them with a coarse (~1 km) location
        const cacheKey = parcelId
            ? `apn:${parcelId}@${lngLat[0].toFixed(2)},${lngLat[1].toFixed(2)}`
            : `pt:${lngLat[0].toFixed(5)},${lngLat[1].toFixed(5)}`;
        if (regridCacheRef.current.has(cacheKey)) {
            const cached = regridCacheRef.current.get(cacheKey);
            setPanelLoading(false);
            if (cached) { setPanelParcel(cached.parcel); setPanelLookup(cached); }
            else setPanelError('No parcel data found at this location.');
            return;
        }
        setPanelLoading(true);

        fetch('/api/regrid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                latitude: lngLat[1],
                longitude: lngLat[0],
                address: address || undefined,
            }),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Failed to fetch parcel data');
                return data;
            })
            .then((data) => {
                if (seq !== parcelReqSeqRef.current) return;
                if (data.parcel) {
                    const lookup: RegridLookup = {
                        parcel: data.parcel,
                        associatedRecords: data.associatedRecords || [],
                        taxSummary: data.taxSummary || null,
                        buildings: data.buildings || [],
                    };
                    regridCacheRef.current.set(cacheKey, lookup);
                    setPanelParcel(data.parcel);
                    setPanelLookup(lookup);
                } else {
                    regridCacheRef.current.set(cacheKey, null);
                    setPanelError('No parcel data found at this location.');
                }
            })
            .catch((err) => {
                if (seq !== parcelReqSeqRef.current) return;
                setPanelError(err.message || 'Failed to fetch parcel data');
            })
            .finally(() => {
                if (seq === parcelReqSeqRef.current) setPanelLoading(false);
            });
    }, []);

    const isDark = useIsDarkTheme();
    const outlineColor = parcelOutlineColor(isDark, basemap);
    const outlineColorRef = useRef(outlineColor);
    useEffect(() => { outlineColorRef.current = outlineColor; }, [outlineColor]);

    // ── Map: full-screen, so plain scroll-to-zoom (no cooperative gestures) ──
    const { map, ready, error: mapError } = useMapboxMap(mapContainerRef, {
        center: [-96.7970, 32.7767], // Default: DFW area
        zoom: 4,
        basemap,
        cooperativeGestures: false,
        // Re-runs after a basemap switch, which clears the parcel layers (and their hover state)
        onStyleReady: (m) => {
            hoveredParcelIdRef.current = null;
            addRegridLayers(m, outlineColorRef.current);
        },
    });

    // Theme / basemap changes recolor the outlines in place
    useEffect(() => {
        if (!map || !ready || !map.getLayer(PARCEL_OUTLINE_LAYER)) return;
        map.setPaintProperty(PARCEL_OUTLINE_LAYER, 'line-color', ['case', ['boolean', ['feature-state', 'hover'], false], '#2563EB', outlineColor]);
    }, [map, ready, outlineColor]);

    // ── Map listeners (layer-scoped listeners are keyed by layer id, so they survive basemap switches) ──
    useEffect(() => {
        if (!map || !ready) return;
        const canvas = map.getCanvas();

        // Track zoom level — use 'zoom' event so pinch-to-zoom on touch devices is captured
        const onZoom = () => setShowZoomMsg(map.getZoom() < 14);
        onZoom();

        // Detect touch device
        const onTouchStart = () => { isTouchDeviceRef.current = true; };
        canvas.addEventListener('touchstart', onTouchStart, { once: true, passive: true });

        const clearHover = () => {
            if (hoveredParcelIdRef.current !== null && map.getSource(REGRID_SOURCE)) {
                map.setFeatureState({ source: REGRID_SOURCE, sourceLayer: 'parcels', id: hoveredParcelIdRef.current }, { hover: false });
            }
            hoveredParcelIdRef.current = null;
        };

        // ── Hover handlers (desktop only — touch devices use tap) ──
        const onMove = (e: MapMouseEvent) => {
            if (isTouchDeviceRef.current) return;
            const feature = mainParcelFeature(e.features);
            if (!feature) return;
            canvas.style.cursor = 'pointer';

            // Update hover state (features without a promoted parcelnumb have no id — setFeatureState would throw)
            if (hoveredParcelIdRef.current !== null && hoveredParcelIdRef.current !== feature.id) clearHover();
            if (feature.id != null) {
                hoveredParcelIdRef.current = feature.id;
                map.setFeatureState({ source: REGRID_SOURCE, sourceLayer: 'parcels', id: feature.id }, { hover: true });
            }

            const data = tooltipDataFromProps(feature.properties as ParcelTileProps);
            const point = { x: e.point.x, y: e.point.y };
            if (tooltipFrameRef.current !== null) cancelAnimationFrame(tooltipFrameRef.current);
            tooltipFrameRef.current = requestAnimationFrame(() => {
                tooltipFrameRef.current = null;
                setTooltip({ ...point, data });
            });
        };

        const onLeave = () => {
            canvas.style.cursor = '';
            clearHover();
            if (tooltipFrameRef.current !== null) { cancelAnimationFrame(tooltipFrameRef.current); tooltipFrameRef.current = null; }
            setTooltip(null);
        };

        // ── Click handler ──
        const onClick = (e: MapMouseEvent) => {
            const feature = mainParcelFeature(e.features);
            if (!feature) return;
            const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
            const props = (feature.properties || {}) as ParcelTileProps;

            // On touch devices, show mobile popup first instead of immediately loading details
            if (isTouchDeviceRef.current) {
                setMobilePopup({ data: tooltipDataFromProps(props), lngLat, props });
                return;
            }

            // Desktop: immediately load full details
            setTooltip(null);
            loadParcelDetail(lngLat, props.address, props.parcelnumb);
        };

        map.on('zoom', onZoom);
        map.on('mousemove', PARCEL_FILL_LAYER, onMove);
        map.on('mouseleave', PARCEL_FILL_LAYER, onLeave);
        map.on('click', PARCEL_FILL_LAYER, onClick);
        return () => {
            map.off('zoom', onZoom);
            map.off('mousemove', PARCEL_FILL_LAYER, onMove);
            map.off('mouseleave', PARCEL_FILL_LAYER, onLeave);
            map.off('click', PARCEL_FILL_LAYER, onClick);
            canvas.removeEventListener('touchstart', onTouchStart);
            if (tooltipFrameRef.current !== null) { cancelAnimationFrame(tooltipFrameRef.current); tooltipFrameRef.current = null; }
        };
    }, [map, ready, loadParcelDetail]);

    // Escape closes the parcel panel / mobile popup
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || showCreateDialog) return;
            setMobilePopup(null);
            if (panelOpen) { parcelReqSeqRef.current++; setPanelOpen(false); setPanelLoading(false); setPanelParcel(null); setPanelError(null); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [panelOpen, showCreateDialog]);

    // ── Search autocomplete ──
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const seq = ++searchSeqRef.current;
        if (!query.trim() || query.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                // Temporary geocoding is fine here: results only move the map, nothing is saved
                const results = await searchPlaces(query);
                if (seq !== searchSeqRef.current) return; // stale response
                setSuggestions(results);
                setShowSuggestions(true);
            } catch { /* ignore */ }
        }, 300);
    }, []);

    const selectSuggestion = useCallback((s: GeocodeResult) => {
        searchSeqRef.current++;
        setSearchQuery(s.label);
        setSuggestions([]);
        setShowSuggestions(false);
        // Addresses zoom in close; cities / ZIPs stop where parcels first appear
        const zoom = s.featureType === 'address' || s.featureType === 'street' ? 16 : 14;
        map?.flyTo({ center: [s.lng, s.lat], zoom, duration: 1500 });
    }, [map]);

    // Close search on outside click
    useEffect(() => {
        const handleClick = () => { setShowSuggestions(false); };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    /** parcel_data payload in the shape PublicInfoTab caches (so it renders without a new Regrid call) */
    const parcelCacheFromLookup = (): Record<string, unknown> | null => {
        if (!panelLookup) return null;
        return {
            parcel: panelLookup.parcel,
            associatedRecords: panelLookup.associatedRecords ?? [],
            taxSummary: panelLookup.taxSummary ?? null,
            buildings: panelLookup.buildings ?? [],
            queriedAt: clickedLngLat,
        };
    };

    // ── Create Pursuit from parcel ──
    const handleCreatePursuit = useCallback(async () => {
        if (!panelParcel || !createName.trim() || createPursuit.isPending) return;
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
                // Seed the parcel cache with the lookup we already paid for, so the pursuit's Public Info tab doesn't re-query Regrid
                parcel_data: parcelCacheFromLookup(),
                parcel_data_updated_at: panelLookup ? new Date().toISOString() : null,
                drive_time_data: null,
                income_heatmap_data: null,
                parcel_assemblage: null,
                is_archived: false,
                primary_one_pager_id: null,
                executive_memo: null,
            });
            setShowCreateDialog(null);
            setCreateName('');
            router.push(`/pursuits/${newPursuit.short_id || newPursuit.id}`);
        } catch (err) {
            console.error('Failed to create pursuit:', err);
            toast.error('Failed to create pursuit', err);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panelParcel, panelLookup, createName, clickedLngLat, stages, createPursuit, router]);

    // ── Create Comp from parcel ──
    const handleCreateComp = useCallback(async () => {
        if (!panelParcel || !createName.trim() || createComp.isPending) return;
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
                parcel_data: parcelCacheFromLookup(),
                parcel_data_updated_at: panelLookup ? new Date().toISOString() : null,
            });
            setShowCreateDialog(null);
            setCreateName('');
            router.push(`/comps/${newComp.short_id || newComp.id}`);
        } catch (err) {
            console.error('Failed to create comp:', err);
            toast.error('Failed to create land comp', err);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panelParcel, panelLookup, createName, clickedLngLat, createComp, router]);

    return (
        <AppShell>
            <div className="relative" style={{ height: 'calc(100vh - 56px)' }}>
                {/* Mapbox controls override */}
                <style dangerouslySetInnerHTML={{ __html: `
                    .mapboxgl-ctrl-top-right {
                        top: 104px !important;
                    }
                    @media (min-width: 640px) {
                        .mapboxgl-ctrl-top-right {
                            top: 80px !important;
                        }
                    }
                ` }} />

                {/* Search Bar — floating overlay (full width on phones, the basemap toggle drops below it) */}
                <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-full sm:max-w-md z-20" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                        <div className="flex items-center gap-2 bg-[var(--bg-card)]/95 backdrop-blur-sm border border-[var(--border)] rounded-xl shadow-lg px-4 py-2.5">
                            <Search className="w-4 h-4 text-[var(--text-faint)] flex-shrink-0" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Search address, city, or zip code..."
                                aria-label="Search address, city, or zip code"
                                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                            />
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); setSuggestions([]); }} aria-label="Clear search" className="text-[var(--text-faint)] hover:text-[var(--text-secondary)]">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                                {suggestions.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => selectSuggestion(s)}
                                        className="w-full text-left px-4 py-3 hover:bg-[var(--accent-subtle)] transition-colors border-b border-[var(--table-row-border)] last:border-b-0"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <MapPin className="w-3.5 h-3.5 mt-0.5 text-[var(--text-faint)] flex-shrink-0" />
                                            <div>
                                                <div className="text-sm font-medium text-[var(--text-primary)]">{s.name}</div>
                                                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.secondary}</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Basemap Toggle — top-right (below the search bar on phones) */}
                <div className="absolute top-16 sm:top-4 right-4 z-20 flex bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-lg border border-[var(--border)] shadow-lg overflow-hidden" role="group" aria-label="Basemap">
                    {(Object.keys(BASEMAP_LABELS) as Basemap[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => setBasemap(key)}
                            aria-pressed={basemap === key}
                            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${basemap === key
                                ? 'bg-[var(--accent)] text-white'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                                }`}
                        >
                            {BASEMAP_LABELS[key]}
                        </button>
                    ))}
                </div>

                {/* Zoom message */}
                {showZoomMsg && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-[var(--bg-card)]/95 backdrop-blur-sm border border-[var(--border)] rounded-xl shadow-lg px-5 py-3 flex items-center gap-3">
                        <Eye className="w-4 h-4 text-[var(--text-faint)]" />
                        <div>
                            <p className="text-sm font-medium text-[var(--text-secondary)]">Zoom in to see parcels</p>
                            <p className="text-[10px] text-[var(--text-faint)]">Parcel boundaries appear at zoom level 14+</p>
                        </div>
                    </div>
                )}

                {/* Map Container */}
                <div ref={mapContainerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
                <MapStatusOverlay ready={ready} error={mapError} />

                {/* Hover Tooltip (desktop only) */}
                {tooltip && (
                    <div
                        className="absolute z-30 pointer-events-none hidden md:block"
                        style={{ left: tooltip.x + 12, top: tooltip.y - 8, maxWidth: 280 }}
                    >
                        <div className="bg-[var(--bg-card)]/95 backdrop-blur-sm border border-[var(--border)] rounded-lg shadow-xl px-3 py-2.5">
                            {tooltip.data.address && (
                                <div className="text-xs font-semibold text-[var(--text-primary)] mb-1">{tooltip.data.address}</div>
                            )}
                            {(tooltip.data.city || tooltip.data.state) && (
                                <div className="text-[10px] text-[var(--text-muted)] mb-1.5">
                                    {[tooltip.data.city, tooltip.data.state, tooltip.data.zip].filter(Boolean).join(', ')}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                                {tooltip.data.owner && (
                                    <div><span className="text-[var(--text-faint)]">Owner:</span> <span className="text-[var(--text-secondary)]">{tooltip.data.owner}</span></div>
                                )}
                                {tooltip.data.parcelNumber && (
                                    <div><span className="text-[var(--text-faint)]">Parcel:</span> <span className="text-[var(--text-secondary)]">{tooltip.data.parcelNumber}</span></div>
                                )}
                                {tooltip.data.zoning && (
                                    <div><span className="text-[var(--text-faint)]">Zoning:</span> <span className="text-[var(--text-secondary)] font-medium">{tooltip.data.zoning}</span></div>
                                )}
                                {tooltip.data.usedesc && (
                                    <div><span className="text-[var(--text-faint)]">Use:</span> <span className="text-[var(--text-secondary)]">{tooltip.data.usedesc}</span></div>
                                )}
                                {tooltip.data.lotAcres != null && tooltip.data.lotAcres > 0 && (
                                    <div>
                                        <span className="text-[var(--text-faint)]">Size:</span>{' '}
                                        <span className="text-[var(--text-secondary)] font-medium">
                                            {formatNumber(tooltip.data.lotAcres, 2)} ac
                                            {tooltip.data.lotSqft ? ` (${formatNumber(tooltip.data.lotSqft)} SF)` : ''}
                                        </span>
                                    </div>
                                )}
                                {tooltip.data.assessedValue != null && tooltip.data.assessedValue > 0 && (
                                    <div><span className="text-[var(--text-faint)]">Value:</span> <span className="text-[var(--text-secondary)]">{formatCurrency(tooltip.data.assessedValue)}</span></div>
                                )}
                                {tooltip.data.yearBuilt != null && tooltip.data.yearBuilt > 0 && (
                                    <div><span className="text-[var(--text-faint)]">Built:</span> <span className="text-[var(--text-secondary)]">{tooltip.data.yearBuilt}</span></div>
                                )}
                            </div>
                            <div className="text-[9px] text-[var(--text-faint)] mt-1.5 border-t border-[var(--table-row-border)] pt-1">Click for full details</div>
                        </div>
                    </div>
                )}

                {/* Mobile Tap Popup — floating card */}
                {mobilePopup && (
                    <div className="absolute bottom-32 left-4 right-4 md:top-24 md:right-6 md:left-auto md:bottom-auto md:w-[26rem] z-30 animate-fade-in">
                        <div className="bg-[var(--bg-card)]/95 backdrop-blur-sm border border-[var(--border)] shadow-2xl rounded-2xl px-4 py-3">
                            {/* Close button */}
                            <button
                                onClick={() => setMobilePopup(null)}
                                aria-label="Close parcel summary"
                                className="absolute top-2 right-3 p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            {mobilePopup.data.address && (
                                <div className="text-sm font-semibold text-[var(--text-primary)] mb-0.5 pr-6">{mobilePopup.data.address}</div>
                            )}
                            {(mobilePopup.data.city || mobilePopup.data.state) && (
                                <div className="text-[10px] text-[var(--text-muted)] mb-2">
                                    {[mobilePopup.data.city, mobilePopup.data.state, mobilePopup.data.zip].filter(Boolean).join(', ')}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] mb-3">
                                {mobilePopup.data.owner && (
                                    <div><span className="text-[var(--text-faint)]">Owner:</span> <span className="text-[var(--text-secondary)]">{mobilePopup.data.owner}</span></div>
                                )}
                                {mobilePopup.data.parcelNumber && (
                                    <div><span className="text-[var(--text-faint)]">Parcel:</span> <span className="text-[var(--text-secondary)]">{mobilePopup.data.parcelNumber}</span></div>
                                )}
                                {mobilePopup.data.zoning && (
                                    <div><span className="text-[var(--text-faint)]">Zoning:</span> <span className="text-[var(--text-secondary)] font-medium">{mobilePopup.data.zoning}</span></div>
                                )}
                                {mobilePopup.data.usedesc && (
                                    <div><span className="text-[var(--text-faint)]">Use:</span> <span className="text-[var(--text-secondary)]">{mobilePopup.data.usedesc}</span></div>
                                )}
                                {mobilePopup.data.lotAcres != null && mobilePopup.data.lotAcres > 0 && (
                                    <div>
                                        <span className="text-[var(--text-faint)]">Size:</span>{' '}
                                        <span className="text-[var(--text-secondary)] font-medium">
                                            {formatNumber(mobilePopup.data.lotAcres, 2)} ac
                                            {mobilePopup.data.lotSqft ? ` (${formatNumber(mobilePopup.data.lotSqft)} SF)` : ''}
                                        </span>
                                    </div>
                                )}
                                {mobilePopup.data.assessedValue != null && mobilePopup.data.assessedValue > 0 && (
                                    <div><span className="text-[var(--text-faint)]">Value:</span> <span className="text-[var(--text-secondary)]">{formatCurrency(mobilePopup.data.assessedValue)}</span></div>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    const lngLat = mobilePopup.lngLat;
                                    const props = mobilePopup.props;
                                    setMobilePopup(null);
                                    loadParcelDetail(lngLat, props.address, props.parcelnumb);
                                }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors"
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
                    aria-hidden={!panelOpen}
                    inert={!panelOpen}
                    role="region"
                    aria-label="Parcel detail"
                >
                    <div className="h-full bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl flex flex-col">
                        {/* Panel Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[#F59E0B]" />
                                <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Parcel Detail</h3>
                            </div>
                            <button
                                onClick={() => { parcelReqSeqRef.current++; setPanelOpen(false); setPanelLoading(false); setPanelParcel(null); setPanelError(null); }}
                                aria-label="Close parcel detail"
                                className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Panel Content */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                            {panelLoading && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-[var(--border-strong)]" />
                                </div>
                            )}

                            {panelError && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]">
                                    <X className="w-3.5 h-3.5 mt-0.5 text-[var(--danger)] flex-shrink-0" />
                                    <p className="text-xs text-[var(--danger)]">{panelError}</p>
                                </div>
                            )}

                            {panelParcel && (
                                <>
                                    {/* Address header */}
                                    <div className="pb-2 border-b border-[var(--border)]">
                                        <h4 className="text-sm font-bold text-[var(--text-primary)]">{panelParcel.details.address || 'Unknown Address'}</h4>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                            {[panelParcel.details.city, panelParcel.details.state, panelParcel.details.zip].filter(Boolean).join(', ')}
                                        </p>
                                        {panelParcel.details.county && (
                                            <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{panelParcel.details.county} County</p>
                                        )}
                                    </div>

                                    {/* Quick Stats */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-center">
                                            <div className="text-[8px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Lot Size</div>
                                            <div className="text-xs font-bold text-[var(--text-primary)]">
                                                {panelParcel.details.lotSizeAcres ? `${formatNumber(panelParcel.details.lotSizeAcres, 2)} ac` : '—'}
                                            </div>
                                        </div>
                                        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-center">
                                            <div className="text-[8px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Zoning</div>
                                            <div className="text-xs font-bold text-[#8B5CF6]">
                                                {panelParcel.zoning.code || panelParcel.zoning.type || '—'}
                                            </div>
                                        </div>
                                        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-center">
                                            <div className="text-[8px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Value</div>
                                            <div className="text-xs font-bold text-[var(--text-primary)]">
                                                {formatCurrency(panelParcel.tax.totalValue)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Property Details */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <Home className="w-3 h-3 text-[#F59E0B]" />
                                            <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Property</h5>
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
                                            <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Zoning</h5>
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
                                                className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline mt-1">
                                                View Zoning Code <ExternalLink className="w-2.5 h-2.5" />
                                            </a>
                                        )}
                                    </div>

                                    {/* Tax & Valuation */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <DollarSign className="w-3 h-3 text-[var(--success)]" />
                                            <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tax & Valuation</h5>
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
                                            <User className="w-3 h-3 text-[var(--accent)]" />
                                            <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Ownership</h5>
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
                                                <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Sale History</h5>
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
                                                <Shield className="w-3 h-3 text-[var(--danger)]" />
                                                <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">FEMA & Risk</h5>
                                            </div>
                                            {panelParcel.details.femaFloodZone && (
                                                <InfoRow label="Flood Zone" value={panelParcel.details.femaFloodZone} />
                                            )}
                                            {panelParcel.details.femaFloodZoneSubtype && (
                                                <InfoRow label="Flood Subtype" value={panelParcel.details.femaFloodZoneSubtype} />
                                            )}
                                            {panelParcel.details.femaNriRiskRating && (
                                                <div className="py-1">
                                                    <div className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-0.5">NRI Risk Rating</div>
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
                                                <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Demographics</h5>
                                            </div>
                                            <InfoRow label="Median HH Income" value={formatCurrency(panelParcel.details.medianHouseholdIncome)} highlight />
                                            <InfoRow label="Pop. Density" value={panelParcel.details.populationDensity ? `${formatNumber(panelParcel.details.populationDensity)} / sq mi` : null} />
                                            <InfoRow label="Pop. Growth Forecast (5yr CAGR)" value={fmtCagr(panelParcel.details.populationGrowthNext5)} />
                                            <InfoRow label="Housing Growth Forecast (5yr CAGR)" value={fmtCagr(panelParcel.details.housingGrowthNext5)} />
                                            {panelParcel.details.qualifiedOpportunityZone === 'Yes' && (
                                                <div className="mt-1">
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/30">
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
                                                <MapPin className="w-3 h-3 text-[var(--text-faint)]" />
                                                <h5 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Census</h5>
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
                            <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)] space-y-2">
                                <button
                                    onClick={() => { setCreateName(panelParcel.details.address || 'New Pursuit'); setShowCreateDialog('pursuit'); }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium transition-colors shadow-sm"
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onKeyDown={(e) => { if (e.key === 'Escape') { setShowCreateDialog(null); setCreateName(''); } }}>
                        <div role="dialog" aria-modal="true" aria-label={showCreateDialog === 'pursuit' ? 'Create pursuit' : 'Create comp'} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl animate-fade-in">
                            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                                {showCreateDialog === 'pursuit' ? 'Create Pursuit' : 'Create Comp'}
                            </h2>
                            <p className="text-xs text-[var(--text-muted)] mb-4">
                                {panelParcel?.details.address && (
                                    <>From parcel: <span className="font-medium text-[var(--text-secondary)]">{panelParcel.details.address}</span></>
                                )}
                            </p>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                                    Name <span className="text-[var(--danger)]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={createName}
                                    onChange={(e) => setCreateName(e.target.value)}
                                    placeholder={showCreateDialog === 'pursuit' ? 'e.g., Main & Elm Site' : 'e.g., 123 Main St Sale'}
                                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none"
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
                                    className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
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
                                        ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
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
