// ============================================================
// Location-keyed cache helpers
//
// Drive-time, income heat-map, parcel and demographics results are cached
// on the pursuit / comp row (one slot per record, not per location). When
// the record's location is edited, the cached result silently describes the
// OLD site. These helpers detect that so the UI can prompt a regenerate —
// they never call an external API themselves.
// ============================================================

/** [longitude, latitude] — Mapbox / GeoJSON order */
export type LngLat = [number, number];

const EARTH_RADIUS_M = 6_371_000;

function isFiniteLngLat(p: unknown): p is LngLat {
    return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/** Great-circle distance in meters */
export function distanceMeters(a: LngLat, b: LngLat): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bounding box [minLng, minLat, maxLng, maxLat] of any GeoJSON geometry / Feature / FeatureCollection */
export function geoBounds(geo: unknown): [number, number, number, number] | null {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const walk = (coords: unknown): void => {
        if (!Array.isArray(coords)) return;
        if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
            const [lng, lat] = coords as number[];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            return;
        }
        for (const c of coords) walk(c);
    };
    const visit = (g: unknown): void => {
        if (!g || typeof g !== 'object') return;
        const obj = g as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[] };
        if (Array.isArray(obj.features)) obj.features.forEach(visit);
        else if (Array.isArray(obj.geometries)) obj.geometries.forEach(visit);
        else if (obj.geometry) visit(obj.geometry);
        else if (obj.coordinates) walk(obj.coordinates);
    };
    visit(geo);
    return Number.isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] : null;
}

/** True when `point` lies inside `bounds` grown by `bufferMeters` on every side */
function inBounds(point: LngLat, bounds: [number, number, number, number], bufferMeters: number): boolean {
    const latBuf = bufferMeters / 111_320;
    const lngBuf = bufferMeters / (111_320 * Math.max(0.1, Math.cos((point[1] * Math.PI) / 180)));
    return point[0] >= bounds[0] - lngBuf && point[0] <= bounds[2] + lngBuf
        && point[1] >= bounds[1] - latBuf && point[1] <= bounds[3] + latBuf;
}

/**
 * Was this cached result generated for a different location than `current`?
 *
 * - `savedCenter` (written with every new cache entry) is compared directly.
 * - Older entries have no saved center; fall back to "is the site outside the
 *   cached geometry's bounding box", which catches any real move while never
 *   flagging an entry that is merely missing metadata.
 * Returns false when there is nothing to compare against.
 */
export function isCacheForOtherLocation(opts: {
    current: LngLat | null;
    savedCenter?: unknown;
    geometry?: unknown;
    toleranceMeters?: number;
}): boolean {
    const { current, savedCenter, geometry, toleranceMeters = 50 } = opts;
    if (!current || !isFiniteLngLat(current)) return false;
    if (isFiniteLngLat(savedCenter)) {
        return distanceMeters(current, savedCenter) > toleranceMeters;
    }
    const bounds = geometry ? geoBounds(geometry) : null;
    if (bounds) return !inBounds(current, bounds, toleranceMeters);
    return false;
}

/**
 * Parcel variant: moving the pin within the same parcel is not a change, so a
 * parcel is stale only when the site is outside the parcel's footprint (with a
 * small buffer for geocodes that land on the street) AND, if known, away from
 * the point it was queried at.
 */
export function isParcelForOtherLocation(opts: {
    current: LngLat | null;
    queriedAt?: unknown;
    geometry?: unknown;
}): boolean {
    const { current, queriedAt, geometry } = opts;
    if (!current || !isFiniteLngLat(current)) return false;
    const bounds = geometry ? geoBounds(geometry) : null;
    const outsideParcel = bounds ? !inBounds(current, bounds, 40) : null;
    const awayFromQuery = isFiniteLngLat(queriedAt) ? distanceMeters(current, queriedAt) > 75 : null;
    if (outsideParcel === null && awayFromQuery === null) return false;
    if (outsideParcel === null) return awayFromQuery!;
    if (awayFromQuery === null) return outsideParcel;
    return outsideParcel && awayFromQuery;
}
