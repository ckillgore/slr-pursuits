/**
 * Basemaps: Mapbox Standard and Standard Satellite.
 *
 * Both follow the app theme through the `lightPreset` config (day / night),
 * which changes in place — no map rebuild, custom layers stay. Custom layers
 * go into Standard's slots so labels stay readable on top of them:
 *   middle — polygons / lines / heatmaps (under road & place labels)
 *   (none) — points, clusters and our own labels, stacked over everything
 *            (Standard's own `top` slot is still under city/state labels)
 */

export type Basemap = 'standard' | 'satellite';

export const STYLE_URLS: Record<Basemap, string> = {
    standard: 'mapbox://styles/mapbox/standard',
    satellite: 'mapbox://styles/mapbox/standard-satellite',
};

export interface BasemapOptions {
    /** 3D buildings and landmarks (Standard only) */
    show3d?: boolean;
    /** Business / point-of-interest labels — off by default to keep analysis maps clean */
    showPOIs?: boolean;
}

export function lightPreset(isDark: boolean): 'day' | 'night' {
    return isDark ? 'night' : 'day';
}

/** `config.basemap` for the given basemap and theme */
export function basemapConfig(basemap: Basemap, isDark: boolean, opts: BasemapOptions = {}): Record<string, string | boolean> {
    const shared = {
        lightPreset: lightPreset(isDark),
        showPointOfInterestLabels: !!opts.showPOIs,
        showTransitLabels: false,
    };
    if (basemap === 'satellite') return shared;
    // "faded" mutes the basemap colors so our data reads first
    return { ...shared, theme: 'faded', show3dObjects: !!opts.show3d };
}

/** High-contrast "ink" color for the subject-site marker / outline on either theme */
export function siteInkColor(isDark: boolean): string {
    return isDark ? '#E8EAF0' : '#1A1F2B';
}
