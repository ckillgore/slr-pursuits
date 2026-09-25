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
import { toast } from '@/lib/toast';

/** mutate() options that surface a failure as a toast instead of failing silently. */
function toastOnError(message: string) {
    return {
        onError: (err: unknown) => {
            console.error(`${message}:`, err);
            toast.error(message, err);
        },
    };
}

// ── Status Config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<ChecklistTaskStatus, { label: string; color: string; bgColor: string; Icon: any }> = {
    not_started: { label: 'Not Started', color: 'var(--text-faint)', bgColor: 'var(--bg-elevated)', Icon: Circle },
    in_progress: { label: 'In Progress', color: 'var(--accent)', bgColor: 'var(--accent-subtle)', Icon: Clock },
    in_review: { label: 'In Review', color: 'var(--warning)', bgColor: 'var(--warning-bg)', Icon: Eye },
    complete: { label: 'Complete', color: 'var(--success)', bgColor: 'var(--success-bg)', Icon: CheckCircle2 },
    not_applicable: { label: 'N/A', color: 'var(--text-muted)', bgColor: 'var(--bg-elevated)', Icon: Ban },
    blocked: { label: 'Blocked', color: 'var(--danger)', bgColor: 'var(--danger-bg)', Icon: XCircle },
};

const ALL_STATUSES: ChecklistTaskStatus[] = ['not_started', 'in_progress', 'in_review', 'complete', 'not_applicable', 'blocked'];

// ── Helpers ───────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
    // Local-midnight parse; tolerate values that already carry a time component
    const d = new Date(dateStr.split('T')[0] + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
    return new Date(dateStr.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ── Confirmation Dialog ───────────────────────────────────────
function ConfirmDialog({ title, message, requireString, onConfirm, onCancel }: {
    title: string; message: string; requireString?: string; onConfirm: () => void; onCancel: () => void;
}) {
    const [inputVal, setInputVal] = useState('');
    const isValid = requireString ? inputVal === requireString : true;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm px-4">
            <div role="alertdialog" aria-modal="true" aria-label={title} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in">
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-muted)] mb-5">{message}</p>
                
                {requireString && (
                    <div className="mb-5">
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                            Type <strong className="text-[var(--text-primary)]">{requireString}</strong> to confirm
                        </label>
                        <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--bg-elevated)] focus:outline-none focus:ring-1 focus:ring-[var(--danger)] focus:border-[var(--danger)]"
                            value={inputVal}
                            onChange={(e) => setInputVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && isValid) onConfirm(); if (e.key === 'Escape') onCancel(); }}
                            placeholder={requireString}
                            aria-label={`Type ${requireString} to confirm`}
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
                                ? 'bg-[var(--danger)] hover:opacity-90 text-white' 
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

// ── Apply Template Dialog ─────────────────────────────────────
function ApplyTemplateDialog({ pursuitId, onClose }: { pursuitId: string; onClose: () => void }) {
    const { data: templates = [], isLoading } = useChecklistTemplates();
    const applyMutation = useApplyTemplate();
    const activeTemplates = templates.filter(t => t.is_active);
    const defaultTemplate = activeTemplates.find(t => t.is_default);
    const [selectedId, setSelectedId] = useState<string>(defaultTemplate?.id ?? '');
    if (!selectedId && defaultTemplate) setSelectedId(defaultTemplate.id);

    const handleApply = () => {
        if (!selectedId) return;
        applyMutation.mutate({ pursuitId, templateId: selectedId }, { onSuccess: () => onClose(), ...toastOnError('Failed to apply template') });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm px-4">
            <div role="dialog" aria-modal="true" aria-label="Apply checklist template" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Apply Checklist Template</h2>
                <p className="text-sm text-[var(--text-muted)] mb-5">Select a template to create the checklist for this pursuit.</p>
                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" /></div>
                ) : activeTemplates.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] py-6 text-center">No active templates. Create one in Admin → Checklist Templates.</p>
                ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {activeTemplates.map(t => (
                            <button key={t.id} onClick={() => setSelectedId(t.id)} aria-pressed={selectedId === t.id}
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

// ── Milestone Bar ─────────────────────────────────────────────
function MilestoneBar({ pursuitId, milestones }: { pursuitId: string; milestones: PursuitMilestone[] }) {
    const upsertMilestone = useUpsertMilestone();
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl mb-4">
            <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-primary)] rounded-xl transition-colors">
                <span className="flex items-center gap-2"><Flag className="w-4 h-4 text-[var(--warning)]" /> Milestones</span>
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
                            {/* Uncontrolled + save on blur: saving on every change fires on each keystroke of a
                                typed date (e.g. year 0002) and the server-controlled value jumps while typing */}
                            <input type="date" key={`${m.id}-${m.target_date ?? ''}`} defaultValue={m.target_date ?? ''}
                                aria-label={`${m.milestone_label} target date`}
                                onBlur={(e) => {
                                    const v = e.target.value || null;
                                    if (v !== (m.target_date ?? null)) upsertMilestone.mutate({ id: m.id, target_date: v, pursuit_id: pursuitId }, toastOnError(`Failed to save ${m.milestone_label} date`));
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                className={`px-2 py-1.5 rounded-md text-sm border ${m.target_date ? (m.is_confirmed ? 'border-[var(--success)]' : 'border-dashed border-[var(--warning)]') : 'border-[var(--border)]'} bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none`} />
                            <button onClick={() => upsertMilestone.mutate({ id: m.id, is_confirmed: !m.is_confirmed, pursuit_id: pursuitId }, toastOnError(`Failed to update ${m.milestone_label}`))}
                                aria-pressed={m.is_confirmed}
                                title={m.is_confirmed ? 'Confirmed — click to mark as estimated' : 'Estimated — click to mark as confirmed'}
                                className={`text-[10px] uppercase tracking-wider font-semibold self-start px-2 py-0.5 rounded-full transition-colors ${m.is_confirmed ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--warning-bg)] text-[var(--warning)]'}`}>
                                {m.is_confirmed ? '✓ Confirmed' : 'Estimated'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Task Card ───────────────────────────────────────────────
function TaskCard({
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
        <div draggable className={`group/task flex items-center gap-1 px-1 py-0.5 rounded-lg transition-all ${isSelected ? 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]/30' : ''}`}
            onDragStart={dragHandlers.onDragStart} onDragOver={dragHandlers.onDragOver} onDrop={dragHandlers.onDrop} onDragEnd={dragHandlers.onDragEnd}
            onTouchStart={dragHandlers.onTouchStart} onTouchMove={dragHandlers.onTouchMove} onTouchEnd={dragHandlers.onTouchEnd}>
            <div className="cursor-grab active:cursor-grabbing p-1 text-[var(--text-faint)] hover:text-[var(--text-muted)] touch-none" title="Drag to reorder" aria-hidden="true">
                <GripVertical className="w-3.5 h-3.5" />
            </div>
            <button onClick={onClick} className="flex-1 text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--bg-primary)] transition-all min-w-0">
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center" style={{ color: cfg.color }}>
                    <cfg.Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--text-primary)] truncate">{task.name}</span>
                        {task.is_critical_path && <span className="flex-shrink-0 text-[9px] uppercase tracking-wider font-bold text-[var(--danger)] bg-[var(--danger-bg)] px-1 py-0.5 rounded">Critical</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                        {task.due_date && (
                            <span className={`text-[11px] flex items-center gap-0.5 ${overdue ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text-muted)]'}`}>
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
                aria-label={`Delete task ${task.name}`}
                title="Delete task"
                className="p-1 text-[var(--text-faint)] hover:text-[var(--danger)] opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 transition-all flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// ── Phase Accordion ───────────────────────────────────────────
function PhaseAccordion({
    phase, pursuitId, selectedTaskId, onSelectTask, users,
    onQueueDeletePhase, onQueueDeleteTask
}: {
    phase: PursuitChecklistPhase; pursuitId: string;
    selectedTaskId: string | null; onSelectTask: (taskId: string) => void;
    users: UserProfile[];
    onQueueDeletePhase: (label: string, execute: () => Promise<unknown>) => void;
    onQueueDeleteTask: (taskId: string, label: string, execute: () => Promise<unknown>) => void;
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
        const name = newTaskName.trim();
        addTask.mutate({ phaseId: phase.id, pursuitId, task: { name, sort_order: tasks.length } }, toastOnError(`Failed to add task "${name}"`));
        setNewTaskName('');
        setAddingTask(false);
    };

    // Drag state for reorder
    // `fromIdx` is passed explicitly by the touch path, where the dragIdx state set in the
    // same handler isn't visible yet (stale closure) and the reorder was silently dropped.
    const handleDrop = (targetIdx: number, fromIdx: number | null = dragIdx) => {
        if (fromIdx === null || fromIdx === targetIdx) return;
        const ordered = [...tasks];
        const [moved] = ordered.splice(fromIdx, 1);
        ordered.splice(targetIdx, 0, moved);
        reorderTasks.mutate({ phaseId: phase.id, orderedIds: ordered.map(t => t.id), pursuitId }, toastOnError('Failed to reorder tasks'));
        setDragIdx(null);
    };

    // Touch drag state
    const touchRef = useRef<{ idx: number; startY: number; currentY: number } | null>(null);

    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-primary)] transition-colors">
                <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: phase.color || 'var(--text-faint)' }} />
                    <span className="text-sm font-semibold text-[var(--text-primary)] flex-1 text-left">{phase.name}</span>
                </button>
                <div className="flex items-center gap-3">
                    <span className="sm:hidden text-xs text-[var(--text-muted)] tabular-nums">{completedCount}/{applicableCount}</span>
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-[var(--table-row-border)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--success)] transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums w-16">{completedCount}/{applicableCount}</span>
                    </div>
                    <div className="relative">
                        <button onClick={() => setShowPhaseMenu(!showPhaseMenu)} aria-label={`${phase.name} section actions`} aria-haspopup="menu" aria-expanded={showPhaseMenu}
                            onKeyDown={(e) => { if (e.key === 'Escape') setShowPhaseMenu(false); }}
                            className="p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                            <MoreVertical className="w-4 h-4" />
                        </button>
                        {showPhaseMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowPhaseMenu(false)} />
                                <div role="menu" className="absolute right-0 top-8 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg py-1 w-44">
                                    <button role="menuitem" onClick={() => { setShowPhaseMenu(false); setConfirmDeletePhase(true); }}
                                        className="w-full text-left px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--bg-primary)] flex items-center gap-2">
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
                                onDragStart: (e) => {
                                    // Firefox won't start a drag without data set
                                    e.dataTransfer.setData('text/plain', task.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    setDragIdx(idx);
                                },
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
                                        handleDrop(newIdx, touchRef.current.idx);
                                    }
                                    touchRef.current = null;
                                },
                            }} />
                    ))}
                    {/* Add task */}
                    {addingTask ? (
                        <div className="flex items-center gap-2 px-3 py-2">
                            <input autoFocus value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)}
                                placeholder="New task name..." aria-label="New task name" className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-sm border border-[var(--accent)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') { setAddingTask(false); setNewTaskName(''); } }} />
                            <button onClick={handleAddTask} disabled={!newTaskName.trim()} className="text-xs text-[var(--accent)] font-medium disabled:opacity-50">Add</button>
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
                <ConfirmDialog title="Delete Section" requireString="DELETE" message={`Delete "${phase.name}" and all its tasks? You'll have a few seconds to undo.`}
                    onConfirm={() => { 
                        onQueueDeletePhase(phase.name, () => deletePhase.mutateAsync({ id: phase.id, pursuitId })); 
                        setConfirmDeletePhase(false); 
                    }}
                    onCancel={() => setConfirmDeletePhase(false)} />
            )}
            {confirmDeleteTask && (
                <ConfirmDialog title="Delete Task" requireString="DELETE" message="Delete this task and all its sub-items? You'll have a few seconds to undo."
                    onConfirm={() => { 
                        const tName = tasks.find(t => t.id === confirmDeleteTask)?.name || 'Task';
                        const taskId = confirmDeleteTask;
                        onQueueDeleteTask(taskId, tName, () => deleteTask.mutateAsync({ id: taskId, pursuitId })); 
                        setConfirmDeleteTask(null); 
                    }}
                    onCancel={() => setConfirmDeleteTask(null)} />
            )}
        </div>
    );
}

// ── Main ChecklistTab ─────────────────────────────────────────
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
    const [pendingDeletions, setPendingDeletions] = useState<Array<{ id: string; label: string; type: 'task' | 'phase' | 'reset'; targetId?: string; timeout: NodeJS.Timeout; execute: () => Promise<unknown>; }>>([]);
    const [pendingTaskDeletes, setPendingTaskDeletes] = useState<Set<string>>(new Set());
    const [pendingPhaseDeletes, setPendingPhaseDeletes] = useState<Set<string>>(new Set());
    const [pendingReset, setPendingReset] = useState(false);

    // Un-hide an item whose deletion was undone or failed
    const clearPendingFlag = (type: 'task' | 'phase' | 'reset', targetId?: string) => {
        if (type === 'task' && targetId) setPendingTaskDeletes(prev => { const next = new Set(prev); next.delete(targetId); return next; });
        if (type === 'phase' && targetId) setPendingPhaseDeletes(prev => { const next = new Set(prev); next.delete(targetId); return next; });
        if (type === 'reset') setPendingReset(false);
    };

    const queueDeletion = (type: 'task' | 'phase' | 'reset', label: string, execute: () => Promise<unknown>, targetId?: string) => {
        if (type === 'task' && targetId) setPendingTaskDeletes(prev => new Set(prev).add(targetId));
        if (type === 'phase' && targetId) setPendingPhaseDeletes(prev => new Set(prev).add(targetId));
        if (type === 'reset') setPendingReset(true);

        const id = Math.random().toString(36).substring(7);
        const timeout = setTimeout(() => {
            execute().catch((err) => {
                console.error(`Failed to delete ${label}:`, err);
                clearPendingFlag(type, targetId);
                toast.error(`Failed to delete "${label}". It has been restored`, err);
            });
            setPendingDeletions(prev => prev.filter(p => p.id !== id));
        }, 7000); // 7 seconds to undo
        
        setPendingDeletions(prev => [...prev, { id, label, type, targetId, timeout, execute }]);
    };

    const undoDeletion = (id: string) => {
        const item = pendingDeletions.find(p => p.id === id);
        if (!item) return;
        
        clearTimeout(item.timeout);

        clearPendingFlag(item.type, item.targetId);
        
        setPendingDeletions(prev => prev.filter(p => p.id !== id));
    };

    const handleAddSection = () => {
        if (!newSectionName.trim()) return;
        const name = newSectionName.trim();
        addPhase.mutate({ pursuitId, name, sortOrder: phases.length }, toastOnError(`Failed to add section "${name}"`));
        setNewSectionName('');
        setAddingSection(false);
    };

    // Once an executed reset has been refetched (checklist now empty), drop the local "hide
    // everything" flag — otherwise a template applied afterwards stays invisible until remount.
    const resetQueued = pendingDeletions.some(p => p.type === 'reset');
    useEffect(() => {
        if (pendingReset && !resetQueued && phases.length === 0) setPendingReset(false);
    }, [pendingReset, resetQueued, phases.length]);
    // Navigating to another pursuit reuses this component; don't carry a pending reset over
    useEffect(() => { setPendingReset(false); }, [pursuitId]);

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
                        <Clock className="w-4 h-4 text-[var(--accent)]" />
                        <span className="text-[var(--text-primary)] font-medium">{stats.inProgress}</span>
                        <span className="text-[var(--text-muted)]">in progress</span>
                    </div>
                )}
                {stats.overdue > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                        <AlertTriangle className="w-4 h-4 text-[var(--danger)]" />
                        <span className="text-[var(--danger)] font-medium">{stats.overdue}</span>
                        <span className="text-[var(--text-muted)]">overdue</span>
                    </div>
                )}
                <div className="flex-1 hidden md:block">
                    <div className="w-full h-2 rounded-full bg-[var(--table-row-border)] overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--success)] transition-all" style={{ width: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%` }} />
                    </div>
                </div>
                <button onClick={() => setConfirmReset(true)} title="Delete this pursuit's entire checklist"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--bg-elevated)] transition-colors">
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
                            placeholder="New section name..." aria-label="New section name" className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }} />
                        <button onClick={handleAddSection} disabled={!newSectionName.trim()} className="disabled:opacity-50 text-sm px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg font-medium shadow-sm hover:bg-[var(--accent-hover)] transition-colors">Add</button>
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
                    onConfirm={() => { queueDeletion('reset', 'Entire Checklist', () => deleteInstance.mutateAsync({ pursuitId })); setConfirmReset(false); setSelectedTaskId(null); }}
                    onCancel={() => setConfirmReset(false)} />
            )}

            {/* Undo Snackbars */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 w-[calc(100%-2rem)] max-w-md" role="status" aria-live="polite">
                {pendingDeletions.map(del => (
                    <div key={del.id} className="flex items-center justify-between gap-6 px-5 py-3.5 bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl rounded-xl animate-fade-in shadow-black/20">
                        <span className="text-sm font-medium text-[var(--text-primary)] min-w-0 truncate">
                            <strong className="font-semibold text-[var(--accent)]">{del.label}</strong> deleted
                        </span>
                        <button onClick={() => undoDeletion(del.id)} className="text-sm font-bold tracking-wide text-[var(--accent)] hover:opacity-80 transition-colors uppercase shrink-0">Undo</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
