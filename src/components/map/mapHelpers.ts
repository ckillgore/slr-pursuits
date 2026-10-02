import type mapboxgl from 'mapbox-gl';
import type {
    Map as MapboxMap,
    GeoJSONSource,
    GeoJSONSourceSpecification,
    LayerSpecification,
    LngLatBounds,
    PopupOptions,
} from 'mapbox-gl';
import type { FeatureCollection, Feature, Geometry, Position } from 'geojson';

export type MapboxGL = typeof mapboxgl;
type AnyLayer = LayerSpecification;

/**
 * Areas and lines go in Standard's `middle` slot, under road and place labels.
 * Points and our own labels get no slot, which stacks them above everything —
 * Standard's `top` slot still sits under city/state labels.
 */
function defaultSlot(type: AnyLayer['type']): string | undefined {
    return type === 'circle' || type === 'symbol' ? undefined : 'middle';
}

const EMISSIVE_PROPS: Partial<Record<AnyLayer['type'], string[]>> = {
    fill: ['fill-emissive-strength'],
    line: ['line-emissive-strength'],
    circle: ['circle-emissive-strength'],
    symbol: ['icon-emissive-strength', 'text-emissive-strength'],
    'fill-extrusion': ['fill-extrusion-emissive-strength'],
};

/** Add a GeoJSON source, or replace its data if it already exists. */
export function upsertGeoJsonSource(
    map: MapboxMap,
    id: string,
    data: FeatureCollection | Feature | Geometry,
    options: Omit<GeoJSONSourceSpecification, 'type' | 'data'> = {},
) {
    const existing = map.getSource(id) as GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else map.addSource(id, { type: 'geojson', data, ...options });
}

/** Replace a GeoJSON source's data if the source exists (no-op before the style has it). */
export function setGeoJsonData(map: MapboxMap, id: string, data: FeatureCollection | Feature | Geometry) {
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

/**
 * Add a layer once: areas/lines under the basemap labels, points above them.
 * Pass `slot` to override.
 */
export function addLayerOnce(map: MapboxMap, layer: AnyLayer) {
    if (map.getLayer(layer.id)) return;
    const slot = defaultSlot(layer.type);
    // Standard lights custom layers like the basemap, so the night preset dims our
    // data to near-black. Emissive strength 1 keeps colors true in every light preset.
    const emissive = EMISSIVE_PROPS[layer.type] ?? [];
    const paint = { ...Object.fromEntries(emissive.map((p) => [p, 1])), ...('paint' in layer ? layer.paint : {}) };
    const withLight = emissive.length ? { ...layer, paint } : layer;
    map.addLayer((slot ? { slot, ...withLight } : withLight) as AnyLayer);
}

export function removeLayers(map: MapboxMap, layerIds: string[], sourceId?: string) {
    for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id);
    if (sourceId && map.getSource(sourceId)) map.removeSource(sourceId);
}

/** Bounds of any GeoJSON (or bare coordinates); null when empty. */
export function boundsOf(
    mbgl: MapboxGL,
    input: FeatureCollection | Feature | Geometry | Position[] | null | undefined,
): LngLatBounds | null {
    if (!input) return null;
    const bounds = new mbgl.LngLatBounds();
    const walk = (c: unknown): void => {
        if (!Array.isArray(c)) return;
        if (typeof c[0] === 'number' && typeof c[1] === 'number') bounds.extend([c[0], c[1]]);
        else c.forEach(walk);
    };
    const visitGeometry = (g: Geometry | null | undefined): void => {
        if (!g) return;
        if (g.type === 'GeometryCollection') g.geometries.forEach(visitGeometry);
        else walk(g.coordinates);
    };
    if (Array.isArray(input)) walk(input);
    else if (input.type === 'FeatureCollection') input.features.forEach((f) => visitGeometry(f.geometry));
    else if (input.type === 'Feature') visitGeometry(input.geometry);
    else visitGeometry(input);
    return bounds.isEmpty() ? null : bounds;
}

export function escapeHtml(s: string | number | null | undefined): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Shared popup look; reuse one instance per map (setLngLat / setHTML) instead of creating one per mousemove. */
export function createPopup(mbgl: MapboxGL, options: PopupOptions = {}) {
    return new mbgl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '280px', ...options });
}
