'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { PublicInfoTab } from '@/components/pursuits/PublicInfoTab';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { useLandComp, useUpdateLandComp } from '@/hooks/useSupabaseQueries';
import {
    ChevronLeft, Loader2, MapPin, Navigation, DollarSign, Calendar, Ruler,
    User, FileText, Building2, Pencil, Check, X,
} from 'lucide-react';
import type { LandComp } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
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
function EditableField({ label, value, onSave, format = 'text', icon: Icon }: {
    label: string;
    value: string | number | null;
    onSave: (val: string | number | null) => void;
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
        if (format === 'date' && value) return new Date(value as string).toLocaleDateString();
        return String(value);
    })();

    return (
        <div className="flex items-start gap-3 py-2.5 border-b border-[#F4F5F7] last:border-0 group">
            {Icon && <Icon className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-[#A0AABB]" />}
            <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">{label}</div>
                {editing ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <input
                            type={format === 'date' ? 'date' : 'text'}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm rounded border border-[#0D9488] focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                        />
                        <button onClick={save} className="p-1 rounded hover:bg-[#ECFDF3] text-[#0D9488]"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-red-50 text-[#A0AABB]"><X className="w-3.5 h-3.5" /></button>
                    </div>
                ) : (
                    <div
                        className="text-sm text-[#4A5568] cursor-pointer hover:text-[#0D9488] transition-colors mt-0.5"
                        onClick={startEdit}
                    >
                        {displayValue}
                        <Pencil className="w-2.5 h-2.5 inline ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
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
    const [locSuggestions, setLocSuggestions] = useState<any[]>([]);
    const [showLocSuggestions, setShowLocSuggestions] = useState(false);
    const [locLatStr, setLocLatStr] = useState('');
    const [locLngStr, setLocLngStr] = useState('');
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateField = useCallback((field: keyof LandComp, value: unknown) => {
        if (!comp) return;
        updateComp.mutate({ id: comp.id, updates: { [field]: value } as Partial<LandComp> });
    }, [comp, updateComp]);

    // Address autocomplete for location editing
    const handleLocSearch = useCallback((query: string) => {
        setLocSearch(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!query.trim() || !MAPBOX_TOKEN) { setLocSuggestions([]); setShowLocSuggestions(false); return; }
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,place&country=US&limit=5`
                );
                const data = await res.json();
                setLocSuggestions(data.features || []);
                setShowLocSuggestions(true);
            } catch { /* ignore */ }
        }, 300);
    }, []);

    const selectLocSuggestion = useCallback((feature: any) => {
        if (!comp) return;
        const [lng, lat] = feature.center;
        const context = feature.context || [];
        const findCtx = (type: string) => context.find((c: any) => c.id?.startsWith(type))?.text || '';
        const parts = feature.place_name.split(',');
        updateComp.mutate({
            id: comp.id,
            updates: {
                address: parts[0]?.trim() || '',
                city: findCtx('place') || '',
                state: findCtx('region') || '',
                zip: findCtx('postcode') || '',
                county: findCtx('district') || '',
                latitude: lat,
                longitude: lng,
            },
        });
        setLocSearch('');
        setLocSuggestions([]);
        setShowLocSuggestions(false);
        setEditingLocation(false);
    }, [comp, updateComp]);

    const applyLocCoords = useCallback(() => {
        if (!comp) return;
        const lat = parseFloat(locLatStr);
        const lng = parseFloat(locLngStr);
        if (isNaN(lat) || isNaN(lng)) return;
        const updates: Partial<LandComp> = { latitude: lat, longitude: lng };
        // Reverse geocode
        if (MAPBOX_TOKEN) {
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address,place`)
                .then(r => r.json())
                .then(data => {
                    if (data.features?.length > 0) {
                        const f = data.features[0];
                        const ctx = f.context || [];
                        const findCtx = (type: string) => ctx.find((c: any) => c.id?.startsWith(type))?.text || '';
                        const parts = f.place_name.split(',');
                        updateComp.mutate({
                            id: comp.id,
                            updates: {
                                ...updates,
                                address: parts[0]?.trim() || '',
                                city: findCtx('place') || '',
                                state: findCtx('region') || '',
                                zip: findCtx('postcode') || '',
                                county: findCtx('district') || '',
                            },
                        });
                    } else {
                        updateComp.mutate({ id: comp.id, updates });
                    }
                })
                .catch(() => updateComp.mutate({ id: comp.id, updates }));
        } else {
            updateComp.mutate({ id: comp.id, updates });
        }
        setEditingLocation(false);
    }, [comp, updateComp, locLatStr, locLngStr]);

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
                    <p className="text-sm text-red-500">Failed to load comp</p>
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
                    <Link href="/comps" className="inline-flex items-center gap-1 text-sm text-[#7A8599] hover:text-[#4A5568] transition-colors mb-3">
                        <ChevronLeft className="w-4 h-4" /> Back to Comps
                    </Link>
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            {isEditingName ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="text-xl font-bold text-[#1A1F2B] border-b-2 border-[#0D9488] focus:outline-none bg-transparent"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { updateField('name', editName.trim()); setIsEditingName(false); }
                                            if (e.key === 'Escape') setIsEditingName(false);
                                        }}
                                    />
                                    <button onClick={() => { updateField('name', editName.trim()); setIsEditingName(false); }} className="p-1 rounded hover:bg-[#ECFDF3] text-[#0D9488]"><Check className="w-4 h-4" /></button>
                                    <button onClick={() => setIsEditingName(false)} className="p-1 rounded hover:bg-red-50 text-[#A0AABB]"><X className="w-4 h-4" /></button>
                                </div>
                            ) : (
                                <h1
                                    className="text-xl font-bold text-[#1A1F2B] cursor-pointer hover:text-[#0D9488] transition-colors group"
                                    onClick={() => { setEditName(comp.name); setIsEditingName(true); }}
                                >
                                    {comp.name}
                                    <Pencil className="w-3.5 h-3.5 inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </h1>
                            )}
                            <p className="text-sm text-[#7A8599] mt-0.5">
                                {[comp.address, comp.city, comp.state, comp.zip].filter(Boolean).join(', ') || 'No address set'}
                                {comp.latitude && comp.longitude && (
                                    <span className="text-[10px] text-[#A0AABB] ml-2">({comp.latitude.toFixed(4)}, {comp.longitude.toFixed(4)})</span>
                                )}
                                <button
                                    onClick={() => setEditingLocation(!editingLocation)}
                                    className="ml-2 text-[10px] text-[#0D9488] hover:underline"
                                >
                                    {editingLocation ? 'Cancel' : 'Edit Location'}
                                </button>
                            </p>
                        </div>
                    </div>

                    {/* Location editor */}
                    {editingLocation && (
                        <div className="mt-3 p-3 bg-[#F9FAFB] border border-[#E2E5EA] rounded-lg space-y-2">
                            <div className="flex gap-2">
                                <button onClick={() => setLocMode('search')} className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium ${locMode === 'search' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[#7A8599] border border-[#E2E5EA]'}`}>
                                    <MapPin className="w-3 h-3" /> Address
                                </button>
                                <button onClick={() => setLocMode('coords')} className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium ${locMode === 'coords' ? 'bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30' : 'text-[#7A8599] border border-[#E2E5EA]'}`}>
                                    <Navigation className="w-3 h-3" /> Coords
                                </button>
                            </div>
                            {locMode === 'search' ? (
                                <div className="relative">
                                    <input value={locSearch} onChange={(e) => handleLocSearch(e.target.value)} placeholder="Search address..." className="w-full px-3 py-2 rounded border border-[#E2E5EA] text-sm focus:border-[#0D9488] focus:outline-none" autoFocus />
                                    {showLocSuggestions && locSuggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E5EA] rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                            {locSuggestions.map((s: any) => (
                                                <button key={s.id} onClick={() => selectLocSuggestion(s)} className="w-full text-left px-3 py-2 text-sm text-[#4A5568] hover:bg-[#F4F5F7]">{s.place_name}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input value={locLatStr} onChange={(e) => setLocLatStr(e.target.value)} placeholder="Latitude" className="flex-1 px-3 py-2 rounded border border-[#E2E5EA] text-sm" />
                                    <input value={locLngStr} onChange={(e) => setLocLngStr(e.target.value)} placeholder="Longitude" className="flex-1 px-3 py-2 rounded border border-[#E2E5EA] text-sm" />
                                    <button onClick={applyLocCoords} className="px-3 py-2 rounded bg-[#0D9488] text-white text-sm font-medium">Apply</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 border-b border-[#E2E5EA]">
                    {[
                        { id: 'details' as const, label: 'Sale Details' },
                        { id: 'public' as const, label: 'Public Information' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id
                                ? 'text-[#0D9488] border-[#0D9488]'
                                : 'text-[#7A8599] border-transparent hover:text-[#4A5568]'
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
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Sale Information</h3>
                            <div>
                                <EditableField label="Sale Price" value={comp.sale_price} onSave={(v) => updateField('sale_price', v)} format="currency" icon={DollarSign} />
                                <EditableField label="Price per SF" value={comp.sale_price_psf} onSave={(v) => updateField('sale_price_psf', v)} format="currency" icon={Ruler} />
                                <EditableField label="Sale Date" value={comp.sale_date} onSave={(v) => updateField('sale_date', v)} format="date" icon={Calendar} />
                                <EditableField label="Buyer" value={comp.buyer} onSave={(v) => updateField('buyer', v)} icon={User} />
                                <EditableField label="Seller" value={comp.seller} onSave={(v) => updateField('seller', v)} icon={User} />
                            </div>
                        </div>

                        {/* Site Information */}
                        <div className="card">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Site Information</h3>
                            <div>
                                <EditableField label="Site Area (SF)" value={comp.site_area_sf || null} onSave={(v) => updateField('site_area_sf', v ?? 0)} format="number" icon={Ruler} />
                                <div className="flex items-start gap-3 py-2.5 border-b border-[#F4F5F7]">
                                    <MapPin className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-[#A0AABB]" />
                                    <div>
                                        <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold">Site Area (Acres)</div>
                                        <div className="text-sm text-[#4A5568] mt-0.5">{comp.site_area_sf > 0 ? formatNumber(comp.site_area_sf / SF_PER_ACRE, 2) : '—'}</div>
                                    </div>
                                </div>
                                <EditableField label="Zoning" value={comp.zoning} onSave={(v) => updateField('zoning', v)} icon={Building2} />
                                <EditableField label="Land Use" value={comp.land_use} onSave={(v) => updateField('land_use', v)} icon={FileText} />
                            </div>
                        </div>

                        {/* Notes — full width */}
                        <div className="card md:col-span-2">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Notes</h3>
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
