'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, LngLatBoundsLike, Map as MapboxMap, Popup } from 'mapbox-gl';
import { MapPin } from 'lucide-react';
import { useMapboxMap, useIsDarkTheme } from '@/components/map/useMapboxMap';
import { MapStatusOverlay } from '@/components/map/MapStatusOverlay';
import { addLayerOnce, createPopup, escapeHtml, upsertGeoJsonSource, setGeoJsonData } from '@/components/map/mapHelpers';

export interface CompsMapPoint {
    id: string;
    lng: number;
    lat: number;
    title: string;
    /** Second label line, e.g. a price or unit count */
    subtitle?: string;
    href: string;
}

interface CompsMapProps {
    points: CompsMapPoint[];
    accentColor: string;
    emptyTitle: string;
    emptyHint?: string;
}

type PointProps = { title: string; subtitle: string; href: string };

const SOURCE = 'comps';
const CLUSTER_LAYER = 'comps-clusters';
const CLUSTER_COUNT_LAYER = 'comps-cluster-count';
const POINT_LAYER = 'comps-points';
const LABEL_LAYER = 'comps-labels';
const CLUSTER_MAX_ZOOM = 14;
const LABEL_MIN_ZOOM = 11;
const FIT = { padding: 50, maxZoom: 14 };

function toGeoJson(points: CompsMapPoint[]): FeatureCollection<Point, PointProps> {
    return {
        type: 'FeatureCollection',
        // Numeric feature ids so hover feature-state works on the clustered source
        features: points.map((p, i) => ({
            type: 'Feature',
            id: i,
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: { title: p.title, subtitle: p.subtitle ?? '', href: p.href },
        })),
    };
}

function boundsOfPoints(points: CompsMapPoint[]): LngLatBoundsLike | undefined {
    if (points.length === 0) return undefined;
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of points) {
        w = Math.min(w, p.lng); e = Math.max(e, p.lng);
        s = Math.min(s, p.lat); n = Math.max(n, p.lat);
    }
    return [[w, s], [e, n]];
}

function labelPaint(isDark: boolean) {
    return isDark ? { text: '#E8EAF0', halo: '#11141B' } : { text: '#1A1F2B', halo: '#FFFFFF' };
}

function addCompLayers(map: MapboxMap, data: FeatureCollection, accent: string, isDark: boolean) {
    upsertGeoJsonSource(map, SOURCE, data, { cluster: true, clusterRadius: 40, clusterMaxZoom: CLUSTER_MAX_ZOOM });
    addLayerOnce(map, {
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE,
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': accent,
            'circle-opacity': 0.85,
            'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
        },
    });
    addLayerOnce(map, {
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE,
        filter: ['has', 'point_count'],
        layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-allow-overlap': true,
        },
        paint: { 'text-color': '#FFFFFF' },
    });
    addLayerOnce(map, {
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': accent,
            'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 10, ['interpolate', ['linear'], ['zoom'], 4, 6, 14, 8]],
            'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 2],
            'circle-stroke-color': '#FFFFFF',
        },
    });
    const colors = labelPaint(isDark);
    addLayerOnce(map, {
        id: LABEL_LAYER,
        type: 'symbol',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        minzoom: LABEL_MIN_ZOOM,
        layout: {
            'text-field': ['case', ['==', ['get', 'subtitle'], ''], ['get', 'title'],
                ['format', ['get', 'title'], {}, '\n', {}, ['get', 'subtitle'], { 'font-scale': 0.85 }]],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-max-width': 12,
            'text-allow-overlap': false,
        },
        paint: { 'text-color': colors.text, 'text-halo-color': colors.halo, 'text-halo-width': 1.5 },
    });
}

/**
 * Comps on one long-lived map: clustered points (count bubbles expand on
 * click), accent-colored dots with collision-aware labels once zoomed in, and
 * one reusable popup linking to the comp. Filters update the data in place.
 */
export function CompsMap({ points, accentColor, emptyTitle, emptyHint }: CompsMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const routerRef = useRef(router);
    routerRef.current = router;
    const isDark = useIsDarkTheme();

    const geojson = useMemo(() => toGeoJson(points), [points]);
    const pointsKey = useMemo(() => points.map((p) => p.id).sort().join('|'), [points]);
    const latest = useRef({ geojson, accentColor, isDark });
    latest.current = { geojson, accentColor, isDark };
    const popupRef = useRef<Popup | null>(null);
    const hoveredRef = useRef<number | string | null>(null);

    // Frame the comps known at mount; later changes refit below
    const initialBounds = useMemo(() => boundsOfPoints(points), []); // eslint-disable-line react-hooks/exhaustive-deps
    const framedKeyRef = useRef(pointsKey);

    const { map, mbgl, ready, error } = useMapboxMap(containerRef, {
        bounds: initialBounds,
        fitBoundsOptions: FIT,
        center: [-97.7431, 32.0],
        zoom: 4,
        onStyleReady: (m) => {
            const { geojson: data, accentColor: accent, isDark: dark } = latest.current;
            hoveredRef.current = null;
            addCompLayers(m, data, accent, dark);
        },
    });

    // Interactions: expand clusters, open the popup on a point, hover highlight
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        const popup = createPopup(mbgl, { closeButton: true, offset: 10 });
        popupRef.current = popup;
        const clearHover = () => {
            if (hoveredRef.current != null && map.getSource(SOURCE)) {
                map.setFeatureState({ source: SOURCE, id: hoveredRef.current }, { hover: false });
            }
            hoveredRef.current = null;
        };

        map.addInteraction('comps-cluster-click', {
            type: 'click',
            target: { layerId: CLUSTER_LAYER },
            handler: (e) => {
                const f = e.feature;
                if (!f || f.geometry.type !== 'Point') return;
                const center = f.geometry.coordinates as [number, number];
                const clusterId = f.properties?.cluster_id as number;
                (map.getSource(SOURCE) as GeoJSONSource | undefined)?.getClusterExpansionZoom(clusterId, (err, zoom) => {
                    if (err || zoom == null) return;
                    map.easeTo({ center, zoom });
                });
            },
        });
        map.addInteraction('comps-point-click', {
            type: 'click',
            target: { layerId: POINT_LAYER },
            handler: (e) => {
                const f = e.feature;
                if (!f || f.geometry.type !== 'Point') return;
                const { title, subtitle, href } = (f.properties ?? {}) as PointProps;
                const el = document.createElement('div');
                el.innerHTML = `
                    <div style="font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.3;padding-right:12px;">${escapeHtml(title)}</div>
                    ${subtitle ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(subtitle)}</div>` : ''}
                    <a href="${escapeHtml(href)}" style="display:inline-block;margin-top:6px;font-size:11px;font-weight:600;color:var(--accent);">View comp →</a>
                `;
                el.querySelector('a')?.addEventListener('click', (ev) => {
                    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
                    ev.preventDefault();
                    routerRef.current.push(href);
                });
                popup.setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(el).addTo(map);
            },
        });
        // Clicking empty map closes the popup (targeted interactions run first)
        map.addInteraction('comps-map-click', { type: 'click', handler: () => { popup.remove(); } });

        for (const layerId of [CLUSTER_LAYER, POINT_LAYER]) {
            map.addInteraction(`comps-${layerId}-enter`, {
                type: 'mouseenter',
                target: { layerId },
                handler: (e) => {
                    map.getCanvas().style.cursor = 'pointer';
                    if (layerId === POINT_LAYER && e.feature?.id != null) {
                        clearHover();
                        hoveredRef.current = e.feature.id;
                        map.setFeatureState({ source: SOURCE, id: e.feature.id }, { hover: true });
                    }
                },
            });
            map.addInteraction(`comps-${layerId}-leave`, {
                type: 'mouseleave',
                target: { layerId },
                handler: () => {
                    map.getCanvas().style.cursor = '';
                    if (layerId === POINT_LAYER) clearHover();
                    return false;
                },
            });
        }

        return () => {
            for (const id of ['comps-cluster-click', 'comps-point-click', 'comps-map-click',
                `comps-${CLUSTER_LAYER}-enter`, `comps-${CLUSTER_LAYER}-leave`, `comps-${POINT_LAYER}-enter`, `comps-${POINT_LAYER}-leave`]) {
                try { map.removeInteraction(id); } catch { /* map already removed */ }
            }
            popup.remove();
            popupRef.current = null;
        };
    }, [map, mbgl, ready]);

    // Data: update in place; refit when the set of comps changes
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        if (hoveredRef.current != null) {
            map.setFeatureState({ source: SOURCE, id: hoveredRef.current }, { hover: false });
            hoveredRef.current = null;
        }
        setGeoJsonData(map, SOURCE, geojson);
        if (framedKeyRef.current === pointsKey) return;
        framedKeyRef.current = pointsKey;
        popupRef.current?.remove();
        const bounds = boundsOfPoints(points);
        if (bounds) map.fitBounds(bounds, { ...FIT, duration: 600 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, mbgl, ready, geojson, pointsKey]);

    // Accent (tab) and theme changes restyle in place
    useEffect(() => {
        if (!map || !ready) return;
        const colors = labelPaint(isDark);
        if (map.getLayer(CLUSTER_LAYER)) map.setPaintProperty(CLUSTER_LAYER, 'circle-color', accentColor);
        if (map.getLayer(POINT_LAYER)) map.setPaintProperty(POINT_LAYER, 'circle-color', accentColor);
        if (map.getLayer(LABEL_LAYER)) {
            map.setPaintProperty(LABEL_LAYER, 'text-color', colors.text);
            map.setPaintProperty(LABEL_LAYER, 'text-halo-color', colors.halo);
        }
    }, [map, ready, accentColor, isDark]);

    return (
        <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
            <div ref={containerRef} className="absolute inset-0" />
            <MapStatusOverlay ready={ready} error={error} />
            {ready && !error && points.length === 0 && (
                <div className="absolute inset-x-0 top-4 z-10 flex justify-center pointer-events-none">
                    <div role="status" className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 shadow-md">
                        <MapPin className="w-4 h-4 mt-0.5 text-[var(--text-faint)]" aria-hidden />
                        <div>
                            <p className="text-sm text-[var(--text-muted)]">{emptyTitle}</p>
                            {emptyHint && <p className="text-xs text-[var(--text-faint)] mt-0.5">{emptyHint}</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
