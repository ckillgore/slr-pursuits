'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapIcon, Loader2, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

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
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const mbglRef = useRef<any>(null);
    const popupRef = useRef<any>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [geojson, setGeojson] = useState<any>(null);
    const [blockGroupCount, setBlockGroupCount] = useState<number>(0);
    const [cachedAt, setCachedAt] = useState<string | null>(null);
    const [radiusMiles, setRadiusMiles] = useState(5);

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
    const center: [number, number] = hasLocation
        ? [longitude!, latitude!]
        : [-96.7970, 32.7767];

    // Load cached data when radiusMiles changes
    useEffect(() => {
        const key = String(radiusMiles);
        const cached = localCacheRef.current[key];
        if (cached) {
            setGeojson(cached.geojson);
            setBlockGroupCount(cached.blockGroupCount || 0);
            setCachedAt(cached.generatedAt || null);
            setError(null);
        } else {
            // No cached data for this radius — clear display
            setGeojson(null);
            setBlockGroupCount(0);
            setCachedAt(null);
        }
    }, [radiusMiles, savedIncomeData]);

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
                zoom: hasLocation ? 11 : 10,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: false }), 'top-right');

            // Site marker
            if (hasLocation) {
                new mbgl.Marker({ color: '#1A1F2B' })
                    .setLngLat(center)
                    .addTo(map);
            }

            mapRef.current = map;
        });

        return () => {
            if (popupRef.current) popupRef.current.remove();
            if (map) map.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [MAPBOX_TOKEN]);

    // Update map center
    useEffect(() => {
        if (!mapRef.current || !hasLocation) return;
        mapRef.current.flyTo({ center: [longitude!, latitude!], zoom: 11, duration: 800 });
    }, [latitude, longitude, hasLocation]);

    // Render choropleth when geojson changes
    useEffect(() => {
        const map = mapRef.current;
        const mbgl = mbglRef.current;
        if (!map || !mbgl) return;

        const removeLayers = () => {
            try {
                if (map.getLayer('income-fill')) map.removeLayer('income-fill');
                if (map.getLayer('income-outline')) map.removeLayer('income-outline');
                if (map.getSource('income-data')) map.removeSource('income-data');
            } catch { /* ok */ }
        };

        if (!geojson) {
            const doRemove = () => {
                removeLayers();
                if (hasLocation) {
                    map.flyTo({ center: [longitude!, latitude!], zoom: 11, duration: 800 });
                }
            };
            if (map.isStyleLoaded()) doRemove();
            else map.on('load', doRemove);
            return;
        }

        const addLayers = () => {
            removeLayers();

            map.addSource('income-data', {
                type: 'geojson',
                data: geojson,
            });

            // Build the step expression for color mapping
            const colorExpr: any[] = [
                'step',
                ['coalesce', ['get', 'medianIncome'], 0],
                INCOME_COLORS[0],
            ];
            for (let i = 0; i < INCOME_BREAKS.length; i++) {
                colorExpr.push(INCOME_BREAKS[i], INCOME_COLORS[i + 1]);
            }

            map.addLayer({
                id: 'income-fill',
                type: 'fill',
                source: 'income-data',
                paint: {
                    'fill-color': colorExpr,
                    'fill-opacity': 0.6,
                },
            });

            map.addLayer({
                id: 'income-outline',
                type: 'line',
                source: 'income-data',
                paint: {
                    'line-color': '#ffffff',
                    'line-width': 0.5,
                    'line-opacity': 0.8,
                },
            });

            // Hover popup
            map.on('mousemove', 'income-fill', (e: any) => {
                if (!e.features?.[0]) return;
                map.getCanvas().style.cursor = 'pointer';
                const props = e.features[0].properties;
                const income = props.medianIncome;

                if (popupRef.current) popupRef.current.remove();
                popupRef.current = new mbgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.5; min-width: 140px;">
                            <div style="font-weight: 700; color: #1A1F2B; margin-bottom: 4px;">${props.name || props.geoId}</div>
                            <div style="color: #4A5568;">Median Income: <strong style="color: #1A1F2B;">${income != null ? '$' + Number(income).toLocaleString() : 'N/A'}</strong></div>
                        </div>
                    `)
                    .addTo(map);
            });

            map.on('mouseleave', 'income-fill', () => {
                map.getCanvas().style.cursor = '';
                if (popupRef.current) popupRef.current.remove();
            });

            // Fit to data bounds
            const bounds = new mbgl.LngLatBounds();
            for (const f of geojson.features) {
                const coords = f.geometry?.coordinates;
                if (!coords) continue;
                const flatten = (arr: any[]): void => {
                    for (const item of arr) {
                        if (typeof item[0] === 'number') bounds.extend(item as [number, number]);
                        else flatten(item);
                    }
                };
                flatten(coords);
            }
            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 40, duration: 800 });
            }
        };

        if (map.isStyleLoaded()) addLayers();
        else map.on('load', addLayers);
    }, [geojson, hasLocation, latitude, longitude]);

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

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch income data');

            const now = new Date().toISOString();
            setGeojson(data.geojson);
            setBlockGroupCount(data.blockGroupCount || 0);
            setCachedAt(now);

            // Save to per-radius cache + persist to Supabase
            if (onSaveIncomeData) {
                const key = String(radiusMiles);
                const entry: IncomeCacheEntry = {
                    geojson: data.geojson,
                    blockGroupCount: data.blockGroupCount,
                    generatedAt: now,
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
                    <MapIcon className="w-4 h-4 text-[#A0AABB]" />
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Income Heat Map</h3>
                </div>
                <div className="flex items-center justify-center py-8 text-center">
                    <div>
                        <MapPin className="w-6 h-6 text-[#C8CDD5] mx-auto mb-2" />
                        <p className="text-xs text-[#A0AABB]">Set a location to generate income heat map</p>
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
                    <MapIcon className="w-4 h-4 text-[#D97706]" />
                    <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Income Heat Map</h3>
                    {cachedAt && !loading && (
                        <span className="flex items-center gap-1 text-[10px] text-[#0D7A3E] bg-[#0D7A3E]/10 px-1.5 py-0.5 rounded-full font-medium">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {blockGroupCount} block groups
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={radiusMiles}
                        onChange={(e) => setRadiusMiles(Number(e.target.value))}
                        className="text-xs px-2 py-1 rounded-md border border-[#E2E5EA] text-[#4A5568] focus:border-[#2563EB] focus:outline-none bg-white"
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
                <p className="text-[10px] text-[#A0AABB] mb-2">Last generated: {formattedCacheDate}</p>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA]">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-[#DC2626] flex-shrink-0" />
                    <p className="text-xs text-[#DC2626]">{error}</p>
                </div>
            )}

            {/* Map + Legend */}
            <div className="relative">
                {MAPBOX_TOKEN ? (
                    <div
                        ref={mapContainerRef}
                        className="w-full h-[450px] rounded-lg overflow-hidden border border-[#E2E5EA]"
                    />
                ) : (
                    <div className="w-full h-[450px] rounded-lg border border-[#E2E5EA] bg-[#FAFBFC] flex items-center justify-center">
                        <p className="text-xs text-[#A0AABB]">Add <code className="text-[10px] bg-[#F4F5F7] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local</p>
                    </div>
                )}

                {/* Legend overlay */}
                {geojson && (
                    <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-[#E2E5EA] p-2.5">
                        <div className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider mb-1.5">Median HH Income</div>
                        <div className="space-y-0.5">
                            {LEGEND_LABELS.map((label, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div
                                        className="w-3 h-3 rounded-sm flex-shrink-0"
                                        style={{ backgroundColor: INCOME_COLORS[i] }}
                                    />
                                    <span className="text-[10px] text-[#4A5568] tabular-nums">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* No-data prompt */}
                {!geojson && !loading && !error && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center bg-white/80 backdrop-blur-sm rounded-xl px-6 py-4">
                            <MapIcon className="w-6 h-6 text-[#D97706] mx-auto mb-2 opacity-60" />
                            <p className="text-xs text-[#7A8599]">Click &ldquo;Generate&rdquo; to create an income choropleth map</p>
                            <p className="text-[10px] text-[#A0AABB] mt-1">Census Block Groups · ACS 5-Year Estimates</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Source attribution */}
            {geojson && (
                <p className="text-[10px] text-[#A0AABB] mt-1.5 text-center">
                    Median household income by Census Block Group within {radiusMiles} miles of {pursuitName || 'site'} · Source: Census ACS 5-Year Estimates
                </p>
            )}
        </div>
    );
}
