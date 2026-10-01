import type { TaxJurisdiction } from '@/types';

const STATE_NAMES: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
    LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
    NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
    OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
    SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** Lower-cased full state name; accepts "TX" or "Texas". */
function normState(state: string | null | undefined): string {
    const s = (state ?? '').trim();
    return (STATE_NAMES[s.toUpperCase()] ?? s).toLowerCase();
}

/** Lower-cased county without a trailing "County" ("Dallas County" and "Dallas" match). */
function normCounty(county: string | null | undefined): string {
    return (county ?? '').trim().toLowerCase().replace(/\s+county$/, '');
}

function norm(v: string | null | undefined): string {
    return (v ?? '').trim().toLowerCase();
}

/**
 * The tax jurisdiction on file for a location: the city row for its state +
 * county, else the county-wide row (city null). Undefined when neither exists.
 */
export function findTaxJurisdiction(
    jurisdictions: TaxJurisdiction[],
    place: { state?: string | null; county?: string | null; city?: string | null },
): TaxJurisdiction | undefined {
    const state = normState(place.state);
    const county = normCounty(place.county);
    if (!state || !county) return undefined;
    const inCounty = jurisdictions.filter((j) => normState(j.state) === state && normCounty(j.county) === county);
    const city = norm(place.city);
    return (city ? inCounty.find((j) => norm(j.city) === city) : undefined) ?? inCounty.find((j) => !norm(j.city));
}

/** "Dallas, Dallas County, Texas" or "Dallas County, Texas" for a county-wide row. */
export function taxJurisdictionLabel(j: TaxJurisdiction): string {
    return [j.city, j.county, j.state].filter(Boolean).join(', ');
}
