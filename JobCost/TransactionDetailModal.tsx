'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface Transaction {
    Date: string;
    Vendor: string;
    Description: string;
    Amount: number;
    Cost_Code: string;
}

interface TransactionDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    costCode: string | null;
    categoryName?: string;
    combinedIds?: string | null;
    fetchUrl?: string;
}

type SortField = 'Date' | 'Vendor' | 'Description' | 'Amount';
type SortDirection = 'asc' | 'desc';

export function TransactionDetailModal({
    isOpen,
    onClose,
    propertyId,
    costCode,
    categoryName,
    combinedIds,
    fetchUrl
}: TransactionDetailModalProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('Date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    useEffect(() => {
        if (isOpen && costCode && propertyId) {
            fetchTransactions();
        } else {
            // Reset when closed
            setTransactions([]);
            setError(null);
        }
    }, [isOpen, costCode, propertyId, combinedIds]);

    const fetchTransactions = async () => {
        if (!costCode) return;

        setIsLoading(true);
        setError(null);

        try {
            // Encode cost code to handle special characters (though unlikely in simple codes)
            const encodedCode = encodeURIComponent(costCode);
            let url = fetchUrl
                ? fetchUrl.replace('[cost_code]', encodedCode)
                : `/api/job-cost/${propertyId}/transactions/${encodedCode}`;

            if (combinedIds && !fetchUrl) {
                url += `?combined_ids=${combinedIds}`;
            }

            const res = await fetch(url);

            if (!res.ok) {
                throw new Error('Failed to fetch transactions');
            }

            const data = await res.json();
            setTransactions(data.transactions || []);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error loading data');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            // Toggle direction
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'Amount' || field === 'Date' ? 'desc' : 'asc');
        }
    };

    const sortedTransactions = useMemo(() => {
        return [...transactions].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'Date':
                    comparison = new Date(a.Date).getTime() - new Date(b.Date).getTime();
                    break;
                case 'Vendor':
                    comparison = (a.Vendor || '').localeCompare(b.Vendor || '');
                    break;
                case 'Description':
                    comparison = (a.Description || '').localeCompare(b.Description || '');
                    break;
                case 'Amount':
                    comparison = a.Amount - b.Amount;
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [transactions, sortField, sortDirection]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowUpDown className="inline ml-1 h-3 w-3 text-slate-400" />;
        }
        return sortDirection === 'asc'
            ? <ArrowUp className="inline ml-1 h-3 w-3 text-blue-600" />
            : <ArrowDown className="inline ml-1 h-3 w-3 text-blue-600" />;
    };

    const formatCurrency = (val: number) => {
        return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString();
    };

    const totalAmount = transactions.reduce((sum, t) => sum + t.Amount, 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[90vw] max-w-[1400px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span>Transaction Details</span>
                        {costCode && <span className="text-slate-500 font-normal text-sm bg-slate-100 px-2 py-1 rounded">{costCode}</span>}
                        {categoryName && <span className="text-slate-400 font-normal text-sm truncate max-w-[300px]">{categoryName}</span>}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto min-h-[300px]">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                        </div>
                    ) : error ? (
                        <div className="flex h-full items-center justify-center text-red-500">
                            {error}
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-slate-400 italic">
                            No transactions found for this cost code.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead
                                        className="w-[110px] cursor-pointer hover:bg-slate-50 select-none"
                                        onClick={() => handleSort('Date')}
                                    >
                                        Date <SortIcon field="Date" />
                                    </TableHead>
                                    <TableHead
                                        className="w-[280px] cursor-pointer hover:bg-slate-50 select-none"
                                        onClick={() => handleSort('Vendor')}
                                    >
                                        Vendor <SortIcon field="Vendor" />
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer hover:bg-slate-50 select-none"
                                        onClick={() => handleSort('Description')}
                                    >
                                        Description <SortIcon field="Description" />
                                    </TableHead>
                                    <TableHead
                                        className="text-right w-[130px] cursor-pointer hover:bg-slate-50 select-none"
                                        onClick={() => handleSort('Amount')}
                                    >
                                        Amount <SortIcon field="Amount" />
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedTransactions.map((t, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="text-sm text-slate-600">{formatDate(t.Date)}</TableCell>
                                        <TableCell className="text-sm font-medium text-slate-800">{t.Vendor}</TableCell>
                                        <TableCell className="text-sm text-slate-500" title={t.Description}>{t.Description}</TableCell>
                                        <TableCell className="text-right text-sm font-bold text-slate-700">{formatCurrency(t.Amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <div className="border-t pt-4 flex justify-end items-center gap-4 bg-slate-50 p-4 -mx-6 -mb-6 rounded-b-lg">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wide">Total Spent</span>
                    <span className="text-xl font-bold text-slate-900">{formatCurrency(totalAmount)}</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}
