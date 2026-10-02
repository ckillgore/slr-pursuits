import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { createTtlCache, upstreamErrorResponse } from '@/app/api/_lib/upstream';
import { z } from 'zod';

// ACS 5-year income is annual data; cache a county's block-group map for a day.
const countyIncomeCache = createTtlCache<{ year: number; incomes: Map<string, number | null> }>(24 * 60 * 60 * 1000, 100);

// The Census API rejects keyless requests (it redirects to a "Missing Key"
// page). Free key: https://api.census.gov/data/key_signup.html
const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
// Newest ACS 5-year release first, falling back if one isn't published yet
const ACS_YEARS = [2024, 2023, 2022];
// TIGERweb caps each response; page past it
const TIGER_PAGE_SIZE = 500;
const TIGER_MAX_FEATURES = 4000;

const BodySchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusMiles: z.number().min(1).max(50).default(5),
});

class CensusUnavailableError extends Error {}

/**
 * POST /api/income-heatmap
 * Returns GeoJSON FeatureCollection of Census Block Groups near a location,
 * each with median household income, from free Census Bureau APIs (the ACS
 * API needs a free key in CENSUS_API_KEY).
 *
 * Steps:
 *  1. TIGERweb → block group geometries near the point (paged)
 *  2. Census ACS API → median HH income for every county those block groups
 *     fall in (a radius near a county line spans several counties)
 *  3. Join geometry + income → GeoJSON. Fails rather than returning a map with
 *     no income at all, so the client never saves a blank heat map.
 *
 * Body: { latitude: number, longitude: number, radiusMiles?: number }
 */
export async function POST(request: Request) {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const raw = await request.json();
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }
        const { latitude, longitude, radiusMiles } = parsed.data;

        if (!CENSUS_API_KEY) {
            return NextResponse.json(
                { error: 'Income data is not configured: add a free Census API key as CENSUS_API_KEY.' },
                { status: 503 },
            );
        }

        // ─── Step 1: block group geometries ───
        const bgFeatures = await getBlockGroupGeometries(latitude, longitude, radiusMiles);
        if (bgFeatures.length === 0) {
            return NextResponse.json({ error: 'No Census Block Groups found near this location' }, { status: 404 });
        }

        // ─── Step 2: income for every county the block groups touch ───
        const counties = [...new Set(bgFeatures.map((f) => countyKey(f.properties ?? {})).filter(Boolean))] as string[];
        const results = await Promise.all(counties.map((key) => getCountyIncome(key).catch((err) => {
            console.error(`[Income heatmap] ACS county ${key} failed:`, err);
            return null;
        })));
        const incomeMap = new Map<string, number | null>();
        let acsYear: number | null = null;
        for (const r of results) {
            if (!r) continue;
            acsYear = Math.max(acsYear ?? 0, r.year);
            for (const [geoId, income] of r.incomes) incomeMap.set(geoId, income);
        }
        const failedCounties = results.filter((r) => !r).length;
        if (failedCounties === counties.length) {
            throw new CensusUnavailableError('Census income data could not be loaded for any county');
        }

        // ─── Step 3: join ───
        const geojson = joinIncomeData(bgFeatures, incomeMap, latitude, longitude, radiusMiles);

        return NextResponse.json({
            geojson,
            blockGroupCount: geojson.features.length,
            acsYear,
            // Counties whose income failed to load (their block groups show as "no data")
            failedCounties,
        });
    } catch (err: unknown) {
        if (err instanceof CensusUnavailableError) {
            console.error('[Income heatmap]', err.message);
            return NextResponse.json({ error: 'Census income data is unavailable right now — try again shortly.' }, { status: 502 });
        }
        return upstreamErrorResponse(err, 'Income heatmap', 'Failed to build income heatmap');
    }
}

/** "SSCCC" state+county code for a TIGERweb block group */
function countyKey(props: Record<string, unknown>): string | null {
    const geoid = String(props.GEOID ?? '');
    if (geoid.length >= 5) return geoid.slice(0, 5);
    const state = String(props.STATE ?? ''), county = String(props.COUNTY ?? '');
    return state && county ? `${state}${county}` : null;
}

// ======================== Step 1: TIGERweb Block Group Geometries ========================

interface TigerFeature {
    type: 'Feature';
    properties?: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown } | null;
}

async function getBlockGroupGeometries(lat: number, lng: number, radiusMiles: number): Promise<TigerFeature[]> {
    // Bounding box from radius: 1° latitude ≈ 69 miles; longitude shrinks with cos(lat)
    const dLat = radiusMiles / 69;
    const dLng = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180));
    const bbox = `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;

    // Current block groups (layer 10); older vintages as a fallback
    const attempts = [
        { service: 'tigerWMS_Current', layer: 10 },
        { service: 'tigerWMS_Current', layer: 12 },
        { service: 'tigerWMS_ACS2022', layer: 10 },
    ];

    for (const { service, layer } of attempts) {
        try {
            const features: TigerFeature[] = [];
            for (let offset = 0; offset < TIGER_MAX_FEATURES; offset += TIGER_PAGE_SIZE) {
                const params = new URLSearchParams({
                    where: '1=1',
                    outFields: 'GEOID,STATE,COUNTY,TRACT,BLKGRP,BASENAME,NAME',
                    geometry: bbox,
                    geometryType: 'esriGeometryEnvelope',
                    spatialRel: 'esriSpatialRelIntersects',
                    inSR: '4326',
                    outSR: '4326',
                    f: 'geojson',
                    orderByFields: 'GEOID',
                    resultOffset: String(offset),
                    resultRecordCount: String(TIGER_PAGE_SIZE),
                });
                const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/${service}/MapServer/${layer}/query?${params}`;
                const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
                if (!res.ok) break;
                const data = await res.json();
                if (data.error) break;
                const page: TigerFeature[] = data.features || [];
                features.push(...page);
                const more = data.exceededTransferLimit || data.properties?.exceededTransferLimit || page.length === TIGER_PAGE_SIZE;
                if (!more) break;
            }
            if (features.length > 0) return features;
        } catch (err) {
            console.warn(`TIGERweb ${service}/${layer} failed, trying next:`, err);
        }
    }

    console.error('All TIGERweb attempts failed');
    return [];
}

// ======================== Step 2: Census ACS Income Data ========================

async function getCountyIncome(key: string): Promise<{ year: number; incomes: Map<string, number | null> }> {
    const cached = countyIncomeCache.get(key);
    if (cached) return cached;
    const result = await fetchCountyIncome(key.slice(0, 2), key.slice(2));
    countyIncomeCache.set(key, result);
    return result;
}

async function fetchCountyIncome(stateFips: string, countyFips: string): Promise<{ year: number; incomes: Map<string, number | null> }> {
    let lastError: unknown = null;
    for (const year of ACS_YEARS) {
        // B19013_001E = median household income (in that year's inflation-adjusted dollars)
        const params = new URLSearchParams({ get: 'B19013_001E', for: 'block group:*', key: CENSUS_API_KEY });
        const url = `https://api.census.gov/data/${year}/acs/acs5?${params}&in=state:${stateFips}&in=county:${countyFips}`;
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'manual' });
            // A rejected/missing key redirects to an HTML page instead of returning an error status
            if (res.status >= 300 && res.status < 400) throw new Error(`Census API redirected (HTTP ${res.status}) — check CENSUS_API_KEY`);
            if (res.status === 404) { lastError = new Error(`ACS ${year} not published`); continue; }
            const text = await res.text();
            if (!res.ok) throw new Error(`Census ACS HTTP ${res.status}: ${text.slice(0, 200)}`);
            const rows: string[][] = JSON.parse(text);

            // First row is headers: [B19013_001E, state, county, tract, block group]
            const header = rows[0] ?? [];
            const col = (name: string) => header.indexOf(name);
            const [iIncome, iState, iCounty, iTract, iBg] = ['B19013_001E', 'state', 'county', 'tract', 'block group'].map(col);
            const incomes = new Map<string, number | null>();
            for (const row of rows.slice(1)) {
                const geoId = `${row[iState]}${row[iCounty]}${row[iTract]}${row[iBg]}`;
                const value = Number(row[iIncome]);
                // Census encodes "not available" as large negative sentinels (-666666666, -888888888, …)
                incomes.set(geoId, Number.isFinite(value) && value > 0 ? value : null);
            }
            return { year, incomes };
        } catch (err) {
            lastError = err;
            if (!(err instanceof Error) || !/not published/.test(err.message)) break;
        }
    }
    throw lastError ?? new Error('Census ACS request failed');
}

// ======================== Step 3: Join & Build GeoJSON ========================

function joinIncomeData(
    tigerFeatures: TigerFeature[],
    incomeMap: Map<string, number | null>,
    centerLat: number,
    centerLng: number,
    radiusMiles: number,
) {
    const features: unknown[] = [];

    for (const f of tigerFeatures) {
        const props = f.properties || {};
        const geoid = String(props.GEOID || '');
        const income = incomeMap.get(geoid) ?? null;

        // Centroid distance for filtering/display
        const centroid = computeCentroid(f.geometry);
        const dist = centroid ? haversineDistance(centerLat, centerLng, centroid[1], centroid[0]) : null;

        // Only include block groups within the radius
        if (dist != null && dist > radiusMiles * 1.2) continue;

        features.push({
            type: 'Feature',
            properties: {
                geoId: geoid,
                name: props.BASENAME ? `Block Group ${props.BASENAME}` : geoid,
                medianIncome: income,
                distanceMiles: dist ? +dist.toFixed(2) : null,
            },
            geometry: f.geometry,
        });
    }

    return { type: 'FeatureCollection' as const, features };
}

// ======================== Geo Helpers ========================

function computeCentroid(geometry: TigerFeature['geometry']): [number, number] | null {
    if (!geometry?.coordinates) return null;

    const points: [number, number][] = [];
    const extract = (coords: unknown): void => {
        if (!Array.isArray(coords)) return;
        if (typeof coords[0] === 'number') points.push(coords as [number, number]);
        else for (const c of coords) extract(c);
    };
    extract(geometry.coordinates);

    if (points.length === 0) return null;
    const sumLng = points.reduce((s, p) => s + p[0], 0);
    const sumLat = points.reduce((s, p) => s + p[1], 0);
    return [sumLng / points.length, sumLat / points.length];
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}
