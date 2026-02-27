/**
 * Test polygon-based GeoEnrichment for Tapestry segmentation.
 * Run: node scripts/test-tapestry-polygon.mjs
 */
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) process.env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
});

const CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;

const LAT = 32.7767;
const LNG = -96.7970;

async function getToken() {
    const res = await fetch('https://www.arcgis.com/sharing/rest/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', expiration: '60' }),
    });
    const data = await res.json();
    return data.access_token;
}

async function getServiceArea(token) {
    const now = new Date();
    const daysUntilTue = (2 - now.getDay() + 7) % 7 || 7;
    const tue = new Date(now);
    tue.setDate(now.getDate() + daysUntilTue);
    tue.setHours(8, 0, 0, 0);

    const params = new URLSearchParams({
        f: 'json', token,
        facilities: JSON.stringify({ features: [{ geometry: { x: LNG, y: LAT }, attributes: { Name: 'Origin', ObjectID: 1 } }], geometryType: 'esriGeometryPoint', spatialReference: { wkid: 4326 } }),
        defaultBreaks: '10',
        travelDirection: 'esriNATravelDirectionFromFacility',
        outputPolygons: 'esriNAOutputPolygonSimplified',  // Simplified to reduce vertex count
        timeOfDay: String(tue.getTime()),
        timeOfDayIsUTC: 'false',
        outSR: '4326',
    });

    const res = await fetch('https://route-api.arcgis.com/arcgis/rest/services/World/ServiceAreas/NAServer/ServiceArea_World/solveServiceArea', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data.saPolygons.features[0].geometry.rings;
}

async function testPolygonEnrichment(rings, token) {
    console.log(`\n=== Polygon Enrichment (${rings.length} rings, ${rings[0]?.length} vertices in ring 0) ===`);

    // Simplify: take every Nth vertex if too many
    const MAX_VERTICES = 500;
    const simplifiedRings = rings.map(ring => {
        if (ring.length <= MAX_VERTICES) return ring;
        const step = Math.ceil(ring.length / MAX_VERTICES);
        const simplified = ring.filter((_, i) => i % step === 0);
        // Ensure ring is closed
        if (simplified[0][0] !== simplified[simplified.length - 1][0] || simplified[0][1] !== simplified[simplified.length - 1][1]) {
            simplified.push(simplified[0]);
        }
        console.log(`  Simplified ring from ${ring.length} to ${simplified.length} vertices`);
        return simplified;
    });

    const studyAreas = JSON.stringify([{
        geometry: {
            rings: simplifiedRings,
            spatialReference: { wkid: 4326 },
        },
    }]);

    const params = new URLSearchParams({
        f: 'json', token,
        studyAreas,
        analysisVariables: JSON.stringify([
            'tapestry.TOP1CODE', 'tapestry.TOP1NAME', 'tapestry.TOP1VALUE', 'tapestry.TOP1PRC', 'tapestry.TOP1TYPE', 'tapestry.TOP1AGE',
            'tapestry.TOP2CODE', 'tapestry.TOP2NAME', 'tapestry.TOP2VALUE', 'tapestry.TOP2PRC', 'tapestry.TOP2TYPE', 'tapestry.TOP2AGE',
            'tapestry.TOP3CODE', 'tapestry.TOP3NAME', 'tapestry.TOP3VALUE', 'tapestry.TOP3PRC', 'tapestry.TOP3TYPE', 'tapestry.TOP3AGE',
            'AtRisk.TOTPOP_CY', 'AtRisk.TOTHH_CY',
        ]),
        returnGeometry: 'false',
    });

    const res = await fetch('https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
    const data = await res.json();

    if (data.error) {
        console.log('❌ Polygon error:', JSON.stringify(data.error, null, 2));
        return;
    }

    const features = data.results?.[0]?.value?.FeatureSet?.[0]?.features;
    if (!features || features.length === 0) {
        console.log('❌ No features returned');
        console.log('Full response (first 2000):', JSON.stringify(data, null, 2).substring(0, 2000));
        return;
    }

    const attrs = features[0].attributes;
    console.log('✅ Success! Results:');
    console.log(`  TOTPOP_CY: ${attrs.TOTPOP_CY}`);
    console.log(`  TOTHH_CY: ${attrs.TOTHH_CY}`);
    for (let i = 1; i <= 3; i++) {
        const name = attrs[`TOP${i}NAME`];
        const code = attrs[`TOP${i}CODE`];
        const pct = attrs[`TOP${i}PRC`];
        const value = attrs[`TOP${i}VALUE`];
        const type = attrs[`TOP${i}TYPE`];
        const age = attrs[`TOP${i}AGE`];
        console.log(`  #${i}: ${name || '(none)'} (${code}) — ${pct}% (${value} HH) — ${type} — Age ${age}`);
    }
}

(async () => {
    try {
        const token = await getToken();
        console.log('✅ Token obtained');

        const rings = await getServiceArea(token);
        console.log(`✅ Service area: ${rings.length} rings`);

        await testPolygonEnrichment(rings, token);
    } catch (err) {
        console.error('Fatal:', err);
    }
})();
