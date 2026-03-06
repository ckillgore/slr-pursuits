'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { usePursuits, useLinkLandCompToPursuit, useLinkSaleCompToPursuit } from '@/hooks/useSupabaseQueries';
import { Search, Plus, Check, FolderPlus, X } from 'lucide-react';

interface AddToPursuitButtonProps {
    compId: string;
    compType: 'land' | 'sale';
    /** Optional: list of pursuit IDs this comp is already linked to */
    linkedPursuitIds?: string[];
}

export function AddToPursuitButton({ compId, compType, linkedPursuitIds = [] }: AddToPursuitButtonProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
    const ref = useRef<HTMLDivElement>(null);

    const { data: pursuits = [] } = usePursuits();
    const linkLand = useLinkLandCompToPursuit();
    const linkSale = useLinkSaleCompToPursuit();

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const filtered = useMemo(() => {
        if (!search.trim()) return pursuits.slice(0, 10);
        const q = search.toLowerCase();
        return pursuits
            .filter((p) => p.name.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q))
            .slice(0, 10);
    }, [pursuits, search]);

    const handleLink = (pursuitId: string) => {
        if (compType === 'land') {
            linkLand.mutate({ pursuitId, landCompId: compId });
        } else {
            linkSale.mutate({ pursuitId, saleCompId: compId });
        }
        setRecentlyAdded((prev) => new Set(prev).add(pursuitId));
    };

    const isLinked = (pursuitId: string) =>
        linkedPursuitIds.includes(pursuitId) || recentlyAdded.has(pursuitId);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
                <FolderPlus className="w-3.5 h-3.5" />
                Add to Pursuit
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                    {/* Search header */}
                    <div className="p-2 border-b border-[var(--border)]">
                        <div className="relative flex items-center">
                            <Search className="absolute left-2.5 w-3.5 h-3.5 text-[var(--text-faint)] pointer-events-none" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search pursuits..."
                                className="w-full pl-8 pr-8 py-2 rounded-lg border border-[var(--border)] text-sm focus:border-[var(--accent)] focus:outline-none bg-[var(--bg-primary)]"
                                autoFocus
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2.5 text-[var(--text-faint)] hover:text-[var(--text-secondary)]">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Results */}
                    <div className="max-h-64 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="text-center py-6 text-xs text-[var(--text-muted)]">
                                No pursuits found
                            </div>
                        ) : (
                            filtered.map((pursuit) => {
                                const linked = isLinked(pursuit.id);
                                return (
                                    <div
                                        key={pursuit.id}
                                        className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--table-row-border)] last:border-b-0"
                                    >
                                        <div className="flex-1 min-w-0 mr-2">
                                            <div className="text-sm font-medium text-[var(--text-primary)] truncate">{pursuit.name}</div>
                                            <div className="text-[10px] text-[var(--text-muted)] truncate">
                                                {[pursuit.address, pursuit.city, pursuit.state].filter(Boolean).join(', ') || 'No address'}
                                            </div>
                                        </div>
                                        {linked ? (
                                            <span className="flex items-center gap-1 text-[10px] text-[var(--success)] font-medium px-2 py-1 bg-green-50 rounded-full flex-shrink-0">
                                                <Check className="w-3 h-3" /> Linked
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => handleLink(pursuit.id)}
                                                className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:text-white hover:bg-[var(--accent)] font-medium px-2 py-1 border border-[var(--accent)]/30 rounded-full transition-colors flex-shrink-0"
                                            >
                                                <Plus className="w-3 h-3" /> Add
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
