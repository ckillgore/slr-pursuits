'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useProductTypes, useUpsertProductType } from '@/hooks/useSupabaseQueries';
import Link from 'next/link';
import { Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

export default function ProductTypesPage() {
    const { data: productTypes = [], isLoading } = useProductTypes();
    const upsertMutation = useUpsertProductType();

    const [expanded, setExpanded] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newLow, setNewLow] = useState('');
    const [newHigh, setNewHigh] = useState('');

    const handleAdd = () => {
        if (!newName.trim()) return;
        upsertMutation.mutate({ name: newName.trim(), density_low: parseFloat(newLow) || 0, density_high: parseFloat(newHigh) || 0, sort_order: productTypes.length + 1, is_active: true });
        setNewName(''); setNewLow(''); setNewHigh(''); setShowAdd(false);
    };

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-6 py-8">
                <div className="flex gap-2 mb-6">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg bg-[#F4F5F7] text-[#1A1F2B] text-sm font-medium">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] text-sm transition-colors">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] text-sm transition-colors">Key Date Types</Link>
                </div>
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-[#1A1F2B]">Product Types</h1>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> Add Product Type
                    </button>
                </div>
                {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C8CDD5]" /></div>}
                <div className="space-y-2">
                    {productTypes.sort((a, b) => a.sort_order - b.sort_order).map((pt) => (
                        <div key={pt.id} className="card">
                            <div className="flex items-center justify-between">
                                <button onClick={() => setExpanded(expanded === pt.id ? null : pt.id)} className="flex items-center gap-2 text-[#1A1F2B] font-medium">
                                    {expanded === pt.id ? <ChevronDown className="w-4 h-4 text-[#7A8599]" /> : <ChevronRight className="w-4 h-4 text-[#7A8599]" />}{pt.name}
                                </button>
                                <div className="flex items-center gap-4 text-sm text-[#7A8599]">
                                    <span>{pt.density_low}–{pt.density_high} units/acre</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${pt.is_active ? 'bg-[#ECFDF3] text-[#0D7A3E]' : 'bg-[#F4F5F7] text-[#A0AABB]'}`}>{pt.is_active ? 'Active' : 'Inactive'}</span>
                                    <button onClick={() => upsertMutation.mutate({ id: pt.id, is_active: !pt.is_active })} className="text-xs text-[#7A8599] hover:text-[#4A5568]">{pt.is_active ? 'Deactivate' : 'Activate'}</button>
                                </div>
                            </div>
                            {expanded === pt.id && (
                                <div className="mt-4 pl-6 space-y-2 animate-fade-in">
                                    <div className="text-[10px] text-[#A0AABB] uppercase tracking-wider font-semibold mb-2">Sub-Product Types</div>
                                    {pt.sub_product_types && pt.sub_product_types.length > 0 ? pt.sub_product_types.map((spt) => (
                                        <div key={spt.id} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-[#FAFBFC] border border-[#F0F1F4] text-sm text-[#4A5568]">
                                            {spt.name}
                                            <span className={`text-xs ${spt.is_active ? 'text-[#0D7A3E]' : 'text-[#A0AABB]'}`}>{spt.is_active ? 'Active' : 'Inactive'}</span>
                                        </div>
                                    )) : <div className="text-xs text-[#A0AABB]">No sub-types defined</div>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                {showAdd && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-4">Add Product Type</h2>
                            <div className="space-y-4">
                                <div><label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Name</label><input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none" autoFocus /></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Density Low</label><input type="number" value={newLow} onChange={(e) => setNewLow(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none" /></div>
                                    <div><label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Density High</label><input type="number" value={newHigh} onChange={(e) => setNewHigh(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none" /></div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors">Cancel</button>
                                <button onClick={handleAdd} disabled={upsertMutation.isPending} className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm">{upsertMutation.isPending ? 'Adding...' : 'Add'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
