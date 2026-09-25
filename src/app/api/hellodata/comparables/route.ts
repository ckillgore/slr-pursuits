import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { createTtlCache, upstreamErrorResponse } from '@/app/api/_lib/upstream';

const HELLODATA_TIMEOUT_MS = 30_000;

// The subject-property lookup is a PAID HelloData call. Users typically tweak
// comp filters several times for the same subject, so keep it for an hour.
const subjectCache = createTtlCache<unknown>(60 * 60 * 1000, 100);

class UpstreamStatusError extends Error {
    constructor(public status: number) {
        super(`HelloData responded ${status}`);
    }
}

/**
 * POST /api/hellodata/comparables
 * 
 * Proxies the Hellodata comparables endpoint. This is a FREE endpoint.
 * 
 * Accepts:
 * - hellodataId: string (property to find comps for — we fetch its details first)
 * - OR simple_subject: { lat, lon, is_single_family, is_apartment, is_condo, ... }
 * - Optional filters: max_distance, min/max units, year built, stories
 * - Optional: excluded_ids, selected_ids, topN
 */
export async function POST(req: NextRequest) {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    const apiKey = process.env.HELLODATA_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'HELLODATA_API_KEY not configured' }, { status: 500 });
    }

    try {
        const body = await req.json();
        const {
            hellodataId,
            simple_subject,
            max_distance,
            min_number_units,
            max_number_units,
            min_year_built,
            max_year_built,
            min_number_stories,
            max_number_stories,
            excluded_ids,
            selected_ids,
            topN,
        } = body;

        let payload: Record<string, unknown>;

        if (hellodataId) {
            if (typeof hellodataId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(hellodataId)) {
                return NextResponse.json({ error: 'Invalid hellodataId' }, { status: 400 });
            }
            // Option 1: Use full property details from Hellodata as subject
            // First fetch the property (a paid call — cached in memory per instance)
            let subject: unknown;
            try {
                subject = await subjectCache.getOrLoad(hellodataId, async () => {
                    const propResponse = await fetch(
                        `https://api.hellodata.ai/property/${encodeURIComponent(hellodataId)}`,
                        { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(HELLODATA_TIMEOUT_MS) }
                    );
                    if (!propResponse.ok) throw new UpstreamStatusError(propResponse.status);
                    return propResponse.json();
                });
            } catch (err) {
                if (err instanceof UpstreamStatusError) {
                    return NextResponse.json(
                        { error: `Failed to fetch subject property: ${err.status}` },
                        { status: 502 }
                    );
                }
                throw err;
            }
            payload = { subject };
        } else if (simple_subject) {
            // Option 2: Use simplified subject
            payload = { simple_subject };
        } else {
            return NextResponse.json(
                { error: 'Either hellodataId or simple_subject is required' },
                { status: 400 }
            );
        }

        // Add optional fields
        if (excluded_ids) payload.excluded_ids = excluded_ids;
        if (selected_ids) payload.selected_ids = selected_ids;

        // Build query params for filters
        const params = new URLSearchParams();
        if (max_distance) params.set('max_distance', String(max_distance));
        if (min_number_units) params.set('min_number_units', String(min_number_units));
        if (max_number_units) params.set('max_number_units', String(max_number_units));
        if (min_year_built) params.set('min_year_built', String(min_year_built));
        if (max_year_built) params.set('max_year_built', String(max_year_built));
        if (min_number_stories) params.set('min_number_stories', String(min_number_stories));
        if (max_number_stories) params.set('max_number_stories', String(max_number_stories));
        if (topN) params.set('topN', String(topN));

        const queryStr = params.toString();
        const url = `https://api.hellodata.ai/property/comparables${queryStr ? `?${queryStr}` : ''}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(HELLODATA_TIMEOUT_MS),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[hellodata/comparables] API error:', response.status, errorText.slice(0, 200));
            return NextResponse.json(
                { error: `Comparables lookup failed (${response.status})` },
                { status: 502 }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'hellodata/comparables', 'Comparables lookup failed');
    }
}
