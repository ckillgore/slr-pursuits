'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchPursuitGLTotals, fetchPursuitJobCosts, fetchJobCostMatrix, type YardiPursuitCostSummary, type YardiJobCostTransaction, type YardiJobCostMatrixRow } from '@/app/actions/accounting';
import { usePursuitAccountingEntities } from '@/hooks/useSupabaseQueries';
import { resolvePursuitJobIds } from '@/components/pursuits/accountingJobs';
import { Loader2, DollarSign, AlertCircle, Building2, Search, SlidersHorizontal, BarChart3, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

/** 'YYYY-MM-DD…' → 'YYYY-MM-DD' (date-only, no timezone shift). */
function datePart(d: string | null | undefined): string {
    return d ? d.substring(0, 10) : '';
}

/** Format a Yardi post date without the UTC→local shift that `new Date('YYYY-MM-DD')` causes. */
function formatPostDate(d: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString();
    return new Date(d).toLocaleDateString();
}

interface PursuitCostsTabProps {
    pursuitId?: string;
    unmappedPropertyCode?: string;
    unmappedName?: string;
}

export function PursuitCostsTab({ pursuitId, unmappedPropertyCode, unmappedName }: PursuitCostsTabProps) {
    const { data: entities, isLoading: loadingEntities, isError: entitiesError, refetch: refetchEntities } = usePursuitAccountingEntities();
    // Bumped by "Retry" to re-run the Yardi load
    const [reloadKey, setReloadKey] = useState(0);
    
    const [glData, setGlData] = useState<YardiPursuitCostSummary | null>(null);
    const [jobCosts, setJobCosts] = useState<YardiJobCostTransaction[]>([]);
    const [matrixData, setMatrixData] = useState<YardiJobCostMatrixRow[]>([]);
    
    const [isLoadingCosts, setIsLoadingCosts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'post_date', direction: 'desc' });
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
    
    // Explicit single-dropdown focus
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Hidden parameterized list-based cost code drilldown from external URLs
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const costCodesQuery = searchParams.get('cost_codes');
    const [filterCodes, setFilterCodes] = useState<string[]>([]);

    // Drill-down URL on the current page (also used by the unmapped-property report page),
    // preserving any other query params such as ?name=
    const costCodesHref = (codes: string | null) => {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set('tab', 'costs');
        if (codes) sp.set('cost_codes', codes);
        else sp.delete('cost_codes');
        return `${pathname}?${sp.toString()}`;
    };
    
    useEffect(() => {
        if (costCodesQuery) {
            setFilterCodes(costCodesQuery.split(',').map(c => c.trim()).filter(Boolean));
        } else {
            setFilterCodes([]);
        }
    }, [costCodesQuery]);

    // The Yardi entities this view loads. Keyed by value, so a refetch of the (all-pursuits)
    // entity list that doesn't change this pursuit's mapping doesn't blank and reload the tab.
    const pursuitEntities = useMemo(
        () => (pursuitId && entities ? entities.filter(e => e.pursuit_id === pursuitId) : []),
        [entities, pursuitId]
    );
    const targetEntities = useMemo(
        () => unmappedPropertyCode
            ? [{ property_code: unmappedPropertyCode, job_id: null }]
            : pursuitEntities.map(e => ({ property_code: e.property_code, job_id: e.job_id })),
        [unmappedPropertyCode, pursuitEntities]
    );
    const targetKey = JSON.stringify(targetEntities);

    useEffect(() => {
        let cancelled = false;
        // Reset so a previous pursuit's data never shows while (or instead of) loading this one
        setGlData(null);
        setJobCosts([]);
        setMatrixData([]);
        setError(null);
        const targets: { property_code: string; job_id: number | null }[] = JSON.parse(targetKey);
        if (targets.length === 0) return;

        const loadCosts = async () => {
            setIsLoadingCosts(true);
            try {
                const propertyCodes = targets.map(e => e.property_code).filter(Boolean);
                // GL totals and job discovery are independent — run them together.
                // Job rule (shared with the Pre-Dev budget): explicit job_id, else every job on the property.
                const [glRows, jobIds] = await Promise.all([
                    propertyCodes.length > 0 ? fetchPursuitGLTotals(propertyCodes) : Promise.resolve([]),
                    resolvePursuitJobIds(targets),
                ]);
                if (cancelled) return;
                if (glRows.length > 0) {
                    // Aggregate if multiple properties mapped to one pursuit
                    const aggregated = glRows.reduce((acc, curr) => ({
                        ...acc,
                        earnest_money: acc.earnest_money + curr.earnest_money,
                        wip: acc.wip + curr.wip,
                        wip_contra: acc.wip_contra + curr.wip_contra,
                        net_cost: acc.net_cost + curr.net_cost,
                    }), { ...glRows[0], earnest_money: 0, wip: 0, wip_contra: 0, net_cost: 0 });
                    setGlData(aggregated);
                }

                if (jobIds.length > 0) {
                    const [txs, matrix] = await Promise.all([
                        fetchPursuitJobCosts(jobIds),
                        fetchJobCostMatrix(jobIds)
                    ]);
                    if (cancelled) return;
                    setJobCosts(txs);
                    setMatrixData(matrix);
                }
            } catch (err: any) {
                console.error('Error fetching pursuit details costs:', err);
                if (!cancelled) setError(err.message || 'Failed to fetch accounting data from Yardi');
            } finally {
                if (!cancelled) setIsLoadingCosts(false);
            }
        };

        loadCosts();
        return () => { cancelled = true; };
    }, [targetKey, reloadKey]);

    const hasMapping = pursuitEntities.length > 0 || !!unmappedPropertyCode;

    // Create a lookup for category names from the matrix
    const categoryLookup = useMemo(() => matrixData.reduce((acc, row) => {
        if (row.cost_code && row.category_name) {
            acc[row.cost_code] = row.category_name;
        }
        return acc;
    }, {} as Record<string, string>), [matrixData]);

    // Get unique categories for dropdown
    const availableCategories = useMemo(
        () => Array.from(new Set(jobCosts.map(tx => tx.cost_category_code))).sort(),
        [jobCosts]
    );

    // Apply mapping, filtering, and sorting (can be thousands of rows — only redo it when inputs change)
    const processedTx = useMemo(() => { const q = searchTerm.toLowerCase(); return jobCosts
        .map(tx => ({
            ...tx,
            category_name: categoryLookup[tx.cost_category_code] || tx.cost_category_code
        }))
        .filter(tx => {
            // Search filter (empty search matches everything, even rows with no text fields)
            const matchesSearch = !q ||
                tx.line_description?.toLowerCase().includes(q) ||
                tx.vendor_invoice_num?.toLowerCase().includes(q) ||
                tx.category_name?.toLowerCase().includes(q) ||
                tx.cost_category_code?.toLowerCase().includes(q);
            
            // Category filter
            const matchesCategory = selectedCategory ? tx.cost_category_code === selectedCategory : true;
            
            // Drill-down parameter filter
            let matchesDrillDown = true;
            if (filterCodes.length > 0) {
                matchesDrillDown = filterCodes.some(code => {
                    if (code.length <= 2) {
                        return tx.cost_category_code?.startsWith(code);
                    }
                    return tx.cost_category_code === code;
                });
            }
            
            // Date filter
            let matchesDate = true;
            // Compare date-only strings so the end date is inclusive and no timezone shift applies
            if (dateRange.start && tx.post_date) {
                matchesDate = matchesDate && datePart(tx.post_date) >= dateRange.start;
            }
            if (dateRange.end && tx.post_date) {
                matchesDate = matchesDate && datePart(tx.post_date) <= dateRange.end;
            }

            return matchesSearch && matchesCategory && matchesDrillDown && matchesDate;
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
        }); }, [jobCosts, categoryLookup, searchTerm, selectedCategory, filterCodes, dateRange, sortConfig]);

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
    const ariaSort = (columnKey: string): 'ascending' | 'descending' | 'none' =>
        sortConfig?.key !== columnKey ? 'none' : sortConfig.direction === 'asc' ? 'ascending' : 'descending';
    /** Sortable column header: a real button so it works from the keyboard. */
    const sortHeader = (columnKey: string, label: string, className = '', align: 'left' | 'right' = 'left') => (
        <th className={`text-${align} ${className} hover:bg-[var(--bg-elevated)]`} aria-sort={ariaSort(columnKey)}>
            <button onClick={() => handleSort(columnKey)}
                className={`w-full inline-flex items-center uppercase rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${align === 'right' ? 'justify-end' : ''}`}>
                {label} <SortIcon columnKey={columnKey} />
            </button>
        </th>
    );

    const { sortedMatrixRows, totalMatrixSpent } = useMemo(() => {
    // Base it on Matrix to include lines that are setup but have $0
    const matrixSummary = (matrixData || []).reduce((acc, row) => {
        const code = row.cost_code || 'Uncategorized';
        const name = row.category_name || code;
        
        if (!acc[code]) {
            acc[code] = {
                category_name: name,
                cost_codes: new Set<string>(),
                total_spent: 0
            };
        }
        
        acc[code].cost_codes.add(code);
        return acc;
    }, {} as Record<string, { category_name: string, cost_codes: Set<string>, total_spent: number }>);

    // Provide the actual truth sum from the detailed Job Costs
    jobCosts.forEach(tx => {
        const code = tx.cost_category_code || 'Uncategorized';
        // Use the matrix category name if available, otherwise fallback to the code
        const name = categoryLookup[code] || code;
        
        if (!matrixSummary[code]) {
            matrixSummary[code] = {
                category_name: name,
                cost_codes: new Set<string>(),
                total_spent: 0
            };
        }
        matrixSummary[code].cost_codes.add(code);
        matrixSummary[code].total_spent += Number(tx.amount || 0);
    });

    const sortedMatrixRows = Object.values(matrixSummary).sort((a, b) => {
        if (a.category_name === 'Uncategorized') return 1;
        if (b.category_name === 'Uncategorized') return -1;
        
        // Sort by the code numerically if possible
        const codeA = Array.from(a.cost_codes)[0] || '';
        const codeB = Array.from(b.cost_codes)[0] || '';
        if (codeA && codeB) {
            return codeA.localeCompare(codeB);
        }
        
        return a.category_name.localeCompare(b.category_name);
    });

    const totalMatrixSpent = sortedMatrixRows.reduce((sum, r) => sum + r.total_spent, 0);
    return { sortedMatrixRows, totalMatrixSpent };
    }, [matrixData, jobCosts, categoryLookup]);

    if (loadingEntities || isLoadingCosts) {
        return (
            <div className="flex flex-col justify-center items-center gap-2 py-24" role="status">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
                <span className="text-xs text-[var(--text-muted)]">{loadingEntities ? 'Loading accounting mapping…' : 'Loading Yardi costs…'}</span>
            </div>
        );
    }

    if (entitiesError) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <AlertCircle className="w-12 h-12 text-[var(--danger)] mb-3 opacity-50" />
                <p className="text-sm text-[var(--text-muted)] mb-3">Couldn&apos;t load this pursuit&apos;s accounting mapping.</p>
                <button onClick={() => refetchEntities()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
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
                <p className="text-sm text-[var(--text-muted)] mb-1">Couldn&apos;t load Yardi cost data</p>
                <p className="text-xs text-[var(--danger)] mb-3">{error}</p>
                <button onClick={() => setReloadKey(k => k + 1)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
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
                                    <th className="text-left w-64">Cost Category</th>
                                    <th className="text-left">Mapped Codes</th>
                                    <th className="text-right w-32">Total Spent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedMatrixRows.map((row) => {
                                    const codesArray = Array.from(row.cost_codes).sort();
                                    return (
                                        <tr key={codesArray.join(',')} className="hover:bg-[var(--bg-elevated)] focus-visible:bg-[var(--bg-elevated)] outline-none transition-colors text-sm cursor-pointer group"
                                            tabIndex={0}
                                            onClick={() => {
                                                router.push(costCodesHref(codesArray.join(',')));
                                            }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') router.push(costCodesHref(codesArray.join(','))); }}
                                            title={`Filter transactions down to groups: ${codesArray.join(', ')}`}
                                        >
                                            <td className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent)] transition-colors">
                                                {row.category_name !== codesArray[0] ? row.category_name : 'No Description Found'}
                                            </td>
                                            <td className="font-mono text-xs text-[var(--text-muted)] gap-1 flex flex-wrap pt-3.5">
                                                {codesArray.map(p => (
                                                    <span key={p} className="bg-[var(--bg-primary)] border border-[var(--border)] px-1.5 py-0.5 rounded leading-none">
                                                        {p}
                                                    </span>
                                                ))}
                                            </td>
                                            <td className="text-right font-mono font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                                                {formatCurrency(row.total_spent)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-[var(--bg-elevated)] border-t border-[var(--border)]">
                                <tr>
                                    <td colSpan={2} className="font-bold text-right text-xs uppercase tracking-wider text-[var(--text-secondary)] py-3">Total Displayed</td>
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
                        <div className="flex flex-wrap gap-2">
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="px-2 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)]"
                                title="Start Date"
                                aria-label="Posted on or after"
                            />
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="px-2 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)]"
                                title="End Date"
                                aria-label="Posted on or before"
                            />
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                aria-label="Cost category"
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
                        <div className="flex gap-2 w-full sm:w-auto">
                            {filterCodes.length > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--accent-subtle)] text-[var(--accent)] text-xs rounded-md font-medium whitespace-nowrap border border-[var(--accent)]/20 animate-fade-in shadow-sm"
                                    title={`Showing only cost codes: ${filterCodes.join(', ')}`}>
                                    <Filter className="w-3 h-3" />
                                    {filterCodes.length === 1 ? `Code ${filterCodes[0]}` : `${filterCodes.length} codes`}
                                    <button 
                                        onClick={() => router.push(costCodesHref(null))}  
                                        className="ml-1 p-0.5 hover:bg-[var(--accent)]/10 rounded-full transition-colors"
                                        title="Clear drill-down filter"
                                        aria-label="Clear drill-down filter"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                                <input 
                                    type="text" 
                                    placeholder="Search descriptions, vendors..."
                                    aria-label="Search transactions"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)] transition-colors"
                                />
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="overflow-x-auto min-h-[300px] max-h-[600px] overflow-y-auto block rounded-b-xl border border-[var(--border)]">
                    <table className="data-table w-full min-w-[760px]">
                        <thead className="sticky top-0 bg-[var(--bg-primary)] z-10 shadow-sm border-b border-[var(--border)]">
                            <tr>
                                {sortHeader('post_date', 'Date', 'w-24')}
                                {sortHeader('job_code', 'Job Code', 'w-32')}
                                {sortHeader('cost_category_code', 'Category', 'w-48')}
                                {sortHeader('line_description', 'Description')}
                                {sortHeader('vendor_invoice_num', 'Invoice #')}
                                {sortHeader('amount', 'Amount', 'w-36', 'right')}
                            </tr>
                        </thead>
                        <tbody>
                            {processedTx.map((tx, idx) => (
                                <tr key={`${tx.id}-${idx}`} className="hover:bg-[var(--bg-elevated)] transition-colors text-sm">
                                    <td className="text-[var(--text-secondary)] whitespace-nowrap">
                                        {tx.post_date ? formatPostDate(tx.post_date) : '—'}
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
                                        {jobCosts.length > 0 ? 'No job costs match your filters.' : 'No job cost transactions found for mapped job IDs.'}
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
