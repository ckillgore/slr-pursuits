'use client';

import { Fragment } from 'react';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import {
    usePursuit,
    useOnePagers,
    useProductTypes,
} from '@/hooks/useSupabaseQueries';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/constants';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { OnePager } from '@/types';

type MetricRow = {
    label: string;
    getValue: (op: OnePager) => string;
    highlight?: boolean;
};

const metricSections: { title: string; rows: MetricRow[] }[] = [
    {
        title: 'Returns',
        rows: [
            { label: 'Unlevered YOC', getValue: (op) => op.calc_yoc ? formatPercent(op.calc_yoc) : '—', highlight: true },
            { label: 'NOI', getValue: (op) => op.calc_noi ? formatCurrency(op.calc_noi, 0) : '—' },
            { label: 'NOI / Unit', getValue: (op) => op.calc_noi_per_unit ? formatCurrency(op.calc_noi_per_unit, 0) : '—' },
        ],
    },
    {
        title: 'Site & Density',
        rows: [
            { label: 'Total Units', getValue: (op) => formatNumber(op.total_units) },
            { label: 'Total NRSF', getValue: (op) => op.calc_total_nrsf ? formatNumber(op.calc_total_nrsf) : '—' },
            { label: 'Total GBSF', getValue: (op) => op.calc_total_gbsf ? formatNumber(op.calc_total_gbsf) : '—' },
            { label: 'Efficiency Ratio', getValue: (op) => formatPercent(op.efficiency_ratio) },
        ],
    },
    {
        title: 'Revenue',
        rows: [
            { label: 'GPR', getValue: (op) => op.calc_gpr ? formatCurrency(op.calc_gpr, 0) : '—' },
            { label: 'Net Revenue', getValue: (op) => op.calc_net_revenue ? formatCurrency(op.calc_net_revenue, 0) : '—' },
            { label: 'Vacancy Rate', getValue: (op) => formatPercent(op.vacancy_rate) },
            { label: 'Other Income ($/unit/mo)', getValue: (op) => formatCurrency(op.other_income_per_unit_month) },
        ],
    },
    {
        title: 'Budget',
        rows: [
            { label: 'Hard Cost ($/NRSF)', getValue: (op) => formatCurrency(op.hard_cost_per_nrsf) },
            { label: 'Hard Cost (Total)', getValue: (op) => op.calc_hard_cost ? formatCurrency(op.calc_hard_cost, 0) : '—' },
            { label: 'Soft Cost', getValue: (op) => op.calc_soft_cost ? formatCurrency(op.calc_soft_cost, 0) : '—' },
            { label: 'Land Cost', getValue: (op) => formatCurrency(op.land_cost, 0) },
            { label: 'Total Budget', getValue: (op) => op.calc_total_budget ? formatCurrency(op.calc_total_budget, 0) : '—', highlight: true },
            { label: 'Cost / Unit', getValue: (op) => op.calc_cost_per_unit ? formatCurrency(op.calc_cost_per_unit, 0) : '—' },
        ],
    },
    {
        title: 'Operating Expenses',
        rows: [
            { label: 'Total OpEx', getValue: (op) => op.calc_total_opex ? formatCurrency(op.calc_total_opex, 0) : '—' },
            {
                label: 'OpEx / Unit', getValue: (op) => {
                    if (!op.calc_total_opex || !op.total_units) return '—';
                    return formatCurrency(op.calc_total_opex / op.total_units, 0);
                }
            },
            { label: 'Mgmt Fee %', getValue: (op) => formatPercent(op.mgmt_fee_pct) },
        ],
    },
    {
        title: 'Assumptions',
        rows: [
            { label: 'Soft Cost %', getValue: (op) => formatPercent(op.soft_cost_pct) },
            { label: 'Payroll Burden %', getValue: (op) => formatPercent(op.payroll_burden_pct) },
            { label: 'Tax Mil Rate', getValue: (op) => formatNumber(op.tax_mil_rate, 4) },
        ],
    },
];

export default function ComparisonPage() {
    const params = useParams();
    const pursuitId = params.id as string;

    const { data: pursuit, isLoading: loadingPursuit } = usePursuit(pursuitId);
    const { data: onePagers = [], isLoading: loadingOPs } = useOnePagers(pursuitId);
    const { data: productTypes = [] } = useProductTypes();

    const activeOPs = onePagers.filter((op) => !op.is_archived);

    if (loadingPursuit || loadingOPs) {
        return (
            <AppShell>
                <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#C8CDD5]" /></div>
            </AppShell>
        );
    }

    if (!pursuit) {
        return (
            <AppShell>
                <div className="max-w-7xl mx-auto px-6 py-12 text-center">
                    <p className="text-[#7A8599]">Pursuit not found.</p>
                </div>
            </AppShell>
        );
    }

    // Find the best YOC for highlighting
    const yocValues = activeOPs.map(op => op.calc_yoc ?? 0);
    const bestYoc = Math.max(...yocValues);

    return (
        <AppShell>
            <div className="max-w-full mx-auto px-6 py-8">
                {/* Breadcrumb */}
                <Link
                    href={`/pursuits/${pursuitId}`}
                    className="inline-flex items-center gap-1.5 text-sm text-[#7A8599] hover:text-[#4A5568] transition-colors mb-6"
                >
                    <ChevronLeft className="w-4 h-4" /> Back to {pursuit.name}
                </Link>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[#1A1F2B]">Scenario Comparison</h1>
                    <p className="text-sm text-[#7A8599] mt-1">
                        Comparing {activeOPs.length} one-pager{activeOPs.length !== 1 ? 's' : ''} for {pursuit.name}
                    </p>
                </div>

                {activeOPs.length < 2 && (
                    <div className="card flex flex-col items-center py-12 text-center">
                        <p className="text-sm text-[#7A8599]">Create at least 2 one-pagers to compare scenarios side-by-side.</p>
                        <Link href={`/pursuits/${pursuitId}`} className="mt-4 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors">
                            Back to Pursuit
                        </Link>
                    </div>
                )}

                {activeOPs.length >= 2 && (
                    <div className="card overflow-x-auto">
                        <table className="w-full border-collapse">
                            {/* Header row — scenario names */}
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 bg-white text-left text-xs font-bold text-[#7A8599] uppercase tracking-wider py-3 px-4 border-b border-[#E2E5EA] min-w-[180px]">
                                        Metric
                                    </th>
                                    {activeOPs.map((op) => {
                                        const pt = op.product_type ?? productTypes.find((p) => p.id === op.product_type_id);
                                        const isBest = bestYoc > 0 && op.calc_yoc === bestYoc;
                                        return (
                                            <th
                                                key={op.id}
                                                className={`text-center py-3 px-4 border-b border-[#E2E5EA] min-w-[140px] ${isBest ? 'bg-[#EBF1FF]' : ''}`}
                                            >
                                                <Link href={`/pursuits/${pursuitId}/one-pagers/${op.id}`} className="hover:text-[#2563EB] transition-colors">
                                                    <div className="text-sm font-semibold text-[#1A1F2B]">{op.name}</div>
                                                </Link>
                                                {pt && <div className="text-[10px] text-[#A0AABB] mt-0.5">{pt.name}</div>}
                                                {isBest && <div className="text-[9px] font-bold text-[#2563EB] uppercase mt-1">★ Best YOC</div>}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {metricSections.map((section) => (
                                    <Fragment key={section.title}>
                                        {/* Section header */}
                                        <tr>
                                            <td
                                                colSpan={activeOPs.length + 1}
                                                className="sticky left-0 z-10 bg-[#FAFBFC] text-[10px] font-bold text-[#A0AABB] uppercase tracking-wider py-2 px-4 border-b border-[#F0F1F4]"
                                            >
                                                {section.title}
                                            </td>
                                        </tr>
                                        {/* Metric rows */}
                                        {section.rows.map((row) => (
                                            <tr key={row.label} className="hover:bg-[#FAFBFC] transition-colors">
                                                <td className="sticky left-0 z-10 bg-white text-xs text-[#4A5568] py-2 px-4 border-b border-[#F0F1F4] whitespace-nowrap">
                                                    {row.label}
                                                </td>
                                                {activeOPs.map((op) => {
                                                    const isBest = bestYoc > 0 && op.calc_yoc === bestYoc;
                                                    return (
                                                        <td
                                                            key={op.id}
                                                            className={`text-right text-xs tabular-nums py-2 px-4 border-b border-[#F0F1F4] ${row.highlight ? 'font-bold text-[#1A1F2B]' : 'text-[#4A5568]'
                                                                } ${isBest ? 'bg-[#EBF1FF]/50' : ''}`}
                                                        >
                                                            {row.getValue(op)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
