/**
 * Generic table export used by report tabs that render their own grid
 * (Pre-Dev, Key Dates, Pursuit Costs) instead of the config-driven ReportTable.
 *
 * A tab describes what is currently on screen as a TableExportSpec; the same
 * spec drives both the Excel writer here and the PDF renderer in TablePDF.tsx,
 * so the two exports can never drift apart.
 */

// Types only: the library itself is loaded inside exportTableToExcel, so the
// PDF path (TablePDF imports the formatters below) never downloads exceljs.
import type ExcelJS from 'exceljs';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/constants';
import { downloadBlob } from './download';

export type ExportColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date';
export type ExportRowKind = 'data' | 'group' | 'subtotal' | 'total';

export interface ExportColumn {
    label: string;
    type?: ExportColumnType;
    /** Decimals for number/currency/percent. Defaults to 0 (2 for percent). */
    decimals?: number;
    /** Render 0 as an em dash, matching the on-screen grids. */
    dashOnZero?: boolean;
    /** Relative width hint for the PDF; also seeds the Excel column width. */
    weight?: number;
}

export interface ExportRow {
    kind: ExportRowKind;
    /** Raw values positionally matched to `columns`. Numbers stay numeric so Excel can sum them. */
    cells: (string | number | null)[];
    /** Indent applied to the first cell — used for nested group headers. */
    depth?: number;
}

export interface TableExportSpec {
    /** Title in the PDF header. */
    title: string;
    /** Excel worksheet name (sanitized and truncated on write). */
    sheetName: string;
    /** File name stem — the date and extension are appended. */
    fileBase: string;
    /** Context line under the PDF title: view mode, grouping, active filters. */
    subtitle?: string;
    columns: ExportColumn[];
    rows: ExportRow[];
    /** Leading label columns repeated on every PDF page and frozen in Excel. */
    frozenCols?: number;
    /** Summary cards reproduced above the PDF table. */
    metrics?: { label: string; value: string }[];
    /** Footnotes printed under the table (PDF) and below the data (Excel), e.g. how a figure is computed. */
    notes?: string[];
}

// ── Shared formatting ────────────────────────────────────────

/** Formats a cell for display (PDF). Excel keeps raw numbers + a number format. */
export function formatCell(col: ExportColumn, value: string | number | null): string {
    if (value === null || value === undefined || value === '') return '—';
    if (col.type === 'currency' || col.type === 'number' || col.type === 'percent') {
        const num = Number(value);
        if (!Number.isFinite(num)) return '—';
        if (num === 0 && col.dashOnZero) return '—';
        if (col.type === 'currency') return formatCurrency(num, col.decimals ?? 0);
        if (col.type === 'percent') return formatPercent(num, col.decimals ?? 1);
        return formatNumber(num, col.decimals ?? 0);
    }
    if (col.type === 'date') {
        // Bare 'YYYY-MM-DD' parses as UTC midnight and would print as the prior
        // day in US timezones; build it as a local date instead.
        const str = String(value);
        const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
        const d = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(str);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return String(value);
}

export function isNumericColumn(col: ExportColumn): boolean {
    return col.type === 'currency' || col.type === 'number' || col.type === 'percent';
}

/** Right-align everything except free text. */
export function alignFor(col: ExportColumn): 'left' | 'right' {
    return col.type === undefined || col.type === 'text' ? 'left' : 'right';
}

function excelNumFmt(col: ExportColumn): string | undefined {
    const d = col.decimals ?? (col.type === 'percent' ? 1 : 0);
    const decimals = d > 0 ? `.${'0'.repeat(d)}` : '';
    // A zero section of "—" keeps the cell numeric (it still sums) while
    // matching the em dash the grid and PDF show for empty months.
    const zero = col.dashOnZero ? ';"—"' : '';
    switch (col.type) {
        case 'currency': return `$#,##0${decimals};-$#,##0${decimals}${zero}`;
        case 'number': return `#,##0${decimals};-#,##0${decimals}${zero}`;
        case 'percent': return `0${decimals}%;-0${decimals}%${zero}`;
        case 'date': return 'mm/dd/yyyy';
        default: return undefined;
    }
}

/** Width in characters: fits the header and, for text, the longest value, within sane bounds. */
function columnWidth(col: ExportColumn, colIdx: number, rows: ExportRow[]): number {
    const labelLen = Math.max(col.label.length + 2, 8);
    switch (col.type) {
        case 'currency': return Math.max(labelLen, 14);
        case 'percent': return Math.max(labelLen, 10);
        case 'number': return Math.max(labelLen, 10);
        case 'date': return Math.max(labelLen, 12);
        default: {
            let longest = 0;
            for (const row of rows) {
                const v = row.cells[colIdx];
                if (v === null || v === undefined) continue;
                const len = String(v).length + (colIdx === 0 && row.depth ? row.depth * 2 : 0);
                if (len > longest) longest = len;
            }
            return Math.min(Math.max(labelLen, 14, longest + 2), 48);
        }
    }
}

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 chars. */
function sanitizeSheetName(name: string): string {
    return (name.replace(/[:\\/?*[\]]/g, '-').trim() || 'Report').slice(0, 31);
}

export function downloadFileName(fileBase: string, ext: 'xlsx' | 'pdf'): string {
    // Local date — toISOString() is UTC and rolls to tomorrow on US evenings.
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const safeBase = fileBase.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, '_');
    return `${safeBase}_${dateStr}.${ext}`;
}

// ── Excel theme (matches exportReportExcel.ts) ───────────────
const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1F2B' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const GROUP_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F5F7' } };
const GROUP_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1A1F2B' }, size: 10 };
const SUBTOTAL_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
const SUBTOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF4A5568' }, size: 9 };
const TOTAL_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E5EA' } };
const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1A1F2B' }, size: 10 };
const DATA_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF4A5568' }, size: 9 };
const BORDER_STYLE: Partial<ExcelJS.Borders> = {
    bottom: { style: 'thin', color: { argb: 'FFE2E5EA' } },
};
/** Accounting-style rule over the grand total. */
const TOTAL_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF1A1F2B' } },
    bottom: { style: 'double', color: { argb: 'FF1A1F2B' } },
};

function styleFor(kind: ExportRowKind): { fill?: ExcelJS.FillPattern; font: Partial<ExcelJS.Font> } {
    switch (kind) {
        case 'group': return { fill: GROUP_FILL, font: GROUP_FONT };
        case 'subtotal': return { fill: SUBTOTAL_FILL, font: SUBTOTAL_FONT };
        case 'total': return { fill: TOTAL_FILL, font: TOTAL_FONT };
        default: return { font: DATA_FONT };
    }
}

// ── Excel export ─────────────────────────────────────────────

export async function exportTableToExcel(spec: TableExportSpec) {
    const { columns, rows } = spec;
    const lastCol = Math.max(1, columns.length);

    const { default: ExcelJSLib } = await import('exceljs');
    const wb = new ExcelJSLib.Workbook();
    wb.creator = 'SLR Pursuits';
    wb.created = new Date();

    // Wide matrices print landscape and one page across, with the header row
    // repeated on every printed page.
    const ws = wb.addWorksheet(sanitizeSheetName(spec.sheetName), {
        properties: { defaultColWidth: 14 },
        pageSetup: {
            orientation: columns.length > 8 ? 'landscape' : 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
        },
    });
    ws.columns = columns.map((col, i) => ({ width: columnWidth(col, i, rows) }));

    // Title block: the same context the PDF header carries (view, filters,
    // summary figures), so a forwarded spreadsheet explains itself.
    const addBannerLine = (text: string, font: Partial<ExcelJS.Font>) => {
        const r = ws.addRow([text]);
        r.font = font;
        ws.mergeCells(r.number, 1, r.number, lastCol);
        return r;
    };
    addBannerLine(spec.title, { bold: true, size: 14, color: { argb: 'FF1A1F2B' } });
    const generated = `Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    addBannerLine([spec.subtitle, generated].filter(Boolean).join(' · '), { size: 9, color: { argb: 'FF7A8599' } });
    if (spec.metrics && spec.metrics.length > 0) {
        addBannerLine(spec.metrics.map(m => `${m.label}: ${m.value}`).join('     '), { size: 9, bold: true, color: { argb: 'FF4A5568' } });
    }
    ws.addRow([]);

    // Header
    const headerRow = ws.addRow(columns.map(c => c.label));
    headerRow.eachCell(cell => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 24;
    ws.pageSetup.printTitlesRow = `${headerRow.number}:${headerRow.number}`;

    // Body
    for (const row of rows) {
        // Banner rows (group/subtotal/total) emit '' for gaps so their fill spans
        // every column; data rows emit null so blanks are truly empty in Excel.
        const isBanner = row.kind !== 'data';
        const values = columns.map((col, i) => {
            const raw = row.cells[i] ?? null;
            if (i === 0 && row.depth) return `${'  '.repeat(row.depth)}${raw ?? ''}`;
            if (raw === null) return isBanner ? '' : null;
            if (col.type === 'date') {
                const d = new Date(String(raw));
                return Number.isNaN(d.getTime()) ? String(raw) : d;
            }
            return raw;
        });

        const xlRow = ws.addRow(values);
        const { fill, font } = styleFor(row.kind);
        xlRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            const col = columns[colNum - 1];
            if (!col) return;
            if (fill) cell.fill = fill;
            cell.font = font;
            if (row.kind === 'data') cell.border = BORDER_STYLE;
            if (row.kind === 'total') cell.border = TOTAL_BORDER;
            const nf = excelNumFmt(col);
            if (nf && typeof cell.value === 'number') cell.numFmt = nf;
            if (nf && col.type === 'date' && cell.value instanceof Date) cell.numFmt = nf;
            if (colNum > 1 && alignFor(col) === 'right') cell.alignment = { horizontal: 'right' };
        });
    }

    // Footnotes
    if (spec.notes && spec.notes.length > 0) {
        ws.addRow([]);
        for (const note of spec.notes) {
            const noteRow = addBannerLine(note, { italic: true, size: 8, color: { argb: 'FF7A8599' } });
            noteRow.getCell(1).alignment = { wrapText: true, vertical: 'top' };
            // Merged cells don't auto-grow; give a long note room to wrap.
            const approxCharsPerLine = columns.reduce((sum, c, i) => sum + columnWidth(c, i, rows), 0);
            noteRow.height = 12 * Math.max(1, Math.ceil(note.length / Math.max(approxCharsPerLine, 40)));
        }
    }

    // Freeze through the header row, plus any label columns
    ws.views = [{
        state: 'frozen',
        ySplit: headerRow.number,
        xSplit: spec.frozenCols ?? 0,
        activeCell: `A${headerRow.number + 1}`,
    }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, downloadFileName(spec.fileBase, 'xlsx'));
}
