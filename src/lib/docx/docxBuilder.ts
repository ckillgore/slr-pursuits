/**
 * docxBuilder.ts — Programmatic DOCX generation for Investment Memos
 *
 * Uses the `docx` npm package to build a professional Word document
 * with a title page, parsed narrative sections, and inline data exhibits.
 */

import {
    Document,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    HeadingLevel,
    BorderStyle,
    ImageRun,
    PageBreak,
    ShadingType,
    TableLayoutType,
    Packer,
    type ITableCellBorders,
    type ISectionOptions,
} from 'docx';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface MemoDocxData {
    pursuit: {
        name: string;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
        county?: string;
        latitude?: number | null;
        longitude?: number | null;
        executive_memo?: string | null;
    };
    onePager: {
        name: string;
        total_units: number;
        efficiency_ratio: number;
        vacancy_rate: number;
        other_income_per_unit_month: number;
        hard_cost_per_nrsf: number;
        land_cost: number;
        soft_cost_pct: number;
        mgmt_fee_pct: number;
        calc_total_nrsf?: number;
        calc_total_gbsf?: number;
        calc_gpr?: number;
        calc_net_revenue?: number;
        calc_total_budget?: number;
        calc_hard_cost?: number;
        calc_soft_cost?: number;
        calc_total_opex?: number;
        calc_noi?: number;
        calc_yoc?: number;
        calc_cost_per_unit?: number;
        calc_noi_per_unit?: number;
    } | null;
    rentComps: {
        name: string;
        units?: number | null;
        yearBuilt?: number | null;
        askingRent?: number | null;
        effectiveRent?: number | null;
        occupancy?: number | null;
    }[];
    landComps: {
        name: string;
        acres?: number | null;
        salePrice?: number | null;
        pricePerAcre?: number | null;
        pricePerSf?: number | null;
        saleDate?: string | null;
        buyer?: string | null;
    }[];
    saleComps: {
        name: string;
        units?: number | null;
        yearBuilt?: number | null;
        salePrice?: number | null;
        pricePerUnit?: number | null;
        capRate?: number | null;
        saleDate?: string | null;
    }[];
    mapImageBuffer?: Buffer | null;
}

// ═══════════════════════════════════════════════════════════════
// Styling Constants
// ═══════════════════════════════════════════════════════════════

const FONT = 'Calibri';
const FONT_SERIF = 'Cambria';
const ACCENT = '1F3864'; // dark navy
const ACCENT_LIGHT = 'D6E4F0'; // light blue for table headers
const BORDER_COLOR = 'B4B4B4';
const TEXT_MUTED = '666666';

const THIN_BORDER: ITableCellBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
};

const NO_BORDER: ITableCellBorders = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 },
};

// ═══════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════

function fmtCurrency(value: number | null | undefined, decimals = 0): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

function fmtNumber(value: number | null | undefined): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-US').format(value);
}

function fmtPercent(value: number | null | undefined, decimals = 2): string {
    if (value == null) return '—';
    return `${(value * 100).toFixed(decimals)}%`;
}

// ═══════════════════════════════════════════════════════════════
// HTML → Paragraphs Parser (simple, handles basic tags)
// ═══════════════════════════════════════════════════════════════

interface ParsedBlock {
    type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'listItem' | 'table';
    text?: string;
    bold?: boolean;
    tableRows?: string[][];
}

function parseHtmlToBlocks(html: string): ParsedBlock[] {
    if (!html) return [];
    const blocks: ParsedBlock[] = [];

    // Remove <div> wrappers
    let cleaned = html.replace(/<\/?div[^>]*>/gi, '');

    // Split into block-level elements
    const blockRegex = /<(h[1-3]|p|li|tr)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;

    // Also handle tables specifically
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    const tablePositions: { start: number; end: number; rows: string[][] }[] = [];

    while ((tableMatch = tableRegex.exec(cleaned)) !== null) {
        const tableHtml = tableMatch[1];
        const rows: string[][] = [];
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
            const cells: string[] = [];
            const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
            let cellMatch;
            while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
                cells.push(stripTags(cellMatch[1]).trim());
            }
            if (cells.length > 0) rows.push(cells);
        }
        if (rows.length > 0) {
            tablePositions.push({ start: tableMatch.index, end: tableMatch.index + tableMatch[0].length, rows });
        }
    }

    // Process non-table content
    let lastIndex = 0;
    for (const tp of tablePositions) {
        // Process text between last position and this table
        const segment = cleaned.substring(lastIndex, tp.start);
        blocks.push(...parseSegment(segment));
        blocks.push({ type: 'table', tableRows: tp.rows });
        lastIndex = tp.end;
    }
    // Process remaining text after last table
    if (lastIndex < cleaned.length) {
        blocks.push(...parseSegment(cleaned.substring(lastIndex)));
    }

    return blocks;
}

function parseSegment(html: string): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    const regex = /<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        const tag = match[1].toLowerCase();
        const content = stripTags(match[2]).trim();
        if (!content) continue;

        if (tag === 'h1') blocks.push({ type: 'heading1', text: content });
        else if (tag === 'h2') blocks.push({ type: 'heading2', text: content });
        else if (tag === 'h3') blocks.push({ type: 'heading3', text: content });
        else if (tag === 'li') blocks.push({ type: 'listItem', text: content });
        else blocks.push({ type: 'paragraph', text: content });
    }

    // If regex found nothing, treat the whole thing as a paragraph
    if (blocks.length === 0) {
        const text = stripTags(html).trim();
        if (text) blocks.push({ type: 'paragraph', text });
    }

    return blocks;
}

function stripTags(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&rsquo;/g, "'")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .trim();
}

// ═══════════════════════════════════════════════════════════════
// DOCX Component Builders
// ═══════════════════════════════════════════════════════════════

function createExhibitHeader(label: string): Paragraph {
    return new Paragraph({
        spacing: { before: 400, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: ACCENT } },
        children: [
            new TextRun({
                text: label,
                font: FONT_SERIF,
                size: 26,
                bold: true,
                color: ACCENT,
            }),
        ],
    });
}

function createKeyValueTable(rows: { label: string; value: string }[]): Table {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: rows.map((row, i) =>
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 55, type: WidthType.PERCENTAGE },
                        borders: THIN_BORDER,
                        shading: i % 2 === 0 ? { type: ShadingType.CLEAR, fill: 'F8F9FA' } : undefined,
                        children: [
                            new Paragraph({
                                spacing: { before: 40, after: 40 },
                                children: [new TextRun({ text: row.label, font: FONT, size: 19, color: TEXT_MUTED })],
                            }),
                        ],
                    }),
                    new TableCell({
                        width: { size: 45, type: WidthType.PERCENTAGE },
                        borders: THIN_BORDER,
                        shading: i % 2 === 0 ? { type: ShadingType.CLEAR, fill: 'F8F9FA' } : undefined,
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                spacing: { before: 40, after: 40 },
                                children: [new TextRun({ text: row.value, font: FONT, size: 19, bold: true })],
                            }),
                        ],
                    }),
                ],
            })
        ),
    });
}

function createDataTableFromArrays(headers: string[], dataRows: string[][], headerBg = ACCENT_LIGHT): Table {
    const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map(h =>
            new TableCell({
                borders: THIN_BORDER,
                shading: { type: ShadingType.CLEAR, fill: headerBg },
                children: [
                    new Paragraph({
                        spacing: { before: 40, after: 40 },
                        children: [new TextRun({ text: h, font: FONT, size: 18, bold: true, color: ACCENT })],
                    }),
                ],
            })
        ),
    });

    const rows = dataRows.map((cells, ri) =>
        new TableRow({
            children: cells.map(cell =>
                new TableCell({
                    borders: THIN_BORDER,
                    shading: ri % 2 === 0 ? undefined : { type: ShadingType.CLEAR, fill: 'F8F9FA' },
                    children: [
                        new Paragraph({
                            spacing: { before: 30, after: 30 },
                            children: [new TextRun({ text: cell, font: FONT, size: 18 })],
                        }),
                    ],
                })
            ),
        })
    );

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [headerRow, ...rows],
    });
}

// ═══════════════════════════════════════════════════════════════
// Main Builder
// ═══════════════════════════════════════════════════════════════

export async function buildMemoDocx(data: MemoDocxData): Promise<Buffer> {
    const { pursuit, onePager, rentComps, landComps, saleComps, mapImageBuffer } = data;
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const addressLine = [pursuit.address, pursuit.city, pursuit.state, pursuit.zip].filter(Boolean).join(', ');

    // ──── TITLE PAGE ────
    const titleSection: Paragraph[] = [
        new Paragraph({ spacing: { before: 2400 }, children: [] }), // top spacer
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
                new TextRun({
                    text: 'DEAL SUMMARY MEMORANDUM',
                    font: FONT_SERIF,
                    size: 36,
                    bold: true,
                    color: ACCENT,
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: ACCENT } },
            children: [
                new TextRun({
                    text: 'Confidential — For Internal Distribution Only',
                    font: FONT,
                    size: 18,
                    italics: true,
                    color: TEXT_MUTED,
                }),
            ],
        }),
        new Paragraph({ spacing: { before: 600 }, children: [] }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
                new TextRun({ text: pursuit.name, font: FONT_SERIF, size: 32, bold: true }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
                new TextRun({ text: addressLine || 'Address TBD', font: FONT, size: 22, color: TEXT_MUTED }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
                new TextRun({ text: today, font: FONT, size: 20, color: TEXT_MUTED }),
            ],
        }),
    ];

    // Cover page KPI table
    if (onePager) {
        const coverKpis = [
            { label: 'Total Units', value: fmtNumber(onePager.total_units) },
            { label: 'Total Development Budget', value: fmtCurrency(onePager.calc_total_budget) },
            { label: 'Cost Per Unit', value: fmtCurrency(onePager.calc_cost_per_unit) },
            { label: 'Stabilized NOI', value: fmtCurrency(onePager.calc_noi) },
            { label: 'Yield on Cost', value: fmtPercent(onePager.calc_yoc) },
        ];
        titleSection.push(createKeyValueTable(coverKpis));
    }

    // ──── NARRATIVE SECTIONS ────
    const narrativeChildren: (Paragraph | Table)[] = [];
    const blocks = parseHtmlToBlocks(pursuit.executive_memo || '');

    for (const block of blocks) {
        if (block.type === 'heading1') {
            narrativeChildren.push(new Paragraph({
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 360, after: 160 },
                children: [new TextRun({ text: block.text!, font: FONT_SERIF, size: 28, bold: true, color: ACCENT })],
            }));
        } else if (block.type === 'heading2') {
            narrativeChildren.push(new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 280, after: 120 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR } },
                children: [new TextRun({ text: block.text!, font: FONT_SERIF, size: 24, bold: true, color: ACCENT })],
            }));
        } else if (block.type === 'heading3') {
            narrativeChildren.push(new Paragraph({
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 200, after: 80 },
                children: [new TextRun({ text: block.text!, font: FONT_SERIF, size: 22, bold: true })],
            }));
        } else if (block.type === 'listItem') {
            narrativeChildren.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 40, after: 40 },
                children: [new TextRun({ text: block.text!, font: FONT, size: 20 })],
            }));
        } else if (block.type === 'table' && block.tableRows) {
            const headers = block.tableRows[0] || [];
            const dataRows = block.tableRows.slice(1);
            if (headers.length > 0) {
                narrativeChildren.push(new Paragraph({ spacing: { before: 120 }, children: [] }));
                narrativeChildren.push(createDataTableFromArrays(headers, dataRows));
                narrativeChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
            }
        } else {
            narrativeChildren.push(new Paragraph({
                spacing: { before: 60, after: 60 },
                children: [new TextRun({ text: block.text!, font: FONT, size: 20 })],
            }));
        }
    }

    // ──── EXHIBIT: LOCATION MAP ────
    const exhibitChildren: (Paragraph | Table)[] = [];

    if (mapImageBuffer) {
        exhibitChildren.push(new Paragraph({ children: [new PageBreak()] }));
        exhibitChildren.push(createExhibitHeader('Exhibit A: Site & Location Map'));
        exhibitChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new ImageRun({
                    data: mapImageBuffer,
                    transformation: { width: 580, height: 400 },
                    type: 'png',
                }),
            ],
        }));
        exhibitChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80 },
            children: [new TextRun({ text: addressLine, font: FONT, size: 18, italics: true, color: TEXT_MUTED })],
        }));
    }

    // ──── EXHIBIT: FINANCIAL SUMMARY ────
    if (onePager) {
        exhibitChildren.push(new Paragraph({ children: [new PageBreak()] }));
        exhibitChildren.push(createExhibitHeader(`Exhibit ${mapImageBuffer ? 'B' : 'A'}: Financial Summary — ${onePager.name}`));

        // Development Program
        exhibitChildren.push(new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [new TextRun({ text: 'Development Program', font: FONT, size: 20, bold: true, color: ACCENT })],
        }));
        exhibitChildren.push(createKeyValueTable([
            { label: 'Total Units', value: fmtNumber(onePager.total_units) },
            { label: 'Total NRSF', value: fmtNumber(onePager.calc_total_nrsf) },
            { label: 'Total GBSF', value: fmtNumber(onePager.calc_total_gbsf) },
            { label: 'Efficiency Ratio', value: fmtPercent(onePager.efficiency_ratio) },
            { label: 'Avg Unit Size', value: onePager.calc_total_nrsf && onePager.total_units ? `${fmtNumber(Math.round(onePager.calc_total_nrsf / onePager.total_units))} SF` : '—' },
        ]));

        // Budget
        exhibitChildren.push(new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: 'Development Budget', font: FONT, size: 20, bold: true, color: ACCENT })],
        }));
        exhibitChildren.push(createKeyValueTable([
            { label: 'Hard Cost ($/NRSF)', value: fmtCurrency(onePager.hard_cost_per_nrsf) },
            { label: 'Hard Cost (Total)', value: fmtCurrency(onePager.calc_hard_cost) },
            { label: 'Soft Cost %', value: fmtPercent(onePager.soft_cost_pct) },
            { label: 'Soft Cost (Total)', value: fmtCurrency(onePager.calc_soft_cost) },
            { label: 'Land Cost', value: fmtCurrency(onePager.land_cost) },
            { label: 'Total Budget', value: fmtCurrency(onePager.calc_total_budget) },
            { label: 'Cost Per Unit', value: fmtCurrency(onePager.calc_cost_per_unit) },
        ]));

        // Returns
        exhibitChildren.push(new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: 'Return Metrics', font: FONT, size: 20, bold: true, color: ACCENT })],
        }));
        exhibitChildren.push(createKeyValueTable([
            { label: 'Gross Potential Rent', value: fmtCurrency(onePager.calc_gpr) },
            { label: 'Net Revenue', value: fmtCurrency(onePager.calc_net_revenue) },
            { label: 'Total OpEx', value: fmtCurrency(onePager.calc_total_opex) },
            { label: 'Stabilized NOI', value: fmtCurrency(onePager.calc_noi) },
            { label: 'NOI Per Unit', value: fmtCurrency(onePager.calc_noi_per_unit) },
            { label: 'Yield on Cost (YOC)', value: fmtPercent(onePager.calc_yoc) },
            { label: 'Mgmt Fee %', value: fmtPercent(onePager.mgmt_fee_pct) },
        ]));
    }

    // ──── EXHIBIT: RENT COMPS ────
    if (rentComps.length > 0) {
        const exhibitLetter = mapImageBuffer && onePager ? 'C' : mapImageBuffer || onePager ? 'B' : 'A';
        exhibitChildren.push(new Paragraph({ children: [new PageBreak()] }));
        exhibitChildren.push(createExhibitHeader(`Exhibit ${exhibitLetter}: Competitive Rent Analysis`));

        exhibitChildren.push(createDataTableFromArrays(
            ['Property', 'Units', 'Year Built', 'Asking Rent', 'Effective Rent', 'Occupancy'],
            rentComps.map(c => [
                c.name,
                c.units != null ? String(c.units) : '—',
                c.yearBuilt != null ? String(c.yearBuilt) : '—',
                fmtCurrency(c.askingRent),
                fmtCurrency(c.effectiveRent),
                c.occupancy != null ? `${c.occupancy.toFixed(1)}%` : '—',
            ])
        ));
    }

    // ──── EXHIBIT: LAND COMPS ────
    if (landComps.length > 0) {
        exhibitChildren.push(new Paragraph({ children: [new PageBreak()] }));
        exhibitChildren.push(createExhibitHeader('Land Comparable Sales'));

        exhibitChildren.push(createDataTableFromArrays(
            ['Property', 'Acres', 'Sale Price', '$/Acre', '$/SF', 'Date', 'Buyer'],
            landComps.map(c => [
                c.name,
                c.acres != null ? c.acres.toFixed(2) : '—',
                fmtCurrency(c.salePrice),
                fmtCurrency(c.pricePerAcre),
                c.pricePerSf != null ? `$${c.pricePerSf.toFixed(2)}` : '—',
                c.saleDate || '—',
                c.buyer || '—',
            ])
        ));
    }

    // ──── EXHIBIT: SALE COMPS ────
    if (saleComps.length > 0) {
        exhibitChildren.push(new Paragraph({ children: [new PageBreak()] }));
        exhibitChildren.push(createExhibitHeader('Investment Sale Comparables'));

        exhibitChildren.push(createDataTableFromArrays(
            ['Property', 'Units', 'Year Built', 'Sale Price', '$/Unit', 'Cap Rate', 'Date'],
            saleComps.map(c => [
                c.name,
                c.units != null ? String(c.units) : '—',
                c.yearBuilt != null ? String(c.yearBuilt) : '—',
                fmtCurrency(c.salePrice),
                fmtCurrency(c.pricePerUnit),
                c.capRate != null ? `${(c.capRate * 100).toFixed(2)}%` : '—',
                c.saleDate || '—',
            ])
        ));
    }

    // ──── ASSEMBLE DOCUMENT ────
    const sections: ISectionOptions[] = [
        // Title page
        {
            properties: {
                page: {
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
                },
            },
            children: titleSection,
        },
        // Main content
        {
            properties: {
                page: {
                    margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
                },
            },
            children: [...narrativeChildren, ...exhibitChildren],
        },
    ];

    const doc = new Document({
        creator: 'SLR Pursuits',
        title: `Deal Summary — ${pursuit.name}`,
        description: `Investment memo for ${pursuit.name}`,
        sections,
    });

    return Buffer.from(await Packer.toBuffer(doc));
}
