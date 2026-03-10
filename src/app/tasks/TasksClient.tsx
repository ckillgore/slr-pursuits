'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useMyTasks } from '@/hooks/useSupabaseQueries';
import { TaskDetailPanel } from '@/components/shared/TaskDetailPanel';
import { CheckSquare, Calendar, Building2, Clock, AlertCircle } from 'lucide-react';
import type { PursuitChecklistTask, PursuitMilestone } from '@/types';
import { STATUS_CONFIG } from '@/lib/constants';

export function TasksClient() {
    const { profile } = useAuth();
    const { data: tasks = [], isLoading } = useMyTasks(profile?.id);
    const [selectedTask, setSelectedTask] = useState<PursuitChecklistTask | null>(null);

    // Sort tasks: Incomplete first, then by due date. Overdue at the top.
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.status !== 'complete' && b.status === 'complete') return -1;
        if (a.status === 'complete' && b.status !== 'complete') return 1;
        
        if (!a.due_date && b.due_date) return 1;
        if (a.due_date && !b.due_date) return -1;
        if (!a.due_date && !b.due_date) return 0;
        
        return new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime();
    });

    const daysUntil = (dateStr: string) => {
        const target = new Date(dateStr);
        target.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
    };

    if (isLoading) {
        return (
            <div className="flex-1 h-[calc(100vh-3.5rem)] flex items-center justify-center bg-[var(--bg-primary)]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="flex-none px-6 py-5 bg-[var(--bg-nav)] border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                        <CheckSquare className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">My Tasks</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">Tasks assigned to you across all pursuits</p>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-4xl mx-auto space-y-4">
                    {sortedTasks.length === 0 ? (
                        <div className="text-center py-16 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm">
                            <div className="w-16 h-16 bg-[var(--bg-elevated)] rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckSquare className="w-8 h-8 text-[var(--border-strong)]" />
                            </div>
                            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">You're all caught up!</h3>
                            <p className="text-[var(--text-muted)] max-w-sm mx-auto text-sm">You don't have any tasks assigned to you right now.</p>
                        </div>
                    ) : (
                        sortedTasks.map(task => {
                            const cfg = STATUS_CONFIG[task.status];
                            const overdue = task.due_date && task.status !== 'complete' && task.status !== 'not_applicable' && daysUntil(task.due_date) < 0;
                            const isSelected = selectedTask?.id === task.id;
                            const pursuitId = (task as any).pursuit_id;
                            const pursuitName = (task as any).pursuit?.name || 'Unknown Pursuit';
                            const pursuitStage = (task as any).pursuit?.stage || 'Unknown Stage';

                            return (
                                <button
                                    key={task.id}
                                    onClick={() => setSelectedTask(task)}
                                    className={`w-full text-left bg-[var(--bg-card)] p-4 rounded-xl border transition-all ${
                                        isSelected 
                                            ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] ring-opacity-50 shadow-md' 
                                            : 'border-[var(--table-row-border)] hover:border-[var(--border-strong)] hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            {/* Top context row */}
                                            <div className="flex items-center gap-3 mb-2 text-xs">
                                                <div className="flex items-center gap-1.5 text-[var(--text-secondary)] font-medium">
                                                    <Building2 className="w-3.5 h-3.5" />
                                                    {pursuitName}
                                                    <span className="text-[var(--text-faint)] ml-1 font-normal uppercase tracking-wider text-[10px]">({pursuitStage.replace(/_/g, ' ')})</span>
                                                </div>
                                            </div>

                                            {/* Main title */}
                                            <h3 className={`text-base font-semibold mb-2 ${task.status === 'complete' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                                                {task.name}
                                            </h3>

                                            {/* Bottom pill row */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span 
                                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border border-[var(--border)]"
                                                    style={{ color: cfg.color, backgroundColor: `${cfg.color}15`, borderColor: `${cfg.color}30` }}
                                                >
                                                    {cfg.label}
                                                </span>

                                                {task.due_date && (
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${
                                                        overdue 
                                                            ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30' 
                                                            : task.status === 'complete' || task.status === 'not_applicable'
                                                                ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)]'
                                                                : 'bg-[var(--accent)]/5 text-[var(--accent)] border-[var(--accent)]/20'
                                                    }`}>
                                                        {overdue ? <AlertCircle className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                                                        <span>{formatDate(task.due_date)}</span>
                                                        {overdue && <span className="font-bold ml-0.5">({Math.abs(daysUntil(task.due_date))}d overdue)</span>}
                                                    </span>
                                                )}

                                                {task.is_critical_path && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20">
                                                        Critical Path
                                                    </span>
                                                )}

                                                {(task.checklist_items?.length || 0) > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] font-medium pl-2 border-l border-[var(--border)]">
                                                        <CheckSquare className="w-3.5 h-3.5" />
                                                        {task.checklist_items?.filter(i => i.is_checked).length || 0}/{task.checklist_items?.length || 0}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Task Detail Panel Overlay */}
            {selectedTask && (
                <>
                    <div className="fixed inset-0 bg-black/10 z-30" onClick={() => setSelectedTask(null)} />
                    <TaskDetailPanel 
                        task={selectedTask} 
                        pursuitId={(selectedTask as any).pursuit_id} 
                        milestones={[]} 
                        onClose={() => setSelectedTask(null)} 
                    />
                </>
            )}
        </div>
    );
}
