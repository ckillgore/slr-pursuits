import { NextResponse } from 'next/server';

const HUD_API_TOKEN = process.env.HUD_API_TOKEN;
const HUD_BASE = 'https://www.huduser.gov/hudapi/public/fmr';

// In-memory cache: ZIP → metro entity ID
// Avoids repeating the expensive metro search
const zipToMetroCache = new Map<string, string>();

export async function POST(request: Request) {
    try {
        const { zip, stateAbbr } = await request.json();

        if (!HUD_API_TOKEN) {
            return NextResponse.json(
                { error: 'HUD_API_TOKEN must be configured in .env.local' },
                { status: 500 }
            );
        }

        if (!zip || !stateAbbr) {
            return NextResponse.json(
                { error: 'ZIP code and state abbreviation are required' },
                { status: 400 }
            );
        }

        const headers = { 'Authorization': `Bearer ${HUD_API_TOKEN}` };

        // Check cache first
        let entityId = zipToMetroCache.get(zip) || null;

        if (!entityId) {
            // Get all metro areas
            const metroRes = await fetch(`${HUD_BASE}/listMetroAreas`, { headers });
            if (!metroRes.ok) {
                console.error('[HUD] Failed to list metro areas:', metroRes.status);
                return NextResponse.json({ fmr: null, message: 'Failed to list metro areas' });
            }
            const metros: Array<{ cbsa_code: string; area_name: string }> = await metroRes.json();

            // Filter to metros in this state
            const stateMetros = metros.filter(m =>
                m.area_name.includes(`, ${stateAbbr} `) ||
                m.area_name.endsWith(`, ${stateAbbr}`) ||
                m.area_name.includes(` ${stateAbbr} `)
            );

            console.log(`[HUD] Found ${stateMetros.length} metros for state ${stateAbbr}, searching for ZIP ${zip}...`);

            // Search state metros for one containing our ZIP
            for (const metro of stateMetros) {
                try {
                    const dataRes = await fetch(`${HUD_BASE}/data/${metro.cbsa_code}`, { headers });
                    if (!dataRes.ok) continue;
                    const data = await dataRes.json();
                    const basicdata = data.data?.basicdata;
                    if (!Array.isArray(basicdata)) continue;

                    if (basicdata.some((e: any) => e.zip_code === zip)) {
                        entityId = metro.cbsa_code;
                        zipToMetroCache.set(zip, entityId);
                        console.log(`[HUD] Found ZIP ${zip} in metro: ${metro.area_name} (${metro.cbsa_code})`);
                        break;
                    }
                } catch {
                    // Skip failed requests
                }
            }
        }

        if (!entityId) {
            console.log(`[HUD] ZIP ${zip} not found in any ${stateAbbr} metro area`);
            return NextResponse.json({ fmr: null, message: 'No FMR data found for this location' });
        }

        // Get the FMR data
        const fmrRes = await fetch(`${HUD_BASE}/data/${entityId}`, { headers });
        if (!fmrRes.ok) {
            return NextResponse.json({ fmr: null, message: 'Failed to fetch FMR data' });
        }

        const fmrData = await fmrRes.json();
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
    } catch (err: any) {
        console.error('[HUD] FMR route error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
