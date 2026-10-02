'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapIcon, Loader2, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification, Map as MapboxMap, TargetFeature } from 'mapbox-gl';
import { useMapboxMap, useIsDarkTheme } from '@/components/map/useMapboxMap';
import { MapStatusOverlay } from '@/components/map/MapStatusOverlay';
import { addLayerOnce, boundsOf, createPopup, escapeHtml, setGeoJsonData, upsertGeoJsonSource } from '@/components/map/mapHelpers';
import { siteInkColor } from '@/components/map/mapStyle';
import { isCacheForOtherLocation, type LngLat } from './locationCache';
import { StaleLocationNotice } from './StaleLocationNotice';

// Income color ramp: warm tones
const INCOME_BREAKS = [30000, 45000, 60000, 75000, 90000, 120000, 150000];
const INCOME_COLORS = [
    '#fee5d9', // < 30k — lightest
    '#fcbba1', // 30k-45k
    '#fc9272', // 45k-60k
    '#fb6a4a', // 60k-75k
    '#ef3b2c', // 75k-90k
    '#cb181d', // 90k-120k
    '#a50f15', // 120k-150k
    '#67000d', // > 150k — darkest
];
// Block groups with no ACS estimate (null, or Census sentinels like -666666666) —
// previously coalesced to 0 and painted as the lowest income band.
const NO_DATA_COLOR = '#9CA3AF';

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

// Null -> 0 via to-number, then "no data"
const INCOME_VALUE: ExpressionSpecification = ['to-number', ['get', 'medianIncome'], 0];
const INCOME_COLOR_EXPR = [
    'case', ['<=', INCOME_VALUE, 0], NO_DATA_COLOR,
    ['step', INCOME_VALUE, INCOME_COLORS[0], ...INCOME_BREAKS.flatMap((b, i) => [b, INCOME_COLORS[i + 1]])],
] as unknown as ExpressionSpecification;

const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
/** Block-group borders: hairlines that read on either light preset; the hovered one in site ink */
const outlineColor = (isDark: boolean): ExpressionSpecification =>
    ['case', HOVER, siteInkColor(isDark), isDark ? 'rgba(232, 234, 240, 0.45)' : 'rgba(26, 31, 43, 0.35)'];

function incomePopupHtml(props: Record<string, unknown> | null | undefined): string {
    const income = props?.medianIncome;
    const n = Number(income);
    const label = income != null && income !== '' && n > 0 ? '$' + n.toLocaleString() : 'No data';
    return `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.5; min-width: 140px;">
            <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(String(props?.name || props?.geoId || ''))}</div>
            <div style="color: var(--text-secondary);">Median Income: <strong style="color: var(--text-primary);">${label}</strong></div>
        </div>
    `;
}

function removeInteractions(map: MapboxMap, ids: string[]) {
    // The map may already be removed when this runs on unmount
    for (const id of ids) { try { map.removeInteraction(id); } catch { /* map gone */ } }
}

const LEGEND_LABELS = [
    '< $30k',
    '$30k–$45k',
    '$45k–$60k',
    '$60k–$75k',
    '$75k–$90k',
    '$90k–$120k',
    '$120k–$150k',
    '> $150k',
];

interface IncomeCacheEntry {
    geojson: any;
    blockGroupCount: number;
    generatedAt: string;
    /** Site the map was generated for — absent on entries saved before location tracking */
    center?: LngLat;
}

interface IncomeHeatMapProps {
    latitude: number | null;
    longitude: number | null;
    pursuitName?: string;
    savedIncomeData?: Record<string, IncomeCacheEntry> | null;
    onSaveIncomeData?: (data: Record<string, IncomeCacheEntry>) => void;
}

export function IncomeHeatMap({
    latitude,
    longitude,
    pursuitName,
    savedIncomeData,
    onSaveIncomeData,
}: IncomeHeatMapProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [geojson, setGeojson] = useState<any>(null);
    const [blockGroupCount, setBlockGroupCount] = useState<number>(0);
    const [cachedAt, setCachedAt] = useState<string | null>(null);
    const [radiusMiles, setRadiusMiles] = useState(5);
    const [cachedCenter, setCachedCenter] = useState<LngLat | null>(null);

    // Per-radius cache ref (avoids stale closure issues)
    const localCacheRef = useRef<Record<string, IncomeCacheEntry>>(
        (savedIncomeData as Record<string, IncomeCacheEntry>) || {}
    );

    // Sync ref when savedIncomeData prop updates from DB
    useEffect(() => {
        if (savedIncomeData) {
            localCacheRef.current = { ...localCacheRef.current, ...(savedIncomeData as Record<string, IncomeCacheEntry>) };
        }
    }, [savedIncomeData]);

    const hasLocation = latitude !== null && longitude !== null;

    // Load cached data when radiusMiles changes
    useEffect(() => {
        const key = String(radiusMiles);
        const cached = localCacheRef.current[key];
        if (cached) {
            setGeojson(cached.geojson);
            setBlockGroupCount(cached.blockGroupCount || 0);
            setCachedAt(cached.generatedAt || null);
            setCachedCenter(cached.center ?? null);
            setError(null);
        } else {
            // No cached data for this radius — clear display
            setGeojson(null);
            setBlockGroupCount(0);
            setCachedAt(null);
            setCachedCenter(null);
        }
    }, [radiusMiles, savedIncomeData]);

    // Fetch income data
    const fetchIncome = useCallback(async () => {
        if (!hasLocation) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/income-heatmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude, longitude, radiusMiles }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Failed to fetch income data (HTTP ${res.status})`);

            const now = new Date().toISOString();
            const generatedFrom: LngLat = [longitude!, latitude!];
            setGeojson(data.geojson);
            setBlockGroupCount(data.blockGroupCount || 0);
            setCachedAt(now);
            setCachedCenter(generatedFrom);

            // Save to per-radius cache + persist to Supabase
            if (onSaveIncomeData) {
                const key = String(radiusMiles);
                const entry: IncomeCacheEntry = {
                    geojson: data.geojson,
                    blockGroupCount: data.blockGroupCount,
                    generatedAt: now,
                    center: generatedFrom,
                };
                const merged = { ...localCacheRef.current, [key]: entry };
                localCacheRef.current = merged;
                onSaveIncomeData(merged);
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    }, [latitude, longitude, radiusMiles, hasLocation, onSaveIncomeData]);

    // Auto-fetch when radius changes and no cached data exists
    useEffect(() => {
        const key = String(radiusMiles);
        const hasCached = !!localCacheRef.current[key];
        // Only auto-fetch if we already have data for some radius (user has clicked Generate at least once)
        const hasAnyData = Object.keys(localCacheRef.current).length > 0;
        if (!hasCached && hasAnyData && hasLocation && !loading) {
            fetchIncome();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [radiusMiles]);

    if (!hasLocation) {
        return (
            <div className="card">
                <div className="flex items-center gap-2 mb-3">
                    <MapIcon className="w-4 h-4 text-[var(--text-faint)]" />
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Income Heat Map</h3>
                </div>
                <div className="flex items-center justify-center py-8 text-center">
                    <div>
                        <MapPin className="w-6 h-6 text-[var(--border-strong)] mx-auto mb-2" />
                        <p className="text-xs text-[var(--text-faint)]">Set a location to generate income heat map</p>
                    </div>
                </div>
            </div>
        );
    }

    // Cache is per pursuit, not per location: flag a heat map generated for a previous site
    const isStale = !!geojson && !loading && isCacheForOtherLocation({
        current: [longitude!, latitude!],
        savedCenter: cachedCenter,
        geometry: geojson,
    });

    const formattedCacheDate = cachedAt
        ? new Date(cachedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : null;

    return (
        <div className="card">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-[#D97706]" />
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Income Heat Map</h3>
                    {cachedAt && !loading && (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--success)] bg-[var(--success)]/10 px-1.5 py-0.5 rounded-full font-medium">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {blockGroupCount} block groups
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={radiusMiles}
                        onChange={(e) => setRadiusMiles(Number(e.target.value))}
                        aria-label="Radius"
                        className="text-xs px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none bg-[var(--bg-card)]"
                        disabled={loading}
                    >
                        <option value={3}>3 miles</option>
                        <option value={5}>5 miles</option>
                        <option value={10}>10 miles</option>
                    </select>
                    <button
                        onClick={fetchIncome}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white text-xs font-medium transition-colors"
                    >
                        {loading ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                        ) : (
                            <><MapIcon className="w-3 h-3" /> {geojson ? 'Regenerate' : 'Generate'}</>
                        )}
                    </button>
                </div>
            </div>

            {/* Cache timestamp */}
            {formattedCacheDate && !loading && (
                <p className="text-[10px] text-[var(--text-faint)] mb-2">Last generated: {formattedCacheDate}</p>
            )}

            {isStale && (
                <StaleLocationNotice what="income heat map" generatedAt={cachedAt} onRegenerate={fetchIncome} disabled={loading} />
            )}

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-[var(--danger)] flex-shrink-0" />
                    <p className="text-xs text-[var(--danger)]">{error}</p>
                </div>
            )}

            {/* Map + Legend */}
            <div className="relative">
                <IncomeChoroplethMap latitude={latitude!} longitude={longitude!} geojson={geojson} geojsonIsCurrent={!isStale} fitKey={cachedAt} />

                {/* Legend overlay: top-left, clear of the zoom control and the bottom logo / attribution */}
                {geojson && (
                    <div className="absolute top-3 left-3 z-[1] bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-lg shadow-sm border border-[var(--border)] p-2.5">
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Median HH Income</div>
                        <div className="space-y-0.5">
                            {LEGEND_LABELS.map((label, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div
                                        className="w-3 h-3 rounded-sm flex-shrink-0"
                                        style={{ backgroundColor: INCOME_COLORS[i] }}
                                    />
                                    <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">{label}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: NO_DATA_COLOR }} />
                                <span className="text-[10px] text-[var(--text-secondary)]">No data</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* No-data prompt */}
                {!geojson && !loading && !error && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center bg-[var(--bg-card)]/80 backdrop-blur-sm rounded-xl px-6 py-4">
                            <MapIcon className="w-6 h-6 text-[#D97706] mx-auto mb-2 opacity-60" />
                            <p className="text-xs text-[var(--text-muted)]">Click &ldquo;Generate&rdquo; to create an income choropleth map</p>
                            <p className="text-[10px] text-[var(--text-faint)] mt-1">Census Block Groups · ACS 5-Year Estimates</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Source attribution */}
            {geojson && (
                <p className="text-[10px] text-[var(--text-faint)] mt-1.5 text-center">
                    Median household income by Census Block Group within {radiusMiles} miles of {pursuitName || 'site'} · Source: Census ACS 5-Year Estimates
                </p>
            )}
        </div>
    );
}

/**
 * Block-group choropleth around the site. Mounted once a location exists;
 * the data and the site update in place.
 */
function IncomeChoroplethMap({ latitude, longitude, geojson, geojsonIsCurrent, fitKey }: {
    latitude: number;
    longitude: number;
    geojson: FeatureCollection | null;
    /** False when the data was generated for a previous site location */
    geojsonIsCurrent: boolean;
    /** Identifies a generated result (its timestamp); the map frames each result once */
    fitKey: string | null;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDark = useIsDarkTheme();
    // Latest props for map callbacks and effects that must not re-run on every change
    const latestRef = useRef({ geojson, isDark, geojsonIsCurrent, fitKey, site: [longitude, latitude] as [number, number] });
    useEffect(() => {
        latestRef.current = { geojson, isDark, geojsonIsCurrent, fitKey, site: [longitude, latitude] };
    });
    const hoveredRef = useRef<TargetFeature | null>(null);

    const { map, mbgl, ready, error } = useMapboxMap(containerRef, {
        center: [longitude, latitude],
        zoom: 11,
        onStyleReady: (m) => {
            upsertGeoJsonSource(m, 'income-data', latestRef.current.geojson ?? EMPTY_FC, { generateId: true });
            addLayerOnce(m, {
                id: 'income-fill',
                type: 'fill',
                source: 'income-data',
                paint: { 'fill-color': INCOME_COLOR_EXPR, 'fill-opacity': ['case', HOVER, 0.75, 0.6] },
            });
            addLayerOnce(m, {
                id: 'income-outline',
                type: 'line',
                source: 'income-data',
                paint: { 'line-color': outlineColor(latestRef.current.isDark), 'line-width': ['case', HOVER, 2, 0.5] },
            });
        },
    });

    // Hover highlight + one reusable popup; click / tap shows the same info
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        const popup = createPopup(mbgl, { offset: 10 });
        const ids = ['income-enter', 'income-move', 'income-leave', 'income-click', 'income-click-away'];
        const hover = (feature: TargetFeature) => {
            if (hoveredRef.current && hoveredRef.current.id !== feature.id) map.setFeatureState(hoveredRef.current, { hover: false });
            hoveredRef.current = feature;
            map.setFeatureState(feature, { hover: true });
        };

        map.addInteraction('income-enter', {
            type: 'mouseenter',
            target: { layerId: 'income-fill' },
            handler: (e) => {
                if (!e.feature) return;
                hover(e.feature);
                map.getCanvas().style.cursor = 'pointer';
                popup.setLngLat(e.lngLat).setHTML(incomePopupHtml(e.feature.properties)).addTo(map);
            },
        });
        map.addInteraction('income-move', {
            type: 'mousemove',
            target: { layerId: 'income-fill' },
            handler: (e) => {
                if (hoveredRef.current) popup.setLngLat(e.lngLat);
                return false;
            },
        });
        map.addInteraction('income-leave', {
            type: 'mouseleave',
            target: { layerId: 'income-fill' },
            handler: (e) => {
                if (e.feature) map.setFeatureState(e.feature, { hover: false });
                // Moving straight onto a neighbouring block group may enter it before leaving this one
                if (!hoveredRef.current || hoveredRef.current.id === e.feature?.id) {
                    hoveredRef.current = null;
                    map.getCanvas().style.cursor = '';
                    popup.remove();
                }
                return false;
            },
        });
        map.addInteraction('income-click', {
            type: 'click',
            target: { layerId: 'income-fill' },
            handler: (e) => {
                if (!e.feature) return;
                hover(e.feature);
                popup.setLngLat(e.lngLat).setHTML(incomePopupHtml(e.feature.properties)).addTo(map);
            },
        });
        // Tap/click outside the data closes the popup (touch has no mouseleave)
        map.addInteraction('income-click-away', {
            type: 'click',
            handler: () => {
                if (hoveredRef.current) map.setFeatureState(hoveredRef.current, { hover: false });
                hoveredRef.current = null;
                popup.remove();
            },
        });

        return () => {
            removeInteractions(map, ids);
            popup.remove();
            hoveredRef.current = null;
        };
    }, [map, mbgl, ready]);

    // Data changed: redraw it, and frame it only when it belongs to the current site
    // (stale data from a previous location must not pull the camera away)
    const settledRef = useRef(false);
    const fittedKeyRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        hoveredRef.current = null; // feature ids are regenerated by setData
        setGeoJsonData(map, 'income-data', geojson ?? EMPTY_FC);
        const first = !settledRef.current;
        settledRef.current = true;
        if (!geojson) {
            fittedKeyRef.current = undefined;
            if (!first) map.flyTo({ center: latestRef.current.site, zoom: 11, duration: 800 });
            return;
        }
        // Refetched copies of the same result (new object, same data) keep the user's view
        const { geojsonIsCurrent, fitKey } = latestRef.current;
        if (!geojsonIsCurrent || fitKey === fittedKeyRef.current) return;
        fittedKeyRef.current = fitKey;
        const bounds = boundsOf(mbgl, geojson);
        if (bounds) map.fitBounds(bounds, { padding: 40, duration: first ? 0 : 800 });
    }, [map, mbgl, ready, geojson]);

    // Site moved: fly to it (the data effect above won't refit to the old area)
    const lastSiteRef = useRef<string | null>(null);
    useEffect(() => {
        if (!map) return;
        const key = `${longitude},${latitude}`;
        if (lastSiteRef.current && lastSiteRef.current !== key) map.flyTo({ center: [longitude, latitude], zoom: 11, duration: 800 });
        lastSiteRef.current = key;
    }, [map, latitude, longitude]);

    // Site marker follows the location and theme
    useEffect(() => {
        if (!map || !mbgl) return;
        const marker = new mbgl.Marker({ color: siteInkColor(isDark) }).setLngLat([longitude, latitude]).addTo(map);
        return () => { marker.remove(); };
    }, [map, mbgl, isDark, latitude, longitude]);

    // Theme-dependent outline
    useEffect(() => {
        if (!map || !ready || !map.getLayer('income-outline')) return;
        map.setPaintProperty('income-outline', 'line-color', outlineColor(isDark));
    }, [map, ready, isDark]);

    return (
        <div className="relative w-full h-[450px] rounded-lg overflow-hidden border border-[var(--border)]">
            <div ref={containerRef} className="absolute inset-0" />
            <MapStatusOverlay ready={ready} error={error} />
        </div>
    );
}
