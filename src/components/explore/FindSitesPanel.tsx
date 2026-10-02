'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import type { FeatureCollection } from 'geojson';
import { Loader2, X, Search, Download, AlertTriangle, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { addLayerOnce, upsertGeoJsonSource, setGeoJsonData } from '@/components/map/mapHelpers';
import { RegridUsageMeter, useRegridUsage, REGRID_USAGE_KEY } from '@/components/regrid/RegridUsageMeter';

// ======================== Types ========================

/** The parts of a Regrid parcel record (see /api/_lib/regridParcel) the results list reads */
export interface FoundParcel {
    details: {
        address: string | null; city: string | null; state: string | null; zip: string | null;
        lotSizeAcres: number | null; lotSizeSF: number | null; lastSaleDate: string | null; lastSalePrice: number | null;
        yearBuilt: number | null; useCodeDescription: string | null; landUse: string | null; parcelNumber: string | null;
    };
    zoning: { code: string | null; type: string | null; subtype: string | null };
    tax: { totalValue: number | null; landValue: number | null; improvementValue: number | null };
    owner: { name: string | null };
    geometry: GeoJSON.Geometry | null;
    regridId: string | null;
}

export interface FoundSite {
    parcel: FoundParcel;
    center: [number, number] | null;
}

type SortKey = 'acres' | 'landValue' | 'buildingRatio' | 'lastSale';

interface Filters {
    acresMin: string;
    acresMax: string;
    zoningSubtypes: string[];
    zoningCode: string;
    noBuildings: boolean;
    maxImprovementValue: string;
    ownerContains: string;
    notSoldSince: string; // year
    uspsVacant: boolean;
    opportunityZone: boolean;
}

// ======================== Constants ========================

/** Regrid's standardized zoning subtypes, grouped the way a multifamily search reads them */
const ZONING_GROUPS: { label: string; subtypes: string[] }[] = [
    { label: 'Residential', subtypes: ['Multi Family', 'Two Family', 'Single Family', 'Mobile Home Park'] },
    { label: 'Mixed & planned', subtypes: ['Mixed Use', 'Planned'] },
    { label: 'Commercial', subtypes: ['General Commercial', 'Core Commercial', 'Retail Commercial', 'Neighborhood Commercial', 'Office', 'Special Commercial'] },
    { label: 'Other', subtypes: ['Light Industrial', 'Industrial', 'Agriculture', 'Special'] },
];

const RADIUS_MILES = [0.5, 1, 2, 3, 5];
const LOAD_SIZES = [10, 25, 50];
// Regrid filters on at most 4 fields per search, and a polygon covers at most 80 sq mi
const MAX_FILTERS = 4;
const MAX_AREA_SQ_MI = 80;
const METERS_PER_MILE = 1609.34;

const DEFAULT_FILTERS: Filters = {
    acresMin: '2', acresMax: '', zoningSubtypes: ['Multi Family', 'Mixed Use'], zoningCode: '', noBuildings: false,
    maxImprovementValue: '', ownerContains: '', notSoldSince: '', uspsVacant: false, opportunityZone: false,
};

export const FIND_SITES_SOURCE = 'find-sites';
export const FIND_SITES_FILL = 'find-sites-fill';
const FIND_SITES_LINE = 'find-sites-line';
const FIND_SITES_DOT = 'find-sites-dot';
const SITE_COLOR = '#EA580C';

// ======================== Helpers ========================

const toNum = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? undefined : Number(s));

/** Request filters, and how many Regrid fields they use (each counts once) */
function requestFilters(f: Filters) {
    const body: Record<string, unknown> = {};
    const acresMin = toNum(f.acresMin), acresMax = toNum(f.acresMax);
    if (acresMin != null) body.acresMin = acresMin;
    if (acresMax != null) body.acresMax = acresMax;
    if (f.zoningSubtypes.length) body.zoningSubtypes = f.zoningSubtypes;
    if (f.zoningCode.trim()) body.zoningCode = f.zoningCode.trim();
    if (f.noBuildings) body.noBuildings = true;
    const maxImp = toNum(f.maxImprovementValue);
    if (maxImp != null) body.maxImprovementValue = maxImp;
    if (f.ownerContains.trim()) body.ownerContains = f.ownerContains.trim();
    if (f.notSoldSince) body.lastSaleBefore = `${f.notSoldSince}-01-01`;
    if (f.uspsVacant) body.uspsVacant = true;
    if (f.opportunityZone) body.opportunityZone = true;
    const used = new Set<string>();
    if (acresMin != null || acresMax != null) used.add('acres');
    for (const k of ['zoningSubtypes', 'zoningCode', 'noBuildings', 'maxImprovementValue', 'ownerContains', 'lastSaleBefore', 'uspsVacant', 'opportunityZone']) {
        if (k in body) used.add(k);
    }
    return { body, used };
}

function viewRing(map: MapboxMap): [number, number][] {
    const b = map.getBounds()!;
    const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
    return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}

function viewAreaSqMi(map: MapboxMap): number {
    const b = map.getBounds()!;
    const lat = ((b.getNorth() + b.getSouth()) / 2) * (Math.PI / 180);
    return (b.getEast() - b.getWest()) * 69.17 * Math.cos(lat) * (b.getNorth() - b.getSouth()) * 69.17;
}

const money = (v: number | null) =>
    v == null ? '—' : v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`;

/** Building value as a share of total value — low means the land carries the value */
function buildingRatio(p: FoundParcel): number | null {
    const { totalValue, improvementValue } = p.tax;
    return totalValue && improvementValue != null ? improvementValue / totalValue : null;
}

function sortValue(site: FoundSite, key: SortKey): number {
    const p = site.parcel;
    switch (key) {
        case 'acres': return -(p.details.lotSizeAcres ?? -1);
        case 'landValue': return -(p.tax.landValue ?? -1);
        case 'buildingRatio': return buildingRatio(p) ?? 2;
        case 'lastSale': return p.details.lastSaleDate ? Date.parse(p.details.lastSaleDate) : -Infinity;
    }
}

function csvCell(v: unknown): string {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(sites: FoundSite[]) {
    const header = ['Address', 'City', 'State', 'ZIP', 'Acres', 'Zoning', 'Zoning subtype', 'Owner', 'Land value', 'Building value', 'Total value', 'Last sale date', 'Last sale price', 'Parcel #', 'Latitude', 'Longitude'];
    const rows = sites.map(({ parcel: p, center }) => [
        p.details.address, p.details.city, p.details.state, p.details.zip, p.details.lotSizeAcres?.toFixed(2), p.zoning.code, p.zoning.subtype,
        p.owner.name, p.tax.landValue, p.tax.improvementValue, p.tax.totalValue, p.details.lastSaleDate, p.details.lastSalePrice, p.details.parcelNumber,
        center?.[1]?.toFixed(6), center?.[0]?.toFixed(6),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `sites-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
}

function addSiteLayers(map: MapboxMap, data: FeatureCollection) {
    upsertGeoJsonSource(map, FIND_SITES_SOURCE, data);
    addLayerOnce(map, {
        id: FIND_SITES_FILL, type: 'fill', source: FIND_SITES_SOURCE, filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': SITE_COLOR, 'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.45, 0.22] },
    });
    addLayerOnce(map, {
        id: FIND_SITES_LINE, type: 'line', source: FIND_SITES_SOURCE, filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': SITE_COLOR, 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5] },
    });
    // Parcels are specks when zoomed out — show a dot until the shapes read
    addLayerOnce(map, {
        id: FIND_SITES_DOT, type: 'circle', source: FIND_SITES_SOURCE, filter: ['==', ['geometry-type'], 'Point'], maxzoom: 14,
        paint: { 'circle-radius': 6, 'circle-color': SITE_COLOR, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.5 },
    });
}

function sitesToGeoJson(sites: FoundSite[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: sites.flatMap((s, i) => [
            ...(s.parcel.geometry ? [{ type: 'Feature' as const, id: i, geometry: s.parcel.geometry, properties: { index: i } }] : []),
            ...(s.center ? [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: s.center }, properties: { index: i } }] : []),
        ]),
    };
}

// ======================== Component ========================

export function FindSitesPanel({ map, ready, onClose, onOpenSite }: {
    map: MapboxMap | null;
    ready: boolean;
    onClose: () => void;
    onOpenSite: (site: FoundSite) => void;
}) {
    const { isAdminOrOwner } = useAuth();
    const queryClient = useQueryClient();
    const { data: usageData } = useRegridUsage();
    const usage = usageData?.usage;

    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [areaMode, setAreaMode] = useState<'view' | 'radius'>('view');
    const [radiusMiles, setRadiusMiles] = useState(1);
    const [loadSize, setLoadSize] = useState(25);
    // Bumped on map moves so the count follows the visible area
    const [viewVersion, setViewVersion] = useState(0);

    const [count, setCount] = useState<number | null>(null);
    const [counting, setCounting] = useState(false);
    const [countError, setCountError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<{ message: string; budget: boolean } | null>(null);
    const [sites, setSites] = useState<FoundSite[]>([]);
    const [sortKey, setSortKey] = useState<SortKey>('acres');
    const [selected, setSelected] = useState<number | null>(null);

    const { body: filterBody, used } = useMemo(() => requestFilters(filters), [filters]);
    const atFilterLimit = used.size >= MAX_FILTERS;
    const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
    /** A filter that's off can't be turned on once 4 are in use */
    const lockedOut = (key: string, active: boolean) => !active && atFilterLimit && !used.has(key);

    const areaSqMi = map && ready && areaMode === 'view' ? viewAreaSqMi(map) : null;
    const areaTooLarge = areaSqMi != null && areaSqMi > MAX_AREA_SQ_MI;
    const area = useMemo(() => {
        if (!map || !ready) return null;
        if (areaMode === 'view') return { type: 'polygon' as const, ring: viewRing(map) };
        const c = map.getCenter();
        return { type: 'radius' as const, latitude: c.lat, longitude: c.lng, radiusMeters: radiusMiles * METERS_PER_MILE };
    // viewVersion: recompute when the map moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, ready, areaMode, radiusMiles, viewVersion]);

    // ── Follow the map: recount for the area in view ──
    useEffect(() => {
        if (!map || !ready) return;
        const onMoveEnd = () => setViewVersion((v) => v + 1);
        map.on('moveend', onMoveEnd);
        return () => { map.off('moveend', onMoveEnd); };
    }, [map, ready]);

    // ── Free match count, debounced ──
    const countSeq = useRef(0);
    useEffect(() => {
        const seq = ++countSeq.current;
        setCountError(null);
        if (!area || used.size === 0 || areaTooLarge) { setCount(null); setCounting(false); return; }
        setCounting(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch('/api/regrid/find', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ area, filters: filterBody, mode: 'count' }),
                });
                const data = await res.json().catch(() => ({}));
                if (seq !== countSeq.current) return;
                if (!res.ok) throw new Error(data.error || 'Count failed');
                setCount(data.count);
            } catch (err) {
                if (seq === countSeq.current) { setCount(null); setCountError(err instanceof Error ? err.message : 'Count failed'); }
            } finally {
                if (seq === countSeq.current) setCounting(false);
            }
        }, 600);
        return () => clearTimeout(t);
    }, [area, filterBody, used.size, areaTooLarge]);

    // ── Map layer for results (re-added after a basemap switch) ──
    const geojson = useMemo(() => sitesToGeoJson(sites), [sites]);
    const geojsonRef = useRef(geojson);
    useEffect(() => {
        geojsonRef.current = geojson;
        if (!map || !ready) return;
        if (map.getSource(FIND_SITES_SOURCE)) setGeoJsonData(map, FIND_SITES_SOURCE, geojson);
        else addSiteLayers(map, geojson);
    }, [map, ready, geojson]);

    const openSite = useCallback((index: number) => {
        const site = sites[index];
        if (!site) return;
        setSelected(index);
        if (site.center) map?.flyTo({ center: site.center, zoom: Math.max(map.getZoom(), 16), duration: 1000 });
        onOpenSite(site);
    }, [sites, map, onOpenSite]);

    useEffect(() => {
        if (!map || !ready) return;
        const onStyle = () => addSiteLayers(map, geojsonRef.current);
        const onClick = (e: MapMouseEvent) => {
            const index = e.features?.[0]?.properties?.index;
            if (typeof index === 'number') openSite(index);
        };
        const pointer = () => { map.getCanvas().style.cursor = 'pointer'; };
        const unpointer = () => { map.getCanvas().style.cursor = ''; };
        map.on('style.load', onStyle);
        for (const layer of [FIND_SITES_FILL, FIND_SITES_DOT]) {
            map.on('click', layer, onClick);
            map.on('mouseenter', layer, pointer);
            map.on('mouseleave', layer, unpointer);
        }
        return () => {
            map.off('style.load', onStyle);
            for (const layer of [FIND_SITES_FILL, FIND_SITES_DOT]) {
                map.off('click', layer, onClick);
                map.off('mouseenter', layer, pointer);
                map.off('mouseleave', layer, unpointer);
            }
        };
    }, [map, ready, openSite]);

    // Highlight the open site's shape
    useEffect(() => {
        if (!map || !ready || !map.getSource(FIND_SITES_SOURCE)) return;
        map.removeFeatureState({ source: FIND_SITES_SOURCE });
        if (selected != null) map.setFeatureState({ source: FIND_SITES_SOURCE, id: selected }, { selected: true });
    }, [map, ready, selected, geojson]);

    // Clear the layer when the panel closes
    useEffect(() => () => {
        if (map?.getSource(FIND_SITES_SOURCE)) setGeoJsonData(map, FIND_SITES_SOURCE, { type: 'FeatureCollection', features: [] });
    }, [map]);

    // ── Load (billed) ──
    const recordsToLoad = count != null ? Math.min(loadSize, count) : loadSize;
    const load = async (allowOverage = false) => {
        if (!area) return;
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch('/api/regrid/find', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ area, filters: filterBody, mode: 'load', limit: recordsToLoad, allowOverage }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setLoadError({ message: data.error || 'Search failed', budget: data.code === 'regrid_budget' });
                return;
            }
            setSites(data.results ?? []);
            setSelected(null);
        } catch (err) {
            setLoadError({ message: err instanceof Error ? err.message : 'Search failed', budget: false });
        } finally {
            setLoading(false);
            queryClient.invalidateQueries({ queryKey: REGRID_USAGE_KEY });
        }
    };

    const sorted = useMemo(
        () => sites.map((s, i) => ({ s, i })).sort((a, b) => sortValue(a.s, sortKey) - sortValue(b.s, sortKey)),
        [sites, sortKey],
    );

    const remaining = usage ? usage.recordLimit - usage.records : null;
    const wouldExceed = remaining != null && recordsToLoad > remaining;
    const thisYear = new Date().getFullYear();

    const labelCls = 'text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold';
    const fieldCls = 'bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-40';
    const inputCls = `w-full ${fieldCls}`;
    const chip = (on: boolean, disabled = false) =>
        `px-2 py-0.5 rounded-md text-[11px] border transition-colors ${on
            ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
            : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'} ${disabled ? 'opacity-40 pointer-events-none' : ''}`;

    return (
        <div className="h-full flex flex-col bg-[var(--bg-card)]/95 backdrop-blur-sm border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden" role="region" aria-label="Find sites">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-[var(--accent)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Find sites</h2>
                </div>
                <button onClick={onClose} aria-label="Close find sites" className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-secondary)]">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Area */}
                <div className="px-4 py-3 border-b border-[var(--table-row-border)] space-y-2">
                    <div className={labelCls}>Search area</div>
                    <div className="flex gap-1.5" role="radiogroup" aria-label="Search area">
                        <button role="radio" aria-checked={areaMode === 'view'} onClick={() => setAreaMode('view')} className={chip(areaMode === 'view')}>Map view</button>
                        <button role="radio" aria-checked={areaMode === 'radius'} onClick={() => setAreaMode('radius')} className={chip(areaMode === 'radius')}>Radius from center</button>
                    </div>
                    {areaMode === 'radius' && (
                        <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Radius">
                            {RADIUS_MILES.map((m) => (
                                <button key={m} role="radio" aria-checked={radiusMiles === m} onClick={() => setRadiusMiles(m)} className={chip(radiusMiles === m)}>{m} mi</button>
                            ))}
                        </div>
                    )}
                    {areaMode === 'view' && areaSqMi != null && (
                        <p className={`text-[11px] ${areaTooLarge ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                            {areaTooLarge
                                ? `The map shows ${Math.round(areaSqMi).toLocaleString()} sq mi — zoom in to ${MAX_AREA_SQ_MI} or less, or use a radius.`
                                : `${areaSqMi < 10 ? areaSqMi.toFixed(1) : Math.round(areaSqMi)} sq mi in view`}
                        </p>
                    )}
                </div>

                {/* Filters */}
                <div className="px-4 py-3 border-b border-[var(--table-row-border)] space-y-3">
                    <div className="flex items-baseline justify-between">
                        <div className={labelCls}>Filters</div>
                        <div className={`text-[10px] ${atFilterLimit ? 'text-[var(--warning)]' : 'text-[var(--text-faint)]'}`}>{used.size} of {MAX_FILTERS} used</div>
                    </div>

                    <div>
                        <div className="text-[11px] text-[var(--text-secondary)] mb-1">Acreage</div>
                        <div className="flex items-center gap-2">
                            <input inputMode="decimal" aria-label="Minimum acres" placeholder="Min" value={filters.acresMin} disabled={lockedOut('acres', false)} onChange={(e) => set('acresMin', e.target.value)} className={inputCls} />
                            <span className="text-[var(--text-faint)] text-xs">to</span>
                            <input inputMode="decimal" aria-label="Maximum acres" placeholder="Max" value={filters.acresMax} disabled={lockedOut('acres', false)} onChange={(e) => set('acresMax', e.target.value)} className={inputCls} />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-baseline justify-between mb-1">
                            <span className="text-[11px] text-[var(--text-secondary)]">Zoning</span>
                            {filters.zoningSubtypes.length > 0 && <button onClick={() => set('zoningSubtypes', [])} className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text-secondary)]">Clear</button>}
                        </div>
                        <div className="space-y-1.5">
                            {ZONING_GROUPS.map((g) => (
                                <div key={g.label} className="flex flex-wrap gap-1">
                                    {g.subtypes.map((st) => {
                                        const on = filters.zoningSubtypes.includes(st);
                                        return (
                                            <button key={st} aria-pressed={on} disabled={lockedOut('zoningSubtypes', on)}
                                                onClick={() => set('zoningSubtypes', on ? filters.zoningSubtypes.filter((x) => x !== st) : [...filters.zoningSubtypes, st])}
                                                className={chip(on, lockedOut('zoningSubtypes', on))}>
                                                {st}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        <input aria-label="Zoning code contains" placeholder="Or zoning code contains… (e.g. MF-2)" value={filters.zoningCode}
                            disabled={lockedOut('zoningCode', !!filters.zoningCode)} onChange={(e) => set('zoningCode', e.target.value)} className={`${inputCls} mt-2`} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="text-[11px] text-[var(--text-secondary)]">Building value under</span>
                            <input inputMode="numeric" placeholder="$" value={filters.maxImprovementValue} disabled={lockedOut('maxImprovementValue', !!filters.maxImprovementValue)}
                                onChange={(e) => set('maxImprovementValue', e.target.value.replace(/[^0-9]/g, ''))} className={`${inputCls} mt-1`} />
                        </label>
                        <label className="block">
                            <span className="text-[11px] text-[var(--text-secondary)]">Not sold since</span>
                            <select value={filters.notSoldSince} disabled={lockedOut('lastSaleBefore', !!filters.notSoldSince)} onChange={(e) => set('notSoldSince', e.target.value)} className={`${inputCls} mt-1`}>
                                <option value="">Any</option>
                                {[5, 10, 15, 20, 30].map((y) => <option key={y} value={String(thisYear - y)}>{thisYear - y} ({y}+ yrs)</option>)}
                            </select>
                        </label>
                    </div>

                    <label className="block">
                        <span className="text-[11px] text-[var(--text-secondary)]">Owner name contains</span>
                        <input placeholder="e.g. LLC, Church, Trust" value={filters.ownerContains} disabled={lockedOut('ownerContains', !!filters.ownerContains)}
                            onChange={(e) => set('ownerContains', e.target.value)} className={`${inputCls} mt-1`} />
                    </label>

                    <div className="flex flex-wrap gap-1.5">
                        {([['noBuildings', 'noBuildings', 'No buildings'], ['uspsVacant', 'uspsVacant', 'USPS vacant'], ['opportunityZone', 'opportunityZone', 'Opportunity Zone']] as const).map(([key, field, label]) => {
                            const on = filters[key];
                            return (
                                <button key={key} aria-pressed={on} disabled={lockedOut(field, on)} onClick={() => set(key, !on)} className={chip(on, lockedOut(field, on))}>{label}</button>
                            );
                        })}
                    </div>
                    {filters.notSoldSince && <p className="text-[10px] text-[var(--text-faint)]">&ldquo;Not sold since&rdquo; leaves out parcels with no recorded sale date.</p>}
                </div>

                {/* Count + load */}
                <div className="px-4 py-3 border-b border-[var(--table-row-border)] space-y-3">
                    <div className="flex items-center justify-between gap-2" aria-live="polite">
                        <div className="text-sm text-[var(--text-secondary)]">
                            {counting ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Counting…</span>
                                : count != null ? <><span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{count.toLocaleString()}</span> {count === 1 ? 'parcel matches' : 'parcels match'}</>
                                : used.size === 0 ? <span className="text-[var(--text-muted)]">Add a filter to search</span>
                                : areaTooLarge ? <span className="text-[var(--text-muted)]">Zoom in to count</span>
                                : null}
                        </div>
                        <span className="text-[10px] text-[var(--text-faint)]">Counts are free</span>
                    </div>
                    {countError && <p className="text-xs text-[var(--danger)]">{countError}</p>}

                    <div className="flex items-center gap-2">
                        <select aria-label="How many to load" value={loadSize} onChange={(e) => setLoadSize(Number(e.target.value))} className={`${fieldCls} flex-none`}>
                            {LOAD_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <button
                            onClick={() => void load()}
                            disabled={loading || !count || areaTooLarge || wouldExceed}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-medium"
                        >
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Load {recordsToLoad} site{recordsToLoad === 1 ? '' : 's'} · up to {recordsToLoad} records
                        </button>
                    </div>

                    {wouldExceed && !loadError && (
                        <div className="text-xs text-[var(--warning)] flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>
                                Only {Math.max(0, remaining!)} records are left this cycle.{' '}
                                {isAdminOrOwner
                                    ? <button onClick={() => void load(true)} className="underline">Load anyway at ${(recordsToLoad * (usageData?.overagePerRecord ?? 0.15)).toFixed(2)} max</button>
                                    : 'Load fewer, or ask an admin.'}
                            </span>
                        </div>
                    )}
                    {loadError && (
                        <div className="text-xs text-[var(--danger)] flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>
                                {loadError.message}
                                {loadError.budget && isAdminOrOwner && <> <button onClick={() => void load(true)} className="underline">Load anyway</button></>}
                            </span>
                        </div>
                    )}

                    {usage && <RegridUsageMeter usage={usage} compact />}
                </div>

                {/* Results */}
                {sites.length > 0 && (
                    <div className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className={labelCls}>{sites.length} site{sites.length === 1 ? '' : 's'}</div>
                            <div className="flex items-center gap-1">
                                <select aria-label="Sort sites" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={`${fieldCls} py-0.5`}>
                                    <option value="acres">Largest</option>
                                    <option value="landValue">Land value</option>
                                    <option value="buildingRatio">Least built</option>
                                    <option value="lastSale">Longest held</option>
                                </select>
                                <button onClick={() => downloadCsv(sorted.map((x) => x.s))} aria-label="Download CSV" title="Download CSV" className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                                    <Download className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => { setSites([]); setSelected(null); }} aria-label="Clear results" title="Clear results" className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                        <ul className="space-y-1.5">
                            {sorted.map(({ s, i }) => {
                                const p = s.parcel;
                                const ratio = buildingRatio(p);
                                return (
                                    <li key={i}>
                                        <button
                                            onClick={() => openSite(i)}
                                            className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${selected === i ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] hover:bg-[var(--bg-elevated)]'}`}
                                        >
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{p.details.address || p.details.parcelNumber || 'No address'}</span>
                                                <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums whitespace-nowrap">{p.details.lotSizeAcres != null ? `${p.details.lotSizeAcres.toFixed(2)} ac` : '—'}</span>
                                            </div>
                                            <div className="text-[10px] text-[var(--text-muted)] truncate">
                                                {[p.zoning.code, p.zoning.subtype].filter(Boolean).join(' · ') || 'Zoning n/a'}
                                                {p.details.city ? ` — ${p.details.city}` : ''}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-faint)] truncate mt-0.5">
                                                {p.owner.name || 'Owner n/a'}
                                            </div>
                                            <div className="flex gap-3 text-[10px] text-[var(--text-secondary)] mt-1 tabular-nums">
                                                <span>Land {money(p.tax.landValue)}</span>
                                                {ratio != null && <span>Bldg {Math.round(ratio * 100)}%</span>}
                                                {p.details.lastSaleDate && <span>Sold {p.details.lastSaleDate.slice(0, 4)}</span>}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
