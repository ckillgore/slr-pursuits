import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/app/api/_lib/auth';
import { upstreamErrorResponse } from '@/app/api/_lib/upstream';
import { checkRecordBudget, getRegridUsage, logRegridUsage } from '@/app/api/_lib/regridUsage';
import { parseParcelResponse } from '@/app/api/_lib/regridParcel';

export const maxDuration = 60;

const REGRID_API_KEY = process.env.REGRID_API_KEY || '';
const REGRID_BASE = 'https://app.regrid.com/api/v2';

/** Regrid's limits: a query filters on at most 4 fields, a polygon covers at most 80 sq mi */
const MAX_QUERY_FIELDS = 4;
const MAX_AREA_SQ_MI = 80;
const MAX_LOAD = 100;

const Position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const AreaSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('polygon'), ring: z.array(Position).min(4).max(200) }),
    z.object({
        type: z.literal('radius'),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().min(50).max(16_093), // 10 miles
    }),
]);

const FiltersSchema = z.object({
    acresMin: z.number().min(0).max(100_000).optional(),
    acresMax: z.number().min(0).max(100_000).optional(),
    zoningSubtypes: z.array(z.string().max(60)).max(20).optional(),
    zoningCode: z.string().trim().max(40).optional(),
    noBuildings: z.boolean().optional(),
    maxImprovementValue: z.number().min(0).optional(),
    ownerContains: z.string().trim().max(80).optional(),
    lastSaleBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    uspsVacant: z.boolean().optional(),
    opportunityZone: z.boolean().optional(),
});

const BodySchema = z.object({
    area: AreaSchema,
    filters: FiltersSchema,
    /** count is free; load returns (and is billed for) up to `limit` records */
    mode: z.enum(['count', 'load']),
    limit: z.number().int().min(1).max(MAX_LOAD).default(25),
    allowOverage: z.boolean().optional(),
});

export type FindSitesFilters = z.infer<typeof FiltersSchema>;

/** Regrid `fields[<field>][<op>]` params for the filters; one entry per distinct field */
function queryFields(f: FindSitesFilters): Map<string, [string, string][]> {
    const fields = new Map<string, [string, string][]>();
    const add = (field: string, op: string, value: string) => fields.set(field, [...(fields.get(field) ?? []), [op, value]]);

    if (f.acresMin != null && f.acresMax != null) add('ll_gisacre', 'between', JSON.stringify([f.acresMin, f.acresMax]));
    else if (f.acresMin != null) add('ll_gisacre', 'gte', String(f.acresMin));
    else if (f.acresMax != null) add('ll_gisacre', 'lte', String(f.acresMax));
    if (f.zoningSubtypes?.length) add('zoning_subtype', 'in', JSON.stringify(f.zoningSubtypes));
    if (f.zoningCode) add('zoning', 'ilike', f.zoningCode);
    if (f.noBuildings) add('ll_bldg_count', 'eq', '0');
    if (f.maxImprovementValue != null) add('improvval', 'lte', String(f.maxImprovementValue));
    if (f.ownerContains) add('owner', 'ilike', f.ownerContains);
    if (f.lastSaleBefore) add('saledate', 'lt', f.lastSaleBefore);
    if (f.uspsVacant) add('usps_vacancy', 'eq', 'Y');
    if (f.opportunityZone) add('qoz', 'eq', 'Yes');
    return fields;
}

/** Rough polygon area (sq mi) — equirectangular projection is plenty at city scale */
function ringAreaSqMi(ring: [number, number][]): number {
    const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
    const kx = 69.17 * Math.cos(lat0);
    const ky = 69.17;
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
    }
    return Math.abs(a / 2);
}

/** Center of a parcel's bounding box, for map pins and pursuit coordinates */
function geometryCenter(geometry: { type?: string; coordinates?: unknown } | null): [number, number] | null {
    if (!geometry?.coordinates) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c: unknown) => {
        if (Array.isArray(c) && typeof c[0] === 'number') {
            const [x, y] = c as [number, number];
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        } else if (Array.isArray(c)) c.forEach(walk);
    };
    walk(geometry.coordinates);
    return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

/**
 * POST /api/regrid/find
 *
 * Filters parcels inside an area with Regrid's query endpoint. `count` returns
 * the number of matches and uses no parcel records; `load` returns up to
 * `limit` parcels (billed per record). Stacked records (condo units sharing a
 * lot) are collapsed so each site counts — and costs — once.
 */
export async function POST(request: Request) {
    const { user, response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const parsed = BodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }
        const { area, filters, mode, limit, allowOverage } = parsed.data;

        if (!REGRID_API_KEY) {
            return NextResponse.json({ error: 'REGRID_API_KEY must be configured' }, { status: 500 });
        }

        const fields = queryFields(filters);
        if (fields.size === 0) {
            return NextResponse.json({ error: 'Add at least one filter.' }, { status: 400 });
        }
        if (fields.size > MAX_QUERY_FIELDS) {
            return NextResponse.json({ error: `Regrid allows at most ${MAX_QUERY_FIELDS} filters per search.` }, { status: 400 });
        }

        const url = new URL(`${REGRID_BASE}/parcels/query`);
        for (const [field, ops] of fields) {
            for (const [op, value] of ops) url.searchParams.set(`fields[${field}][${op}]`, value);
        }
        if (area.type === 'polygon') {
            const sqMi = ringAreaSqMi(area.ring);
            if (sqMi > MAX_AREA_SQ_MI) {
                return NextResponse.json(
                    { error: `The search area is ${Math.round(sqMi)} sq mi; Regrid allows up to ${MAX_AREA_SQ_MI}. Zoom in or use a radius.` },
                    { status: 400 },
                );
            }
            url.searchParams.set('geojson', JSON.stringify({ type: 'Polygon', coordinates: [area.ring] }));
        } else {
            url.searchParams.set('lat', String(area.latitude));
            url.searchParams.set('lon', String(area.longitude));
            url.searchParams.set('radius', String(Math.round(area.radiusMeters)));
        }
        url.searchParams.set('return_stacked', 'false');
        url.searchParams.set('token', REGRID_API_KEY);

        if (mode === 'count') {
            url.searchParams.set('return_count', 'true');
            url.searchParams.set('limit', '1');
            const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
            if (!res.ok) return regridError(res, 'count');
            const data = await res.json();
            return NextResponse.json({ count: Number(data.count) || 0, usage: await getRegridUsage() });
        }

        const budget = await checkRecordBudget(user.id, limit, allowOverage);
        if (budget.response) return budget.response;

        url.searchParams.set('limit', String(limit));
        const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(40_000) });
        if (!res.ok) return regridError(res, 'load');
        const data = await res.json();
        const features: unknown[] = data.parcels?.features || data.features || [];
        logRegridUsage('find', features.length, { area: area.type, filters, limit });

        const results = features
            .map((f) => parseParcelResponse(f))
            // Business personal property accounts aren't land
            .filter((p) => p.recordType !== 'personal_property')
            .map((parcel) => ({ parcel, center: geometryCenter(parcel.geometry) }));

        return NextResponse.json({ results, recordsReturned: features.length });
    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'Regrid find', 'Site search failed');
    }
}

async function regridError(res: Response, step: string) {
    const body = await res.text().catch(() => '');
    console.error(`Regrid find (${step}) error: HTTP ${res.status}`, body.slice(0, 300));
    // A 400 from Regrid is about the query (bad filter value, area too large) — pass its message on
    let message = `Regrid API error: ${res.status}`;
    if (res.status === 400) {
        try { message = JSON.parse(body).message || message; } catch { /* keep default */ }
    }
    return NextResponse.json({ error: message }, { status: res.status === 400 ? 400 : 502 });
}
