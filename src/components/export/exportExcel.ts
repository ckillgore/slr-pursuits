/**
 * Excel export for one-pager data using ExcelJS.
 * Generates a formatted workbook with Summary, Unit Mix, and OpEx sheets.
 */

import ExcelJS from 'exceljs';
import type { OnePager, Pursuit, UnitMixRow } from '@/types';
import type { CalculationResults } from '@/types';

interface ExportOptions {
    onePager: OnePager;
    pursuit: Pursuit;
    calc: CalculationResults;
    productTypeName?: string;
}

// Theme colors
const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1F2B' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const SECTION_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F5F7' } };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF7A8599' }, size: 9 };
const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1A1F2B' }, size: 10 };
const ACCENT_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF2563EB' }, size: 12 };
const LABEL_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF7A8599' }, size: 9 };
const VALUE_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF1A1F2B' }, size: 9 };
const BORDER_STYLE: Partial<ExcelJS.Borders> = {
    bottom: { style: 'thin', color: { argb: 'FFE2E5EA' } },
};

function addMetricRow(ws: ExcelJS.Worksheet, label: string, value: string | number, fmt?: string) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = LABEL_FONT;
    row.getCell(2).font = VALUE_FONT;
    row.getCell(2).alignment = { horizontal: 'right' };
    if (fmt) row.getCell(2).numFmt = fmt;
    row.eachCell((cell) => { cell.border = BORDER_STYLE; });
    return row;
}

function addSectionHeader(ws: ExcelJS.Worksheet, title: string) {
    ws.addRow([]);
    const row = ws.addRow([title]);
    row.font = SECTION_FONT;
    row.getCell(1).fill = SECTION_FILL;
    row.getCell(2).fill = SECTION_FILL;
}

function addTotalRow(ws: ExcelJS.Worksheet, label: string, value: string | number, fmt?: string) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = TOTAL_FONT;
    row.getCell(2).font = TOTAL_FONT;
    row.getCell(2).alignment = { horizontal: 'right' };
    if (fmt) row.getCell(2).numFmt = fmt;
    row.eachCell((cell) => {
        cell.border = { top: { style: 'medium', color: { argb: 'FFE2E5EA' } }, bottom: { style: 'medium', color: { argb: 'FFE2E5EA' } } };
    });
    return row;
}

export async function exportOnePagerToExcel({ onePager, pursuit, calc, productTypeName }: ExportOptions) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SLR Pursuits';
    wb.created = new Date();

    // ==================== Summary Sheet ====================
    const ws = wb.addWorksheet('Summary', { properties: { defaultColWidth: 30 } });
    ws.columns = [
        { width: 28 },
        { width: 22 },
    ];

    // Title
    const titleRow = ws.addRow([onePager.name]);
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1A1F2B' } };
    ws.addRow([`${pursuit.name} · ${pursuit.city || ''}${pursuit.state ? `, ${pursuit.state}` : ''}`]).getCell(1).font = LABEL_FONT;
    if (productTypeName) ws.addRow([productTypeName]).getCell(1).font = LABEL_FONT;
    ws.addRow([`Generated ${new Date().toLocaleDateString('en-US')}`]).getCell(1).font = { ...LABEL_FONT, italic: true };

    // Returns
    addSectionHeader(ws, 'Returns');
    const yocRow = addMetricRow(ws, 'Unlevered Yield on Cost', calc.unlevered_yield_on_cost, '0.00%');
    yocRow.getCell(2).font = ACCENT_FONT;
    addMetricRow(ws, 'NOI', calc.noi, '$#,##0');
    addMetricRow(ws, 'NOI / Unit', calc.noi_per_unit, '$#,##0');

    // Site & Density
    addSectionHeader(ws, 'Site & Density');
    addMetricRow(ws, 'Site Area (SF)', pursuit.site_area_sf, '#,##0');
    addMetricRow(ws, 'Total Units', onePager.total_units, '#,##0');
    addMetricRow(ws, 'Density (Units/Acre)', calc.density_units_per_acre, '#,##0.0');
    addMetricRow(ws, 'Efficiency Ratio', onePager.efficiency_ratio, '0.0%');
    addMetricRow(ws, 'Total NRSF', calc.total_nrsf, '#,##0');
    addMetricRow(ws, 'Total GBSF', calc.total_gbsf, '#,##0');

    // Revenue
    addSectionHeader(ws, 'Revenue');
    addMetricRow(ws, 'Gross Potential Rent', calc.gross_potential_rent, '$#,##0');
    addMetricRow(ws, 'Other Income ($/unit/mo)', onePager.other_income_per_unit_month, '$#,##0.00');
    addMetricRow(ws, 'GPR + Other Income', calc.gross_potential_revenue, '$#,##0');
    addMetricRow(ws, 'Vacancy & Loss', onePager.vacancy_rate, '0.0%');
    addTotalRow(ws, 'Net Revenue', calc.net_revenue, '$#,##0');

    // Development Budget
    addSectionHeader(ws, 'Development Budget');
    addMetricRow(ws, 'Hard Cost ($/NRSF)', onePager.hard_cost_per_nrsf, '$#,##0.00');
    addMetricRow(ws, 'Hard Cost (Total)', calc.hard_cost, '$#,##0');
    addMetricRow(ws, 'Hard Cost ($/GBSF)', calc.hard_cost_per_gbsf, '$#,##0.00');
    addMetricRow(ws, 'Land Cost', onePager.land_cost, '$#,##0');
    addMetricRow(ws, 'Land $/Unit', calc.land_cost_per_unit, '$#,##0');
    addMetricRow(ws, 'Soft Cost %', onePager.soft_cost_pct, '0.0%');
    addMetricRow(ws, 'Soft Cost (Total)', calc.soft_cost, '$#,##0');
    addTotalRow(ws, 'Total Budget', calc.total_budget, '$#,##0');
    addMetricRow(ws, 'Cost / Unit', calc.cost_per_unit, '$#,##0');
    addMetricRow(ws, 'Cost / NRSF', calc.cost_per_nrsf, '$#,##0.00');

    // Operating Expenses
    addSectionHeader(ws, 'Operating Expenses');
    addMetricRow(ws, 'Utilities', onePager.opex_utilities, '$#,##0');
    addMetricRow(ws, 'Repairs & Maint.', onePager.opex_repairs_maintenance, '$#,##0');
    addMetricRow(ws, 'Contract Svcs', onePager.opex_contract_services, '$#,##0');
    addMetricRow(ws, 'Marketing', onePager.opex_marketing, '$#,##0');
    addMetricRow(ws, 'G&A', onePager.opex_general_admin, '$#,##0');
    addMetricRow(ws, 'Turnover', onePager.opex_turnover, '$#,##0');
    addMetricRow(ws, 'Insurance', onePager.opex_insurance, '$#,##0');
    addMetricRow(ws, 'Mgmt Fee', onePager.mgmt_fee_pct, '0.0%');
    addTotalRow(ws, 'Total OpEx', calc.total_opex, '$#,##0');
    addMetricRow(ws, 'OpEx / Unit', calc.opex_per_unit, '$#,##0');

    // Property Tax
    addSectionHeader(ws, 'Property Tax');
    addMetricRow(ws, 'Mil Rate', onePager.tax_mil_rate, '0.0000');
    addMetricRow(ws, 'Assessed Value', calc.assessed_value, '$#,##0');
    addMetricRow(ws, 'Annual Property Tax', calc.property_tax_total, '$#,##0');
    addMetricRow(ws, 'Tax / Unit', calc.property_tax_per_unit, '$#,##0');

    // ==================== Unit Mix Sheet ====================
    const unitMix = (onePager.unit_mix || []).filter((r) => r.unit_count > 0).sort((a, b) => a.sort_order - b.sort_order);
    if (unitMix.length > 0) {
        const umWs = wb.addWorksheet('Unit Mix');
        umWs.columns = [
            { header: 'Type', width: 18 },
            { header: '# Units', width: 10 },
            { header: 'Avg SF', width: 10 },
            { header: 'Total SF', width: 12 },
            { header: 'Rent/SF', width: 10 },
            { header: 'Mo. Rent', width: 12 },
            { header: 'Annual Rev', width: 14 },
        ];

        // Header styling
        const headerRow = umWs.getRow(1);
        headerRow.eachCell((cell) => {
            cell.fill = HEADER_FILL;
            cell.font = HEADER_FONT;
            cell.alignment = { horizontal: 'center' };
        });

        unitMix.forEach((row) => {
            const totalSf = row.unit_count * row.avg_unit_sf;
            const monthlyRent = row.rent_input_mode === 'per_sf'
                ? row.rent_per_sf * row.avg_unit_sf
                : row.rent_whole_dollar;
            const rentPerSf = row.avg_unit_sf > 0 ? monthlyRent / row.avg_unit_sf : 0;
            const annualRev = row.unit_count * monthlyRent * 12;

            const r = umWs.addRow([
                row.unit_type_label,
                row.unit_count,
                row.avg_unit_sf,
                totalSf,
                rentPerSf,
                monthlyRent,
                annualRev,
            ]);
            r.getCell(2).numFmt = '#,##0';
            r.getCell(3).numFmt = '#,##0';
            r.getCell(4).numFmt = '#,##0';
            r.getCell(5).numFmt = '$#,##0.00';
            r.getCell(6).numFmt = '$#,##0';
            r.getCell(7).numFmt = '$#,##0';
            r.eachCell((cell) => { cell.border = BORDER_STYLE; });
        });
    }

    // ==================== Download ====================
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${onePager.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
