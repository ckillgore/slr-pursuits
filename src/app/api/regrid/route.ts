import { NextResponse } from 'next/server';

/**
 * POST /api/regrid
 *
 * Fetches parcel data from Regrid API by lat/lng AND address.
 * Returns a primary parcel (real property) plus all associated records.
 *
 * Body: { latitude: number, longitude: number, address?: string }
 */

const REGRID_API_KEY = process.env.REGRID_API_KEY || '';
const REGRID_BASE = 'https://app.regrid.com/api/v2';

// ======================== Types ========================

interface ParcelZoning {
    type: string | null;
    subtype: string | null;
    code: string | null;
    description: string | null;
    rawDescription: string | null;
    municipality: string | null;
    maxBuildingHeightFt: number | null;
    maxFAR: number | null;
    maxDensityPerAcre: number | null;
    maxCoveragePct: number | null;
    maxImperviousPct: number | null;
    minLotAreaSF: number | null;
    minLotWidthFt: number | null;
    minFrontSetbackFt: number | null;
    minRearSetbackFt: number | null;
    minSideSetbackFt: number | null;
    minLandscapedPct: number | null;
    minOpenSpacePct: number | null;
    permittedUses: string[];
    conditionalUses: string[];
    zoningCodeLink: string | null;
    zoningLastUpdated: string | null;
}

interface ParcelTax {
    totalValue: number | null;
    landValue: number | null;
    improvementValue: number | null;
    taxAmount: number | null;
    valuationType: string | null;
    assessedYear: string | null;
}

interface ParcelOwner {
    name: string | null;
    name2: string | null;
    mailingAddress: string | null;
    mailingCity: string | null;
    mailingState: string | null;
    mailingZip: string | null;
}

interface ParcelDetails {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    parcelNumber: string | null;
    altParcelNumber: string | null;
    lotSizeSF: number | null;
    lotSizeAcres: number | null;
    yearBuilt: number | null;
    useCode: string | null;
    useCodeDescription: string | null;
    legalDescription: string | null;
    landUse: string | null;
    buildingSF: number | null;
    numberOfUnits: number | null;
    numberOfBuildings: number | null;
    stories: number | null;
    // FEMA & Elevation
    femaNriRiskRating: string | null;
    highestElevation: number | null;
    lowestElevation: number | null;
    femaFloodZone: string | null;
    femaFloodZoneSubtype: string | null;
    // Growth & Trend (CAGR at Census Block Group via ESRI)
    populationDensity: number | null;
    populationGrowthPast5: number | null;
    populationGrowthNext5: number | null;
    housingGrowthPast5: number | null;
    housingGrowthNext5: number | null;
    householdIncomeGrowthNext5: number | null;
    medianHouseholdIncome: number | null;
    housingAffordabilityIndex: number | null;
    // Sale History
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    // Opportunity Zone & Census
    qualifiedOpportunityZone: string | null;
    censusTract: string | null;
    censusBlock: string | null;
    censusBlockGroup: string | null;
    censusSchoolDistrict: string | null;
    countyFips: string | null;
}

interface BuildingFootprint {
    footprintSF: number;
    geometry: any;
}

interface ParcelRecord {
    details: ParcelDetails;
    zoning: ParcelZoning;
    tax: ParcelTax;
    owner: ParcelOwner;
    geometry: any | null;
    regridId: string | null;
    dataDate: string | null;
    recordType: 'real_property' | 'personal_property' | 'unknown';
}

// ======================== Helpers ========================

const SENTINEL_VALUES = new Set([-5555, -9999, -1111, -9998, 5555, 9999]);

const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '' || v === 'null') return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    if (SENTINEL_VALUES.has(n)) return null;
    return n;
};

const str = (v: any): string | null => {
    if (v === null || v === undefined || v === '' || v === 'null') return null;
    return String(v);
};

function classifyRecordType(fields: any): 'real_property' | 'personal_property' | 'unknown' {
    const usedesc = (str(fields.usedesc) || '').toUpperCase();
    if (usedesc.includes('BPP') || usedesc.includes('PERSONAL PROPERTY')) {
        return 'personal_property';
    }
    // Real property indicators
    if (num(fields.landval) && num(fields.landval)! > 0) return 'real_property';
    if (usedesc.includes('COMMERCIAL IMPROVEMENT') || usedesc.includes('SFR') || usedesc.includes('MFR')) return 'real_property';
    if (usedesc.includes('VACANT')) return 'real_property';
    return 'unknown';
}

// ======================== Parse Parcel Feature ========================

function parseParcelResponse(feature: any): ParcelRecord {
    const props = feature.properties || {};
    const fields = props.fields || {};
    const geom = feature.geometry || null;
    const recordType = classifyRecordType(fields);

    return {
        details: {
            address: str(props.headline) || str(fields.address) || str(fields.mailadd),
            city: str(fields.scity) || str(fields.city),
            state: str(fields.state2) || str(fields.state),
            zip: str(fields.szip) || str(fields.zip),
            county: str(fields.county),
            parcelNumber: str(fields.parcelnumb) || str(fields.parcelnumb_no_formatting),
            altParcelNumber: str(fields.alt_parcelnumb1),
            lotSizeSF: num(fields.ll_gissqft) || num(fields.sqft),
            lotSizeAcres: num(fields.ll_gisacre) || num(fields.gisacre),
            yearBuilt: num(fields.yearbuilt),
            useCode: str(fields.usecode),
            useCodeDescription: str(fields.usedesc),
            legalDescription: str(fields.legaldesc),
            landUse: str(fields.landuse) || str(fields.lbcs_activity_desc),
            buildingSF: num(fields.improvarea) || num(fields.structarea) || num(fields.building_sq_ft) || num(fields.ll_bldg_footprint_sqft),
            numberOfUnits: num(fields.noofunits) || num(fields.units),
            numberOfBuildings: num(fields.noofbldgs) || num(fields.ll_bldg_count),
            stories: num(fields.numstories) || num(fields.stories),
            femaNriRiskRating: str(fields.fema_nri_risk_rating),
            femaFloodZone: str(fields.fema_flood_zone),
            femaFloodZoneSubtype: str(fields.fema_flood_zone_subtype),
            highestElevation: num(fields.highest_parcel_elevation),
            lowestElevation: num(fields.lowest_parcel_elevation),
            // Growth & Trend (block-group level)
            populationDensity: num(fields.population_density),
            populationGrowthPast5: num(fields.population_growth_past_5_years),
            populationGrowthNext5: num(fields.population_growth_next_5_years),
            housingGrowthPast5: num(fields.housing_growth_past_5_years),
            housingGrowthNext5: num(fields.housing_growth_next_5_years),
            householdIncomeGrowthNext5: num(fields.household_income_growth_next_5_years),
            medianHouseholdIncome: num(fields.median_household_income),
            housingAffordabilityIndex: num(fields.housing_affordability_index),
            // Sale History
            lastSalePrice: num(fields.saleprice),
            lastSaleDate: str(fields.saledate),
            qualifiedOpportunityZone: str(fields.qoz),
            censusTract: str(fields.census_tract),
            censusBlock: str(fields.census_block),
            censusBlockGroup: str(fields.census_blockgroup),
            censusSchoolDistrict: str(fields.census_unified_school_district),
            countyFips: str(fields.geoid),
        },
        zoning: {
            type: str(fields.zoning_type),
            subtype: str(fields.zoning_subtype),
            code: str(fields.zoning) || str(fields.zoning_id),
            description: str(fields.zoning_description),
            rawDescription: null,
            municipality: null,
            maxBuildingHeightFt: null,
            maxFAR: null,
            maxDensityPerAcre: null,
            maxCoveragePct: null,
            maxImperviousPct: null,
            minLotAreaSF: null,
            minLotWidthFt: null,
            minFrontSetbackFt: null,
            minRearSetbackFt: null,
            minSideSetbackFt: null,
            minLandscapedPct: null,
            minOpenSpacePct: null,
            permittedUses: [],
            conditionalUses: [],
            zoningCodeLink: null,
            zoningLastUpdated: null,
        },
        tax: {
            totalValue: num(fields.parval),
            landValue: num(fields.landval),
            improvementValue: num(fields.improvval),
            taxAmount: num(fields.taxamt),
            valuationType: str(fields.parvaltype),
            assessedYear: str(fields.taxyear) || str(fields.assessyear),
        },
        owner: {
            name: str(fields.owner) || str(fields.eo_owner),
            name2: str(fields.owner2) || str(fields.eo_owner2),
            mailingAddress: str(fields.mailadd) || str(fields.mail_addra),
            mailingCity: str(fields.mail_city),
            mailingState: str(fields.mail_state2),
            mailingZip: str(fields.mail_zip),
        },
        geometry: geom,
        regridId: str(props.ll_uuid) || str(props.path),
        dataDate: str(fields.sourcedate) || str(fields.ll_updated_at),
        recordType,
    };
}

// ======================== Merge Zoning Development Data ========================

function mergeZoningData(parcel: ParcelRecord, zoningFeatures: any[]): void {
    if (zoningFeatures.length === 0) return;
    const zp = zoningFeatures[0].properties || {};

    if (str(zp.zoning_type)) parcel.zoning.type = str(zp.zoning_type);
    if (str(zp.zoning_subtype)) parcel.zoning.subtype = str(zp.zoning_subtype);
    if (str(zp.zoning_description)) parcel.zoning.description = str(zp.zoning_description);

    if (str(zp.zoning)) {
        parcel.zoning.code = str(zp.zoning);
    } else if (str(zp.zoning_code)) {
        parcel.zoning.code = str(zp.zoning_code);
    }

    parcel.zoning.maxBuildingHeightFt = num(zp.max_building_height_ft);
    parcel.zoning.maxFAR = num(zp.max_far);
    parcel.zoning.maxDensityPerAcre = num(zp.max_density_du_per_acre);
    parcel.zoning.maxCoveragePct = num(zp.max_coverage_pct);
    parcel.zoning.maxImperviousPct = num(zp.max_impervious_coverage_pct);
    parcel.zoning.minLotAreaSF = num(zp.min_lot_area_sq_ft);
    parcel.zoning.minLotWidthFt = num(zp.min_lot_width_ft);
    parcel.zoning.minFrontSetbackFt = num(zp.min_front_setback_ft);
    parcel.zoning.minRearSetbackFt = num(zp.min_rear_setback_ft);
    parcel.zoning.minSideSetbackFt = num(zp.min_side_setback_ft);
    parcel.zoning.minLandscapedPct = num(zp.min_landscaped_space_pct);
    parcel.zoning.minOpenSpacePct = num(zp.min_open_space_pct);
    parcel.zoning.zoningCodeLink = str(zp.zoning_code_link);
    parcel.zoning.rawDescription = str(zp.zoning_raw_description);
    parcel.zoning.municipality = str(zp.municipality);
    parcel.zoning.zoningLastUpdated = str(zp.zoneomics_updated_at);

    const uses = zp.permitted_land_uses;
    if (uses && typeof uses === 'object') {
        const allUses: string[] = [];
        for (const category of Object.keys(uses)) {
            const items = uses[category];
            if (Array.isArray(items)) {
                items.forEach((u: string) => allUses.push(u));
            }
        }
        parcel.zoning.permittedUses = allUses.slice(0, 30);
    }

    // Conditional / special permitted uses
    const condUses = zp.conditional_land_uses;
    if (condUses && typeof condUses === 'string') {
        parcel.zoning.conditionalUses = condUses.split('|').map((u: string) => u.trim()).filter(Boolean);
    } else if (condUses && typeof condUses === 'object') {
        const allCond: string[] = [];
        for (const category of Object.keys(condUses)) {
            const items = condUses[category];
            if (Array.isArray(items)) {
                items.forEach((u: string) => allCond.push(u));
            }
        }
        parcel.zoning.conditionalUses = allCond.slice(0, 30);
    }
}

// ======================== Route Handler ========================

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { latitude, longitude, address } = body;

        if (!REGRID_API_KEY) {
            return NextResponse.json(
                { error: 'REGRID_API_KEY must be configured in .env.local' },
                { status: 500 }
            );
        }

        let allFeatures: any[] = [];
        let zoningFeatures: any[] = [];
        let buildingFeatures: any[] = [];

        // Strategy: try address lookup first (more accurate for specific sites)
        // then fall back to point lookup
        if (address) {
            const addrUrl = new URL(`${REGRID_BASE}/parcels/address`);
            addrUrl.searchParams.set('query', address);
            addrUrl.searchParams.set('token', REGRID_API_KEY);
            addrUrl.searchParams.set('return_field_labels', 'true');

            const addrRes = await fetch(addrUrl.toString(), {
                headers: { 'Accept': 'application/json' },
            });

            if (addrRes.ok) {
                const addrData = await addrRes.json();
                allFeatures = addrData.parcels?.features || addrData.features || [];
                zoningFeatures = addrData.zoning?.features || [];
                buildingFeatures = addrData.buildings?.features || [];
            }
        }

        // Fall back to point lookup if address returned nothing
        if (allFeatures.length === 0 && latitude && longitude) {
            const ptUrl = new URL(`${REGRID_BASE}/parcels/point`);
            ptUrl.searchParams.set('lat', String(latitude));
            ptUrl.searchParams.set('lon', String(longitude));
            ptUrl.searchParams.set('token', REGRID_API_KEY);
            ptUrl.searchParams.set('return_field_labels', 'true');

            const ptRes = await fetch(ptUrl.toString(), {
                headers: { 'Accept': 'application/json' },
            });

            if (ptRes.ok) {
                const ptData = await ptRes.json();
                allFeatures = ptData.parcels?.features || ptData.features || [];
                zoningFeatures = ptData.zoning?.features || [];
                buildingFeatures = ptData.buildings?.features || [];
            }
        }

        if (allFeatures.length === 0) {
            return NextResponse.json({
                parcel: null,
                associatedRecords: [],
                message: 'No parcel found at this location',
            });
        }

        // Parse all records and classify them
        const allRecords = allFeatures.map(f => parseParcelResponse(f));

        // Find the primary (real property with highest land value or total value)
        const realProperty = allRecords
            .filter(r => r.recordType === 'real_property' || r.recordType === 'unknown')
            .sort((a, b) => {
                // Prefer highest total assessed value among real property records
                const aVal = (a.tax.totalValue || 0);
                const bVal = (b.tax.totalValue || 0);
                return bVal - aVal;
            });

        const personalProperty = allRecords.filter(r => r.recordType === 'personal_property');

        // Primary = highest-value real property record
        const primary = realProperty[0] || allRecords[0];

        // Merge zoning from the zoning layer
        mergeZoningData(primary, zoningFeatures);

        // Additional real property records (other improvements on same site)
        const otherRealRecords = realProperty.slice(1);

        // Build summary of all tax records at this address
        const taxSummary = {
            totalRealPropertyValue: realProperty.reduce((sum, r) => sum + (r.tax.totalValue || 0), 0),
            totalLandValue: realProperty.reduce((sum, r) => sum + (r.tax.landValue || 0), 0),
            totalImprovementValue: realProperty.reduce((sum, r) => sum + (r.tax.improvementValue || 0), 0),
            totalPersonalPropertyValue: personalProperty.reduce((sum, r) => sum + (r.tax.totalValue || 0), 0),
            realPropertyCount: realProperty.length,
            personalPropertyCount: personalProperty.length,
        };

        // Extract building footprints
        const buildings: BuildingFootprint[] = buildingFeatures
            .filter((f: any) => f.geometry && f.properties?.ed_bldg_footprint_sqft)
            .map((f: any) => ({
                footprintSF: Math.round(f.properties.ed_bldg_footprint_sqft || 0),
                geometry: f.geometry,
            }));

        return NextResponse.json({
            parcel: primary,
            associatedRecords: [
                ...otherRealRecords.map(r => ({ ...r, geometry: null })),
                ...personalProperty.map(r => ({ ...r, geometry: null })),
            ],
            taxSummary,
            buildings,
        });
    } catch (err: any) {
        console.error('Regrid route error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
