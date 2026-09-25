import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { createTtlCache, upstreamErrorResponse } from '@/app/api/_lib/upstream';
import { z } from 'zod';

const BodySchema = z.object({
    zip: z.string().regex(/^\d{5}$/, 'Must be a 5-digit ZIP code'),
    stateAbbr: z.string().length(2),
});

const HUD_API_TOKEN = process.env.HUD_API_TOKEN;
const HUD_BASE = 'https://www.huduser.gov/hudapi/public/fmr';

// In-memory cache: ZIP → metro entity ID
// Avoids repeating the expensive metro search. Bounded to 500 entries.
const MAX_ZIP_CACHE = 500;
const zipToMetroCache = new Map<string, string>();

function cacheZip(zip: string, entityId: string) {
    if (zipToMetroCache.size >= MAX_ZIP_CACHE) {
        // Evict oldest entry (first inserted)
        const firstKey = zipToMetroCache.keys().next().value;
        if (firstKey) zipToMetroCache.delete(firstKey);
    }
    zipToMetroCache.set(zip, entityId);
}

// FMRs are published once a year, so the metro list and per-metro data can be
// cached for hours. This turns a cold ZIP lookup (list + N metro fetches) into
// in-memory hits on repeat.
const HUD_TIMEOUT_MS = 15_000;
const HUD_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
type HudMetro = { cbsa_code: string; area_name: string };
type HudFmrEntry = Record<string, string | number | null | undefined> & { zip_code?: string };
type HudFmrData = { data?: { basicdata?: HudFmrEntry[] | HudFmrEntry; area_name?: string; metro_name?: string; year?: string | number } };
const metroListCache = createTtlCache<HudMetro[]>(HUD_CACHE_TTL_MS, 1);
const metroDataCache = createTtlCache<HudFmrData>(HUD_CACHE_TTL_MS, 300);

async function hudGet<T>(path: string, headers: Record<string, string>): Promise<T> {
    const res = await fetch(`${HUD_BASE}${path}`, { headers, signal: AbortSignal.timeout(HUD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HUD ${path} failed (${res.status})`);
    return res.json() as Promise<T>;
}

/** How many state metros to probe in parallel when searching for a ZIP. */
const METRO_SEARCH_CONCURRENCY = 6;

export async function POST(request: Request) {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const raw = await request.json();
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }
        const { zip, stateAbbr } = parsed.data;

        if (!HUD_API_TOKEN) {
            return NextResponse.json(
                { error: 'HUD_API_TOKEN must be configured in .env.local' },
                { status: 500 }
            );
        }

        const headers = { 'Authorization': `Bearer ${HUD_API_TOKEN}` };

        // Check cache first
        let entityId = zipToMetroCache.get(zip) || null;

        if (!entityId) {
            // Get all metro areas
            let metros: HudMetro[];
            try {
                metros = await metroListCache.getOrLoad('all', () => hudGet<HudMetro[]>('/listMetroAreas', headers));
            } catch (err) {
                console.error('[HUD] Failed to list metro areas:', err);
                return NextResponse.json({ fmr: null, message: 'Failed to list metro areas' });
            }

            // Filter to metros in this state
            const stateMetros = metros.filter(m =>
                m.area_name.includes(`, ${stateAbbr} `) ||
                m.area_name.endsWith(`, ${stateAbbr}`) ||
                m.area_name.includes(` ${stateAbbr} `)
            );

            // Search state metros for one containing our ZIP, a few at a time
            // (sequential probing of a large state took 20+ round trips).
            const loadMetro = (code: string) => metroDataCache.getOrLoad(code, () => hudGet<HudFmrData>(`/data/${code}`, headers));
            for (let i = 0; i < stateMetros.length && !entityId; i += METRO_SEARCH_CONCURRENCY) {
                const batch = stateMetros.slice(i, i + METRO_SEARCH_CONCURRENCY);
                const results = await Promise.allSettled(batch.map((m) => loadMetro(m.cbsa_code)));
                for (let j = 0; j < batch.length; j++) {
                    const r = results[j];
                    if (r.status !== 'fulfilled') continue; // Skip failed requests
                    const basicdata = r.value?.data?.basicdata;
                    if (Array.isArray(basicdata) && basicdata.some((e) => e.zip_code === zip)) {
                        entityId = batch[j].cbsa_code;
                        cacheZip(zip, entityId);
                        break;
                    }
                }
            }
        }

        if (!entityId) {
            return NextResponse.json({ fmr: null, message: 'No FMR data found for this location' });
        }

        // Get the FMR data (usually already cached by the search above)
        let fmrData: HudFmrData;
        try {
            fmrData = await metroDataCache.getOrLoad(entityId, () => hudGet<HudFmrData>(`/data/${entityId}`, headers));
        } catch {
            return NextResponse.json({ fmr: null, message: 'Failed to fetch FMR data' });
        }
        const d = fmrData.data;
        const basicdata = d?.basicdata;

        if (!Array.isArray(basicdata)) {
            return NextResponse.json({ fmr: null, message: 'Unexpected FMR data format' });
        }

        const msaEntry = basicdata.find((e: any) => e.zip_code === 'MSA level');
        const zipEntry = basicdata.find((e: any) => e.zip_code === zip);

        const parseRents = (entry: any) => entry ? {
            studio: entry['Efficiency'] || null,
            oneBr: entry['One-Bedroom'] || null,
            twoBr: entry['Two-Bedroom'] || null,
            threeBr: entry['Three-Bedroom'] || null,
            fourBr: entry['Four-Bedroom'] || null,
        } : null;

        return NextResponse.json({
            fmr: {
                areaName: d?.area_name || '',
                metroName: d?.metro_name || '',
                year: d?.year || '',
                msaRents: parseRents(msaEntry),
                zipRents: parseRents(zipEntry),
                zip: zipEntry ? zip : null,
            },
        });
    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'HUD', 'Failed to load HUD FMR data');
    }
}
