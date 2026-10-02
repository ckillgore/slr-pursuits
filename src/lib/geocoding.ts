/**
 * Mapbox Geocoding v6.
 *
 * Mapbox's terms only allow storing results from *permanent* geocoding, and
 * permanent requests cost more. So the address box shows suggestions from
 * temporary requests while the user types (display only), and the address
 * they pick is geocoded again with `permanent=true` before it is saved —
 * use `geocodeForStorage()` for anything written to the database.
 */

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const BASE = 'https://api.mapbox.com/search/geocode/v6';

export interface GeocodeResult {
    id: string;
    /** First line: "2840 Bookhout Street", or the place name for a city/ZIP */
    name: string;
    /** Rest of the address: "Dallas, Texas 75201, United States" */
    secondary: string;
    /** Full single-line address */
    label: string;
    featureType: string;
    lng: number;
    lat: number;
    /** Street address, empty for a city / ZIP / neighborhood result */
    address: string;
    city: string;
    /** Full state name ("Texas"), matching how pursuits store it */
    state: string;
    zip: string;
    county: string;
}

/** Result types the address boxes accept. v6 has no POIs (businesses); those need the Search Box API. */
const SEARCH_TYPES = 'address,street,postcode,place,locality,neighborhood';

// Minimal shape of a v6 feature we read
interface V6Feature {
    id: string;
    properties: {
        mapbox_id?: string;
        feature_type: string;
        name: string;
        name_preferred?: string;
        place_formatted?: string;
        full_address?: string;
        coordinates: { longitude: number; latitude: number };
        context?: Record<string, { name?: string } | undefined>;
    };
}

function toResult(f: V6Feature): GeocodeResult {
    const p = f.properties;
    const ctx = p.context ?? {};
    const isAddress = p.feature_type === 'address';
    return {
        id: p.mapbox_id ?? f.id,
        name: p.name_preferred ?? p.name,
        secondary: p.place_formatted ?? '',
        label: p.full_address ?? [p.name, p.place_formatted].filter(Boolean).join(', '),
        featureType: p.feature_type,
        lng: p.coordinates.longitude,
        lat: p.coordinates.latitude,
        address: isAddress ? (ctx.address?.name ?? p.name) : '',
        city: ctx.place?.name ?? (p.feature_type === 'place' ? p.name : ''),
        state: ctx.region?.name ?? '',
        zip: ctx.postcode?.name ?? (p.feature_type === 'postcode' ? p.name : ''),
        county: ctx.district?.name ?? '',
    };
}

async function request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<GeocodeResult[]> {
    if (!TOKEN) return [];
    const qs = new URLSearchParams({ ...params, access_token: TOKEN });
    const res = await fetch(`${BASE}/${path}?${qs}`, { signal });
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
    const data = (await res.json()) as { features?: V6Feature[] };
    return (data.features ?? []).map(toResult);
}

/** Type-ahead suggestions (temporary — display only, never store these coordinates). */
export function searchPlaces(query: string, opts: { limit?: number; types?: string; signal?: AbortSignal } = {}) {
    if (!query.trim()) return Promise.resolve([]);
    return request('forward', {
        q: query,
        country: 'us',
        autocomplete: 'true',
        limit: String(opts.limit ?? 5),
        types: opts.types ?? SEARCH_TYPES,
    }, opts.signal);
}

/**
 * Permanent geocode for saving: pass the suggestion the user picked (or a
 * free-text address). Returns null when nothing matches.
 */
export async function geocodeForStorage(input: GeocodeResult | string, signal?: AbortSignal): Promise<GeocodeResult | null> {
    const q = typeof input === 'string' ? input : input.label;
    if (!q.trim()) return null;
    const [hit] = await request('forward', {
        q,
        country: 'us',
        permanent: 'true',
        limit: '1',
        types: typeof input === 'string' ? 'address,postcode,place' : input.featureType,
    }, signal);
    return hit ?? null;
}

/** Address at a point. Pass `permanent: true` when the result will be saved. */
export async function reverseGeocode(lng: number, lat: number, opts: { permanent?: boolean; signal?: AbortSignal } = {}): Promise<GeocodeResult | null> {
    const [hit] = await request('reverse', {
        longitude: String(lng),
        latitude: String(lat),
        types: 'address,place',
        limit: '1',
        ...(opts.permanent ? { permanent: 'true' } : {}),
    }, opts.signal);
    return hit ?? null;
}
