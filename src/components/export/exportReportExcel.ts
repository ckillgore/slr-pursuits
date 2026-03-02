/**
 * Excel export for report data using ExcelJS.
 * Handles dynamic column counts, grouped rows with subtotals, and auto-sizing.
 */

import ExcelJS from 'exceljs';
import type { ReportConfig, ReportFieldKey, PursuitStage, ReportDataSource } from '@/types';
import type { ReportRow } from '@/lib/supabase/queries';
import type { GroupNode } from '@/hooks/useReportEngine';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';

// ── Theme ────────────────────────────────────────────────────
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

// ── Number format by field type ──────────────────────────────
function getNumFormat(fieldDef: { type: string; key: string }): string | undefined {
    if (fieldDef.type === 'currency') {
        // PSF fields use 2 decimals
        if (fieldDef.key.includes('psf') || fieldDef.key.includes('per_sf') || fieldDef.key.includes('_sf')) {
            return '$#,##0.00';
        }
        return '$#,##0';
    }
    if (fieldDef.type === 'percent') return '0.0%';
    if (fieldDef.type === 'number') return '#,##0';
    return undefined;
}

// ── Column width by field type ───────────────────────────────
function getColWidth(fieldDef: { type: string; label: string }): number {
    const labelLen = Math.max(fieldDef.label.length + 2, 8);
    switch (fieldDef.type) {
        case 'text': return Math.max(labelLen, 18);
        case 'currency': return Math.max(labelLen, 14);
        case 'percent': return Math.max(labelLen, 10);
        case 'number': return Math.max(labelLen, 10);
        case 'date': return Math.max(labelLen, 12);
        default: return Math.max(labelLen, 12);
    }
}

// ── Data source label ────────────────────────────────────────
function sourceLabel(ds: ReportDataSource): string {
    switch (ds) {
        case 'pursuits': return 'Pursuits';
        case 'land_comps': return 'Land Comps';
        case 'rent_comps': return 'Rent Comps';
        case 'key_dates': return 'Key Dates';
        case 'predev_budgets': return 'Pre-Dev Budgets';
        default: return 'Report';
    }
}

// ── Main export ──────────────────────────────────────────────
export interface ReportExcelOptions {
    config: ReportConfig;
    groupTree: GroupNode[];
    flatRows: ReportRow[];
    isGrouped: boolean;
    totalAggregates: Record<string, number | null>;
    stages?: PursuitStage[];
}

export async function exportReportToExcel(opts: ReportExcelOptions) {
    const { config, groupTree, flatRows, isGrouped, totalAggregates, stages } = opts;
    const columns = config.columns;
    const fieldDefs = columns.map(k => REPORT_FIELD_MAP[k]).filter(Boolean);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SLR Pursuits';
    wb.created = new Date();

    const label = sourceLabel(config.dataSource);
    const ws = wb.addWorksheet(label, {
        properties: { defaultColWidth: 14 },
    });

    // ── Column setup ─────────────────────────────────────────
    ws.columns = fieldDefs.map(fd => ({
        width: getColWidth(fd),
    }));

    // ── Header row ───────────────────────────────────────────
    const headerRow = ws.addRow(fieldDefs.map(fd => fd.label));
    headerRow.eachCell((cell) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(1).height = 24;

    // ── Helper: emit a data row ──────────────────────────────
    function addDataRow(row: ReportRow) {
        const values = fieldDefs.map(fd => {
            const raw = fd.getValue(row, stages);
            return raw ?? '';
        });
        const xlRow = ws.addRow(values);
        xlRow.eachCell((cell, colNum) => {
            const fd = fieldDefs[colNum - 1];
            if (!fd) return;
            cell.font = DATA_FONT;
            cell.border = BORDER_STYLE;
            const nf = getNumFormat(fd);
            if (nf) cell.numFmt = nf;
            if (fd.type !== 'text') cell.alignment = { horizontal: 'right' };
        });
    }

    // ── Helper: emit an aggregate row ────────────────────────
    function addAggRow(
        label: string,
        agg: Record<string, number | null>,
        fill: ExcelJS.FillPattern,
        font: Partial<ExcelJS.Font>,
        rowCount?: number,
    ) {
        const values = fieldDefs.map((fd, i) => {
            if (i === 0) return `${label}${rowCount !== undefined ? ` (${rowCount})` : ''}`;
            const v = agg[fd.key];
            return v ?? '';
        });
        const xlRow = ws.addRow(values);
        xlRow.eachCell((cell, colNum) => {
            const fd = fieldDefs[colNum - 1];
            cell.fill = fill;
            cell.font = font;
            if (fd && fd.type !== 'text' && colNum > 1) {
                cell.alignment = { horizontal: 'right' };
                const nf = getNumFormat(fd);
                if (nf) cell.numFmt = nf;
            }
        });
    }

    // ── Populate rows ────────────────────────────────────────
    if (isGrouped && groupTree.length > 0) {
        function walkGroup(node: GroupNode, depth: number) {
            // Group header
            const groupLabel = `${'  '.repeat(depth)}${node.label}`;
            addAggRow(groupLabel, node.aggregates, GROUP_FILL, GROUP_FONT, node.aggregates._count ?? undefined);

            // Recurse children
            if (node.children.length > 0) {
                for (const child of node.children) {
                    walkGroup(child, depth + 1);
                }
            }

            // Leaf rows
            for (const row of node.rows) {
                addDataRow(row);
            }

            // Subtotal if it has rows
            if (node.rows.length > 0) {
                addAggRow(`${'  '.repeat(depth)}Subtotal`, node.aggregates, SUBTOTAL_FILL, SUBTOTAL_FONT);
            }
        }

        for (const node of groupTree) {
            walkGroup(node, 0);
        }
    } else {
        // Flat (ungrouped)
        for (const row of flatRows) {
            addDataRow(row);
        }
    }

    // ── Grand total row ──────────────────────────────────────
    addAggRow('Total', totalAggregates, TOTAL_FILL, TOTAL_FONT, totalAggregates._count ?? undefined);

    // ── Freeze pane at header ────────────────────────────────
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, activeCell: 'A2' }];

    // ── Download ─────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${label.replace(/\s+/g, '_')}_Report_${dateStr}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
