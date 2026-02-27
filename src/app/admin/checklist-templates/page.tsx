'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
    useChecklistTemplates,
    useChecklistTemplate,
    useUpsertChecklistTemplate,
} from '@/hooks/useSupabaseQueries';
import Link from 'next/link';
import {
    Loader2,
    ClipboardList,
    ChevronRight,
    ChevronDown,
    CheckCircle2,
    Star,
} from 'lucide-react';

export default function ChecklistTemplatesPage() {
    const { data: templates = [], isLoading } = useChecklistTemplates();
    const upsertTemplate = useUpsertChecklistTemplate();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    return (
        <AppShell>
            <div className="max-w-5xl mx-auto px-6 py-8">
                {/* Admin Sub-Nav */}
                <div className="flex gap-2 mb-6 flex-wrap">
                    <Link href="/admin/product-types" className="px-3 py-1.5 rounded-lg text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] text-sm transition-colors">Product Types</Link>
                    <Link href="/admin/stages" className="px-3 py-1.5 rounded-lg text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] text-sm transition-colors">Stages</Link>
                    <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] text-sm transition-colors">Templates</Link>
                    <Link href="/admin/key-date-types" className="px-3 py-1.5 rounded-lg text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] text-sm transition-colors">Key Date Types</Link>
                    <Link href="/admin/checklist-templates" className="px-3 py-1.5 rounded-lg bg-[#F4F5F7] text-[#1A1F2B] text-sm font-medium">Checklists</Link>
                </div>

                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-[#1A1F2B] flex items-center gap-2">
                            <ClipboardList className="w-6 h-6" />
                            Checklist Templates
                        </h1>
                        <p className="text-sm text-[#7A8599] mt-1">Manage due diligence checklist templates applied to pursuits.</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C8CDD5]" /></div>
                ) : templates.length === 0 ? (
                    <div className="text-center py-16">
                        <ClipboardList className="w-12 h-12 mx-auto mb-3 text-[#C8CDD5]" />
                        <p className="text-sm text-[#7A8599]">No templates yet. Apply the database migration to seed the default template.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {templates.map(t => (
                            <div key={t.id} className="bg-white border border-[#E2E5EA] rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
                                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#FAFBFC] transition-colors text-left"
                                >
                                    <ClipboardList className="w-5 h-5 text-[#2563EB] flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-[#1A1F2B]">{t.name}</span>
                                            {t.is_default && (
                                                <Star className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B]" />
                                            )}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${t.is_active ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#F4F5F7] text-[#7A8599]'}`}>
                                                {t.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                        {t.description && <p className="text-xs text-[#7A8599] mt-0.5 truncate">{t.description}</p>}
                                    </div>
                                    <span className="text-xs text-[#A0AABB]">v{t.version}</span>
                                    {selectedId === t.id ? <ChevronDown className="w-4 h-4 text-[#7A8599]" /> : <ChevronRight className="w-4 h-4 text-[#7A8599]" />}
                                </button>

                                {selectedId === t.id && <TemplateDetail templateId={t.id} />}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

// ── Template Detail (expandable) ─────────────────────────────
function TemplateDetail({ templateId }: { templateId: string }) {
    const { data: template, isLoading } = useChecklistTemplate(templateId);

    if (isLoading) return <div className="px-5 py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#C8CDD5]" /></div>;
    if (!template?.phases) return null;

    return (
        <div className="px-5 pb-5 border-t border-[#F0F1F4]">
            <div className="space-y-4 mt-4">
                {template.phases.map(phase => {
                    const taskCount = phase.tasks?.length ?? 0;
                    const checklistCount = phase.tasks?.reduce((sum, t) => sum + (t.checklist_items?.length ?? 0), 0) ?? 0;
                    return (
                        <div key={phase.id} className="rounded-lg border border-[#F0F1F4] overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#FAFBFC]">
                                <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: phase.color || '#9CA3AF' }} />
                                <span className="text-sm font-medium text-[#1A1F2B] flex-1">{phase.name}</span>
                                <span className="text-xs text-[#7A8599]">{taskCount} tasks · {checklistCount} items</span>
                            </div>
                            {phase.tasks && phase.tasks.length > 0 && (
                                <div className="divide-y divide-[#F0F1F4]">
                                    {phase.tasks.map(task => (
                                        <div key={task.id} className="flex items-start gap-2 px-4 py-2 text-xs text-[#4A5568]">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-[#C8CDD5] flex-shrink-0 mt-0.5" />
                                            <span className="flex-1">{task.name}</span>
                                            {task.is_critical_path && (
                                                <span className="text-[9px] uppercase tracking-wider font-bold text-[#EF4444] bg-[#FEF2F2] px-1 py-0.5 rounded">Critical</span>
                                            )}
                                            {(task.checklist_items?.length ?? 0) > 0 && (
                                                <span className="text-[#A0AABB]">{task.checklist_items!.length} items</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
