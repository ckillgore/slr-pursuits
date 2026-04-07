'use client';

import { useState, useEffect } from 'react';
import { fetchPursuitGLTotals, fetchPursuitJobCosts, fetchJobCostMatrix, fetchJobsForProperty, type YardiPursuitCostSummary, type YardiJobCostTransaction, type YardiJobCostMatrixRow } from '@/app/actions/accounting';
import { usePursuitAccountingEntities } from '@/hooks/useSupabaseQueries';
import { Loader2, DollarSign, Calendar, AlertCircle, Building2, Search, SlidersHorizontal, BarChart3, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/constants';
import { useRouter, useSearchParams } from 'next/navigation';

interface PursuitCostsTabProps {
    pursuitId?: string;
    unmappedPropertyCode?: string;
    unmappedName?: string;
}

// Standardized Logical Cost Category Mapping
const CATEGORY_MAPPING: Record<string, string> = {
    "01": "General Conditions", "02": "Site Work", "03": "Apartments", "04": "Leasing Office",
    "05": "Fitness Center", "06": "Garage", "07": "Pool Amenity", "08": "Auxiliary Amenity",
    "10": "Misc. Site Work", "11": "Permits & Bonds", "12": "Contingency", "13": "Project Specific",
    "14": "Retail", "15": "General Contractor Fee", "48": "Deposits", "49": "General Contractor Fee",
    "50": "Land Acquisition Costs", "51": "Acquisition Costs", "52": "Loan Costs", "53": "Joint Venture Costs",
    "54": "Legal Costs", "60": "Architectural & Engineering", "61": "Impact Fees", "62": "Architectural & Engineering",
    "63": "Other Development Costs", "64": "Other Dev Costs - Office", "70": "Development Interest",
    "71": "Taxes & Assessments", "73": "Overhead Allocation", "74": "Developer Fee", "78": "Lease-Up Expenses",
    "80": "Marketing / Lease-Up / FF&E", "86": "Retail", "89": "Deposits", "90": "Contingency", "99": "Total of All Accounts"
};

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
    
    // Explicit single-dropdown focus
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Hidden parameterized list-based cost code drilldown from external URLs
    const router = useRouter();
    const searchParams = useSearchParams();
    const costCodesQuery = searchParams.get('cost_codes');
    const [filterCodes, setFilterCodes] = useState<string[]>([]);
    
    useEffect(() => {
        if (costCodesQuery) {
            setFilterCodes(costCodesQuery.split(',').map(c => c.trim()).filter(Boolean));
        } else {
            setFilterCodes([]);
        }
    }, [costCodesQuery]);

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
                const jobIdsSet = new Set<string>();
                
                // 1. Add explicitly mapped job IDs
                targetEntities.filter(e => e.job_id).forEach(e => jobIdsSet.add(String(e.job_id)));
                
                // 2. Discover jobs for property codes that don't have explicit jobs mapped
                const entitiesNeedingJobs = targetEntities.filter(e => e.property_code && !e.job_id);
                for (const entity of entitiesNeedingJobs) {
                    if (entity.property_code) {
                        const discoveredJobs = await fetchJobsForProperty(entity.property_code);
                        discoveredJobs.forEach(id => jobIdsSet.add(id));
                    }
                }
                
                // If we are fully unmapped and only have the URL parameter, act as an entity needing jobs
                if (jobIdsSet.size === 0 && unmappedPropertyCode) {
                    const discoveredJobs = await fetchJobsForProperty(unmappedPropertyCode);
                    discoveredJobs.forEach(id => jobIdsSet.add(id));
                }

                const jobIds = Array.from(jobIdsSet);
                
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
            if (dateRange.start && tx.post_date) {
                matchesDate = matchesDate && new Date(tx.post_date) >= new Date(dateRange.start);
            }
            if (dateRange.end && tx.post_date) {
                matchesDate = matchesDate && new Date(tx.post_date) <= new Date(dateRange.end);
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

    // Base it on Matrix to include lines that are setup but have $0
    const matrixSummary = (matrixData || []).reduce((acc, row) => {
        const prefix = row.cost_code ? row.cost_code.substring(0, 2) : '99';
        const categoryName = CATEGORY_MAPPING[prefix] || 'Other Uncategorized Costs';
        
        if (!acc[categoryName]) {
            acc[categoryName] = {
                category_name: categoryName,
                prefixes: new Set<string>(),
                total_spent: 0
            };
        }
        
        acc[categoryName].prefixes.add(prefix);
        // Do NOT sum total_billed_this_draw because it misses orphaned non-draw transactions
        
        return acc;
    }, {} as Record<string, { category_name: string, prefixes: Set<string>, total_spent: number }>);

    // Provide the actual truth sum from the detailed Job Costs
    jobCosts.forEach(tx => {
        const prefix = tx.cost_category_code ? tx.cost_category_code.substring(0, 2) : '99';
        const categoryName = CATEGORY_MAPPING[prefix] || 'Other Uncategorized Costs';
        
        if (!matrixSummary[categoryName]) {
            matrixSummary[categoryName] = {
                category_name: categoryName,
                prefixes: new Set<string>(),
                total_spent: 0
            };
        }
        matrixSummary[categoryName].prefixes.add(prefix);
        matrixSummary[categoryName].total_spent += Number(tx.amount || 0);
    });

    const sortedMatrixRows = Object.values(matrixSummary).sort((a, b) => {
        if (a.category_name === 'Other Uncategorized Costs') return 1;
        if (b.category_name === 'Other Uncategorized Costs') return -1;
        return a.category_name.localeCompare(b.category_name);
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
                                    <th className="text-left w-64">Cost Category</th>
                                    <th className="text-left text-[var(--text-faint)]">Mapped Codes</th>
                                    <th className="text-right w-32">Total Spent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedMatrixRows.map((row) => {
                                    const prefixesArray = Array.from(row.prefixes).sort();
                                    return (
                                        <tr key={row.category_name} className="hover:bg-[var(--bg-elevated)] transition-colors text-sm cursor-pointer group"
                                            onClick={() => {
                                                router.push(`/pursuits/${pursuitId}?tab=costs&cost_codes=${encodeURIComponent(prefixesArray.join(','))}`);
                                            }}
                                            title={`Filter transactions down to groups: ${prefixesArray.join(', ')}`}
                                        >
                                            <td className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent)] transition-colors">
                                                {row.category_name}
                                            </td>
                                            <td className="font-mono text-xs text-[var(--text-muted)] gap-1 flex flex-wrap pt-3.5">
                                                {prefixesArray.map(p => (
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
                        <div className="flex gap-2 w-full sm:w-auto">
                            {filterCodes.length > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--accent-subtle)] text-[var(--accent)] text-xs rounded-md font-medium whitespace-nowrap border border-[var(--accent)]/20 animate-fade-in shadow-sm">
                                    <Filter className="w-3 h-3" />
                                    Filtered by Line Item
                                    <button 
                                        onClick={() => router.push(`/pursuits/${pursuitId}?tab=costs`)} 
                                        className="ml-1 p-0.5 hover:bg-[var(--accent)]/10 rounded-full transition-colors"
                                        title="Clear drill-down filter"
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
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)] transition-colors"
                                />
                            </div>
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
