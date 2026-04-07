'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useUnitPrototypes } from '@/hooks/useUnitPrototypes';
import type { UnitPrototype } from '@/hooks/useUnitPrototypes';
import { Search, FileText, ChevronDown, X, Loader2 } from 'lucide-react';

// ============================================================
// PrototypePicker — Searchable dropdown for selecting unit
// prototypes from the Smartsheet inventory. Groups options
// by bedroom category with search/filter support.
// ============================================================

interface PrototypePickerProps {
    /** Called when user selects a prototype */
    onSelect: (prototype: UnitPrototype) => void;
    /** Called to close the picker */
    onClose: () => void;
}

export function PrototypePicker({ onSelect, onClose }: PrototypePickerProps) {
    const { data: prototypes = [], isLoading } = useUnitPrototypes();
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-focus search input
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Group and filter prototypes
    const grouped = useMemo(() => {
        const lowerSearch = search.toLowerCase().trim();
        const filtered = lowerSearch
            ? prototypes.filter(p =>
                p.display_name.toLowerCase().includes(lowerSearch) ||
                p.unit_code.toLowerCase().includes(lowerSearch) ||
                p.reference_code.toLowerCase().includes(lowerSearch) ||
                p.model_name.toLowerCase().includes(lowerSearch) ||
                p.bedroom_category.toLowerCase().includes(lowerSearch) ||
                String(p.avg_unit_sf).includes(lowerSearch)
            )
            : prototypes;

        const groups = new Map<string, UnitPrototype[]>();
        const categoryOrder = ['Studio', '1 Bed', '2 Bed', '3 Bed'];
        for (const cat of categoryOrder) {
            const items = filtered.filter(p => p.bedroom_category === cat);
            if (items.length > 0) groups.set(cat, items);
        }
        return groups;
    }, [prototypes, search]);

    // Unique unit codes per category (for sub-grouping)
    const getUnitCodesInCategory = (items: UnitPrototype[]) => {
        const codes = [...new Set(items.map(i => i.unit_code))];
        codes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return codes;
    };

    const categoryColors: Record<string, string> = {
        'Studio': 'var(--warning)',
        '1 Bed': 'var(--accent)',
        '2 Bed': 'var(--success)',
        '3 Bed': '#c084fc',
    };

    return (
        <div
            ref={containerRef}
            className="absolute right-0 top-full mt-1 z-50 w-[420px] max-h-[480px] rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl flex flex-col overflow-hidden animate-fade-in"
            style={{ backdropFilter: 'blur(20px)' }}
        >
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-[var(--border)] flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Unit Prototype Library</span>
                    <button onClick={onClose} className="p-0.5 text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by code, model, SF..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                    />
                </div>
                {/* Category pills */}
                <div className="flex gap-1.5 mt-2">
                    {['Studio', '1 Bed', '2 Bed', '3 Bed'].map(cat => {
                        const count = grouped.get(cat)?.length ?? 0;
                        const isActive = activeCategory === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(isActive ? null : cat)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${isActive
                                    ? 'text-white shadow-sm'
                                    : 'text-[var(--text-muted)] bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]'
                                    }`}
                                style={isActive ? { backgroundColor: categoryColors[cat] } : {}}
                                disabled={count === 0}
                            >
                                {cat} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" />
                    </div>
                ) : grouped.size === 0 ? (
                    <div className="text-center py-12 text-xs text-[var(--text-faint)]">
                        No prototypes found{search ? ` for "${search}"` : ''}
                    </div>
                ) : (
                    Array.from(grouped.entries())
                        .filter(([cat]) => !activeCategory || cat === activeCategory)
                        .map(([category, items]) => (
                            <div key={category}>
                                {/* Category header */}
                                <div
                                    className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border)]"
                                    style={{
                                        backgroundColor: 'var(--bg-base)',
                                        color: categoryColors[category],
                                    }}
                                >
                                    {category}
                                </div>
                                {/* Sub-group by unit code */}
                                {getUnitCodesInCategory(items).map(unitCode => {
                                    const codeItems = items.filter(i => i.unit_code === unitCode);
                                    const firstItem = codeItems[0];
                                    return (
                                        <div key={unitCode}>
                                            {/* Unit code sub-header */}
                                            <div className="px-3 py-1 text-[10px] font-semibold text-[var(--text-muted)] bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between">
                                                <span>{unitCode} — {firstItem.model_name}</span>
                                                <span className="tabular-nums">{firstItem.avg_unit_sf.toLocaleString()} SF &bull; {firstItem.dimensions}</span>
                                            </div>
                                            {/* Individual prototypes */}
                                            {codeItems.map(proto => (
                                                <button
                                                    key={`${proto.unit_code}-${proto.reference_code}`}
                                                    onClick={() => onSelect(proto)}
                                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--accent-subtle)] transition-colors text-left group/proto border-b border-[var(--table-row-border)]"
                                                >
                                                    <span className="text-xs font-semibold text-[var(--text-primary)] w-16 flex-shrink-0">{proto.display_name}</span>
                                                    <span className="text-[10px] text-[var(--text-muted)] flex-1">ref: {proto.reference_code}</span>
                                                    {proto.floor_plan_url && (
                                                        <FileText className="w-3 h-3 text-[var(--accent)] flex-shrink-0 opacity-60 group-hover/proto:opacity-100" />
                                                    )}
                                                    <span className="text-[10px] tabular-nums text-[var(--text-faint)] flex-shrink-0">{proto.avg_unit_sf.toLocaleString()} SF</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-[var(--border)] flex-shrink-0 bg-[var(--bg-elevated)]">
                <div className="text-[10px] text-[var(--text-faint)]">
                    {prototypes.length} prototypes • Select to add as unit mix row
                </div>
            </div>
        </div>
    );
}

// ============================================================
// FloorPlanButton — Small icon button that opens a floor plan
// PDF in a new tab. Only renders if there's a matching prototype.
// ============================================================

interface FloorPlanButtonProps {
    /** The unit type label to match against prototypes */
    unitTypeLabel: string;
    /** Direct floor plan URL override (if persisted on the row) */
    floorPlanUrl?: string | null;
}

export function FloorPlanButton({ unitTypeLabel, floorPlanUrl }: FloorPlanButtonProps) {
    const { data: prototypes = [] } = useUnitPrototypes();

    // Try direct URL first, then match by display_name
    const url = floorPlanUrl || (() => {
        const match = prototypes.find(p =>
            p.display_name.toLowerCase() === unitTypeLabel.toLowerCase()
        );
        return match?.floor_plan_url ?? null;
    })();

    if (!url) return null;

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center justify-center w-4 h-4 rounded text-[var(--accent)] hover:text-[var(--accent-hover)] hover:bg-[var(--accent-subtle)] transition-all flex-shrink-0 opacity-60 hover:opacity-100"
            title="View floor plan PDF"
        >
            <FileText className="w-3 h-3" />
        </a>
    );
}
