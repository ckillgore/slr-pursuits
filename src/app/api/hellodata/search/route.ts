import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/hellodata/search?q=...&state=...&zip_code=...&lat=...&lon=...&max_distance=...
 * 
 * Proxies the Hellodata property search endpoint. This is a FREE endpoint.
 */
export async function GET(req: NextRequest) {
    const apiKey = process.env.HELLODATA_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'HELLODATA_API_KEY not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    // Build query params for Hellodata
    const params = new URLSearchParams({ q });
    const state = searchParams.get('state');
    const zipCode = searchParams.get('zip_code');
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const maxDistance = searchParams.get('max_distance');

    if (state) params.set('state', state);
    if (zipCode) params.set('zip_code', zipCode);
    if (lat) params.set('lat', lat);
    if (lon) params.set('lon', lon);
    if (maxDistance) params.set('max_distance', maxDistance);

    try {
        const response = await fetch(
            `https://api.hellodata.ai/property/search?${params.toString()}`,
            {
                headers: { 'x-api-key': apiKey },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: `Hellodata API error: ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
