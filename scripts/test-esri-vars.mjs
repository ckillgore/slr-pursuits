import { readFileSync } from 'fs';
const lines = readFileSync('.env.local', 'utf8').split(/\r?\n/);
const env = {};
lines.forEach(l => { const i = l.indexOf('='); if (i > 0 && !l.startsWith('#')) env[l.substring(0, i).trim()] = l.substring(i + 1).trim(); });

const k = env.ARCGIS_API_KEY;
const vars = [
    'tenure.OWNER_CY',
    'tenure.RENTER_CY',
    'tenure.TOTHU_CY',
    'vacancy.VACANT_CY',
    'housingbytype.TOTHU_CY',
    'ACSHousing.ACSTOTHU',
    'ACSHousing.ACSOWNER',
    'ACSHousing.ACSRENTER',
    'ACSHousing.ACSVACANT',
    'ACSRentCont.ACSMEDRENT',
    'ACSGrossRent.ACSMEDGRENT',
    'ACSRentVal.ACSMEDVAL',
];

const p = new URLSearchParams({
    studyAreas: JSON.stringify([{
        geometry: { x: -96.806, y: 32.789 },
        areaType: 'RingBuffer',
        bufferUnits: 'esriMiles',
        bufferRadii: [1],
    }]),
    analysisVariables: JSON.stringify(vars),
    returnGeometry: 'false',
    f: 'json',
    token: k,
});

const r = await fetch('https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/enrich?' + p);
const d = await r.json();
if (d.error) {
    console.log('ERR:', JSON.stringify(d.error));
} else {
    const a = d.results[0].value.FeatureSet[0].features[0].attributes;
    const skip = ['ID', 'OBJECTID', 'sourceCountry', 'areaType', 'bufferUnits', 'bufferUnitsAlias', 'bufferRadii', 'aggregationMethod', 'populationToPolygonSizeRating', 'apportionmentConfidence', 'HasData'];
    Object.entries(a).filter(([k]) => !skip.includes(k)).forEach(([k, v]) => console.log(k, '=', v));
}
