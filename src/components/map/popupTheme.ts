// Theme-matched Mapbox popups. Injected once by useMapboxMap.

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

export function ensurePopupTheme() {
    if (typeof document === 'undefined' || document.getElementById('slr-mapbox-popup-theme')) return;
    const style = document.createElement('style');
    style.id = 'slr-mapbox-popup-theme';
    style.textContent = POPUP_CSS;
    document.head.appendChild(style);
}
