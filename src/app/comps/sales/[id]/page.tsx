'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import CommentTrigger from '@/components/shared/CommentTrigger';
import {
    useSaleComp, useUpdateSaleComp,
    useUpsertSaleTransaction, useDeleteSaleTransaction,
} from '@/hooks/useSupabaseQueries';
import {
    ChevronLeft, Loader2, DollarSign, Calendar, Building2, Ruler,
    User, Pencil, Check, X, Plus, Trash2, TrendingUp, Hash,
} from 'lucide-react';
import type { SaleComp, SaleTransaction } from '@/types';

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
    format?: 'text' | 'currency' | 'number' | 'date' | 'percent';
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
        if (parsed && format === 'percent') {
            const num = parseFloat(String(parsed).replace(/[^0-9.-]/g, ''));
            parsed = isNaN(num) ? null : num / 100; // store as decimal
        }
        onSave(parsed);
        setEditing(false);
    };

    const displayValue = (() => {
        if (value === null || value === undefined || value === '') return '—';
        if (format === 'currency') return formatCurrency(value as number);
        if (format === 'number') return formatNumber(value as number);
        if (format === 'percent') return `${((value as number) * 100).toFixed(2)}%`;
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
                            className="flex-1 px-2 py-1 text-sm rounded border border-[#6366F1] focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                        />
                        <button onClick={save} className="p-1 rounded hover:bg-[#EEF2FF] text-[#6366F1]"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-red-50 text-[#A0AABB]"><X className="w-3.5 h-3.5" /></button>
                    </div>
                ) : (
                    <div
                        className="text-sm text-[#4A5568] cursor-pointer hover:text-[#6366F1] transition-colors mt-0.5"
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

// Transaction row component
function TransactionRow({ tx, onUpdate, onDelete }: {
    tx: SaleTransaction;
    onUpdate: (field: keyof SaleTransaction, value: unknown) => void;
    onDelete: () => void;
}) {
    return (
        <div className="bg-white border border-[#E2E5EA] rounded-xl p-4 group">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#EEF2FF] flex items-center justify-center">
                        <DollarSign className="w-3 h-3 text-[#6366F1]" />
                    </div>
                    <span className="text-xs font-semibold text-[#7A8599] uppercase">
                        {tx.sale_date ? new Date(tx.sale_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Sale Record'}
                    </span>
                </div>
                <button
                    onClick={onDelete}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 text-[#A0AABB] hover:text-red-500 transition-all"
                    title="Delete transaction"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="grid grid-cols-2 gap-x-4">
                <EditableField label="Sale Date" value={tx.sale_date} onSave={(v) => onUpdate('sale_date', v)} format="date" icon={Calendar} />
                <EditableField label="Sale Price" value={tx.sale_price} onSave={(v) => onUpdate('sale_price', v)} format="currency" icon={DollarSign} />
                <EditableField label="Cap Rate" value={tx.cap_rate} onSave={(v) => onUpdate('cap_rate', v)} format="percent" icon={TrendingUp} />
                <EditableField label="Price per Unit" value={tx.price_per_unit} onSave={(v) => onUpdate('price_per_unit', v)} format="currency" icon={Hash} />
                <EditableField label="Price per SF" value={tx.price_per_sf} onSave={(v) => onUpdate('price_per_sf', v)} format="currency" icon={Ruler} />
                <EditableField label="Buyer" value={tx.buyer} onSave={(v) => onUpdate('buyer', v)} icon={User} />
                <EditableField label="Seller" value={tx.seller} onSave={(v) => onUpdate('seller', v)} icon={User} />
            </div>
            {/* Transaction note */}
            <div className="mt-2 pt-2 border-t border-[#F4F5F7]">
                <EditableField label="Notes" value={tx.notes} onSave={(v) => onUpdate('notes', v)} />
            </div>
        </div>
    );
}

export default function SaleCompDetailPage() {
    const params = useParams();
    const router = useRouter();
    const compId = params.id as string;
    const { data: comp, isLoading, error } = useSaleComp(compId);
    const updateComp = useUpdateSaleComp();
    const upsertTx = useUpsertSaleTransaction();
    const deleteTx = useDeleteSaleTransaction();

    const [activeTab, setActiveTab] = useState<'details' | 'transactions'>('details');
    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState('');

    const updateField = useCallback((field: keyof SaleComp, value: unknown) => {
        if (!comp) return;
        updateComp.mutate({ id: comp.id, updates: { [field]: value } as Partial<SaleComp>, queryId: compId });
    }, [comp, updateComp, compId]);

    const handleUpdateTx = useCallback((txId: string, field: keyof SaleTransaction, value: unknown) => {
        if (!comp) return;
        upsertTx.mutate({ id: txId, sale_comp_id: comp.id, [field]: value });
    }, [comp, upsertTx]);

    const handleAddTransaction = useCallback(() => {
        if (!comp) return;
        upsertTx.mutate({ sale_comp_id: comp.id });
    }, [comp, upsertTx]);

    const handleDeleteTx = useCallback((txId: string) => {
        if (!comp) return;
        deleteTx.mutate({ id: txId, saleCompId: comp.id });
    }, [comp, deleteTx]);

    const transactions = (comp?.sale_transactions ?? []).sort(
        (a, b) => new Date(b.sale_date ?? 0).getTime() - new Date(a.sale_date ?? 0).getTime()
    );

    if (isLoading) {
        return (
            <AppShell>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
                </div>
            </AppShell>
        );
    }

    if (error || !comp) {
        return (
            <AppShell>
                <div className="max-w-3xl mx-auto px-6 py-20 text-center">
                    <p className="text-sm text-red-500">Failed to load sale comp</p>
                    <Link href="/comps" className="text-sm text-[#6366F1] hover:underline mt-2 block">← Back to Comps</Link>
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
                                        className="text-xl font-bold text-[#1A1F2B] border-b-2 border-[#6366F1] focus:outline-none bg-transparent"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { updateField('name', editName.trim()); setIsEditingName(false); }
                                            if (e.key === 'Escape') setIsEditingName(false);
                                        }}
                                    />
                                    <button onClick={() => { updateField('name', editName.trim()); setIsEditingName(false); }} className="p-1 rounded hover:bg-[#EEF2FF] text-[#6366F1]"><Check className="w-4 h-4" /></button>
                                    <button onClick={() => setIsEditingName(false)} className="p-1 rounded hover:bg-red-50 text-[#A0AABB]"><X className="w-4 h-4" /></button>
                                </div>
                            ) : (
                                <h1
                                    className="text-xl font-bold text-[#1A1F2B] cursor-pointer hover:text-[#6366F1] transition-colors group"
                                    onClick={() => { setEditName(comp.name); setIsEditingName(true); }}
                                >
                                    {comp.name}
                                    <Pencil className="w-3.5 h-3.5 inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </h1>
                            )}
                            <p className="text-sm text-[#7A8599] mt-0.5">
                                {[comp.address, comp.city, comp.state, comp.zip].filter(Boolean).join(', ') || 'No address set'}
                                {comp.property_type && (
                                    <span className="ml-2 text-[10px] bg-[#EEF2FF] text-[#6366F1] px-1.5 py-0.5 rounded-full font-medium">
                                        {comp.property_type}
                                    </span>
                                )}
                            </p>
                        </div>
                        <CommentTrigger entityType="sale_comp" entityId={comp.id} />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 border-b border-[#E2E5EA]">
                    {[
                        { id: 'details' as const, label: 'Property Details' },
                        { id: 'transactions' as const, label: `Sales (${transactions.length})` },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id
                                ? 'text-[#6366F1] border-[#6366F1]'
                                : 'text-[#7A8599] border-transparent hover:text-[#4A5568]'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Property Details Tab */}
                {activeTab === 'details' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Property Information */}
                        <div className="card">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Property Information</h3>
                            <div>
                                <EditableField label="Property Type" value={comp.property_type} onSave={(v) => updateField('property_type', v)} icon={Building2} />
                                <EditableField label="Year Built" value={comp.year_built} onSave={(v) => updateField('year_built', v)} format="number" icon={Calendar} />
                                <EditableField label="Total Units" value={comp.total_units} onSave={(v) => updateField('total_units', v)} format="number" icon={Hash} />
                                <EditableField label="Total SF" value={comp.total_sf} onSave={(v) => updateField('total_sf', v)} format="number" icon={Ruler} />
                                <EditableField label="Lot Size (SF)" value={comp.lot_size_sf || null} onSave={(v) => updateField('lot_size_sf', v ?? 0)} format="number" icon={Ruler} />
                            </div>
                        </div>

                        {/* Location */}
                        <div className="card">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Location</h3>
                            <div>
                                <EditableField label="Address" value={comp.address} onSave={(v) => updateField('address', v)} />
                                <EditableField label="City" value={comp.city} onSave={(v) => updateField('city', v)} />
                                <EditableField label="State" value={comp.state} onSave={(v) => updateField('state', v)} />
                                <EditableField label="County" value={comp.county} onSave={(v) => updateField('county', v)} />
                                <EditableField label="Zip" value={comp.zip} onSave={(v) => updateField('zip', v)} />
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="card md:col-span-2">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-3">Notes</h3>
                            <RichTextEditor
                                content={comp.notes}
                                onChange={(json) => updateField('notes', json)}
                                placeholder="Add notes about this property..."
                            />
                        </div>
                    </div>
                )}

                {/* Transactions Tab */}
                {activeTab === 'transactions' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">
                                Sale History
                            </h3>
                            <button
                                onClick={handleAddTransaction}
                                disabled={upsertTx.isPending}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-medium transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Sale
                            </button>
                        </div>

                        {transactions.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="w-14 h-14 rounded-2xl bg-[#F4F5F7] flex items-center justify-center mx-auto mb-3">
                                    <DollarSign className="w-6 h-6 text-[#A0AABB]" />
                                </div>
                                <h4 className="text-sm font-semibold text-[#4A5568] mb-1">No sales recorded</h4>
                                <p className="text-xs text-[#7A8599] mb-4">Add a sale transaction to track this property&apos;s history.</p>
                                <button
                                    onClick={handleAddTransaction}
                                    className="px-4 py-2 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-sm font-medium transition-colors"
                                >
                                    Add First Sale
                                </button>
                            </div>
                        ) : (
                            transactions.map((tx) => (
                                <TransactionRow
                                    key={tx.id}
                                    tx={tx}
                                    onUpdate={(field, value) => handleUpdateTx(tx.id, field, value)}
                                    onDelete={() => handleDeleteTx(tx.id)}
                                />
                            ))
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
