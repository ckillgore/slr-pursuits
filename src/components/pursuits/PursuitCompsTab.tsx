'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
    Search, Plus, X, Loader2, Trash2, MapPin, ExternalLink,
} from 'lucide-react';
import {
    useLandComps, useCreateLandComp,
    useSaleComps, useCreateSaleComp,
    usePursuitLandComps, useLinkLandCompToPursuit, useUnlinkLandCompFromPursuit,
    usePursuitSaleComps, useLinkSaleCompToPursuit, useUnlinkSaleCompFromPursuit,
} from '@/hooks/useSupabaseQueries';
import type { LandComp, SaleComp, SaleTransaction } from '@/types';

// ============================================================
// Helpers
// ============================================================
function fmtCur(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function fmtNum(v: number | null | undefined, dec = 0): string {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function fmtAcres(sf: number | null | undefined): string {
    if (!sf) return '—';
    return (sf / 43560).toFixed(2);
}

const SF_PER_ACRE = 43560;

// ============================================================
// Main Component
// ============================================================
interface PursuitCompsTabProps {
    pursuitId: string;
}

type SubTab = 'land' | 'sale';

export default function PursuitCompsTab({ pursuitId }: PursuitCompsTabProps) {
    const [activeTab, setActiveTab] = useState<SubTab>('land');

    return (
        <div className="space-y-4">
            {/* Sub-tab toggle */}
            <div className="flex items-center gap-1 border-b border-[var(--border)]">
                {([
                    { key: 'land' as SubTab, label: 'Land Comps' },
                    { key: 'sale' as SubTab, label: 'Sale Comps' },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-3 py-2 text-xs font-medium transition-colors relative whitespace-nowrap ${activeTab === tab.key
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                    >
                        {tab.label}
                        {activeTab === tab.key && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full" />
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'land' && <LandCompsSection pursuitId={pursuitId} />}
            {activeTab === 'sale' && <SaleCompsSection pursuitId={pursuitId} />}
        </div>
    );
}

// ============================================================
// Land Comps Section
// ============================================================
function LandCompsSection({ pursuitId }: { pursuitId: string }) {
    const { data: linkedComps = [], isLoading } = usePursuitLandComps(pursuitId);
    const { data: allComps = [] } = useLandComps();
    const linkMut = useLinkLandCompToPursuit();
    const unlinkMut = useUnlinkLandCompFromPursuit();
    const createMut = useCreateLandComp();

    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newCity, setNewCity] = useState('');
    const [newState, setNewState] = useState('');
    const [newSiteArea, setNewSiteArea] = useState('');
    const [newSalePrice, setNewSalePrice] = useState('');

    const linkedIds = useMemo(() => new Set(linkedComps.map((c: LandComp) => c.id)), [linkedComps]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return allComps
            .filter((c: LandComp) => !linkedIds.has(c.id))
            .filter((c: LandComp) =>
                c.name?.toLowerCase().includes(q) ||
                c.address?.toLowerCase().includes(q) ||
                c.city?.toLowerCase().includes(q)
            )
            .slice(0, 8);
    }, [allComps, linkedIds, searchQuery]);

    const handleLink = async (compId: string) => {
        await linkMut.mutateAsync({ pursuitId, landCompId: compId });
    };

    const handleUnlink = async (compId: string) => {
        await unlinkMut.mutateAsync({ pursuitId, landCompId: compId });
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        const comp = await createMut.mutateAsync({
            name: newName.trim(),
            address: newAddress.trim(),
            city: newCity.trim(),
            state: newState.trim(),
            county: '',
            zip: '',
            latitude: null,
            longitude: null,
            site_area_sf: newSiteArea ? parseFloat(newSiteArea) * SF_PER_ACRE : 0,
            sale_price: newSalePrice ? parseFloat(newSalePrice) : null,
            sale_price_psf: null,
            sale_date: null,
            buyer: null,
            seller: null,
            zoning: null,
            land_use: null,
            notes: null,
            parcel_data: null,
            parcel_data_updated_at: null,
        });
        await linkMut.mutateAsync({ pursuitId, landCompId: comp.id });
        setNewName(''); setNewAddress(''); setNewCity(''); setNewState('');
        setNewSiteArea(''); setNewSalePrice('');
        setShowCreate(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => { setShowSearch(!showSearch); setShowCreate(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Link Existing
                </button>
                <button
                    onClick={() => { setShowCreate(!showCreate); setShowSearch(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Create New
                </button>
                <span className="text-xs text-[var(--text-muted)] ml-auto">{linkedComps.length} linked</span>
            </div>

            {/* Search picker */}
            {showSearch && (
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--bg-primary)] space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search land comps by name, address, or city..."
                            className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            autoFocus
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            </button>
                        )}
                    </div>
                    {searchResults.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {searchResults.map((c: LandComp) => (
                                <button
                                    key={c.id}
                                    onClick={() => handleLink(c.id)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-left"
                                >
                                    <div>
                                        <div className="font-medium text-[var(--text-primary)]">{c.name}</div>
                                        <div className="text-[var(--text-muted)]">{c.address}{c.city ? `, ${c.city}` : ''}</div>
                                    </div>
                                    <Plus className="w-4 h-4 text-[var(--accent)] shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                    {searchQuery && searchResults.length === 0 && (
                        <p className="text-xs text-[var(--text-muted)] text-center py-2">No matching land comps found.</p>
                    )}
                </div>
            )}

            {/* Quick create form */}
            {showCreate && (
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--bg-primary)] space-y-3">
                    <h4 className="text-xs font-semibold text-[var(--text-primary)]">Quick Create Land Comp</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className="col-span-2 sm:col-span-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Address" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="City" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newState} onChange={e => setNewState(e.target.value)} placeholder="State" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newSiteArea} onChange={e => setNewSiteArea(e.target.value)} placeholder="Site Area (acres)" type="number" step="0.01" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newSalePrice} onChange={e => setNewSalePrice(e.target.value)} placeholder="Sale Price ($)" type="number" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleCreate} disabled={!newName.trim() || createMut.isPending}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                            {createMut.isPending ? 'Creating...' : 'Create & Link'}
                        </button>
                        <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Cancel</button>
                    </div>
                </div>
            )}

            {/* Table */}
            {linkedComps.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-primary)]">
                    <MapPin className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-[var(--text-muted)]">No land comps linked to this pursuit yet.</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Use the buttons above to link or create land comps.</p>
                </div>
            ) : (
                <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="bg-[var(--accent)] text-white">
                                <th className="py-1.5 px-2 text-left font-semibold">Name</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Address</th>
                                <th className="py-1.5 px-2 text-right font-semibold">Acres</th>
                                <th className="py-1.5 px-2 text-right font-semibold">Sale Price</th>
                                <th className="py-1.5 px-2 text-right font-semibold">$/SF</th>
                                <th className="py-1.5 px-2 text-center font-semibold">Sale Date</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Buyer</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Zoning</th>
                                <th className="py-1.5 px-2 text-center font-semibold w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {linkedComps.map((c: LandComp, i: number) => (
                                <tr key={c.id} className="border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)]">
                                    <td className="py-1.5 px-2 font-medium text-[var(--accent)]">
                                        <Link href={`/comps/${c.short_id || c.id}`} className="hover:underline">{c.name}</Link>
                                    </td>
                                    <td className="py-1.5 px-2 text-[var(--text-secondary)] truncate max-w-[160px]">{c.address}{c.city ? `, ${c.city}` : ''}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-primary)]">{fmtAcres(c.site_area_sf)}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums font-medium text-[var(--text-primary)]">{fmtCur(c.sale_price)}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(c.sale_price_psf, 2)}</td>
                                    <td className="py-1.5 px-2 text-center text-[var(--text-secondary)]">{fmtDate(c.sale_date)}</td>
                                    <td className="py-1.5 px-2 text-[var(--text-secondary)]">{c.buyer || '—'}</td>
                                    <td className="py-1.5 px-2 text-[var(--text-secondary)]">{c.zoning || '—'}</td>
                                    <td className="py-1.5 px-1 text-center">
                                        <button onClick={() => handleUnlink(c.id)} title="Unlink" className="text-[var(--text-muted)] hover:text-red-500 transition-colors p-0.5">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {linkedComps.length > 1 && (() => {
                                const totalAcres = linkedComps.reduce((s: number, c: LandComp) => s + (c.site_area_sf || 0), 0) / SF_PER_ACRE;
                                const priced = linkedComps.filter((c: LandComp) => c.sale_price && c.sale_price > 0);
                                const avgPrice = priced.length > 0 ? priced.reduce((s: number, c: LandComp) => s + (c.sale_price ?? 0), 0) / priced.length : null;
                                const psfComps = linkedComps.filter((c: LandComp) => c.sale_price_psf && c.sale_price_psf > 0);
                                const avgPsf = psfComps.length > 0 ? psfComps.reduce((s: number, c: LandComp) => s + (c.sale_price_psf ?? 0), 0) / psfComps.length : null;
                                return (
                                    <tr className="bg-[var(--bg-elevated)] font-semibold border-t border-[var(--border)]">
                                        <td className="py-1.5 px-2 text-[var(--text-primary)]">Total / Avg</td>
                                        <td className="py-1.5 px-2 text-[var(--text-muted)] text-[10px]">{linkedComps.length} comps</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-primary)]">{totalAcres > 0 ? totalAcres.toFixed(2) : '—'}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-primary)]">{fmtCur(avgPrice)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(avgPsf, 2)}</td>
                                        <td className="py-1.5 px-2"></td>
                                        <td className="py-1.5 px-2"></td>
                                        <td className="py-1.5 px-2"></td>
                                        <td className="py-1.5 px-2"></td>
                                    </tr>
                                );
                            })()}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ============================================================
// Sale Comps Section
// ============================================================
function SaleCompsSection({ pursuitId }: { pursuitId: string }) {
    const { data: linkedComps = [], isLoading } = usePursuitSaleComps(pursuitId);
    const { data: allComps = [] } = useSaleComps();
    const linkMut = useLinkSaleCompToPursuit();
    const unlinkMut = useUnlinkSaleCompFromPursuit();
    const createMut = useCreateSaleComp();

    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newCity, setNewCity] = useState('');
    const [newState, setNewState] = useState('');
    const [newUnits, setNewUnits] = useState('');
    const [newYearBuilt, setNewYearBuilt] = useState('');

    const linkedIds = useMemo(() => new Set(linkedComps.map((c: SaleComp) => c.id)), [linkedComps]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return allComps
            .filter((c: SaleComp) => !linkedIds.has(c.id))
            .filter((c: SaleComp) =>
                c.name?.toLowerCase().includes(q) ||
                c.address?.toLowerCase().includes(q) ||
                c.city?.toLowerCase().includes(q)
            )
            .slice(0, 8);
    }, [allComps, linkedIds, searchQuery]);

    const handleLink = async (compId: string) => {
        await linkMut.mutateAsync({ pursuitId, saleCompId: compId });
    };

    const handleUnlink = async (compId: string) => {
        await unlinkMut.mutateAsync({ pursuitId, saleCompId: compId });
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        const comp = await createMut.mutateAsync({
            name: newName.trim(),
            address: newAddress.trim(),
            city: newCity.trim(),
            state: newState.trim(),
            county: '',
            zip: '',
            latitude: null,
            longitude: null,
            property_type: null,
            year_built: newYearBuilt ? parseInt(newYearBuilt) : null,
            total_units: newUnits ? parseInt(newUnits) : null,
            total_sf: null,
            lot_size_sf: 0,
            notes: null,
            parcel_data: null,
            parcel_data_updated_at: null,
        });
        await linkMut.mutateAsync({ pursuitId, saleCompId: comp.id });
        setNewName(''); setNewAddress(''); setNewCity(''); setNewState('');
        setNewUnits(''); setNewYearBuilt('');
        setShowCreate(false);
    };

    // Get most recent transaction for each sale comp
    const getLatestTx = (comp: SaleComp): SaleTransaction | null => {
        const txs = comp.sale_transactions ?? [];
        if (txs.length === 0) return null;
        return txs.sort((a, b) => (b.sale_date ?? '').localeCompare(a.sale_date ?? ''))[0];
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => { setShowSearch(!showSearch); setShowCreate(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Link Existing
                </button>
                <button
                    onClick={() => { setShowCreate(!showCreate); setShowSearch(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Create New
                </button>
                <span className="text-xs text-[var(--text-muted)] ml-auto">{linkedComps.length} linked</span>
            </div>

            {/* Search picker */}
            {showSearch && (
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--bg-primary)] space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search sale comps by name, address, or city..."
                            className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            autoFocus
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            </button>
                        )}
                    </div>
                    {searchResults.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {searchResults.map((c: SaleComp) => {
                                const tx = getLatestTx(c);
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => handleLink(c.id)}
                                        className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-left"
                                    >
                                        <div>
                                            <div className="font-medium text-[var(--text-primary)]">{c.name}</div>
                                            <div className="text-[var(--text-muted)]">
                                                {c.address}{c.city ? `, ${c.city}` : ''}
                                                {tx?.sale_price ? ` · ${fmtCur(tx.sale_price)}` : ''}
                                            </div>
                                        </div>
                                        <Plus className="w-4 h-4 text-[var(--accent)] shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {searchQuery && searchResults.length === 0 && (
                        <p className="text-xs text-[var(--text-muted)] text-center py-2">No matching sale comps found.</p>
                    )}
                </div>
            )}

            {/* Quick create form */}
            {showCreate && (
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--bg-primary)] space-y-3">
                    <h4 className="text-xs font-semibold text-[var(--text-primary)]">Quick Create Sale Comp</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className="col-span-2 sm:col-span-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Address" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="City" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newState} onChange={e => setNewState(e.target.value)} placeholder="State" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newUnits} onChange={e => setNewUnits(e.target.value)} placeholder="Total Units" type="number" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newYearBuilt} onChange={e => setNewYearBuilt(e.target.value)} placeholder="Year Built" type="number" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleCreate} disabled={!newName.trim() || createMut.isPending}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                            {createMut.isPending ? 'Creating...' : 'Create & Link'}
                        </button>
                        <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Cancel</button>
                    </div>
                </div>
            )}

            {/* Table */}
            {linkedComps.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-primary)]">
                    <MapPin className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-[var(--text-muted)]">No sale comps linked to this pursuit yet.</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Use the buttons above to link or create sale comps.</p>
                </div>
            ) : (
                <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="bg-[var(--accent)] text-white">
                                <th className="py-1.5 px-2 text-left font-semibold">Name</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Address</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Type</th>
                                <th className="py-1.5 px-2 text-center font-semibold">Built</th>
                                <th className="py-1.5 px-2 text-right font-semibold">Units</th>
                                <th className="py-1.5 px-2 text-right font-semibold">SF</th>
                                <th className="py-1.5 px-2 text-center font-semibold">Sale Date</th>
                                <th className="py-1.5 px-2 text-right font-semibold">Sale Price</th>
                                <th className="py-1.5 px-2 text-right font-semibold">$/Unit</th>
                                <th className="py-1.5 px-2 text-right font-semibold">Cap</th>
                                <th className="py-1.5 px-2 text-center font-semibold w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {linkedComps.map((c: SaleComp, i: number) => {
                                const tx = getLatestTx(c);
                                return (
                                    <tr key={c.id} className="border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)]">
                                        <td className="py-1.5 px-2 font-medium text-[var(--accent)]">
                                            <Link href={`/comps/sales/${c.short_id || c.id}`} className="hover:underline">{c.name}</Link>
                                        </td>
                                        <td className="py-1.5 px-2 text-[var(--text-secondary)] truncate max-w-[140px]">{c.address}{c.city ? `, ${c.city}` : ''}</td>
                                        <td className="py-1.5 px-2 text-[var(--text-secondary)]">{c.property_type || '—'}</td>
                                        <td className="py-1.5 px-2 text-center text-[var(--text-secondary)]">{c.year_built ?? '—'}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-primary)]">{fmtNum(c.total_units)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtNum(c.total_sf)}</td>
                                        <td className="py-1.5 px-2 text-center text-[var(--text-secondary)]">{fmtDate(tx?.sale_date)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-medium text-[var(--text-primary)]">{fmtCur(tx?.sale_price)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(tx?.price_per_unit)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{tx?.cap_rate ? `${tx.cap_rate.toFixed(2)}%` : '—'}</td>
                                        <td className="py-1.5 px-1 text-center">
                                            <button onClick={() => handleUnlink(c.id)} title="Unlink" className="text-[var(--text-muted)] hover:text-red-500 transition-colors p-0.5">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {linkedComps.length > 1 && (() => {
                                const totalUnits = linkedComps.reduce((s: number, c: SaleComp) => s + (c.total_units ?? 0), 0);
                                const totalSf = linkedComps.reduce((s: number, c: SaleComp) => s + (c.total_sf ?? 0), 0);
                                const txData = linkedComps.map((c: SaleComp) => getLatestTx(c)).filter(Boolean) as SaleTransaction[];
                                const pricedTx = txData.filter(t => t.sale_price && t.sale_price > 0);
                                const avgPrice = pricedTx.length > 0 ? pricedTx.reduce((s, t) => s + (t.sale_price ?? 0), 0) / pricedTx.length : null;
                                const ppuTx = txData.filter(t => t.price_per_unit && t.price_per_unit > 0);
                                const avgPpu = ppuTx.length > 0 ? ppuTx.reduce((s, t) => s + (t.price_per_unit ?? 0), 0) / ppuTx.length : null;
                                const capTx = txData.filter(t => t.cap_rate && t.cap_rate > 0);
                                const avgCap = capTx.length > 0 ? capTx.reduce((s, t) => s + (t.cap_rate ?? 0), 0) / capTx.length : null;
                                const builtComps = linkedComps.filter((c: SaleComp) => c.year_built && c.year_built > 0);
                                const avgYearBuilt = builtComps.length > 0 ? Math.round(builtComps.reduce((s: number, c: SaleComp) => s + (c.year_built ?? 0), 0) / builtComps.length) : null;
                                return (
                                    <tr className="bg-[var(--bg-elevated)] font-semibold border-t border-[var(--border)]">
                                        <td className="py-1.5 px-2 text-[var(--text-primary)]">Total / Avg</td>
                                        <td className="py-1.5 px-2 text-[var(--text-muted)] text-[10px]">{linkedComps.length} comps</td>
                                        <td className="py-1.5 px-2"></td>
                                        <td className="py-1.5 px-2 text-center tabular-nums text-[var(--text-secondary)]">{avgYearBuilt ?? '—'}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-primary)]">{fmtNum(totalUnits)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtNum(totalSf)}</td>
                                        <td className="py-1.5 px-2"></td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-primary)]">{fmtCur(avgPrice)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtCur(avgPpu)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">{avgCap ? `${avgCap.toFixed(2)}%` : '—'}</td>
                                        <td className="py-1.5 px-2"></td>
                                    </tr>
                                );
                            })()}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
