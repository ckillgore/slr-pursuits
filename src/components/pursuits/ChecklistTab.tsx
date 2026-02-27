'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    usePursuitChecklist,
    usePursuitMilestones,
    useChecklistTemplates,
    useApplyTemplate,
    useUpdateChecklistTask,
    useToggleChecklistItem,
    useTaskNotes,
    useCreateTaskNote,
    useTaskActivity,
    useUpsertMilestone,
} from '@/hooks/useSupabaseQueries';
import type {
    PursuitChecklistPhase,
    PursuitChecklistTask,
    PursuitChecklistItem,
    PursuitMilestone,
    ChecklistTaskStatus,
    TaskNote,
    TaskActivityLog,
} from '@/types';
import {
    ChevronDown,
    ChevronRight,
    CheckCircle2,
    Circle,
    Clock,
    Eye,
    XCircle,
    Ban,
    AlertTriangle,
    Loader2,
    Calendar,
    User,
    MessageSquare,
    Activity,
    X,
    Plus,
    ClipboardList,
    Send,
    Flag,
} from 'lucide-react';

// ── Status Config ────────────────────────────────────────────
const STATUS_CONFIG: Record<ChecklistTaskStatus, { label: string; color: string; bgColor: string; Icon: any }> = {
    not_started: { label: 'Not Started', color: '#9CA3AF', bgColor: '#F4F5F7', Icon: Circle },
    in_progress: { label: 'In Progress', color: '#3B82F6', bgColor: '#EBF1FF', Icon: Clock },
    in_review: { label: 'In Review', color: '#F59E0B', bgColor: '#FFFBEB', Icon: Eye },
    complete: { label: 'Complete', color: '#10B981', bgColor: '#ECFDF5', Icon: CheckCircle2 },
    not_applicable: { label: 'N/A', color: '#64748B', bgColor: '#F1F5F9', Icon: Ban },
    blocked: { label: 'Blocked', color: '#EF4444', bgColor: '#FEF2F2', Icon: XCircle },
};

const ALL_STATUSES: ChecklistTaskStatus[] = ['not_started', 'in_progress', 'in_review', 'complete', 'not_applicable', 'blocked'];

// ── Helpers ──────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// ── Apply Template Dialog ────────────────────────────────────
function ApplyTemplateDialog({
    pursuitId,
    onClose,
}: {
    pursuitId: string;
    onClose: () => void;
}) {
    const { data: templates = [], isLoading } = useChecklistTemplates();
    const applyMutation = useApplyTemplate();
    const activeTemplates = templates.filter(t => t.is_active);
    const defaultTemplate = activeTemplates.find(t => t.is_default);
    const [selectedId, setSelectedId] = useState<string>(defaultTemplate?.id ?? '');

    // Auto-select default when data loads
    if (!selectedId && defaultTemplate) setSelectedId(defaultTemplate.id);

    const handleApply = () => {
        if (!selectedId) return;
        applyMutation.mutate({ pursuitId, templateId: selectedId }, {
            onSuccess: () => onClose(),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                <h2 className="text-lg font-semibold text-[#1A1F2B] mb-1">Apply Checklist Template</h2>
                <p className="text-sm text-[#7A8599] mb-5">Select a template to create the checklist for this pursuit.</p>
                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#A0AABB]" /></div>
                ) : activeTemplates.length === 0 ? (
                    <p className="text-sm text-[#7A8599] py-6 text-center">No active templates. Create one in Admin → Checklist Templates.</p>
                ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {activeTemplates.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedId(t.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${selectedId === t.id
                                        ? 'border-[#2563EB] bg-[#EBF1FF] ring-2 ring-[#2563EB]/20'
                                        : 'border-[#E2E5EA] bg-white hover:bg-[#FAFBFC]'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-[#1A1F2B]">{t.name}</span>
                                    {t.is_default && <span className="text-[10px] uppercase tracking-wider font-semibold text-[#2563EB] bg-[#DBEAFE] px-1.5 py-0.5 rounded">Default</span>}
                                </div>
                                {t.description && <p className="text-xs text-[#7A8599] mt-1 line-clamp-2">{t.description}</p>}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:bg-[#F4F5F7] transition-colors">Cancel</button>
                    <button
                        onClick={handleApply}
                        disabled={!selectedId || applyMutation.isPending}
                        className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        {applyMutation.isPending ? 'Applying...' : 'Apply Template'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Milestone Bar ────────────────────────────────────────────
function MilestoneBar({
    pursuitId,
    milestones,
}: {
    pursuitId: string;
    milestones: PursuitMilestone[];
}) {
    const upsertMilestone = useUpsertMilestone();
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white border border-[#E2E5EA] rounded-xl mb-4">
            <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#1A1F2B] hover:bg-[#FAFBFC] rounded-xl transition-colors">
                <span className="flex items-center gap-2"><Flag className="w-4 h-4 text-[#F59E0B]" /> Milestones</span>
                <span className="flex items-center gap-2">
                    <span className="text-xs text-[#7A8599]">{milestones.filter(m => m.target_date).length}/{milestones.length} set</span>
                    {expanded ? <ChevronDown className="w-4 h-4 text-[#7A8599]" /> : <ChevronRight className="w-4 h-4 text-[#7A8599]" />}
                </span>
            </button>
            {expanded && (
                <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {milestones.map(m => (
                        <div key={m.id} className="flex flex-col gap-1.5 p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                            <label className="text-xs font-semibold text-[#4A5568] uppercase tracking-wider">{m.milestone_label}</label>
                            <input
                                type="date"
                                value={m.target_date ?? ''}
                                onChange={(e) => upsertMilestone.mutate({ id: m.id, target_date: e.target.value || null, pursuit_id: pursuitId })}
                                className={`px-2 py-1.5 rounded-md text-sm border ${m.target_date ? (m.is_confirmed ? 'border-[#10B981]' : 'border-dashed border-[#F59E0B]') : 'border-[#E2E5EA]'} bg-white focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 focus:outline-none`}
                            />
                            <button
                                onClick={() => upsertMilestone.mutate({ id: m.id, is_confirmed: !m.is_confirmed, pursuit_id: pursuitId })}
                                className={`text-[10px] uppercase tracking-wider font-semibold self-start px-2 py-0.5 rounded-full transition-colors ${m.is_confirmed ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FFFBEB] text-[#D97706]'}`}
                            >
                                {m.is_confirmed ? '✓ Confirmed' : 'Estimated'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Task Card ────────────────────────────────────────────────
function TaskCard({
    task,
    onClick,
    isSelected,
}: {
    task: PursuitChecklistTask;
    onClick: () => void;
    isSelected: boolean;
}) {
    const cfg = STATUS_CONFIG[task.status];
    const checkedCount = task.checklist_items?.filter(i => i.is_checked).length ?? 0;
    const totalItems = task.checklist_items?.length ?? 0;
    const overdue = task.due_date && task.status !== 'complete' && task.status !== 'not_applicable' && daysUntil(task.due_date) < 0;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-[#FAFBFC] ${isSelected ? 'bg-[#EBF1FF] ring-1 ring-[#2563EB]/30' : ''
                }`}
        >
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center" style={{ color: cfg.color }}>
                <cfg.Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[#1A1F2B] truncate">{task.name}</span>
                    {task.is_critical_path && <span className="flex-shrink-0 text-[9px] uppercase tracking-wider font-bold text-[#EF4444] bg-[#FEF2F2] px-1 py-0.5 rounded">Critical</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                    {task.due_date && (
                        <span className={`text-[11px] flex items-center gap-0.5 ${overdue ? 'text-[#EF4444] font-semibold' : 'text-[#7A8599]'}`}>
                            <Calendar className="w-3 h-3" />
                            {formatDate(task.due_date)}
                        </span>
                    )}
                    {totalItems > 0 && (
                        <span className="text-[11px] text-[#7A8599]">{checkedCount}/{totalItems}</span>
                    )}
                </div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ color: cfg.color, backgroundColor: cfg.bgColor }}>{cfg.label}</span>
        </button>
    );
}

// ── Phase Accordion ──────────────────────────────────────────
function PhaseAccordion({
    phase,
    selectedTaskId,
    onSelectTask,
}: {
    phase: PursuitChecklistPhase;
    selectedTaskId: string | null;
    onSelectTask: (taskId: string) => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const tasks = phase.tasks ?? [];
    const completedCount = tasks.filter(t => t.status === 'complete').length;
    const applicableCount = tasks.filter(t => t.status !== 'not_applicable').length;
    const progress = applicableCount > 0 ? Math.round((completedCount / applicableCount) * 100) : 0;

    return (
        <div className="bg-white border border-[#E2E5EA] rounded-xl overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FAFBFC] transition-colors"
            >
                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: phase.color || '#9CA3AF' }} />
                <span className="text-sm font-semibold text-[#1A1F2B] flex-1 text-left">{phase.name}</span>
                <div className="flex items-center gap-3">
                    {/* Progress bar */}
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-[#F0F1F4] overflow-hidden">
                            <div className="h-full rounded-full bg-[#10B981] transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs text-[#7A8599] tabular-nums w-16">{completedCount}/{applicableCount}</span>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-[#7A8599]" /> : <ChevronRight className="w-4 h-4 text-[#7A8599]" />}
                </div>
            </button>
            {expanded && tasks.length > 0 && (
                <div className="px-2 pb-2 space-y-0.5">
                    {tasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onSelectTask(task.id)}
                            isSelected={selectedTaskId === task.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Task Detail Panel ────────────────────────────────────────
function TaskDetailPanel({
    task,
    pursuitId,
    onClose,
}: {
    task: PursuitChecklistTask;
    pursuitId: string;
    onClose: () => void;
}) {
    const updateTask = useUpdateChecklistTask();
    const toggleItem = useToggleChecklistItem();
    const { data: notes = [] } = useTaskNotes(task.id);
    const createNote = useCreateTaskNote();
    const { data: activity = [] } = useTaskActivity(task.id);
    const [noteText, setNoteText] = useState('');
    const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'activity'>('details');

    const cfg = STATUS_CONFIG[task.status];
    const overdue = task.due_date && task.status !== 'complete' && task.status !== 'not_applicable' && daysUntil(task.due_date) < 0;

    const handleStatusChange = (status: ChecklistTaskStatus) => {
        updateTask.mutate({ taskId: task.id, pursuitId, updates: { status } });
    };

    const handleSubmitNote = () => {
        if (!noteText.trim()) return;
        createNote.mutate({ taskId: task.id, content: noteText.trim() });
        setNoteText('');
    };

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white border-l border-[#E2E5EA] shadow-xl z-40 flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-[#E2E5EA]">
                <div className="flex-1 min-w-0 pr-3">
                    <h3 className="text-base font-semibold text-[#1A1F2B] leading-tight">{task.name}</h3>
                    {task.is_critical_path && (
                        <span className="inline-block mt-1 text-[9px] uppercase tracking-wider font-bold text-[#EF4444] bg-[#FEF2F2] px-1.5 py-0.5 rounded">Critical Path</span>
                    )}
                </div>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-[#F4F5F7] text-[#7A8599] transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Status & Due Date */}
            <div className="px-5 py-3 border-b border-[#F0F1F4] space-y-3">
                <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-[#7A8599] uppercase tracking-wider w-14">Status</label>
                    <div className="flex flex-wrap gap-1">
                        {ALL_STATUSES.map(s => {
                            const sc = STATUS_CONFIG[s];
                            return (
                                <button
                                    key={s}
                                    onClick={() => handleStatusChange(s)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${task.status === s ? 'ring-1' : 'opacity-60 hover:opacity-100'
                                        }`}
                                    style={{
                                        color: sc.color,
                                        backgroundColor: task.status === s ? sc.bgColor : 'transparent',
                                        ...(task.status === s ? { ringColor: sc.color } : {}),
                                    }}
                                >
                                    <sc.Icon className="w-3 h-3" /> {sc.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {task.due_date && (
                    <div className="flex items-center gap-3">
                        <label className="text-xs font-semibold text-[#7A8599] uppercase tracking-wider w-14">Due</label>
                        <span className={`text-sm ${overdue ? 'text-[#EF4444] font-semibold' : 'text-[#1A1F2B]'}`}>
                            {formatDate(task.due_date)}
                            {overdue && <span className="ml-1 text-xs">({Math.abs(daysUntil(task.due_date))} days overdue)</span>}
                            {!overdue && daysUntil(task.due_date) >= 0 && (
                                <span className="ml-1 text-xs text-[#7A8599]">({daysUntil(task.due_date)} days)</span>
                            )}
                        </span>
                        {task.due_date_is_manual && <span className="text-[9px] uppercase tracking-wider font-semibold text-[#7A8599] bg-[#F4F5F7] px-1 py-0.5 rounded">Manual</span>}
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#E2E5EA] px-5">
                {[
                    { key: 'details' as const, label: 'Details', Icon: ClipboardList },
                    { key: 'notes' as const, label: `Notes (${notes.length})`, Icon: MessageSquare },
                    { key: 'activity' as const, label: 'Activity', Icon: Activity },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.key
                                ? 'border-[#2563EB] text-[#2563EB]'
                                : 'border-transparent text-[#7A8599] hover:text-[#4A5568]'
                            }`}
                    >
                        <tab.Icon className="w-3.5 h-3.5" /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
                {activeTab === 'details' && (
                    <div className="space-y-4">
                        {/* Description */}
                        {task.description && (
                            <div>
                                <h4 className="text-xs font-semibold text-[#7A8599] uppercase tracking-wider mb-2">Description</h4>
                                <p className="text-sm text-[#4A5568] leading-relaxed whitespace-pre-wrap">{task.description}</p>
                            </div>
                        )}

                        {/* Checklist Items */}
                        {(task.checklist_items?.length ?? 0) > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-[#7A8599] uppercase tracking-wider mb-2">
                                    Checklist ({task.checklist_items!.filter(i => i.is_checked).length}/{task.checklist_items!.length})
                                </h4>
                                <div className="space-y-1">
                                    {task.checklist_items!.map(item => (
                                        <label
                                            key={item.id}
                                            className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[#FAFBFC] cursor-pointer transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={item.is_checked}
                                                onChange={() => toggleItem.mutate({ itemId: item.id, isChecked: !item.is_checked, pursuitId })}
                                                className="mt-0.5 w-4 h-4 rounded border-[#C8CDD5] text-[#2563EB] focus:ring-[#2563EB]/20"
                                            />
                                            <span className={`text-sm ${item.is_checked ? 'text-[#A0AABB] line-through' : 'text-[#1A1F2B]'}`}>
                                                {item.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Milestone Reference */}
                        {task.relative_milestone && (
                            <div className="text-xs text-[#7A8599]">
                                Due date: {task.relative_due_days !== null ? `${task.relative_due_days > 0 ? '+' : ''}${task.relative_due_days} days from` : 'relative to'} <span className="font-medium">{task.relative_milestone.replace(/_/g, ' ')}</span>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'notes' && (
                    <div className="space-y-3">
                        {notes.length === 0 && (
                            <p className="text-sm text-[#A0AABB] text-center py-6">No notes yet. Add a note below.</p>
                        )}
                        {notes.map((note: TaskNote) => (
                            <div key={note.id} className="p-3 rounded-lg bg-[#FAFBFC] border border-[#F0F1F4]">
                                <p className="text-sm text-[#1A1F2B] whitespace-pre-wrap">{note.content}</p>
                                <div className="flex items-center gap-2 mt-2 text-[10px] text-[#A0AABB]">
                                    <span>{timeAgo(note.created_at)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="space-y-2">
                        {activity.length === 0 && (
                            <p className="text-sm text-[#A0AABB] text-center py-6">No activity recorded yet.</p>
                        )}
                        {activity.map((entry: TaskActivityLog) => (
                            <div key={entry.id} className="flex items-start gap-2 text-xs text-[#7A8599] py-1">
                                <Activity className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span>
                                    <span className="font-medium text-[#4A5568]">{entry.action.replace(/_/g, ' ')}</span>
                                    {entry.new_value && typeof entry.new_value === 'object' && 'status' in entry.new_value && (
                                        <span> → {String(entry.new_value.status).replace(/_/g, ' ')}</span>
                                    )}
                                    <span className="ml-2 text-[#A0AABB]">{timeAgo(entry.created_at)}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Note Input (always visible) */}
            {activeTab === 'notes' && (
                <div className="px-5 py-3 border-t border-[#E2E5EA]">
                    <div className="flex gap-2">
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add a note..."
                            rows={2}
                            className="flex-1 px-3 py-2 rounded-lg text-sm border border-[#E2E5EA] bg-white focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 focus:outline-none resize-none"
                            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitNote(); }}
                        />
                        <button
                            onClick={handleSubmitNote}
                            disabled={!noteText.trim() || createNote.isPending}
                            className="self-end px-3 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main ChecklistTab ────────────────────────────────────────
export default function ChecklistTab({ pursuitId }: { pursuitId: string }) {
    const { data: phases = [], isLoading: checklistLoading } = usePursuitChecklist(pursuitId);
    const { data: milestones = [], isLoading: milestonesLoading } = usePursuitMilestones(pursuitId);
    const [showApplyDialog, setShowApplyDialog] = useState(false);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    const hasChecklist = phases.length > 0;
    const isLoading = checklistLoading || milestonesLoading;

    // Find selected task
    const selectedTask = useMemo(() => {
        if (!selectedTaskId) return null;
        for (const phase of phases) {
            const task = phase.tasks?.find(t => t.id === selectedTaskId);
            if (task) return task;
        }
        return null;
    }, [selectedTaskId, phases]);

    // Summary stats
    const stats = useMemo(() => {
        const allTasks = phases.flatMap(p => p.tasks ?? []);
        const applicable = allTasks.filter(t => t.status !== 'not_applicable');
        const completed = allTasks.filter(t => t.status === 'complete');
        const overdue = allTasks.filter(t => t.due_date && t.status !== 'complete' && t.status !== 'not_applicable' && daysUntil(t.due_date) < 0);
        const inProgress = allTasks.filter(t => t.status === 'in_progress');
        return { total: applicable.length, completed: completed.length, overdue: overdue.length, inProgress: inProgress.length };
    }, [phases]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[#A0AABB]" />
            </div>
        );
    }

    if (!hasChecklist) {
        return (
            <>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#EBF1FF] flex items-center justify-center mb-4">
                        <ClipboardList className="w-8 h-8 text-[#2563EB]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#1A1F2B] mb-1">No Checklist Yet</h3>
                    <p className="text-sm text-[#7A8599] max-w-sm mb-6">Apply a template to create a structured checklist for this pursuit's pre-development lifecycle.</p>
                    <button
                        onClick={() => setShowApplyDialog(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> Apply Template
                    </button>
                </div>
                {showApplyDialog && <ApplyTemplateDialog pursuitId={pursuitId} onClose={() => setShowApplyDialog(false)} />}
            </>
        );
    }

    return (
        <div className="relative">
            {/* Summary Stats Bar */}
            <div className="flex items-center gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    <span className="text-[#1A1F2B] font-medium">{stats.completed}/{stats.total}</span>
                    <span className="text-[#7A8599]">complete</span>
                </div>
                {stats.inProgress > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="w-4 h-4 text-[#3B82F6]" />
                        <span className="text-[#1A1F2B] font-medium">{stats.inProgress}</span>
                        <span className="text-[#7A8599]">in progress</span>
                    </div>
                )}
                {stats.overdue > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                        <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
                        <span className="text-[#EF4444] font-medium">{stats.overdue}</span>
                        <span className="text-[#7A8599]">overdue</span>
                    </div>
                )}
                {/* Overall progress bar */}
                <div className="flex-1 hidden md:block">
                    <div className="w-full h-2 rounded-full bg-[#F0F1F4] overflow-hidden">
                        <div className="h-full rounded-full bg-[#10B981] transition-all" style={{ width: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%` }} />
                    </div>
                </div>
            </div>

            {/* Milestone Bar */}
            {milestones.length > 0 && <MilestoneBar pursuitId={pursuitId} milestones={milestones} />}

            {/* Phase Accordions */}
            <div className="space-y-3">
                {phases.map(phase => (
                    <PhaseAccordion
                        key={phase.id}
                        phase={phase}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={setSelectedTaskId}
                    />
                ))}
            </div>

            {/* Task Detail Panel (slide-out) */}
            {selectedTask && (
                <>
                    <div className="fixed inset-0 bg-black/10 z-30" onClick={() => setSelectedTaskId(null)} />
                    <TaskDetailPanel
                        task={selectedTask}
                        pursuitId={pursuitId}
                        onClose={() => setSelectedTaskId(null)}
                    />
                </>
            )}
        </div>
    );
}
