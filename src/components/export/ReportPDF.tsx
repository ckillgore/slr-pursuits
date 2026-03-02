'use client';

/**
 * PDF export for report data using @react-pdf/renderer.
 * Dynamically adjusts page orientation and font size based on column count.
 * Renders grouped data with subtotals and a grand total row.
 */

import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import type { ReportConfig, ReportFieldKey, PursuitStage, ReportDataSource } from '@/types';
import type { ReportRow } from '@/lib/supabase/queries';
import type { GroupNode } from '@/hooks/useReportEngine';
import { REPORT_FIELD_MAP } from '@/lib/reportFields';

// Register Inter font
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
    bgLight: '#F4F5F7',
    groupBg: '#F4F5F7',
    subtotalBg: '#EEF2FF',
    totalBg: '#E2E5EA',
    white: '#FFFFFF',
};

// ── Source label ──────────────────────────────────────────────
function sourceLabel(ds: ReportDataSource): string {
    switch (ds) {
        case 'pursuits': return 'Pursuits Report';
        case 'land_comps': return 'Land Comps Report';
        case 'rent_comps': return 'Rent Comps Report';
        case 'key_dates': return 'Key Dates Report';
        case 'predev_budgets': return 'Pre-Dev Budgets Report';
        default: return 'Report';
    }
}

// ── Column width calculation ─────────────────────────────────
function getColumnWidths(columns: ReportFieldKey[]): string[] {
    const defs = columns.map(k => REPORT_FIELD_MAP[k]);
    // Proportional weights by type
    const weights = defs.map(fd => {
        if (!fd) return 1;
        switch (fd.type) {
            case 'text': return 2.0;
            case 'currency': return 1.3;
            case 'percent': return 1.0;
            case 'number': return 1.0;
            case 'date': return 1.3;
            default: return 1.2;
        }
    });
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    return weights.map(w => `${((w / totalWeight) * 100).toFixed(1)}%`);
}

export interface ReportPDFProps {
    config: ReportConfig;
    groupTree: GroupNode[];
    flatRows: ReportRow[];
    isGrouped: boolean;
    totalAggregates: Record<string, number | null>;
    stages?: PursuitStage[];
}

export function ReportPDF({ config, groupTree, flatRows, isGrouped, totalAggregates, stages }: ReportPDFProps) {
    const columns = config.columns;
    const fieldDefs = columns.map(k => REPORT_FIELD_MAP[k]).filter(Boolean);
    const colCount = fieldDefs.length;

    // ── Scaling ──────────────────────────────────────────────
    const isLandscape = colCount > 8;
    const fontSize = colCount > 14 ? 5 : colCount > 10 ? 6 : 7;
    const headerFontSize = colCount > 14 ? 5 : colCount > 10 ? 5.5 : 6;
    const colWidths = getColumnWidths(columns);

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
        title: {
            fontSize: 12,
            fontWeight: 700,
            color: colors.primary,
        },
        subtitle: {
            fontSize: 8,
            color: colors.muted,
            marginTop: 2,
        },
        brand: {
            fontSize: 10,
            fontWeight: 700,
            color: colors.primary,
        },
        brandSub: {
            fontSize: 8,
            fontWeight: 400,
            color: colors.muted,
            marginLeft: 4,
        },
        dateText: {
            fontSize: 6,
            color: colors.light,
            marginTop: 2,
        },
        // Table
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
        dataCell: {
            fontSize,
            color: colors.secondary,
        },
        groupRow: {
            flexDirection: 'row',
            backgroundColor: colors.groupBg,
            paddingVertical: 3,
            paddingHorizontal: 2,
        },
        groupCell: {
            fontSize: fontSize + 0.5,
            fontWeight: 700,
            color: colors.primary,
        },
        subtotalRow: {
            flexDirection: 'row',
            backgroundColor: colors.subtotalBg,
            paddingVertical: 2.5,
            paddingHorizontal: 2,
        },
        subtotalCell: {
            fontSize,
            fontWeight: 600,
            color: colors.secondary,
        },
        totalRow: {
            flexDirection: 'row',
            backgroundColor: colors.totalBg,
            paddingVertical: 3,
            paddingHorizontal: 2,
        },
        totalCell: {
            fontSize: fontSize + 0.5,
            fontWeight: 700,
            color: colors.primary,
        },
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

    // ── Formatting helpers ────────────────────────────────────
    function formatValue(fieldDef: typeof fieldDefs[0], row: ReportRow): string {
        const raw = fieldDef.getValue(row, stages);
        if (raw === null || raw === undefined || raw === '') return '—';
        return fieldDef.format(raw);
    }

    function formatAgg(fieldDef: typeof fieldDefs[0], agg: Record<string, number | null>): string {
        const v = agg[fieldDef.key];
        if (v === null || v === undefined) return '';
        return fieldDef.format(v);
    }

    // ── Row renderers ────────────────────────────────────────
    const allRows: React.ReactNode[] = [];
    let rowKey = 0;

    function renderDataRow(row: ReportRow) {
        allRows.push(
            <View key={`d-${rowKey++}`} style={s.dataRow} wrap={false}>
                {fieldDefs.map((fd, i) => (
                    <Text
                        key={fd.key}
                        style={{
                            ...s.dataCell,
                            width: colWidths[i],
                            textAlign: fd.type !== 'text' ? 'right' : 'left',
                        }}
                    >
                        {formatValue(fd, row)}
                    </Text>
                ))}
            </View>
        );
    }

    function renderGroupHeader(label: string, count: number | null | undefined) {
        allRows.push(
            <View key={`g-${rowKey++}`} style={s.groupRow} wrap={false}>
                <Text style={{ ...s.groupCell, width: '100%' }}>
                    {label}{count ? ` (${count})` : ''}
                </Text>
            </View>
        );
    }

    function renderSubtotalRow(label: string, agg: Record<string, number | null>) {
        allRows.push(
            <View key={`st-${rowKey++}`} style={s.subtotalRow} wrap={false}>
                {fieldDefs.map((fd, i) => (
                    <Text
                        key={fd.key}
                        style={{
                            ...s.subtotalCell,
                            width: colWidths[i],
                            textAlign: i === 0 ? 'left' : 'right',
                        }}
                    >
                        {i === 0 ? label : formatAgg(fd, agg)}
                    </Text>
                ))}
            </View>
        );
    }

    function renderTotalRow(label: string, agg: Record<string, number | null>, count?: number | null) {
        allRows.push(
            <View key={`t-${rowKey++}`} style={s.totalRow} wrap={false}>
                {fieldDefs.map((fd, i) => (
                    <Text
                        key={fd.key}
                        style={{
                            ...s.totalCell,
                            width: colWidths[i],
                            textAlign: i === 0 ? 'left' : 'right',
                        }}
                    >
                        {i === 0 ? `${label}${count ? ` (${count})` : ''}` : formatAgg(fd, agg)}
                    </Text>
                ))}
            </View>
        );
    }

    // ── Build rows ───────────────────────────────────────────
    if (isGrouped && groupTree.length > 0) {
        function walkGroup(node: GroupNode, depth: number) {
            const indent = '  '.repeat(depth);
            renderGroupHeader(`${indent}${node.label}`, node.aggregates._count);

            if (node.children.length > 0) {
                for (const child of node.children) {
                    walkGroup(child, depth + 1);
                }
            }

            for (const row of node.rows) {
                renderDataRow(row);
            }

            if (node.rows.length > 0) {
                renderSubtotalRow(`${indent}Subtotal`, node.aggregates);
            }
        }

        for (const node of groupTree) {
            walkGroup(node, 0);
        }
    } else {
        for (const row of flatRows) {
            renderDataRow(row);
        }
    }

    // Grand total
    renderTotalRow('Total', totalAggregates, totalAggregates._count);

    const reportTitle = sourceLabel(config.dataSource);
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <Document>
            <Page
                size="LETTER"
                orientation={isLandscape ? 'landscape' : 'portrait'}
                style={s.page}
            >
                {/* Header */}
                <View style={s.header}>
                    <View>
                        <Text style={s.title}>{reportTitle}</Text>
                        <Text style={s.subtitle}>
                            {flatRows.length} records · {config.columns.length} columns
                            {config.groupBy.length > 0 && ` · Grouped by ${config.groupBy.map(k => REPORT_FIELD_MAP[k]?.label ?? k).join(', ')}`}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.brand}>SLR<Text style={s.brandSub}> Pursuits</Text></Text>
                        <Text style={s.dateText}>{dateStr}</Text>
                    </View>
                </View>

                {/* Table header */}
                <View style={s.tableHeader} fixed>
                    {fieldDefs.map((fd, i) => (
                        <Text
                            key={fd.key}
                            style={{
                                ...s.headerCell,
                                width: colWidths[i],
                                textAlign: fd.type !== 'text' ? 'right' : 'left',
                            }}
                        >
                            {fd.label}
                        </Text>
                    ))}
                </View>

                {/* Data rows */}
                {allRows}

                {/* Footer */}
                <View style={s.footer} fixed>
                    <Text>SLR Pursuits · {reportTitle}</Text>
                    <Text>Generated {dateStr}</Text>
                </View>
            </Page>
        </Document>
    );
}
