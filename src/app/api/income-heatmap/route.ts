import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { createTtlCache, upstreamErrorResponse, UPSTREAM_TIMEOUT_MS } from '@/app/api/_lib/upstream';
import { z } from 'zod';

// ACS 5-year income is annual data; cache a county's block-group map for a day.
const countyIncomeCache = createTtlCache<Map<string, number | null>>(24 * 60 * 60 * 1000, 100);

const BodySchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusMiles: z.number().min(1).max(50).default(5),
});

/**
 * POST /api/income-heatmap
 * Returns GeoJSON FeatureCollection of Census Block Groups near a location,
 * each with median household income, using FREE Census Bureau APIs (no key needed).
 *
 * Steps:
 *  1. FCC API → Get state/county FIPS from coordinates
 *  2. TIGERweb → Get block group geometries near the point
 *  3. Census ACS API → Get median HH income for those block groups
 *  4. Join geometry + income → return GeoJSON
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

        // ─── Step 1: Get state/county FIPS from coordinates ───
        const fips = await getFipsFromCoords(latitude, longitude);
        if (!fips) {
            return NextResponse.json({ error: 'Could not determine county FIPS for this location' }, { status: 404 });
        }

        // ─── Steps 2 + 3 in parallel: block group geometries and ACS income ───
        // (independent of each other — both only need the FIPS codes)
        const [bgFeatures, incomeMap] = await Promise.all([
            getBlockGroupGeometries(latitude, longitude, radiusMiles, fips.stateFips, fips.countyFips),
            getBlockGroupIncome(fips.stateFips, fips.countyFips),
        ]);
        if (!bgFeatures || bgFeatures.length === 0) {
            return NextResponse.json({ error: 'No Census Block Groups found near this location' }, { status: 404 });
        }

        // ─── Step 4: Join geometry + income ───
        const geojson = joinIncomeData(bgFeatures, incomeMap, latitude, longitude, radiusMiles);

        return NextResponse.json({
            geojson,
            blockGroupCount: geojson.features.length,
        });
    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'Income heatmap', 'Failed to build income heatmap');
    }
}

// ======================== Step 1: FCC API for FIPS ========================

interface FipsResult {
    stateFips: string;
    countyFips: string;
}

async function getFipsFromCoords(lat: number, lng: number): Promise<FipsResult | null> {
    try {
        const res = await fetch(
            `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lng}&format=json`,
            { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }
        );
        const data = await res.json();
        const result = data.results?.[0];
        if (!result) return null;

        const stateFips = result.state_fips; // 2-digit
        const countyFips = result.county_fips; // 5-digit (state+county)
        // Census ACS needs just the 3-digit county code (without state prefix)
        const countyCode = countyFips.length === 5 ? countyFips.slice(2) : countyFips;

        return {
            stateFips,
            countyFips: countyCode,
        };
    } catch (err) {
        console.error('FCC API error:', err);
        return null;
    }
}

// ======================== Step 2: TIGERweb Block Group Geometries ========================

async function getBlockGroupGeometries(
    lat: number,
    lng: number,
    radiusMiles: number,
    stateFips: string,
    countyFips: string
): Promise<any[]> {
    // Calculate bounding box from radius
    // 1 degree latitude ≈ 69 miles
    const dLat = radiusMiles / 69;
    // 1 degree longitude ≈ 69 * cos(lat) miles
    const dLng = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180));
    const bbox = `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;

    // Use TIGERweb Current service — Block Groups layer
    // Try multiple possible layer indices and service versions
    const attempts = [
        { service: 'tigerWMS_Current', layer: 10 },
        { service: 'tigerWMS_Current', layer: 12 },
        { service: 'tigerWMS_ACS2022', layer: 10 },
        { service: 'tigerWMS_ACS2022', layer: 12 },
    ];

    for (const { service, layer } of attempts) {
        const params = new URLSearchParams({
            where: '1=1',
            outFields: 'GEOID,STATE,COUNTY,TRACT,BLKGRP,BASENAME,NAME',
            geometry: bbox,
            geometryType: 'esriGeometryEnvelope',
            spatialRel: 'esriSpatialRelIntersects',
            inSR: '4326',
            outSR: '4326',
            f: 'geojson',
            resultRecordCount: '500',
        });

        const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/${service}/MapServer/${layer}/query?${params}`;
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
            if (!res.ok) continue; // try the next layer/service

            const data = await res.json();
            if (data.error) continue;

            const features = data.features || [];
            if (features.length > 0) {
                return features;
            }
        } catch (err) {
            console.warn(`TIGERweb ${service}/${layer} failed, trying next:`, err);
            continue;
        }
    }

    console.error('All TIGERweb attempts failed');
    return [];
}

// ======================== Step 3: Census ACS Income Data ========================

async function getBlockGroupIncome(
    stateFips: string,
    countyFips: string
): Promise<Map<string, number | null>> {
    const key = `${stateFips}:${countyFips}`;
    const cached = countyIncomeCache.get(key);
    if (cached) return cached;
    const map = await fetchBlockGroupIncome(stateFips, countyFips);
    // Only cache a successful lookup (an empty map means the ACS call failed).
    if (map.size > 0) countyIncomeCache.set(key, map);
    return map;
}

async function fetchBlockGroupIncome(
    stateFips: string,
    countyFips: string
): Promise<Map<string, number | null>> {
    // Census ACS 5-Year: B19013_001E = Median Household Income
    // Get all block groups in the county
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B19013_001E,NAME&for=block%20group:*&in=state:${stateFips}&in=county:${countyFips}`;
    let res: Response;
    let responseText: string;
    try {
        res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        responseText = await res.text();
    } catch (err) {
        console.error('Census ACS request failed:', err);
        return new Map();
    }

    if (!res.ok) {
        console.error(`Census ACS error: HTTP ${res.status}, body: ${responseText.slice(0, 200)}`);
        return new Map();
    }

    let rows: string[][];
    try {
        rows = JSON.parse(responseText);
    } catch {
        console.error(`Census ACS JSON parse error. Response (first 300 chars): ${responseText.slice(0, 300)}`);
        return new Map();
    }

    // First row is headers: [variable, NAME, state, county, tract, block group]
    const incomeMap = new Map<string, number | null>();

    for (let i = 1; i < rows.length; i++) {
        const [incomeStr, , state, county, tract, bg] = rows[i];
        const geoId = `${state}${county}${tract}${bg}`; // Full 12-digit GEOID
        const income = incomeStr && incomeStr !== '-666666666' && incomeStr !== 'null'
            ? Number(incomeStr)
            : null;
        if (income === null || !isNaN(income)) {
            incomeMap.set(geoId, income);
        }
    }

    return incomeMap;
}

// ======================== Step 4: Join & Build GeoJSON ========================

function joinIncomeData(
    tigerFeatures: any[],
    incomeMap: Map<string, number | null>,
    centerLat: number,
    centerLng: number,
    radiusMiles: number
) {
    const features: any[] = [];

    for (const f of tigerFeatures) {
        const props = f.properties || {};
        const geoid = props.GEOID || '';
        const income = incomeMap.get(geoid) ?? null;

        // Compute centroid distance for sorting/display
        const centroid = computeCentroid(f.geometry);
        const dist = centroid
            ? haversineDistance(centerLat, centerLng, centroid[1], centroid[0])
            : null;

        // Only include block groups within radius
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

    return {
        type: 'FeatureCollection',
        features,
    };
}

// ======================== Geo Helpers ========================

function computeCentroid(geometry: any): [number, number] | null {
    if (!geometry?.coordinates) return null;

    const points: [number, number][] = [];
    const extract = (coords: any): void => {
        if (typeof coords[0] === 'number') {
            points.push(coords as [number, number]);
        } else {
            for (const c of coords) extract(c);
        }
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
