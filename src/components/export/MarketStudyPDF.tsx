'use client';

/**
 * PDF export for Market Study using @react-pdf/renderer.
 * Renders the Market Summary and Market Stock by Unit Type tables.
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
    white: '#FFFFFF',
    green: '#16A34A',
    amber: '#D97706',
    red: '#DC2626',
    purple: '#7C3AED',
};

const bedColors: Record<number, string> = { 0: '#3B82F6', 1: '#22C55E', 2: '#F59E0B', 3: '#EF4444', 4: '#8B5CF6' };
const bedLabels: Record<number, string> = { 0: 'Studio', 1: '1BR', 2: '2BR', 3: '3BR', 4: '4BR' };

function fmtCur(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function fmtNum(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Types ────────────────────────────────────────────
export interface CompSummaryPDF {
    name: string;
    mapNode: number;
    projectType: string;
    yearBuilt: number | null;
    unitCount: number;
    avgUnitSize: number | null;
    marketRent: number | null;
    marketRentSf: number | null;
    effectiveRent: number | null;
    effectiveRentSf: number | null;
    color: string;
}

export interface StockRowPDF {
    label: string;
    unitCount: number;
    avgUnitSize: number | null;
    marketRent: number | null;
    marketRentSf: number | null;
    effectiveRent: number | null;
    effectiveRentSf: number | null;
    isSubtotal?: boolean;
    isGrandTotal?: boolean;
    bed?: number;
}

export interface MarketStudyPDFProps {
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

const s = StyleSheet.create({
    page: {
        fontFamily: 'Inter',
        fontSize: 7.5,
        padding: 28,
        paddingBottom: 40,
        color: colors.primary,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 14,
        paddingBottom: 10,
        borderBottomWidth: 2,
        borderBottomColor: colors.accent,
    },
    title: { fontSize: 13, fontWeight: 700, color: colors.primary },
    subtitle: { fontSize: 8, color: colors.muted, marginTop: 2 },
    dateText: { fontSize: 6, color: colors.light, marginTop: 2 },

    sectionTitle: {
        fontSize: 8,
        fontWeight: 700,
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
        marginTop: 12,
    },

    // Table styles
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.accent,
        paddingVertical: 4,
        paddingHorizontal: 3,
    },
    thCell: {
        fontSize: 6.5,
        fontWeight: 700,
        color: colors.white,
    },
    dataRow: {
        flexDirection: 'row',
        paddingVertical: 3,
        paddingHorizontal: 3,
        borderBottomWidth: 0.5,
        borderBottomColor: '#F0F1F4',
    },
    dataCell: {
        fontSize: 7,
        color: colors.secondary,
    },
    subtotalRow: {
        flexDirection: 'row',
        backgroundColor: colors.bgLight,
        paddingVertical: 3,
        paddingHorizontal: 3,
        borderBottomWidth: 0.5,
        borderBottomColor: '#E0E0E0',
    },
    subtotalCell: {
        fontSize: 7,
        fontWeight: 600,
        color: colors.primary,
    },
    grandTotalRow: {
        flexDirection: 'row',
        backgroundColor: colors.border,
        paddingVertical: 4,
        paddingHorizontal: 3,
    },
    grandTotalCell: {
        fontSize: 7.5,
        fontWeight: 700,
        color: colors.primary,
    },

    footer: {
        position: 'absolute',
        bottom: 14,
        left: 28,
        right: 28,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 5,
        color: colors.light,
    },
});

// Summary table column widths
const sumW = ['24%', '6%', '10%', '7%', '8%', '9%', '9%', '9%', '9%', '9%'];
// Stock table column widths
const stW = ['24%', '12%', '12%', '13%', '13%', '13%', '13%'];

export function MarketStudyPDF({ pursuitName, compSummaries, summaryTotals, stockRows }: MarketStudyPDFProps) {
    const now = new Date();
    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <Document>
            <Page size="LETTER" orientation="landscape" style={s.page}>
                {/* Header */}
                <View style={s.header}>
                    <View>
                        <Text style={s.title}>
                            {pursuitName ? `${pursuitName} — ` : ''}Rent Comps — {monthLabel}
                        </Text>
                        <Text style={s.subtitle}>
                            {compSummaries.length} properties · Source: HelloData
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Image src="/images/slr-logo.png" style={{ width: 80, height: 'auto', marginBottom: 2 }} />
                        <Text style={s.dateText}>{dateStr}</Text>
                    </View>
                </View>

                {/* ── Market Summary Table ── */}
                <Text style={s.sectionTitle}>Market Summary</Text>
                <View style={s.tableHeader}>
                    {['Property', '#', 'Type', 'Built', 'Units', 'Avg SF', 'Mkt Rent', 'Rent/SF', 'Eff Rent', 'Eff/SF'].map((h, i) => (
                        <Text key={h} style={{ ...s.thCell, width: sumW[i], textAlign: i >= 4 ? 'right' : 'left' }}>{h}</Text>
                    ))}
                </View>
                {compSummaries.map((c, i) => (
                    <View key={i} style={s.dataRow} wrap={false}>
                        <Text style={{ ...s.dataCell, width: sumW[0], fontWeight: 600, color: colors.accent }}>{c.name}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[1], textAlign: 'center' }}>{c.mapNode}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[2] }}>{c.projectType}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[3], textAlign: 'center' }}>{c.yearBuilt ?? '—'}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[4], textAlign: 'right' }}>{fmtNum(c.unitCount)}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[5], textAlign: 'right' }}>{fmtNum(c.avgUnitSize)}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[6], textAlign: 'right', fontWeight: 600 }}>{fmtCur(c.marketRent)}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[7], textAlign: 'right' }}>{fmtCur(c.marketRentSf, 2)}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[8], textAlign: 'right' }}>{fmtCur(c.effectiveRent)}</Text>
                        <Text style={{ ...s.dataCell, width: sumW[9], textAlign: 'right' }}>{fmtCur(c.effectiveRentSf, 2)}</Text>
                    </View>
                ))}
                {summaryTotals && (
                    <View style={s.grandTotalRow} wrap={false}>
                        <Text style={{ ...s.grandTotalCell, width: sumW[0] }}>Grand Total</Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[1] }}></Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[2] }}></Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[3] }}></Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[4], textAlign: 'right' }}>{fmtNum(summaryTotals.unitCount)}</Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[5], textAlign: 'right' }}>{fmtNum(summaryTotals.avgUnitSize)}</Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[6], textAlign: 'right' }}>{fmtCur(summaryTotals.marketRent)}</Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[7], textAlign: 'right' }}>{fmtCur(summaryTotals.marketRentSf, 2)}</Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[8], textAlign: 'right' }}>{fmtCur(summaryTotals.effectiveRent)}</Text>
                        <Text style={{ ...s.grandTotalCell, width: sumW[9], textAlign: 'right' }}>{fmtCur(summaryTotals.effectiveRentSf, 2)}</Text>
                    </View>
                )}

                {/* ── Market Stock by Unit Type ── */}
                <Text style={s.sectionTitle}>Market Stock by Unit Type</Text>
                <View style={s.tableHeader}>
                    {['Unit Mix Analysis', 'Units', 'Avg SF', 'Mkt Rent', 'Rent/SF', 'Eff Rent', 'Eff/SF'].map((h, i) => (
                        <Text key={h} style={{ ...s.thCell, width: stW[i], textAlign: i >= 1 ? 'right' : 'left' }}>{h}</Text>
                    ))}
                </View>
                {stockRows.map((row, i) => {
                    const rowStyle = row.isGrandTotal ? s.grandTotalRow : row.isSubtotal ? s.subtotalRow : s.dataRow;
                    const cellStyle = row.isGrandTotal ? s.grandTotalCell : row.isSubtotal ? s.subtotalCell : s.dataCell;
                    return (
                        <View key={i} style={rowStyle} wrap={false}>
                            <Text style={{
                                ...cellStyle,
                                width: stW[0],
                                paddingLeft: (!row.isSubtotal && !row.isGrandTotal) ? 12 : 0,
                            }}>
                                {row.label}
                            </Text>
                            <Text style={{ ...cellStyle, width: stW[1], textAlign: 'right' }}>{fmtNum(row.unitCount)}</Text>
                            <Text style={{ ...cellStyle, width: stW[2], textAlign: 'right' }}>{fmtNum(row.avgUnitSize)}</Text>
                            <Text style={{ ...cellStyle, width: stW[3], textAlign: 'right' }}>{fmtCur(row.marketRent)}</Text>
                            <Text style={{ ...cellStyle, width: stW[4], textAlign: 'right' }}>{fmtCur(row.marketRentSf, 2)}</Text>
                            <Text style={{ ...cellStyle, width: stW[5], textAlign: 'right' }}>{fmtCur(row.effectiveRent)}</Text>
                            <Text style={{ ...cellStyle, width: stW[6], textAlign: 'right' }}>{fmtCur(row.effectiveRentSf, 2)}</Text>
                        </View>
                    );
                })}

                {/* Footer */}
                <View style={s.footer} fixed>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Image src="/images/slr-logo.png" style={{ width: 50, height: 'auto' }} />
                        <Text> · Market Study</Text>
                    </View>
                    <Text>Generated {dateStr}</Text>
                </View>
            </Page>
        </Document>
    );
}
