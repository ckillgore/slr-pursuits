import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { upstreamErrorResponse } from '@/app/api/_lib/upstream';

const REGRID_API_KEY = process.env.REGRID_API_KEY || '';

/**
 * GET /api/explore?z={z}&x={x}&y={y}
 *
 * Proxies Regrid MVT vector tile requests to keep the API key server-side.
 * Returns raw MVT binary tile containing parcel boundaries + lightweight fields.
 */

// Fields to include in MVT tiles for hover tooltips
const MVT_FIELDS = [
    'parcelnumb', 'address', 'owner', 'usedesc', 'zoning', 'zoning_type',
    'll_gisacre', 'll_gissqft', 'parval', 'yearbuilt', 'scity', 'state2', 'szip5',
    'landval', 'saleprice', 'saledate',
].join(',');

export async function GET(request: Request) {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const z = searchParams.get('z');
        const x = searchParams.get('x');
        const y = searchParams.get('y');

        if (!z || !x || !y) {
            return NextResponse.json(
                { error: 'Missing required parameters: z, x, y' },
                { status: 400 }
            );
        }

        if (!REGRID_API_KEY) {
            return NextResponse.json(
                { error: 'REGRID_API_KEY must be configured in .env.local' },
                { status: 500 }
            );
        }

        // z/x/y are interpolated into the upstream URL path — require plain integers
        if (!/^\d{1,2}$/.test(z) || !/^\d{1,8}$/.test(x) || !/^\d{1,8}$/.test(y)) {
            return NextResponse.json(
                { error: 'z, x, y must be integers' },
                { status: 400 }
            );
        }

        const zNum = parseInt(z, 10);
        if (zNum < 10 || zNum > 21) {
            return NextResponse.json(
                { error: 'Zoom level must be between 10 and 21' },
                { status: 400 }
            );
        }

        const tileUrl = `https://tiles.regrid.com/api/v1/parcels/${z}/${x}/${y}.mvt?token=${REGRID_API_KEY}&fields=${MVT_FIELDS}`;

        const res = await fetch(tileUrl, {
            headers: { 'Accept': 'application/vnd.mapbox-vector-tile' },
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            // Return empty tile for 404 (no data at this tile) — common for ocean/sparse areas
            if (res.status === 404) {
                return new NextResponse(null, {
                    status: 204,
                    headers: {
                        'Content-Type': 'application/vnd.mapbox-vector-tile',
                        // Empty tiles are just as cacheable; avoids re-requesting
                        // every ocean/sparse tile on each pan.
                        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
                    },
                });
            }
            const errBody = await res.text().catch(() => '');
            console.error(`[Explore Tile] Regrid error z=${z} x=${x} y=${y}: status=${res.status} body=${errBody.slice(0, 500)}`);
            return NextResponse.json(
                { error: `Regrid tile server error: ${res.status}` },
                { status: 502 }
            );
        }

        const buffer = await res.arrayBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.mapbox-vector-tile',
                // Auth-gated data: allow browser caching only, never shared caches,
                // and don't open it up to cross-origin reads.
                'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
            },
        });
    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'Explore tile', 'Tile request failed');
    }
}
