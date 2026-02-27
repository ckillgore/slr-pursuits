'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PursuitCard } from '@/components/pursuits/PursuitCard';
import { usePursuits, useStages, useCreatePursuit, useDeletePursuit, useProductTypes } from '@/hooks/useSupabaseQueries';
import { Search, Building2, Loader2, Map, LayoutGrid, List, MapPin, Navigation, Trash2 } from 'lucide-react';
import type { Pursuit } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DashboardPage() {
  const router = useRouter();
  const { data: pursuits = [], isLoading: loadingPursuits } = usePursuits();
  const { data: stages = [] } = useStages();
  const { data: productTypes = [] } = useProductTypes();
  const createPursuit = useCreatePursuit();
  const deletePursuitMutation = useDeletePursuit();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'city'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'map' | 'list'>('grid');

  // New Pursuit dialog state
  const [showNewPursuitDialog, setShowNewPursuitDialog] = useState(false);
  const [deletePursuitId, setDeletePursuitId] = useState<string | null>(null);
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

  // Derive unique regions from pursuits
  const regions = useMemo(() => {
    const unique = new Set(pursuits.map((p) => p.region).filter(Boolean));
    return Array.from(unique).sort();
  }, [pursuits]);

  const filteredPursuits = useMemo(() => {
    const filtered = pursuits.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStage = !stageFilter || p.stage_id === stageFilter;
      const matchesRegion = !regionFilter || p.region === regionFilter;
      return matchesSearch && matchesStage && matchesRegion;
    });

    // Sort
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'city':
        filtered.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }
    return filtered;
  }, [pursuits, searchQuery, stageFilter, regionFilter, sortBy]);

  // Address autocomplete
  const handleAddressSearch = useCallback((query: string) => {
    setAddressSearch(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim() || !MAPBOX_TOKEN) { setSuggestions([]); setShowSuggestions(false); return; }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,place&country=US&limit=5`
        );
        const data = await res.json();
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

  const applyCoords = () => {
    const lat = parseFloat(coordLatStr);
    const lng = parseFloat(coordLngStr);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    setNewLat(lat);
    setNewLng(lng);
    // Reverse geocode to fill address
    if (MAPBOX_TOKEN) {
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
        .catch(() => { });
    }
  };

  const resetNewPursuitForm = () => {
    setNewPursuitName('');
    setNewAddress('');
    setNewCity('');
    setNewState('');
    setNewCounty('');
    setNewZip('');
    setNewLat(null);
    setNewLng(null);
    setNewRegion('');
    setAddressSearch('');
    setCoordLatStr('');
    setCoordLngStr('');
    setSuggestions([]);
    setShowSuggestions(false);
    setAddressMode('search');
  };

  const handleCreatePursuit = async () => {
    if (!newPursuitName.trim()) return;
    const defaultStage = stages[0];
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
        stage_id: defaultStage?.id ?? null,
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
        created_by: null,
        is_archived: false,
        primary_one_pager_id: null,
      });
      resetNewPursuitForm();
      setShowNewPursuitDialog(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('Failed to create pursuit:', msg, err);
    }
  };

  return (
    <AppShell onNewPursuit={() => setShowNewPursuitDialog(true)}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Page Header */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#1A1F2B]">Pursuits</h1>
            <p className="text-sm text-[#7A8599] mt-1">
              {pursuits.length} active pursuit{pursuits.length !== 1 ? 's' : ''}
            </p>
          </div>
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg bg-[#F4F5F7] p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599] hover:text-[#4A5568]'}`}
            >
              <LayoutGrid className="w-4 h-4" /> Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599] hover:text-[#4A5568]'}`}
            >
              <List className="w-4 h-4" /> List
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'map' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599] hover:text-[#4A5568]'}`}
            >
              <Map className="w-4 h-4" /> Map
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AABB]" />
            <input
              type="text"
              placeholder="Search pursuits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none transition-all"
            />
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#4A5568] focus:border-[#2563EB] focus:outline-none"
          >
            <option value="">All Stages</option>
            {stages.filter((s) => s.is_active).map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          {regions.length > 0 && (
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#4A5568] focus:border-[#2563EB] focus:outline-none"
            >
              <option value="">All Regions</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
          {(viewMode === 'grid' || viewMode === 'list') && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'name' | 'city')}
              className="px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#4A5568] focus:border-[#2563EB] focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="name">Name A→Z</option>
              <option value="city">City A→Z</option>
            </select>
          )}
        </div>

        {/* Loading */}
        {loadingPursuits && (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[#C8CDD5]" />
          </div>
        )}

        {/* === GRID VIEW === */}
        {!loadingPursuits && viewMode === 'grid' && filteredPursuits.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPursuits.map((pursuit) => (
              <PursuitCard key={pursuit.id} pursuit={pursuit} stages={stages} onDelete={(id) => setDeletePursuitId(id)} />
            ))}
          </div>
        )}

        {/* === LIST VIEW === */}
        {!loadingPursuits && viewMode === 'list' && filteredPursuits.length > 0 && (
          <div className="bg-white border border-[#E2E5EA] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E5EA] bg-[#FAFBFC]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden sm:table-cell">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider">Stage</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden md:table-cell">Units</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider">YOC</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#7A8599] uppercase tracking-wider hidden lg:table-cell">Updated</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredPursuits.map((p: Pursuit) => {
                  const stage = stages.find(s => s.id === p.stage_id);
                  return (
                    <tr
                      key={p.id}
                      className="group border-b border-[#F0F1F4] last:border-b-0 hover:bg-[#FAFBFC] cursor-pointer transition-colors"
                      onClick={() => router.push(`/pursuits/${p.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-semibold text-[#1A1F2B] hover:text-[#2563EB] transition-colors">{p.name}</span>
                      </td>
                      <td className="px-4 py-3 text-[#7A8599] hidden sm:table-cell">
                        {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {stage && (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
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
                      <td className="px-4 py-3 text-center text-[#4A5568] hidden md:table-cell">{p.primary_units ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-[#0D7A3E]">
                          {p.best_yoc && p.best_yoc > 0 ? `${(p.best_yoc * 100).toFixed(1)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[#7A8599] hidden lg:table-cell">
                        {new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-1 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletePursuitId(p.id); }}
                          className="p-1.5 rounded-md text-[#A0AABB] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-all opacity-0 group-hover:opacity-100"
                          title="Delete pursuit"
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
        {!loadingPursuits && viewMode === 'map' && (
          <DashboardMap pursuits={filteredPursuits} stages={stages} />
        )}

        {/* Empty State */}
        {!loadingPursuits && filteredPursuits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#F4F5F7] flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-[#A0AABB]" />
            </div>
            <h3 className="text-lg font-semibold text-[#4A5568] mb-2">
              {pursuits.length === 0 ? 'No pursuits yet' : 'No matching pursuits'}
            </h3>
            <p className="text-sm text-[#7A8599] max-w-md">
              {pursuits.length === 0
                ? 'Get started by creating your first pursuit to evaluate a development site.'
                : 'Try adjusting your search or filters.'}
            </p>
            {pursuits.length === 0 && (
              <button
                onClick={() => setShowNewPursuitDialog(true)}
                className="mt-6 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] text-white text-sm font-medium transition-colors shadow-sm"
              >
                Create First Pursuit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Pursuit Confirmation Dialog */}
      {deletePursuitId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-sm shadow-xl animate-fade-in mx-4">
            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-2">Delete Pursuit</h2>
            <p className="text-sm text-[#7A8599] mb-1">
              Are you sure you want to permanently delete <span className="font-medium text-[#1A1F2B]">{pursuits.find(p => p.id === deletePursuitId)?.name}</span> and all its one-pagers?
            </p>
            <p className="text-xs text-[#DC2626] mb-6">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletePursuitId(null)}
                className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await deletePursuitMutation.mutateAsync(deletePursuitId);
                  setDeletePursuitId(null);
                }}
                disabled={deletePursuitMutation.isPending}
                className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
              >
                {deletePursuitMutation.isPending ? 'Deleting...' : 'Delete Pursuit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Pursuit Dialog */}
      {showNewPursuitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-lg shadow-xl animate-fade-in mx-4">
            <h2 className="text-lg font-semibold text-[#1A1F2B] mb-4">New Pursuit</h2>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                  Pursuit Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={newPursuitName}
                  onChange={(e) => setNewPursuitName(e.target.value)}
                  placeholder="e.g., Main & Elm Site"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Location toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#4A5568] uppercase tracking-wider">Location</label>
                  <div className="flex items-center rounded-md bg-[#F4F5F7] p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setAddressMode('search')}
                      className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${addressMode === 'search' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599]'}`}
                    >
                      <Search className="w-3 h-3" /> Address
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddressMode('coords')}
                      className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${addressMode === 'coords' ? 'bg-white text-[#1A1F2B] shadow-sm' : 'text-[#7A8599]'}`}
                    >
                      <Navigation className="w-3 h-3" /> Coordinates
                    </button>
                  </div>
                </div>

                {addressMode === 'search' && (
                  <div className="relative">
                    <div className="flex items-center gap-2 bg-[#FAFBFC] border border-[#E2E5EA] rounded-lg px-3 py-2">
                      <MapPin className="w-3.5 h-3.5 text-[#A0AABB] flex-shrink-0" />
                      <input
                        type="text"
                        value={addressSearch}
                        onChange={(e) => handleAddressSearch(e.target.value)}
                        placeholder="Search an address or place..."
                        className="flex-1 bg-transparent text-sm text-[#1A1F2B] outline-none placeholder:text-[#A0AABB]"
                      />
                    </div>
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-[#E2E5EA] rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        {suggestions.map((s: any) => (
                          <button
                            key={s.id}
                            onClick={() => selectAddressSuggestion(s)}
                            className="w-full text-left px-3 py-2.5 text-sm text-[#1A1F2B] hover:bg-[#EBF1FF] transition-colors border-b border-[#F0F1F4] last:border-b-0"
                          >
                            <div className="font-medium text-xs">{s.text}</div>
                            <div className="text-[10px] text-[#7A8599] mt-0.5">{s.place_name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Show selected address details */}
                    {newLat !== null && (
                      <div className="mt-2 px-3 py-2 bg-[#EBF1FF] rounded-lg text-xs text-[#1A1F2B]">
                        <div className="font-medium">{newAddress}</div>
                        <div className="text-[#7A8599] mt-0.5">
                          {[newCity, newState, newZip].filter(Boolean).join(', ')}
                          {' · '}{newLat.toFixed(4)}, {newLng!.toFixed(4)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {addressMode === 'coords' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input
                          type="number"
                          step="any"
                          value={coordLatStr}
                          onChange={(e) => setCoordLatStr(e.target.value)}
                          placeholder="Latitude (e.g., 30.267)"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          step="any"
                          value={coordLngStr}
                          onChange={(e) => setCoordLngStr(e.target.value)}
                          placeholder="Longitude (e.g., -97.743)"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={applyCoords}
                      disabled={!coordLatStr || !coordLngStr}
                      className="text-xs text-[#2563EB] hover:text-[#1D4FD7] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Geocode → Auto-fill address
                    </button>
                    {newLat !== null && (
                      <div className="px-3 py-2 bg-[#EBF1FF] rounded-lg text-xs text-[#1A1F2B]">
                        <div className="font-medium">{newAddress || 'Coordinates set'}</div>
                        <div className="text-[#7A8599] mt-0.5">
                          {[newCity, newState, newZip].filter(Boolean).join(', ') || `${newLat.toFixed(4)}, ${newLng!.toFixed(4)}`}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Region */}
              <div>
                <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">Region</label>
                <input
                  type="text"
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  placeholder="e.g., DFW, Austin, Charlotte"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { resetNewPursuitForm(); setShowNewPursuitDialog(false); }}
                className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePursuit}
                disabled={!newPursuitName.trim() || createPursuit.isPending}
                className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm"
              >
                {createPursuit.isPending ? 'Creating...' : 'Create Pursuit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ======================== Dashboard Map Component ========================

interface DashboardMapProps {
  pursuits: Pursuit[];
  stages: { id: string; name: string; color: string; sort_order: number; is_active: boolean }[];
}

function DashboardMap({ pursuits, stages }: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const mbglRef = useRef<any>(null);

  type MapStyleId = 'light' | 'satellite' | '3d';
  const [activeStyle, setActiveStyle] = useState<MapStyleId>('light');

  const STYLES: Record<MapStyleId, { url: string; label: string }> = {
    light: { url: 'mapbox://styles/mapbox/light-v11', label: 'Map' },
    satellite: { url: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Satellite' },
    '3d': { url: 'mapbox://styles/mapbox/outdoors-v12', label: '3D' },
  };

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

  // Add markers helper
  const addMarkers = useCallback((map: any, mbgl: any) => {
    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    locatedPursuits.forEach((p) => {
      const stageInfo = stageColorMap[p.stage_id || ''];
      const color = stageInfo?.color || '#7A8599';
      const stageName = stageInfo?.name || 'Unknown';

      const el = document.createElement('div');
      el.style.cssText = 'cursor:pointer;display:flex;flex-direction:column;align-items:center;';
      el.innerHTML = `
        <div style="background:${color};color:#fff;font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.15);line-height:1.3;text-align:center;">
          ${p.name}
          <div style="font-weight:400;font-size:8px;opacity:0.85;">${stageName}</div>
        </div>
        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div>
      `;

      const marker = new mbgl.Marker({ element: el })
        .setLngLat([p.longitude!, p.latitude!])
        .addTo(map);

      el.addEventListener('click', () => {
        window.location.href = `/pursuits/${p.id}`;
      });

      markersRef.current.push(marker);
    });
  }, [locatedPursuits, stageColorMap]);

  // Initialize map
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;

    let map: any;
    import('mapbox-gl').then((mapboxgl) => {
      const mbgl = mapboxgl.default || mapboxgl;
      mbgl.accessToken = MAPBOX_TOKEN;
      mbglRef.current = mbgl;

      // Compute bounds
      let center: [number, number] = [-97.7431, 32.0];
      let zoom = 4;
      if (locatedPursuits.length === 1) {
        center = [locatedPursuits[0].longitude!, locatedPursuits[0].latitude!];
        zoom = 12;
      } else if (locatedPursuits.length > 1) {
        const bounds = new mbgl.LngLatBounds();
        locatedPursuits.forEach((p) => bounds.extend([p.longitude!, p.latitude!]));
        center = bounds.getCenter().toArray() as [number, number];
      }

      if (containerRef.current) containerRef.current.innerHTML = '';

      map = new mbgl.Map({
        container: containerRef.current!,
        style: STYLES.light.url,
        center,
        zoom,
        interactive: true,
      });

      map.addControl(new mbgl.NavigationControl({ showCompass: true }), 'top-right');

      map.on('load', () => {
        // Fit bounds if multiple
        if (locatedPursuits.length > 1) {
          const bounds = new mbgl.LngLatBounds();
          locatedPursuits.forEach((p) => bounds.extend([p.longitude!, p.latitude!]));
          map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
        }

        addMarkers(map, mbgl);
      });

      mapRef.current = map;
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (map) map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-add markers when the pursuits list changes (e.g. stage filter)
  useEffect(() => {
    const map = mapRef.current;
    const mbgl = mbglRef.current;
    if (!map || !mbgl) return;
    // Only re-add if map is loaded (style.load already fired)
    if (map.isStyleLoaded()) {
      addMarkers(map, mbgl);
    }
  }, [locatedPursuits, addMarkers]);

  // Handle style change
  useEffect(() => {
    const map = mapRef.current;
    const mbgl = mbglRef.current;
    if (!map || !mbgl) return;

    const styleUrl = STYLES[activeStyle].url;

    // Avoid re-setting same style
    map.setStyle(styleUrl);

    map.once('style.load', () => {
      // Re-add markers
      addMarkers(map, mbgl);

      // 3D terrain
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
        } catch (e) { /* ok */ }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStyle, addMarkers]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-[500px] rounded-xl border border-[#E2E5EA] bg-[#FAFBFC] flex items-center justify-center">
        <div className="text-center">
          <Map className="w-8 h-8 text-[#C8CDD5] mx-auto mb-3" />
          <p className="text-sm text-[#7A8599]">Add <code className="text-xs bg-[#F4F5F7] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local to enable the map view.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-[600px] rounded-xl border border-[#E2E5EA] overflow-hidden"
      />

      {/* Style Switcher — top-right */}
      <div className="absolute top-4 right-14 flex bg-white/95 backdrop-blur-sm rounded-lg border border-[#E2E5EA] shadow-sm overflow-hidden">
        {(Object.keys(STYLES) as MapStyleId[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveStyle(key)}
            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${activeStyle === key
              ? 'bg-[#2563EB] text-white'
              : 'text-[#4A5568] hover:bg-[#F4F5F7]'
              }`}
          >
            {STYLES[key].label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg border border-[#E2E5EA] shadow-sm px-3 py-2">
        <div className="text-[10px] font-bold text-[#7A8599] uppercase tracking-wider mb-1.5">Stage Legend</div>
        <div className="space-y-1">
          {stages.filter((s) => s.is_active).map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs text-[#4A5568]">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      </div>
      {/* Count */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg border border-[#E2E5EA] shadow-sm px-3 py-1.5 text-xs text-[#4A5568]">
        <span className="font-semibold">{locatedPursuits.length}</span> of {pursuits.length} pursuits on map
        {locatedPursuits.length < pursuits.length && (
          <span className="text-[#A0AABB] ml-1">({pursuits.length - locatedPursuits.length} missing location)</span>
        )}
      </div>
    </div>
  );
}
