import { NextResponse } from 'next/server';

// ============================================================
// Smartsheet Unit Prototype Inventory API
// Fetches the unit prototype matrix from Smartsheet, parses
// column headers (unit code + SF) and row cells (PDF hyperlinks)
// into a normalized catalog for the One Pager unit mix picker.
// ============================================================

export interface UnitPrototype {
    /** Row reference code (bath/amenity type), e.g. "a", "by", "gw" */
    reference_code: string;
    /** Unit code from column header, e.g. "S1", "A2", "B6" */
    unit_code: string;
    /** Bedroom category derived from code prefix */
    bedroom_category: 'Studio' | '1 Bed' | '2 Bed' | '3 Bed';
    /** Full model name from column header, e.g. "S18.0", "A27.1", "BEC.1" */
    model_name: string;
    /** Dimensions string, e.g. "18X28", "43X31 BAY" */
    dimensions: string;
    /** Unit square footage parsed from column header */
    avg_unit_sf: number;
    /** Combined display label: "{unit_code}-{reference_code}" */
    display_name: string;
    /** Box.com PDF link from cell hyperlink, if available */
    floor_plan_url: string | null;
}

interface SmartsheetColumn {
    id: number;
    title: string;
    type: string;
    index: number;
}

interface SmartsheetCell {
    columnId: number;
    value?: string | number;
    displayValue?: string;
    hyperlink?: { url?: string };
}

interface SmartsheetRow {
    rowNumber: number;
    cells: SmartsheetCell[];
}

interface SmartsheetSheet {
    name: string;
    columns: SmartsheetColumn[];
    rows: SmartsheetRow[];
}

/** Parse a column title like "B6 BEC.1 43X31 BAY 1320" into structured parts */
function parseColumnHeader(title: string): {
    unit_code: string;
    model_name: string;
    dimensions: string;
    avg_unit_sf: number;
    bedroom_category: 'Studio' | '1 Bed' | '2 Bed' | '3 Bed';
} | null {
    // Skip non-unit columns
    if (title === 'REF' || title === 'TOTAL') return null;

    const parts = title.split(/\s+/);
    if (parts.length < 4) return null;

    const unit_code = parts[0]; // e.g. "S1", "A2", "B6", "C3"
    const model_name = parts[1]; // e.g. "S18.0", "BEC.1", "COC.0"

    // SF is always the last numeric token
    const avg_unit_sf = parseInt(parts[parts.length - 1], 10);
    if (isNaN(avg_unit_sf)) return null;

    // Dimensions is everything between model_name and the SF number
    const dimensions = parts.slice(2, parts.length - 1).join(' '); // e.g. "43X31 BAY"

    // Derive bedroom category from unit code prefix
    const prefix = unit_code.charAt(0).toUpperCase();
    const bedroom_category: 'Studio' | '1 Bed' | '2 Bed' | '3 Bed' =
        prefix === 'S' ? 'Studio' :
            prefix === 'A' ? '1 Bed' :
                prefix === 'B' ? '2 Bed' :
                    '3 Bed';

    return { unit_code, model_name, dimensions, avg_unit_sf, bedroom_category };
}

// In-memory cache (server process lifetime)
let cachedPrototypes: UnitPrototype[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
    try {
        const apiKey = process.env.SMARTSHEET_API_KEY || process.env.SS_TOKEN;
        const sheetId = process.env.SMARTSHEET_PROTOTYPE_SHEET_ID;

        if (!apiKey || !sheetId) {
            return NextResponse.json(
                { error: 'Missing SMARTSHEET_API_KEY or SMARTSHEET_PROTOTYPE_SHEET_ID' },
                { status: 500 }
            );
        }

        // Return cached if fresh
        if (cachedPrototypes && Date.now() - cacheTimestamp < CACHE_TTL) {
            return NextResponse.json(cachedPrototypes);
        }

        const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            next: { revalidate: 3600 }, // Next.js fetch cache
        });

        if (!res.ok) {
            const error = await res.text();
            console.error('Smartsheet API error:', res.status, error);
            return NextResponse.json(
                { error: `Smartsheet API returned ${res.status}` },
                { status: 502 }
            );
        }

        const sheet: SmartsheetSheet = await res.json();

        // Build column lookup: columnId → parsed header
        const columnMap = new Map<number, ReturnType<typeof parseColumnHeader>>();
        for (const col of sheet.columns) {
            const parsed = parseColumnHeader(col.title);
            if (parsed) {
                columnMap.set(col.id, parsed);
            }
        }

        // Find the REF column
        const refColumn = sheet.columns.find((c) => c.title === 'REF');
        if (!refColumn) {
            return NextResponse.json({ error: 'REF column not found' }, { status: 500 });
        }

        // Walk rows and build prototypes
        const prototypes: UnitPrototype[] = [];

        for (const row of sheet.rows) {
            const refCell = row.cells.find((c) => c.columnId === refColumn.id);
            const reference_code = String(refCell?.value ?? '').trim();
            if (!reference_code) continue;

            for (const cell of row.cells) {
                if (cell.columnId === refColumn.id) continue;

                const colInfo = columnMap.get(cell.columnId);
                if (!colInfo) continue;

                // Only include cells that have a PDF hyperlink
                const hasPdf = cell.hyperlink?.url && String(cell.value ?? '').toUpperCase() === 'PDF';
                if (!hasPdf) continue;

                prototypes.push({
                    reference_code,
                    unit_code: colInfo.unit_code,
                    bedroom_category: colInfo.bedroom_category,
                    model_name: colInfo.model_name,
                    dimensions: colInfo.dimensions,
                    avg_unit_sf: colInfo.avg_unit_sf,
                    display_name: `${colInfo.unit_code}-${reference_code}`,
                    floor_plan_url: cell.hyperlink!.url!,
                });
            }
        }

        // Sort: by bedroom category order, then by unit code, then by ref code
        const catOrder = { 'Studio': 0, '1 Bed': 1, '2 Bed': 2, '3 Bed': 3 };
        prototypes.sort((a, b) =>
            catOrder[a.bedroom_category] - catOrder[b.bedroom_category] ||
            a.unit_code.localeCompare(b.unit_code, undefined, { numeric: true }) ||
            a.reference_code.localeCompare(b.reference_code)
        );

        // Update cache
        cachedPrototypes = prototypes;
        cacheTimestamp = Date.now();

        return NextResponse.json(prototypes);
    } catch (err) {
        console.error('Smartsheet prototypes error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch prototypes' },
            { status: 500 }
        );
    }
}
