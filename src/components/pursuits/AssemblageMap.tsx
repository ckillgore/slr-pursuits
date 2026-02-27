'use client';

import { useEffect, useRef } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface NearbyParcel {
    regridId: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    parcelNumber: string | null;
    ownerName: string | null;
    lotSizeSF: number | null;
    lotSizeAcres: number | null;
    landUse: string | null;
    zoningCode: string | null;
    zoningType: string | null;
    totalAssessedValue: number | null;
    landValue: number | null;
    improvementValue: number | null;
    yearBuilt: number | null;
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    geometry: any | null;
    [key: string]: any;
}

interface AssemblageMapProps {
    latitude: number;
    longitude: number;
    primaryGeometry: any | null;
    nearbyParcels: NearbyParcel[];
    assemblage: NearbyParcel[];
    onToggleParcel: (parcel: NearbyParcel) => void;
}

function fmtCurrency(v: number | null): string {
    if (v == null) return 'N/A';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtNumber(v: number | null): string {
    if (v == null) return 'N/A';
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function AssemblageMap({
    latitude,
    longitude,
    primaryGeometry,
    nearbyParcels,
    assemblage,
    onToggleParcel,
}: AssemblageMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const popupRef = useRef<any>(null);
    // Use ref for assemblage to avoid recreating map on every selection change
    const assemblageRef = useRef(assemblage);
    assemblageRef.current = assemblage;
    const onToggleRef = useRef(onToggleParcel);
    onToggleRef.current = onToggleParcel;
    const nearbyRef = useRef(nearbyParcels);
    nearbyRef.current = nearbyParcels;

    // Build GeoJSON for nearby parcels (only those with geometry)
    useEffect(() => {
        if (!MAPBOX_TOKEN || !containerRef.current) return;

        let map: any;
        let cancelled = false;

        import('mapbox-gl').then((mapboxgl) => {
            if (cancelled || !containerRef.current) return;
            const mbgl = mapboxgl.default || mapboxgl;
            mbgl.accessToken = MAPBOX_TOKEN;

            // Clear container
            if (containerRef.current) containerRef.current.innerHTML = '';

            map = new mbgl.Map({
                container: containerRef.current!,
                style: 'mapbox://styles/mapbox/light-v11',
                center: [longitude, latitude],
                zoom: 16,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: false }), 'top-right');

            // Site marker
            new mbgl.Marker({ color: '#1A1F2B' })
                .setLngLat([longitude, latitude])
                .addTo(map);

            mapInstanceRef.current = map;

            map.on('load', () => {
                if (cancelled) return;

                // Helper to get selected IDs
                const getSelectedIds = () => {
                    const set = new Set<string>();
                    for (const a of assemblageRef.current) {
                        set.add(a.regridId || a.parcelNumber || '');
                    }
                    return set;
                };

                // Primary parcel source + layer
                if (primaryGeometry) {
                    map.addSource('primary-parcel', {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            geometry: primaryGeometry,
                            properties: { type: 'primary' },
                        },
                    });
                    map.addLayer({
                        id: 'primary-parcel-fill',
                        type: 'fill',
                        source: 'primary-parcel',
                        paint: {
                            'fill-color': '#1A1F2B',
                            'fill-opacity': 0.25,
                        },
                    });
                    map.addLayer({
                        id: 'primary-parcel-outline',
                        type: 'line',
                        source: 'primary-parcel',
                        paint: {
                            'line-color': '#1A1F2B',
                            'line-width': 2.5,
                        },
                    });
                }

                // Nearby parcels source + layers
                const nearbyWithGeom = nearbyRef.current.filter(p => p.geometry);
                if (nearbyWithGeom.length > 0) {
                    const selectedIds = getSelectedIds();
                    const features = nearbyWithGeom.map(p => ({
                        type: 'Feature' as const,
                        geometry: p.geometry,
                        properties: {
                            id: p.regridId || p.parcelNumber || '',
                            address: p.address || 'Unknown',
                            parcelNumber: p.parcelNumber || '',
                            ownerName: p.ownerName || '',
                            lotSizeSF: p.lotSizeSF || 0,
                            lotSizeAcres: p.lotSizeAcres || 0,
                            totalAssessedValue: p.totalAssessedValue || 0,
                            zoningCode: p.zoningCode || '',
                            landUse: p.landUse || '',
                            selected: selectedIds.has(p.regridId || p.parcelNumber || '') ? 1 : 0,
                        },
                    }));

                    map.addSource('nearby-parcels', {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features },
                    });

                    // Fill layer — different color for selected vs unselected
                    map.addLayer({
                        id: 'nearby-fill',
                        type: 'fill',
                        source: 'nearby-parcels',
                        paint: {
                            'fill-color': [
                                'case',
                                ['==', ['get', 'selected'], 1],
                                '#7C3AED',   // purple for selected
                                '#E2E5EA',   // light gray for unselected
                            ],
                            'fill-opacity': [
                                'case',
                                ['==', ['get', 'selected'], 1],
                                0.35,
                                0.2,
                            ],
                        },
                    });

                    map.addLayer({
                        id: 'nearby-outline',
                        type: 'line',
                        source: 'nearby-parcels',
                        paint: {
                            'line-color': [
                                'case',
                                ['==', ['get', 'selected'], 1],
                                '#7C3AED',
                                '#A0AABB',
                            ],
                            'line-width': [
                                'case',
                                ['==', ['get', 'selected'], 1],
                                2.5,
                                1,
                            ],
                        },
                    });

                    // Click handler — toggle selection
                    map.on('click', 'nearby-fill', (e: any) => {
                        if (!e.features?.[0]) return;
                        const clickedId = e.features[0].properties?.id;
                        if (!clickedId) return;
                        const parcelData = nearbyRef.current.find(
                            p => (p.regridId || p.parcelNumber || '') === clickedId
                        );
                        if (parcelData) {
                            onToggleRef.current(parcelData);
                        }
                    });

                    // Hover cursor + popup
                    map.on('mousemove', 'nearby-fill', (e: any) => {
                        if (!e.features?.[0]) return;
                        map.getCanvas().style.cursor = 'pointer';
                        const props = e.features[0].properties;
                        const isSelected = props.selected === 1;

                        if (popupRef.current) popupRef.current.remove();
                        popupRef.current = new mbgl.Popup({
                            closeButton: false,
                            closeOnClick: false,
                            offset: 10,
                            maxWidth: '220px',
                        })
                            .setLngLat(e.lngLat)
                            .setHTML(`
                                <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.5;">
                                    <div style="font-weight: 700; color: #1A1F2B; margin-bottom: 2px;">${props.address}</div>
                                    ${props.parcelNumber ? `<div style="color: #A0AABB; font-size: 10px;">APN: ${props.parcelNumber}</div>` : ''}
                                    ${props.ownerName ? `<div style="color: #4A5568; margin-top: 3px;">📋 ${props.ownerName}</div>` : ''}
                                    ${props.lotSizeSF > 0 ? `<div style="color: #4A5568;">📐 ${fmtNumber(props.lotSizeSF)} SF (${Number(props.lotSizeAcres).toFixed(2)} ac)</div>` : ''}
                                    ${props.totalAssessedValue > 0 ? `<div style="color: #4A5568;">💰 ${fmtCurrency(props.totalAssessedValue)}</div>` : ''}
                                    ${props.zoningCode ? `<div style="color: #4A5568;">🏗️ ${props.zoningCode}</div>` : ''}
                                    <div style="margin-top: 4px; padding-top: 3px; border-top: 1px solid #E2E5EA; font-size: 10px; color: ${isSelected ? '#7C3AED' : '#A0AABB'}; font-weight: 600;">
                                        ${isSelected ? '✓ Selected — click to remove' : 'Click to add to assemblage'}
                                    </div>
                                </div>
                            `)
                            .addTo(map);
                    });

                    map.on('mouseleave', 'nearby-fill', () => {
                        map.getCanvas().style.cursor = '';
                        if (popupRef.current) popupRef.current.remove();
                    });

                    // Fit bounds to include all parcels
                    const bounds = new mbgl.LngLatBounds();
                    bounds.extend([longitude, latitude]);
                    for (const f of features) {
                        const flatten = (arr: any[]): void => {
                            for (const item of arr) {
                                if (typeof item[0] === 'number') bounds.extend(item as [number, number]);
                                else flatten(item);
                            }
                        };
                        if (f.geometry?.coordinates) flatten(f.geometry.coordinates);
                    }
                    if (primaryGeometry?.coordinates) {
                        const flatten = (arr: any[]): void => {
                            for (const item of arr) {
                                if (typeof item[0] === 'number') bounds.extend(item as [number, number]);
                                else flatten(item);
                            }
                        };
                        flatten(primaryGeometry.coordinates);
                    }
                    if (!bounds.isEmpty()) {
                        map.fitBounds(bounds, { padding: 40, duration: 800 });
                    }
                }
            });
        });

        return () => {
            cancelled = true;
            if (popupRef.current) popupRef.current.remove();
            if (map) map.remove();
            mapInstanceRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latitude, longitude, nearbyParcels, primaryGeometry]);

    // Update the GeoJSON source when assemblage selection changes (without recreating the map)
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;
        const source = map.getSource?.('nearby-parcels');
        if (!source) return;

        const selectedIds = new Set<string>();
        for (const a of assemblage) {
            selectedIds.add(a.regridId || a.parcelNumber || '');
        }

        const nearbyWithGeom = nearbyRef.current.filter(p => p.geometry);
        const features = nearbyWithGeom.map(p => ({
            type: 'Feature' as const,
            geometry: p.geometry,
            properties: {
                id: p.regridId || p.parcelNumber || '',
                address: p.address || 'Unknown',
                parcelNumber: p.parcelNumber || '',
                ownerName: p.ownerName || '',
                lotSizeSF: p.lotSizeSF || 0,
                lotSizeAcres: p.lotSizeAcres || 0,
                totalAssessedValue: p.totalAssessedValue || 0,
                zoningCode: p.zoningCode || '',
                landUse: p.landUse || '',
                selected: selectedIds.has(p.regridId || p.parcelNumber || '') ? 1 : 0,
            },
        }));

        source.setData({ type: 'FeatureCollection', features });
    }, [assemblage]);

    if (!MAPBOX_TOKEN) {
        return (
            <div className="w-full h-[400px] rounded-lg border border-[#E2E5EA] bg-[#FAFBFC] flex items-center justify-center">
                <p className="text-xs text-[#A0AABB]">Add <code className="text-[10px] bg-[#F4F5F7] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="w-full h-[300px] sm:h-[400px] rounded-lg overflow-hidden border border-[#E2E5EA]"
        />
    );
}
