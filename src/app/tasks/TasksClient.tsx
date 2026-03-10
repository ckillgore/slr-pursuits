'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useMyTasks } from '@/hooks/useSupabaseQueries';
import { TaskDetailPanel } from '@/components/shared/TaskDetailPanel';
import { CheckSquare, Calendar, Building2, Clock, AlertCircle, Search, Filter, ArrowUpDown } from 'lucide-react';
import type { PursuitChecklistTask, PursuitMilestone, ChecklistTaskStatus } from '@/types';

const STATUS_CONFIG: Record<ChecklistTaskStatus, { label: string; color: string; bg: string }> = {
    not_applicable: { label: 'N/A', color: 'var(--text-faint)', bg: 'var(--bg-primary)' },
    not_started: { label: 'Not Started', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
    in_progress: { label: 'In Progress', color: '#3B82F6', bg: '#EFF6FF' },
    in_review: { label: 'In Review', color: '#8B5CF6', bg: '#F5F3FF' },
    blocked: { label: 'Blocked', color: '#EF4444', bg: '#FEF2F2' },
    complete: { label: 'Complete', color: 'var(--success)', bg: 'var(--success-bg)' },
};

type SortOption = 'due_date_asc' | 'due_date_desc' | 'pursuit_name' | 'task_name';
type FilterStatus = 'all' | 'incomplete' | 'complete';

export function TasksClient() {
    const { profile } = useAuth();
    const { data: tasks = [], isLoading } = useMyTasks(profile?.id);
    const [selectedTask, setSelectedTask] = useState<PursuitChecklistTask | null>(null);
    
    // Toolbar State
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('incomplete');
    const [pursuitFilter, setPursuitFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<SortOption>('due_date_asc');

    // Extract unique pursuits for the filter dropdown
    const uniquePursuits = useMemo(() => {
        const pursuits = new Map<string, string>();
        tasks.forEach(task => {
            const pId = (task as any).pursuit?.id;
            const pName = (task as any).pursuit?.name;
            if (pId && pName) pursuits.set(pId, pName);
        });
        return Array.from(pursuits.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [tasks]);

    // Filter and Sort Logic
    const processedTasks = useMemo(() => {
        let filtered = [...tasks];

        // 1. Search Query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t => 
                t.name?.toLowerCase().includes(query) || 
                (t as any).pursuit?.name?.toLowerCase().includes(query)
            );
        }

        // 2. Status Filter
        if (statusFilter === 'incomplete') {
            filtered = filtered.filter(t => t.status !== 'complete' && t.status !== 'not_applicable');
        } else if (statusFilter === 'complete') {
            filtered = filtered.filter(t => t.status === 'complete');
        }

        // 3. Pursuit Filter
        if (pursuitFilter !== 'all') {
            filtered = filtered.filter(t => (t as any).pursuit?.id === pursuitFilter);
        }

        // 4. Sorting
        return filtered.sort((a, b) => {
            if (sortBy === 'pursuit_name') {
                const pA = (a as any).pursuit?.name || '';
                const pB = (b as any).pursuit?.name || '';
                return pA.localeCompare(pB) || (a.name || '').localeCompare(b.name || '');
            }
            if (sortBy === 'task_name') {
                return (a.name || '').localeCompare(b.name || '');
            }
            // Due Date Sorting (Default)
            const dateA = a.due_date ? new Date(a.due_date).getTime() : (sortBy === 'due_date_asc' ? Infinity : -Infinity);
            const dateB = b.due_date ? new Date(b.due_date).getTime() : (sortBy === 'due_date_asc' ? Infinity : -Infinity);
            
            if (sortBy === 'due_date_asc') return dateA - dateB;
            return dateB - dateA; // due_date_desc
        });
    }, [tasks, searchQuery, statusFilter, pursuitFilter, sortBy]);


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
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                            <CheckSquare className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">My Tasks</h1>
                            <p className="text-sm text-[var(--text-muted)] mt-0.5">Manage and track checklist items assigned to you.</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Toolbar */}
            <div className="flex-none bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                        <input
                            type="text"
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] transition-all"
                        />
                    </div>

                    {/* Filters & Sort */}
                    <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:pb-0">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
                            className="bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
                        >
                            <option value="incomplete">Status: Open</option>
                            <option value="all">Status: All</option>
                            <option value="complete">Status: Completed</option>
                        </select>

                        <select
                            value={pursuitFilter}
                            onChange={(e) => setPursuitFilter(e.target.value)}
                            className="bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer max-w-[200px]"
                        >
                            <option value="all">Pursuit: All</option>
                            {uniquePursuits.map(([id, name]) => (
                                <option key={id} value={id}>{name}</option>
                            ))}
                        </select>

                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortOption)}
                            className="bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
                        >
                            <option value="due_date_asc">Sort: Due Date (Earliest)</option>
                            <option value="due_date_desc">Sort: Due Date (Latest)</option>
                            <option value="pursuit_name">Sort: Pursuit</option>
                            <option value="task_name">Sort: Task Name</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-6xl mx-auto space-y-3">
                    {processedTasks.length === 0 ? (
                        <div className="text-center py-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm">
                            <div className="w-16 h-16 bg-[var(--bg-elevated)] rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckSquare className="w-8 h-8 text-[var(--border-strong)]" />
                            </div>
                            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                                {tasks.length === 0 ? "You're all caught up!" : "No tasks match your filters"}
                            </h3>
                            <p className="text-[var(--text-muted)] max-w-sm mx-auto text-sm">
                                {tasks.length === 0 
                                    ? "You don't have any tasks assigned to you right now." 
                                    : "Try adjusting your search criteria or clearing your filters."}
                            </p>
                            {tasks.length > 0 && (
                                <button 
                                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); setPursuitFilter('all'); }}
                                    className="mt-6 px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg text-sm font-medium transition-colors"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    ) : (
                        processedTasks.map(task => {
                            const cfg = STATUS_CONFIG[task.status];
                            const overdue = task.due_date && task.status !== 'complete' && task.status !== 'not_applicable' && daysUntil(task.due_date) < 0;
                            const isSelected = selectedTask?.id === task.id;
                            const pursuitName = (task as any).pursuit?.name || 'Unknown Pursuit';

                            // Clean formatting: don't show UUIDs as names
                            let displayName = task.name || 'Untitled Task';
                            if (displayName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                                displayName = 'Untitled Workflow Task';
                            }

                            return (
                                <button
                                    key={task.id}
                                    onClick={() => setSelectedTask(task)}
                                    className={`w-full text-left bg-[var(--bg-card)] px-5 py-4 rounded-xl transition-all border group ${
                                        isSelected 
                                            ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] ring-opacity-50 shadow-md transform scale-[1.002] z-10 relative' 
                                            : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        
                                        {/* Left: Task Name & Pursuit Context */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1.5 text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                                                <Building2 className="w-3.5 h-3.5 text-[var(--text-faint)] group-hover:text-[var(--accent)] transition-colors" />
                                                <span className="truncate">{pursuitName}</span>
                                            </div>
                                            <h3 className={`text-[15px] font-semibold truncate ${task.status === 'complete' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                                                {displayName}
                                            </h3>
                                        </div>

                                        {/* Right: Metadata Pills */}
                                        <div className="flex flex-wrap md:flex-nowrap items-center gap-3 md:w-auto shrink-0 justify-end">
                                            
                                            {(task.checklist_items?.length || 0) > 0 && (
                                                <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)]">
                                                    <CheckSquare className="w-3 h-3 mr-1.5 opacity-70" />
                                                    {task.checklist_items?.filter(i => i.is_checked).length || 0}/{task.checklist_items?.length || 0}
                                                </span>
                                            )}

                                            <span 
                                                className="inline-flex justify-center min-w-[5.5rem] items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border shadow-sm"
                                                style={{ color: cfg.color, backgroundColor: `${cfg.color}15`, borderColor: `${cfg.color}30` }}
                                            >
                                                {cfg.label}
                                            </span>

                                            <div className="w-[120px] flex justify-end">
                                                {task.due_date ? (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm border ${
                                                        overdue 
                                                            ? 'bg-[#EF4444] text-white border-[#EF4444]' 
                                                            : task.status === 'complete' || task.status === 'not_applicable'
                                                                ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)]'
                                                                : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border)]'
                                                    }`}>
                                                        {overdue ? <AlertCircle className="w-3.5 h-3.5 opacity-90" /> : <Calendar className={`w-3.5 h-3.5 ${task.status === 'complete' ? 'opacity-50' : 'text-[var(--accent)]'}`} />}
                                                        <span>{formatDate(task.due_date)}</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center px-2 py-1 text-xs text-[var(--text-faint)] font-medium">
                                                        No Due Date
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Alert strip for critical path / overdue */}
                                    <div className="mt-2.5 flex items-center gap-2">
                                        {task.is_critical_path && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20">
                                                Critical Path
                                            </span>
                                        )}
                                        {overdue && (
                                            <span className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider">
                                                {Math.abs(daysUntil(task.due_date!))} Days Overdue
                                            </span>
                                        )}
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
                        onClose={() => setSelectedTask(null)} 
                    />
                </>
            )}
        </div>
    );
}
