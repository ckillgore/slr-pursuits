import { NextResponse } from 'next/server';

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

function parseNearbyParcel(feature: any): NearbyParcel {
    const p = feature.properties?.fields || feature.properties || {};

    return {
        regridId: str(p.parcelnumb_no_formatting) || str(p.parcelnumb) || feature.id?.toString() || null,
        address: str(p.address) || str(p.mail_addno && p.mail_addpre && p.mail_addstr ? `${p.mail_addno} ${p.mail_addpre} ${p.mail_addstr}`.trim() : null) || null,
        city: str(p.situs_city) || str(p.scity) || str(p.mail_city) || null,
        state: str(p.situs_state) || str(p.state2) || str(p.mail_state2) || null,
        zip: str(p.situs_zip) || str(p.szip) || str(p.mail_zip) || null,
        parcelNumber: str(p.parcelnumb) || str(p.alt_parcelnumb) || null,
        ownerName: str(p.owner) || null,
        lotSizeSF: num(p.ll_gissqft) || num(p.ll_gisacre ? Number(p.ll_gisacre) * 43560 : null),
        lotSizeAcres: num(p.ll_gisacre) || (num(p.ll_gissqft) ? Number(p.ll_gissqft) / 43560 : null),
        landUse: str(p.usedesc) || str(p.usecode) || null,
        zoningCode: str(p.zoning) || str(p.zoning_id) || null,
        zoningType: str(p.zoning_type) || null,
        totalAssessedValue: num(p.assdttlval) || num(p.mktttlval) || null,
        landValue: num(p.assdlandval) || num(p.mktlandval) || null,
        improvementValue: num(p.assdimpval) || num(p.mktimpval) || null,
        yearBuilt: num(p.year_built) || num(p.yearbuilt) || null,
        lastSalePrice: num(p.saleprice) || null,
        lastSaleDate: str(p.saledate) || null,
        geometry: feature.geometry || null,
    };
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { latitude, longitude, radiusMeters = 200, excludeRegridIds = [] } = body;

        if (!REGRID_API_KEY) {
            return NextResponse.json(
                { error: 'REGRID_API_KEY must be configured' },
                { status: 500 }
            );
        }

        if (!latitude || !longitude) {
            return NextResponse.json(
                { error: 'latitude and longitude are required' },
                { status: 400 }
            );
        }

        // Use Regrid point+radius search
        const url = new URL(`${REGRID_BASE}/parcels/point`);
        url.searchParams.set('lat', String(latitude));
        url.searchParams.set('lon', String(longitude));
        url.searchParams.set('radius', String(Math.min(radiusMeters, 32000)));
        url.searchParams.set('limit', '50');
        url.searchParams.set('token', REGRID_API_KEY);
        url.searchParams.set('return_field_labels', 'true');

        console.log(`Regrid nearby search: ${latitude},${longitude} r=${radiusMeters}m`);

        const res = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error(`Regrid nearby error: HTTP ${res.status}`, errText.slice(0, 200));
            return NextResponse.json(
                { error: `Regrid API error: ${res.status}` },
                { status: res.status }
            );
        }

        const data = await res.json();
        const features = data.parcels?.features || data.features || [];

        // Parse and exclude the primary parcel
        const excludeSet = new Set(excludeRegridIds.map((id: string) => id?.toLowerCase()));

        const parcels: NearbyParcel[] = features
            .map((f: any) => parseNearbyParcel(f))
            .filter((p: NearbyParcel) => {
                // Exclude the primary parcel by regridId
                if (p.regridId && excludeSet.has(p.regridId.toLowerCase())) return false;
                return true;
            });

        console.log(`  → ${features.length} raw features, ${parcels.length} after exclusions`);

        return NextResponse.json({
            parcels,
            totalFound: features.length,
        });
    } catch (err: any) {
        console.error('Regrid nearby error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal error' },
            { status: 500 }
        );
    }
}
