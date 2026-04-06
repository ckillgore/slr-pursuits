import {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import type { Pursuit, PredevBudget, PredevBudgetLineItem } from '@/types';

// Register font
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
    green: '#0D7A3E',
    border: '#E2E5EA',
    bgLight: '#F4F5F7',
};

const s = StyleSheet.create({
    page: {
        fontFamily: 'Inter',
        fontSize: 7,
        padding: 20,
        color: colors.primary,
        orientation: 'landscape' // Budgets trend wide
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 2,
        borderBottomColor: colors.accent,
    },
    title: { fontSize: 16, fontWeight: 700, color: colors.primary, marginBottom: 2 },
    subtitle: { fontSize: 9, color: colors.muted },
    
    // Table
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.bgLight,
        paddingVertical: 4,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 3,
        paddingHorizontal: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: '#F0F1F4',
    },
    cellHead: { fontSize: 6.5, fontWeight: 700, color: colors.primary },
    cellHeadRight: { fontSize: 6.5, fontWeight: 700, color: colors.primary, textAlign: 'right' },
    cellLabel: { fontSize: 6.5, fontWeight: 700, color: colors.secondary },
    cellValue: { fontSize: 6.5, color: colors.primary, textAlign: 'right' },
    unallocRow: { backgroundColor: '#FFEDD5' },
    unallocLabel: { color: '#C2410C', fontWeight: 700, fontSize: 6.5 },
    unallocVal: { color: '#C2410C', textAlign: 'right', fontSize: 6.5 },

    footer: {
        position: 'absolute',
        bottom: 10,
        left: 20,
        right: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 6,
        color: colors.light,
    },
});

function fmt(v: number): string {
    if (v === 0) return '—';
    const num = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    return v < 0 ? `($${num})` : `$${num}`;
}

function getMonthKeyLabel(mk: string) {
    const [y, m] = mk.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

interface PredevBudgetPDFProps {
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
}

export function PredevBudgetPDF({
    pursuit, viewMode, lineItems, closedMonths, forwardMonths, expandLTD,
    getCellInfo, rowTotal, hasUnallocated, unallocatedByMonth
}: PredevBudgetPDFProps) {
    
    // Determine the columns we need to build for the active visual mode
    const isBudget = viewMode === 'budget';
    const showLTDBlob = closedMonths.length > 0 && !expandLTD && !isBudget;
    const expandedMonths = expandLTD && !isBudget ? closedMonths : [];

    const numCols = 1 + (showLTDBlob ? 1 : 0) + expandedMonths.length + forwardMonths.length + 1;
    const labelW = 20; // 20% width for label
    const dataW = (100 - labelW) / (numCols - 1); // standard col width

    const modeLabel = isBudget ? 'Budget Baseline' : viewMode === 'forecast' ? 'Forecast' : 'Variance';

    return (
        <Document>
            <Page size="LETTER" orientation="landscape" style={s.page}>
                {/* Header */}
                <View style={s.header}>
                    <View>
                        <Text style={s.title}>{pursuit.name} — Pre-Dev {modeLabel}</Text>
                        <Text style={s.subtitle}>
                            Generated {new Date().toLocaleDateString('en-US')}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Image src="/images/slr-logo.png" style={{ width: 80, height: 'auto' }} />
                    </View>
                </View>

                {/* Table Header */}
                <View style={s.tableHeader}>
                    <Text style={{ ...s.cellHead, width: `${labelW}%` }}>Line Item</Text>
                    {showLTDBlob && <Text style={{ ...s.cellHeadRight, width: `${dataW}%` }}>LTD Actuals</Text>}
                    {expandedMonths.map(mk => (
                        <Text key={`h-${mk}`} style={{ ...s.cellHeadRight, width: `${dataW}%` }}>{getMonthKeyLabel(mk)}</Text>
                    ))}
                    {forwardMonths.map(mk => (
                        <Text key={`h-${mk}`} style={{ ...s.cellHeadRight, width: `${dataW}%` }}>{getMonthKeyLabel(mk)}</Text>
                    ))}
                    <Text style={{ ...s.cellHeadRight, width: `${dataW}%` }}>Total</Text>
                </View>

                {/* Rows */}
                {lineItems.map(li => {
                    const rowSum = rowTotal(li);
                    let ltdSum = 0;
                    if (showLTDBlob) {
                        ltdSum = closedMonths.reduce((sum, mk) => sum + getCellInfo(li, mk).value, 0);
                    }
                    return (
                        <View key={li.id} style={s.tableRow}>
                            <Text style={{ ...s.cellLabel, width: `${labelW}%` }}>{li.label}</Text>
                            {showLTDBlob && <Text style={{ ...s.cellValue, width: `${dataW}%` }}>{fmt(ltdSum)}</Text>}
                            {expandedMonths.map(mk => (
                                <Text key={mk} style={{ ...s.cellValue, width: `${dataW}%` }}>{fmt(getCellInfo(li, mk).value)}</Text>
                            ))}
                            {forwardMonths.map(mk => (
                                <Text key={mk} style={{ ...s.cellValue, width: `${dataW}%` }}>{fmt(getCellInfo(li, mk).value)}</Text>
                            ))}
                            <Text style={{ ...s.cellValue, width: `${dataW}%`, fontWeight: 700 }}>{fmt(rowSum)}</Text>
                        </View>
                    );
                })}

                {/* Unallocated Row */}
                {hasUnallocated && !isBudget && unallocatedByMonth && (
                    <View style={{ ...s.tableRow, ...s.unallocRow }}>
                        <Text style={{ ...s.unallocLabel, width: `${labelW}%` }}>Unallocated Job Costs</Text>
                        {showLTDBlob && (
                            <Text style={{ ...s.unallocVal, width: `${dataW}%` }}>
                                {fmt(closedMonths.reduce((s, mk) => s + (unallocatedByMonth.get(mk) || 0), 0))}
                            </Text>
                        )}
                        {expandedMonths.map(mk => (
                            <Text key={`u-${mk}`} style={{ ...s.unallocVal, width: `${dataW}%` }}>{fmt(unallocatedByMonth.get(mk) || 0)}</Text>
                        ))}
                        {forwardMonths.map(mk => (
                            <Text key={`u-${mk}`} style={{ ...s.unallocVal, width: `${dataW}%` }}>—</Text>
                        ))}
                        <Text style={{ ...s.unallocVal, width: `${dataW}%` }}>
                            {fmt(Array.from(unallocatedByMonth.values()).reduce((sum, v) => sum + v, 0))}
                        </Text>
                    </View>
                )}

                <View style={s.footer} fixed>
                    <Text>{pursuit.name} · Pre-Dev Budget</Text>
                    <Text>SLR Holdings LLC</Text>
                </View>
            </Page>
        </Document>
    );
}
