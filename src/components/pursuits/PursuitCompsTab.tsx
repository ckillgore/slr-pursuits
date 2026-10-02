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
import { toast } from '@/lib/toast';
import { landPricePerSf, salePricePerUnit } from './compDerived';

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
    // Date-only strings ("2024-03-01") parse as UTC midnight and would render as the previous month in US timezones
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
/** Land $/SF: use stored value, else derive from price / site area */
function landPsf(c: LandComp): number | null {
    return landPricePerSf(c).value;
}
function parseNum(v: string): number | null {
    const n = parseFloat(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
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
        try {
            await linkMut.mutateAsync({ pursuitId, landCompId: compId });
        } catch (err) {
            console.error('Failed to link land comp:', err);
            toast.error('Failed to link land comp', err);
        }
    };

    const handleUnlink = async (compId: string) => {
        if (!window.confirm('Unlink this land comp from the pursuit?')) return;
        try {
            await unlinkMut.mutateAsync({ pursuitId, landCompId: compId });
        } catch (err) {
            console.error('Failed to unlink land comp:', err);
            toast.error('Failed to unlink land comp', err);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        const acres = parseNum(newSiteArea);
        const siteAreaSf = acres !== null && acres > 0 ? acres * SF_PER_ACRE : 0;
        const salePrice = parseNum(newSalePrice);
        let comp;
        try {
            comp = await createMut.mutateAsync({
                name: newName.trim(),
                address: newAddress.trim(),
                city: newCity.trim(),
                state: newState.trim(),
                county: '',
                zip: '',
                latitude: null,
                longitude: null,
                site_area_sf: siteAreaSf,
                sale_price: salePrice,
                sale_price_psf: salePrice !== null && siteAreaSf > 0 ? salePrice / siteAreaSf : null,
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
        } catch (err) {
            console.error('Failed to create/link land comp:', err);
            toast.error(comp ? 'Land comp was created but could not be linked to this pursuit' : 'Failed to create land comp', err);
            return;
        }
        toast.success(`Created and linked ${comp.name}`);
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
                            className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            autoFocus
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2">
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
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className="col-span-2 sm:col-span-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Address" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="City" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newState} onChange={e => setNewState(e.target.value)} placeholder="State" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newSiteArea} onChange={e => setNewSiteArea(e.target.value)} placeholder="Site Area (acres)" type="number" step="0.01" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newSalePrice} onChange={e => setNewSalePrice(e.target.value)} placeholder="Sale Price ($)" type="number" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
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
                <div className="border border-[var(--border)] rounded-xl overflow-x-auto bg-[var(--bg-primary)] md:bg-transparent p-2 md:p-0">
                    <table className="w-full text-op min-w-full md:min-w-max block md:table">
                        <thead className="hidden md:table-header-group">
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
                        <tbody className="block md:table-row-group">
                            {linkedComps.map((c: LandComp, i: number) => (
                                <tr key={c.id} className="block md:table-row bg-[var(--bg-card)] md:bg-transparent border border-[var(--border)] md:border-b md:border-x-0 md:border-t-0 last:border-b-0 hover:bg-[var(--bg-primary)] mb-3 md:mb-0 rounded-lg md:rounded-none overflow-hidden hover:shadow-sm md:hover:shadow-none">
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 font-medium text-[var(--accent)] border-b border-[var(--border)] md:border-0 bg-[var(--bg-elevated)] md:bg-transparent">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Name</span>
                                        <Link href={`/comps/${c.short_id || c.id}`} className="hover:underline">{c.name}</Link>
                                    </td>
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Address</span>
                                        <span className="truncate max-w-[160px]">{c.address}{c.city ? `, ${c.city}` : ''}</span>
                                    </td>
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Acres</span>
                                        <span>{fmtAcres(c.site_area_sf)}</span>
                                    </td>
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums font-medium text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Sale Price</span>
                                        <span>{fmtCur(c.sale_price)}</span>
                                    </td>
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">$/SF</span>
                                        {(() => {
                                            const psf = landPricePerSf(c);
                                            return <span title={psf.derived ? 'Calculated: sale price ÷ site area' : undefined}>{fmtCur(psf.value, 2)}{psf.derived ? '*' : ''}</span>;
                                        })()}
                                    </td>
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-center text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Sale Date</span>
                                        <span>{fmtDate(c.sale_date)}</span>
                                    </td>
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Buyer</span>
                                        <span>{c.buyer || '—'}</span>
                                    </td>
                                    <td className="flex justify-between items-center md:table-cell py-1.5 px-2 text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                        <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Zoning</span>
                                        <span>{c.zoning || '—'}</span>
                                    </td>
                                    <td className="py-1.5 px-2 text-right md:text-center block md:table-cell">
                                        <button onClick={() => handleUnlink(c.id)} title="Unlink" aria-label={`Unlink ${c.name}`} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors inline-block md:block md:mx-auto">
                                            <span className="md:hidden mr-1 text-xs">Unlink</span>
                                            <X className="w-3.5 h-3.5 inline-block md:block" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {linkedComps.length > 1 && (() => {
                                const totalAcres = linkedComps.reduce((s: number, c: LandComp) => s + (c.site_area_sf || 0), 0) / SF_PER_ACRE;
                                const priced = linkedComps.filter((c: LandComp) => c.sale_price && c.sale_price > 0);
                                const avgPrice = priced.length > 0 ? priced.reduce((s: number, c: LandComp) => s + (c.sale_price ?? 0), 0) / priced.length : null;
                                const psfVals = linkedComps.map((c: LandComp) => landPsf(c)).filter((v: number | null): v is number => v !== null);
                                const avgPsf = psfVals.length > 0 ? psfVals.reduce((s: number, v: number) => s + v, 0) / psfVals.length : null;
                                return (
                                    <tr className="block md:table-row bg-[var(--bg-elevated)] font-semibold border-t border-[var(--border)] mt-4 md:mt-0 rounded-lg md:rounded-none">
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span>Total / Avg</span>
                                            <span className="md:hidden text-[var(--text-muted)] text-[11px]">{linkedComps.length} comps</span>
                                        </td>
                                        <td className="hidden md:table-cell py-1.5 px-2 text-[var(--text-muted)] text-[11px]">{linkedComps.length} comps</td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Acres</span>
                                            <span>{totalAcres > 0 ? totalAcres.toFixed(2) : '—'}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Avg Price</span>
                                            <span>{fmtCur(avgPrice)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Avg $/SF</span>
                                            <span>{fmtCur(avgPsf, 2)}</span>
                                        </td>
                                        <td className="hidden md:table-cell py-1.5 px-2"></td>
                                        <td className="hidden md:table-cell py-1.5 px-2"></td>
                                        <td className="hidden md:table-cell py-1.5 px-2"></td>
                                        <td className="hidden md:table-cell py-1.5 px-2"></td>
                                    </tr>
                                );
                            })()}
                        </tbody>
                    </table>
                    {linkedComps.some((c: LandComp) => landPricePerSf(c).derived) && (
                        <p className="px-2 py-1.5 text-[11px] text-[var(--text-faint)]">* Calculated from sale price ÷ site area (no $/SF entered)</p>
                    )}
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
        try {
            await linkMut.mutateAsync({ pursuitId, saleCompId: compId });
        } catch (err) {
            console.error('Failed to link sale comp:', err);
            toast.error('Failed to link sale comp', err);
        }
    };

    const handleUnlink = async (compId: string) => {
        if (!window.confirm('Unlink this sale comp from the pursuit?')) return;
        try {
            await unlinkMut.mutateAsync({ pursuitId, saleCompId: compId });
        } catch (err) {
            console.error('Failed to unlink sale comp:', err);
            toast.error('Failed to unlink sale comp', err);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        const yearBuilt = parseNum(newYearBuilt);
        const units = parseNum(newUnits);
        let comp;
        try {
            comp = await createMut.mutateAsync({
                name: newName.trim(),
                address: newAddress.trim(),
                city: newCity.trim(),
                state: newState.trim(),
                county: '',
                zip: '',
                latitude: null,
                longitude: null,
                property_type: null,
                year_built: yearBuilt !== null ? Math.round(yearBuilt) : null,
                total_units: units !== null ? Math.round(units) : null,
                total_sf: null,
                lot_size_sf: 0,
                notes: null,
                parcel_data: null,
                parcel_data_updated_at: null,
            });
            await linkMut.mutateAsync({ pursuitId, saleCompId: comp.id });
        } catch (err) {
            console.error('Failed to create/link sale comp:', err);
            toast.error(comp ? 'Sale comp was created but could not be linked to this pursuit' : 'Failed to create sale comp', err);
            return;
        }
        toast.success(`Created and linked ${comp.name}`);
        setNewName(''); setNewAddress(''); setNewCity(''); setNewState('');
        setNewUnits(''); setNewYearBuilt('');
        setShowCreate(false);
    };

    // Get most recent transaction for each sale comp
    const getLatestTx = (comp: SaleComp): SaleTransaction | null => {
        const txs = comp.sale_transactions ?? [];
        if (txs.length === 0) return null;
        return [...txs].sort((a, b) => (b.sale_date ?? '').localeCompare(a.sale_date ?? ''))[0];
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
                            className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            autoFocus
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2">
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
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className="col-span-2 sm:col-span-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Address" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="City" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newState} onChange={e => setNewState(e.target.value)} placeholder="State" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newUnits} onChange={e => setNewUnits(e.target.value)} placeholder="Total Units" type="number" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        <input value={newYearBuilt} onChange={e => setNewYearBuilt(e.target.value)} placeholder="Year Built" type="number" className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
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
                <div className="border border-[var(--border)] rounded-xl overflow-x-auto bg-[var(--bg-primary)] md:bg-transparent p-2 md:p-0">
                    <table className="w-full text-op min-w-full md:min-w-max block md:table">
                        <thead className="hidden md:table-header-group">
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
                        <tbody className="block md:table-row-group">
                            {linkedComps.map((c: SaleComp, i: number) => {
                                const tx = getLatestTx(c);
                                return (
                                    <tr key={c.id} className="block md:table-row bg-[var(--bg-card)] md:bg-transparent border border-[var(--border)] md:border-b md:border-x-0 md:border-t-0 last:border-b-0 hover:bg-[var(--bg-primary)] mb-3 md:mb-0 rounded-lg md:rounded-none overflow-hidden hover:shadow-sm md:hover:shadow-none">
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 font-medium text-[var(--accent)] border-b border-[var(--border)] md:border-0 bg-[var(--bg-elevated)] md:bg-transparent">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Name</span>
                                            <Link href={`/comps/sales/${c.short_id || c.id}`} className="hover:underline">{c.name}</Link>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Address</span>
                                            <span className="truncate max-w-[140px]">{c.address}{c.city ? `, ${c.city}` : ''}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Type</span>
                                            <span>{c.property_type || '—'}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-center text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Built</span>
                                            <span>{c.year_built ?? '—'}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Units</span>
                                            <span>{fmtNum(c.total_units)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">SF</span>
                                            <span>{fmtNum(c.total_sf)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-center text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Sale Date</span>
                                            <span>{fmtDate(tx?.sale_date)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums font-medium text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Sale Price</span>
                                            <span>{fmtCur(tx?.sale_price)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">$/Unit</span>
                                            {(() => {
                                                const ppu = tx ? salePricePerUnit(tx, c) : null;
                                                return <span title={ppu?.derived ? 'Calculated: sale price ÷ total units' : undefined}>{fmtCur(ppu?.value)}{ppu?.derived ? '*' : ''}</span>;
                                            })()}
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Cap Rate</span>
                                            <span>{tx?.cap_rate ? `${(tx.cap_rate * 100).toFixed(2)}%` : '—'}</span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right md:text-center block md:table-cell">
                                            <button onClick={() => handleUnlink(c.id)} title="Unlink" aria-label={`Unlink ${c.name}`} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors inline-block md:block md:mx-auto">
                                                <span className="md:hidden mr-1 text-xs">Unlink</span>
                                                <X className="w-3.5 h-3.5 inline-block md:block" />
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
                                const ppuVals = linkedComps
                                    .map((c: SaleComp) => { const t = getLatestTx(c); return t ? salePricePerUnit(t, c).value : null; })
                                    .filter((v: number | null): v is number => v !== null);
                                const avgPpu = ppuVals.length > 0 ? ppuVals.reduce((s: number, v: number) => s + v, 0) / ppuVals.length : null;
                                const capTx = txData.filter(t => t.cap_rate && t.cap_rate > 0);
                                const avgCap = capTx.length > 0 ? capTx.reduce((s, t) => s + (t.cap_rate ?? 0), 0) / capTx.length : null;
                                const builtComps = linkedComps.filter((c: SaleComp) => c.year_built && c.year_built > 0);
                                const avgYearBuilt = builtComps.length > 0 ? Math.round(builtComps.reduce((s: number, c: SaleComp) => s + (c.year_built ?? 0), 0) / builtComps.length) : null;
                                return (
                                    <tr className="block md:table-row bg-[var(--bg-elevated)] font-semibold border-t border-[var(--border)] mt-4 md:mt-0 rounded-lg md:rounded-none">
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span>Total / Avg</span>
                                            <span className="md:hidden text-[var(--text-muted)] text-[11px]">{linkedComps.length} comps</span>
                                        </td>
                                        <td className="hidden md:table-cell py-1.5 px-2 text-[var(--text-muted)] text-[11px]">{linkedComps.length} comps</td>
                                        <td className="hidden md:table-cell py-1.5 px-2"></td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-center tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Avg Built</span>
                                            <span>{avgYearBuilt ?? '—'}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Units</span>
                                            <span>{fmtNum(totalUnits)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">SF</span>
                                            <span>{fmtNum(totalSf)}</span>
                                        </td>
                                        <td className="hidden md:table-cell py-1.5 px-2"></td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-primary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Avg Price</span>
                                            <span>{fmtCur(avgPrice)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Avg $/Unit</span>
                                            <span>{fmtCur(avgPpu)}</span>
                                        </td>
                                        <td className="flex justify-between items-center md:table-cell py-1.5 px-2 md:text-right tabular-nums text-[var(--text-secondary)] border-b border-[var(--border)] md:border-0">
                                            <span className="md:hidden font-semibold text-[var(--text-muted)] text-[11px] uppercase">Avg Cap</span>
                                            <span>{avgCap ? `${(avgCap * 100).toFixed(2)}%` : '—'}</span>
                                        </td>
                                        <td className="hidden md:table-cell py-1.5 px-2"></td>
                                    </tr>
                                );
                            })()}
                        </tbody>
                    </table>
                    {linkedComps.some((c: SaleComp) => { const t = getLatestTx(c); return !!t && salePricePerUnit(t, c).derived; }) && (
                        <p className="px-2 py-1.5 text-[11px] text-[var(--text-faint)]">* Calculated from sale price ÷ total units (no $/unit entered)</p>
                    )}
                </div>
            )}
        </div>
    );
}
