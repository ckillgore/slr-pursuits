import React, { useState, useRef, useEffect } from 'react';
import { Bookmark, BookmarkPlus, ChevronDown, Check, Trash2, Loader2, Star } from 'lucide-react';
import type { UserSavedView } from '@/types';
import { useSavedViews, useUpsertSavedView, useDeleteSavedView } from '@/hooks/useSupabaseQueries';
import { toast } from '@/lib/toast';

interface SavedViewsDropdownProps {
  currentFilters: {
    stageFilter: string[];
    regionFilter: string[];
    sortBy: string;
    viewMode: string;
  };
  onApplyView: (filters: any) => void;
  viewType?: string;
  className?: string;
}

export function SavedViewsDropdown({ currentFilters, onApplyView, viewType = 'pursuits', className = '' }: SavedViewsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingBoxOpen, setIsSavingBoxOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: savedViews = [], isLoading } = useSavedViews(viewType);
  const upsertView = useUpsertSavedView(viewType);
  const deleteView = useDeleteSavedView(viewType);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsSavingBoxOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsOpen(false); setIsSavingBoxOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleSaveCurrentView = () => {
    if (!newViewName.trim()) return;
    upsertView.mutate(
      {
        name: newViewName.trim(),
        view_type: viewType,
        is_default: savedViews.length === 0, // Make first view default
        filters: currentFilters
      },
      {
        onSuccess: () => {
          setIsSavingBoxOpen(false);
          setNewViewName('');
          toast.success('View saved');
        },
        onError: (err) => toast.error('Failed to save view', err),
      }
    );
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Saved views"
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all"
      >
        <Bookmark className="w-4 h-4 text-[var(--text-muted)]" />
        <span className="hidden sm:inline">Saved Views</span>
        <ChevronDown className="w-4 h-4 opacity-50" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="p-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
            {isSavingBoxOpen ? (
              <div className="space-y-2">
                <input
                  type="text"
                  aria-label="View name"
                  placeholder="View Name (e.g., Texas Deals)"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCurrentView(); }}
                  className="w-full px-2 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] bg-[var(--bg-primary)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsSavingBoxOpen(false)}
                    className="flex-1 py-1 px-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-card)] rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCurrentView}
                    disabled={!newViewName.trim() || upsertView.isPending}
                    className="flex-1 py-1 px-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded transition-colors disabled:opacity-50"
                  >
                    {upsertView.isPending ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsSavingBoxOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] rounded-lg transition-colors"
              >
                <BookmarkPlus className="w-4 h-4" /> Save Current View
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto p-2 space-y-1">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : savedViews.length === 0 ? (
              <p className="text-xs text-center text-[var(--text-muted)] py-4">No saved views yet.</p>
            ) : (
              savedViews.map((view) => (
                <div
                  key={view.id}
                  className="group flex items-center justify-between px-2 py-1 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"
                >
                  {/* A real button so saved views can be applied from the keyboard */}
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left truncate py-1 pr-4"
                    onClick={() => {
                      onApplyView(view.filters);
                      setIsOpen(false);
                    }}
                  >
                    {view.name}
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete saved view "${view.name}"?`)) {
                          deleteView.mutate(view.id, { onError: (err) => toast.error('Failed to delete view', err) });
                        }
                      }}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded transition-colors"
                      title="Delete View"
                      aria-label={`Delete saved view ${view.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
