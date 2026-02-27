/**
 * Quick diagnostic script to test ESRI GeoEnrichment auth.
 * Run: node scripts/test-esri.mjs
 */

import { readFileSync } from 'fs';

// Parse .env.local manually
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.ARCGIS_API_KEY || '';
const CLIENT_ID = env.ARCGIS_CLIENT_ID || '';
const CLIENT_SECRET = env.ARCGIS_CLIENT_SECRET || '';

const TEST_LAT = 32.789;
const TEST_LNG = -96.806;

console.log('=== ESRI GeoEnrichment Diagnostic ===\n');
console.log('API Key present:', API_KEY ? `Yes (${API_KEY.substring(0, 12)}...)` : 'No');
console.log('Client ID present:', CLIENT_ID ? `Yes (${CLIENT_ID.substring(0, 12)}...)` : 'No');
console.log('Client Secret present:', CLIENT_SECRET ? 'Yes' : 'No');
console.log('');

// Test 1: Direct API Key
if (API_KEY) {
    console.log('--- Test 1: Direct API Key ---');
    try {
        const params = new URLSearchParams({
            studyAreas: JSON.stringify([{
                geometry: { x: TEST_LNG, y: TEST_LAT },
                areaType: 'RingBuffer',
                bufferUnits: 'esriMiles',
                bufferRadii: [1],
            }]),
            analysisVariables: JSON.stringify(['KeyGlobalFacts.TOTPOP']),
            returnGeometry: 'false',
            f: 'json',
            token: API_KEY,
        });

        const res = await fetch(`https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/enrich?${params}`);
        const data = await res.json();

        if (data.error) {
            console.log('FAILED:', JSON.stringify(data.error, null, 2));
        } else if (data.results?.[0]?.value?.FeatureSet?.[0]?.features?.length > 0) {
            const pop = data.results[0].value.FeatureSet[0].features[0].attributes.TOTPOP;
            console.log('SUCCESS! Population (1mi):', pop);
        } else {
            console.log('Response (unexpected):', JSON.stringify(data).substring(0, 500));
        }
    } catch (err) {
        console.log('Error:', err.message);
    }
    console.log('');
}

// Test 2: OAuth2 Client Credentials
if (CLIENT_ID && CLIENT_SECRET) {
    console.log('--- Test 2: OAuth2 Client Credentials ---');
    try {
        const tokenParams = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
        });

        const tokenRes = await fetch('https://www.arcgis.com/sharing/rest/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString(),
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            console.log('Token exchange FAILED:', JSON.stringify(tokenData.error, null, 2));
        } else {
            console.log('Token obtained! Expires in:', tokenData.expires_in, 'seconds');
            const token = tokenData.access_token;

            const params = new URLSearchParams({
                studyAreas: JSON.stringify([{
                    geometry: { x: TEST_LNG, y: TEST_LAT },
                    areaType: 'RingBuffer',
                    bufferUnits: 'esriMiles',
                    bufferRadii: [1],
                }]),
                analysisVariables: JSON.stringify(['KeyGlobalFacts.TOTPOP']),
                returnGeometry: 'false',
                f: 'json',
                token: token,
            });

            const res = await fetch(`https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/enrich?${params}`);
            const data = await res.json();

            if (data.error) {
                console.log('GeoEnrichment FAILED:', JSON.stringify(data.error, null, 2));
            } else if (data.results?.[0]?.value?.FeatureSet?.[0]?.features?.length > 0) {
                const pop = data.results[0].value.FeatureSet[0].features[0].attributes.TOTPOP;
                console.log('SUCCESS! Population (1mi):', pop);
            } else {
                console.log('Response (unexpected):', JSON.stringify(data).substring(0, 500));
            }
        }
    } catch (err) {
        console.log('Error:', err.message);
    }
}

console.log('\n=== Done ===');
