import { NextResponse } from 'next/server';

/**
 * POST /api/demographics
 * Two-source demographics:
 * 1. Geocodio — Census block group level (immediate neighborhood)
 * 2. ESRI ArcGIS GeoEnrichment — 1, 3, 5 mile ring analysis
 *
 * Expects { latitude, longitude } or { address } in the body.
 */

const GEOCODIO_KEY = process.env.GEOCODIO_API_KEY || '';
const ARCGIS_API_KEY = process.env.ARCGIS_API_KEY || '';

// ===================== Geocodio (block group) =====================

async function fetchGeocodio(latitude: number, longitude: number) {
    if (!GEOCODIO_KEY) return null;

    try {
        const url = `https://api.geocod.io/v1.7/reverse?q=${latitude},${longitude}&fields=acs-demographics,acs-economics,acs-housing&api_key=${GEOCODIO_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok || !data.results?.[0]) return null;

        const result = data.results[0];
        const fields = result.fields || {};
        const acs = fields.acs || {};
        const dem = acs.demographics || {};
        const econ = acs.economics || {};
        const housing = acs.housing || {};

        return {
            population: dem['Population by age range']?.Total?.value ?? dem['Sex']?.Total?.value ?? null,
            median_age: dem['Median age']?.Total?.value ?? null,
            median_household_income: econ['Median household income']?.Total?.value ?? null,
            per_capita_income: econ['Per capita income']?.Total?.value ?? null,
            number_of_households: econ['Number of households']?.Total?.value ?? null,
            total_housing_units: housing['Number of housing units']?.Total?.value ?? null,
            median_home_value: housing['Median value of owner-occupied housing units']?.Total?.value ?? null,
            vacancy_rate_pct: housing['Occupancy status']?.Vacant?.percentage != null
                ? +(housing['Occupancy status'].Vacant.percentage * 100).toFixed(1) : null,
            owner_occupied_pct: housing['Ownership of occupied units']?.['Owner occupied']?.percentage != null
                ? +(housing['Ownership of occupied units']['Owner occupied'].percentage * 100).toFixed(1) : null,
            renter_occupied_pct: housing['Ownership of occupied units']?.['Renter occupied']?.percentage != null
                ? +(housing['Ownership of occupied units']['Renter occupied'].percentage * 100).toFixed(1) : null,
            median_rent: housing['Median gross rent']?.Total?.value ?? housing['Median contract rent']?.Total?.value ?? null,
            race_white_pct: dem['Race and ethnicity']?.['Not Hispanic or Latino: White alone']?.percentage != null
                ? +(dem['Race and ethnicity']['Not Hispanic or Latino: White alone'].percentage * 100).toFixed(1) : null,
            race_black_pct: dem['Race and ethnicity']?.['Not Hispanic or Latino: Black or African American alone']?.percentage != null
                ? +(dem['Race and ethnicity']['Not Hispanic or Latino: Black or African American alone'].percentage * 100).toFixed(1) : null,
            race_hispanic_pct: dem['Race and ethnicity']?.['Hispanic or Latino']?.percentage != null
                ? +(dem['Race and ethnicity']['Hispanic or Latino'].percentage * 100).toFixed(1) : null,
            race_asian_pct: dem['Race and ethnicity']?.['Not Hispanic or Latino: Asian alone']?.percentage != null
                ? +(dem['Race and ethnicity']['Not Hispanic or Latino: Asian alone'].percentage * 100).toFixed(1) : null,
            _survey_years: acs.meta?.survey_years ?? null,
            _geography: dem.meta?.geography ?? econ.meta?.geography ?? null,
            _formatted_address: result.formatted_address ?? null,
        };
    } catch (err) {
        console.error('Geocodio error:', err);
        return null;
    }
}

// ===================== ESRI GeoEnrichment (1/3/5 mi rings) =====================

const ESRI_VARIABLES = [
    // Population & Demographics (from ArcGIS reference)
    'AtRisk.TOTPOP_CY',                   // Total Population (current)
    'AtRisk.TOTHH_CY',                    // Total Households (current)
    'AtRisk.AVGHHSZ_CY',                  // Average Household Size (current)
    '5yearincrements.MEDAGE_CY',          // Median Age
    'populationtotals.POPDENS_CY',        // Population Density
    // Income
    'householdincome.MEDHINC_CY',         // Median Household Income
    'householdincome.AVGHINC_CY',         // Average Household Income
    'householdincome.PCI_CY',             // Per Capita Income
    // Housing
    'homevalue.MEDVAL_CY',                // Median Home Value
    'housingcosts.MEDCRNT_CY',            // Median Contract Rent
    'HistoricalHousing.TOTHU_CY',         // Total Housing Units (current)
    'KeyUSFacts.OWNER_CY',               // Owner Occupied HUs
    'KeyUSFacts.RENTER_CY',              // Renter Occupied HUs
    'KeyUSFacts.VACANT_CY',              // Vacant Housing Units
];

interface RingData {
    population: number | null;
    total_households: number | null;
    avg_household_size: number | null;
    median_household_income: number | null;
    avg_household_income: number | null;
    per_capita_income: number | null;
    median_age: number | null;
    population_density: number | null;
    total_housing_units: number | null;
    owner_occupied: number | null;
    renter_occupied: number | null;
    vacant_units: number | null;
    owner_pct: number | null;
    renter_pct: number | null;
    vacancy_rate_pct: number | null;
    median_home_value: number | null;
    median_rent: number | null;
}

function parseRingResult(attrs: Record<string, any>): RingData {
    const hu = attrs.TOTHU_CY ?? null;
    const owner = attrs.OWNER_CY ?? null;
    const renter = attrs.RENTER_CY ?? null;
    const vacant = attrs.VACANT_CY ?? null;
    const occupied = (owner ?? 0) + (renter ?? 0);

    return {
        population: attrs.TOTPOP_CY ?? null,
        total_households: attrs.TOTHH_CY ?? null,
        avg_household_size: attrs.AVGHHSZ_CY ?? null,
        median_household_income: attrs.MEDHINC_CY ?? null,
        avg_household_income: attrs.AVGHINC_CY ?? null,
        per_capita_income: attrs.PCI_CY ?? null,
        median_age: attrs.MEDAGE_CY ?? null,
        population_density: attrs.POPDENS_CY ?? null,
        total_housing_units: hu,
        owner_occupied: owner,
        renter_occupied: renter,
        vacant_units: vacant,
        owner_pct: occupied > 0 && owner != null ? +((owner / occupied) * 100).toFixed(1) : null,
        renter_pct: occupied > 0 && renter != null ? +((renter / occupied) * 100).toFixed(1) : null,
        vacancy_rate_pct: hu != null && hu > 0 && vacant != null ? +((vacant / hu) * 100).toFixed(1) : null,
        median_home_value: attrs.MEDVAL_CY ?? null,
        median_rent: attrs.MEDCRNT_CY ?? null,
    };
}

async function fetchEsriRings(latitude: number, longitude: number) {
    if (!ARCGIS_API_KEY) return null;

    try {
        const params = new URLSearchParams({
            studyAreas: JSON.stringify([{
                geometry: { x: longitude, y: latitude },
                areaType: 'RingBuffer',
                bufferUnits: 'esriMiles',
                bufferRadii: [1, 3, 5],
            }]),
            analysisVariables: JSON.stringify(ESRI_VARIABLES),
            returnGeometry: 'false',
            f: 'json',
            token: ARCGIS_API_KEY,
        });

        const res = await fetch(
            `https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/enrich?${params}`,
            { method: 'GET' }
        );

        const data = await res.json();

        if (data.error) {
            console.error('ESRI GeoEnrichment error:', JSON.stringify(data.error));
            return null;
        }

        const features = data.results?.[0]?.value?.FeatureSet?.[0]?.features;
        if (!features || features.length === 0) return null;

        const rings: Record<string, RingData> = {};
        const radii = [1, 3, 5];
        features.forEach((f: any, i: number) => {
            const radius = radii[i] || (i + 1);
            rings[`${radius}mi`] = parseRingResult(f.attributes || {});
        });

        return rings;
    } catch (err) {
        console.error('ESRI GeoEnrichment error:', err);
        return null;
    }
}

// ===================== Combined endpoint =====================

export async function POST(request: Request) {
    try {
        const body = await request.json();
        let { latitude, longitude } = body;
        const { address } = body;

        if (latitude == null || longitude == null) {
            if (!address) {
                return NextResponse.json({ error: 'Provide latitude/longitude or address' }, { status: 400 });
            }
            if (GEOCODIO_KEY) {
                const geoRes = await fetch(
                    `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(address)}&api_key=${GEOCODIO_KEY}`
                );
                const geoData = await geoRes.json();
                const loc = geoData.results?.[0]?.location;
                if (loc) {
                    latitude = loc.lat;
                    longitude = loc.lng;
                }
            }
            if (latitude == null || longitude == null) {
                return NextResponse.json({ error: 'Cannot geocode address. Provide latitude/longitude.' }, { status: 400 });
            }
        }

        // Run both in parallel
        const [blockGroup, rings] = await Promise.all([
            fetchGeocodio(latitude, longitude),
            fetchEsriRings(latitude, longitude),
        ]);

        const demographics = {
            block_group: blockGroup,
            rings,
            _source: {
                block_group: blockGroup ? 'geocodio' : null,
                rings: rings ? 'esri_geoenrichment' : null,
            },
            _location: { lat: latitude, lng: longitude },
        };

        return NextResponse.json({ demographics });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Demographics API error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
