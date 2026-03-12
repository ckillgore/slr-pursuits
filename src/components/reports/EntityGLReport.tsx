import { useState, useEffect } from 'react';
import { fetchEntityGLTotals, type YardiDetailedGLSummary } from '@/app/actions/accounting';
import { Loader2, FileText, AlertCircle, Search } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';

interface EntityGLReportProps {
    propertyCode: string;
    propertyName: string;
}

export function EntityGLReport({ propertyCode, propertyName }: EntityGLReportProps) {
    const [glData, setGlData] = useState<YardiDetailedGLSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        
        async function loadGL() {
            try {
                setIsLoading(true);
                setError(null);
                const data = await fetchEntityGLTotals(propertyCode);
                if (isMounted) {
                    setGlData(data);
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message || 'Failed to load GL data');
                    console.error('Error loading Entity GL:', err);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }
        
        loadGL();
        
        return () => { isMounted = false; };
    }, [propertyCode]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-[var(--text-muted)] w-full h-full">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-[var(--accent)]" />
                <p>Loading General Ledger for {propertyName}...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-12 w-full h-full">
                <div className="bg-[var(--danger-subtle)] text-[var(--danger)] p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            </div>
        );
    }

    const totalBalance = glData.reduce((sum, row) => sum + row.total_amount, 0);

    return (
        <div className="flex flex-col h-full w-full">
            <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                    General Ledger Trial Balance
                </h3>
                <span className="text-xs font-mono text-[var(--text-muted)]">Property: {propertyCode}</span>
            </div>

            <div className="overflow-auto flex-1 h-full block">
                <table className="data-table w-full">
                    <thead className="sticky top-0 bg-[var(--bg-primary)] z-10 shadow-sm border-b border-[var(--border)]">
                        <tr>
                            <th className="text-left w-32">Account Code</th>
                            <th className="text-left">Account Name</th>
                            <th className="text-right w-48 whitespace-nowrap">Ending Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {glData.map((row) => (
                            <tr key={row.account_code} className="hover:bg-[var(--bg-elevated)] transition-colors text-sm group">
                                <td className="text-[var(--text-secondary)] font-mono">{row.account_code}</td>
                                <td className="text-[var(--text-primary)] font-medium">
                                    <div className="flex items-center justify-between">
                                        <span className="truncate max-w-[300px]">{row.account_name}</span>
                                        <button 
                                            className="text-xs flex items-center gap-1 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity cursor-not-allowed"
                                            title="Transaction drilldown will be available once gl_transaction_details is synced from Yardi"
                                            onClick={() => alert("Transaction details are not yet synced to the datamart for this JV.")}
                                        >
                                            <Search className="w-3 h-3" />
                                            <span>Details</span>
                                        </button>
                                    </div>
                                </td>
                                <td className={`text-right font-mono font-medium ${row.total_amount < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                                    {formatCurrency(row.total_amount)}
                                </td>
                            </tr>
                        ))}

                        {glData.length === 0 && (
                            <tr>
                                <td colSpan={3} className="text-center py-12 text-[var(--text-muted)] text-sm">
                                    No General Ledger activity found for this entity.
                                </td>
                            </tr>
                        )}
                    </tbody>
                    {glData.length > 0 && (
                        <tfoot className="sticky bottom-0 bg-[var(--bg-elevated)] shadow-[0_-1px_3px_rgba(0,0,0,0.05)] border-t border-[var(--border)]">
                            <tr>
                                <td colSpan={2} className="font-bold text-right text-xs uppercase tracking-wider text-[var(--text-secondary)] py-3">Net Balance</td>
                                <td className={`text-right font-mono font-bold text-sm ${totalBalance < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                                    {formatCurrency(totalBalance)}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}
