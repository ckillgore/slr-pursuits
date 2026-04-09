'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { YardiCategorySelect } from './YardiCategorySelect';
import categoryMappingRaw from '../../../../category-mapping.json';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const categoryMapping = categoryMappingRaw as Record<string, string>;
const supabase = createClient();

interface DefaultLineItem {
    id: string;
    category: string;
    label: string;
    sort_order: number;
    yardi_cost_groups: string[];
}

function SortableItem({ 
    li, 
    handleUpdate, 
    handleDelete, 
    isSaving,
    onDragStart
}: { 
    li: DefaultLineItem;
    handleUpdate: (id: string, updates: Partial<DefaultLineItem>) => void;
    handleDelete: (id: string) => void;
    isSaving: boolean;
    onDragStart: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: li.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div 
        ref={setNodeRef} 
        style={style} 
        className={`grid grid-cols-[3rem_minmax(150px,1fr)_1fr_minmax(250px,2fr)_4rem] items-center gap-4 p-3 bg-[var(--bg-card)] rounded-xl border transition-all ${isDragging ? 'shadow-2xl border-[var(--accent)] ring-1 ring-[var(--accent)] scale-[1.01]' : 'shadow-sm border-[var(--border)] hover:border-[var(--accent-subtle)]'}`}
    >
      <div 
        className="flex items-center justify-center p-1 cursor-grab active:cursor-grabbing text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5 focus:outline-none" />
      </div>

      <div>
          <input 
              type="text" 
              defaultValue={li.label}
              onBlur={(e) => handleUpdate(li.id, { label: e.target.value })}
              className="w-full bg-transparent font-medium text-sm text-[var(--text-primary)] outline-none border-b border-transparent focus:border-[var(--accent)] placeholder:text-[var(--text-faint)]"
              placeholder="e.g. Due Diligence"
          />
      </div>

      <div>
          <input 
              type="text" 
              defaultValue={li.category}
              onBlur={(e) => handleUpdate(li.id, { category: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              className="w-full bg-transparent font-mono text-[10px] text-[var(--text-muted)] outline-none border-b border-transparent focus:border-[var(--accent)] placeholder:text-[var(--text-faint)]"
              placeholder="e.g. due_diligence"
          />
      </div>

      <div className="on-drag-prevent" onPointerDown={(e) => e.stopPropagation()}>
          <YardiCategorySelect 
              selectedCodes={li.yardi_cost_groups || []}
              onChange={(codes) => handleUpdate(li.id, { yardi_cost_groups: codes })}
              className="w-full"
          />
      </div>

      <div className="flex justify-end p-1 on-drag-prevent" onPointerDown={(e) => e.stopPropagation()}>
          <button 
              onClick={() => handleDelete(li.id)}
              disabled={isSaving}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded-md transition-colors disabled:opacity-50 focus:outline-none"
          >
              <Trash2 className="w-4 h-4" />
          </button>
      </div>
    </div>
  );
}

export function BudgetDefaultsClient() {
    const { isAdminOrOwner, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !isAdminOrOwner) router.push('/');
    }, [authLoading, isAdminOrOwner, router]);

    const [lineItems, setLineItems] = useState<DefaultLineItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // minimum drag 5px to kick off (allows clicking inner inputs)
            }
        }),
        useSensor(KeyboardSensor, {
          coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const loadData = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('default_predev_budget_line_items')
            .select('*')
            .order('sort_order');
        if (!error && data) {
            setLineItems(data);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleAdd = async () => {
        setIsSaving(true);
        const sort_order = lineItems.length > 0 ? Math.max(...lineItems.map(l => l.sort_order)) + 1 : 1;
        const { data, error } = await supabase
            .from('default_predev_budget_line_items')
            .insert({ category: 'new_category', label: 'New Line Item', sort_order, yardi_cost_groups: [] })
            .select()
            .single();
            
        if (!error && data) {
            setLineItems([...lineItems, data]);
        }
        setIsSaving(false);
    };

    const handleDelete = async (id: string) => {
        setIsSaving(true);
        const { error } = await supabase.from('default_predev_budget_line_items').delete().eq('id', id);
        if (!error) setLineItems(lineItems.filter(l => l.id !== id));
        setIsSaving(false);
    };

    const handleUpdate = async (id: string, updates: Partial<DefaultLineItem>) => {
        setLineItems(lineItems.map(l => l.id === id ? { ...l, ...updates } : l));
        await supabase.from('default_predev_budget_line_items').update(updates).eq('id', id);
    };

    const handleDragEnd = async (event: any) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setIsSaving(true);
            const oldIndex = lineItems.findIndex((item) => item.id === active.id);
            const newIndex = lineItems.findIndex((item) => item.id === over.id);

            const reordered = arrayMove(lineItems, oldIndex, newIndex);
            
            // Recalculate robust Sort Order base 1 index
            const updatedItems = reordered.map((item, index) => ({
                ...item,
                sort_order: index + 1
            }));
            
            // Optimistic rendering
            setLineItems(updatedItems);
            
            // Generate DB Patch Array
            const upsertPayload = updatedItems.map((item) => ({
                id: item.id,
                category: item.category,
                label: item.label,
                sort_order: item.sort_order,
                yardi_cost_groups: item.yardi_cost_groups
            }));
            
            // Bulk upsert into Supabase to persist the order
            await supabase.from('default_predev_budget_line_items').upsert(upsertPayload, { onConflict: 'id' });
            setIsSaving(false);
        }
    };

    // --- MAPPING HEALTH REPORT LOGIC ---
    const allocatedPrefixes = new Set<string>();
    lineItems.forEach(li => {
        li.yardi_cost_groups?.forEach(code => {
            const prefix = code.split('-')[0];
            if (prefix) allocatedPrefixes.add(prefix);
        });
    });

    const unallocatedCategories = Object.entries(categoryMapping).filter(([code]) => {
        return !allocatedPrefixes.has(code);
    });

    if (isLoading) {
        return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" /></div>;
    }

    return (
        <AppShell>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
                <div className="flex gap-2 -mt-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Key Date Types</Link>
                    <Link href="/admin/checklist-templates" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Checklists</Link>
                    <Link href="/admin/budget-defaults" className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium">Budget Defaults</Link>
                    <Link href="/admin/accounting" className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-sm transition-colors">Accounting</Link>
                </div>

                <div className="flex justify-between items-center bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm">
                    <div>
                        <h1 className="text-xl font-bold text-[var(--text-primary)]">Pre-Dev Budget Defaults</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1">Manage the standard set of line items injected into all new Pre-Dev Budgets globally.</p>
                    </div>
                    <button
                        onClick={handleAdd}
                        disabled={isSaving}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Line Item
                    </button>
                </div>

                {/* MAPPING HEALTH REPORT */}
                {unallocatedCategories.length > 0 && (
                    <div className="bg-[var(--danger-bg)] border border-[var(--danger)] rounded-xl p-4 shadow-sm animate-in fade-in">
                        <h3 className="text-[var(--danger)] font-bold text-sm mb-2 flex items-center gap-2">
                            ⚠️ Unallocated Cost Categories Detected ({unallocatedCategories.length})
                        </h3>
                        <p className="text-xs text-[var(--danger)] mb-3 opacity-90">
                            The following standard Yardi categories are missing from your default mapping.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {unallocatedCategories.map(([code, name]) => (
                                <span key={code} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/50 text-[var(--danger)] text-xs font-semibold rounded border border-[var(--danger)]/30">
                                    <span className="opacity-70">{code}</span> {name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* DND LIST */}
                <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden p-2">
                    <div className="grid grid-cols-[3rem_minmax(150px,1fr)_1fr_minmax(250px,2fr)_4rem] items-center gap-4 px-3 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)] mb-2">
                        <div className="text-center">Sort</div>
                        <div>Label</div>
                        <div>Category (ID)</div>
                        <div>Live Yardi Mappings</div>
                        <div className="text-right">Actions</div>
                    </div>

                    <DndContext 
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext 
                            items={lineItems.map(i => i.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-1.5">
                                {lineItems.map((li) => (
                                    <SortableItem 
                                        key={li.id} 
                                        li={li} 
                                        handleUpdate={handleUpdate}
                                        handleDelete={handleDelete}
                                        isSaving={isSaving}
                                        onDragStart={() => {}}
                                    />
                                ))}
                                {lineItems.length === 0 && (
                                    <div className="py-12 text-center text-[var(--text-muted)] text-sm border-2 border-dashed border-[var(--border)] rounded-xl mt-4">
                                        No default line items configured.
                                    </div>
                                )}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
                
                <div className="p-4 bg-[var(--accent-bg)] text-[var(--accent)] rounded-lg text-sm flex items-start gap-3">
                    <span className="shrink-0 text-xl block leading-none">💡</span>
                    <p>
                        <strong>Note on Updates:</strong> Modifications made to these defaults will only affect <strong>newly created</strong> budgets.
                    </p>
                </div>
            </div>
        </AppShell>
    );
}
