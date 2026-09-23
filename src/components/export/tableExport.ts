/**
 * Generic table export used by report tabs that render their own grid
 * (Pre-Dev, Key Dates, Pursuit Costs) instead of the config-driven ReportTable.
 *
 * A tab describes what is currently on screen as a TableExportSpec; the same
 * spec drives both the Excel writer here and the PDF renderer in TablePDF.tsx,
 * so the two exports can never drift apart.
 */

import ExcelJS from 'exceljs';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/constants';

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
    switch (col.type) {
        case 'currency': return `$#,##0${decimals}`;
        case 'number': return `#,##0${decimals}`;
        case 'percent': return `0${decimals}%`;
        case 'date': return 'mm/dd/yyyy';
        default: return undefined;
    }
}

function columnWidth(col: ExportColumn): number {
    const labelLen = Math.max(col.label.length + 2, 8);
    switch (col.type) {
        case 'currency': return Math.max(labelLen, 14);
        case 'percent': return Math.max(labelLen, 10);
        case 'number': return Math.max(labelLen, 10);
        case 'date': return Math.max(labelLen, 12);
        default: return Math.max(labelLen, 18);
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

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SLR Pursuits';
    wb.created = new Date();

    const ws = wb.addWorksheet(sanitizeSheetName(spec.sheetName), {
        properties: { defaultColWidth: 14 },
    });
    ws.columns = columns.map(col => ({ width: columnWidth(col) }));

    // Header
    const headerRow = ws.addRow(columns.map(c => c.label));
    headerRow.eachCell(cell => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 24;

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
            const nf = excelNumFmt(col);
            if (nf && typeof cell.value === 'number') cell.numFmt = nf;
            if (nf && col.type === 'date' && cell.value instanceof Date) cell.numFmt = nf;
            if (colNum > 1 && alignFor(col) === 'right') cell.alignment = { horizontal: 'right' };
        });
    }

    // Freeze the header plus any label columns
    ws.views = [{
        state: 'frozen',
        ySplit: 1,
        xSplit: spec.frozenCols ?? 0,
        activeCell: 'A2',
    }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFileName(spec.fileBase, 'xlsx');
    a.click();
    URL.revokeObjectURL(url);
}
