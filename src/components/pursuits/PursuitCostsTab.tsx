'use client';

import { useState, useEffect } from 'react';
import { fetchPursuitGLTotals, fetchPursuitJobCosts, type YardiPursuitCostSummary, type YardiJobCostTransaction } from '@/app/actions/accounting';
import { usePursuitAccountingEntities } from '@/hooks/useSupabaseQueries';
import { Loader2, DollarSign, Calendar, AlertCircle, Building2, Search, SlidersHorizontal } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';

interface PursuitCostsTabProps {
    pursuitId: string;
}

export function PursuitCostsTab({ pursuitId }: PursuitCostsTabProps) {
    const { data: entities = [], isLoading: loadingEntities } = usePursuitAccountingEntities();
    
    const [glData, setGlData] = useState<YardiPursuitCostSummary | null>(null);
    const [jobCosts, setJobCosts] = useState<YardiJobCostTransaction[]>([]);
    
    const [isLoadingCosts, setIsLoadingCosts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const loadCosts = async () => {
            const pursuitEntities = entities.filter(e => e.pursuit_id === pursuitId);
            if (pursuitEntities.length === 0) return;
            
            setIsLoadingCosts(true);
            setError(null);
            try {
                // Fetch GL Totals
                const propertyCodes = pursuitEntities.map(e => e.property_code).filter(Boolean);
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
                
                // Fetch Job Costs
                const rawJobIds = pursuitEntities.map(e => e.job_id).filter(Boolean);
                const jobIds = rawJobIds.map(String);
                if (jobIds.length > 0) {
                    const txs = await fetchPursuitJobCosts(jobIds);
                    setJobCosts(txs);
                }
            } catch (err: any) {
                console.error('Error fetching pursuit details costs:', err);
                setError(err.message || 'Failed to fetch accounting data from Yardi');
            } finally {
                setIsLoadingCosts(false);
            }
        };
        
        loadCosts();
    }, [entities, pursuitId]);

    const pursuitEntities = entities.filter(e => e.pursuit_id === pursuitId);
    const hasMapping = pursuitEntities.length > 0;
    
    const filteredTx = jobCosts.filter(tx => 
        tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        tx.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.category_id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

            {/* Job Costs Detail */}
            <div className="card !p-0 overflow-hidden flex flex-col">
                <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-[var(--text-muted)]" />
                        Job Cost Transactions
                        <span className="text-[10px] bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-0.5 rounded-full ml-1">
                            {filteredTx.length}
                        </span>
                    </h3>
                    
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
                
                <div className="overflow-x-auto min-h-[300px] max-h-[600px] overflow-y-auto block rounded-b-xl border border-[var(--border)]">
                    <table className="data-table w-full">
                        <thead className="sticky top-0 bg-[var(--bg-primary)] z-10 shadow-sm border-b border-[var(--border)]">
                            <tr>
                                <th className="text-left w-24">Date</th>
                                <th className="text-left w-32">Job ID</th>
                                <th className="text-left w-32">Category</th>
                                <th className="text-left">Description</th>
                                <th className="text-left">Vendor</th>
                                <th className="text-right w-36">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTx.map((tx, idx) => (
                                <tr key={`${tx.id}-${idx}`} className="hover:bg-[var(--bg-elevated)] transition-colors text-sm">
                                    <td className="text-[var(--text-secondary)] whitespace-nowrap">
                                        {new Date(tx.transaction_date).toLocaleDateString()}
                                    </td>
                                    <td className="font-mono text-xs text-[var(--text-muted)]">{tx.job_id}</td>
                                    <td className="text-[var(--text-secondary)]">
                                        <span className="px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-xs">
                                            {tx.category_id}
                                        </span>
                                    </td>
                                    <td className="text-[var(--text-primary)]">{tx.description}</td>
                                    <td className="text-[var(--text-secondary)]">{tx.vendor_name || '—'}</td>
                                    <td className={`text-right font-mono font-medium ${tx.amount < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                                        {formatCurrency(tx.amount)}
                                    </td>
                                </tr>
                            ))}

                            {filteredTx.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-16 text-[var(--text-muted)]">
                                        {searchTerm ? 'No job costs match your search.' : 'No job cost transactions found for mapped job IDs.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {filteredTx.length > 0 && (
                            <tfoot className="sticky bottom-0 bg-[var(--bg-elevated)] shadow-[0_-1px_3px_rgba(0,0,0,0.05)] border-t border-[var(--border)]">
                                <tr>
                                    <td colSpan={5} className="font-bold text-right text-xs uppercase tracking-wider text-[var(--text-secondary)] py-3">Total Displayed</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)]">
                                        {formatCurrency(filteredTx.reduce((sum, tx) => sum + tx.amount, 0))}
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
