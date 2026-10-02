import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { upstreamErrorResponse } from '@/app/api/_lib/upstream';
import { checkRecordBudget, logRegridUsage } from '@/app/api/_lib/regridUsage';
import { z } from 'zod';

const BodySchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusMeters: z.number().min(1).max(32000).default(200),
    excludeRegridIds: z.array(z.string()).default([]),
});

/**
 * POST /api/regrid/nearby
 *
 * Discovers parcels near a given lat/lng using Regrid's point+radius search.
 * Returns an array of simplified parcel records for assemblage selection.
 *
 * Body: { latitude: number, longitude: number, radiusMeters?: number, excludeRegridIds?: string[] }
 */

const REGRID_API_KEY = process.env.REGRID_API_KEY || '';
const REGRID_BASE = 'https://app.regrid.com/api/v2';
const NEARBY_RECORD_LIMIT = 50;

// Sentinel values that Regrid uses for missing data
const SENTINEL_VALUES = new Set([-5555, -9999, -1111, -9998, 5555, 9999]);

function num(v: any): number | null {
    if (v == null || v === '' || v === 'N/A') return null;
    const n = Number(v);
    if (isNaN(n) || SENTINEL_VALUES.has(n)) return null;
    return n;
}

function str(v: any): string | null {
    if (v == null || v === '' || v === 'N/A' || v === 'NONE') return null;
    return String(v).trim();
}

interface NearbyParcel {
    regridId: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    parcelNumber: string | null;
    ownerName: string | null;
    lotSizeSF: number | null;
    lotSizeAcres: number | null;
    landUse: string | null;
    zoningCode: string | null;
    zoningType: string | null;
    totalAssessedValue: number | null;
    landValue: number | null;
    improvementValue: number | null;
    yearBuilt: number | null;
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    geometry: any | null;
}

function isPersonalProperty(landUse: string | null): boolean {
    const u = (landUse ?? '').toUpperCase();
    return u.split(/[^A-Z]+/).includes('BPP') || u.includes('PERSONAL PROPERTY');
}

function parseNearbyParcel(feature: any): NearbyParcel {
    const props = feature.properties || {};
    // v2 nests the parcel columns under properties.fields (see regrid_schema.md)
    const p = props.fields || props;

    return {
        // Regrid's stable parcel id — the same id the primary parcel uses, so it can be excluded
        regridId: str(props.ll_uuid) || str(p.ll_uuid) || str(props.path) || feature.id?.toString() || null,
        // Situs (site) address only — never the owner's mailing address
        address: str(props.headline) || str(p.address) || null,
        city: str(p.scity) || str(p.city) || null,
        state: str(p.state2) || null,
        zip: str(p.szip) || str(p.szip5) || null,
        parcelNumber: str(p.parcelnumb) || str(p.parcelnumb_no_formatting) || str(p.alt_parcelnumb1) || null,
        ownerName: str(p.owner) || null,
        lotSizeSF: num(p.ll_gissqft) || num(p.ll_gisacre ? Number(p.ll_gisacre) * 43560 : null),
        lotSizeAcres: num(p.ll_gisacre) || (num(p.ll_gissqft) ? Number(p.ll_gissqft) / 43560 : null),
        landUse: str(p.usedesc) || str(p.usecode) || str(p.lbcs_activity_desc) || null,
        zoningCode: str(p.zoning) || str(p.zoning_id) || null,
        zoningType: str(p.zoning_type) || null,
        // County appraisal values: parval = total parcel value (land + improvements)
        totalAssessedValue: num(p.parval),
        landValue: num(p.landval),
        improvementValue: num(p.improvval),
        yearBuilt: num(p.yearbuilt),
        lastSalePrice: num(p.saleprice),
        lastSaleDate: str(p.saledate),
        geometry: feature.geometry || null,
    };
}

export async function POST(request: Request) {
    const { user, response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const raw = await request.json();
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }
        const { latitude, longitude, radiusMeters, excludeRegridIds } = parsed.data;

        if (!REGRID_API_KEY) {
            return NextResponse.json(
                { error: 'REGRID_API_KEY must be configured' },
                { status: 500 }
            );
        }

        const budget = await checkRecordBudget(user.id, NEARBY_RECORD_LIMIT);
        if (budget.response) return budget.response;

        // Use Regrid point+radius search
        const url = new URL(`${REGRID_BASE}/parcels/point`);
        url.searchParams.set('lat', String(latitude));
        url.searchParams.set('lon', String(longitude));
        url.searchParams.set('radius', String(Math.min(radiusMeters, 32000)));
        // Regrid bills every parcel record returned (2,000/month on our plan, then
        // $0.15 each), so keep this small — even though personal-property accounts
        // filtered out below still count toward it
        url.searchParams.set('limit', String(NEARBY_RECORD_LIMIT));
        url.searchParams.set('token', REGRID_API_KEY);
        url.searchParams.set('return_field_labels', 'true');

        const res = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error(`Regrid nearby error: HTTP ${res.status}`, errText.slice(0, 200));
            // Always 502: forwarding Regrid's 401/403 would look like our own
            // session expiring to the client.
            return NextResponse.json(
                { error: `Regrid API error: ${res.status}` },
                { status: 502 }
            );
        }

        const data = await res.json();
        const features = data.parcels?.features || data.features || [];
        logRegridUsage('nearby', features.length, { latitude, longitude, radiusMeters });

        // Parse and exclude the primary parcel
        const excludeSet = new Set(excludeRegridIds.map((id: string) => id?.toLowerCase()));

        const parcels: NearbyParcel[] = features
            .map((f: any) => parseNearbyParcel(f))
            .filter((p: NearbyParcel) => {
                // Exclude the primary parcel by regridId
                if (p.regridId && excludeSet.has(p.regridId.toLowerCase())) return false;
                // Business personal property accounts (furniture, equipment) aren't land —
                // the main parcel lookup drops them the same way
                if (isPersonalProperty(p.landUse)) return false;
                return true;
            });

        return NextResponse.json({
            parcels,
            totalFound: features.length,
        });
    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'Regrid nearby', 'Nearby parcel search failed');
    }
}
