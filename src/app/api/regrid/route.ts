import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { upstreamErrorResponse } from '@/app/api/_lib/upstream';
import { checkRecordBudget, logRegridUsage } from '@/app/api/_lib/regridUsage';
import { parseParcelResponse, mergeZoningData, type BuildingFootprint } from '@/app/api/_lib/regridParcel';

// Address lookup, then a point-lookup fallback (each capped at 25s).
export const maxDuration = 60;
import { z } from 'zod';

const BodySchema = z.object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    address: z.string().max(500).optional(),
    /** Skip the address lookup and use the coordinates (bulk refresh: exact, cheaper) */
    pointOnly: z.boolean().optional(),
    /** Max parcel records per lookup — Regrid bills every record returned */
    limit: z.number().int().min(1).max(50).optional(),
    /** For the usage log: a single parcel lookup, or the admin bulk refresh */
    purpose: z.enum(['lookup', 'refresh']).optional(),
    /** Owners/admins may go past the cycle's included records */
    allowOverage: z.boolean().optional(),
});

// Records per lookup unless the caller asks for fewer. A point or address can match
// many stacked records (condo units, business personal property); Regrid bills each.
const DEFAULT_RECORD_LIMIT = 10;

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

// ======================== Route Handler ========================

export async function POST(request: Request) {
    const { user, response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const raw = await request.json();
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }
        const { latitude, longitude, address, pointOnly } = parsed.data;
        const limit = String(parsed.data.limit ?? DEFAULT_RECORD_LIMIT);
        let recordsReturned = 0;
        const purpose = parsed.data.purpose ?? 'lookup';

        if (!REGRID_API_KEY) {
            return NextResponse.json(
                { error: 'REGRID_API_KEY must be configured in .env.local' },
                { status: 500 }
            );
        }

        const budget = await checkRecordBudget(user.id, Number(limit), parsed.data.allowOverage);
        if (budget.response) return budget.response;

        let allFeatures: any[] = [];
        let zoningFeatures: any[] = [];
        let buildingFeatures: any[] = [];

        // Strategy: try address lookup first (more accurate for specific sites)
        // then fall back to point lookup
        if (address && !pointOnly) {
            const addrUrl = new URL(`${REGRID_BASE}/parcels/address`);
            addrUrl.searchParams.set('query', address);
            addrUrl.searchParams.set('limit', limit);
            addrUrl.searchParams.set('token', REGRID_API_KEY);
            addrUrl.searchParams.set('return_field_labels', 'true');

            const addrRes = await fetch(addrUrl.toString(), {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(25_000),
            });

            if (addrRes.ok) {
                const addrData = await addrRes.json();
                allFeatures = addrData.parcels?.features || addrData.features || [];
                recordsReturned += allFeatures.length;
                zoningFeatures = addrData.zoning?.features || [];
                buildingFeatures = addrData.buildings?.features || [];
            }
        }

        // Fall back to point lookup if address returned nothing
        if (allFeatures.length === 0 && latitude && longitude) {
            const ptUrl = new URL(`${REGRID_BASE}/parcels/point`);
            ptUrl.searchParams.set('lat', String(latitude));
            ptUrl.searchParams.set('lon', String(longitude));
            ptUrl.searchParams.set('limit', limit);
            ptUrl.searchParams.set('token', REGRID_API_KEY);
            ptUrl.searchParams.set('return_field_labels', 'true');

            const ptRes = await fetch(ptUrl.toString(), {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(25_000),
            });

            if (ptRes.ok) {
                const ptData = await ptRes.json();
                allFeatures = ptData.parcels?.features || ptData.features || [];
                recordsReturned += allFeatures.length;
                zoningFeatures = ptData.zoning?.features || [];
                buildingFeatures = ptData.buildings?.features || [];
            }
        }

        logRegridUsage(purpose, recordsReturned, { address: address ?? null, latitude: latitude ?? null, longitude: longitude ?? null });

        if (allFeatures.length === 0) {
            return NextResponse.json({
                parcel: null,
                associatedRecords: [],
                recordsReturned,
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
            // Regrid bills per parcel record returned — surfaced for the bulk refresh
            recordsReturned,
        });
    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'Regrid', 'Parcel lookup failed');
    }
}
