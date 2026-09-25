import {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import type { Pursuit, PredevBudget, PredevBudgetLineItem, PredevScheduleItem } from '@/types';

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
        // Keep rows clear of the fixed footer.
        paddingBottom: 30,
        color: colors.primary,
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
    showSchedule?: boolean;
    scheduleItems?: PredevScheduleItem[];
}

export function PredevBudgetPDF({
    pursuit, viewMode, lineItems, closedMonths, forwardMonths, expandLTD,
    getCellInfo, rowTotal, hasUnallocated, unallocatedByMonth, showSchedule, scheduleItems
}: PredevBudgetPDFProps) {
    
    // Determine the columns we need to build for the active visual mode
    const isBudget = viewMode === 'budget';
    // Closed months are shown in every view (as on screen) — rowTotal() spans
    // all months, so hiding them in Budget view left rows not footing.
    const showLTDBlob = closedMonths.length > 0 && !expandLTD;
    const expandedMonths = expandLTD ? closedMonths : [];
    const showUnalloc = !!(hasUnallocated && !isBudget && unallocatedByMonth);
    const unalloc = (mk: string) => (showUnalloc ? unallocatedByMonth!.get(mk) || 0 : 0);
    const colSum = (mk: string) => lineItems.reduce((sum, li) => sum + getCellInfo(li, mk).value, 0) + unalloc(mk);
    const grandTotal = lineItems.reduce((sum, li) => sum + rowTotal(li), 0)
        + (showUnalloc ? Array.from(unallocatedByMonth!.values()).reduce((sum, v) => sum + v, 0) : 0);

    const numCols = 1 + (showLTDBlob ? 1 : 0) + expandedMonths.length + forwardMonths.length + 1;
    const labelW = 20; // 20% width for label
    const dataW = (100 - labelW) / (numCols - 1); // standard col width

    // Long budgets squeeze many month columns onto one landscape page; step
    // the figures down so "$1,234,567" still fits its column.
    const valueSize = numCols > 22 ? 5 : numCols > 16 ? 5.75 : 6.5;
    const cv = { ...s.cellValue, fontSize: valueSize };
    const chr = { ...s.cellHeadRight, fontSize: valueSize };
    const uv = { ...s.unallocVal, fontSize: valueSize };

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

                {/* Predev Schedule */}
                {showSchedule && scheduleItems && scheduleItems.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                        <View style={{ ...s.tableHeader, backgroundColor: 'transparent', borderBottom: 'none' }}>
                            <Text style={s.cellHead}>Pre-Development Schedule</Text>
                        </View>
                        {Object.entries(
                            scheduleItems.reduce((acc, item) => {
                                const sec = item.section || 'General';
                                if (!acc[sec]) acc[sec] = [];
                                acc[sec].push(item);
                                return acc;
                            }, {} as Record<string, PredevScheduleItem[]>)
                        ).map(([section, items]) => (
                            <View key={section}>
                                <View style={{ ...s.tableRow, backgroundColor: colors.bgLight }}>
                                    <Text style={s.cellHead}>{section}</Text>
                                </View>
                                {items.map((item) => (
                                    <View key={item.id} style={s.tableRow}>
                                        <Text style={{ ...s.cellLabel, width: `${labelW}%` }}>  {item.label}</Text>
                                        <Text style={{ ...s.cellValue, flex: 1, textAlign: 'left' }}>
                                            {item.start_date ? item.start_date : 'TBD'} ({item.duration_weeks} wks)
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                {/* Table Header — repeated on every page */}
                <View style={s.tableHeader} fixed>
                    <Text style={{ ...s.cellHead, width: `${labelW}%` }}>Line Item</Text>
                    {showLTDBlob && <Text style={{ ...chr, width: `${dataW}%` }}>{isBudget ? 'LTD Budget' : 'LTD Actuals'}</Text>}
                    {expandedMonths.map(mk => (
                        <Text key={`h-${mk}`} style={{ ...chr, width: `${dataW}%` }}>{getMonthKeyLabel(mk)}</Text>
                    ))}
                    {forwardMonths.map(mk => (
                        <Text key={`h-${mk}`} style={{ ...chr, width: `${dataW}%` }}>{getMonthKeyLabel(mk)}</Text>
                    ))}
                    <Text style={{ ...chr, width: `${dataW}%` }}>Total</Text>
                </View>

                {/* Rows */}
                {lineItems.map(li => {
                    const rowSum = rowTotal(li);
                    let ltdSum = 0;
                    if (showLTDBlob) {
                        ltdSum = closedMonths.reduce((sum, mk) => sum + getCellInfo(li, mk).value, 0);
                    }
                    return (
                        <View key={li.id} style={s.tableRow} wrap={false}>
                            <Text style={{ ...s.cellLabel, width: `${labelW}%` }}>{li.label}</Text>
                            {showLTDBlob && <Text style={{ ...cv, width: `${dataW}%` }}>{fmt(ltdSum)}</Text>}
                            {expandedMonths.map(mk => (
                                <Text key={mk} style={{ ...cv, width: `${dataW}%` }}>{fmt(getCellInfo(li, mk).value)}</Text>
                            ))}
                            {forwardMonths.map(mk => (
                                <Text key={mk} style={{ ...cv, width: `${dataW}%` }}>{fmt(getCellInfo(li, mk).value)}</Text>
                            ))}
                            <Text style={{ ...cv, width: `${dataW}%`, fontWeight: 700 }}>{fmt(rowSum)}</Text>
                        </View>
                    );
                })}

                {/* Unallocated Row */}
                {hasUnallocated && !isBudget && unallocatedByMonth && (
                    <View style={{ ...s.tableRow, ...s.unallocRow }} wrap={false}>
                        <Text style={{ ...s.unallocLabel, width: `${labelW}%` }}>Unallocated Job Costs</Text>
                        {showLTDBlob && (
                            <Text style={{ ...uv, width: `${dataW}%` }}>
                                {fmt(closedMonths.reduce((s, mk) => s + (unallocatedByMonth.get(mk) || 0), 0))}
                            </Text>
                        )}
                        {expandedMonths.map(mk => (
                            <Text key={`u-${mk}`} style={{ ...uv, width: `${dataW}%` }}>{fmt(unallocatedByMonth.get(mk) || 0)}</Text>
                        ))}
                        {forwardMonths.map(mk => (
                            <Text key={`u-${mk}`} style={{ ...uv, width: `${dataW}%` }}>{fmt(unallocatedByMonth.get(mk) || 0)}</Text>
                        ))}
                        <Text style={{ ...uv, width: `${dataW}%` }}>
                            {fmt(Array.from(unallocatedByMonth.values()).reduce((sum, v) => sum + v, 0))}
                        </Text>
                    </View>
                )}

                {/* Total Row — mirrors the grid's Total row */}
                <View style={{ ...s.tableRow, borderTopWidth: 1, borderTopColor: colors.primary }} wrap={false}>
                    <Text style={{ ...s.cellLabel, width: `${labelW}%`, fontWeight: 700 }}>Total</Text>
                    {showLTDBlob && (
                        <Text style={{ ...cv, width: `${dataW}%`, fontWeight: 700 }}>
                            {fmt(closedMonths.reduce((sum, mk) => sum + colSum(mk), 0))}
                        </Text>
                    )}
                    {expandedMonths.map(mk => (
                        <Text key={`t-${mk}`} style={{ ...cv, width: `${dataW}%`, fontWeight: 700 }}>{fmt(colSum(mk))}</Text>
                    ))}
                    {forwardMonths.map(mk => (
                        <Text key={`t-${mk}`} style={{ ...cv, width: `${dataW}%`, fontWeight: 700 }}>{fmt(colSum(mk))}</Text>
                    ))}
                    <Text style={{ ...cv, width: `${dataW}%`, fontWeight: 700 }}>{fmt(grandTotal)}</Text>
                </View>

                <View style={s.footer} fixed>
                    <Text>{pursuit.name} · Pre-Dev Budget</Text>
                    <Text render={({ pageNumber, totalPages }) => `SLR Holdings LLC · Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}
