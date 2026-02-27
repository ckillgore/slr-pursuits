'use client';

import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import type { OnePager, Pursuit, UnitMixRow, PayrollRow, SoftCostDetailRow } from '@/types';
import type { CalculationResults } from '@/types';
import { TiptapPdfContent } from './tiptapToPdf';
import {
    calcRentSensitivity,
    calcHardCostSensitivity,
    calcLandCostSensitivity,
    calcSensitivityMatrix,
} from '@/lib/calculations/sensitivity';

// Register default font — react-pdf only supports TTF/OTF, not WOFF2
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
    white: '#FFFFFF',
};

const s = StyleSheet.create({
    page: {
        fontFamily: 'Inter',
        fontSize: 8,
        padding: 30,
        color: colors.primary,
    },
    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 2,
        borderBottomColor: colors.accent,
    },
    brand: {
        fontSize: 14,
        fontWeight: 700,
        color: colors.primary,
    },
    brandSub: {
        fontSize: 10,
        fontWeight: 400,
        color: colors.muted,
        marginLeft: 6,
    },
    title: {
        fontSize: 16,
        fontWeight: 700,
        color: colors.primary,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 9,
        color: colors.muted,
    },
    // Returns banner
    returnsBanner: {
        flexDirection: 'row',
        backgroundColor: colors.bgLight,
        borderRadius: 4,
        padding: 10,
        marginBottom: 14,
        justifyContent: 'space-between',
    },
    returnItem: {
        alignItems: 'center',
    },
    returnLabel: {
        fontSize: 6,
        color: colors.light,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    returnValue: {
        fontSize: 12,
        fontWeight: 700,
        color: colors.primary,
    },
    returnValueHighlight: {
        fontSize: 14,
        fontWeight: 700,
        color: colors.accent,
    },
    // Executive Summary
    summaryBlock: {
        marginBottom: 14,
        padding: 10,
        backgroundColor: colors.bgLight,
        borderRadius: 4,
    },
    summaryTitle: {
        fontSize: 7,
        fontWeight: 700,
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
    },
    // Section
    sectionTitle: {
        fontSize: 8,
        fontWeight: 700,
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
        marginTop: 12,
    },
    // Grid row
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    rowLabel: {
        fontSize: 7.5,
        color: colors.muted,
    },
    rowValue: {
        fontSize: 7.5,
        color: colors.primary,
        fontWeight: 600,
    },
    divider: {
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        marginVertical: 3,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        marginTop: 2,
    },
    totalLabel: {
        fontSize: 8,
        fontWeight: 700,
        color: colors.primary,
    },
    totalValue: {
        fontSize: 8,
        fontWeight: 700,
        color: colors.primary,
    },
    // Two columns
    cols: {
        flexDirection: 'row',
        gap: 16,
    },
    col: {
        flex: 1,
    },
    // Unit mix table
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.bgLight,
        paddingVertical: 3,
        paddingHorizontal: 4,
        marginBottom: 2,
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 2,
        paddingHorizontal: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: '#F0F1F4',
    },
    tableCell: {
        fontSize: 7,
        color: colors.secondary,
    },
    tableCellBold: {
        fontSize: 7,
        fontWeight: 600,
        color: colors.primary,
    },
    tableHeaderCell: {
        fontSize: 6,
        fontWeight: 700,
        color: colors.muted,
        textTransform: 'uppercase',
    },
    // Footer
    footer: {
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 6,
        color: colors.light,
    },
    // Page 2 — Sensitivity tables
    sensTableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.bgLight,
        paddingVertical: 3,
        paddingHorizontal: 4,
        marginBottom: 1,
    },
    sensTableRow: {
        flexDirection: 'row',
        paddingVertical: 2,
        paddingHorizontal: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: '#F0F1F4',
    },
    sensTableRowBase: {
        flexDirection: 'row',
        paddingVertical: 2,
        paddingHorizontal: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: '#F0F1F4',
        backgroundColor: '#EBF1FF',
    },
    sensCell: {
        fontSize: 6.5,
        color: colors.secondary,
    },
    sensCellBold: {
        fontSize: 6.5,
        fontWeight: 700,
        color: colors.accent,
    },
    sensCellHeader: {
        fontSize: 6,
        fontWeight: 700,
        color: colors.muted,
        textTransform: 'uppercase',
    },
    // Arch notes block
    notesBlock: {
        marginTop: 16,
        padding: 10,
        backgroundColor: colors.bgLight,
        borderRadius: 4,
    },
    notesTitle: {
        fontSize: 7,
        fontWeight: 700,
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
    },
});

// Formatting helpers (no Intl in react-pdf)
function fmtCurrency(v: number, dec = 0): string {
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return v < 0 ? `($${formatted})` : `$${formatted}`;
}
function fmtNumber(v: number, dec = 0): string {
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number, dec = 2): string {
    return `${(v * 100).toFixed(dec)}%`;
}

interface OnePagerPDFProps {
    onePager: OnePager;
    pursuit: Pursuit;
    calc: CalculationResults;
    productTypeName?: string;
    unitMix: UnitMixRow[];
    payroll: PayrollRow[];
    softCostDetails: SoftCostDetailRow[];
}

function MetricRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={s.row}>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={s.rowValue}>{value}</Text>
        </View>
    );
}

/* ── Sensitivity helper: render a 4-column sensitivity table ── */
function SensitivityTable({
    title,
    headers,
    rows,
}: {
    title: string;
    headers: [string, string, string, string];
    rows: { col1: string; col2: string; col3: string; col4: string; isBase: boolean }[];
}) {
    return (
        <View style={{ marginBottom: 10 }}>
            <Text style={{ ...s.sectionTitle, marginTop: 0, marginBottom: 4 }}>{title}</Text>
            <View style={s.sensTableHeader}>
                <Text style={{ ...s.sensCellHeader, width: '25%' }}>{headers[0]}</Text>
                <Text style={{ ...s.sensCellHeader, width: '25%', textAlign: 'right' }}>{headers[1]}</Text>
                <Text style={{ ...s.sensCellHeader, width: '25%', textAlign: 'right' }}>{headers[2]}</Text>
                <Text style={{ ...s.sensCellHeader, width: '25%', textAlign: 'right' }}>{headers[3]}</Text>
            </View>
            {rows.map((row, i) => (
                <View key={i} style={row.isBase ? s.sensTableRowBase : s.sensTableRow}>
                    <Text style={{ ...(row.isBase ? s.sensCellBold : s.sensCell), width: '25%' }}>{row.col1}</Text>
                    <Text style={{ ...s.sensCell, width: '25%', textAlign: 'right' }}>{row.col2}</Text>
                    <Text style={{ ...s.sensCell, width: '25%', textAlign: 'right' }}>{row.col3}</Text>
                    <Text style={{ ...(row.isBase ? s.sensCellBold : s.sensCell), width: '25%', textAlign: 'right' }}>{row.col4}</Text>
                </View>
            ))}
        </View>
    );
}

export function OnePagerPDF({ onePager, pursuit, calc, productTypeName, unitMix, payroll, softCostDetails }: OnePagerPDFProps) {
    const unitMixRows = onePager.unit_mix || [];

    // ── Compute sensitivities for page 2 ──
    const rentSteps = onePager.sensitivity_rent_steps ?? [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15];
    const hardCostSteps = onePager.sensitivity_hard_cost_steps ?? [-15, -10, -5, 0, 5, 10, 15];
    const landCostSteps = onePager.sensitivity_land_cost_steps ?? [-2000000, -1000000, -500000, 0, 500000, 1000000, 2000000];

    const sortedUnitMix = [...unitMix].sort((a, b) => a.sort_order - b.sort_order);
    const sortedPayroll = [...payroll].sort((a, b) => a.sort_order - b.sort_order);

    const rentSens = calcRentSensitivity(onePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps);
    const hcSens = calcHardCostSensitivity(onePager, sortedUnitMix, sortedPayroll, softCostDetails, hardCostSteps);
    const lcSens = calcLandCostSensitivity(onePager, sortedUnitMix, sortedPayroll, softCostDetails, landCostSteps);
    const matrix = calcSensitivityMatrix(onePager, sortedUnitMix, sortedPayroll, softCostDetails, rentSteps, hardCostSteps);

    // ── Shared header/footer renderers ──
    const renderHeader = () => (
        <View style={s.header}>
            <View>
                <Text style={s.title}>{onePager.name}</Text>
                <Text style={s.subtitle}>
                    {pursuit.name} · {pursuit.city}{pursuit.state ? `, ${pursuit.state}` : ''}
                    {productTypeName ? ` · ${productTypeName}` : ''}
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.brand}>SLR<Text style={s.brandSub}> Pursuits</Text></Text>
                <Text style={{ fontSize: 7, color: colors.light, marginTop: 2 }}>
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
            </View>
        </View>
    );

    const renderFooter = () => (
        <View style={s.footer} fixed>
            <Text>SLR Pursuits · {pursuit.name} · {onePager.name}</Text>
            <Text>Generated {new Date().toLocaleDateString('en-US')}</Text>
        </View>
    );

    return (
        <Document>
            {/* ═══════════════════════════ PAGE 1 ═══════════════════════════ */}
            <Page size="LETTER" style={s.page}>
                {renderHeader()}

                {/* Returns Banner */}
                <View style={s.returnsBanner}>
                    <View style={s.returnItem}>
                        <Text style={s.returnLabel}>Yield on Cost</Text>
                        <Text style={s.returnValueHighlight}>{calc.unlevered_yield_on_cost > 0 ? fmtPct(calc.unlevered_yield_on_cost) : '—'}</Text>
                    </View>
                    <View style={s.returnItem}>
                        <Text style={s.returnLabel}>NOI</Text>
                        <Text style={s.returnValue}>{calc.noi > 0 ? fmtCurrency(calc.noi) : '—'}</Text>
                    </View>
                    <View style={s.returnItem}>
                        <Text style={s.returnLabel}>NOI / Unit</Text>
                        <Text style={s.returnValue}>{calc.noi_per_unit > 0 ? fmtCurrency(calc.noi_per_unit) : '—'}</Text>
                    </View>
                    <View style={s.returnItem}>
                        <Text style={s.returnLabel}>Total Budget</Text>
                        <Text style={s.returnValue}>{calc.total_budget > 0 ? fmtCurrency(calc.total_budget) : '—'}</Text>
                    </View>
                    <View style={s.returnItem}>
                        <Text style={s.returnLabel}>Cost / Unit</Text>
                        <Text style={s.returnValue}>{calc.cost_per_unit > 0 ? fmtCurrency(calc.cost_per_unit) : '—'}</Text>
                    </View>
                    <View style={s.returnItem}>
                        <Text style={s.returnLabel}>Rent / SF</Text>
                        <Text style={s.returnValue}>{calc.weighted_avg_rent_per_sf > 0 ? fmtCurrency(calc.weighted_avg_rent_per_sf, 2) : '—'}</Text>
                    </View>
                    <View style={s.returnItem}>
                        <Text style={s.returnLabel}>OpEx Ratio</Text>
                        <Text style={s.returnValue}>{calc.opex_ratio > 0 ? fmtPct(calc.opex_ratio, 1) : '—'}</Text>
                    </View>
                </View>

                {/* Executive Summary */}
                {pursuit.exec_summary && (
                    <View style={s.summaryBlock}>
                        <Text style={s.summaryTitle}>Executive Summary</Text>
                        <TiptapPdfContent content={pursuit.exec_summary} />
                    </View>
                )}

                {/* Two-column layout */}
                <View style={s.cols}>
                    {/* LEFT COLUMN */}
                    <View style={s.col}>
                        {/* Site & Density */}
                        <Text style={s.sectionTitle}>Site & Density</Text>
                        <MetricRow label="Site Area (SF)" value={fmtNumber(pursuit.site_area_sf)} />
                        <MetricRow label="Total Units" value={fmtNumber(onePager.total_units)} />
                        <MetricRow label="Density (Units/Acre)" value={fmtNumber(calc.density_units_per_acre, 1)} />
                        <MetricRow label="Efficiency Ratio" value={fmtPct(onePager.efficiency_ratio, 1)} />
                        <MetricRow label="Total NRSF" value={fmtNumber(calc.total_nrsf)} />
                        <MetricRow label="Total GBSF" value={fmtNumber(calc.total_gbsf)} />

                        {/* Revenue */}
                        <Text style={s.sectionTitle}>Revenue</Text>
                        <MetricRow label="Gross Potential Rent" value={fmtCurrency(calc.gross_potential_rent)} />
                        <MetricRow label="Other Income ($/unit/mo)" value={fmtCurrency(onePager.other_income_per_unit_month)} />
                        <MetricRow label="GPR + Other Income" value={fmtCurrency(calc.gross_potential_revenue)} />
                        <MetricRow label="Vacancy & Loss" value={fmtPct(onePager.vacancy_rate, 1)} />
                        <View style={s.totalRow}>
                            <Text style={s.totalLabel}>Net Revenue</Text>
                            <Text style={s.totalValue}>{fmtCurrency(calc.net_revenue)}</Text>
                        </View>

                        {/* OpEx */}
                        <Text style={s.sectionTitle}>Operating Expenses</Text>
                        <MetricRow label="Utilities" value={fmtCurrency(onePager.opex_utilities)} />
                        <MetricRow label="Repairs & Maint." value={fmtCurrency(onePager.opex_repairs_maintenance)} />
                        <MetricRow label="Contract Svcs" value={fmtCurrency(onePager.opex_contract_services)} />
                        <MetricRow label="Marketing" value={fmtCurrency(onePager.opex_marketing)} />
                        <MetricRow label="G&A" value={fmtCurrency(onePager.opex_general_admin)} />
                        <MetricRow label="Turnover" value={fmtCurrency(onePager.opex_turnover)} />
                        <MetricRow label="Insurance" value={fmtCurrency(onePager.opex_insurance)} />
                        <MetricRow label="Mgmt Fee" value={fmtPct(onePager.mgmt_fee_pct, 1)} />
                        <View style={s.totalRow}>
                            <Text style={s.totalLabel}>Total OpEx</Text>
                            <Text style={s.totalValue}>{fmtCurrency(calc.total_opex)}</Text>
                        </View>
                        <MetricRow label="OpEx / Unit" value={fmtCurrency(calc.opex_per_unit)} />
                    </View>

                    {/* RIGHT COLUMN */}
                    <View style={s.col}>
                        {/* Development Budget */}
                        <Text style={s.sectionTitle}>Development Budget</Text>
                        <MetricRow label="Hard Cost ($/NRSF)" value={fmtCurrency(onePager.hard_cost_per_nrsf, 2)} />
                        <MetricRow label="Hard Cost (Total)" value={fmtCurrency(calc.hard_cost)} />
                        <MetricRow label="Hard Cost ($/GBSF)" value={fmtCurrency(calc.hard_cost_per_gbsf, 2)} />
                        <View style={s.divider} />
                        <MetricRow label="Land Cost" value={fmtCurrency(onePager.land_cost)} />
                        <MetricRow label="Land $/Unit" value={fmtCurrency(calc.land_cost_per_unit)} />
                        <View style={s.divider} />
                        <MetricRow label="Soft Cost %" value={fmtPct(onePager.soft_cost_pct, 1)} />
                        <MetricRow label="Soft Cost (Total)" value={fmtCurrency(calc.soft_cost)} />
                        <View style={s.totalRow}>
                            <Text style={s.totalLabel}>Total Budget</Text>
                            <Text style={s.totalValue}>{fmtCurrency(calc.total_budget)}</Text>
                        </View>
                        <MetricRow label="Cost / Unit" value={fmtCurrency(calc.cost_per_unit)} />
                        <MetricRow label="Cost / NRSF" value={fmtCurrency(calc.cost_per_nrsf, 2)} />

                        {/* Property Tax */}
                        <Text style={s.sectionTitle}>Property Tax</Text>
                        <MetricRow label="Mil Rate" value={fmtNumber(onePager.tax_mil_rate, 4)} />
                        <MetricRow label="Assessed Value" value={fmtCurrency(calc.assessed_value)} />
                        <MetricRow label="Annual Property Tax" value={fmtCurrency(calc.property_tax_total)} />
                        <MetricRow label="Tax / Unit" value={fmtCurrency(calc.property_tax_per_unit)} />

                        {/* Returns */}
                        <Text style={s.sectionTitle}>Returns</Text>
                        <MetricRow label="NOI" value={fmtCurrency(calc.noi)} />
                        <MetricRow label="NOI / Unit" value={fmtCurrency(calc.noi_per_unit)} />
                        <MetricRow label="NOI / SF" value={fmtCurrency(calc.noi_per_sf, 2)} />
                        <View style={s.totalRow}>
                            <Text style={s.totalLabel}>Unlevered Yield on Cost</Text>
                            <Text style={{ ...s.totalValue, color: colors.green }}>{fmtPct(calc.unlevered_yield_on_cost)}</Text>
                        </View>
                    </View>
                </View>

                {/* Unit Mix Table */}
                {unitMixRows.length > 0 && (
                    <View style={{ marginTop: 14 }}>
                        <Text style={s.sectionTitle}>Unit Mix</Text>
                        <View style={s.tableHeader}>
                            <Text style={{ ...s.tableHeaderCell, width: '18%' }}>Type</Text>
                            <Text style={{ ...s.tableHeaderCell, width: '12%', textAlign: 'right' }}># Units</Text>
                            <Text style={{ ...s.tableHeaderCell, width: '14%', textAlign: 'right' }}>Avg SF</Text>
                            <Text style={{ ...s.tableHeaderCell, width: '14%', textAlign: 'right' }}>Total SF</Text>
                            <Text style={{ ...s.tableHeaderCell, width: '14%', textAlign: 'right' }}>Rent/SF</Text>
                            <Text style={{ ...s.tableHeaderCell, width: '14%', textAlign: 'right' }}>Mo. Rent</Text>
                            <Text style={{ ...s.tableHeaderCell, width: '14%', textAlign: 'right' }}>Annual Rev</Text>
                        </View>
                        {unitMixRows
                            .filter((r) => r.unit_count > 0)
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((row) => {
                                const totalSf = row.unit_count * row.avg_unit_sf;
                                const monthlyRent = row.rent_input_mode === 'per_sf'
                                    ? row.rent_per_sf * row.avg_unit_sf
                                    : row.rent_whole_dollar;
                                const rentPerSf = row.avg_unit_sf > 0 ? monthlyRent / row.avg_unit_sf : 0;
                                const annualRev = row.unit_count * monthlyRent * 12;
                                return (
                                    <View key={row.id} style={s.tableRow}>
                                        <Text style={{ ...s.tableCellBold, width: '18%' }}>{row.unit_type_label}</Text>
                                        <Text style={{ ...s.tableCell, width: '12%', textAlign: 'right' }}>{fmtNumber(row.unit_count)}</Text>
                                        <Text style={{ ...s.tableCell, width: '14%', textAlign: 'right' }}>{fmtNumber(row.avg_unit_sf)}</Text>
                                        <Text style={{ ...s.tableCell, width: '14%', textAlign: 'right' }}>{fmtNumber(totalSf)}</Text>
                                        <Text style={{ ...s.tableCell, width: '14%', textAlign: 'right' }}>{fmtCurrency(rentPerSf, 2)}</Text>
                                        <Text style={{ ...s.tableCell, width: '14%', textAlign: 'right' }}>{fmtCurrency(monthlyRent)}</Text>
                                        <Text style={{ ...s.tableCell, width: '14%', textAlign: 'right' }}>{fmtCurrency(annualRev)}</Text>
                                    </View>
                                );
                            })}
                    </View>
                )}

                {/* Pro Forma Summary */}
                <View style={{ marginTop: 14 }}>
                    <Text style={s.sectionTitle}>Pro Forma</Text>
                    {/* Header */}
                    <View style={s.tableHeader}>
                        <Text style={{ ...s.tableHeaderCell, width: '34%' }}></Text>
                        <Text style={{ ...s.tableHeaderCell, width: '22%', textAlign: 'right' }}>Total</Text>
                        <Text style={{ ...s.tableHeaderCell, width: '22%', textAlign: 'right' }}>$/Unit</Text>
                        <Text style={{ ...s.tableHeaderCell, width: '22%', textAlign: 'right' }}>$/SF</Text>
                    </View>
                    {/* Net Revenue */}
                    <View style={s.tableRow}>
                        <Text style={{ ...s.tableCellBold, width: '34%' }}>Net Revenue</Text>
                        <Text style={{ ...s.tableCell, width: '22%', textAlign: 'right' }}>{fmtCurrency(calc.net_revenue)}</Text>
                        <Text style={{ ...s.tableCell, width: '22%', textAlign: 'right' }}>{onePager.total_units > 0 ? fmtCurrency(calc.net_revenue / onePager.total_units) : '—'}</Text>
                        <Text style={{ ...s.tableCell, width: '22%', textAlign: 'right' }}>{calc.total_nrsf > 0 ? fmtCurrency(calc.net_revenue / calc.total_nrsf, 2) : '—'}</Text>
                    </View>
                    {/* Total Operating Expenses */}
                    <View style={s.tableRow}>
                        <Text style={{ ...s.tableCellBold, width: '34%', color: '#DC2626' }}>Total Operating Expenses</Text>
                        <Text style={{ ...s.tableCell, width: '22%', textAlign: 'right', color: '#DC2626' }}>{calc.total_opex > 0 ? `(${fmtCurrency(calc.total_opex)})` : '—'}</Text>
                        <Text style={{ ...s.tableCell, width: '22%', textAlign: 'right', color: '#DC2626' }}>{calc.opex_per_unit > 0 ? `(${fmtCurrency(calc.opex_per_unit)})` : '—'}</Text>
                        <Text style={{ ...s.tableCell, width: '22%', textAlign: 'right', color: '#DC2626' }}>{calc.total_nrsf > 0 && calc.total_opex > 0 ? `(${fmtCurrency(calc.total_opex / calc.total_nrsf, 2)})` : '—'}</Text>
                    </View>
                    {/* NOI (total row) */}
                    <View style={{ ...s.totalRow, marginTop: 0 }}>
                        <Text style={{ ...s.totalLabel, width: '34%' }}>Net Operating Income</Text>
                        <Text style={{ ...s.totalValue, width: '22%', textAlign: 'right', color: colors.green }}>{fmtCurrency(calc.noi)}</Text>
                        <Text style={{ ...s.totalValue, width: '22%', textAlign: 'right' }}>{fmtCurrency(calc.noi_per_unit)}</Text>
                        <Text style={{ ...s.totalValue, width: '22%', textAlign: 'right' }}>{fmtCurrency(calc.noi_per_sf, 2)}</Text>
                    </View>
                    {/* Yield on Cost footer */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: colors.border }}>
                        <Text style={{ fontSize: 8, fontWeight: 700, color: colors.muted }}>Yield on Cost</Text>
                        <Text style={{ fontSize: 10, fontWeight: 700, color: calc.unlevered_yield_on_cost > 0.06 ? colors.green : calc.unlevered_yield_on_cost > 0 ? '#B45309' : colors.muted }}>
                            {calc.unlevered_yield_on_cost > 0 ? fmtPct(calc.unlevered_yield_on_cost) : '—'}
                        </Text>
                    </View>
                </View>

                {renderFooter()}
            </Page>

            {/* ═══════════════════════════ PAGE 2 ═══════════════════════════ */}
            <Page size="LETTER" style={s.page}>
                {renderHeader()}

                <Text style={{ ...s.sectionTitle, marginTop: 0, marginBottom: 10, fontSize: 10 }}>
                    Sensitivity Analysis
                </Text>

                {/* Two-column layout for sensitivity tables */}
                <View style={s.cols}>
                    <View style={s.col}>
                        {/* Rent PSF Sensitivity */}
                        <SensitivityTable
                            title="Rent PSF Sensitivity"
                            headers={['Rent/SF', 'GPR', 'NOI', 'YOC']}
                            rows={rentSens.map((r) => ({
                                col1: fmtCurrency(r.adjustedValue, 2),
                                col2: fmtCurrency(r.gpr),
                                col3: fmtCurrency(r.noi),
                                col4: r.yoc > 0 ? fmtPct(r.yoc) : '—',
                                isBase: r.step === 0,
                            }))}
                        />

                        {/* Land Cost Sensitivity */}
                        <SensitivityTable
                            title="Land Cost Sensitivity"
                            headers={['Land Cost', 'Budget', 'NOI', 'YOC']}
                            rows={lcSens.map((r) => ({
                                col1: fmtCurrency(r.adjustedValue, 0),
                                col2: fmtCurrency(r.totalBudget),
                                col3: fmtCurrency(r.noi),
                                col4: r.yoc > 0 ? fmtPct(r.yoc) : '—',
                                isBase: r.step === 0,
                            }))}
                        />
                    </View>

                    <View style={s.col}>
                        {/* Hard Cost Sensitivity */}
                        <SensitivityTable
                            title="Hard Cost Sensitivity"
                            headers={['HC/NRSF', 'Budget', 'NOI', 'YOC']}
                            rows={hcSens.map((r) => ({
                                col1: fmtCurrency(r.adjustedValue, 2),
                                col2: fmtCurrency(r.totalBudget),
                                col3: fmtCurrency(r.noi),
                                col4: r.yoc > 0 ? fmtPct(r.yoc) : '—',
                                isBase: r.step === 0,
                            }))}
                        />
                    </View>
                </View>

                {/* 2D Matrix: Rent PSF vs Hard Cost — YOC */}
                {matrix && (
                    <View style={{ marginTop: 6 }}>
                        <Text style={{ ...s.sectionTitle, marginTop: 0, marginBottom: 4 }}>
                            Rent PSF vs. Hard Cost — YOC Matrix
                        </Text>
                        {/* Header row */}
                        <View style={s.sensTableHeader}>
                            <Text style={{ ...s.sensCellHeader, width: `${100 / (matrix.hardCostSteps.length + 1)}%` }}>Rent \ HC</Text>
                            {matrix.hardCostSteps.map((step, j) => (
                                <Text key={j} style={{ ...s.sensCellHeader, width: `${100 / (matrix.hardCostSteps.length + 1)}%`, textAlign: 'right' }}>
                                    {step === 0 ? 'Base' : `${step > 0 ? '+' : ''}$${step}`}
                                </Text>
                            ))}
                        </View>
                        {/* Data rows */}
                        {matrix.values.map((row, i) => {
                            const isBaseRow = i === matrix.baseRentIdx;
                            return (
                                <View key={i} style={isBaseRow ? s.sensTableRowBase : s.sensTableRow}>
                                    <Text style={{
                                        ...(isBaseRow ? s.sensCellBold : s.sensCell),
                                        width: `${100 / (matrix.hardCostSteps.length + 1)}%`,
                                    }}>
                                        {matrix.rentSteps[i] === 0
                                            ? 'Base'
                                            : `${matrix.rentSteps[i] > 0 ? '+' : ''}$${matrix.rentSteps[i].toFixed(2)}`}
                                    </Text>
                                    {row.map((yoc, j) => {
                                        const isBase = isBaseRow && j === matrix.baseHcIdx;
                                        return (
                                            <Text key={j} style={{
                                                ...(isBase ? s.sensCellBold : s.sensCell),
                                                width: `${100 / (matrix.hardCostSteps.length + 1)}%`,
                                                textAlign: 'right',
                                            }}>
                                                {yoc > 0 ? fmtPct(yoc) : '—'}
                                            </Text>
                                        );
                                    })}
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Architecture & Planning Notes */}
                {pursuit.arch_notes && (
                    <View style={s.notesBlock}>
                        <Text style={s.notesTitle}>Architecture & Planning Notes</Text>
                        <TiptapPdfContent content={pursuit.arch_notes} />
                    </View>
                )}

                {renderFooter()}
            </Page>
        </Document>
    );
}
