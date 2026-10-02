'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Map as MapboxMap, LngLatBoundsLike, FitBoundsOptions, ControlPosition } from 'mapbox-gl';
import { useThemeStore } from '@/store/useThemeStore';
import { STYLE_URLS, basemapConfig, lightPreset, type Basemap, type BasemapOptions } from './mapStyle';
import type { MapboxGL } from './mapHelpers';
import { ensurePopupTheme } from './popupTheme';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export interface UseMapboxMapOptions extends BasemapOptions {
    center?: [number, number];
    zoom?: number;
    /** Open framed on these bounds instead of center/zoom (no fly-in animation) */
    bounds?: LngLatBoundsLike;
    fitBoundsOptions?: FitBoundsOptions;
    pitch?: number;
    minZoom?: number;
    maxZoom?: number;
    basemap?: Basemap;
    /**
     * Page-embedded maps require ctrl/⌘ + scroll to zoom and two fingers to pan,
     * so the page keeps scrolling. Turn off for full-screen maps.
     */
    cooperativeGestures?: boolean;
    interactive?: boolean;
    /** Zoom/compass control position, or false for none */
    navigation?: ControlPosition | false;
    /**
     * Called on every style load — the first load and after a basemap switch,
     * which clears custom layers. Add sources/layers here, idempotently (use
     * `upsertGeoJsonSource` / `addLayerOnce`) and from refs holding the latest data.
     */
    onStyleReady?: (map: MapboxMap, mbgl: MapboxGL) => void;
}

export interface MapboxMapState {
    map: MapboxMap | null;
    mbgl: MapboxGL | null;
    /** True after the first full load; safe to update sources */
    ready: boolean;
    error: string | null;
}

const EMPTY: MapboxMapState = { map: null, mbgl: null, ready: false, error: null };

/**
 * One Mapbox map per mounted container, created once and removed on unmount.
 * Theme changes switch Standard's light preset in place; basemap and 3D
 * changes reuse the same map. Shared defaults: Standard style, cooperative
 * gestures, attribution, zoom control, and an error state for the overlay.
 */
export function useMapboxMap(containerRef: RefObject<HTMLElement | null>, options: UseMapboxMapOptions = {}): MapboxMapState {
    const [state, setState] = useState<MapboxMapState>(() => (TOKEN ? EMPTY : { ...EMPTY, error: 'Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN is not set.' }));
    const isDark = useThemeStore((s) => s.theme) === 'dark';
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const isDarkRef = useRef(isDark);
    isDarkRef.current = isDark;
    const appliedRef = useRef<{ basemap: Basemap; show3d: boolean; showPOIs: boolean } | null>(null);

    // Create once
    useEffect(() => {
        if (!TOKEN) return;
        let cancelled = false;
        let map: MapboxMap | null = null;
        let loaded = false;

        import('mapbox-gl')
            .then(({ default: mbgl }) => {
                const container = containerRef.current;
                if (cancelled || !container) return;
                ensurePopupTheme();
                const o = optionsRef.current;
                const basemap = o.basemap ?? 'standard';
                const interactive = o.interactive ?? true;
                appliedRef.current = { basemap, show3d: !!o.show3d, showPOIs: !!o.showPOIs };

                // Mapbox merges these over its defaults, so an explicit `undefined` would
                // wipe a default (e.g. minZoom) and break the camera — only pass what's set
                const optional = Object.fromEntries(
                    Object.entries({ bounds: o.bounds, fitBoundsOptions: o.fitBoundsOptions, pitch: o.pitch, minZoom: o.minZoom, maxZoom: o.maxZoom })
                        .filter(([, v]) => v !== undefined),
                );
                // Mapbox adds .mapboxgl-map (position: relative) to the container, which
                // beats Tailwind's .absolute — an "absolute inset-0" container would
                // collapse to 0px tall. Keep whatever positioning it had.
                const position = getComputedStyle(container).position;
                map = new mbgl.Map({
                    container,
                    accessToken: TOKEN,
                    style: STYLE_URLS[basemap],
                    config: { basemap: basemapConfig(basemap, isDarkRef.current, o) },
                    center: o.center ?? [-96.8, 32.8],
                    zoom: o.zoom ?? 4,
                    ...optional,
                    interactive,
                    cooperativeGestures: interactive && (o.cooperativeGestures ?? true),
                    respectPrefersReducedMotion: true,
                });
                if (position === 'absolute' || position === 'fixed') {
                    container.style.position = position;
                    map.resize();
                }
                if (interactive && o.navigation !== false) {
                    map.addControl(new mbgl.NavigationControl({ visualizePitch: !!o.show3d }), o.navigation ?? 'top-right');
                }

                const m = map;
                m.on('style.load', () => optionsRef.current.onStyleReady?.(m, mbgl));
                m.once('load', () => {
                    loaded = true;
                    if (!cancelled) setState((s) => ({ ...s, ready: true }));
                });
                m.on('error', (e: { error?: { status?: number; message?: string } }) => {
                    const status = e.error?.status;
                    // Tile hiccups after load are normal; only a rejected token or a style that never loads is fatal
                    if (status === 401 || status === 403) {
                        setState((s) => ({ ...s, error: 'Map unavailable — the Mapbox token was rejected.' }));
                    } else if (!loaded && /style/i.test(e.error?.message ?? '')) {
                        setState((s) => ({ ...s, error: 'The map failed to load. Check your connection and refresh.' }));
                    }
                });
                setState({ map: m, mbgl, ready: false, error: null });
            })
            .catch((err) => {
                console.error('Map failed to start:', err);
                if (!cancelled) setState((s) => ({ ...s, error: 'The map could not start. Refresh the page — if it keeps happening, this browser may not support WebGL.' }));
            });

        return () => {
            cancelled = true;
            map?.remove();
            appliedRef.current = null;
            setState(EMPTY);
        };
        // The map is created once per mount; later option changes are applied below
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { map } = state;
    const basemap = options.basemap ?? 'standard';
    const show3d = !!options.show3d;
    const showPOIs = !!options.showPOIs;

    // Theme: switch the light preset in place
    useEffect(() => {
        if (!map) return;
        const apply = () => {
            try { map.setConfigProperty('basemap', 'lightPreset', lightPreset(isDark)); } catch { /* style mid-switch; style.load re-applies */ }
        };
        if (map.isStyleLoaded()) apply();
        else map.once('style.load', apply);
    }, [map, isDark]);

    // Basemap / 3D / POI changes
    useEffect(() => {
        const applied = appliedRef.current;
        if (!map || !applied) return;
        if (applied.basemap !== basemap) {
            appliedRef.current = { basemap, show3d, showPOIs };
            // A different style clears custom layers; onStyleReady re-adds them on style.load
            map.setStyle(STYLE_URLS[basemap], {
                diff: false,
                config: { basemap: basemapConfig(basemap, isDarkRef.current, { show3d, showPOIs }) },
            } as unknown as Parameters<MapboxMap['setStyle']>[1]); // the typings mark the font options required
            return;
        }
        if (applied.show3d !== show3d && basemap === 'standard') {
            map.setConfigProperty('basemap', 'show3dObjects', show3d);
        }
        if (applied.showPOIs !== showPOIs) {
            map.setConfigProperty('basemap', 'showPointOfInterestLabels', showPOIs);
        }
        appliedRef.current = { basemap, show3d, showPOIs };
    }, [map, basemap, show3d, showPOIs]);

    return state;
}

/** True when the app is in dark theme — for choosing overlay colors */
export function useIsDarkTheme(): boolean {
    return useThemeStore((s) => s.theme) === 'dark';
}
