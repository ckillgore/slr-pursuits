/**
 * Excel export for Market Study data using ExcelJS.
 * Two sheets: Market Summary and Market Stock by Unit Type.
 */

import ExcelJS from 'exceljs';
import type { CompSummaryPDF, StockRowPDF } from './MarketStudyPDF';

// Theme colors (matching the PDF/existing exports)
const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
const SUBTOTAL_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F5F7' } };
const SUBTOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1A1F2B' }, size: 9 };
const TOTAL_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E5EA' } };
const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1A1F2B' }, size: 10 };
const VALUE_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF4A5568' }, size: 9 };
const NAME_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF2563EB' }, size: 9 };
const BORDER: Partial<ExcelJS.Borders> = {
    bottom: { style: 'thin', color: { argb: 'FFE2E5EA' } },
};

interface ExportOptions {
    pursuitName?: string;
    compSummaries: CompSummaryPDF[];
    summaryTotals: {
        unitCount: number;
        avgUnitSize: number | null;
        marketRent: number | null;
        marketRentSf: number | null;
        effectiveRent: number | null;
        effectiveRentSf: number | null;
    } | null;
    stockRows: StockRowPDF[];
}

export async function exportMarketStudyToExcel({ pursuitName, compSummaries, summaryTotals, stockRows }: ExportOptions) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SLR Pursuits';
    wb.created = new Date();

    // ==================== Market Summary ====================
    const sumWs = wb.addWorksheet('Market Summary');
    sumWs.columns = [
        { header: 'Property', width: 30 },
        { header: '#', width: 5 },
        { header: 'Type', width: 12 },
        { header: 'Built', width: 8 },
        { header: 'Units', width: 10 },
        { header: 'Avg SF', width: 10 },
        { header: 'Mkt Rent', width: 12 },
        { header: 'Rent/SF', width: 10 },
        { header: 'Eff Rent', width: 12 },
        { header: 'Eff/SF', width: 10 },
    ];

    // Title row
    if (pursuitName) {
        const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
        const titleRow = sumWs.insertRow(1, [`${pursuitName} — Rent Comps — ${monthLabel}`]);
        titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1A1F2B' } };
        sumWs.mergeCells(1, 1, 1, 10);
        sumWs.insertRow(2, [`${compSummaries.length} properties · Source: HelloData`]);
        sumWs.getRow(2).getCell(1).font = { italic: true, color: { argb: 'FF7A8599' }, size: 9 };
        sumWs.insertRow(3, []);
        // Re-add headers after title rows (row 4)
        const hdrRow = sumWs.getRow(4);
        ['Property', '#', 'Type', 'Built', 'Units', 'Avg SF', 'Mkt Rent', 'Rent/SF', 'Eff Rent', 'Eff/SF'].forEach((v, i) => {
            hdrRow.getCell(i + 1).value = v;
        });
        hdrRow.eachCell(cell => {
            cell.fill = HEADER_FILL;
            cell.font = HEADER_FONT;
            cell.alignment = { horizontal: 'center' };
        });
    } else {
        // Style the auto-generated header row
        const hdrRow = sumWs.getRow(1);
        hdrRow.eachCell(cell => {
            cell.fill = HEADER_FILL;
            cell.font = HEADER_FONT;
            cell.alignment = { horizontal: 'center' };
        });
    }

    // Data rows
    for (const c of compSummaries) {
        const row = sumWs.addRow([
            c.name,
            c.mapNode,
            c.projectType,
            c.yearBuilt ?? '',
            c.unitCount,
            c.avgUnitSize ?? '',
            c.marketRent ?? '',
            c.marketRentSf ?? '',
            c.effectiveRent ?? '',
            c.effectiveRentSf ?? '',
        ]);
        row.getCell(1).font = NAME_FONT;
        for (let i = 2; i <= 10; i++) row.getCell(i).font = VALUE_FONT;
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0';
        row.getCell(7).numFmt = '$#,##0';
        row.getCell(8).numFmt = '$#,##0.00';
        row.getCell(9).numFmt = '$#,##0';
        row.getCell(10).numFmt = '$#,##0.00';
        for (let i = 5; i <= 10; i++) row.getCell(i).alignment = { horizontal: 'right' };
        row.eachCell(cell => { cell.border = BORDER; });
    }

    // Grand total
    if (summaryTotals) {
        const row = sumWs.addRow([
            'Grand Total', '', '', '',
            summaryTotals.unitCount,
            summaryTotals.avgUnitSize ?? '',
            summaryTotals.marketRent ?? '',
            summaryTotals.marketRentSf ?? '',
            summaryTotals.effectiveRent ?? '',
            summaryTotals.effectiveRentSf ?? '',
        ]);
        row.eachCell(cell => {
            cell.fill = TOTAL_FILL;
            cell.font = TOTAL_FONT;
        });
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0';
        row.getCell(7).numFmt = '$#,##0';
        row.getCell(8).numFmt = '$#,##0.00';
        row.getCell(9).numFmt = '$#,##0';
        row.getCell(10).numFmt = '$#,##0.00';
        for (let i = 5; i <= 10; i++) row.getCell(i).alignment = { horizontal: 'right' };
    }

    // ==================== Market Stock by Unit Type ====================
    const stWs = wb.addWorksheet('Stock by Unit Type');
    stWs.columns = [
        { header: 'Unit Mix Analysis', width: 24 },
        { header: 'Units', width: 10 },
        { header: 'Avg SF', width: 10 },
        { header: 'Mkt Rent', width: 12 },
        { header: 'Rent/SF', width: 10 },
        { header: 'Eff Rent', width: 12 },
        { header: 'Eff/SF', width: 10 },
    ];

    // Style header row
    const stHdrRow = stWs.getRow(1);
    stHdrRow.eachCell(cell => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { horizontal: 'center' };
    });

    for (const sr of stockRows) {
        const row = stWs.addRow([
            sr.label,
            sr.unitCount,
            sr.avgUnitSize ?? '',
            sr.marketRent ?? '',
            sr.marketRentSf ?? '',
            sr.effectiveRent ?? '',
            sr.effectiveRentSf ?? '',
        ]);

        if (sr.isGrandTotal) {
            row.eachCell(cell => { cell.fill = TOTAL_FILL; cell.font = TOTAL_FONT; });
        } else if (sr.isSubtotal) {
            row.eachCell(cell => { cell.fill = SUBTOTAL_FILL; cell.font = SUBTOTAL_FONT; });
        } else {
            row.getCell(1).font = { ...VALUE_FONT, color: { argb: 'FF7A8599' } };
            row.getCell(1).alignment = { indent: 2 };
            for (let i = 2; i <= 7; i++) row.getCell(i).font = VALUE_FONT;
        }

        row.getCell(2).numFmt = '#,##0';
        row.getCell(3).numFmt = '#,##0';
        row.getCell(4).numFmt = '$#,##0';
        row.getCell(5).numFmt = '$#,##0.00';
        row.getCell(6).numFmt = '$#,##0';
        row.getCell(7).numFmt = '$#,##0.00';
        for (let i = 2; i <= 7; i++) row.getCell(i).alignment = { horizontal: 'right' };
        row.eachCell(cell => { cell.border = BORDER; });
    }

    // ==================== Download ====================
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (pursuitName || 'Market Study').replace(/[^a-zA-Z0-9-_ ]/g, '');
    a.download = `${safeName} - Market Study.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
