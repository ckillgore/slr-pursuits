'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Marker } from 'mapbox-gl';
import { MapPin, Pencil, Check, X, Search } from 'lucide-react';
import type { Pursuit } from '@/types';
import { toast } from '@/lib/toast';
import { searchPlaces, geocodeForStorage, type GeocodeResult } from '@/lib/geocoding';
import { useMapboxMap, useIsDarkTheme } from '@/components/map/useMapboxMap';
import { MapStatusOverlay } from '@/components/map/MapStatusOverlay';
import { addLayerOnce, boundsOf, setGeoJsonData, upsertGeoJsonSource } from '@/components/map/mapHelpers';
import { siteInkColor } from '@/components/map/mapStyle';

const PRIMARY_COLOR = '#2563EB';
const ASSEMBLAGE_COLOR = '#7C3AED';
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

interface LocationCardProps {
    pursuit: Pursuit;
    onUpdate: (updates: Partial<Pursuit>) => void;
}

export function LocationCard({ pursuit, onUpdate }: LocationCardProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markerRef = useRef<Marker | null>(null);

    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [editAddress, setEditAddress] = useState('');
    const [editCity, setEditCity] = useState('');
    const [editState, setEditState] = useState('');
    const [editZip, setEditZip] = useState('');
    const [editLat, setEditLat] = useState('');
    const [editLng, setEditLng] = useState('');

    // Autocomplete
    const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchSeqRef = useRef(0);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    const hasLocation = pursuit.latitude !== null && pursuit.longitude !== null;
    const isDark = useIsDarkTheme();
    // parcel_data also holds FMR / AI summary caches; only the geometry matters to the map
    const primaryGeometry = (pursuit.parcel_data as { parcel?: { geometry?: Geometry } } | null)?.parcel?.geometry ?? null;

    const parcels = useMemo(() => {
        const primary: FeatureCollection = primaryGeometry
            ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: primaryGeometry, properties: {} }] }
            : EMPTY_FC;
        const list = (Array.isArray(pursuit.parcel_assemblage) ? pursuit.parcel_assemblage : []) as { geometry?: Geometry; address?: string }[];
        const assemblage: FeatureCollection = {
            type: 'FeatureCollection',
            features: list.filter((p) => p.geometry).map((p) => ({ type: 'Feature' as const, geometry: p.geometry!, properties: { address: p.address || 'Unknown' } })),
        };
        return { primary, assemblage };
    }, [primaryGeometry, pursuit.parcel_assemblage]);
    const parcelsRef = useRef(parcels);
    parcelsRef.current = parcels;

    const { map, mbgl, ready, error } = useMapboxMap(mapContainerRef, {
        center: hasLocation ? [pursuit.longitude!, pursuit.latitude!] : [-97.7431, 30.2672],
        zoom: hasLocation ? 15 : 4,
        onStyleReady: (m) => {
            upsertGeoJsonSource(m, 'primary-parcel', parcelsRef.current.primary);
            addLayerOnce(m, { id: 'primary-parcel-fill', type: 'fill', source: 'primary-parcel', paint: { 'fill-color': PRIMARY_COLOR, 'fill-opacity': 0.15 } });
            addLayerOnce(m, { id: 'primary-parcel-outline', type: 'line', source: 'primary-parcel', paint: { 'line-color': PRIMARY_COLOR, 'line-width': 2 } });
            upsertGeoJsonSource(m, 'assemblage-parcels', parcelsRef.current.assemblage);
            addLayerOnce(m, { id: 'assemblage-fill', type: 'fill', source: 'assemblage-parcels', paint: { 'fill-color': ASSEMBLAGE_COLOR, 'fill-opacity': 0.2 } });
            addLayerOnce(m, { id: 'assemblage-outline', type: 'line', source: 'assemblage-parcels', paint: { 'line-color': ASSEMBLAGE_COLOR, 'line-width': 2 } });
        },
    });

    // Parcels changed: update the drawn shapes and frame them with the site
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        setGeoJsonData(map, 'primary-parcel', parcels.primary);
        setGeoJsonData(map, 'assemblage-parcels', parcels.assemblage);
        const bounds = boundsOf(mbgl, { type: 'FeatureCollection', features: [...parcels.primary.features, ...parcels.assemblage.features] });
        if (bounds) {
            if (hasLocation) bounds.extend([pursuit.longitude!, pursuit.latitude!]);
            map.fitBounds(bounds, { padding: 40, duration: 600, maxZoom: 18 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, mbgl, ready, parcels]);

    // Site marker; fly to the site when its location changes after the first render
    const lastLocationRef = useRef<string | null>(null);
    useEffect(() => {
        if (!map || !mbgl || !hasLocation) return;
        const lngLat: [number, number] = [pursuit.longitude!, pursuit.latitude!];
        markerRef.current?.remove();
        markerRef.current = new mbgl.Marker({ color: siteInkColor(isDark) }).setLngLat(lngLat).addTo(map);
        const key = lngLat.join(',');
        if (lastLocationRef.current && lastLocationRef.current !== key) map.flyTo({ center: lngLat, zoom: 15, duration: 1000 });
        lastLocationRef.current = key;
    }, [map, mbgl, hasLocation, pursuit.latitude, pursuit.longitude, isDark]);
    useEffect(() => () => { markerRef.current?.remove(); }, []);

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Cancel any pending autocomplete search on unmount
    useEffect(() => () => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchSeqRef.current++;
    }, []);

    const cancelPendingSearch = () => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
        searchSeqRef.current++; // invalidate any in-flight response
    };

    // Autocomplete search
    const handleAddressChange = useCallback((query: string) => {
        setEditAddress(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const seq = ++searchSeqRef.current;

        if (!query.trim() || query.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const results = await searchPlaces(query);
                // Ignore stale responses (user kept typing, picked a suggestion, or cancelled)
                if (seq !== searchSeqRef.current) return;
                setSuggestions(results);
                setShowSuggestions(true);
            } catch (err) {
                console.error('Geocode search failed:', err);
            }
        }, 300);
    }, []);

    // Select a suggestion. Suggestions are temporary geocodes (display only), so the
    // picked address is geocoded again in permanent mode before it is saved.
    const selectSuggestion = useCallback(async (suggestion: GeocodeResult) => {
        cancelPendingSearch();
        setSuggestions([]);
        setShowSuggestions(false);
        setIsEditingAddress(false);
        try {
            const r = await geocodeForStorage(suggestion);
            if (!r) throw new Error('No permanent match');
            onUpdate({
                latitude: r.lat,
                longitude: r.lng,
                address: r.address || suggestion.name,
                city: r.city,
                state: r.state,
                zip: r.zip,
                county: r.county || pursuit.county,
            });
        } catch (err) {
            onUpdate({ address: suggestion.address || suggestion.name, city: suggestion.city, state: suggestion.state, zip: suggestion.zip });
            toast.error('Address saved, but it could not be located — the map pin was not moved', err);
        }
    }, [onUpdate, pursuit.county]);

    // Manual geocode (if user types without selecting a suggestion)
    const geocodeAddress = useCallback(async (address: string, city: string, state: string, zip: string) => {
        const query = [address, city, state, zip].filter(Boolean).join(', ');
        if (!query.trim()) return;
        try {
            const r = await geocodeForStorage(query);
            if (r) {
                onUpdate({
                    address,
                    city: city || r.city,
                    state: state || r.state,
                    zip: zip || r.zip,
                    county: r.county || pursuit.county,
                    latitude: r.lat,
                    longitude: r.lng,
                });
            } else {
                onUpdate({ address, city, state, zip });
                toast.info('Address saved, but it could not be located — the map pin was not moved. Pick a suggestion or enter coordinates.');
            }
        } catch (err) {
            console.error('Geocode failed:', err);
            onUpdate({ address, city, state, zip });
            toast.error('Address saved, but geocoding failed — the map pin was not moved', err);
        }
    }, [onUpdate, pursuit.county]);

    // Start editing
    const startEditing = () => {
        setEditAddress(pursuit.address || '');
        setEditCity(pursuit.city || '');
        setEditState(pursuit.state || '');
        setEditZip(pursuit.zip || '');
        setEditLat(pursuit.latitude != null ? String(pursuit.latitude) : '');
        setEditLng(pursuit.longitude != null ? String(pursuit.longitude) : '');
        setSuggestions([]);
        setShowSuggestions(false);
        setIsEditingAddress(true);
    };

    // Save edits
    const saveEdits = async () => {
        cancelPendingSearch();
        setShowSuggestions(false);
        const parsedLat = parseFloat(editLat);
        const parsedLng = parseFloat(editLng);
        const hasManualCoords = !isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180;

        // Detect if the user changed the address text (vs only editing lat/lng)
        const addressChanged =
            editAddress !== (pursuit.address || '') ||
            editCity !== (pursuit.city || '') ||
            editState !== (pursuit.state || '') ||
            editZip !== (pursuit.zip || '');

        // Detect if the user changed the coordinates manually
        const coordsChanged =
            hasManualCoords && (
                parsedLat !== pursuit.latitude ||
                parsedLng !== pursuit.longitude
            );

        if (coordsChanged && !addressChanged) {
            // User only changed coords — save them directly
            onUpdate({
                address: editAddress,
                city: editCity,
                state: editState,
                zip: editZip,
                latitude: parsedLat,
                longitude: parsedLng,
            });
        } else if (addressChanged) {
            // User changed the address — always geocode to get fresh coords
            await geocodeAddress(editAddress, editCity, editState, editZip);
        } else if (hasManualCoords) {
            // Nothing changed but user clicked save — save what's there
            onUpdate({
                address: editAddress,
                city: editCity,
                state: editState,
                zip: editZip,
                latitude: parsedLat,
                longitude: parsedLng,
            });
        } else {
            // No valid coords at all — try geocoding from address
            await geocodeAddress(editAddress, editCity, editState, editZip);
        }
        setIsEditingAddress(false);
    };

    // Cancel edits
    const cancelEdits = () => {
        cancelPendingSearch();
        setIsEditingAddress(false);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const addressDisplay = [pursuit.address, pursuit.city, pursuit.state, pursuit.zip].filter(Boolean).join(', ') || 'No address set';

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-3">
                <h3 className="op-card-title">Location</h3>
                {!isEditingAddress && (
                    <button
                        onClick={startEditing}
                        className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                        title="Edit address"
                        aria-label="Edit location"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Address editing */}
            {isEditingAddress ? (
                <div className="mb-3 space-y-2" ref={suggestionsRef}>
                    <div className="relative">
                        <label className="block text-[11px] text-[var(--text-faint)] uppercase font-semibold mb-0.5">Street Address</label>
                        <div className="relative flex items-center">
                            <Search className="absolute left-2 w-3 h-3 text-[var(--text-faint)] pointer-events-none" />
                            <input
                                type="text"
                                value={editAddress}
                                onChange={(e) => handleAddressChange(e.target.value)}
                                placeholder="Start typing an address..."
                                className="w-full pl-7 pr-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') { saveEdits(); } if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        {/* Autocomplete dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden">
                                {suggestions.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => void selectSuggestion(s)}
                                        className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--accent-subtle)] transition-colors border-b border-[var(--table-row-border)] last:border-b-0"
                                    >
                                        <div className="font-medium text-xs">{s.name}</div>
                                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{s.secondary}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="block text-[11px] text-[var(--text-faint)] uppercase font-semibold mb-0.5">City</label>
                            <input
                                type="text"
                                value={editCity}
                                onChange={(e) => setEditCity(e.target.value)}
                                placeholder="City"
                                className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] text-[var(--text-faint)] uppercase font-semibold mb-0.5">State</label>
                            <input
                                type="text"
                                value={editState}
                                onChange={(e) => setEditState(e.target.value)}
                                placeholder="TX"
                                className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] text-[var(--text-faint)] uppercase font-semibold mb-0.5">Zip</label>
                            <input
                                type="text"
                                value={editZip}
                                onChange={(e) => setEditZip(e.target.value)}
                                placeholder="75201"
                                className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-[11px] text-[var(--text-faint)] uppercase font-semibold mb-0.5">Latitude</label>
                            <input
                                type="number"
                                step="any"
                                value={editLat}
                                onChange={(e) => setEditLat(e.target.value)}
                                placeholder="e.g., 30.267"
                                className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] text-[var(--text-faint)] uppercase font-semibold mb-0.5">Longitude</label>
                            <input
                                type="number"
                                step="any"
                                value={editLng}
                                onChange={(e) => setEditLng(e.target.value)}
                                placeholder="e.g., -97.743"
                                className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                            onClick={cancelEdits}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                            <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                            onClick={saveEdits}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
                        >
                            <Check className="w-3 h-3" /> Update & Geocode
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-2 mb-3 text-xs text-[var(--text-secondary)] group cursor-pointer hover:text-[var(--accent)] transition-colors" onClick={startEditing}>
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--text-faint)] group-hover:text-[var(--accent)]" />
                    <div>
                        <div>{addressDisplay}</div>
                        {pursuit.county && (
                            <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{pursuit.county.replace(/\s+County$/i, '')} County</div>
                        )}
                        {hasLocation && (
                            <div className="text-[11px] text-[var(--text-faint)] mt-0.5">
                                {pursuit.latitude!.toFixed(6)}, {pursuit.longitude!.toFixed(6)}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Map */}
            <div className="relative w-full h-56 rounded-lg overflow-hidden border border-[var(--border)]">
                <div ref={mapContainerRef} className="absolute inset-0" />
                <MapStatusOverlay ready={ready} error={error} />
            </div>
        </div>
    );
}
