import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    ClipboardList,
    MessageSquare,
    Activity,
    Plus,
    X,
    ExternalLink,
    LinkIcon
} from 'lucide-react';
import {
    useUpdateChecklistTask,
    useToggleChecklistItem,
    useAddChecklistItem,
    useDeleteChecklistItem,
    useTaskNotes,
    useCreateTaskNote,
    useTaskActivity,
    useUsers,
    usePursuitTeamMembers,
    useExternalTaskParties,
    usePursuitMilestones,
} from '@/hooks/useSupabaseQueries';
import type { PursuitChecklistTask, ChecklistTaskStatus, TaskNote, TaskActivityLog } from '@/types';

// Constants
const ALL_STATUSES: ChecklistTaskStatus[] = ['not_applicable', 'not_started', 'in_progress', 'complete'];
const STATUS_CONFIG: Record<ChecklistTaskStatus, { label: string; color: string; bg: string }> = {
    not_applicable: { label: 'N/A', color: 'var(--text-faint)', bg: 'var(--bg-primary)' },
    not_started: { label: 'Not Started', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
    in_progress: { label: 'In Progress', color: '#3B82F6', bg: '#EFF6FF' },
    complete: { label: 'Complete', color: 'var(--success)', bg: 'var(--success-bg)' },
};

function daysUntil(dateString: string) {
    const d = new Date(dateString + 'T00:00:00');
    const now = new Date();
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function timeAgo(dateString: string) {
    const s = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    let interval = s / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    interval = s / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    interval = s / 86400;
    if (interval > 1) return Math.floor(interval) + 'd ago';
    interval = s / 3600;
    if (interval > 1) return Math.floor(interval) + 'h ago';
    interval = s / 60;
    if (interval > 1) return Math.floor(interval) + 'm ago';
    return Math.floor(s) + 's ago';
}

function formatDate(dateStr: string) {
    try { return format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy'); } 
    catch { return dateStr; }
}

export function TaskDetailPanel({
    task,
    onClose,
}: {
    task: PursuitChecklistTask;
    onClose: () => void;
}) {
    const pursuitId = task.pursuit_id;
    const { data: milestones = [] } = usePursuitMilestones(pursuitId);
    
    const updateTask = useUpdateChecklistTask();
    const toggleItem = useToggleChecklistItem();
    const addItem = useAddChecklistItem();
    const deleteItem = useDeleteChecklistItem();
    const { data: notes = [] } = useTaskNotes(task.id);
    const createNote = useCreateTaskNote();
    const { data: activity = [] } = useTaskActivity(task.id);
    const { data: users = [] } = useUsers();
    const { data: teamMembers = [] } = usePursuitTeamMembers(pursuitId);
    const { data: externalParties = [] } = useExternalTaskParties();
    
    const [noteText, setNoteText] = useState('');
    const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'activity'>('details');
    const [newItemLabel, setNewItemLabel] = useState('');
    const [addingItem, setAddingItem] = useState(false);
    const [descText, setDescText] = useState(task.description ?? '');
    const [dueDateMode, setDueDateMode] = useState<'fixed' | 'relative'>(task.due_date_is_manual || !task.relative_milestone ? 'fixed' : 'relative');
    const [boxUrl, setBoxUrl] = useState('');
    const [boxLabel, setBoxLabel] = useState('');
    const [addingLink, setAddingLink] = useState(false);

    // Sync description when task changes
    useEffect(() => { setDescText(task.description ?? ''); }, [task.id, task.description]);

    const cfg = STATUS_CONFIG[task.status];
    const overdue = task.due_date && task.status !== 'complete' && task.status !== 'not_applicable' && daysUntil(task.due_date) < 0;

    const handleSaveDescription = () => {
        if (descText !== (task.description ?? '')) {
            updateTask.mutate({ taskId: task.id, pursuitId, updates: { description: descText || null } });
        }
    };

    const handleAddItem = () => {
        if (!newItemLabel.trim()) return;
        addItem.mutate({ taskId: task.id, label: newItemLabel.trim(), sortOrder: (task.checklist_items?.length ?? 0), pursuitId });
        setNewItemLabel('');
        setAddingItem(false);
    };

    const handleSubmitNote = () => {
        if (!noteText.trim()) return;
        createNote.mutate({ taskId: task.id, content: noteText.trim() });
        setNoteText('');
    };

    const handleFixedDateChange = (date: string) => {
        updateTask.mutate({ taskId: task.id, pursuitId, updates: {
            due_date: date || null, due_date_is_manual: true, relative_milestone: null, relative_due_days: null,
        }});
    };

    const handleRelativeDateChange = (milestone: string, days: number) => {
        updateTask.mutate({ taskId: task.id, pursuitId, updates: {
            relative_milestone: milestone, relative_due_days: days, due_date_is_manual: false,
        }});
    };

    const handleClearDueDate = () => {
        updateTask.mutate({ taskId: task.id, pursuitId, updates: {
            due_date: null, due_date_is_manual: false, relative_milestone: null, relative_due_days: null,
        }});
    };

    const isValidBoxUrl = (url: string) => /^https:\/\/(app\.)?box\.com\//i.test(url);

    const handleAddBoxLink = () => {
        if (!boxUrl.trim() || !isValidBoxUrl(boxUrl)) return;
        const links = [...(task.box_links ?? []), { url: boxUrl.trim(), label: boxLabel.trim() || 'Box File', added_at: new Date().toISOString() }];
        updateTask.mutate({ taskId: task.id, pursuitId, updates: { box_links: links } });
        setBoxUrl(''); setBoxLabel(''); setAddingLink(false);
    };

    const handleRemoveBoxLink = (idx: number) => {
        const links = (task.box_links ?? []).filter((_, i) => i !== idx);
        updateTask.mutate({ taskId: task.id, pursuitId, updates: { box_links: links } });
    };

    // Compute relative date preview
    const relativePreview = useMemo(() => {
        if (!task.relative_milestone) return null;
        const ms = milestones.find(m => m.milestone_key === task.relative_milestone);
        if (!ms?.target_date || task.relative_due_days == null) return 'Set milestone date first';
        const d = new Date(ms.target_date + 'T00:00:00');
        d.setDate(d.getDate() + task.relative_due_days);
        return formatDate(d.toISOString().split('T')[0]);
    }, [task.relative_milestone, task.relative_due_days, milestones]);

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-[var(--bg-card)] border-l border-[var(--border)] shadow-xl z-40 flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex-1 min-w-0 pr-3">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">{task.name}</h3>
                    {task.is_critical_path && (
                        <span className="inline-block mt-1 text-[9px] uppercase tracking-wider font-bold text-[#EF4444] bg-[var(--danger-bg)] px-1.5 py-0.5 rounded">Critical Path</span>
                    )}
                </div>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Status & Metadata */}
            <div className="px-5 py-3 border-b border-[var(--table-row-border)] space-y-3">
                {/* Status dropdown */}
                <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-16">Status</label>
                    <select value={task.status}
                        onChange={(e) => updateTask.mutate({ taskId: task.id, pursuitId, updates: { status: e.target.value as ChecklistTaskStatus } })}
                        className="flex-1 px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none"
                        style={{ color: cfg.color }}>
                        {ALL_STATUSES.map(s => <option key={s} value={s} style={{ color: STATUS_CONFIG[s].color }}>{STATUS_CONFIG[s].label}</option>)}
                    </select>
                </div>

                {/* Assignee */}
                <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-16">Assign</label>
                    <select 
                        value={
                            task.assigned_to_type === 'external' ? `external:${task.assigned_external_party_id}` 
                            : task.assigned_to ? `internal:${task.assigned_to}` 
                            : ''
                        }
                        onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                                updateTask.mutate({ taskId: task.id, pursuitId, updates: { 
                                    assigned_to: null, assigned_external_party_id: null, assigned_to_type: 'internal' 
                                }});
                            } else if (val.startsWith('internal:')) {
                                updateTask.mutate({ taskId: task.id, pursuitId, updates: { 
                                    assigned_to: val.replace('internal:', ''), assigned_external_party_id: null, assigned_to_type: 'internal' 
                                }});
                            } else if (val.startsWith('external:')) {
                                updateTask.mutate({ taskId: task.id, pursuitId, updates: { 
                                    assigned_to: null, assigned_external_party_id: val.replace('external:', ''), assigned_to_type: 'external' 
                                }});
                            }
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none text-[var(--text-primary)]">
                        <option value="">Unassigned</option>
                        {teamMembers.length > 0 && (
                            <optgroup label="Deal Team">
                                {teamMembers.map((tm: any) => (
                                    <option key={tm.id} value={`internal:${tm.user_id}`}>{tm.user?.full_name} ({tm.role})</option>
                                ))}
                            </optgroup>
                        )}
                        <optgroup label="All Internal Users">
                            {users.filter((u: any) => u.is_active && !teamMembers.some((tm: any) => tm.user_id === u.id)).map((u: any) => (
                                <option key={u.id} value={`internal:${u.id}`}>{u.full_name}</option>
                            ))}
                        </optgroup>
                        {externalParties.length > 0 && (
                            <optgroup label="External Parties">
                                {externalParties.map((ep: any) => (
                                    <option key={ep.id} value={`external:${ep.id}`}>{ep.name} {ep.company ? `(${ep.company})` : ''}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>

                {/* Due Date */}
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-16">Due</label>
                        <div className="flex gap-1">
                            <button onClick={() => setDueDateMode('fixed')}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${dueDateMode === 'fixed' ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                                Fixed
                            </button>
                            <button onClick={() => setDueDateMode('relative')}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${dueDateMode === 'relative' ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                                Relative
                            </button>
                            {task.due_date && (
                                <button onClick={handleClearDueDate} className="px-2 py-1 rounded text-xs text-[var(--text-faint)] hover:text-[#EF4444] transition-colors">Clear</button>
                            )}
                        </div>
                    </div>
                    {dueDateMode === 'fixed' ? (
                        <div className="ml-[76px]">
                            <input type="date" value={task.due_date_is_manual ? (task.due_date ?? '') : ''}
                                onChange={(e) => handleFixedDateChange(e.target.value)}
                                className="px-2 py-1.5 rounded-md text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none w-full" />
                            {task.due_date && overdue && <p className="text-xs text-[#EF4444] mt-1 font-medium">{Math.abs(daysUntil(task.due_date))} days overdue</p>}
                        </div>
                    ) : (
                        <div className="ml-[76px] space-y-2">
                            <select value={task.relative_milestone ?? ''}
                                onChange={(e) => handleRelativeDateChange(e.target.value, task.relative_due_days ?? 0)}
                                className="w-full px-2 py-1.5 rounded-md text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none">
                                <option value="">Select milestone...</option>
                                {milestones.map((m: any) => <option key={m.milestone_key} value={m.milestone_key}>{m.milestone_label}</option>)}
                            </select>
                            {task.relative_milestone && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--text-muted)]">Offset:</span>
                                    <input type="number" value={task.relative_due_days ?? 0}
                                        onChange={(e) => handleRelativeDateChange(task.relative_milestone!, parseInt(e.target.value) || 0)}
                                        className="w-20 px-2 py-1 rounded-md text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:outline-none text-center" />
                                    <span className="text-xs text-[var(--text-muted)]">days</span>
                                    {relativePreview && <span className="text-xs text-[var(--text-secondary)] ml-auto">â†’ {relativePreview}</span>}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Magic Link Portal (External Only) */}
                {task.assigned_to_type === 'external' && (
                    <div className="pt-3 mt-3 border-t border-[var(--border)] space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-medium text-[var(--text-primary)]">External Task Portal</h4>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">Allow the assignee to update this task without logging in.</p>
                            </div>
                            <button 
                                onClick={() => updateTask.mutate({ taskId: task.id, pursuitId, updates: { external_portal_enabled: !task.external_portal_enabled }})}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${task.external_portal_enabled ? 'bg-[#10B981]' : 'bg-[var(--border)]'}`}>
                                <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${task.external_portal_enabled ? 'translate-x-2' : '-translate-x-2'}`} />
                            </button>
                        </div>
                        
                        {task.external_portal_enabled && task.external_portal_token && (
                            <div className="flex items-center gap-2 p-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg">
                                <code className="flex-1 text-xs text-[var(--text-secondary)] truncate">
                                    {typeof window !== 'undefined' ? `${window.location.origin}/portal/task/${task.external_portal_token}` : ''}
                                </code>
                                <button 
                                    onClick={() => {
                                        if (typeof window !== 'undefined') {
                                            navigator.clipboard.writeText(`${window.location.origin}/portal/task/${task.external_portal_token}`);
                                        }
                                    }}
                                    className="px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] rounded transition-colors whitespace-nowrap">
                                    Copy Link
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] px-5">
                {[
                    { key: 'details' as const, label: 'Details', Icon: ClipboardList },
                    { key: 'notes' as const, label: `Notes (${notes.length})`, Icon: MessageSquare },
                    { key: 'activity' as const, label: 'Activity', Icon: Activity },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.key
                            ? 'border-[var(--accent)] text-[var(--accent)]'
                            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                        <tab.Icon className="w-3.5 h-3.5" /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
                {activeTab === 'details' && (
                    <div className="space-y-4">
                        {/* Description (editable) */}
                        <div>
                            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Description</h4>
                            <textarea value={descText} onChange={(e) => setDescText(e.target.value)} onBlur={handleSaveDescription}
                                placeholder="Add a description..."
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none resize-none text-[var(--text-primary)] placeholder:text-[var(--text-faint)]" />
                        </div>

                        {/* Box Links */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Links</h4>
                                <button onClick={() => setAddingLink(!addingLink)} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-0.5">
                                    <Plus className="w-3 h-3" /> Add Link
                                </button>
                            </div>
                            {addingLink && (
                                <div className="space-y-2 mb-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--table-row-border)]">
                                    <input value={boxLabel} onChange={(e) => setBoxLabel(e.target.value)} placeholder="Label (optional)"
                                        className="w-full px-2 py-1.5 rounded-md text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:outline-none" />
                                    <input value={boxUrl} onChange={(e) => setBoxUrl(e.target.value)} placeholder="https://app.box.com/..."
                                        className={`w-full px-2 py-1.5 rounded-md text-sm border bg-[var(--bg-card)] focus:outline-none ${boxUrl && !isValidBoxUrl(boxUrl) ? 'border-[#EF4444]' : 'border-[var(--border)] focus:border-[var(--accent)]'}`}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddBoxLink(); if (e.key === 'Escape') setAddingLink(false); }} />
                                    {boxUrl && !isValidBoxUrl(boxUrl) && <p className="text-[10px] text-[#EF4444]">Must be a Box URL (app.box.com or box.com)</p>}
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setAddingLink(false)} className="text-xs text-[var(--text-muted)]">Cancel</button>
                                        <button onClick={handleAddBoxLink} disabled={!boxUrl || !isValidBoxUrl(boxUrl)}
                                            className="text-xs text-[var(--accent)] font-medium disabled:opacity-40">Save</button>
                                    </div>
                                </div>
                            )}
                            {(task.box_links ?? []).length > 0 ? (
                                <div className="space-y-1">
                                    {(task.box_links ?? []).map((link, i) => (
                                        <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[var(--bg-primary)] border border-[var(--table-row-border)] group">
                                            <LinkIcon className="w-3.5 h-3.5 text-[var(--text-faint)] flex-shrink-0" />
                                            <a href={link.url} target="_blank" rel="noopener noreferrer"
                                                className="text-sm text-[var(--accent)] hover:underline truncate flex-1">{link.label}</a>
                                            <ExternalLink className="w-3 h-3 text-[var(--text-faint)]" />
                                            <button onClick={() => handleRemoveBoxLink(i)} className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-faint)] hover:text-[#EF4444] transition-all">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : !addingLink && (
                                <p className="text-xs text-[var(--text-faint)]">No links attached.</p>
                            )}
                        </div>

                        {/* Checklist Items */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                                    Checklist ({task.checklist_items?.filter(i => i.is_checked).length ?? 0}/{task.checklist_items?.length ?? 0})
                                </h4>
                                <button onClick={() => setAddingItem(true)} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-0.5">
                                    <Plus className="w-3 h-3" /> Add Item
                                </button>
                            </div>
                            <div className="space-y-1">
                                {(task.checklist_items ?? []).map(item => (
                                    <div key={item.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-primary)] group transition-colors">
                                        <input type="checkbox" checked={item.is_checked}
                                            onChange={() => toggleItem.mutate({ itemId: item.id, isChecked: !item.is_checked, pursuitId })}
                                            className="mt-0.5 w-4 h-4 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/20" />
                                        <span className={`text-sm flex-1 ${item.is_checked ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text-primary)]'}`}>
                                            {item.label}
                                        </span>
                                        <button onClick={() => deleteItem.mutate({ id: item.id, pursuitId })}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-faint)] hover:text-[#EF4444] transition-all">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {addingItem && (
                                    <div className="flex items-center gap-2 px-2 py-1">
                                        <input autoFocus value={newItemLabel} onChange={(e) => setNewItemLabel(e.target.value)}
                                            placeholder="New item..."
                                            className="flex-1 px-2 py-1 rounded text-sm border border-[var(--accent)] bg-[var(--bg-card)] focus:outline-none"
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); if (e.key === 'Escape') { setAddingItem(false); setNewItemLabel(''); } }} />
                                        <button onClick={handleAddItem} className="text-xs text-[var(--accent)] font-medium">Add</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Milestone Reference */}
                        {task.relative_milestone && (
                            <div className="text-xs text-[var(--text-muted)]">
                                Due date: {task.relative_due_days !== null ? `${task.relative_due_days > 0 ? '+' : ''}${task.relative_due_days} days from` : 'relative to'} <span className="font-medium">{task.relative_milestone.replace(/_/g, ' ')}</span>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'notes' && (
                    <div className="space-y-3">
                        {notes.length === 0 && <p className="text-sm text-[var(--text-faint)] text-center py-6">No notes yet. Add a note below.</p>}
                        {notes.map((note: TaskNote) => (
                            <div key={note.id} className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--table-row-border)]">
                                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{note.content}</p>
                                <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-faint)]">
                                    <span>{timeAgo(note.created_at)}</span>
                                </div>
                            </div>
                        ))}
                        <div className="mt-4 flex flex-col gap-2">
                            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                                placeholder="Add a note..." rows={2}
                                className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--bg-card)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 focus:outline-none resize-none" />
                            <button onClick={handleSubmitNote} disabled={!noteText.trim() || createNote.isPending}
                                className="self-end px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors">
                                Post Note
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="space-y-2">
                        {activity.length === 0 && <p className="text-sm text-[var(--text-faint)] text-center py-6">No activity recorded yet.</p>}
                        {activity.map((entry: TaskActivityLog) => (
                            <div key={entry.id} className="flex items-start gap-2 text-xs text-[var(--text-muted)] py-1">
                                <Activity className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span>
                                    <span className="font-medium text-[var(--text-secondary)]">{entry.action.replace(/_/g, ' ')}</span>
                                    {entry.new_value && typeof entry.new_value === 'object' && 'status' in entry.new_value && (
                                        <span> â†’ {String(entry.new_value.status).replace(/_/g, ' ')}</span>
                                    )}
                                    <span className="ml-2 text-[var(--text-faint)]">{timeAgo(entry.created_at)}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
