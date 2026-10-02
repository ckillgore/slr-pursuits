'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { PublicInfoTab } from '@/components/pursuits/PublicInfoTab';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { AddToPursuitButton } from '@/components/shared/AddToPursuitButton';
import { useLandComp, useUpdateLandComp } from '@/hooks/useSupabaseQueries';
import {
    ChevronLeft, Loader2, MapPin, Navigation, DollarSign, Calendar, Ruler,
    User, FileText, Building2, Pencil, Check, X,
} from 'lucide-react';
import { searchPlaces, geocodeForStorage, reverseGeocode, type GeocodeResult } from '@/lib/geocoding';
import { toast } from '@/lib/toast';
import type { LandComp } from '@/types';
import CommentTrigger from '@/components/shared/CommentTrigger';
import { landPricePerSf } from '@/components/pursuits/compDerived';

const SF_PER_ACRE = 43560;

function formatCurrency(val: number | null) {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}
function formatNumber(val: number | null, decimals = 0) {
    if (!val) return '—';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(val);
}

// Inline editable field
function EditableField({ label, value, onSave, format = 'text', icon: Icon, fallback }: {
    label: string;
    value: string | number | null;
    onSave: (val: string | number | null) => void;
    /** Shown (labelled as calculated) when no value has been entered */
    fallback?: { value: number | null; hint: string };
    format?: 'text' | 'currency' | 'number' | 'date';
    icon?: any;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');

    const startEdit = () => {
        setDraft(value?.toString() ?? '');
        setEditing(true);
    };

    const save = () => {
        let parsed: string | number | null = draft.trim() || null;
        if (parsed && (format === 'currency' || format === 'number')) {
            const num = parseFloat(String(parsed).replace(/[^0-9.-]/g, ''));
            parsed = isNaN(num) ? null : num;
        }
        onSave(parsed);
        setEditing(false);
    };

    const displayValue = (() => {
        if (value === null || value === undefined || value === '') return '—';
        if (format === 'currency') return formatCurrency(value as number);
        if (format === 'number') return formatNumber(value as number);
        if (format === 'date' && value) {
            // Date-only strings parse as UTC midnight; treat them as local dates to avoid showing the previous day
            const str = String(value);
            const dt = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + 'T00:00:00') : new Date(str);
            return isNaN(dt.getTime()) ? str : dt.toLocaleDateString();
        }
        return String(value);
    })();

    const showFallback = (value === null || value === undefined || value === '') && fallback?.value != null;

    return (
        <div className="flex items-start gap-3 py-2.5 border-b border-[var(--bg-elevated)] last:border-0 group">
            {Icon && <Icon className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-[var(--text-faint)]" />}
            <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">{label}</div>
                {editing ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <input
                            type={format === 'date' ? 'date' : 'text'}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm rounded border border-[#0D9488] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                        />
                        <button onClick={save} aria-label={`Save ${label}`} className="p-1 rounded hover:bg-[var(--success-bg)] text-[#0D9488]"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditing(false)} aria-label="Cancel" className="p-1 rounded hover:bg-[var(--danger-bg)] text-[var(--text-faint)]"><X className="w-3.5 h-3.5" /></button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="block w-full text-left text-sm text-[var(--text-secondary)] cursor-pointer hover:text-[#0D9488] transition-colors mt-0.5"
                        onClick={startEdit}
                        aria-label={`Edit ${label}`}
                    >
                        {showFallback ? (
                            <>
                                {format === 'currency' ? formatCurrency(fallback!.value) : formatNumber(fallback!.value)}
                                <span className="ml-1.5 text-[10px] text-[var(--text-faint)]" title={fallback!.hint}>calc.</span>
                            </>
                        ) : displayValue}
                        <Pencil className="w-2.5 h-2.5 inline ml-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" />
                    </button>
                )}
            </div>
        </div>
    );
}

export default function CompDetailPage() {
    const params = useParams();
    const router = useRouter();
    const compId = params.id as string;
    const { data: comp, isLoading, error } = useLandComp(compId);
    const updateComp = useUpdateLandComp();

    const [activeTab, setActiveTab] = useState<'details' | 'public'>('details');
    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState('');

    // Location editing
    const [editingLocation, setEditingLocation] = useState(false);
    const [locMode, setLocMode] = useState<'search' | 'coords'>('search');
    const [locSearch, setLocSearch] = useState('');
    const [locSuggestions, setLocSuggestions] = useState<GeocodeResult[]>([]);
    const [showLocSuggestions, setShowLocSuggestions] = useState(false);
    const [locLatStr, setLocLatStr] = useState('');
    const [locLngStr, setLocLngStr] = useState('');
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchSeqRef = useRef(0);

    const updateField = useCallback((field: keyof LandComp, value: unknown) => {
        if (!comp) return;
        updateComp.mutate({ id: comp.id, updates: { [field]: value } as Partial<LandComp>, queryId: compId });
    }, [comp, updateComp, compId]);

    // Address autocomplete for location editing (temporary geocodes — display only)
    const handleLocSearch = useCallback((query: string) => {
        setLocSearch(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const seq = ++searchSeqRef.current;
        if (!query.trim()) { setLocSuggestions([]); setShowLocSuggestions(false); return; }
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const results = await searchPlaces(query);
                if (seq !== searchSeqRef.current) return; // stale response
                setLocSuggestions(results);
                setShowLocSuggestions(true);
            } catch (err) {
                console.error('Address search failed:', err);
            }
        }, 300);
    }, []);

    // The picked suggestion is geocoded again in permanent mode; only that result's coordinates are saved
    const selectLocSuggestion = useCallback(async (s: GeocodeResult) => {
        if (!comp) return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchSeqRef.current++;
        setLocSearch('');
        setLocSuggestions([]);
        setShowLocSuggestions(false);
        setEditingLocation(false);
        try {
            const r = await geocodeForStorage(s);
            if (!r) throw new Error('No permanent match');
            updateComp.mutate({
                id: comp.id,
                updates: {
                    address: r.address || r.name,
                    city: r.city,
                    state: r.state,
                    zip: r.zip,
                    county: r.county || comp.county,
                    latitude: r.lat,
                    longitude: r.lng,
                },
                queryId: compId,
            });
        } catch (err) {
            updateComp.mutate({
                id: comp.id,
                updates: { address: s.address || s.name, city: s.city, state: s.state, zip: s.zip },
                queryId: compId,
            });
            toast.error('Address saved, but it could not be located — the map location was not changed', err);
        }
    }, [comp, updateComp, compId]);

    // Typed coordinates are saved as-is; the address for them comes from a permanent reverse geocode
    const applyLocCoords = useCallback(async () => {
        if (!comp) return;
        const lat = parseFloat(locLatStr);
        const lng = parseFloat(locLngStr);
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
        setEditingLocation(false);
        const updates: Partial<LandComp> = { latitude: lat, longitude: lng };
        try {
            const r = await reverseGeocode(lng, lat, { permanent: true });
            if (r) Object.assign(updates, { address: r.address || r.name, city: r.city, state: r.state, zip: r.zip, county: r.county || comp.county });
        } catch (err) {
            console.error('Reverse geocode failed:', err);
        }
        updateComp.mutate({ id: comp.id, updates, queryId: compId });
    }, [comp, updateComp, locLatStr, locLngStr, compId]);

    if (isLoading) {
        return (
            <AppShell>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-[#0D9488]" />
                </div>
            </AppShell>
        );
    }

    if (error || !comp) {
        return (
            <AppShell>
                <div className="max-w-3xl mx-auto px-6 py-20 text-center">
                    <p className="text-sm text-[var(--danger)]">{error ? 'Failed to load comp' : 'Comp not found'}</p>
                    <Link href="/comps" className="text-sm text-[#0D9488] hover:underline mt-2 block">← Back to Comps</Link>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
                {/* Back + Title */}
                <div className="mb-6">
                    <Link href="/comps" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-3">
                        <ChevronLeft className="w-4 h-4" /> Back to Comps
                    </Link>
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            {isEditingName ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="text-xl font-bold text-[var(--text-primary)] border-b-2 border-[#0D9488] focus:outline-none bg-transparent"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { if (editName.trim()) updateField('name', editName.trim()); setIsEditingName(false); }
                                            if (e.key === 'Escape') setIsEditingName(false);
                                        }}
                                    />
                                    <button onClick={() => { if (editName.trim()) updateField('name', editName.trim()); setIsEditingName(false); }} aria-label="Save name" className="p-1 rounded hover:bg-[var(--success-bg)] text-[#0D9488]"><Check className="w-4 h-4" /></button>
                                    <button onClick={() => setIsEditingName(false)} aria-label="Cancel" className="p-1 rounded hover:bg-[var(--danger-bg)] text-[var(--text-faint)]"><X className="w-4 h-4" /></button>
                                </div>
                            ) : (
                                <h1
                                    className="text-xl font-bold text-[var(--text-primary)] cursor-pointer hover:text-[#0D9488] transition-colors group"
                                    onClick={() => { setEditName(comp.name); setIsEditingName(true); }}
                                >
                                    {comp.name}
                                    <Pencil className="w-3.5 h-3.5 inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </h1>
                            )}
                            <p className="text-sm text-[var(--text-muted)] mt-0.5">
                                {[comp.address, comp.city, comp.state, comp.zip].filter(Boolean).join(', ') || 'No address set'}
                                {comp.latitude && comp.longitude && (
                                    <span className="text-[10px] text-[var(--text-faint)] ml-2">({comp.latitude.toFixed(4)}, {comp.longitude.toFixed(4)})</span>
                                )}
                                <button
                                    onClick={() => setEditingLocation(!editingLocation)}
                                    className="ml-2 text-[10px] text-[#0D9488] hover:underline"
                                >
                                    {editingLocation ? 'Cancel' : 'Edit Location'}
                                </button>
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <AddToPursuitButton compId={comp.id} compType="land" />
                            <CommentTrigger entityType="land_comp" entityId={comp.id} />
                        </div>
                    </div>

                    {/* Location editor */}
                    {editingLocation && (
                        <div className="mt-3 p-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg space-y-2">
                            <div className="flex gap-2">
                                <button onClick={() => setLocMode('search')} className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium ${locMode === 'search' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[var(--text-muted)] border border-[var(--border)]'}`}>
                                    <MapPin className="w-3 h-3" /> Address
                                </button>
                                <button onClick={() => setLocMode('coords')} className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium ${locMode === 'coords' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[var(--text-muted)] border border-[var(--border)]'}`}>
                                    <Navigation className="w-3 h-3" /> Coords
                                </button>
                            </div>
                            {locMode === 'search' ? (
                                <div className="relative">
                                    <input value={locSearch} onChange={(e) => handleLocSearch(e.target.value)} placeholder="Search address..." className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm focus:border-[#0D9488] focus:outline-none" autoFocus />
                                    {showLocSuggestions && locSuggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                            {locSuggestions.map((s) => (
                                                <button key={s.id} onClick={() => void selectLocSuggestion(s)} className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                                                    <div className="font-medium text-xs">{s.name}</div>
                                                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.secondary}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input value={locLatStr} onChange={(e) => setLocLatStr(e.target.value)} placeholder="Latitude" className="flex-1 px-3 py-2 rounded border border-[var(--border)] text-sm" />
                                    <input value={locLngStr} onChange={(e) => setLocLngStr(e.target.value)} placeholder="Longitude" className="flex-1 px-3 py-2 rounded border border-[var(--border)] text-sm" />
                                    <button onClick={() => void applyLocCoords()} className="px-3 py-2 rounded bg-[#0D9488] text-white text-sm font-medium">Apply</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
                    {[
                        { id: 'details' as const, label: 'Sale Details' },
                        { id: 'public' as const, label: 'Public Information' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id
                                ? 'text-[#0D9488] border-[#0D9488]'
                                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                {activeTab === 'details' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Sale Information */}
                        <div className="card">
                            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Sale Information</h3>
                            <div>
                                <EditableField label="Sale Price" value={comp.sale_price} onSave={(v) => updateField('sale_price', v)} format="currency" icon={DollarSign} />
                                <EditableField
                                    label="Price per SF"
                                    value={comp.sale_price_psf}
                                    onSave={(v) => updateField('sale_price_psf', v)}
                                    format="currency"
                                    icon={Ruler}
                                    fallback={{ value: landPricePerSf(comp).derived ? landPricePerSf(comp).value : null, hint: 'Calculated from sale price ÷ site area' }}
                                />
                                {(() => {
                                    const psf = landPricePerSf(comp).value;
                                    return psf != null ? (
                                        <div className="flex items-start gap-3 py-2.5 border-b border-[var(--bg-elevated)]">
                                            <Ruler className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-[var(--text-faint)]" />
                                            <div>
                                                <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Price per Acre</div>
                                                <div className="text-sm text-[var(--text-secondary)] mt-0.5">{formatCurrency(psf * SF_PER_ACRE)}</div>
                                            </div>
                                        </div>
                                    ) : null;
                                })()}
                                <EditableField label="Sale Date" value={comp.sale_date} onSave={(v) => updateField('sale_date', v)} format="date" icon={Calendar} />
                                <EditableField label="Buyer" value={comp.buyer} onSave={(v) => updateField('buyer', v)} icon={User} />
                                <EditableField label="Seller" value={comp.seller} onSave={(v) => updateField('seller', v)} icon={User} />
                            </div>
                        </div>

                        {/* Site Information */}
                        <div className="card">
                            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Site Information</h3>
                            <div>
                                <EditableField label="Site Area (SF)" value={comp.site_area_sf || null} onSave={(v) => updateField('site_area_sf', v ?? 0)} format="number" icon={Ruler} />
                                <div className="flex items-start gap-3 py-2.5 border-b border-[var(--bg-elevated)]">
                                    <MapPin className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-[var(--text-faint)]" />
                                    <div>
                                        <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Site Area (Acres)</div>
                                        <div className="text-sm text-[var(--text-secondary)] mt-0.5">{comp.site_area_sf > 0 ? formatNumber(comp.site_area_sf / SF_PER_ACRE, 2) : '—'}</div>
                                    </div>
                                </div>
                                <EditableField label="Zoning" value={comp.zoning} onSave={(v) => updateField('zoning', v)} icon={Building2} />
                                <EditableField label="Land Use" value={comp.land_use} onSave={(v) => updateField('land_use', v)} icon={FileText} />
                            </div>
                        </div>

                        {/* Notes — full width */}
                        <div className="card md:col-span-2">
                            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Notes</h3>
                            <RichTextEditor
                                content={comp.notes}
                                onChange={(json) => updateField('notes', json)}
                                placeholder="Add notes about this comp..."
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'public' && (
                    <PublicInfoTab
                        latitude={comp.latitude}
                        longitude={comp.longitude}
                        pursuitName={comp.name}
                        pursuitAddress={comp.address}
                        siteAreaSF={comp.site_area_sf}
                        savedParcelData={comp.parcel_data}
                        onSaveParcelData={(data) => updateField('parcel_data', data)}
                        hideAssemblage
                    />
                )}
            </div>
        </AppShell>
    );
}
