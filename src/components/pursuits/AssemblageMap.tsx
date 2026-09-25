'use client';

import { useEffect, useRef } from 'react';
import { useMapStyle, siteInkColor } from './mapTheme';

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

/**
 * Stable identity for a parcel. Regrid ID first, then APN. Parcels with neither
 * used to share the key '' — selecting one selected (and removing one removed)
 * every unidentified parcel. Fall back to address + first boundary vertex.
 */
export function parcelKey(p: { regridId?: string | null; parcelNumber?: string | null; address?: string | null; lotSizeSF?: number | null; geometry?: { coordinates?: unknown } | null }): string {
    if (p.regridId) return `rg:${p.regridId}`;
    if (p.parcelNumber) return `apn:${p.parcelNumber}`;
    let vertex = '';
    const find = (c: unknown): boolean => {
        if (!Array.isArray(c)) return false;
        if (typeof c[0] === 'number' && typeof c[1] === 'number') { vertex = `${c[0].toFixed(6)},${c[1].toFixed(6)}`; return true; }
        return c.some(find);
    };
    find(p.geometry?.coordinates);
    return `anon:${p.address ?? ''}|${vertex}|${p.lotSizeSF ?? ''}`;
}

function fmtCurrency(v: number | null): string {
    if (v == null) return 'N/A';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function escapeHtml(v: unknown): string {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const { mapStyle, isDark } = useMapStyle();

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
                style: mapStyle,
                center: [longitude, latitude],
                zoom: 16,
                interactive: true,
            });

            map.addControl(new mbgl.NavigationControl({ showCompass: false }), 'top-right');

            // Site marker
            new mbgl.Marker({ color: siteInkColor(isDark) })
                .setLngLat([longitude, latitude])
                .addTo(map);

            mapInstanceRef.current = map;

            map.on('load', () => {
                if (cancelled) return;

                // Helper to get selected IDs
                const getSelectedIds = () => {
                    const set = new Set<string>();
                    for (const a of assemblageRef.current) {
                        set.add(parcelKey(a));
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
                            'fill-color': siteInkColor(isDark),
                            'fill-opacity': 0.25,
                        },
                    });
                    map.addLayer({
                        id: 'primary-parcel-outline',
                        type: 'line',
                        source: 'primary-parcel',
                        paint: {
                            'line-color': siteInkColor(isDark),
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
                            id: parcelKey(p),
                            address: p.address || 'Unknown',
                            parcelNumber: p.parcelNumber || '',
                            ownerName: p.ownerName || '',
                            lotSizeSF: p.lotSizeSF || 0,
                            lotSizeAcres: p.lotSizeAcres || 0,
                            totalAssessedValue: p.totalAssessedValue || 0,
                            zoningCode: p.zoningCode || '',
                            landUse: p.landUse || '',
                            selected: selectedIds.has(parcelKey(p)) ? 1 : 0,
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
                                isDark ? '#3D4359' : '#E2E5EA',   // neutral gray for unselected
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
                                isDark ? '#8891A5' : '#A0AABB',
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
                            p => parcelKey(p) === clickedId
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
                                    <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${escapeHtml(props.address)}</div>
                                    ${props.parcelNumber ? `<div style="color: var(--text-faint); font-size: 10px;">APN: ${escapeHtml(props.parcelNumber)}</div>` : ''}
                                    ${props.ownerName ? `<div style="color: var(--text-secondary); margin-top: 3px;">📋 ${escapeHtml(props.ownerName)}</div>` : ''}
                                    ${props.lotSizeSF > 0 ? `<div style="color: var(--text-secondary);">📐 ${fmtNumber(props.lotSizeSF)} SF (${Number(props.lotSizeAcres).toFixed(2)} ac)</div>` : ''}
                                    ${props.totalAssessedValue > 0 ? `<div style="color: var(--text-secondary);">💰 ${fmtCurrency(props.totalAssessedValue)}</div>` : ''}
                                    ${props.zoningCode ? `<div style="color: var(--text-secondary);">🏗️ ${escapeHtml(props.zoningCode)}</div>` : ''}
                                    <div style="margin-top: 4px; padding-top: 3px; border-top: 1px solid var(--border); font-size: 10px; color: ${isSelected ? '#7C3AED' : 'var(--text-faint)'}; font-weight: 600;">
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
    }, [latitude, longitude, nearbyParcels, primaryGeometry, mapStyle]);

    // Update the GeoJSON source when assemblage selection changes (without recreating the map)
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;
        const source = map.getSource?.('nearby-parcels');
        if (!source) return;

        const selectedIds = new Set<string>();
        for (const a of assemblage) {
            selectedIds.add(parcelKey(a));
        }

        const nearbyWithGeom = nearbyRef.current.filter(p => p.geometry);
        const features = nearbyWithGeom.map(p => ({
            type: 'Feature' as const,
            geometry: p.geometry,
            properties: {
                id: parcelKey(p),
                address: p.address || 'Unknown',
                parcelNumber: p.parcelNumber || '',
                ownerName: p.ownerName || '',
                lotSizeSF: p.lotSizeSF || 0,
                lotSizeAcres: p.lotSizeAcres || 0,
                totalAssessedValue: p.totalAssessedValue || 0,
                zoningCode: p.zoningCode || '',
                landUse: p.landUse || '',
                selected: selectedIds.has(parcelKey(p)) ? 1 : 0,
            },
        }));

        source.setData({ type: 'FeatureCollection', features });
    }, [assemblage]);

    if (!MAPBOX_TOKEN) {
        return (
            <div className="w-full h-[400px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] flex items-center justify-center">
                <p className="text-xs text-[var(--text-faint)]">Add <code className="text-[10px] bg-[var(--bg-elevated)] px-1 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to .env.local</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="w-full h-[300px] sm:h-[400px] rounded-lg overflow-hidden border border-[var(--border)]"
            role="region"
            aria-label="Nearby parcels map. Click a parcel to add or remove it; the list alongside offers the same actions."
        />
    );
}
