'use client';

import { useState, useEffect } from 'react';
import { fetchPursuitGLTotals, fetchPursuitJobCosts, fetchJobCostMatrix, fetchJobsForProperty, type YardiPursuitCostSummary, type YardiJobCostTransaction, type YardiJobCostMatrixRow } from '@/app/actions/accounting';
import { usePursuitAccountingEntities } from '@/hooks/useSupabaseQueries';
import { Loader2, DollarSign, Calendar, AlertCircle, Building2, Search, SlidersHorizontal, BarChart3, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/constants';

interface PursuitCostsTabProps {
    pursuitId?: string;
    unmappedPropertyCode?: string;
    unmappedName?: string;
}

export function PursuitCostsTab({ pursuitId, unmappedPropertyCode, unmappedName }: PursuitCostsTabProps) {
    const { data: entities = [], isLoading: loadingEntities } = usePursuitAccountingEntities();
    
    const [glData, setGlData] = useState<YardiPursuitCostSummary | null>(null);
    const [jobCosts, setJobCosts] = useState<YardiJobCostTransaction[]>([]);
    const [matrixData, setMatrixData] = useState<YardiJobCostMatrixRow[]>([]);
    
    const [isLoadingCosts, setIsLoadingCosts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'post_date', direction: 'desc' });
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    useEffect(() => {
        const loadCosts = async () => {
            const pursuitEntities = pursuitId 
                ? entities.filter(e => e.pursuit_id === pursuitId)
                : [];
            
            // If we are viewing an unmapped property, create a mock entity array
            const targetEntities = unmappedPropertyCode 
                ? [{ property_code: unmappedPropertyCode, job_id: undefined }] 
                : pursuitEntities;
                
            if (targetEntities.length === 0) return;
            
            setIsLoadingCosts(true);
            setError(null);
            try {
                // Fetch GL Totals
                const propertyCodes = targetEntities.map(e => e.property_code).filter(Boolean);
                if (propertyCodes.length > 0) {
                    const data = await fetchPursuitGLTotals(propertyCodes);
                    if (data.length > 0) {
                        // Aggregate if multiple properties mapped to one pursuit
                        const aggregated = data.reduce((acc, curr) => ({
                            ...acc,
                            earnest_money: acc.earnest_money + curr.earnest_money,
                            wip: acc.wip + curr.wip,
                            wip_contra: acc.wip_contra + curr.wip_contra,
                            net_cost: acc.net_cost + curr.net_cost,
                        }), { ...data[0], earnest_money: 0, wip: 0, wip_contra: 0, net_cost: 0 });
                        setGlData(aggregated);
                    }
                }
                
                // Fetch Job Costs & Matrix
                const rawJobIds = targetEntities.map(e => e.job_id).filter(Boolean);
                let jobIds = rawJobIds.map(String);
                
                // If we are unmapped and have no explicit job_ids, try to auto-fetch them
                if (jobIds.length === 0 && unmappedPropertyCode) {
                    const discoveredJobs = await fetchJobsForProperty(unmappedPropertyCode);
                    if (discoveredJobs.length > 0) {
                        jobIds = discoveredJobs;
                    }
                }
                
                if (jobIds.length > 0) {
                    const [txs, matrix] = await Promise.all([
                        fetchPursuitJobCosts(jobIds),
                        fetchJobCostMatrix(jobIds)
                    ]);
                    setJobCosts(txs);
                    setMatrixData(matrix);
                }
            } catch (err: any) {
                console.error('Error fetching pursuit details costs:', err);
                setError(err.message || 'Failed to fetch accounting data from Yardi');
            } finally {
                setIsLoadingCosts(false);
            }
        };
        
        loadCosts();
    }, [entities, pursuitId, unmappedPropertyCode]);

    const pursuitEntities = pursuitId 
        ? entities.filter(e => e.pursuit_id === pursuitId)
        : [];
        
    const hasMapping = pursuitEntities.length > 0 || !!unmappedPropertyCode;
    
    // Create a lookup for category names from the matrix
    const categoryLookup = matrixData.reduce((acc, row) => {
        if (row.cost_code && row.category_name) {
            acc[row.cost_code] = row.category_name;
        }
        return acc;
    }, {} as Record<string, string>);

    // Get unique categories for dropdown
    const availableCategories = Array.from(new Set(jobCosts.map(tx => tx.cost_category_code))).sort();

    // Apply mapping, filtering, and sorting
    const processedTx = jobCosts
        .map(tx => ({
            ...tx,
            category_name: categoryLookup[tx.cost_category_code] || tx.cost_category_code
        }))
        .filter(tx => {
            // Search filter
            const matchesSearch = 
                tx.line_description?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                tx.vendor_invoice_num?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.category_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.cost_category_code?.toLowerCase().includes(searchTerm.toLowerCase());
            
            // Category filter
            const matchesCategory = selectedCategory ? tx.cost_category_code === selectedCategory : true;
            
            // Date filter
            let matchesDate = true;
            if (dateRange.start && tx.post_date) {
                matchesDate = matchesDate && new Date(tx.post_date) >= new Date(dateRange.start);
            }
            if (dateRange.end && tx.post_date) {
                matchesDate = matchesDate && new Date(tx.post_date) <= new Date(dateRange.end);
            }

            return matchesSearch && matchesCategory && matchesDate;
        })
        .sort((a, b) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            
            let valA: any = a[key as keyof typeof a];
            let valB: any = b[key as keyof typeof b];

            if (key === 'post_date') {
                valA = valA ? new Date(valA).getTime() : 0;
                valB = valB ? new Date(valB).getTime() : 0;
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const SortIcon = ({ columnKey }: { columnKey: string }) => {
        if (sortConfig?.key !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-[var(--accent)]" /> : <ArrowDown className="w-3 h-3 ml-1 text-[var(--accent)]" />;
    };

    // Group Matrix Data by Cost Category
    const matrixSummary = (matrixData || []).reduce((acc, row) => {
        const key = `${row.cost_group}|${row.cost_code}|${row.category_name}`;
        if (!acc[key]) {
            acc[key] = {
                cost_group: row.cost_group || 'Uncategorized',
                cost_code: row.cost_code || 'Unknown',
                category_name: row.category_name || 'General',
                original_budget: 0,
                revised_budget: 0,
                total_spent: 0
            };
        }
        
        acc[key].original_budget = Math.max(acc[key].original_budget, row.original_budget || 0);
        acc[key].revised_budget = Math.max(acc[key].revised_budget, row.revised_budget || 0);
        acc[key].total_spent += (row.total_billed_this_draw || 0);
        
        return acc;
    }, {} as Record<string, { cost_group: string, cost_code: string, category_name: string, original_budget: number, revised_budget: number, total_spent: number }>);

    const sortedMatrixRows = Object.values(matrixSummary).sort((a, b) => {
        if (a.cost_group !== b.cost_group) return a.cost_group.localeCompare(b.cost_group);
        return a.cost_code.localeCompare(b.cost_code);
    });

    const totalMatrixSpent = sortedMatrixRows.reduce((sum, r) => sum + r.total_spent, 0);

    if (loadingEntities || isLoadingCosts) {
        return (
            <div className="flex justify-center items-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
            </div>
        );
    }

    if (!hasMapping) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <Building2 className="w-12 h-12 text-[var(--border-strong)] mb-3" />
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">No Accounting Entities Mapped</p>
                <p className="text-xs text-[var(--text-muted)] max-w-sm">
                    This pursuit is not currently linked to any Yardi property or job cost codes. Go to Admin Settings to map Yardi entities to this pursuit.
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <AlertCircle className="w-12 h-12 text-[var(--danger)] mb-3 opacity-50" />
                <p className="text-sm text-[var(--text-muted)] mb-1">Error Loading Data</p>
                <p className="text-xs text-[var(--danger)]">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* GL Summary Top Level */}
            <div className="card p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-[var(--accent)]" />
                    Overall Pursuit Cost Summary
                </h3>
                {glData ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-1">Earnest Money</div>
                            <div className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(glData.earnest_money)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-1">Gross WIP</div>
                            <div className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(glData.wip)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-1">Contra WIP</div>
                            <div className="text-xl font-bold text-[var(--danger)]">{formatCurrency(glData.wip_contra)}</div>
                        </div>
                        <div className="pt-2 md:pt-0 md:pl-6 md:border-l border-[var(--border)]">
                            <div className="text-[10px] text-[var(--accent)] uppercase tracking-wider font-bold mb-1">Net Pursuit Cost</div>
                            <div className="text-2xl font-bold text-[var(--accent)]">{formatCurrency(glData.net_cost)}</div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-[var(--text-muted)]">No GL data found for the mapped property codes.</p>
                )}
            </div>

            {/* Matrix Actuals Summary */}
            {sortedMatrixRows.length > 0 && (
                <div className="card !p-0 overflow-hidden flex flex-col">
                    <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-[var(--text-muted)]" />
                            Job Cost Rollup
                        </h3>
                    </div>
                    <div className="overflow-x-auto block border-b border-[var(--border)]">
                        <table className="data-table w-full">
                            <thead className="bg-[var(--bg-primary)]">
                                <tr>
                                    <th className="text-left w-24">Code</th>
                                    <th className="text-left">Category</th>
                                    <th className="text-left w-32">Group</th>
                                    <th className="text-right w-32">Total Spent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedMatrixRows.map((row) => (
                                    <tr key={row.cost_code} className="hover:bg-[var(--bg-elevated)] transition-colors text-sm">
                                        <td className="font-mono text-xs text-[var(--text-muted)]">{row.cost_code}</td>
                                        <td className="text-[var(--text-primary)] font-medium">{row.category_name}</td>
                                        <td className="text-[var(--text-secondary)] text-xs">{row.cost_group}</td>
                                        <td className="text-right font-mono text-[var(--text-primary)]">{formatCurrency(row.total_spent)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-[var(--bg-elevated)] border-t border-[var(--border)]">
                                <tr>
                                    <td colSpan={3} className="font-bold text-right text-xs uppercase tracking-wider text-[var(--text-secondary)] py-3">Total Displayed</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)]">{formatCurrency(totalMatrixSpent)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Job Costs Detail */}
            <div className="card !p-0 overflow-hidden flex flex-col">
                <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-[var(--text-muted)]" />
                        Job Cost Transactions
                        <span className="text-[10px] bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-0.5 rounded-full ml-1">
                            {processedTx.length}
                        </span>
                    </h3>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
                        {/* Filters */}
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="px-2 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)]"
                                title="Start Date"
                            />
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="px-2 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)]"
                                title="End Date"
                            />
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="px-2 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)] max-w-[150px]"
                            >
                                <option value="">All Categories</option>
                                {availableCategories.map(cat => (
                                    <option key={cat} value={cat}>
                                        {cat} {categoryLookup[cat] ? `- ${categoryLookup[cat]}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Search */}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                            <input 
                                type="text" 
                                placeholder="Search descriptions, vendors..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)] transition-colors"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="overflow-x-auto min-h-[300px] max-h-[600px] overflow-y-auto block rounded-b-xl border border-[var(--border)]">
                    <table className="data-table w-full">
                        <thead className="sticky top-0 bg-[var(--bg-primary)] z-10 shadow-sm border-b border-[var(--border)]">
                            <tr>
                                <th className="text-left w-24 cursor-pointer hover:bg-[var(--bg-elevated)] select-none" onClick={() => handleSort('post_date')}>
                                    <div className="flex items-center">Date <SortIcon columnKey="post_date" /></div>
                                </th>
                                <th className="text-left w-32 cursor-pointer hover:bg-[var(--bg-elevated)] select-none" onClick={() => handleSort('job_code')}>
                                    <div className="flex items-center">Job Code <SortIcon columnKey="job_code" /></div>
                                </th>
                                <th className="text-left w-48 cursor-pointer hover:bg-[var(--bg-elevated)] select-none" onClick={() => handleSort('cost_category_code')}>
                                    <div className="flex items-center">Category <SortIcon columnKey="cost_category_code" /></div>
                                </th>
                                <th className="text-left cursor-pointer hover:bg-[var(--bg-elevated)] select-none" onClick={() => handleSort('line_description')}>
                                    <div className="flex items-center">Description <SortIcon columnKey="line_description" /></div>
                                </th>
                                <th className="text-left cursor-pointer hover:bg-[var(--bg-elevated)] select-none" onClick={() => handleSort('vendor_invoice_num')}>
                                    <div className="flex items-center">Invoice # <SortIcon columnKey="vendor_invoice_num" /></div>
                                </th>
                                <th className="text-right w-36 cursor-pointer hover:bg-[var(--bg-elevated)] select-none" onClick={() => handleSort('amount')}>
                                    <div className="flex items-center justify-end">Amount <SortIcon columnKey="amount" /></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedTx.map((tx, idx) => (
                                <tr key={`${tx.id}-${idx}`} className="hover:bg-[var(--bg-elevated)] transition-colors text-sm">
                                    <td className="text-[var(--text-secondary)] whitespace-nowrap">
                                        {tx.post_date ? new Date(tx.post_date).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="font-mono text-xs text-[var(--text-muted)]">{tx.job_code}</td>
                                    <td className="text-[var(--text-secondary)]">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-mono">{tx.cost_category_code}</span>
                                            <span className="text-xs truncate max-w-[180px]" title={tx.category_name}>{tx.category_name !== tx.cost_category_code ? tx.category_name : ''}</span>
                                        </div>
                                    </td>
                                    <td className="text-[var(--text-primary)]">{tx.line_description}</td>
                                    <td className="text-[var(--text-secondary)]">{tx.vendor_invoice_num || '—'}</td>
                                    <td className={`text-right font-mono font-medium ${tx.amount < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                                        {formatCurrency(tx.amount)}
                                    </td>
                                </tr>
                            ))}

                            {processedTx.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-16 text-[var(--text-muted)]">
                                        {searchTerm ? 'No job costs match your search.' : 'No job cost transactions found for mapped job IDs.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {processedTx.length > 0 && (
                            <tfoot className="sticky bottom-0 bg-[var(--bg-elevated)] shadow-[0_-1px_3px_rgba(0,0,0,0.05)] border-t border-[var(--border)]">
                                <tr>
                                    <td colSpan={5} className="font-bold text-right text-xs uppercase tracking-wider text-[var(--text-secondary)] py-3">Total Displayed</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)]">
                                        {formatCurrency(processedTx.reduce((sum, tx) => sum + tx.amount, 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
