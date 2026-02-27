import { NextResponse } from 'next/server';

/**
 * POST /api/isochrone
 *
 * Generates a 15-minute drive-time isochrone polygon via ArcGIS Service Area API,
 * then enriches it with Tapestry Segmentation data via GeoEnrichment.
 *
 * Body: { latitude: number, longitude: number, breakMinutes?: number }
 * Returns: { polygon: GeoJSON, tapestry: TapestrySegment[], center: [lng, lat] }
 */

const CLIENT_ID = process.env.ARCGIS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET || '';

// ======================== Step 1: OAuth Token ========================

let cachedToken: { token: string; expires: number } | null = null;

async function getArcGISToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && Date.now() < cachedToken.expires - 60_000) {
        return cachedToken.token;
    }

    const res = await fetch('https://www.arcgis.com/sharing/rest/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
            expiration: '60', // 60 minutes
        }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
        throw new Error(`OAuth failed: ${data.error?.message || JSON.stringify(data)}`);
    }

    cachedToken = {
        token: data.access_token,
        expires: Date.now() + data.expires_in * 1000,
    };

    return cachedToken.token;
}

// ======================== Step 2: Service Area (Drive-Time Polygon) ========================

interface ServiceAreaResult {
    rings: number[][][]; // ArcGIS polygon rings [[[lng, lat], ...]]
    spatialReference: { wkid: number };
}

async function generateServiceArea(
    lat: number,
    lng: number,
    breakMinutes: number,
    token: string
): Promise<ServiceAreaResult> {
    // Tuesday 8:00 AM — next or most recent Tuesday
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 2=Tue
    const daysUntilTuesday = (2 - dayOfWeek + 7) % 7 || 7;
    const tuesday = new Date(now);
    tuesday.setDate(now.getDate() + daysUntilTuesday);
    tuesday.setHours(8, 0, 0, 0);
    const timeOfDay = tuesday.getTime();

    const facilities = JSON.stringify({
        features: [{
            geometry: { x: lng, y: lat },
            attributes: { Name: 'Origin', ObjectID: 1 },
        }],
        geometryType: 'esriGeometryPoint',
        spatialReference: { wkid: 4326 },
    });

    const params = new URLSearchParams({
        f: 'json',
        token,
        facilities,
        defaultBreaks: String(breakMinutes),
        travelDirection: 'esriNATravelDirectionFromFacility',
        outputPolygons: breakMinutes <= 15 ? 'esriNAOutputPolygonDetailed' : 'esriNAOutputPolygonSimplified',
        trimOuterPolygon: 'true',
        trimPolygonDistance: '100',
        trimPolygonDistanceUnits: 'esriMeters',
        timeOfDay: String(timeOfDay),
        timeOfDayIsUTC: 'false',
        travelMode: JSON.stringify({
            attributeParameterValues: [
                { parameterName: 'Restriction Usage', attributeName: 'Avoid Unpaved Roads', value: 'AVOID_MEDIUM' },
                { parameterName: 'Restriction Usage', attributeName: 'Through Traffic Prohibited', value: 'AVOID_HIGH' },
            ],
            description: 'Driving time',
            distanceAttributeName: 'Kilometers',
            id: 'FEgifRtFndKNcJMJ',
            impedanceAttributeName: 'TravelTime',
            name: 'Driving Time',
            simplificationTolerance: 10,
            simplificationToleranceUnits: 'esriMeters',
            timeAttributeName: 'TravelTime',
            type: 'AUTOMOBILE',
            useHierarchy: true,
            uturnAtJunctions: 'esriNFSBAtDeadEndsAndIntersections',
        }),
        outSR: '4326',
    });

    const res = await fetch(
        'https://route-api.arcgis.com/arcgis/rest/services/World/ServiceAreas/NAServer/ServiceArea_World/solveServiceArea',
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
    );

    const data = await res.json();

    if (data.error) {
        throw new Error(`Service Area error: ${JSON.stringify(data.error)}`);
    }

    const polygons = data.saPolygons?.features;
    if (!polygons || polygons.length === 0) {
        throw new Error('No service area polygons returned');
    }

    return {
        rings: polygons[0].geometry.rings,
        spatialReference: polygons[0].geometry.spatialReference || { wkid: 4326 },
    };
}

// ======================== Step 3: GeoEnrichment — Tapestry Segmentation ========================

interface TapestrySegment {
    rank: number;
    code: string;
    name: string;
    lifestyleGroup: string;
    medianAge: number | null;
    householdCount: number;
    householdPct: number;
}

interface TapestryResult {
    segments: TapestrySegment[];
    totalPopulation: number | null;
    totalHouseholds: number | null;
}

async function enrichWithTapestry(
    rings: number[][][],
    token: string
): Promise<TapestryResult> {
    // Simplify polygon to ≤500 vertices per ring to avoid API limits
    const MAX_VERTICES = 500;
    const simplifiedRings = rings.map((ring) => {
        if (ring.length <= MAX_VERTICES) return ring;
        const step = Math.ceil(ring.length / MAX_VERTICES);
        const simplified = ring.filter((_, i) => i % step === 0);
        // Ensure ring is closed
        const first = simplified[0];
        const last = simplified[simplified.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            simplified.push([...first]);
        }
        return simplified;
    });

    // Use the drive-time polygon as the study area
    const studyAreas = JSON.stringify([{
        geometry: {
            rings: simplifiedRings,
            spatialReference: { wkid: 4326 },
        },
    }]);

    const params = new URLSearchParams({
        f: 'json',
        token,
        studyAreas,
        analysisVariables: JSON.stringify([
            'tapestry.TOP1CODE', 'tapestry.TOP1NAME', 'tapestry.TOP1VALUE', 'tapestry.TOP1PRC', 'tapestry.TOP1TYPE', 'tapestry.TOP1AGE',
            'tapestry.TOP2CODE', 'tapestry.TOP2NAME', 'tapestry.TOP2VALUE', 'tapestry.TOP2PRC', 'tapestry.TOP2TYPE', 'tapestry.TOP2AGE',
            'tapestry.TOP3CODE', 'tapestry.TOP3NAME', 'tapestry.TOP3VALUE', 'tapestry.TOP3PRC', 'tapestry.TOP3TYPE', 'tapestry.TOP3AGE',
            'AtRisk.TOTPOP_CY', 'AtRisk.TOTHH_CY',
        ]),
        returnGeometry: 'false',
    });

    const res = await fetch(
        'https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich',
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
    );

    const data = await res.json();

    if (data.error) {
        console.error('GeoEnrichment Tapestry error:', JSON.stringify(data.error));
        return { segments: [], totalPopulation: null, totalHouseholds: null };
    }

    const results = data.results?.[0]?.value?.FeatureSet;
    if (!results || results.length === 0) {
        console.error('No GeoEnrichment results');
        return { segments: [], totalPopulation: null, totalHouseholds: null };
    }

    const features = results[0]?.features;
    if (!features || features.length === 0) {
        console.error('No GeoEnrichment features');
        return { segments: [], totalPopulation: null, totalHouseholds: null };
    }

    const attrs = features[0].attributes;
    const segments: TapestrySegment[] = [];

    // Parse TOP1, TOP2, TOP3 segments
    for (let i = 1; i <= 3; i++) {
        const code = attrs[`TOP${i}CODE`];
        const name = attrs[`TOP${i}NAME`];
        const value = attrs[`TOP${i}VALUE`];
        const pct = attrs[`TOP${i}PRC`];
        const type = attrs[`TOP${i}TYPE`];
        const age = attrs[`TOP${i}AGE`];

        if (name && name !== 'null' && name !== 'Unclassified') {
            segments.push({
                rank: i,
                code: code || 'N/A',
                name,
                lifestyleGroup: type || '',
                medianAge: age && age > 0 ? age : null,
                householdCount: value || 0,
                householdPct: pct || 0,
            });
        }
    }

    return {
        segments,
        totalPopulation: attrs.TOTPOP_CY ?? attrs.TOTPOP ?? null,
        totalHouseholds: attrs.TOTHH_CY ?? attrs.TOTHH ?? null,
    };
}

// ======================== Convert ArcGIS rings to GeoJSON ========================

function ringsToGeoJSON(rings: number[][][]): GeoJSON.Feature {
    // ArcGIS rings: [[[x, y], ...]] — outer ring CCW, holes CW
    // GeoJSON: coordinates same format but different winding convention
    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'Polygon',
            coordinates: rings.map((ring) =>
                ring.map(([x, y]) => [x, y])
            ),
        },
    };
}

// ======================== Route Handler ========================

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { latitude, longitude, breakMinutes = 15 } = body;

        if (!latitude || !longitude) {
            return NextResponse.json({ error: 'latitude and longitude are required' }, { status: 400 });
        }

        if (!CLIENT_ID || !CLIENT_SECRET) {
            return NextResponse.json(
                { error: 'ARCGIS_CLIENT_ID and ARCGIS_CLIENT_SECRET must be configured' },
                { status: 500 }
            );
        }

        // Step 1: Get token
        const token = await getArcGISToken();

        // Step 2: Generate drive-time polygon
        const serviceArea = await generateServiceArea(latitude, longitude, breakMinutes, token);

        // Step 3: Enrich with Tapestry (polygon-based for full drive-time area)
        const tapestryResult = await enrichWithTapestry(serviceArea.rings, token);

        // Convert to GeoJSON
        const polygon = ringsToGeoJSON(serviceArea.rings);

        return NextResponse.json({
            polygon,
            tapestry: tapestryResult.segments,
            totalPopulation: tapestryResult.totalPopulation,
            totalHouseholds: tapestryResult.totalHouseholds,
            center: [longitude, latitude],
            breakMinutes,
        });
    } catch (err: any) {
        console.error('Isochrone API error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
