'use client';

import { useState, useEffect } from 'react';
import { fetchAllPursuitGLTotals, type YardiPursuitCostSummary } from '@/app/actions/accounting';
import { usePursuitAccountingEntities, usePursuits } from '@/hooks/useSupabaseQueries';
import { Loader2, DollarSign, Landmark, AlertCircle, ExternalLink, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import Link from 'next/link';
import { EntityGLReport } from './EntityGLReport';

type CostTab = 'pursuitco' | 'slr-jv' | 'lamar-gp' | '1919-10th';

export function PursuitCostReport() {
    const { data: pursuits = [], isLoading: loadingPursuits } = usePursuits();
    const { data: entities = [], isLoading: loadingEntities } = usePursuitAccountingEntities();
    
    const [costData, setCostData] = useState<YardiPursuitCostSummary[]>([]);
    const [activeTab, setActiveTab] = useState<CostTab>('pursuitco');
    const [isLoadingCosts, setIsLoadingCosts] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadCosts = async () => {
            setIsLoadingCosts(true);
            setError(null);
            try {
                const data = await fetchAllPursuitGLTotals();
                setCostData(data);
            } catch (err: any) {
                console.error('Error fetching global pursuit costs:', err);
                setError(err.message || 'Failed to fetch global accounting data from Yardi');
            } finally {
                setIsLoadingCosts(false);
            }
        };
        
        loadCosts();
    }, []);

    const isLoading = loadingPursuits || loadingEntities || isLoadingCosts;

    // Filter to only show pursues (properties) that have > $100 in WIP to avoid cluttering, or show all mapped.
    // The requirement mentions 'filtered by Net WIP > $100'. Net WIP = Earnest + WIP + WIP Contra.
    
    let filteredCostData = costData;
    
    if (activeTab === 'pursuitco') {
        filteredCostData = costData.filter(c => c.property_code.startsWith('11') && Math.abs(c.net_cost) > 100);
    } else if (activeTab === 'slr-jv') {
        // SLR JV uses GL 12110000 on property 22300000, which is transaction-level. This is a placeholder.
        filteredCostData = costData.filter(c => c.property_code === '22300000');
    } else if (activeTab === 'lamar-gp') {
        filteredCostData = costData.filter(c => c.property_code === '53600000');
    } else if (activeTab === '1919-10th') {
        filteredCostData = costData.filter(c => c.property_code === '40203166');
    }

    const mappedRows = filteredCostData
        .map(cost => {
            const entity = entities.find(e => e.property_code === cost.property_code);
            const pursuit = pursuits.find(p => p.id === entity?.pursuit_id);
            return {
                ...cost,
                entity,
                pursuit,
                // If we are looking at a specific JV tab, the JV itself acts as the pursuit, so we don't label it "Unmapped"
                isJVSelfPursuit: activeTab !== 'pursuitco'
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

    if (costData.length === 0 && !isLoadingCosts) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <Landmark className="w-12 h-12 text-[var(--border-strong)] mb-3" />
                <p className="text-sm text-[var(--text-muted)] mb-1">No pursuit cost records found.</p>
                <p className="text-xs text-[var(--text-faint)]">There are no property codes starting with '11' with Net WIP &gt; $100.</p>
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
                <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-[var(--text-muted)]" />
                            Pursuit Costs
                        </h2>
                        {activeTab === 'pursuitco' && <span className="text-xs text-[var(--text-muted)]">Showing PursuitCo entities with net cost &gt; $100</span>}
                    </div>
                    
                    {/* Sub-Tabs */}
                    <div className="flex gap-1 border-b border-[var(--border)]">
                        {[
                            { id: 'pursuitco', label: 'PursuitCo (Consolidated)' },
                            { id: 'slr-jv', label: 'SLR JV, LLC (22300000)' },
                            { id: 'lamar-gp', label: 'SLR-SML Lamar GP, LLC (53600000)' },
                            { id: '1919-10th', label: '1919 10th Avenue NE (40203166)' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as CostTab)}
                                className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-primary)]'
                                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="overflow-auto flex-1 h-full block">
                    {activeTab === 'lamar-gp' ? (
                        <EntityGLReport propertyCode="53600000" propertyName="SLR-SML Lamar GP, LLC" />
                    ) : activeTab === '1919-10th' ? (
                        <EntityGLReport propertyCode="40203166" propertyName="1919 10th Avenue NE" />
                    ) : (
                        <table className="data-table w-full">
                            <thead className="sticky top-0 bg-[var(--bg-primary)] z-10 shadow-sm border-b border-[var(--border)]">
                            <tr>
                                <th className="text-left w-[20%]">Pursuit</th>
                                <th className="text-left">Property Code / Name</th>
                                <th className="text-right whitespace-nowrap">Earnest Money</th>
                                <th className="text-right whitespace-nowrap">Gross WIP</th>
                                <th className="text-right whitespace-nowrap">Contra WIP</th>
                                <th className="text-right whitespace-nowrap">Net Pursuit Cost</th>
                                <th className="text-right w-16 whitespace-nowrap">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mappedRows.map((row) => (
                                <tr key={row.property_code} className="hover:bg-[var(--bg-elevated)] transition-colors text-sm">
                                    <td className="text-[var(--text-primary)] font-medium max-w-[200px] truncate">
                                        {row.pursuit ? (
                                            <Link href={`/pursuits/${row.pursuit.id}`} className="hover:underline">
                                                {row.pursuit.name}
                                            </Link>
                                        ) : row.isJVSelfPursuit ? (
                                            <span className="font-semibold text-[var(--text-primary)]">
                                                {row.property_name}
                                            </span>
                                        ) : (
                                            <Link href={`/reports/accounting/${row.property_code}?name=${encodeURIComponent(row.property_name)}`} className="hover:underline text-[var(--text-faint)] italic font-normal">
                                                Unmapped ({row.property_name})
                                            </Link>
                                        )}
                                    </td>
                                    <td>
                                        <div className="flex flex-col justify-center">
                                            <span className="text-[10px] font-mono text-[var(--text-secondary)]">{row.property_code}</span>
                                            {!row.isJVSelfPursuit && <span className="text-sm text-[var(--text-muted)] truncate max-w-[200px]">{row.property_name}</span>}
                                        </div>
                                    </td>
                                    <td className="text-right font-mono text-sm text-[var(--text-primary)]">{formatCurrency(row.earnest_money)}</td>
                                    <td className="text-right font-mono text-sm text-[var(--text-primary)]">{formatCurrency(row.wip)}</td>
                                    <td className="text-right font-mono text-sm text-[var(--danger)]">{formatCurrency(row.wip_contra)}</td>
                                    <td className="text-right font-mono text-sm font-bold text-[var(--accent)]">{formatCurrency(row.net_cost)}</td>
                                    <td className="text-right">
                                        {row.pursuit ? (
                                            <Link href={`/pursuits/${row.pursuit.id}?tab=costs`} className="inline-flex items-center justify-center p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors" title="View Detail">
                                                <ExternalLink className="w-4 h-4" />
                                            </Link>
                                        ) : (
                                            <Link href={`/reports/accounting/${row.property_code}?name=${encodeURIComponent(row.property_name)}`} className="inline-flex items-center justify-center p-1.5 rounded-lg text-[var(--border-strong)] hover:bg-[var(--bg-elevated)] transition-colors" title="View Unmapped Detail">
                                                <ExternalLink className="w-4 h-4" />
                                            </Link>
                                        )}
                                    </td>
                                </tr>
                            ))}

                            {mappedRows.length === 0 && activeTab !== 'slr-jv' && (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-[var(--text-muted)] text-sm">
                                        No pursuits found for this entity.
                                    </td>
                                </tr>
                            )}
                            
                            {activeTab === 'slr-jv' && (
                                <tr>
                                    <td colSpan={7} className="text-center py-16">
                                        <div className="max-w-md mx-auto flex flex-col items-center">
                                            <Info className="w-10 h-10 text-[var(--accent)] mb-3 opacity-80" />
                                            <h4 className="text-[var(--text-primary)] font-semibold mb-2">Pending Yardi Transaction Sync</h4>
                                            <p className="text-sm text-[var(--text-muted)]">
                                                SLR JV costs are recorded on Partnership Investment GL (12110000) and separated by comment fields. 
                                                This detailed breakout will be available once the transaction detail sync is authorized in the database.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {mappedRows.length > 0 && (
                            <tfoot className="sticky bottom-0 bg-[var(--bg-elevated)] shadow-[0_-1px_3px_rgba(0,0,0,0.05)] border-t border-[var(--border)]">
                                <tr>
                                    <td colSpan={2} className="font-bold text-right text-xs uppercase tracking-wider text-[var(--text-secondary)] py-3">Totals</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)] text-sm">{formatCurrency(totalEarnest)}</td>
                                    <td className="text-right font-mono font-bold text-[var(--text-primary)] text-sm">{formatCurrency(totalWip)}</td>
                                    <td className="text-right font-mono font-bold text-[var(--danger)] text-sm">{formatCurrency(totalContra)}</td>
                                    <td className="text-right font-mono font-bold text-[var(--accent)] text-sm">{formatCurrency(totalNet)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                    )}
                </div>
            </div>
        </div>
    );
}
