'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCategoryMappings } from '@/app/actions/accounting';
import { toast } from '@/lib/toast';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2, Loader2, GripVertical, AlertTriangle, Lightbulb } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
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
        if (error) toast.error('Failed to load budget defaults', error);
        else if (data) setLineItems(data);
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
            
        if (error) toast.error('Failed to add line item', error);
        else if (data) setLineItems([...lineItems, data]);
        setIsSaving(false);
    };

    const handleDelete = async (id: string) => {
        setIsSaving(true);
        const { error } = await supabase.from('default_predev_budget_line_items').delete().eq('id', id);
        if (error) toast.error('Failed to delete line item', error);
        else setLineItems(lineItems.filter(l => l.id !== id));
        setIsSaving(false);
    };

    const handleUpdate = async (id: string, updates: Partial<DefaultLineItem>) => {
        const previous = lineItems.find(l => l.id === id);
        setLineItems(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        const { error } = await supabase.from('default_predev_budget_line_items').update(updates).eq('id', id);
        if (error) {
            // Roll back so the list (and the mapping health check) shows what is actually saved.
            if (previous) setLineItems(prev => prev.map(l => l.id === id ? previous : l));
            toast.error('Failed to save line item', error);
        }
    };

    const handleDragEnd = async (event: any) => {
        const { active, over } = event;

        // `over` is null when the row is dropped outside the list
        if (over && active.id !== over.id) {
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
            const { error } = await supabase.from('default_predev_budget_line_items').upsert(upsertPayload, { onConflict: 'id' });
            if (error) {
                setLineItems(lineItems);
                toast.error('Failed to save the new order', error);
            }
            setIsSaving(false);
        }
    };

    // --- MAPPING HEALTH REPORT LOGIC ---
    // A 2-digit group is fully covered when the group code itself is mapped, or
    // when every one of its detail codes is. Mapping a single detail code
    // ("50-00100") leaves the rest of group 50 unallocated, so it is reported
    // as partial rather than passing the check.
    const { data: liveMappings } = useQuery({
        queryKey: ['category-mappings'] as const,
        queryFn: fetchCategoryMappings,
        staleTime: 5 * 60 * 1000,
    });

    const mappingHealth = useMemo(() => {
        const mappedCodes = new Set<string>();
        for (const li of lineItems) for (const code of li.yardi_cost_groups ?? []) mappedCodes.add(code.trim());

        const detailsByGroup = new Map<string, string[]>();
        for (const m of liveMappings ?? []) {
            if (m.is_group_header || m.category_code.length <= 2) continue;
            const group = m.category_code.substring(0, 2);
            const list = detailsByGroup.get(group);
            if (list) list.push(m.category_code);
            else detailsByGroup.set(group, [m.category_code]);
        }

        const unmapped: [string, string][] = [];
        const partial: { code: string; name: string; missing: string[]; mappedCount: number; knownTotal: number | null }[] = [];
        for (const [code, name] of Object.entries(categoryMapping)) {
            if (mappedCodes.has(code)) continue;
            const mappedDetails = [...mappedCodes].filter(c => c.length > 2 && c.substring(0, 2) === code);
            if (mappedDetails.length === 0) {
                unmapped.push([code, name]);
                continue;
            }
            const known = detailsByGroup.get(code);
            if (known) {
                const missing = known.filter(c => !mappedCodes.has(c));
                if (missing.length === 0) continue; // every detail code mapped
                partial.push({ code, name, missing, mappedCount: mappedDetails.length, knownTotal: known.length });
            } else {
                // Detail list not loaded (or unknown for this group): can't prove coverage.
                partial.push({ code, name, missing: [], mappedCount: mappedDetails.length, knownTotal: null });
            }
        }
        return { unmapped, partial };
    }, [lineItems, liveMappings]);
    const unallocatedCategories = mappingHealth.unmapped;
    const partialCategories = mappingHealth.partial;

    if (isLoading) {
        return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--border-strong)]" /></div>;
    }

    return (
        <>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

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
                            <AlertTriangle className="w-4 h-4" />
                            Unallocated Cost Categories Detected ({unallocatedCategories.length})
                        </h3>
                        <p className="text-xs text-[var(--danger)] mb-3 opacity-90">
                            The following standard Yardi categories are missing from your default mapping.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {unallocatedCategories.map(([code, name]) => (
                                <span key={code} className="inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-card)] text-[var(--danger)] text-xs font-semibold rounded border border-[var(--danger)]/30">
                                    <span className="opacity-70 font-mono">{code}</span> {name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {partialCategories.length > 0 && (
                    <div className="bg-[var(--warning-bg)] border border-[var(--warning)]/60 rounded-xl p-4 shadow-sm animate-in fade-in">
                        <h3 className="text-[var(--warning)] font-bold text-sm mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Partially Mapped Cost Categories ({partialCategories.length})
                        </h3>
                        <p className="text-xs text-[var(--warning)] mb-3 opacity-90">
                            Only some detail codes in these groups are mapped. Yardi cost on the other codes lands in
                            &quot;Unallocated&quot; on new budgets. Map the 2-digit group, or the remaining detail codes.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {partialCategories.map(p => (
                                <span
                                    key={p.code}
                                    title={p.missing.length > 0 ? `Unmapped: ${p.missing.join(', ')}` : 'Detail code list unavailable; map the group code to be sure.'}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-card)] text-[var(--warning)] text-xs font-semibold rounded border border-[var(--warning)]/30 cursor-help"
                                >
                                    <span className="opacity-70 font-mono">{p.code}</span> {p.name}
                                    <span className="font-normal opacity-80 tabular-nums">
                                        {p.knownTotal !== null
                                            ? `(${p.mappedCount} of ${p.knownTotal} codes)`
                                            : `(${p.mappedCount} code${p.mappedCount !== 1 ? 's' : ''})`}
                                    </span>
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
                
                <div className="p-4 bg-[var(--accent-subtle)] text-[var(--accent)] rounded-lg text-sm flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 shrink-0" />
                    <p>
                        <strong>Note on Updates:</strong> Modifications made to these defaults will only affect <strong>newly created</strong> budgets.
                    </p>
                </div>
            </div>
        </>
    );
}
