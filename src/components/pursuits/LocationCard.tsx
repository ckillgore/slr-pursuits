'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Pencil, Check, X, Search } from 'lucide-react';
import type { Pursuit } from '@/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface LocationCardProps {
    pursuit: Pursuit;
    onUpdate: (updates: Partial<Pursuit>) => void;
}

export function LocationCard({ pursuit, onUpdate }: LocationCardProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);

    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [editAddress, setEditAddress] = useState('');
    const [editCity, setEditCity] = useState('');
    const [editState, setEditState] = useState('');
    const [editZip, setEditZip] = useState('');
    const [editLat, setEditLat] = useState('');
    const [editLng, setEditLng] = useState('');

    // Autocomplete
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    const hasLocation = pursuit.latitude !== null && pursuit.longitude !== null;

    // Initialize map
    useEffect(() => {
        if (!MAPBOX_TOKEN || !mapContainerRef.current) return;

        let map: any;
        import('mapbox-gl').then((mapboxgl) => {
            // @ts-ignore
            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;

            if (mapContainerRef.current) mapContainerRef.current.innerHTML = '';

            // Guard: container may be null if component unmounted during async import
            if (!mapContainerRef.current) return;

            map = new mbgl.Map({
                container: mapContainerRef.current!,
                style: 'mapbox://styles/mapbox/light-v11',
                center: hasLocation ? [pursuit.longitude!, pursuit.latitude!] : [-97.7431, 30.2672],
                zoom: hasLocation ? 14 : 4,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: false }), 'top-right');

            if (hasLocation) {
                const marker = new mbgl.Marker({ color: '#2563EB' })
                    .setLngLat([pursuit.longitude!, pursuit.latitude!])
                    .addTo(map);
                markerRef.current = marker;
            }

            mapRef.current = map;
        });

        return () => {
            if (map) map.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [MAPBOX_TOKEN]);

    // Update marker when lat/lng changes externally
    useEffect(() => {
        if (!mapRef.current || !hasLocation) return;
        const map = mapRef.current;

        if (markerRef.current) {
            markerRef.current.setLngLat([pursuit.longitude!, pursuit.latitude!]);
        }
        map.flyTo({ center: [pursuit.longitude!, pursuit.latitude!], zoom: 14, duration: 1000 });
    }, [pursuit.latitude, pursuit.longitude, hasLocation]);

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

    // Autocomplete search
    const handleAddressChange = useCallback((query: string) => {
        setEditAddress(query);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!query.trim() || query.length < 3 || !MAPBOX_TOKEN) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,place&country=US&limit=5`
                );
                const data = await res.json();
                setSuggestions(data.features || []);
                setShowSuggestions(true);
            } catch (err) {
                console.error('Geocode search failed:', err);
            }
        }, 300);
    }, []);

    // Select a suggestion
    const selectSuggestion = useCallback((feature: any) => {
        const [lng, lat] = feature.center;
        const context = feature.context || [];
        const findCtx = (type: string) => context.find((c: any) => c.id?.startsWith(type))?.text || '';

        const parts = feature.place_name.split(',');
        const address = parts[0]?.trim() || '';
        const city = findCtx('place');
        const state = findCtx('region');
        const zip = findCtx('postcode');
        const county = findCtx('district');

        // Fill the form fields
        setEditAddress(address);
        setEditCity(city);
        setEditState(state);
        setEditZip(zip);
        setEditLat(String(lat));
        setEditLng(String(lng));
        setSuggestions([]);
        setShowSuggestions(false);

        // Apply immediately
        const updates: Partial<Pursuit> = {
            latitude: lat,
            longitude: lng,
            address,
            city,
            state,
            zip,
            county: county || pursuit.county,
        };
        onUpdate(updates);
        setIsEditingAddress(false);
    }, [onUpdate, pursuit.county]);

    // Manual geocode (if user types without selecting a suggestion)
    const geocodeAddress = useCallback(async (address: string, city: string, state: string, zip: string) => {
        if (!MAPBOX_TOKEN) return;
        const query = [address, city, state, zip].filter(Boolean).join(', ');
        if (!query.trim()) return;
        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,place&country=US&limit=1`
            );
            const data = await res.json();
            if (data.features?.length > 0) {
                const feature = data.features[0];
                const [lng, lat] = feature.center;
                const context = feature.context || [];
                const findCtx = (type: string) => context.find((c: any) => c.id?.startsWith(type))?.text || '';

                const updates: Partial<Pursuit> = {
                    address,
                    city: city || findCtx('place'),
                    state: state || findCtx('region'),
                    zip: zip || findCtx('postcode'),
                    county: findCtx('district') || pursuit.county,
                    latitude: lat,
                    longitude: lng,
                };
                onUpdate(updates);
            } else {
                onUpdate({ address, city, state, zip });
            }
        } catch (err) {
            console.error('Geocode failed:', err);
            onUpdate({ address, city, state, zip });
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
    const saveEdits = () => {
        const parsedLat = parseFloat(editLat);
        const parsedLng = parseFloat(editLng);
        const hasManualCoords = !isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180;

        if (hasManualCoords) {
            // If user manually entered/edited coordinates, use those directly
            onUpdate({
                address: editAddress,
                city: editCity,
                state: editState,
                zip: editZip,
                latitude: parsedLat,
                longitude: parsedLng,
            });
        } else {
            // Otherwise, geocode from address
            geocodeAddress(editAddress, editCity, editState, editZip);
        }
        setIsEditingAddress(false);
    };

    // Cancel edits
    const cancelEdits = () => {
        setIsEditingAddress(false);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const addressDisplay = [pursuit.address, pursuit.city, pursuit.state, pursuit.zip].filter(Boolean).join(', ') || 'No address set';

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#7A8599] uppercase tracking-wider">Location</h3>
                {!isEditingAddress && (
                    <button
                        onClick={startEditing}
                        className="p-1 rounded text-[#A0AABB] hover:text-[#2563EB] hover:bg-[#EBF1FF] transition-colors"
                        title="Edit address"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Address editing */}
            {isEditingAddress ? (
                <div className="mb-3 space-y-2" ref={suggestionsRef}>
                    <div className="relative">
                        <label className="block text-[10px] text-[#A0AABB] uppercase font-semibold mb-0.5">Street Address</label>
                        <div className="relative flex items-center">
                            <Search className="absolute left-2 w-3 h-3 text-[#A0AABB] pointer-events-none" />
                            <input
                                type="text"
                                value={editAddress}
                                onChange={(e) => handleAddressChange(e.target.value)}
                                placeholder="Start typing an address..."
                                className="w-full pl-7 pr-2 py-1.5 rounded-md border border-[#E2E5EA] text-xs text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') { saveEdits(); } if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        {/* Autocomplete dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-[#E2E5EA] rounded-lg shadow-lg overflow-hidden">
                                {suggestions.map((s: any) => (
                                    <button
                                        key={s.id}
                                        onClick={() => selectSuggestion(s)}
                                        className="w-full text-left px-3 py-2 text-sm text-[#1A1F2B] hover:bg-[#EBF1FF] transition-colors border-b border-[#F0F1F4] last:border-b-0"
                                    >
                                        <div className="font-medium text-xs">{s.text}</div>
                                        <div className="text-[10px] text-[#7A8599] mt-0.5">{s.place_name}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="block text-[10px] text-[#A0AABB] uppercase font-semibold mb-0.5">City</label>
                            <input
                                type="text"
                                value={editCity}
                                onChange={(e) => setEditCity(e.target.value)}
                                placeholder="City"
                                className="w-full px-2 py-1.5 rounded-md border border-[#E2E5EA] text-xs text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-[#A0AABB] uppercase font-semibold mb-0.5">State</label>
                            <input
                                type="text"
                                value={editState}
                                onChange={(e) => setEditState(e.target.value)}
                                placeholder="TX"
                                className="w-full px-2 py-1.5 rounded-md border border-[#E2E5EA] text-xs text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-[#A0AABB] uppercase font-semibold mb-0.5">Zip</label>
                            <input
                                type="text"
                                value={editZip}
                                onChange={(e) => setEditZip(e.target.value)}
                                placeholder="75201"
                                className="w-full px-2 py-1.5 rounded-md border border-[#E2E5EA] text-xs text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-[10px] text-[#A0AABB] uppercase font-semibold mb-0.5">Latitude</label>
                            <input
                                type="number"
                                step="any"
                                value={editLat}
                                onChange={(e) => setEditLat(e.target.value)}
                                placeholder="e.g., 30.267"
                                className="w-full px-2 py-1.5 rounded-md border border-[#E2E5EA] text-xs text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-[#A0AABB] uppercase font-semibold mb-0.5">Longitude</label>
                            <input
                                type="number"
                                step="any"
                                value={editLng}
                                onChange={(e) => setEditLng(e.target.value)}
                                placeholder="e.g., -97.743"
                                className="w-full px-2 py-1.5 rounded-md border border-[#E2E5EA] text-xs text-[#1A1F2B] focus:border-[#2563EB] focus:outline-none"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') cancelEdits(); }}
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                            onClick={cancelEdits}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7] transition-colors"
                        >
                            <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                            onClick={saveEdits}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4FD7] transition-colors"
                        >
                            <Check className="w-3 h-3" /> Update & Geocode
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-2 mb-3 text-xs text-[#4A5568] group cursor-pointer hover:text-[#2563EB] transition-colors" onClick={startEditing}>
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#A0AABB] group-hover:text-[#2563EB]" />
                    <div>
                        <div>{addressDisplay}</div>
                        {pursuit.county && (
                            <div className="text-[10px] text-[#A0AABB] mt-0.5">{pursuit.county} County</div>
                        )}
                        {hasLocation && (
                            <div className="text-[10px] text-[#A0AABB] mt-0.5">
                                {pursuit.latitude!.toFixed(6)}, {pursuit.longitude!.toFixed(6)}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Map */}
            {MAPBOX_TOKEN ? (
                <div
                    ref={mapContainerRef}
                    className="w-full h-56 rounded-lg overflow-hidden border border-[#E2E5EA]"
                    style={{ minHeight: 224 }}
                />
            ) : (
                <div className="w-full h-56 rounded-lg border border-[#E2E5EA] bg-[#FAFBFC] flex items-center justify-center">
                    <div className="text-center">
                        <MapPin className="w-6 h-6 text-[#C8CDD5] mx-auto mb-2" />
                        <p className="text-xs text-[#A0AABB]">Add <code className="text-[10px] bg-[#F4F5F7] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local</p>
                    </div>
                </div>
            )}
        </div>
    );
}
