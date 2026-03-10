'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
    useAddChecklistTask,
    useDeleteChecklistTask,
    useAddChecklistItem,
    useDeleteChecklistItem,
    useDeleteChecklistPhase,
    useDeleteChecklistInstance,
    useReorderChecklistTasks,
    useReorderChecklistItems,
    useUsers,
    usePursuitTeamMembers,
    useExternalTaskParties,
    useAddChecklistPhase,
} from '@/hooks/useSupabaseQueries';
import { TaskDetailPanel } from '@/components/shared/TaskDetailPanel';
import type {
    PursuitChecklistPhase,
    PursuitChecklistTask,
    PursuitChecklistItem,
    PursuitMilestone,
    ChecklistTaskStatus,
    TaskNote,
    TaskActivityLog,
    UserProfile,
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
    GripVertical,
    Trash2,
    ExternalLink,
    Link as LinkIcon,
    MoreVertical,
    RotateCcw,
} from 'lucide-react';

// â”€â”€ Status Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_CONFIG: Record<ChecklistTaskStatus, { label: string; color: string; bgColor: string; Icon: any }> = {
    not_started: { label: 'Not Started', color: '#9CA3AF', bgColor: 'var(--bg-elevated)', Icon: Circle },
    in_progress: { label: 'In Progress', color: '#3B82F6', bgColor: 'var(--accent-subtle)', Icon: Clock },
    in_review: { label: 'In Review', color: '#F59E0B', bgColor: 'var(--warning-bg)', Icon: Eye },
    complete: { label: 'Complete', color: '#10B981', bgColor: '#ECFDF5', Icon: CheckCircle2 },
    not_applicable: { label: 'N/A', color: '#64748B', bgColor: '#F1F5F9', Icon: Ban },
    blocked: { label: 'Blocked', color: '#EF4444', bgColor: 'var(--danger-bg)', Icon: XCircle },
};

const ALL_STATUSES: ChecklistTaskStatus[] = ['not_started', 'in_progress', 'in_review', 'complete', 'not_applicable', 'blocked'];

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Confirmation Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ConfirmDialog({ title, message, requireString, onConfirm, onCancel }: {
    title: string; message: string; requireString?: string; onConfirm: () => void; onCancel: () => void;
}) {
    const [inputVal, setInputVal] = useState('');
    const isValid = requireString ? inputVal === requireString : true;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in">
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-muted)] mb-5">{message}</p>
                
                {requireString && (
                    <div className="mb-5">
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                            Type <strong className="text-[var(--text-primary)]">{requireString}</strong> to confirm
                        </label>
                        <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--bg-elevated)] focus:outline-none focus:ring-1 focus:ring-[#EF4444] focus:border-[#EF4444]"
                            value={inputVal}
                            onChange={(e) => setInputVal(e.target.value)}
                            placeholder={requireString}
                            autoFocus
                        />
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                    <button 
                        onClick={onConfirm} 
                        disabled={!isValid}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isValid 
                                ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white' 
                                : 'bg-[var(--bg-elevated)] text-[var(--text-faint)] cursor-not-allowed'
                        }`}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// â”€â”€ Apply Template Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ApplyTemplateDialog({ pursuitId, onClose }: { pursuitId: string; onClose: () => void }) {
    const { data: templates = [], isLoading } = useChecklistTemplates();
    const applyMutation = useApplyTemplate();
    const activeTemplates = templates.filter(t => t.is_active);
    const defaultTemplate = activeTemplates.find(t => t.is_default);
    const [selectedId, setSelectedId] = useState<string>(defaultTemplate?.id ?? '');
    if (!selectedId && defaultTemplate) setSelectedId(defaultTemplate.id);

    const handleApply = () => {
        if (!selectedId) return;
        applyMutation.mutate({ pursuitId, templateId: selectedId }, { onSuccess: () => onClose() });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Apply Checklist Template</h2>
                <p className="text-sm text-[var(--text-muted)] mb-5">Select a template to create the checklist for this pursuit.</p>
                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" /></div>
                ) : activeTemplates.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] py-6 text-center">No active templates. Create one in Admin â†’ Checklist Templates.</p>
                ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {activeTemplates.map(t => (
                            <button key={t.id} onClick={() => setSelectedId(t.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${selectedId === t.id
                                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-2 ring-[var(--accent)]/20'
                                    : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-primary)]'}`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-[var(--text-primary)]">{t.name}</span>
                                    {t.is_default && <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--accent)] bg-[var(--badge-owner-bg)] px-1.5 py-0.5 rounded">Default</span>}
                                </div>
                                {t.description && <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{t.description}</p>}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
                    <button onClick={handleApply} disabled={!selectedId || applyMutation.isPending}
                        className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm">
                        {applyMutation.isPending ? 'Applying...' : 'Apply Template'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// â”€â”€ Milestone Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MilestoneBar({ pursuitId, milestones }: { pursuitId: string; milestones: PursuitMilestone[] }) {
    const upsertMilestone = useUpsertMilestone();
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl mb-4">
            <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-primary)] rounded-xl transition-colors">
                <span className="flex items-center gap-2"><Flag className="w-4 h-4 text-[#F59E0B]" /> Milestones</span>
                <span className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">{milestones.filter(m => m.target_date).length}/{milestones.length} set</span>
                    {expanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                </span>
            </button>
            {expanded && (
                <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {milestones.map(m => (
                        <div key={m.id} className="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--table-row-border)]">
                            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{m.milestone_label}</label>
                            <input type="date" value={m.target_date ?? ''}
                                onChange={(e) => upsertMilestone.mutate({ id: m.id, target_date: e.target.value || null, pursuit_id: pursuitId })}
                                className={`px-2 py-1.5 rounded-md text-sm border ${m.target_date ? (m.is_confirmed ? 'border-[#10B981]' : 'border-dashed border-[#F59E0B]') : 'border-[var(--border)]'} bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none`} />
                            <button onClick={() => upsertMilestone.mutate({ id: m.id, is_confirmed: !m.is_confirmed, pursuit_id: pursuitId })}
                                className={`text-[10px] uppercase tracking-wider font-semibold self-start px-2 py-0.5 rounded-full transition-colors ${m.is_confirmed ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--warning-bg)] text-[#D97706]'}`}>
                                {m.is_confirmed ? 'âœ“ Confirmed' : 'Estimated'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}function TaskCard({
    task, onClick, isSelected,
    onDelete,
    dragHandlers,
    users
}: {
    task: PursuitChecklistTask; onClick: () => void; isSelected: boolean;
    onDelete: () => void;
    dragHandlers: { onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void; onDragEnd: () => void;
        onTouchStart: (e: React.TouchEvent) => void; onTouchMove: (e: React.TouchEvent) => void; onTouchEnd: () => void;
    };
    users?: UserProfile[];
}) {
    const cfg = STATUS_CONFIG[task.status];
    const checkedCount = task.checklist_items?.filter(i => i.is_checked).length ?? 0;
    const totalItems = task.checklist_items?.length ?? 0;
    const overdue = task.due_date && task.status !== 'complete' && task.status !== 'not_applicable' && daysUntil(task.due_date) < 0;

    return (
        <div draggable className={`flex items-center gap-1 px-1 py-0.5 rounded-lg transition-all ${isSelected ? 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]/30' : ''}`}
            onDragStart={dragHandlers.onDragStart} onDragOver={dragHandlers.onDragOver} onDrop={dragHandlers.onDrop} onDragEnd={dragHandlers.onDragEnd}
            onTouchStart={dragHandlers.onTouchStart} onTouchMove={dragHandlers.onTouchMove} onTouchEnd={dragHandlers.onTouchEnd}>
            <div className="cursor-grab active:cursor-grabbing p-1 text-[var(--text-faint)] hover:text-[var(--text-muted)] touch-none">
                <GripVertical className="w-3.5 h-3.5" />
            </div>
            <button onClick={onClick} className="flex-1 text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--bg-primary)] transition-all min-w-0">
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center" style={{ color: cfg.color }}>
                    <cfg.Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--text-primary)] truncate">{task.name}</span>
                        {task.is_critical_path && <span className="flex-shrink-0 text-[9px] uppercase tracking-wider font-bold text-[#EF4444] bg-[var(--danger-bg)] px-1 py-0.5 rounded">Critical</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                        {task.due_date && (
                            <span className={`text-[11px] flex items-center gap-0.5 ${overdue ? 'text-[#EF4444] font-semibold' : 'text-[var(--text-muted)]'}`}>
                                <Calendar className="w-3 h-3" /> {formatDate(task.due_date)}
                            </span>
                        )}
                        {totalItems > 0 && <span className="text-[11px] text-[var(--text-muted)]">{checkedCount}/{totalItems}</span>}
                        {task.assigned_to && (
                            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-0.5">
                                <User className="w-3 h-3" /> {users?.find(u => u.id === task.assigned_to)?.full_name?.split(' ')[0]}
                            </span>
                        )}
                    </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ color: cfg.color, backgroundColor: cfg.bgColor }}>{cfg.label}</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1 text-[var(--text-faint)] hover:text-[#EF4444] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                style={{ opacity: undefined }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}>
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// â”€â”€ Phase Accordion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PhaseAccordion({
    phase, pursuitId, selectedTaskId, onSelectTask, users,
    onQueueDeletePhase, onQueueDeleteTask
}: {
    phase: PursuitChecklistPhase; pursuitId: string;
    selectedTaskId: string | null; onSelectTask: (taskId: string) => void;
    users: UserProfile[];
    onQueueDeletePhase: (label: string, execute: () => void) => void;
    onQueueDeleteTask: (taskId: string, label: string, execute: () => void) => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const [addingTask, setAddingTask] = useState(false);
    const [newTaskName, setNewTaskName] = useState('');
    const [confirmDeletePhase, setConfirmDeletePhase] = useState(false);
    const [confirmDeleteTask, setConfirmDeleteTask] = useState<string | null>(null);
    const [showPhaseMenu, setShowPhaseMenu] = useState(false);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const addTask = useAddChecklistTask();
    const deleteTask = useDeleteChecklistTask();
    const deletePhase = useDeleteChecklistPhase();
    const reorderTasks = useReorderChecklistTasks();

    const tasks = phase.tasks ?? [];
    const completedCount = tasks.filter(t => t.status === 'complete').length;
    const applicableCount = tasks.filter(t => t.status !== 'not_applicable').length;
    const progress = applicableCount > 0 ? Math.round((completedCount / applicableCount) * 100) : 0;

    const handleAddTask = () => {
        if (!newTaskName.trim()) return;
        addTask.mutate({ phaseId: phase.id, pursuitId, task: { name: newTaskName.trim(), sort_order: tasks.length } });
        setNewTaskName('');
        setAddingTask(false);
    };

    // Drag state for reorder
    const handleDrop = (targetIdx: number) => {
        if (dragIdx === null || dragIdx === targetIdx) return;
        const ordered = [...tasks];
        const [moved] = ordered.splice(dragIdx, 1);
        ordered.splice(targetIdx, 0, moved);
        reorderTasks.mutate({ phaseId: phase.id, orderedIds: ordered.map(t => t.id), pursuitId });
        setDragIdx(null);
    };

    // Touch drag state
    const touchRef = useRef<{ idx: number; startY: number; currentY: number } | null>(null);

    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-primary)] transition-colors">
                <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: phase.color || '#9CA3AF' }} />
                    <span className="text-sm font-semibold text-[var(--text-primary)] flex-1 text-left">{phase.name}</span>
                </button>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-[var(--table-row-border)] overflow-hidden">
                            <div className="h-full rounded-full bg-[#10B981] transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums w-16">{completedCount}/{applicableCount}</span>
                    </div>
                    <div className="relative">
                        <button onClick={() => setShowPhaseMenu(!showPhaseMenu)} className="p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                            <MoreVertical className="w-4 h-4" />
                        </button>
                        {showPhaseMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowPhaseMenu(false)} />
                                <div className="absolute right-0 top-8 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg py-1 w-44">
                                    <button onClick={() => { setShowPhaseMenu(false); setConfirmDeletePhase(true); }}
                                        className="w-full text-left px-3 py-2 text-sm text-[#EF4444] hover:bg-[var(--bg-primary)] flex items-center gap-2">
                                        <Trash2 className="w-3.5 h-3.5" /> Delete Section
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                </div>
            </div>
            {expanded && (
                <div className="px-2 pb-2 space-y-0.5">
                    {tasks.map((task, idx) => (
                        <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} isSelected={selectedTaskId === task.id}
                            users={users}
                            onDelete={() => setConfirmDeleteTask(task.id)}
                            dragHandlers={{
                                onDragStart: () => setDragIdx(idx),
                                onDragOver: (e) => e.preventDefault(),
                                onDrop: () => handleDrop(idx),
                                onDragEnd: () => setDragIdx(null),
                                onTouchStart: (e) => { touchRef.current = { idx, startY: e.touches[0].clientY, currentY: e.touches[0].clientY }; },
                                onTouchMove: (e) => { if (touchRef.current) touchRef.current.currentY = e.touches[0].clientY; },
                                onTouchEnd: () => {
                                    if (!touchRef.current) return;
                                    const dy = touchRef.current.currentY - touchRef.current.startY;
                                    const slots = Math.round(dy / 44); // ~44px per row
                                    if (slots !== 0) {
                                        const newIdx = Math.max(0, Math.min(tasks.length - 1, touchRef.current.idx + slots));
                                        setDragIdx(touchRef.current.idx);
                                        handleDrop(newIdx);
                                    }
                                    touchRef.current = null;
                                },
                            }} />
                    ))}
                    {/* Add task */}
                    {addingTask ? (
                        <div className="flex items-center gap-2 px-3 py-2">
                            <input autoFocus value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)}
                                placeholder="New task name..." className="flex-1 px-3 py-1.5 rounded-lg text-sm border border-[var(--accent)] bg-[var(--bg-card)] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') { setAddingTask(false); setNewTaskName(''); } }} />
                            <button onClick={handleAddTask} className="text-xs text-[var(--accent)] font-medium">Add</button>
                            <button onClick={() => { setAddingTask(false); setNewTaskName(''); }} className="text-xs text-[var(--text-muted)]">Cancel</button>
                        </div>
                    ) : (
                        <button onClick={() => setAddingTask(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-faint)] hover:text-[var(--accent)] hover:bg-[var(--bg-primary)] rounded-lg transition-colors">
                            <Plus className="w-3.5 h-3.5" /> Add task
                        </button>
                    )}
                </div>
            )}
            {/* Confirm dialogs */}
            {confirmDeletePhase && (
                <ConfirmDialog title="Delete Section" requireString="DELETE" message={`Delete "${phase.name}" and all its tasks? This action implies deletion.`}
                    onConfirm={() => { 
                        onQueueDeletePhase(phase.name, () => deletePhase.mutate({ id: phase.id, pursuitId })); 
                        setConfirmDeletePhase(false); 
                    }}
                    onCancel={() => setConfirmDeletePhase(false)} />
            )}
            {confirmDeleteTask && (
                <ConfirmDialog title="Delete Task" requireString="DELETE" message="Delete this task and all its sub-items? This action implies deletion."
                    onConfirm={() => { 
                        const tName = tasks.find(t => t.id === confirmDeleteTask)?.name || 'Task';
                        onQueueDeleteTask(confirmDeleteTask, tName, () => deleteTask.mutate({ id: confirmDeleteTask, pursuitId })); 
                        setConfirmDeleteTask(null); 
                    }}
                    onCancel={() => setConfirmDeleteTask(null)} />
            )}
        </div>
    );
}

// â”€â”€ Main ChecklistTab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ChecklistTab({ pursuitId }: { pursuitId: string }) {
    const { data: phases = [], isLoading: checklistLoading } = usePursuitChecklist(pursuitId);
    const { data: milestones = [], isLoading: milestonesLoading } = usePursuitMilestones(pursuitId);
    const { data: users = [] } = useUsers();
    const deleteInstance = useDeleteChecklistInstance();
    const [showApplyDialog, setShowApplyDialog] = useState(false);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [addingSection, setAddingSection] = useState(false);
    const [newSectionName, setNewSectionName] = useState('');
    const addPhase = useAddChecklistPhase();

    // Undo Snackbar State
    const [pendingDeletions, setPendingDeletions] = useState<Array<{ id: string; label: string; type: 'task' | 'phase' | 'reset'; targetId?: string; timeout: NodeJS.Timeout; execute: () => void; }>>([]);
    const [pendingTaskDeletes, setPendingTaskDeletes] = useState<Set<string>>(new Set());
    const [pendingPhaseDeletes, setPendingPhaseDeletes] = useState<Set<string>>(new Set());
    const [pendingReset, setPendingReset] = useState(false);

    const queueDeletion = (type: 'task' | 'phase' | 'reset', label: string, execute: () => void, targetId?: string) => {
        if (type === 'task' && targetId) setPendingTaskDeletes(prev => new Set(prev).add(targetId));
        if (type === 'phase' && targetId) setPendingPhaseDeletes(prev => new Set(prev).add(targetId));
        if (type === 'reset') setPendingReset(true);

        const id = Math.random().toString(36).substring(7);
        const timeout = setTimeout(() => {
            execute();
            setPendingDeletions(prev => prev.filter(p => p.id !== id));
        }, 7000); // 7 seconds to undo
        
        setPendingDeletions(prev => [...prev, { id, label, type, targetId, timeout, execute }]);
    };

    const undoDeletion = (id: string) => {
        const item = pendingDeletions.find(p => p.id === id);
        if (!item) return;
        
        clearTimeout(item.timeout);
        
        if (item.type === 'task' && item.targetId) setPendingTaskDeletes(prev => { const next = new Set(prev); next.delete(item.targetId!); return next; });
        if (item.type === 'phase' && item.targetId) setPendingPhaseDeletes(prev => { const next = new Set(prev); next.delete(item.targetId!); return next; });
        if (item.type === 'reset') setPendingReset(false);
        
        setPendingDeletions(prev => prev.filter(p => p.id !== id));
    };

    const handleAddSection = () => {
        if (!newSectionName.trim()) return;
        addPhase.mutate({ pursuitId, name: newSectionName.trim(), sortOrder: phases.length });
        setNewSectionName('');
        setAddingSection(false);
    };

    const hasChecklist = phases.length > 0;
    const isLoading = checklistLoading || milestonesLoading;

    // Apply pending local deletions for optimistic UI
    const displayPhases = pendingReset ? [] : phases.filter(p => !pendingPhaseDeletes.has(p.id)).map(p => ({
        ...p,
        tasks: (p.tasks || []).filter(t => !pendingTaskDeletes.has(t.id))
    }));

    const selectedTask = useMemo(() => {
        if (!selectedTaskId) return null;
        for (const phase of displayPhases) {
            const task = phase.tasks?.find(t => t.id === selectedTaskId);
            if (task) return task;
        }
        return null;
    }, [selectedTaskId, displayPhases]);

    const stats = useMemo(() => {
        const allTasks = displayPhases.flatMap(p => p.tasks ?? []);
        const applicable = allTasks.filter(t => t.status !== 'not_applicable');
        const completed = allTasks.filter(t => t.status === 'complete');
        const overdue = allTasks.filter(t => t.due_date && t.status !== 'complete' && t.status !== 'not_applicable' && daysUntil(t.due_date) < 0);
        const inProgress = allTasks.filter(t => t.status === 'in_progress');
        return { total: applicable.length, completed: completed.length, overdue: overdue.length, inProgress: inProgress.length };
    }, [displayPhases]);

    if (isLoading) {
        return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-faint)]" /></div>;
    }

    if (!hasChecklist) {
        return (
            <>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
                        <ClipboardList className="w-8 h-8 text-[var(--accent)]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No Checklist Yet</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-sm mb-6">Apply a template to create a structured checklist for this pursuit&apos;s pre-development lifecycle.</p>
                    <button onClick={() => setShowApplyDialog(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm">
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
                    <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
                    <span className="text-[var(--text-primary)] font-medium">{stats.completed}/{stats.total}</span>
                    <span className="text-[var(--text-muted)]">complete</span>
                </div>
                {stats.inProgress > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="w-4 h-4 text-[#3B82F6]" />
                        <span className="text-[var(--text-primary)] font-medium">{stats.inProgress}</span>
                        <span className="text-[var(--text-muted)]">in progress</span>
                    </div>
                )}
                {stats.overdue > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                        <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
                        <span className="text-[#EF4444] font-medium">{stats.overdue}</span>
                        <span className="text-[var(--text-muted)]">overdue</span>
                    </div>
                )}
                <div className="flex-1 hidden md:block">
                    <div className="w-full h-2 rounded-full bg-[var(--table-row-border)] overflow-hidden">
                        <div className="h-full rounded-full bg-[#10B981] transition-all" style={{ width: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%` }} />
                    </div>
                </div>
                <button onClick={() => setConfirmReset(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-faint)] hover:text-[#EF4444] hover:bg-[var(--bg-elevated)] transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
            </div>

            {/* Milestone Bar */}
            {milestones.length > 0 && <MilestoneBar pursuitId={pursuitId} milestones={milestones} />}

            {/* Phase Accordions */}
            <div className="space-y-3">
                {displayPhases.map(phase => (
                    <PhaseAccordion key={phase.id} phase={phase} pursuitId={pursuitId}
                        selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} users={users} 
                        onQueueDeletePhase={(label, execute) => queueDeletion('phase', label, execute, phase.id)}
                        onQueueDeleteTask={(targetId, label, execute) => queueDeletion('task', label, execute, targetId)}
                    />
                ))}
                {/* Add Section */}
                {addingSection ? (
                    <div className="flex items-center gap-2 p-3 bg-[var(--bg-card)] border border-[var(--accent)] rounded-xl shadow-sm">
                        <input autoFocus value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
                            placeholder="New section name..." className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-[var(--bg-primary)] focus:outline-none"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }} />
                        <button onClick={handleAddSection} className="text-sm px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg font-medium shadow-sm hover:bg-[var(--accent-hover)] transition-colors">Add</button>
                        <button onClick={() => { setAddingSection(false); setNewSectionName(''); }} className="text-sm px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] rounded-lg transition-colors">Cancel</button>
                    </div>
                ) : (
                    <button onClick={() => setAddingSection(true)}
                        className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-xl transition-all">
                        <Plus className="w-4 h-4" /> Add Section
                    </button>
                )}
            </div>

            {/* Task Detail Panel (slide-out) */}
            {selectedTask && (
                <>
                    <div className="fixed inset-0 bg-black/10 z-30" onClick={() => setSelectedTaskId(null)} />
                    <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTaskId(null)} />
                </>
            )}

            {/* Reset confirmation */}
            {confirmReset && (
                <ConfirmDialog title="Reset Checklist" requireString="DELETE"
                    message="This will delete the entire checklist including all tasks, notes, and progress."
                    onConfirm={() => { queueDeletion('reset', 'Entire Checklist', () => deleteInstance.mutate({ pursuitId })); setConfirmReset(false); setSelectedTaskId(null); }}
                    onCancel={() => setConfirmReset(false)} />
            )}

            {/* Undo Snackbars */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50">
                {pendingDeletions.map(del => (
                    <div key={del.id} className="flex items-center justify-between gap-6 px-5 py-3.5 bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl rounded-xl animate-fade-in shadow-black/20">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                            <strong className="font-semibold text-[var(--accent)]">{del.label}</strong> deleted
                        </span>
                        <button onClick={() => undoDeletion(del.id)} className="text-sm font-bold tracking-wide text-[#EF4444] hover:text-[#DC2626] transition-colors uppercase">Undo</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
