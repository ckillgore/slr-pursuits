'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/useThemeStore';

// ============================================================
// Theme-aware Mapbox basemaps + popups
//
// Maps are created with the basemap matching the app theme. Components add
// `mapStyle` to their map-init effect deps, so toggling the theme rebuilds the
// map (and its layers) with the matching basemap — cheaper and safer than
// setStyle(), which drops every custom source/layer.
// ============================================================

const BASEMAPS = {
    light: { light: 'mapbox://styles/mapbox/light-v11', dark: 'mapbox://styles/mapbox/dark-v11' },
    streets: { light: 'mapbox://styles/mapbox/streets-v12', dark: 'mapbox://styles/mapbox/dark-v11' },
} as const;

// Mapbox popups ship with a hard-coded white card. Our popup HTML uses the
// theme tokens (var(--text-primary) …), which made popups unreadable in dark
// mode (light text on white). Re-skin the card with the same tokens.
const POPUP_CSS = `
.mapboxgl-popup-content { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); box-shadow: var(--shadow-dropdown); }
.mapboxgl-popup-anchor-top .mapboxgl-popup-tip, .mapboxgl-popup-anchor-top-left .mapboxgl-popup-tip, .mapboxgl-popup-anchor-top-right .mapboxgl-popup-tip { border-bottom-color: var(--bg-card); }
.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip, .mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-tip, .mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-tip { border-top-color: var(--bg-card); }
.mapboxgl-popup-anchor-left .mapboxgl-popup-tip { border-right-color: var(--bg-card); }
.mapboxgl-popup-anchor-right .mapboxgl-popup-tip { border-left-color: var(--bg-card); }
`;

function ensurePopupTheme() {
    if (typeof document === 'undefined' || document.getElementById('slr-mapbox-popup-theme')) return;
    const style = document.createElement('style');
    style.id = 'slr-mapbox-popup-theme';
    style.textContent = POPUP_CSS;
    document.head.appendChild(style);
}

/**
 * Returns the basemap URL for the current app theme, plus `isDark` for
 * choosing overlay colors (e.g. a near-black parcel outline vanishes on the
 * dark basemap).
 */
export function useMapStyle(variant: keyof typeof BASEMAPS = 'light') {
    const theme = useThemeStore((s) => s.theme);
    useEffect(ensurePopupTheme, []);
    const isDark = theme === 'dark';
    return { mapStyle: BASEMAPS[variant][isDark ? 'dark' : 'light'], isDark };
}

/** High-contrast "ink" color for the subject-site marker / outline on either basemap */
export function siteInkColor(isDark: boolean): string {
    return isDark ? '#E8EAF0' : '#1A1F2B';
}
