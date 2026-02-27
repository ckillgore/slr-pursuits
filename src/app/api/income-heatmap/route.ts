import { NextResponse } from 'next/server';

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
    try {
        const { latitude, longitude, radiusMiles = 5 } = await request.json();

        if (!latitude || !longitude) {
            return NextResponse.json({ error: 'latitude and longitude are required' }, { status: 400 });
        }

        // ─── Step 1: Get state/county FIPS from coordinates ───
        const fips = await getFipsFromCoords(latitude, longitude);
        if (!fips) {
            return NextResponse.json({ error: 'Could not determine county FIPS for this location' }, { status: 404 });
        }

        // ─── Step 2: Get block group geometries near the point ───
        const bgFeatures = await getBlockGroupGeometries(latitude, longitude, radiusMiles, fips.stateFips, fips.countyFips);
        if (!bgFeatures || bgFeatures.length === 0) {
            return NextResponse.json({ error: 'No Census Block Groups found near this location' }, { status: 404 });
        }

        // ─── Step 3: Get income data from Census ACS ───
        const incomeMap = await getBlockGroupIncome(fips.stateFips, fips.countyFips);

        // ─── Step 4: Join geometry + income ───
        const geojson = joinIncomeData(bgFeatures, incomeMap, latitude, longitude, radiusMiles);

        return NextResponse.json({
            geojson,
            blockGroupCount: geojson.features.length,
        });
    } catch (err: any) {
        console.error('Income heatmap error:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
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
            `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lng}&format=json`
        );
        const data = await res.json();
        const result = data.results?.[0];
        if (!result) return null;

        const stateFips = result.state_fips; // 2-digit
        const countyFips = result.county_fips; // 5-digit (state+county)
        // Census ACS needs just the 3-digit county code (without state prefix)
        const countyCode = countyFips.length === 5 ? countyFips.slice(2) : countyFips;

        console.log(`FCC FIPS: state=${stateFips}, county=${countyCode} (raw: ${countyFips})`);

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
        console.log(`TIGERweb attempt: ${service}/MapServer/${layer}`);

        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.log(`  → HTTP ${res.status}, trying next...`);
                continue;
            }

            const data = await res.json();
            if (data.error) {
                console.log(`  → Error: ${JSON.stringify(data.error)}, trying next...`);
                continue;
            }

            const features = data.features || [];
            console.log(`  → Found ${features.length} features`);

            if (features.length > 0) {
                return features;
            }
        } catch (err) {
            console.log(`  → Fetch error: ${err}, trying next...`);
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
    // Census ACS 5-Year: B19013_001E = Median Household Income
    // Get all block groups in the county
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B19013_001E,NAME&for=block%20group:*&in=state:${stateFips}&in=county:${countyFips}`;
    console.log(`Census ACS URL: ${url}`);

    const res = await fetch(url);
    const responseText = await res.text();

    if (!res.ok) {
        console.error(`Census ACS error: HTTP ${res.status}, body: ${responseText.slice(0, 200)}`);
        return new Map();
    }

    let rows: string[][];
    try {
        rows = JSON.parse(responseText);
    } catch (err) {
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

    console.log(`Census ACS: ${incomeMap.size} block groups with income data`);
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
