import { readFileSync } from 'fs';

// Load .env.local manually
const envContent = readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
        process.env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
    }
});

const CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;
const API_KEY = process.env.ARCGIS_API_KEY;

// Dallas coordinates
const LAT = 32.7767;
const LNG = -96.7970;

async function getOAuthToken() {
    const res = await fetch('https://www.arcgis.com/sharing/rest/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
            expiration: '60',
        }),
    });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    console.log('✅ OAuth token obtained');
    return data.access_token;
}

// Test 1: Simple point-based enrichment with tapestry (using API key)
async function testPointEnrichment() {
    console.log('\n=== Test 1: Point-based Tapestry (API Key) ===');

    const studyAreas = JSON.stringify([{
        geometry: { x: LNG, y: LAT },
    }]);

    const params = new URLSearchParams({
        f: 'json',
        token: API_KEY,
        studyAreas,
        dataCollections: JSON.stringify(['tapestry']),
        returnGeometry: 'false',
    });

    const res = await fetch(
        'https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich',
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
    );
    const data = await res.json();

    if (data.error) {
        console.log('❌ Error:', JSON.stringify(data.error, null, 2));
        return;
    }

    const results = data.results?.[0]?.value?.FeatureSet;
    if (!results) {
        console.log('❌ No results. Full response:', JSON.stringify(data, null, 2).substring(0, 2000));
        return;
    }

    const features = results[0]?.features;
    if (!features || features.length === 0) {
        console.log('❌ No features. FeatureSet:', JSON.stringify(results, null, 2).substring(0, 2000));
        return;
    }

    const attrs = features[0].attributes;
    console.log('✅ Got attributes. Keys:', Object.keys(attrs).length);

    // Print tapestry-related keys
    const tapestryKeys = Object.keys(attrs).filter(k =>
        k.toLowerCase().includes('tap') ||
        k.toLowerCase().includes('tseg') ||
        k.toLowerCase().includes('dom') ||
        k.toLowerCase().includes('life')
    );

    console.log('Tapestry-related keys:', tapestryKeys);
    tapestryKeys.forEach(k => console.log(`  ${k}: ${attrs[k]}`));

    // Print ALL keys if few
    if (Object.keys(attrs).length < 50) {
        console.log('\nAll attributes:');
        for (const [k, v] of Object.entries(attrs)) {
            console.log(`  ${k}: ${v}`);
        }
    }
}

// Test 2: OAuth token enrichment with tapestry
async function testOAuthEnrichment() {
    console.log('\n=== Test 2: Point-based Tapestry (OAuth Token) ===');

    const token = await getOAuthToken();

    const studyAreas = JSON.stringify([{
        geometry: { x: LNG, y: LAT },
    }]);

    const params = new URLSearchParams({
        f: 'json',
        token,
        studyAreas,
        dataCollections: JSON.stringify(['tapestry']),
        returnGeometry: 'false',
    });

    const res = await fetch(
        'https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich',
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
    );
    const data = await res.json();

    if (data.error) {
        console.log('❌ Error:', JSON.stringify(data.error, null, 2));
        return;
    }

    const results = data.results?.[0]?.value?.FeatureSet;
    if (!results || results.length === 0) {
        console.log('❌ No results. Full response (first 3000 chars):', JSON.stringify(data, null, 2).substring(0, 3000));
        return;
    }

    const features = results[0]?.features;
    if (!features || features.length === 0) {
        console.log('❌ No features');
        return;
    }

    const attrs = features[0].attributes;
    console.log('✅ Got attributes. Keys:', Object.keys(attrs).length);

    const tapestryKeys = Object.keys(attrs).filter(k =>
        k.toLowerCase().includes('tap') ||
        k.toLowerCase().includes('tseg') ||
        k.toLowerCase().includes('dom') ||
        k.toLowerCase().includes('life')
    );

    console.log('Tapestry-related keys:', tapestryKeys);
    tapestryKeys.forEach(k => console.log(`  ${k}: ${attrs[k]}`));

    if (Object.keys(attrs).length < 50) {
        console.log('\nAll attributes:');
        for (const [k, v] of Object.entries(attrs)) {
            console.log(`  ${k}: ${v}`);
        }
    } else {
        // Print first 30 keys
        const entries = Object.entries(attrs);
        console.log(`\nFirst 30 of ${entries.length} attributes:`);
        entries.slice(0, 30).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    }
}

// Test 3: List available data collections
async function testListCollections() {
    console.log('\n=== Test 3: List data collections ===');

    const res = await fetch(
        `https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/DataCollections/tapestry?f=json&token=${API_KEY}`
    );
    const data = await res.json();

    if (data.error) {
        console.log('❌ Collection "tapestry" not found. Error:', data.error.message);

        // Try listing all
        console.log('\nListing all collections...');
        const res2 = await fetch(
            `https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/DataCollections?f=json&token=${API_KEY}`
        );
        const data2 = await res2.json();

        if (data2.DataCollections) {
            const names = data2.DataCollections.map(c => c.dataCollectionID);
            const tapNames = names.filter(n => n.toLowerCase().includes('tap') || n.toLowerCase().includes('life') || n.toLowerCase().includes('seg'));
            console.log('Collections matching tapestry/lifestyle/segment:', tapNames);
            if (tapNames.length === 0) {
                console.log('No tapestry matches found. All collection names:');
                names.forEach(n => console.log(`  ${n}`));
            }
        }
    } else {
        console.log('✅ tapestry collection found');
        if (data.DataCollections?.[0]) {
            const vars = data.DataCollections[0].data?.map(v => `${v.id}: ${v.alias}`) || [];
            console.log('Variables (first 20):', vars.slice(0, 20));
        }
    }
}

// Run all tests
(async () => {
    try {
        await testListCollections();
        await testPointEnrichment();
        await testOAuthEnrichment();
    } catch (err) {
        console.error('Fatal error:', err);
    }
})();
