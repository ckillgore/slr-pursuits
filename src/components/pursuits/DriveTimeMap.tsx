'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Loader2, MapPin, BarChart3, AlertCircle, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

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
}

interface DriveTimeMapProps {
    latitude: number | null;
    longitude: number | null;
    pursuitName?: string;
    savedDriveTimeData?: Record<string, DriveTimeCacheEntry> | null;
    onSaveDriveTimeData?: (data: Record<string, DriveTimeCacheEntry>) => void;
}

export function DriveTimeMap({ latitude, longitude, pursuitName, savedDriveTimeData, onSaveDriveTimeData }: DriveTimeMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const mbglRef = useRef<any>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [polygon, setPolygon] = useState<any>(null);
    const [tapestry, setTapestry] = useState<TapestrySegment[]>([]);
    const [breakMinutes, setBreakMinutes] = useState(15);
    const [showDetails, setShowDetails] = useState(true);
    const [totalPop, setTotalPop] = useState<number | null>(null);
    const [totalHH, setTotalHH] = useState<number | null>(null);
    const [cachedAt, setCachedAt] = useState<string | null>(null);

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
    const center: [number, number] = hasLocation
        ? [longitude!, latitude!]
        : [-96.7970, 32.7767]; // Dallas default

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
            setError(null);
        } else {
            // No cached data for this break time — reset
            setPolygon(null);
            setTapestry([]);
            setTotalPop(null);
            setTotalHH(null);
            setCachedAt(null);
        }
    }, [breakMinutes, savedDriveTimeData]);

    // Initialize Mapbox map
    useEffect(() => {
        if (!MAPBOX_TOKEN || !mapContainerRef.current) return;

        let map: any;
        import('mapbox-gl').then((mapboxgl) => {
            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;
            mbglRef.current = mbgl;

            if (mapContainerRef.current) mapContainerRef.current.innerHTML = '';

            map = new mbgl.Map({
                container: mapContainerRef.current!,
                style: 'mapbox://styles/mapbox/light-v11',
                center,
                zoom: hasLocation ? 12 : 10,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: false }), 'top-right');

            // Add center marker
            if (hasLocation) {
                new mbgl.Marker({ color: '#2563EB' })
                    .setLngLat(center)
                    .addTo(map);
            }

            mapRef.current = map;
        });

        return () => {
            if (map) map.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [MAPBOX_TOKEN]);

    // Update map center when lat/lng changes
    useEffect(() => {
        if (!mapRef.current || !hasLocation) return;
        mapRef.current.flyTo({ center: [longitude!, latitude!], zoom: 12, duration: 800 });
    }, [latitude, longitude, hasLocation]);

    // Render polygon on map when data changes (or clear when null)
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const removeLayers = () => {
            try {
                if (map.getLayer('isochrone-fill')) map.removeLayer('isochrone-fill');
                if (map.getLayer('isochrone-outline')) map.removeLayer('isochrone-outline');
                if (map.getSource('isochrone')) map.removeSource('isochrone');
            } catch { /* ok */ }
        };

        // If polygon is null, just remove old layers and reset view
        if (!polygon) {
            const doRemove = () => {
                removeLayers();
                // Reset map to center marker
                if (hasLocation) {
                    map.flyTo({ center: [longitude!, latitude!], zoom: 12, duration: 800 });
                }
            };
            if (map.isStyleLoaded()) doRemove();
            else map.on('load', doRemove);
            return;
        }

        const addLayer = () => {
            removeLayers();

            map.addSource('isochrone', {
                type: 'geojson',
                data: polygon,
            });

            map.addLayer({
                id: 'isochrone-fill',
                type: 'fill',
                source: 'isochrone',
                paint: {
                    'fill-color': '#007cbf',
                    'fill-opacity': 0.25,
                },
            });

            map.addLayer({
                id: 'isochrone-outline',
                type: 'line',
                source: 'isochrone',
                paint: {
                    'line-color': '#007cbf',
                    'line-width': 2,
                    'line-opacity': 0.8,
                },
            });

            // Fit map to polygon bounds
            const mbgl = mbglRef.current;
            if (mbgl && polygon.geometry?.coordinates?.[0]) {
                const bounds = new mbgl.LngLatBounds();
                polygon.geometry.coordinates[0].forEach(([lng, lat]: number[]) => {
                    bounds.extend([lng, lat]);
                });
                map.fitBounds(bounds, { padding: 40, duration: 800 });
            }
        };

        if (map.isStyleLoaded()) {
            addLayer();
        } else {
            map.on('load', addLayer);
        }
    }, [polygon, hasLocation, latitude, longitude]);

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

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to generate isochrone');
            }

            const now = new Date().toISOString();
            setPolygon(data.polygon);
            setTapestry(data.tapestry || []);
            setTotalPop(data.totalPopulation ?? null);
            setTotalHH(data.totalHouseholds ?? null);
            setCachedAt(now);

            // Save to Supabase via parent callback
            if (onSaveDriveTimeData) {
                const key = String(breakMinutes);
                const entry: DriveTimeCacheEntry = {
                    polygon: data.polygon,
                    tapestry: data.tapestry || [],
                    totalPopulation: data.totalPopulation ?? null,
                    totalHouseholds: data.totalHouseholds ?? null,
                    generatedAt: now,
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
                    <Clock className="w-4 h-4 text-[#A0AABB]" />
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Drive-Time Analysis</h3>
                </div>
                <div className="flex items-center justify-center py-8 text-center">
                    <div>
                        <MapPin className="w-6 h-6 text-[#C8CDD5] mx-auto mb-2" />
                        <p className="text-xs text-[#A0AABB]">Set a location to generate drive-time analysis</p>
                    </div>
                </div>
            </div>
        );
    }

    const formattedCacheDate = cachedAt
        ? new Date(cachedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : null;

    return (
        <div className="card">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#007cbf]" />
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Drive-Time Analysis</h3>
                    {cachedAt && !loading && (
                        <span className="flex items-center gap-1 text-[10px] text-[#0D7A3E] bg-[#0D7A3E]/10 px-1.5 py-0.5 rounded-full font-medium">
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
                        className="text-xs px-2 py-1 rounded-md border border-[#E2E5EA] text-[#4A5568] focus:border-[#2563EB] focus:outline-none bg-white"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white text-xs font-medium transition-colors"
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
                <p className="text-[10px] text-[#A0AABB] mb-2">Last generated: {formattedCacheDate}</p>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA]">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-[#DC2626] flex-shrink-0" />
                    <p className="text-xs text-[#DC2626]">{error}</p>
                </div>
            )}

            {/* Map + Tapestry layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Map */}
                <div className="lg:col-span-2">
                    {MAPBOX_TOKEN ? (
                        <div
                            ref={mapContainerRef}
                            className="w-full h-[400px] rounded-lg overflow-hidden border border-[#E2E5EA]"
                        />
                    ) : (
                        <div className="w-full h-[400px] rounded-lg border border-[#E2E5EA] bg-[#FAFBFC] flex items-center justify-center">
                            <p className="text-xs text-[#A0AABB]">Add <code className="text-[10px] bg-[#F4F5F7] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local</p>
                        </div>
                    )}
                    {polygon && (
                        <p className="text-[10px] text-[#A0AABB] mt-1.5 text-center">
                            {breakMinutes}-minute drive-time area from {pursuitName || 'location'} · Tuesday 8:00 AM
                        </p>
                    )}
                </div>

                {/* Tapestry Sidebar */}
                <div className="lg:col-span-1">
                    {tapestry.length > 0 ? (
                        <div className="bg-[#FAFBFC] border border-[#E2E5EA] rounded-lg p-3">
                            <button
                                onClick={() => setShowDetails(!showDetails)}
                                className="flex items-center justify-between w-full mb-2"
                            >
                                <div className="flex items-center gap-1.5">
                                    <BarChart3 className="w-3.5 h-3.5 text-[#007cbf]" />
                                    <span className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Tapestry Segments</span>
                                </div>
                                {showDetails ? <ChevronUp className="w-3.5 h-3.5 text-[#A0AABB]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#A0AABB]" />}
                            </button>

                            {/* Context label */}
                            <p className="text-[10px] text-[#7A8599] mb-2 leading-relaxed">
                                Top lifestyle segments within the <span className="font-semibold text-[#4A5568]">{breakMinutes}-min drive-time</span> area
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
                                                ? 'bg-white border-[#007cbf]/20 shadow-sm'
                                                : 'bg-white border-[#E2E5EA]'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    {i === 0 && (
                                                        <span className="inline-block text-[8px] font-bold text-[#007cbf] uppercase tracking-wider bg-[#007cbf]/10 px-1.5 py-0.5 rounded mb-1">
                                                            Dominant
                                                        </span>
                                                    )}
                                                    <div className="text-xs font-semibold text-[#1A1F2B] truncate">{seg.name}</div>
                                                    <div className="text-[10px] text-[#7A8599] mt-0.5">
                                                        {seg.code} · {seg.lifestyleGroup || 'N/A'}
                                                    </div>
                                                    {seg.medianAge != null && seg.medianAge > 0 && (
                                                        <div className="text-[10px] text-[#A0AABB] mt-0.5">Median Age: {seg.medianAge.toFixed(1)}</div>
                                                    )}
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="text-sm font-bold text-[#007cbf]">{seg.householdPct}%</div>
                                                    <div className="text-[10px] text-[#A0AABB]">{seg.householdCount.toLocaleString()} HH</div>
                                                </div>
                                            </div>
                                            <div className="mt-2 h-1.5 bg-[#F0F1F4] rounded-full overflow-hidden">
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
                        <div className="bg-[#FAFBFC] border border-[#E2E5EA] rounded-lg p-4 flex items-center justify-center h-full">
                            <div className="text-center">
                                <BarChart3 className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                <p className="text-xs text-[#A0AABB]">No Tapestry data available for this area</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[#FAFBFC] border border-[#E2E5EA] rounded-lg p-4 flex items-center justify-center h-full min-h-[200px]">
                            <div className="text-center">
                                <Clock className="w-5 h-5 text-[#C8CDD5] mx-auto mb-2" />
                                <p className="text-xs text-[#A0AABB]">Click &ldquo;Generate&rdquo; to create a drive-time isochrone and view Tapestry lifestyle segments</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
