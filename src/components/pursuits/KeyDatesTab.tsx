'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
    useKeyDates,
    useKeyDateTypes,
    useUpsertKeyDate,
    useDeleteKeyDate,
} from '@/hooks/useSupabaseQueries';
import type { KeyDate, KeyDateType, KeyDateStatus, KeyDateCategory } from '@/types';
import {
    Plus,
    Upload,
    Sparkles,
    Calendar,
    CheckCircle2,
    Clock,
    AlertTriangle,
    XCircle,
    Trash2,
    Loader2,
    ChevronDown,
    ChevronUp,
    FileText,
    X,
} from 'lucide-react';

interface KeyDatesTabProps {
    pursuitId: string;
}

// ── Helpers ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<KeyDateStatus, { label: string; color: string; bgColor: string; Icon: typeof CheckCircle2 }> = {
    upcoming: { label: 'Upcoming', color: '#2563EB', bgColor: '#EBF1FF', Icon: Clock },
    completed: { label: 'Completed', color: '#0D7A3E', bgColor: '#ECFDF3', Icon: CheckCircle2 },
    overdue: { label: 'Overdue', color: '#DC2626', bgColor: '#FEF2F2', Icon: AlertTriangle },
    waived: { label: 'Waived', color: '#7A8599', bgColor: '#F4F5F7', Icon: XCircle },
};

function daysUntil(dateStr: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

function getDateLabel(kd: KeyDate): string {
    return kd.key_date_type?.name ?? kd.custom_label ?? 'Custom Date';
}

function getDateColor(kd: KeyDate, types: KeyDateType[]): string {
    if (kd.key_date_type) return kd.key_date_type.color;
    return '#7A8599';
}

// ── AI Review Modal ─────────────────────────────────────────

interface ExtractedDate {
    label: string;
    matched_type: string;
    date_value: string | null;
    contract_reference: string | null;
    confidence: number;
    context_snippet: string | null;
    accepted: boolean;
}

function AIReviewModal({
    dates,
    types,
    onAccept,
    onClose,
    isImporting,
}: {
    dates: ExtractedDate[];
    types: KeyDateType[];
    onAccept: (dates: ExtractedDate[]) => void;
    onClose: () => void;
    isImporting: boolean;
}) {
    const [items, setItems] = useState(dates);

    const toggleItem = (idx: number) => {
        setItems(prev => prev.map((d, i) => i === idx ? { ...d, accepted: !d.accepted } : d));
    };

    const updateDate = (idx: number, dateValue: string) => {
        setItems(prev => prev.map((d, i) => i === idx ? { ...d, date_value: dateValue } : d));
    };

    const acceptedCount = items.filter(d => d.accepted && d.date_value).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-3xl shadow-xl animate-fade-in max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
                        <h2 className="text-lg font-semibold text-[#1A1F2B]">AI Extracted Dates</h2>
                        <span className="text-xs bg-[#8B5CF6]/10 text-[#8B5CF6] px-2 py-0.5 rounded-full font-medium">
                            {items.length} found
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-[#F4F5F7] text-[#A0AABB]">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                    {items.map((d, idx) => (
                        <div
                            key={idx}
                            className={`border rounded-lg p-3 transition-all ${d.accepted ? 'border-[#2563EB]/30 bg-[#EBF1FF]/30' : 'border-[#E2E5EA] opacity-60'}`}
                        >
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={d.accepted}
                                    onChange={() => toggleItem(idx)}
                                    className="w-4 h-4 rounded border-[#E2E5EA] text-[#2563EB] focus:ring-[#2563EB]"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-[#1A1F2B]">{d.label}</span>
                                        {d.matched_type !== 'custom' && (
                                            <span className="text-[9px] bg-[#F4F5F7] text-[#7A8599] px-1.5 py-0.5 rounded font-mono">
                                                {d.matched_type}
                                            </span>
                                        )}
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${d.confidence >= 0.8 ? 'bg-[#ECFDF3] text-[#0D7A3E]' :
                                                d.confidence >= 0.5 ? 'bg-[#FFF8E1] text-[#CA8A04]' :
                                                    'bg-[#FEF2F2] text-[#DC2626]'
                                            }`}>
                                            {Math.round(d.confidence * 100)}%
                                        </span>
                                    </div>
                                    {d.contract_reference && (
                                        <span className="text-[10px] text-[#7A8599] font-mono">{d.contract_reference}</span>
                                    )}
                                    {d.context_snippet && (
                                        <p className="text-[10px] text-[#A0AABB] mt-0.5 italic truncate">"{d.context_snippet}"</p>
                                    )}
                                </div>
                                <input
                                    type="date"
                                    value={d.date_value ?? ''}
                                    onChange={(e) => updateDate(idx, e.target.value)}
                                    className="px-2 py-1 rounded border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#E2E5EA]">
                    <span className="text-xs text-[#7A8599]">{acceptedCount} date{acceptedCount !== 1 ? 's' : ''} selected</span>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={() => onAccept(items.filter(d => d.accepted && d.date_value))}
                            disabled={acceptedCount === 0 || isImporting}
                            className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                        >
                            {isImporting ? 'Importing...' : `Import ${acceptedCount} Date${acceptedCount !== 1 ? 's' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Add/Edit Date Dialog ────────────────────────────────────

function AddDateDialog({
    types,
    editDate,
    onSave,
    onClose,
    isSaving,
}: {
    types: KeyDateType[];
    editDate?: KeyDate | null;
    onSave: (data: { key_date_type_id: string | null; custom_label: string | null; date_value: string; status: KeyDateStatus; notes: string | null }) => void;
    onClose: () => void;
    isSaving: boolean;
}) {
    const [typeId, setTypeId] = useState(editDate?.key_date_type_id ?? '');
    const [customLabel, setCustomLabel] = useState(editDate?.custom_label ?? '');
    const [dateValue, setDateValue] = useState(editDate?.date_value?.split('T')[0] ?? '');
    const [status, setStatus] = useState<KeyDateStatus>(editDate?.status ?? 'upcoming');
    const [notes, setNotes] = useState(editDate?.notes ?? '');

    const isCustom = typeId === 'custom' || typeId === '';
    const contractTypes = types.filter(t => t.category === 'contract' && t.is_active);
    const predevTypes = types.filter(t => t.category === 'pre_development' && t.is_active);

    const handleSave = () => {
        if (!dateValue) return;
        if (isCustom && !customLabel.trim()) return;
        onSave({
            key_date_type_id: isCustom ? null : typeId,
            custom_label: isCustom ? customLabel.trim() : null,
            date_value: dateValue,
            status,
            notes: notes.trim() || null,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                <h2 className="text-lg font-semibold text-[#1A1F2B] mb-4">
                    {editDate ? 'Edit Date' : 'Add Key Date'}
                </h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                            Date Type <span className="text-[#DC2626]">*</span>
                        </label>
                        <select
                            value={typeId}
                            onChange={(e) => setTypeId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                        >
                            <option value="">— Custom —</option>
                            <optgroup label="Contract">
                                {contractTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Pre-Development">
                                {predevTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>

                    {(typeId === '' || typeId === 'custom') && (
                        <div>
                            <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                                Custom Label <span className="text-[#DC2626]">*</span>
                            </label>
                            <input
                                type="text"
                                value={customLabel}
                                onChange={(e) => setCustomLabel(e.target.value)}
                                placeholder="e.g., City Council Vote"
                                className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:outline-none"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                            Date <span className="text-[#DC2626]">*</span>
                        </label>
                        <input
                            type="date"
                            value={dateValue}
                            onChange={(e) => setDateValue(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                            Status
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as KeyDateStatus)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                        >
                            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                <option key={key} value={key}>{cfg.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                            Notes
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Optional notes..."
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:outline-none resize-none"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!dateValue || (isCustom && !customLabel.trim()) || isSaving}
                        className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        {isSaving ? 'Saving...' : editDate ? 'Save Changes' : 'Add Date'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Timeline Visualization ──────────────────────────────────

function TimelineView({ dates, types }: { dates: KeyDate[]; types: KeyDateType[] }) {
    const sortedDates = useMemo(() => {
        return [...dates].sort((a, b) => new Date(a.date_value).getTime() - new Date(b.date_value).getTime());
    }, [dates]);

    if (sortedDates.length < 2) return null;

    const earliest = new Date(sortedDates[0].date_value).getTime();
    const latest = new Date(sortedDates[sortedDates.length - 1].date_value).getTime();
    const range = latest - earliest || 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPct = Math.max(0, Math.min(100, ((today.getTime() - earliest) / range) * 100));

    return (
        <div className="mt-6 pt-4 border-t border-[#F0F1F4]">
            <h4 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider mb-4">Timeline</h4>
            <div className="relative h-16 bg-[#F8F9FB] rounded-lg overflow-visible px-4">
                {/* Track line */}
                <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-[#E2E5EA] -translate-y-1/2" />
                {/* Today marker */}
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[#DC2626]/40"
                    style={{ left: `calc(${todayPct}% + 16px - 1px)` }}
                >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-[#DC2626] font-medium whitespace-nowrap">
                        Today
                    </span>
                </div>
                {/* Date dots */}
                {sortedDates.map((kd, i) => {
                    const pct = ((new Date(kd.date_value).getTime() - earliest) / range) * 100;
                    const statusCfg = STATUS_CONFIG[kd.status];
                    const color = getDateColor(kd, types);
                    return (
                        <div
                            key={kd.id}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group/dot"
                            style={{ left: `calc(${pct}% + 16px)` }}
                        >
                            <div
                                className="w-3 h-3 rounded-full border-2 border-white shadow-sm cursor-pointer"
                                style={{ backgroundColor: color }}
                            />
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none z-10">
                                <div className="bg-[#1A1F2B] text-white text-[9px] px-2 py-1 rounded whitespace-nowrap shadow-lg">
                                    {getDateLabel(kd)} — {formatDate(kd.date_value)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────

export function KeyDatesTab({ pursuitId }: KeyDatesTabProps) {
    const { data: keyDates = [], isLoading } = useKeyDates(pursuitId);
    const { data: dateTypes = [] } = useKeyDateTypes();
    const upsertKeyDate = useUpsertKeyDate();
    const deleteKeyDate = useDeleteKeyDate();

    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editDate, setEditDate] = useState<KeyDate | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // AI Upload state
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractError, setExtractError] = useState<string | null>(null);
    const [extractedDates, setExtractedDates] = useState<ExtractedDate[] | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Collapse toggles
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const toggleCategory = (cat: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            next.has(cat) ? next.delete(cat) : next.add(cat);
            return next;
        });
    };

    // Group dates by category
    const grouped = useMemo(() => {
        const groups: { category: string; label: string; dates: KeyDate[] }[] = [
            { category: 'contract', label: 'Contract Dates', dates: [] },
            { category: 'pre_development', label: 'Pre-Development', dates: [] },
            { category: 'custom', label: 'Custom Dates', dates: [] },
        ];

        for (const kd of keyDates) {
            if (kd.key_date_type) {
                const cat = kd.key_date_type.category;
                const group = groups.find(g => g.category === cat);
                if (group) group.dates.push(kd);
                else groups[2].dates.push(kd);
            } else {
                groups[2].dates.push(kd);
            }
        }

        return groups.filter(g => g.dates.length > 0);
    }, [keyDates]);

    // Handle file upload for AI extraction
    const handleFileUpload = useCallback(async (file: File) => {
        setIsExtracting(true);
        setExtractError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/ai-extract-dates', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (data.error) {
                setExtractError(data.error);
            } else if (data.dates?.length > 0) {
                setExtractedDates(data.dates.map((d: any) => ({ ...d, accepted: d.confidence >= 0.5 && d.date_value })));
            } else {
                setExtractError('No dates found in the document.');
            }
        } catch (err: any) {
            setExtractError(err.message || 'Failed to process document');
        } finally {
            setIsExtracting(false);
        }
    }, []);

    // Handle importing accepted AI dates
    const handleAcceptDates = useCallback(async (accepted: ExtractedDate[]) => {
        setIsImporting(true);
        try {
            for (const d of accepted) {
                // Try to match to a key_date_type
                const matchedType = d.matched_type !== 'custom'
                    ? dateTypes.find(t => t.name === d.matched_type)
                    : null;

                await upsertKeyDate.mutateAsync({
                    pursuit_id: pursuitId,
                    key_date_type_id: matchedType?.id ?? null,
                    custom_label: matchedType ? null : d.label,
                    date_value: d.date_value!,
                    status: 'upcoming' as KeyDateStatus,
                    contract_reference: d.contract_reference,
                    ai_extracted: true,
                    ai_confidence: d.confidence,
                    sort_order: 0,
                });
            }
            setExtractedDates(null);
        } catch (err) {
            console.error('Failed to import dates:', err);
        } finally {
            setIsImporting(false);
        }
    }, [pursuitId, dateTypes, upsertKeyDate]);

    // Handle save from dialog
    const handleSaveDate = useCallback(async (data: {
        key_date_type_id: string | null;
        custom_label: string | null;
        date_value: string;
        status: KeyDateStatus;
        notes: string | null;
    }) => {
        await upsertKeyDate.mutateAsync({
            ...(editDate ? { id: editDate.id } : {}),
            pursuit_id: pursuitId,
            ...data,
            ai_extracted: editDate?.ai_extracted ?? false,
            ai_confidence: editDate?.ai_confidence ?? null,
            contract_reference: editDate?.contract_reference ?? null,
            sort_order: editDate?.sort_order ?? keyDates.length,
        });
        setShowAddDialog(false);
        setEditDate(null);
    }, [editDate, pursuitId, keyDates.length, upsertKeyDate]);

    // Handle status toggle (quick action)
    const handleStatusToggle = useCallback((kd: KeyDate) => {
        const nextStatus: Record<KeyDateStatus, KeyDateStatus> = {
            upcoming: 'completed',
            completed: 'upcoming',
            overdue: 'completed',
            waived: 'upcoming',
        };
        upsertKeyDate.mutate({
            id: kd.id,
            pursuit_id: kd.pursuit_id,
            status: nextStatus[kd.status],
        });
    }, [upsertKeyDate]);

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#C8CDD5]" />
            </div>
        );
    }

    return (
        <div>
            {/* Header actions */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#1A1F2B]">Key Dates</h2>
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                            e.target.value = '';
                        }}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isExtracting}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[#E2E5EA] text-[#4A5568] hover:text-[#8B5CF6] hover:border-[#8B5CF6] text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {isExtracting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Extracting...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Upload Contract
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => { setEditDate(null); setShowAddDialog(true); }}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> Add Date
                    </button>
                </div>
            </div>

            {/* Extract error */}
            {extractError && (
                <div className="mb-4 p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#DC2626] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{extractError}</span>
                    <button onClick={() => setExtractError(null)} className="ml-auto text-[#DC2626]/60 hover:text-[#DC2626]">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Empty state */}
            {keyDates.length === 0 && !isExtracting && (
                <div className="card flex flex-col items-center py-12 text-center">
                    <Calendar className="w-10 h-10 text-[#C8CDD5] mb-3" />
                    <p className="text-sm text-[#7A8599] mb-4">
                        No key dates added yet. Add dates manually or upload a contract for AI extraction.
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] text-white text-sm font-semibold hover:from-[#7C3AED] hover:to-[#4F46E5] transition-all shadow-sm"
                        >
                            <Sparkles className="w-4 h-4" /> Upload Contract (AI)
                        </button>
                        <button
                            onClick={() => { setEditDate(null); setShowAddDialog(true); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E2E5EA] text-[#4A5568] hover:text-[#2563EB] hover:border-[#2563EB] text-sm font-medium transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Manually
                        </button>
                    </div>
                </div>
            )}

            {/* Grouped date list */}
            {grouped.map((group) => (
                <div key={group.category} className="card mb-4">
                    <button
                        onClick={() => toggleCategory(group.category)}
                        className="flex items-center justify-between w-full mb-2"
                    >
                        <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">
                            {group.label}
                            <span className="ml-2 text-[#A0AABB] font-normal">({group.dates.length})</span>
                        </h3>
                        {collapsedCategories.has(group.category)
                            ? <ChevronDown className="w-3.5 h-3.5 text-[#A0AABB]" />
                            : <ChevronUp className="w-3.5 h-3.5 text-[#A0AABB]" />
                        }
                    </button>

                    {!collapsedCategories.has(group.category) && (
                        <div className="space-y-1">
                            {group.dates.map((kd) => {
                                const days = daysUntil(kd.date_value);
                                const statusCfg = STATUS_CONFIG[kd.status];
                                const StatusIcon = statusCfg.Icon;
                                const color = getDateColor(kd, dateTypes);
                                const isExpanded = expandedId === kd.id;

                                return (
                                    <div key={kd.id} className="group/row">
                                        <div className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-[#F8F9FB] transition-colors">
                                            {/* Status toggle */}
                                            <button
                                                onClick={() => handleStatusToggle(kd)}
                                                className="flex-shrink-0 transition-colors"
                                                title={`Status: ${statusCfg.label} (click to toggle)`}
                                            >
                                                <StatusIcon
                                                    className="w-4 h-4"
                                                    style={{ color: statusCfg.color }}
                                                />
                                            </button>

                                            {/* Color dot */}
                                            <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: color }}
                                            />

                                            {/* Label */}
                                            <button
                                                onClick={() => setExpandedId(isExpanded ? null : kd.id)}
                                                className="flex-1 text-left text-sm text-[#1A1F2B] font-medium hover:text-[#2563EB] transition-colors flex items-center gap-1.5"
                                            >
                                                {getDateLabel(kd)}
                                                {kd.ai_extracted && (
                                                    <Sparkles className="w-3 h-3 text-[#8B5CF6]" />
                                                )}
                                            </button>

                                            {/* Date */}
                                            <span className="text-sm text-[#4A5568] font-mono tabular-nums">
                                                {formatDate(kd.date_value)}
                                            </span>

                                            {/* Days until badge */}
                                            {kd.status === 'upcoming' && (
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${days <= 7 ? 'bg-[#FEF2F2] text-[#DC2626]' :
                                                        days <= 30 ? 'bg-[#FFF8E1] text-[#CA8A04]' :
                                                            'bg-[#EBF1FF] text-[#2563EB]'
                                                    }`}>
                                                    {days === 0 ? 'Today' : days === 1 ? '1d' : `${days}d`}
                                                </span>
                                            )}

                                            {/* Status badge */}
                                            <span
                                                className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                                                style={{ backgroundColor: statusCfg.bgColor, color: statusCfg.color }}
                                            >
                                                {statusCfg.label}
                                            </span>

                                            {/* Actions */}
                                            <div className="opacity-0 group-hover/row:opacity-100 flex items-center gap-1 transition-opacity">
                                                <button
                                                    onClick={() => { setEditDate(kd); setShowAddDialog(true); }}
                                                    className="p-1 rounded text-[#A0AABB] hover:text-[#2563EB] hover:bg-[#EBF1FF] transition-colors"
                                                    title="Edit"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmId(kd.id)}
                                                    className="p-1 rounded text-[#A0AABB] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div className="ml-9 mb-2 pl-3 border-l-2 border-[#E2E5EA] text-[11px] text-[#7A8599] space-y-1">
                                                {kd.contract_reference && (
                                                    <div><span className="font-medium text-[#4A5568]">Contract Ref:</span> {kd.contract_reference}</div>
                                                )}
                                                {kd.notes && (
                                                    <div><span className="font-medium text-[#4A5568]">Notes:</span> {kd.notes}</div>
                                                )}
                                                {kd.ai_extracted && kd.ai_confidence != null && (
                                                    <div className="flex items-center gap-1">
                                                        <Sparkles className="w-3 h-3 text-[#8B5CF6]" />
                                                        <span>AI extracted ({Math.round(kd.ai_confidence * 100)}% confidence)</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}

            {/* Timeline visualization */}
            {keyDates.length >= 2 && (
                <div className="card">
                    <TimelineView dates={keyDates} types={dateTypes} />
                </div>
            )}

            {/* Add/Edit Dialog */}
            {showAddDialog && (
                <AddDateDialog
                    types={dateTypes}
                    editDate={editDate}
                    onSave={handleSaveDate}
                    onClose={() => { setShowAddDialog(false); setEditDate(null); }}
                    isSaving={upsertKeyDate.isPending}
                />
            )}

            {/* AI Review Modal */}
            {extractedDates && (
                <AIReviewModal
                    dates={extractedDates}
                    types={dateTypes}
                    onAccept={handleAcceptDates}
                    onClose={() => setExtractedDates(null)}
                    isImporting={isImporting}
                />
            )}

            {/* Delete Confirmation */}
            {deleteConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in">
                        <h2 className="text-lg font-semibold text-[#1A1F2B] mb-2">Delete Key Date</h2>
                        <p className="text-sm text-[#7A8599] mb-1">
                            Are you sure you want to delete <span className="font-medium text-[#1A1F2B]">
                                {getDateLabel(keyDates.find(d => d.id === deleteConfirmId)!)}
                            </span>?
                        </p>
                        <p className="text-xs text-[#DC2626] mb-6">This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await deleteKeyDate.mutateAsync({ id: deleteConfirmId, pursuitId });
                                    setDeleteConfirmId(null);
                                }}
                                disabled={deleteKeyDate.isPending}
                                className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                            >
                                {deleteKeyDate.isPending ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
