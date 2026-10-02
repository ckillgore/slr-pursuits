'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Loader2, MapPin, BarChart3, AlertCircle, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { useMapboxMap, useIsDarkTheme } from '@/components/map/useMapboxMap';
import { MapStatusOverlay } from '@/components/map/MapStatusOverlay';
import { addLayerOnce, boundsOf, setGeoJsonData, upsertGeoJsonSource } from '@/components/map/mapHelpers';
import { siteInkColor } from '@/components/map/mapStyle';
import { isCacheForOtherLocation, type LngLat } from './locationCache';
import { StaleLocationNotice } from './StaleLocationNotice';

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };
/** Isochrone blue, brightened on the night preset so it reads against the dark basemap */
const isochroneColor = (isDark: boolean): string => (isDark ? '#38BDF8' : '#007cbf');

interface TapestrySegment {
    rank: number;
    code: string;
    name: string;
    lifestyleGroup: string;
    medianAge: number | null;
    householdCount: number;
    householdPct: number;
}

interface DriveTimeCacheEntry {
    polygon: any;
    tapestry: TapestrySegment[];
    totalPopulation: number | null;
    totalHouseholds: number | null;
    generatedAt: string;
    /** Site the isochrone was generated from — absent on entries saved before location tracking */
    center?: LngLat;
}

interface DriveTimeMapProps {
    latitude: number | null;
    longitude: number | null;
    pursuitName?: string;
    savedDriveTimeData?: Record<string, DriveTimeCacheEntry> | null;
    onSaveDriveTimeData?: (data: Record<string, DriveTimeCacheEntry>) => void;
}

export function DriveTimeMap({ latitude, longitude, pursuitName, savedDriveTimeData, onSaveDriveTimeData }: DriveTimeMapProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [polygon, setPolygon] = useState<any>(null);
    const [tapestry, setTapestry] = useState<TapestrySegment[]>([]);
    const [breakMinutes, setBreakMinutes] = useState(15);
    const [showDetails, setShowDetails] = useState(true);
    const [totalPop, setTotalPop] = useState<number | null>(null);
    const [totalHH, setTotalHH] = useState<number | null>(null);
    const [cachedAt, setCachedAt] = useState<string | null>(null);
    const [cachedCenter, setCachedCenter] = useState<LngLat | null>(null);

    // Local ref to always hold the latest merged cache (avoids stale closure issues)
    const localCacheRef = useRef<Record<string, DriveTimeCacheEntry>>(
        (savedDriveTimeData as Record<string, DriveTimeCacheEntry>) || {}
    );

    // Sync ref when savedDriveTimeData prop updates from DB refetch
    useEffect(() => {
        if (savedDriveTimeData) {
            // Merge DB data with any locally-generated entries not yet round-tripped
            localCacheRef.current = { ...localCacheRef.current, ...(savedDriveTimeData as Record<string, DriveTimeCacheEntry>) };
        }
    }, [savedDriveTimeData]);

    const hasLocation = latitude !== null && longitude !== null;

    // Load cached data when breakMinutes changes
    useEffect(() => {
        const key = String(breakMinutes);
        const cached = localCacheRef.current[key];
        if (cached) {
            setPolygon(cached.polygon);
            setTapestry(cached.tapestry || []);
            setTotalPop(cached.totalPopulation ?? null);
            setTotalHH(cached.totalHouseholds ?? null);
            setCachedAt(cached.generatedAt || null);
            setCachedCenter(cached.center ?? null);
            setError(null);
        } else {
            // No cached data for this break time — reset
            setPolygon(null);
            setTapestry([]);
            setTotalPop(null);
            setTotalHH(null);
            setCachedAt(null);
            setCachedCenter(null);
        }
    }, [breakMinutes, savedDriveTimeData]);

    // Fetch isochrone
    const fetchIsochrone = useCallback(async () => {
        if (!hasLocation) return;

        setLoading(true);
        setError(null);
        setPolygon(null);
        setTapestry([]);
        setTotalPop(null);
        setTotalHH(null);
        setCachedAt(null);

        try {
            const res = await fetch('/api/isochrone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude, longitude, breakMinutes }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || `Failed to generate drive-time area (HTTP ${res.status})`);
            }

            const now = new Date().toISOString();
            const generatedFrom: LngLat = [longitude!, latitude!];
            setPolygon(data.polygon);
            setTapestry(data.tapestry || []);
            setTotalPop(data.totalPopulation ?? null);
            setTotalHH(data.totalHouseholds ?? null);
            setCachedAt(now);
            setCachedCenter(generatedFrom);

            // Save to Supabase via parent callback
            if (onSaveDriveTimeData) {
                const key = String(breakMinutes);
                const entry: DriveTimeCacheEntry = {
                    polygon: data.polygon,
                    tapestry: data.tapestry || [],
                    totalPopulation: data.totalPopulation ?? null,
                    totalHouseholds: data.totalHouseholds ?? null,
                    generatedAt: now,
                    center: generatedFrom,
                };
                // Merge with local ref (always current) instead of stale prop
                const merged = {
                    ...localCacheRef.current,
                    [key]: entry,
                };
                localCacheRef.current = merged;
                onSaveDriveTimeData(merged);
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    }, [latitude, longitude, breakMinutes, hasLocation, onSaveDriveTimeData]);

    if (!hasLocation) {
        return (
            <div className="card">
                <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-[var(--text-faint)]" />
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Drive-Time Analysis</h3>
                </div>
                <div className="flex items-center justify-center py-8 text-center">
                    <div>
                        <MapPin className="w-6 h-6 text-[var(--border-strong)] mx-auto mb-2" />
                        <p className="text-xs text-[var(--text-faint)]">Set a location to generate drive-time analysis</p>
                    </div>
                </div>
            </div>
        );
    }

    // Cache is per pursuit, not per location: flag results generated for a previous site
    const isStale = !!polygon && !loading && isCacheForOtherLocation({
        current: [longitude!, latitude!],
        savedCenter: cachedCenter,
        geometry: polygon,
    });

    const formattedCacheDate = cachedAt
        ? new Date(cachedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : null;

    return (
        <div className="card">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#007cbf]" />
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Drive-Time Analysis</h3>
                    {cachedAt && !loading && !isStale && (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--success)] bg-[var(--success)]/10 px-1.5 py-0.5 rounded-full font-medium">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Cached
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Break minutes selector */}
                    <select
                        value={breakMinutes}
                        onChange={(e) => setBreakMinutes(Number(e.target.value))}
                        aria-label="Drive time"
                        className="text-xs px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none bg-[var(--bg-card)]"
                        disabled={loading}
                    >
                        <option value={5}>5 min</option>
                        <option value={10}>10 min</option>
                        <option value={15}>15 min</option>
                        <option value={20}>20 min</option>
                        <option value={30}>30 min</option>
                    </select>
                    <button
                        onClick={fetchIsochrone}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-medium transition-colors"
                    >
                        {loading ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                        ) : (
                            <><Clock className="w-3 h-3" /> {polygon ? 'Regenerate' : 'Generate'}</>
                        )}
                    </button>
                </div>
            </div>

            {/* Cached timestamp */}
            {formattedCacheDate && !loading && (
                <p className="text-[10px] text-[var(--text-faint)] mb-2">Last generated: {formattedCacheDate}</p>
            )}

            {isStale && (
                <StaleLocationNotice what="drive-time area" generatedAt={cachedAt} onRegenerate={fetchIsochrone} disabled={loading} />
            )}

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-[var(--danger)] flex-shrink-0" />
                    <p className="text-xs text-[var(--danger)]">{error}</p>
                </div>
            )}

            {/* Map + Tapestry layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Map */}
                <div className="lg:col-span-2">
                    <IsochroneMap latitude={latitude!} longitude={longitude!} polygon={polygon} polygonIsCurrent={!isStale} fitKey={cachedAt} />
                    {polygon && (
                        <p className="text-[10px] text-[var(--text-faint)] mt-1.5 text-center">
                            {breakMinutes}-minute drive-time area from {pursuitName || 'location'} · Tuesday 8:00 AM
                        </p>
                    )}
                </div>

                {/* Tapestry Sidebar */}
                <div className="lg:col-span-1">
                    {tapestry.length > 0 ? (
                        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-3">
                            <button
                                onClick={() => setShowDetails(!showDetails)}
                                aria-expanded={showDetails}
                                className="flex items-center justify-between w-full mb-2"
                            >
                                <div className="flex items-center gap-1.5">
                                    <BarChart3 className="w-3.5 h-3.5 text-[#007cbf]" />
                                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Tapestry Segments</span>
                                </div>
                                {showDetails ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-faint)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-faint)]" />}
                            </button>

                            {/* Context label */}
                            <p className="text-[10px] text-[var(--text-muted)] mb-2 leading-relaxed">
                                Top lifestyle segments within the <span className="font-semibold text-[var(--text-secondary)]">{breakMinutes}-min drive-time</span> area
                                {totalPop != null && totalHH != null && (
                                    <span> · {totalPop.toLocaleString()} people · {totalHH.toLocaleString()} households</span>
                                )}
                            </p>

                            {showDetails && (
                                <div className="space-y-2.5">
                                    {tapestry.map((seg, i) => (
                                        <div
                                            key={seg.code || i}
                                            className={`p-2.5 rounded-lg border ${i === 0
                                                ? 'bg-[var(--bg-card)] border-[#007cbf]/20 shadow-sm'
                                                : 'bg-[var(--bg-card)] border-[var(--border)]'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    {i === 0 && (
                                                        <span className="inline-block text-[8px] font-bold text-[#007cbf] uppercase tracking-wider bg-[#007cbf]/10 px-1.5 py-0.5 rounded mb-1">
                                                            Dominant
                                                        </span>
                                                    )}
                                                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{seg.name}</div>
                                                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                                        {seg.code} · {seg.lifestyleGroup || 'N/A'}
                                                    </div>
                                                    {seg.medianAge != null && seg.medianAge > 0 && (
                                                        <div className="text-[10px] text-[var(--text-faint)] mt-0.5">Median Age: {seg.medianAge.toFixed(1)}</div>
                                                    )}
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="text-sm font-bold text-[#007cbf]">{seg.householdPct}%</div>
                                                    <div className="text-[10px] text-[var(--text-faint)]">{seg.householdCount.toLocaleString()} HH</div>
                                                </div>
                                            </div>
                                            <div className="mt-2 h-1.5 bg-[var(--table-row-border)] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${Math.min(seg.householdPct, 100)}%`,
                                                        backgroundColor: i === 0 ? '#007cbf' : '#94a3b8',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : polygon ? (
                        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-center h-full">
                            <div className="text-center">
                                <BarChart3 className="w-5 h-5 text-[var(--border-strong)] mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-faint)]">No Tapestry data available for this area</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-center h-full min-h-[200px]">
                            <div className="text-center">
                                <Clock className="w-5 h-5 text-[var(--border-strong)] mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-faint)]">Click &ldquo;Generate&rdquo; to create a drive-time isochrone and view Tapestry lifestyle segments</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * The site and its drive-time polygon. Mounted once a location exists; the
 * polygon and the site update in place.
 */
function IsochroneMap({ latitude, longitude, polygon, polygonIsCurrent, fitKey }: {
    latitude: number;
    longitude: number;
    polygon: Feature | FeatureCollection | Geometry | null;
    /** False when the polygon was generated for a previous site location */
    polygonIsCurrent: boolean;
    /** Identifies a generated result (its timestamp); the map frames each result once */
    fitKey: string | null;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDark = useIsDarkTheme();
    // Latest props for map callbacks and effects that must not re-run on every change
    const latestRef = useRef({ polygon, isDark, polygonIsCurrent, fitKey, site: [longitude, latitude] as [number, number] });
    useEffect(() => {
        latestRef.current = { polygon, isDark, polygonIsCurrent, fitKey, site: [longitude, latitude] };
    });

    const { map, mbgl, ready, error } = useMapboxMap(containerRef, {
        center: [longitude, latitude],
        zoom: 12,
        onStyleReady: (m) => {
            const color = isochroneColor(latestRef.current.isDark);
            upsertGeoJsonSource(m, 'isochrone', latestRef.current.polygon ?? EMPTY_FC);
            addLayerOnce(m, { id: 'isochrone-fill', type: 'fill', source: 'isochrone', paint: { 'fill-color': color, 'fill-opacity': 0.25 } });
            addLayerOnce(m, { id: 'isochrone-outline', type: 'line', source: 'isochrone', paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.8 } });
        },
    });

    // Polygon changed: redraw it, and frame it only when it belongs to the current site
    // (a stale polygon from a previous location must not pull the camera away)
    const settledRef = useRef(false);
    const fittedKeyRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        setGeoJsonData(map, 'isochrone', polygon ?? EMPTY_FC);
        const first = !settledRef.current;
        settledRef.current = true;
        if (!polygon) {
            fittedKeyRef.current = undefined;
            if (!first) map.flyTo({ center: latestRef.current.site, zoom: 12, duration: 800 });
            return;
        }
        // Refetched copies of the same result (new object, same data) keep the user's view
        const { polygonIsCurrent, fitKey } = latestRef.current;
        if (!polygonIsCurrent || fitKey === fittedKeyRef.current) return;
        fittedKeyRef.current = fitKey;
        const bounds = boundsOf(mbgl, polygon);
        if (bounds) map.fitBounds(bounds, { padding: 40, duration: first ? 0 : 800 });
    }, [map, mbgl, ready, polygon]);

    // Site moved: fly to it (the polygon effect above won't refit to the old area)
    const lastSiteRef = useRef<string | null>(null);
    useEffect(() => {
        if (!map) return;
        const key = `${longitude},${latitude}`;
        if (lastSiteRef.current && lastSiteRef.current !== key) map.flyTo({ center: [longitude, latitude], zoom: 12, duration: 800 });
        lastSiteRef.current = key;
    }, [map, latitude, longitude]);

    // Site marker follows the location and theme
    useEffect(() => {
        if (!map || !mbgl) return;
        const marker = new mbgl.Marker({ color: siteInkColor(isDark) }).setLngLat([longitude, latitude]).addTo(map);
        return () => { marker.remove(); };
    }, [map, mbgl, isDark, latitude, longitude]);

    // Theme-dependent polygon color
    useEffect(() => {
        if (!map || !ready) return;
        const color = isochroneColor(isDark);
        if (map.getLayer('isochrone-fill')) map.setPaintProperty('isochrone-fill', 'fill-color', color);
        if (map.getLayer('isochrone-outline')) map.setPaintProperty('isochrone-outline', 'line-color', color);
    }, [map, ready, isDark]);

    return (
        <div className="relative w-full h-[400px] rounded-lg overflow-hidden border border-[var(--border)]">
            <div ref={containerRef} className="absolute inset-0" />
            <MapStatusOverlay ready={ready} error={error} />
        </div>
    );
}
