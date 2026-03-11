'use client';

import { useState, useEffect } from 'react';
import { fetchPursuitGLTotals, type YardiPursuitCostSummary } from '@/app/actions/accounting';
import { usePursuitAccountingEntities, usePursuits } from '@/hooks/useSupabaseQueries';
import { Loader2, DollarSign, Calendar, Landmark, AlertCircle, ExternalLink } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import Link from 'next/link';

export function PursuitCostReport() {
    const { data: pursuits = [], isLoading: loadingPursuits } = usePursuits();
    const { data: entities = [], isLoading: loadingEntities } = usePursuitAccountingEntities();
    
    const [costData, setCostData] = useState<YardiPursuitCostSummary[]>([]);
    const [isLoadingCosts, setIsLoadingCosts] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadCosts = async () => {
            if (entities.length === 0) return;
            
            setIsLoadingCosts(true);
            setError(null);
            try {
                // Fetch the list of mapped property codes
                const propertyCodes = entities.map(e => e.property_code).filter(Boolean);
                
                if (propertyCodes.length > 0) {
                    const data = await fetchPursuitGLTotals(propertyCodes);
                    setCostData(data);
                }
            } catch (err: any) {
                console.error('Error fetching pursuit costs:', err);
                setError(err.message || 'Failed to fetch accounting data from Yardi');
            } finally {
                setIsLoadingCosts(false);
            }
        };
        
        loadCosts();
    }, [entities]);

    const isLoading = loadingPursuits || loadingEntities || isLoadingCosts;

    // Filter to only show pursues (properties) that have > $100 in WIP to avoid cluttering, or show all mapped.
    // The requirement mentions 'filtered by Net WIP > $100'. Net WIP = Earnest + WIP + WIP Contra.
    // Wait, requirement is: "filtered by Net WIP > $100".
    
    const mappedRows = costData
        .filter(c => Math.abs(c.net_cost) > 100)
        .map(cost => {
            const entity = entities.find(e => e.property_code === cost.property_code);
            const pursuit = pursuits.find(p => p.id === entity?.pursuit_id);
            return {
                ...cost,
                entity,
                pursuit
            };
        })
        .sort((a, b) => b.net_cost - a.net_cost);

    const totalEarnest = mappedRows.reduce((sum, row) => sum + row.earnest_money, 0);
    const totalWip = mappedRows.reduce((sum, row) => sum + row.wip, 0);
    const totalContra = mappedRows.reduce((sum, row) => sum + row.wip_contra, 0);
    const totalNet = mappedRows.reduce((sum, row) => sum + row.net_cost, 0);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" />
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

    if (costData.length === 0 && entities.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <Landmark className="w-12 h-12 text-[var(--border-strong)] mb-3" />
                <p className="text-sm text-[var(--text-muted)] mb-1">No accounting properties mapped.</p>
                <p className="text-xs text-[var(--text-faint)]">Link properties in Admin Settings to begin tracking costs.</p>
                <Link href="/admin/accounting" className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors">
                    Go to Accounting Admin
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden animate-fade-in">
            {/* Header Totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="card !p-4 border-l-4 border-l-[#8B5CF6]">
                    <div className="text-[10px] uppercase font-bold text-[var(--text-faint)] tracking-wider mb-1">Total Earnest Money</div>
                    <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(totalEarnest)}</div>
                </div>
                <div className="card !p-4 border-l-4 border-l-[#F59E0B]">
                    <div className="text-[10px] uppercase font-bold text-[var(--text-faint)] tracking-wider mb-1">Total Gross WIP</div>
                    <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(totalWip)}</div>
                </div>
                <div className="card !p-4 border-l-4 border-l-[var(--danger)]">
                    <div className="text-[10px] uppercase font-bold text-[var(--text-faint)] tracking-wider mb-1">Total Contra WIP</div>
                    <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(totalContra)}</div>
                </div>
                <div className="card !p-4 border-l-4 border-l-[var(--accent)]">
                    <div className="text-[10px] uppercase font-bold text-[var(--text-faint)] tracking-wider mb-1">Total Net WIP</div>
                    <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(totalNet)}</div>
                </div>
            </div>

            {/* Config & List */}
            <div className="card overflow-hidden flex-1 flex flex-col">
                <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[var(--text-muted)]" />
                        Pursuit Costs
                    </h2>
                    <span className="text-xs text-[var(--text-muted)]">Showing active pursuits with net cost &gt; $100</span>
                </div>
                
                <div className="overflow-auto flex-1 h-full block">
                    <table className="data-table w-full">
                        <thead className="sticky top-0 bg-[var(--bg-primary)] z-10 shadow-sm">
                            <tr>
                                <th className="text-left w-[20%]">Pursuit</th>
                                <th className="text-left">Property Code / Name</th>
                                <th className="text-right whitespace-nowrap">Earnest Money<br/><span className="text-[9px] text-[var(--text-faint)] font-mono">11720000</span></th>
                                <th className="text-right whitespace-nowrap">Gross WIP<br/><span className="text-[9px] text-[var(--text-faint)] font-mono">11410000</span></th>
                                <th className="text-right whitespace-nowrap">Contra WIP<br/><span className="text-[9px] text-[var(--text-faint)] font-mono">11415000</span></th>
                                <th className="text-right whitespace-nowrap">Net Pursuit Cost</th>
                                <th className="text-right w-16 whitespace-nowrap">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mappedRows.map((row) => (
                                <tr key={row.property_code} className="hover:bg-[var(--bg-elevated)] transition-colors">
                                    <td className="font-medium text-[var(--text-primary)] max-w-[200px] truncate">
                                        {row.pursuit ? (
                                            <Link href={`/pursuits/${row.pursuit.id}`} className="hover:underline">
                                                {row.pursuit.name}
                                            </Link>
                                        ) : (
                                            <span className="text-[var(--text-faint)] italic">Unmapped</span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="flex flex-col justify-center">
                                            <span className="text-xs font-mono text-[var(--text-secondary)]">{row.property_code}</span>
                                            <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">{row.property_name}</span>
                                        </div>
                                    </td>
                                    <td className="text-right font-mono text-sm">{formatCurrency(row.earnest_money)}</td>
                                    <td className="text-right font-mono text-sm">{formatCurrency(row.wip)}</td>
                                    <td className="text-right font-mono text-sm">{formatCurrency(row.wip_contra)}</td>
                                    <td className="text-right font-mono text-sm font-semibold">{formatCurrency(row.net_cost)}</td>
                                    <td className="text-right">
                                        {row.pursuit && (
                                            <Link href={`/pursuits/${row.pursuit.id}?tab=costs`} className="inline-flex items-center justify-center p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors" title="View Detail">
                                                <ExternalLink className="w-4 h-4" />
                                            </Link>
                                        )}
                                    </td>
                                </tr>
                            ))}

                            {mappedRows.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-[var(--text-muted)] text-sm">
                                        No pursuits found with net costs &gt; $100.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {mappedRows.length > 0 && (
                            <tfoot className="sticky bottom-0 bg-[var(--bg-elevated)] shadow-[0_-1px_3px_rgba(0,0,0,0.05)] border-t border-[var(--border)]">
                                <tr>
                                    <td colSpan={2} className="font-bold text-right text-xs uppercase tracking-wider text-[var(--text-secondary)] py-3">Totals</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)]">{formatCurrency(totalEarnest)}</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)]">{formatCurrency(totalWip)}</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)]">{formatCurrency(totalContra)}</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)]">{formatCurrency(totalNet)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
