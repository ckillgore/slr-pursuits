import ExcelJS from 'exceljs';
import type { Pursuit, PredevBudget, PredevBudgetLineItem, PredevScheduleItem } from '@/types';

// Formatting helpers
function getMonthKeyLabel(mk: string) {
    const [y, m] = mk.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

interface ExportOptions {
    pursuit: Pursuit;
    budget: PredevBudget;
    lineItems: PredevBudgetLineItem[];
    monthKeys: string[];
    closedMonths: string[];
    forwardMonths: string[];
    expandLTD: boolean;
    getCellInfo: (li: PredevBudgetLineItem, month: string) => { value: number };
    rowTotal: (li: PredevBudgetLineItem) => number;
    hasUnallocated?: boolean;
    unallocatedByMonth?: Map<string, number>;
    viewMode: string;
    showSchedule?: boolean;
    scheduleItems?: PredevScheduleItem[];
}

export async function exportPredevBudgetToExcel({
    pursuit, budget, lineItems, monthKeys, closedMonths, forwardMonths,
    expandLTD, getCellInfo, rowTotal, hasUnallocated, unallocatedByMonth, viewMode,
    showSchedule, scheduleItems
}: ExportOptions) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SLR Pursuits';
    const sheetName = viewMode === 'budget' ? 'Budget' : viewMode === 'forecast' ? 'Forecast' : 'Variance';
    const ws = wb.addWorksheet(`Pre-Dev ${sheetName}`, { properties: { defaultColWidth: 14 } });
    
    // Header Style
    const HEAD_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1F2B' } };
    const HEAD_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    const BORDER: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: 'FFE2E5EA' } }, top: { style: 'thin', color: { argb: 'FFE2E5EA' } }, right: { style: 'thin', color: { argb: 'FFE2E5EA' } } };

    // Set First Column wider
    ws.getColumn(1).width = 40;

    // Title Row
    ws.addRow([`${pursuit.name} - Pre-Development ${sheetName}`]).font = { bold: true, size: 14 };
    ws.addRow([`Generated ${new Date().toLocaleDateString('en-US')}`]).font = { italic: true, size: 10, color: { argb: 'FF7A8599' } };
    ws.addRow([]);

    // Determine Columns
    const cols = ['Line Item Segment'];
    if (closedMonths.length > 0 && !expandLTD && viewMode !== 'budget') {
        cols.push('LTD Actuals');
    }
    if (expandLTD && viewMode !== 'budget') {
        closedMonths.forEach(mk => cols.push(`Act ${getMonthKeyLabel(mk)}`));
    }
    forwardMonths.forEach(mk => cols.push(`Proj ${getMonthKeyLabel(mk)}`));
    cols.push('Total Amount');

    // Add Schedule if requested
    if (showSchedule && scheduleItems && scheduleItems.length > 0) {
        ws.addRow(['Pre-Development Schedule']).font = { bold: true, color: { argb: 'FF1A1F2B' } };
        
        // Group items
        const grouped = scheduleItems.reduce((acc, item) => {
            const sec = item.section || 'General';
            if (!acc[sec]) acc[sec] = [];
            acc[sec].push(item);
            return acc;
        }, {} as Record<string, PredevScheduleItem[]>);

        Object.entries(grouped).forEach(([section, items]) => {
            const secRow = ws.addRow([section]);
            secRow.font = { bold: true, italic: true };
            items.forEach(item => {
                const sRow = ws.addRow([`  ${item.label}`, `${item.start_date ? item.start_date : 'TBD'} (${item.duration_weeks} wks)`]);
                sRow.font = { color: { argb: 'FF4B5563' } };
            });
        });
        ws.addRow([]);
    }

    const headerRow = ws.addRow(cols);
    headerRow.eachCell((cell) => {
        cell.fill = HEAD_FILL;
        cell.font = HEAD_FONT;
        cell.alignment = { horizontal: 'center' };
    });

    // Write Line Items
    lineItems.forEach(li => {
        const trData: any[] = [li.label];
        if (closedMonths.length > 0 && !expandLTD && viewMode !== 'budget') {
            const sum = closedMonths.reduce((s, mk) => s + getCellInfo(li, mk).value, 0);
            trData.push(sum);
        }
        if (expandLTD && viewMode !== 'budget') {
            closedMonths.forEach(mk => trData.push(getCellInfo(li, mk).value));
        }
        forwardMonths.forEach(mk => trData.push(getCellInfo(li, mk).value));
        trData.push(rowTotal(li));

        const dataRow = ws.addRow(trData);
        dataRow.eachCell((cell, i) => {
            cell.border = BORDER;
            if (i > 1) cell.numFmt = '#,##0';
        });
    });

    if (hasUnallocated && viewMode !== 'budget' && unallocatedByMonth) {
        const unAllocTr: any[] = ['Unallocated Job Costs'];
        let unallocTotal = 0;
        
        if (closedMonths.length > 0 && !expandLTD) {
            const sum = closedMonths.reduce((s, mk) => s + (unallocatedByMonth.get(mk) || 0), 0);
            unallocTotal += sum;
            unAllocTr.push(sum);
        }
        if (expandLTD) {
            closedMonths.forEach(mk => {
                const val = unallocatedByMonth.get(mk) || 0;
                unallocTotal += val;
                unAllocTr.push(val);
            });
        }
        forwardMonths.forEach(mk => unAllocTr.push(0)); // no forward unalloc
        unAllocTr.push(unallocTotal);

        const uRow = ws.addRow(unAllocTr);
        uRow.font = { color: { argb: 'FFD97706' }, italic: true };
        uRow.eachCell((cell, i) => { cell.border = BORDER; if (i > 1) cell.numFmt = '#,##0'; });
    }

    // Download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pursuit.name.replace(/[^a-zA-Z0-9-_]/g, '')}_PreDev_${sheetName}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
