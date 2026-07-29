'use client';

/**
 * Generic PDF renderer for a TableExportSpec — the PDF counterpart to
 * exportTableToExcel. Wide tables (the Pre-Dev month matrix) are split into
 * column chunks across pages, with the label columns repeated on each page.
 */

import {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import {
    type TableExportSpec,
    type ExportColumn,
    type ExportRow,
    formatCell,
    alignFor,
} from './tableExport';

Font.register({
    family: 'Inter',
    fonts: [
        { src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf', fontWeight: 400 },
        { src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf', fontWeight: 600 },
        { src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf', fontWeight: 700 },
    ],
});

const colors = {
    primary: '#1A1F2B',
    secondary: '#4A5568',
    muted: '#7A8599',
    light: '#A0AABB',
    accent: '#2563EB',
    border: '#E2E5EA',
    groupBg: '#F4F5F7',
    subtotalBg: '#EEF2FF',
    totalBg: '#E2E5EA',
    white: '#FFFFFF',
};

/** Columns that fit legibly on one landscape LETTER page. */
const MAX_COLS_PER_PAGE = 16;

function chunkColumns(total: number, frozen: number): number[][] {
    const dataIdx = Array.from({ length: total - frozen }, (_, i) => i + frozen);
    const perPage = Math.max(1, MAX_COLS_PER_PAGE - frozen);
    if (dataIdx.length === 0) return [[]];
    const chunks: number[][] = [];
    for (let i = 0; i < dataIdx.length; i += perPage) {
        chunks.push(dataIdx.slice(i, i + perPage));
    }
    return chunks;
}

function weightFor(col: ExportColumn): number {
    if (col.weight) return col.weight;
    switch (col.type) {
        case 'text':
        case undefined: return 2.0;
        case 'currency': return 1.3;
        case 'date': return 1.3;
        default: return 1.0;
    }
}

export interface TablePDFProps {
    spec: TableExportSpec;
}

export function TablePDF({ spec }: TablePDFProps) {
    const { columns, rows } = spec;
    const frozen = Math.min(spec.frozenCols ?? 0, columns.length);
    const frozenIdx = Array.from({ length: frozen }, (_, i) => i);
    const chunks = chunkColumns(columns.length, frozen);

    const maxColsOnAPage = Math.max(...chunks.map(c => c.length + frozen));
    const fontSize = maxColsOnAPage > 14 ? 5 : maxColsOnAPage > 10 ? 6 : 7;
    const headerFontSize = maxColsOnAPage > 14 ? 5 : maxColsOnAPage > 10 ? 5.5 : 6;
    const isLandscape = maxColsOnAPage > 8;

    const s = StyleSheet.create({
        page: {
            fontFamily: 'Inter',
            fontSize,
            padding: isLandscape ? 20 : 30,
            color: colors.primary,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 10,
            paddingBottom: 6,
            borderBottomWidth: 2,
            borderBottomColor: colors.accent,
        },
        title: { fontSize: 12, fontWeight: 700, color: colors.primary },
        subtitle: { fontSize: 8, color: colors.muted, marginTop: 2 },
        dateText: { fontSize: 6, color: colors.light, marginTop: 2 },
        metrics: {
            flexDirection: 'row',
            marginBottom: 10,
            gap: 6,
        },
        metricCard: {
            flex: 1,
            borderWidth: 0.5,
            borderColor: colors.border,
            borderRadius: 3,
            paddingVertical: 4,
            paddingHorizontal: 6,
        },
        metricLabel: {
            fontSize: 5.5,
            color: colors.muted,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            marginBottom: 1,
        },
        metricValue: { fontSize: 9, fontWeight: 700, color: colors.primary },
        tableHeader: {
            flexDirection: 'row',
            backgroundColor: colors.primary,
            paddingVertical: 4,
            paddingHorizontal: 2,
        },
        headerCell: {
            fontSize: headerFontSize,
            fontWeight: 700,
            color: colors.white,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
        },
        dataRow: {
            flexDirection: 'row',
            paddingVertical: 2.5,
            paddingHorizontal: 2,
            borderBottomWidth: 0.5,
            borderBottomColor: '#F0F1F4',
        },
        dataCell: { fontSize, color: colors.secondary },
        groupRow: {
            flexDirection: 'row',
            backgroundColor: colors.groupBg,
            paddingVertical: 3,
            paddingHorizontal: 2,
        },
        groupCell: { fontSize: fontSize + 0.5, fontWeight: 700, color: colors.primary },
        subtotalRow: {
            flexDirection: 'row',
            backgroundColor: colors.subtotalBg,
            paddingVertical: 2.5,
            paddingHorizontal: 2,
        },
        subtotalCell: { fontSize, fontWeight: 600, color: colors.secondary },
        totalRow: {
            flexDirection: 'row',
            backgroundColor: colors.totalBg,
            paddingVertical: 3,
            paddingHorizontal: 2,
        },
        totalCell: { fontSize: fontSize + 0.5, fontWeight: 700, color: colors.primary },
        footer: {
            position: 'absolute',
            bottom: 14,
            left: isLandscape ? 20 : 30,
            right: isLandscape ? 20 : 30,
            flexDirection: 'row',
            justifyContent: 'space-between',
            fontSize: 5,
            color: colors.light,
        },
    });

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    function rowStyles(kind: ExportRow['kind']) {
        switch (kind) {
            case 'group': return { row: s.groupRow, cell: s.groupCell };
            case 'subtotal': return { row: s.subtotalRow, cell: s.subtotalCell };
            case 'total': return { row: s.totalRow, cell: s.totalCell };
            default: return { row: s.dataRow, cell: s.dataCell };
        }
    }

    return (
        <Document>
            {chunks.map((chunk, chunkIdx) => {
                const pageCols = [...frozenIdx, ...chunk];
                const weights = pageCols.map(i => weightFor(columns[i]));
                const totalWeight = weights.reduce((sum, w) => sum + w, 0);
                const widths = weights.map(w => `${((w / totalWeight) * 100).toFixed(1)}%`);

                const continuedLabel = chunks.length > 1
                    ? ` · Columns ${chunk[0] - frozen + 1}–${chunk[chunk.length - 1] - frozen + 1} of ${columns.length - frozen}`
                    : '';

                return (
                    <Page
                        key={`chunk-${chunkIdx}`}
                        size="LETTER"
                        orientation={isLandscape ? 'landscape' : 'portrait'}
                        style={s.page}
                    >
                        {/* Header */}
                        <View style={s.header}>
                            <View>
                                <Text style={s.title}>{spec.title}</Text>
                                <Text style={s.subtitle}>
                                    {spec.subtitle ? `${spec.subtitle}` : ''}{continuedLabel}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Image src="/images/slr-logo.png" style={{ width: 80, height: 'auto', marginBottom: 2 }} />
                                <Text style={s.dateText}>{dateStr}</Text>
                            </View>
                        </View>

                        {/* Summary metrics — first page only */}
                        {chunkIdx === 0 && spec.metrics && spec.metrics.length > 0 && (
                            <View style={s.metrics}>
                                {spec.metrics.map(m => (
                                    <View key={m.label} style={s.metricCard}>
                                        <Text style={s.metricLabel}>{m.label}</Text>
                                        <Text style={s.metricValue}>{m.value}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Table header */}
                        <View style={s.tableHeader} fixed>
                            {pageCols.map((colIdx, i) => (
                                <Text
                                    key={`h-${colIdx}`}
                                    style={{
                                        ...s.headerCell,
                                        width: widths[i],
                                        textAlign: alignFor(columns[colIdx]),
                                    }}
                                >
                                    {columns[colIdx].label}
                                </Text>
                            ))}
                        </View>

                        {/* Rows */}
                        {rows.map((row, rowIdx) => {
                            const st = rowStyles(row.kind);
                            return (
                                <View key={`r-${rowIdx}`} style={st.row} wrap={false}>
                                    {pageCols.map((colIdx, i) => {
                                        const col = columns[colIdx];
                                        const raw = row.cells[colIdx] ?? null;
                                        const indent = colIdx === 0 && row.depth ? '  '.repeat(row.depth) : '';
                                        // Group headers carry a label in the first cell only.
                                        const text = row.kind === 'group' && colIdx !== 0 && raw === null
                                            ? ''
                                            : `${indent}${formatCell(col, raw)}`;
                                        return (
                                            <Text
                                                key={`c-${colIdx}`}
                                                style={{
                                                    ...st.cell,
                                                    width: widths[i],
                                                    textAlign: alignFor(col),
                                                }}
                                            >
                                                {text}
                                            </Text>
                                        );
                                    })}
                                </View>
                            );
                        })}

                        {/* Footer */}
                        <View style={s.footer} fixed>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Image src="/images/slr-logo.png" style={{ width: 50, height: 'auto' }} />
                                <Text> · {spec.title}</Text>
                            </View>
                            <Text>Generated {dateStr}</Text>
                        </View>
                    </Page>
                );
            })}
        </Document>
    );
}
