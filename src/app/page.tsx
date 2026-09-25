'use client';

import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Map as MapboxMap, GeoJSONSource, MapMouseEvent, Popup as MapboxPopup } from 'mapbox-gl';
import { AppShell } from '@/components/layout/AppShell';
import { PursuitCard } from '@/components/pursuits/PursuitCard';
import { SavedViewsDropdown } from '@/components/shared/SavedViewsDropdown';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import { usePursuits, useStages, useCreatePursuit, useDeletePursuit, useSavedViews, usePrefetchPursuit } from '@/hooks/useSupabaseQueries';
import { toast } from '@/lib/toast';
import { formatPercent } from '@/lib/constants';
import { Search, Building2, Loader2, Map, LayoutGrid, List, MapPin, Navigation, Trash2, AlertCircle } from 'lucide-react';
import type { Pursuit, PursuitStage, UserSavedView } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

type ViewMode = 'grid' | 'map' | 'list';
type SortBy = 'updated' | 'newest' | 'name' | 'city';

/** Close a dialog on Escape while it is open. */
function useEscapeKey(active: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onEscapeRef.current = onEscape; });
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscapeRef.current(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active]);
}

export default function DashboardPage() {
  const router = useRouter();
  const prefetch = usePrefetchPursuit();
  const { data: pursuits = [], isLoading: loadingPursuits, isError, error: pursuitsError, refetch } = usePursuits();
  const { data: stages = [] } = useStages();
  const deletePursuitMutation = useDeletePursuit();

  const [searchQuery, setSearchQuery] = useState('');
  // Filtering/sorting every card on each keystroke is deferred so typing stays responsive
  const deferredSearch = useDeferredValue(searchQuery);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // View states logic
  const { data: savedViews = [] } = useSavedViews('pursuits');
  const hasAppliedDefault = useRef(false);

  useEffect(() => {
     if (savedViews.length > 0 && !hasAppliedDefault.current) {
        const defaultView = savedViews.find((v: UserSavedView) => v.is_default);
        if (defaultView && defaultView.filters) {
            const f = defaultView.filters;
            if (f.stageFilter !== undefined) setStageFilter(f.stageFilter);
            if (f.regionFilter !== undefined) setRegionFilter(f.regionFilter);
            if (f.sortBy !== undefined) setSortBy(f.sortBy);
            if (f.viewMode !== undefined) setViewMode(f.viewMode);
        }
        hasAppliedDefault.current = true;
     }
  }, [savedViews]);

  // Dynamic page title
  useEffect(() => {
    document.title = 'Pipeline | SLR Pursuits';
    return () => { document.title = 'SLR Pursuits | Feasibility Analysis'; };
  }, []);

  const [showNewPursuitDialog, setShowNewPursuitDialog] = useState(false);
  const [deletePursuitId, setDeletePursuitId] = useState<string | null>(null);
  const openNewPursuitDialog = useCallback(() => setShowNewPursuitDialog(true), []);
  const closeNewPursuitDialog = useCallback(() => setShowNewPursuitDialog(false), []);

  const closeDeleteDialog = () => { if (!deletePursuitMutation.isPending) setDeletePursuitId(null); };
  useEscapeKey(!!deletePursuitId, closeDeleteDialog);

  // Derive unique regions from pursuits
  const regions = useMemo(() => {
    const unique = new Set(pursuits.map((p) => p.region).filter(Boolean));
    return Array.from(unique).sort();
  }, [pursuits]);

  const filteredPursuits = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const filtered = pursuits.filter((p) => {
      const matchesSearch =
        !q ||
        (p.name ?? '').toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.region?.toLowerCase().includes(q);
      const matchesStage = stageFilter.length === 0 || (p.stage_id && stageFilter.includes(p.stage_id));
      const matchesRegion = regionFilter.length === 0 || (p.region && regionFilter.includes(p.region));
      return matchesSearch && matchesStage && matchesRegion;
    });

    // Sort
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true, sensitivity: 'base' }));
        break;
      case 'city':
        filtered.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
        break;
      case 'newest':
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'updated':
      default:
        filtered.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
        break;
    }
    return filtered;
  }, [pursuits, deferredSearch, stageFilter, regionFilter, sortBy]);

  const stageById = useMemo(() => {
    const m = new globalThis.Map<string, PursuitStage>();
    stages.forEach((s) => m.set(s.id, s));
    return m;
  }, [stages]);

  const handleDeletePursuit = async () => {
    if (!deletePursuitId) return;
    try {
      await deletePursuitMutation.mutateAsync(deletePursuitId);
      setDeletePursuitId(null);
      toast.success('Pursuit deleted');
    } catch (err) {
      console.error('Failed to delete pursuit:', err);
      toast.error('Failed to delete pursuit', err);
    }
  };

  const viewToggleClass = (mode: ViewMode) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === mode ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`;

  const showResults = !loadingPursuits && !isError;
  const deletingPursuit = deletePursuitId ? pursuits.find(p => p.id === deletePursuitId) : undefined;

  return (
    <AppShell onNewPursuit={openNewPursuitDialog}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Page Header */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">Pursuits</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {filteredPursuits.length !== pursuits.length && `${filteredPursuits.length} of `}
              {pursuits.length} active pursuit{pursuits.length !== 1 ? 's' : ''}
            </p>
          </div>
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg bg-[var(--bg-elevated)] p-0.5" role="group" aria-label="View">
            <button onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} className={viewToggleClass('grid')}>
              <LayoutGrid className="w-4 h-4" aria-hidden /> Grid
            </button>
            <button onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} className={viewToggleClass('list')}>
              <List className="w-4 h-4" aria-hidden /> List
            </button>
            <button onClick={() => setViewMode('map')} aria-pressed={viewMode === 'map'} className={viewToggleClass('map')}>
              <Map className="w-4 h-4" aria-hidden /> Map
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" aria-hidden />
            <input
              type="search"
              aria-label="Search pursuits"
              placeholder="Search pursuits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none transition-all"
            />
          </div>
          <SavedViewsDropdown
            currentFilters={{ stageFilter, regionFilter, sortBy, viewMode }}
            onApplyView={(filters) => {
                if (filters.stageFilter !== undefined) {
                    setStageFilter(Array.isArray(filters.stageFilter) ? filters.stageFilter : [filters.stageFilter].filter(Boolean));
                }
                if (filters.regionFilter !== undefined) {
                    setRegionFilter(Array.isArray(filters.regionFilter) ? filters.regionFilter : [filters.regionFilter].filter(Boolean));
                }
                if (filters.sortBy !== undefined) setSortBy(filters.sortBy);
                if (filters.viewMode !== undefined) setViewMode(filters.viewMode);
            }}
          />
          <div className="w-full sm:w-[180px]">
            <MultiSelectDropdown
              options={stages.filter(s => s.is_active).map(s => ({ id: s.id, name: s.name, color: s.color }))}
              selectedIds={stageFilter}
              onChange={setStageFilter}
              placeholder="All Stages"
              className="w-full"
            />
          </div>
          {regions.length > 0 && (
            <div className="w-full sm:w-[180px]">
              <MultiSelectDropdown
                options={regions.map(r => ({ id: r, name: r }))}
                selectedIds={regionFilter}
                onChange={setRegionFilter}
                placeholder="All Regions"
                className="w-full"
              />
            </div>
          )}
          {(viewMode === 'grid' || viewMode === 'list') && (
            <select
              value={sortBy}
              aria-label="Sort pursuits"
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="updated">Last Updated</option>
              <option value="newest">Newest First</option>
              <option value="name">Name A→Z</option>
              <option value="city">City A→Z</option>
            </select>
          )}
        </div>

        {/* Loading */}
        {loadingPursuits && (
          <div className="flex justify-center py-24" role="status" aria-label="Loading pursuits">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--text-faint)]" />
          </div>
        )}

        {/* Error */}
        {!loadingPursuits && isError && (
          <div role="alert" className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--danger-bg)] flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-[var(--danger)]" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">Couldn&rsquo;t load pursuits</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md">
              {pursuitsError instanceof Error ? pursuitsError.message : 'Check your connection and try again.'}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-6 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* === GRID VIEW === */}
        {showResults && viewMode === 'grid' && filteredPursuits.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPursuits.map((pursuit) => (
              <PursuitCard key={pursuit.id} pursuit={pursuit} stages={stages} onDelete={setDeletePursuitId} />
            ))}
          </div>
        )}

        {/* === LIST VIEW === */}
        {showResults && viewMode === 'list' && filteredPursuits.length > 0 && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden sm:table-cell">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Stage</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Units</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">YOC</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden lg:table-cell">Updated</th>
                  <th className="w-10"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredPursuits.map((p: Pursuit) => {
                  const stage = p.stage_id ? stageById.get(p.stage_id) : undefined;
                  return (
                    <tr
                      key={p.id}
                      className="group border-b border-[var(--table-row-border)] last:border-b-0 hover:bg-[var(--bg-primary)] cursor-pointer transition-colors"
                      onClick={() => router.push(`/pursuits/${p.short_id}`)}
                      onMouseEnter={() => prefetch(p.short_id)}
                    >
                      <td className="px-4 py-3">
                        {/* Real link so the row is reachable by keyboard and can open in a new tab */}
                        <Link
                          href={`/pursuits/${p.short_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] hidden sm:table-cell">
                        {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {stage && (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                            style={{
                              backgroundColor: `${stage.color}15`,
                              color: stage.color,
                              border: `1px solid ${stage.color}30`,
                            }}
                          >
                            {stage.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--text-secondary)] hidden md:table-cell">{p.primary_units ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {/* Same precision as the grid cards and the one-pager */}
                        <span className="font-bold text-[var(--success)] tabular-nums">
                          {p.best_yoc && p.best_yoc > 0 ? formatPercent(p.best_yoc) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[var(--text-muted)] hidden lg:table-cell">
                        {new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-1 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletePursuitId(p.id); }}
                          className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                          title="Delete pursuit"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* === MAP VIEW === */}
        {showResults && viewMode === 'map' && pursuits.length > 0 && (
          <DashboardMap pursuits={filteredPursuits} stages={stages} />
        )}

        {/* Empty State (the map view keeps showing the map when filters match nothing) */}
        {showResults && filteredPursuits.length === 0 && (viewMode !== 'map' || pursuits.length === 0) && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-[var(--text-faint)]" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">
              {pursuits.length === 0 ? 'No pursuits yet' : 'No matching pursuits'}
            </h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md">
              {pursuits.length === 0
                ? 'Get started by creating your first pursuit to evaluate a development site.'
                : 'Try adjusting your search or filters.'}
            </p>
            {pursuits.length === 0 ? (
              <button
                onClick={openNewPursuitDialog}
                className="mt-6 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm"
              >
                Create First Pursuit
              </button>
            ) : (
              <button
                onClick={() => { setSearchQuery(''); setStageFilter([]); setRegionFilter([]); }}
                className="mt-6 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Pursuit Confirmation Dialog */}
      {deletePursuitId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={closeDeleteDialog}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-pursuit-title"
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-pursuit-title" className="text-lg font-semibold text-[var(--text-primary)] mb-2">Delete Pursuit</h2>
            <p className="text-sm text-[var(--text-muted)] mb-1">
              Are you sure you want to permanently delete <span className="font-medium text-[var(--text-primary)]">{deletingPursuit?.name}</span> and all its one-pagers?
            </p>
            <p className="text-xs text-[var(--danger)] mb-6">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeDeleteDialog}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                autoFocus
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePursuit}
                disabled={deletePursuitMutation.isPending}
                className="px-4 py-2 rounded-lg bg-[var(--danger)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium transition-opacity shadow-sm"
              >
                {deletePursuitMutation.isPending ? 'Deleting...' : 'Delete Pursuit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Pursuit Dialog — own component so typing in it doesn't re-render every card */}
      {showNewPursuitDialog && (
        <NewPursuitDialog defaultStageId={stages[0]?.id ?? null} onClose={closeNewPursuitDialog} />
      )}
    </AppShell>
  );
}

// ======================== New Pursuit Dialog ========================

function NewPursuitDialog({ defaultStageId, onClose }: { defaultStageId: string | null; onClose: () => void }) {
  const createPursuit = useCreatePursuit();

  const [newPursuitName, setNewPursuitName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newCounty, setNewCounty] = useState('');
  const [newZip, setNewZip] = useState('');
  const [newLat, setNewLat] = useState<number | null>(null);
  const [newLng, setNewLng] = useState<number | null>(null);
  const [newRegion, setNewRegion] = useState('');
  const [addressMode, setAddressMode] = useState<'search' | 'coords'>('search');
  const [addressSearch, setAddressSearch] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [coordLatStr, setCoordLatStr] = useState('');
  const [coordLngStr, setCoordLngStr] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest geocoding request may write results (slow responses used to overwrite newer ones)
  const searchSeqRef = useRef(0);
  const [isGeocodingCoords, setIsGeocodingCoords] = useState(false);

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (coordTimeoutRef.current) clearTimeout(coordTimeoutRef.current);
  }, []);

  const handleClose = () => { if (!createPursuit.isPending) onClose(); };
  useEscapeKey(true, () => {
    if (showSuggestions) setShowSuggestions(false);
    else handleClose();
  });

  // Address autocomplete
  const handleAddressSearch = useCallback((query: string) => {
    setAddressSearch(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const seq = ++searchSeqRef.current;
    if (!query.trim() || !MAPBOX_TOKEN) { setSuggestions([]); setShowSuggestions(false); return; }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,place&country=US&limit=5`
        );
        const data = await res.json();
        if (seq !== searchSeqRef.current) return;
        setSuggestions(data.features || []);
        setShowSuggestions(true);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  const selectAddressSuggestion = useCallback((feature: any) => {
    const [lng, lat] = feature.center;
    const context = feature.context || [];
    const findCtx = (type: string) => context.find((c: any) => c.id?.startsWith(type))?.text || '';

    const parts = feature.place_name.split(',');
    setNewAddress(parts[0]?.trim() || '');
    setNewCity(findCtx('place') || '');
    setNewState(findCtx('region') || '');
    setNewZip(findCtx('postcode') || '');
    setNewCounty(findCtx('district') || '');
    setNewLat(lat);
    setNewLng(lng);
    setAddressSearch(feature.place_name);
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  const applyCoords = useCallback((latStr: string, lngStr: string) => {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    setNewLat(lat);
    setNewLng(lng);
    // Reverse geocode to fill address
    if (MAPBOX_TOKEN) {
      setIsGeocodingCoords(true);
      fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address,place`)
        .then(r => r.json())
        .then(data => {
          if (data.features?.length > 0) {
            const f = data.features[0];
            const ctx = f.context || [];
            const findCtx = (type: string) => ctx.find((c: any) => c.id?.startsWith(type))?.text || '';
            const parts = f.place_name.split(',');
            setNewAddress(parts[0]?.trim() || '');
            setNewCity(findCtx('place') || '');
            setNewState(findCtx('region') || '');
            setNewZip(findCtx('postcode') || '');
            setNewCounty(findCtx('district') || '');
          }
        })
        .catch(() => { })
        .finally(() => setIsGeocodingCoords(false));
    }
  }, []);

  const handleCoordChange = (latStr: string, lngStr: string) => {
    setCoordLatStr(latStr);
    setCoordLngStr(lngStr);
    // Debounced auto-apply if both coords are valid
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setNewLat(lat); setNewLng(lng); // Set immediately
      if (coordTimeoutRef.current) clearTimeout(coordTimeoutRef.current);
      coordTimeoutRef.current = setTimeout(() => applyCoords(latStr, lngStr), 500);
    }
  };

  const handleCreatePursuit = async () => {
    if (!newPursuitName.trim()) return;
    try {
      await createPursuit.mutateAsync({
        name: newPursuitName.trim(),
        address: newAddress,
        city: newCity,
        state: newState,
        county: newCounty,
        zip: newZip,
        latitude: newLat,
        longitude: newLng,
        site_area_sf: 0,
        stage_id: defaultStageId,
        stage_changed_at: new Date().toISOString(),
        exec_summary: null,
        arch_notes: null,
        region: newRegion,
        demographics: null,
        demographics_updated_at: null,
        parcel_data: null,
        parcel_data_updated_at: null,
        drive_time_data: null,
        income_heatmap_data: null,
        parcel_assemblage: null,
        is_archived: false,
        primary_one_pager_id: null,
        executive_memo: null,
      });
      toast.success(`Created “${newPursuitName.trim()}”`);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to create pursuit:', err);
      toast.error('Failed to create pursuit', err);
    }
  };

  const inputClass = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm overflow-y-auto py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-pursuit-title"
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-lg shadow-xl animate-fade-in mx-4 my-auto"
      >
        <h2 id="new-pursuit-title" className="text-lg font-semibold text-[var(--text-primary)] mb-4">New Pursuit</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!isGeocodingCoords) handleCreatePursuit(); }}
          className="space-y-4"
        >
          {/* Name */}
          <div>
            <label htmlFor="new-pursuit-name" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
              Pursuit Name <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              id="new-pursuit-name"
              type="text"
              value={newPursuitName}
              onChange={(e) => setNewPursuitName(e.target.value)}
              placeholder="e.g., Main & Elm Site"
              className={inputClass}
              required
              autoFocus
            />
          </div>

          {/* Location toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Location</span>
              <div className="flex items-center rounded-md bg-[var(--bg-elevated)] p-0.5 text-xs" role="group" aria-label="Location input">
                <button
                  type="button"
                  onClick={() => setAddressMode('search')}
                  aria-pressed={addressMode === 'search'}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${addressMode === 'search' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                >
                  <Search className="w-3 h-3" aria-hidden /> Address
                </button>
                <button
                  type="button"
                  onClick={() => setAddressMode('coords')}
                  aria-pressed={addressMode === 'coords'}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${addressMode === 'coords' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                >
                  <Navigation className="w-3 h-3" aria-hidden /> Coordinates
                </button>
              </div>
            </div>

            {addressMode === 'search' && (
              <div className="relative">
                <div className="flex items-center gap-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 focus-within:border-[var(--accent)]">
                  <MapPin className="w-3.5 h-3.5 text-[var(--text-faint)] flex-shrink-0" aria-hidden />
                  <input
                    type="text"
                    aria-label="Search an address or place"
                    value={addressSearch}
                    onChange={(e) => handleAddressSearch(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter picks the top suggestion instead of submitting the form
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (showSuggestions && suggestions[0]) selectAddressSuggestion(suggestions[0]);
                      }
                    }}
                    placeholder="Search an address or place..."
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                  />
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {suggestions.map((s: any) => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => selectAddressSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--accent-subtle)] transition-colors border-b border-[var(--table-row-border)] last:border-b-0"
                      >
                        <div className="font-medium text-xs">{s.text}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.place_name}</div>
                      </button>
                    ))}
                  </div>
                )}
                {/* Show selected address details */}
                {newLat !== null && newLng !== null && (
                  <div className="mt-2 px-3 py-2 bg-[var(--accent-subtle)] rounded-lg text-xs text-[var(--text-primary)]">
                    <div className="font-medium">{newAddress}</div>
                    <div className="text-[var(--text-muted)] mt-0.5">
                      {[newCity, newState, newZip].filter(Boolean).join(', ')}
                      {' · '}{newLat.toFixed(4)}, {newLng.toFixed(4)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {addressMode === 'coords' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    aria-label="Latitude"
                    value={coordLatStr}
                    onChange={(e) => handleCoordChange(e.target.value, coordLngStr)}
                    placeholder="Latitude (e.g., 30.267)"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    aria-label="Longitude"
                    value={coordLngStr}
                    onChange={(e) => handleCoordChange(coordLatStr, e.target.value)}
                    placeholder="Longitude (e.g., -97.743)"
                    className={inputClass}
                  />
                </div>
                {isGeocodingCoords && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]" role="status">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Reverse geocoding...
                  </div>
                )}
                {newLat !== null && newLng !== null && (
                  <div className="px-3 py-2 bg-[var(--accent-subtle)] rounded-lg text-xs text-[var(--text-primary)]">
                    <div className="font-medium">{newAddress || 'Coordinates set'}</div>
                    <div className="text-[var(--text-muted)] mt-0.5">
                      {[newCity, newState, newZip].filter(Boolean).join(', ') || `${newLat.toFixed(4)}, ${newLng.toFixed(4)}`}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Region */}
          <div>
            <label htmlFor="new-pursuit-region" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Region</label>
            <input
              id="new-pursuit-region"
              type="text"
              value={newRegion}
              onChange={(e) => setNewRegion(e.target.value)}
              placeholder="e.g., DFW, Austin, Charlotte"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newPursuitName.trim() || createPursuit.isPending || isGeocodingCoords}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm"
            >
              {createPursuit.isPending ? 'Creating...' : 'Create Pursuit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================== Dashboard Map Component ========================

interface DashboardMapProps {
  pursuits: Pursuit[];
  stages: PursuitStage[];
}

type MapStyleId = 'light' | 'satellite' | '3d';

const MAP_STYLES: Record<MapStyleId, { url: string; label: string }> = {
  light: { url: 'mapbox://styles/mapbox/light-v11', label: 'Map' },
  satellite: { url: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Satellite' },
  '3d': { url: 'mapbox://styles/mapbox/outdoors-v12', label: '3D' },
};

const PURSUIT_SOURCE = 'pursuits';
const CLUSTER_LAYER = 'pursuit-clusters';
const CLUSTER_COUNT_LAYER = 'pursuit-cluster-count';
const POINT_LAYER = 'pursuit-points';
const LABEL_LAYER = 'pursuit-labels';
const FALLBACK_STAGE_COLOR = '#94A3B8';
// Names appear once there's room for them; Mapbox drops labels that would collide.
const LABEL_MIN_ZOOM = 11;

type PursuitFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, { shortId: string; name: string; stage: string; color: string }>;

/**
 * Pursuits are drawn as a clustered GeoJSON layer instead of one DOM marker per
 * pursuit: dense metros (a dozen sites within a few miles) collapse into count
 * bubbles that expand on click, and individual sites are stage-colored dots
 * with collision-aware name labels once zoomed in. Colors are literal because
 * they paint on the Mapbox canvas, which doesn't follow the app theme.
 */
function ensurePursuitLayers(map: MapboxMap, data: PursuitFeatureCollection) {
  if (!map.getSource(PURSUIT_SOURCE)) {
    map.addSource(PURSUIT_SOURCE, {
      type: 'geojson',
      data,
      cluster: true,
      clusterMaxZoom: LABEL_MIN_ZOOM,
      clusterRadius: 44,
    });
  }
  if (!map.getLayer(CLUSTER_LAYER)) {
    map.addLayer({
      id: CLUSTER_LAYER,
      type: 'circle',
      source: PURSUIT_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#1A1F2B',
        'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 15, 5, 19, 15, 24],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
      },
    });
  }
  if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: PURSUIT_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#FFFFFF' },
    });
  }
  if (!map.getLayer(POINT_LAYER)) {
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: PURSUIT_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 14, 9],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
      },
    });
  }
  if (!map.getLayer(LABEL_LAYER)) {
    map.addLayer({
      id: LABEL_LAYER,
      type: 'symbol',
      source: PURSUIT_SOURCE,
      filter: ['!', ['has', 'point_count']],
      minzoom: LABEL_MIN_ZOOM,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-size': 12,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 12,
      },
      paint: {
        'text-color': '#1A1F2B',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1.5,
      },
    });
  }
}

/** Hover card content, built with DOM text nodes — names are user-entered. */
function buildPopupContent(name: string, stage: string, color: string) {
  const root = document.createElement('div');
  root.style.cssText = 'font-family:inherit;min-width:120px;';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:12px;font-weight:600;color:#1A1F2B;line-height:1.3;';
  title.textContent = name;
  const stageRow = document.createElement('div');
  stageRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11px;color:#4A5568;';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:8px;height:8px;border-radius:9999px;flex-shrink:0;';
  dot.style.background = color;
  stageRow.appendChild(dot);
  stageRow.appendChild(document.createTextNode(stage));
  root.appendChild(title);
  root.appendChild(stageRow);
  return root;
}

function DashboardMap({ pursuits, stages }: DashboardMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [activeStyle, setActiveStyle] = useState<MapStyleId>('light');
  const appliedStyleRef = useRef<MapStyleId>('light');

  // Build stage color map
  const stageColorMap = useMemo(() => {
    const m: Record<string, { name: string; color: string }> = {};
    stages.forEach((s) => { m[s.id] = { name: s.name, color: s.color }; });
    return m;
  }, [stages]);

  // Pursuits with location
  const locatedPursuits = useMemo(
    () => pursuits.filter((p) => p.latitude != null && p.longitude != null),
    [pursuits]
  );

  const geojson = useMemo<PursuitFeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: locatedPursuits.map((p) => {
      const stageInfo = stageColorMap[p.stage_id || ''];
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude!, p.latitude!] },
        properties: {
          shortId: p.short_id,
          name: p.name || 'Untitled pursuit',
          stage: stageInfo?.name || 'No stage',
          color: stageInfo?.color || FALLBACK_STAGE_COLOR,
        },
      };
    }),
  }), [locatedPursuits, stageColorMap]);

  // Latest values for the long-lived map callbacks
  const geojsonRef = useRef(geojson);
  const routerRef = useRef(router);
  useEffect(() => {
    geojsonRef.current = geojson;
    routerRef.current = router;
  });

  // Initialize map (mapbox-gl is only downloaded when the map view is opened)
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;

    let map: MapboxMap | null = null;
    let popup: MapboxPopup | null = null;
    let cancelled = false;
    import('mapbox-gl').then((mapboxgl) => {
      if (cancelled || !containerRef.current) return;
      const mbgl = mapboxgl.default;
      mbgl.accessToken = MAPBOX_TOKEN;

      const initial = geojsonRef.current.features;
      let center: [number, number] = [-97.7431, 32.0];
      let zoom = 4;
      if (initial.length === 1) {
        center = initial[0].geometry.coordinates as [number, number];
        zoom = 12;
      }

      containerRef.current.innerHTML = '';
      const m = new mbgl.Map({
        container: containerRef.current,
        style: MAP_STYLES.light.url,
        center,
        zoom,
        interactive: true,
      });
      map = m;
      mapRef.current = m;

      m.addControl(new mbgl.NavigationControl({ showCompass: true }), 'top-right');
      popup = new mbgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

      m.on('load', () => {
        const features = geojsonRef.current.features;
        if (features.length > 1) {
          const bounds = new mbgl.LngLatBounds();
          features.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
          m.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
        }
      });

      // Layers are (re)added on every style load — setStyle() wipes custom sources.
      m.on('style.load', () => ensurePursuitLayers(m, geojsonRef.current));

      // Layer-scoped listeners survive style swaps (they're keyed by layer id).
      m.on('click', CLUSTER_LAYER, (e: MapMouseEvent) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = m.getSource(PURSUIT_SOURCE) as GeoJSONSource | undefined;
        if (!feature || clusterId == null || !source) return;
        source.getClusterExpansionZoom(clusterId, (err, expansionZoom) => {
          if (err || expansionZoom == null) return;
          m.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom: expansionZoom });
        });
      });
      const openPursuit = (e: MapMouseEvent) => {
        const shortId = e.features?.[0]?.properties?.shortId;
        if (shortId) routerRef.current.push(`/pursuits/${shortId}`);
      };
      m.on('click', POINT_LAYER, openPursuit);
      m.on('click', LABEL_LAYER, openPursuit);

      m.on('mouseenter', CLUSTER_LAYER, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', CLUSTER_LAYER, () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseenter', POINT_LAYER, (e: MapMouseEvent) => {
        m.getCanvas().style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature || !popup) return;
        const { name, stage, color } = feature.properties as { name: string; stage: string; color: string };
        popup
          .setLngLat((feature.geometry as GeoJSON.Point).coordinates as [number, number])
          .setDOMContent(buildPopupContent(name, stage, color))
          .addTo(m);
      });
      m.on('mouseleave', POINT_LAYER, () => {
        m.getCanvas().style.cursor = '';
        popup?.remove();
      });
    });

    return () => {
      cancelled = true;
      popup?.remove();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Push filter changes into the existing source instead of rebuilding markers
  useEffect(() => {
    const source = mapRef.current?.getSource(PURSUIT_SOURCE) as GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [geojson]);

  // Handle style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Avoid re-setting the same style
    if (appliedStyleRef.current === activeStyle) return;
    appliedStyleRef.current = activeStyle;

    map.setStyle(MAP_STYLES[activeStyle].url);

    map.once('style.load', () => {
      // Pursuit layers are re-added by the persistent style.load handler
      if (activeStyle === '3d') {
        try {
          if (!map.getSource('mapbox-dem')) {
            map.addSource('mapbox-dem', {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14,
            });
          }
          map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
          map.easeTo({ pitch: 45, duration: 800 });
        } catch (e) {
          console.warn('Terrain setup skipped:', e);
        }
      } else {
        try {
          map.setTerrain(null);
          if (map.getPitch() > 0) {
            map.easeTo({ pitch: 0, duration: 500 });
          }
        } catch { /* ok */ }
      }
    });
  }, [activeStyle]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-[500px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <Map className="w-8 h-8 text-[var(--text-faint)] mx-auto mb-3" aria-hidden />
          <p className="text-sm text-[var(--text-muted)]">Add <code className="text-xs bg-[var(--bg-elevated)] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local to enable the map view.</p>
        </div>
      </div>
    );
  }

  const legendStages = stages.filter((s) => s.is_active);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-[65vh] min-h-[420px] sm:h-[600px] rounded-xl border border-[var(--border)] overflow-hidden"
      />

      {/* Style Switcher — top-right, left of the zoom controls */}
      <div className="absolute z-10 top-4 right-14 flex bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-lg border border-[var(--border)] shadow-sm overflow-hidden" role="group" aria-label="Map style">
        {(Object.keys(MAP_STYLES) as MapStyleId[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveStyle(key)}
            aria-pressed={activeStyle === key}
            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${activeStyle === key
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}
          >
            {MAP_STYLES[key].label}
          </button>
        ))}
      </div>

      {/* Legend — sits above the Mapbox logo and scrolls if there are many stages */}
      {legendStages.length > 0 && (
        <div className="absolute z-10 bottom-9 left-3 max-h-[calc(100%-7rem)] overflow-y-auto bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-lg border border-[var(--border)] shadow-sm px-3 py-2">
          <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Stage Legend</div>
          <ul className="space-y-1">
            {legendStages.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs leading-4 text-[var(--text-secondary)] whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} aria-hidden />
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Count — drops below the style switcher on narrow screens so they don't overlap */}
      <div className="absolute z-10 top-14 sm:top-4 left-3 sm:left-4 max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-18rem)] bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-lg border border-[var(--border)] shadow-sm px-3 py-1.5 text-xs text-[var(--text-secondary)]">
        <span className="font-semibold">{locatedPursuits.length}</span> of {pursuits.length} pursuits on map
        {locatedPursuits.length < pursuits.length && (
          <span className="text-[var(--text-muted)] ml-1">({pursuits.length - locatedPursuits.length} missing location)</span>
        )}
      </div>
    </div>
  );
}
