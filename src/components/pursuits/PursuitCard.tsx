'use client';

import Link from 'next/link';
import { formatPercent } from '@/lib/constants';
import type { Pursuit, PursuitStage } from '@/types';
import { MapPin, FileText, TrendingUp, Calendar, Trash2 } from 'lucide-react';

interface PursuitCardProps {
    pursuit: Pursuit;
    stages: PursuitStage[];
    onDelete?: (id: string) => void;
}

export function PursuitCard({ pursuit, stages, onDelete }: PursuitCardProps) {
    const stage = pursuit.stage ?? stages.find((s) => s.id === pursuit.stage_id);

    return (
        <Link href={`/pursuits/${pursuit.short_id}`}>
            <div className="card group cursor-pointer animate-fade-in relative">
                {/* Delete button */}
                {onDelete && (
                    <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(pursuit.id); }}
                        className="absolute bottom-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all z-10"
                        title="Delete pursuit"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <h3 className="text-base font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                            {pursuit.name}
                        </h3>
                        {(pursuit.city || pursuit.state) && (
                            <div className="flex items-center gap-1.5 mt-1 text-[var(--text-muted)] text-sm">
                                <MapPin className="w-3.5 h-3.5" />
                                {[pursuit.city, pursuit.state].filter(Boolean).join(', ')}
                            </div>
                        )}
                    </div>
                    {stage && (
                        <span
                            className="stage-badge"
                            style={{
                                backgroundColor: `${stage.color}15`,
                                color: stage.color,
                                border: `1px solid ${stage.color}30`,
                            }}
                        >
                            {stage.name}
                        </span>
                    )}
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-[var(--table-row-border)]">
                    <div>
                        <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-medium">Units</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            <span className="text-sm font-semibold text-[var(--text-primary)]">{pursuit.primary_units ?? '—'}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-medium">YOC</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <TrendingUp className="w-3.5 h-3.5 text-[var(--success)]" />
                            <span className="text-sm font-bold text-[var(--success)]">
                                {pursuit.best_yoc && pursuit.best_yoc > 0 ? formatPercent(pursuit.best_yoc) : '—'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-medium">Updated</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            <span className="text-xs text-[var(--text-muted)]">
                                {new Date(pursuit.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
