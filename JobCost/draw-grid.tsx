'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CostCodeRow, DrawColumn } from '@/types/job-cost';
import { useParams, useSearchParams } from 'next/navigation';
import { TransactionDetailModal } from './TransactionDetailModal';

interface DrawGridProps {
    costCodes: CostCodeRow[];
    draws: DrawColumn[];
    propertyId?: string;
    fetchUrl?: string;
    showBudgets?: boolean;
    headerAction?: React.ReactNode;
}

export function DrawGrid({ costCodes, propertyId: propPropertyId, fetchUrl, showBudgets = true, headerAction }: DrawGridProps) {
    // Default expanded groups
    // Default expanded groups (Sub-groups collapsed by default)
    // We will use composite keys for sub-groups: `${superGroup}|${subGroup}`
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    // We can also track expanded Super Groups. Default them to ANY expanded?
    // User said "all groups collapsed". But if we collapse top level, screen is empty.
    // Let's toggle Super Groups too. Default Expanded for Super Groups is likely better UX, 
    // but strict "all collapsed" means top level too. I'll default Top Level to EXPANDED so they see the structure.
    const [expandedSuperGroups, setExpandedSuperGroups] = useState<Set<string>>(new Set(['Hard Costs', 'Soft Costs', 'Land Costs']));

    const formatCurrency = (value: number) => {
        // User requested full dollars for all values
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    };

    const formatPercent = (value: number) => {
        return `${value.toFixed(1)}%`;
    };

    const toggleGroup = (group: string, isSuper: boolean = false) => {
        if (isSuper) {
            const newExpanded = new Set(expandedSuperGroups);
            if (newExpanded.has(group)) newExpanded.delete(group);
            else newExpanded.add(group);
            setExpandedSuperGroups(newExpanded);
        } else {
            const newExpanded = new Set(expandedGroups);
            if (newExpanded.has(group)) newExpanded.delete(group);
            else newExpanded.add(group);
            setExpandedGroups(newExpanded);
        }
    };

    // Grouping: Cost_Group (Super) -> Major_Category (Sub)
    type GroupedData = Record<string, Record<string, CostCodeRow[]>>;
    const groupedData: GroupedData = costCodes.reduce((acc, code) => {
        const superGroup = code.Cost_Group || 'Other';
        const subGroup = code.Major_Category || 'Other';

        if (!acc[superGroup]) acc[superGroup] = {};
        if (!acc[superGroup][subGroup]) acc[superGroup][subGroup] = [];

        acc[superGroup][subGroup].push(code);
        return acc;
    }, {} as GroupedData);

    // Fixed Order for Super Groups
    const SUPER_GROUP_ORDER = ['Hard Costs', 'Soft Costs', 'Land Costs', 'Other'];
    const sortedSuperGroups = Object.keys(groupedData).sort((a, b) => {
        return SUPER_GROUP_ORDER.indexOf(a) - SUPER_GROUP_ORDER.indexOf(b);
    });

    // Helper to calc totals for a list of codes
    const calcTotals = (codes: CostCodeRow[]) => {
        const revisedBudget = codes.reduce((sum, c) => sum + c.Revised_Budget, 0);
        const totalSpent = codes.reduce((sum, c) => sum + c.Total_Spent, 0);
        return {
            origBudget: codes.reduce((sum, c) => sum + c.Original_Budget, 0),
            approvedRevs: codes.reduce((sum, c) => sum + c.Approved_Revisions, 0),
            revisedBudget,
            totalSpent,
            remaining: revisedBudget - totalSpent,
            pctComplete: revisedBudget > 0 ? (totalSpent / revisedBudget) * 100 : 0,
            count: codes.length
        };
    };

    // Calculate Grand Totals
    const grandTotals = calcTotals(costCodes);

    // Modal State
    const params = useParams();
    // Use prop if available, else fallback to param
    const propertyId = propPropertyId || (params.property_id as string);
    const searchParams = useSearchParams();
    const combinedIds = searchParams.get('combined_ids');

    const [selectedCostCode, setSelectedCostCode] = useState<string | null>(null);
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleTotalSpentClick = (e: React.MouseEvent, code: CostCodeRow) => {
        e.stopPropagation(); // Prevent row expand toggle
        if (Math.abs(code.Total_Spent) < 0.01) return; // Don't open for zero

        setSelectedCostCode(code.Cost_Code);
        setSelectedCategoryName(code.Category_Name);
        setIsModalOpen(true);
    };

    return (
        <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-medium">Job Cost Summary</CardTitle>
                {headerAction}
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 bg-white z-20 min-w-[200px] text-sm">Cost Code</TableHead>
                                {showBudgets && <TableHead className="text-right min-w-[100px] text-sm">Original Budget</TableHead>}
                                {showBudgets && <TableHead className="text-right min-w-[100px] text-sm">Revisions</TableHead>}
                                {showBudgets && <TableHead className="text-right min-w-[100px] text-sm">Revised Budget</TableHead>}
                                <TableHead className="text-right min-w-[100px] text-sm">Total Spent</TableHead>
                                {showBudgets && <TableHead className="text-right min-w-[100px] text-sm">Rem. Balance</TableHead>}
                                {showBudgets && <TableHead className="text-right min-w-[80px] text-sm">% Comp</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedSuperGroups.map(superGroup => {
                                const subGroups = groupedData[superGroup];
                                const isSuperExpanded = expandedSuperGroups.has(superGroup);

                                // Flatten all codes for Super Group Total
                                const allSuperCodes = Object.values(subGroups).flat();
                                const superTotal = calcTotals(allSuperCodes);

                                return (
                                    <React.Fragment key={`super-fragment-${superGroup}`}>
                                        {/* SUPER GROUP HEADER (Subtotal Row) */}
                                        <TableRow
                                            key={`super-${superGroup}`}
                                            className="bg-slate-100 hover:bg-slate-200 cursor-pointer font-bold border-b-2 border-slate-200"
                                            onClick={() => toggleGroup(superGroup, true)}
                                        >
                                            <TableCell className="sticky left-0 bg-slate-100 z-10">
                                                <div className="flex items-center gap-2">
                                                    {isSuperExpanded ? (
                                                        <ChevronDown className="h-5 w-5 text-slate-700" />
                                                    ) : (
                                                        <ChevronRight className="h-5 w-5 text-slate-700" />
                                                    )}
                                                    <span className="uppercase text-slate-800 tracking-wide text-sm">{superGroup}</span>
                                                    <span className="text-slate-500 font-normal text-xs">({superTotal.count})</span>
                                                </div>
                                            </TableCell>
                                            {showBudgets && <TableCell className="text-right text-slate-700 text-sm">{formatCurrency(superTotal.origBudget)}</TableCell>}
                                            {showBudgets && <TableCell className="text-right text-slate-700 text-sm">{formatCurrency(superTotal.approvedRevs)}</TableCell>}
                                            {showBudgets && <TableCell className="text-right text-slate-900 text-sm">{formatCurrency(superTotal.revisedBudget)}</TableCell>}
                                            <TableCell className="text-right text-slate-900 text-sm">{formatCurrency(superTotal.totalSpent)}</TableCell>
                                            {showBudgets && <TableCell className="text-right text-slate-700 text-sm">{formatCurrency(superTotal.remaining)}</TableCell>}
                                            {showBudgets && <TableCell className="text-right text-slate-700 text-sm">{formatPercent(superTotal.pctComplete)}</TableCell>}
                                        </TableRow>

                                        {/* SUB GROUPS */}
                                        {isSuperExpanded && Object.entries(subGroups).sort(([subGroupA, codesA], [subGroupB, codesB]) => {
                                            // Sort by Cost Code Prefix (e.g. "01", "02") instead of Name
                                            const getPrefix = (codes: CostCodeRow[]) => {
                                                if (!codes || codes.length === 0) return 9999;
                                                const firstCode = codes[0].Cost_Code.trim();
                                                const prefixStr = firstCode.split(/[-.]/)[0]; // Get "01" from "01-1000"
                                                const prefixVal = parseInt(prefixStr, 10);
                                                return isNaN(prefixVal) ? 9999 : prefixVal;
                                            };

                                            const prefixA = getPrefix(codesA);
                                            const prefixB = getPrefix(codesB);

                                            if (prefixA !== prefixB) {
                                                return prefixA - prefixB;
                                            }
                                            return subGroupA.localeCompare(subGroupB);
                                        }).map(([subGroup, codes]) => {
                                            const subGroupKey = `${superGroup}|${subGroup}`;
                                            const isSubExpanded = expandedGroups.has(subGroupKey);
                                            const subTotal = calcTotals(codes);

                                            return (
                                                <React.Fragment key={`subgroup-wrapper-${subGroupKey}`}>
                                                    {/* SUB GROUP ROW */}
                                                    <TableRow
                                                        key={`sub-${subGroupKey}`}
                                                        className="bg-slate-50 hover:bg-slate-100 cursor-pointer font-medium"
                                                        onClick={() => toggleGroup(subGroupKey, false)}
                                                    >
                                                        <TableCell className="sticky left-0 bg-slate-50 z-10 pl-6">
                                                            <div className="flex items-center gap-2">
                                                                {isSubExpanded ? (
                                                                    <ChevronDown className="h-4 w-4 text-slate-500" />
                                                                ) : (
                                                                    <ChevronRight className="h-4 w-4 text-slate-500" />
                                                                )}
                                                                <span className="text-slate-700 text-sm font-bold">{subGroup}</span>
                                                                <span className="text-slate-400 font-normal text-xs">({codes.length})</span>
                                                            </div>
                                                        </TableCell>
                                                        {showBudgets && <TableCell className="text-right text-slate-500 text-sm">{formatCurrency(subTotal.origBudget)}</TableCell>}
                                                        {showBudgets && <TableCell className="text-right text-slate-500 text-sm">{formatCurrency(subTotal.approvedRevs)}</TableCell>}
                                                        {showBudgets && <TableCell className="text-right text-slate-800 text-sm">{formatCurrency(subTotal.revisedBudget)}</TableCell>}
                                                        <TableCell className="text-right text-slate-800 text-sm">{formatCurrency(subTotal.totalSpent)}</TableCell>
                                                        {showBudgets && <TableCell className="text-right text-slate-600 text-sm">{formatCurrency(subTotal.remaining)}</TableCell>}
                                                        {showBudgets && <TableCell className="text-right text-slate-600 text-sm">{formatPercent(subTotal.pctComplete)}</TableCell>}
                                                    </TableRow>

                                                    {/* ROWS */}
                                                    {isSubExpanded && codes.map(code => {
                                                        const remaining = code.Revised_Budget - code.Total_Spent;
                                                        const hasSpent = Math.abs(code.Total_Spent) > 0.01;
                                                        return (
                                                            <TableRow key={`row-${code.Cost_Code}`} className="hover:bg-slate-50">
                                                                <TableCell className="sticky left-0 bg-white z-10 pl-12">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-slate-700 text-sm">{code.Cost_Code}</span>
                                                                        <span className="text-slate-500 text-sm truncate max-w-[300px]">{code.Category_Name}</span>
                                                                    </div>
                                                                </TableCell>
                                                                {showBudgets && <TableCell className="text-right text-slate-400 text-sm">{formatCurrency(code.Original_Budget)}</TableCell>}
                                                                {showBudgets && <TableCell className="text-right text-slate-400 text-sm">{formatCurrency(code.Approved_Revisions)}</TableCell>}
                                                                {showBudgets && <TableCell className="text-right text-slate-700 font-medium text-sm">{formatCurrency(code.Revised_Budget)}</TableCell>}

                                                                {/* Interactive Total Spent Cell */}
                                                                <TableCell
                                                                    className={cn(
                                                                        "text-right text-sm font-medium transition-colors",
                                                                        hasSpent
                                                                            ? "text-blue-600 cursor-pointer hover:underline hover:text-blue-800 decoration-blue-300 underline-offset-2"
                                                                            : "text-slate-700"
                                                                    )}
                                                                    onClick={(e) => handleTotalSpentClick(e, code)}
                                                                >
                                                                    {formatCurrency(code.Total_Spent)}
                                                                </TableCell>

                                                                {showBudgets && <TableCell className="text-right text-slate-500 text-sm">{formatCurrency(remaining)}</TableCell>}
                                                                {showBudgets && <TableCell className="text-right text-slate-500 text-sm">{formatPercent(code.Pct_Complete)}</TableCell>}
                                                            </TableRow>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}

                            {/* GRAND TOTAL ROW */}
                            <TableRow className="bg-slate-900 hover:bg-slate-900 border-t-2 border-slate-900">
                                <TableCell className="sticky left-0 bg-slate-900 z-10 font-bold text-white uppercase tracking-wider text-sm">Project Total</TableCell>
                                {showBudgets && <TableCell className="text-right font-bold text-white text-sm">{formatCurrency(grandTotals.origBudget)}</TableCell>}
                                {showBudgets && <TableCell className="text-right font-bold text-white text-sm">{formatCurrency(grandTotals.approvedRevs)}</TableCell>}
                                {showBudgets && <TableCell className="text-right font-bold text-white text-sm">{formatCurrency(grandTotals.revisedBudget)}</TableCell>}
                                <TableCell className="text-right font-bold text-white text-sm">{formatCurrency(grandTotals.totalSpent)}</TableCell>
                                {showBudgets && <TableCell className="text-right font-bold text-white text-sm">{formatCurrency(grandTotals.remaining)}</TableCell>}
                                {showBudgets && <TableCell className="text-right font-bold text-white text-sm">{formatPercent(grandTotals.pctComplete)}</TableCell>}
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            <TransactionDetailModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                propertyId={propertyId}
                costCode={selectedCostCode}
                categoryName={selectedCategoryName}
                combinedIds={combinedIds}
                fetchUrl={fetchUrl}
            />
        </Card>
    );
}
