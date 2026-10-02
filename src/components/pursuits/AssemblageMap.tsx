'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import type { ExpressionSpecification, Map as MapboxMap, Marker, TargetFeature } from 'mapbox-gl';
import { useMapboxMap, useIsDarkTheme } from '@/components/map/useMapboxMap';
import { MapStatusOverlay } from '@/components/map/MapStatusOverlay';
import { addLayerOnce, boundsOf, createPopup, escapeHtml, setGeoJsonData, upsertGeoJsonSource } from '@/components/map/mapHelpers';
import { siteInkColor } from '@/components/map/mapStyle';

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
    primaryGeometry: Geometry | null | undefined;
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

type ParcelIdentity = Parameters<typeof parcelKey>[0];
const normId = (s: string | null | undefined) => (s ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

/**
 * Same parcel? Matches on Regrid ID, or on parcel number ignoring punctuation.
 * Assemblage parcels saved before Oct 2026 stored the parcel number as their
 * regridId, while nearby results now carry Regrid's ll_uuid — both still match.
 */
export function sameParcel(a: ParcelIdentity, b: ParcelIdentity): boolean {
    if (a.regridId && b.regridId && a.regridId === b.regridId) return true;
    const ids = (p: ParcelIdentity) => [p.parcelNumber, p.regridId].map(normId).filter(Boolean);
    const bIds = ids(b);
    return ids(a).some((id) => bIds.includes(id)) || parcelKey(a) === parcelKey(b);
}

function fmtCurrency(v: number | null): string {
    if (v == null) return 'N/A';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtNumber(v: number | null): string {
    if (v == null) return 'N/A';
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const SELECTED_COLOR = '#7C3AED';
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

const nearbyFillColor = (isDark: boolean): ExpressionSpecification => ['case', ['==', ['get', 'selected'], 1], SELECTED_COLOR, isDark ? '#3D4359' : '#E2E5EA'];
const nearbyLineColor = (isDark: boolean): ExpressionSpecification => ['case', ['==', ['get', 'selected'], 1], SELECTED_COLOR, isDark ? '#8891A5' : '#A0AABB'];

function parcelPopupHtml(p: NearbyParcel, isSelected: boolean): string {
    const sf = p.lotSizeSF || 0;
    const value = p.totalAssessedValue || 0;
    return `
        <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.5;">
            <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${escapeHtml(p.address || 'Unknown')}</div>
            ${p.parcelNumber ? `<div style="color: var(--text-faint); font-size: 10px;">APN: ${escapeHtml(p.parcelNumber)}</div>` : ''}
            ${p.ownerName ? `<div style="color: var(--text-secondary); margin-top: 3px;">📋 ${escapeHtml(p.ownerName)}</div>` : ''}
            ${sf > 0 ? `<div style="color: var(--text-secondary);">📐 ${fmtNumber(sf)} SF (${Number(p.lotSizeAcres || 0).toFixed(2)} ac)</div>` : ''}
            ${value > 0 ? `<div style="color: var(--text-secondary);">💰 ${fmtCurrency(value)}</div>` : ''}
            ${p.zoningCode ? `<div style="color: var(--text-secondary);">🏗️ ${escapeHtml(p.zoningCode)}</div>` : ''}
            <div style="margin-top: 4px; padding-top: 3px; border-top: 1px solid var(--border); font-size: 10px; color: ${isSelected ? SELECTED_COLOR : 'var(--text-faint)'}; font-weight: 600;">
                ${isSelected ? '✓ Selected — click to remove' : 'Click to add to assemblage'}
            </div>
        </div>
    `;
}

function removeInteractions(map: MapboxMap, ids: string[]) {
    // The map may already be removed when this runs on unmount
    for (const id of ids) { try { map.removeInteraction(id); } catch { /* map gone */ } }
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
    const hoveredRef = useRef<TargetFeature | null>(null);
    const isDark = useIsDarkTheme();

    const primaryFc = useMemo<FeatureCollection>(() => primaryGeometry
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: primaryGeometry, properties: { type: 'primary' } }] }
        : EMPTY_FC, [primaryGeometry]);

    const nearbyFc = useMemo<FeatureCollection>(() => {
        return {
            type: 'FeatureCollection',
            features: nearbyParcels.filter(p => p.geometry).map(p => ({
                type: 'Feature' as const,
                geometry: p.geometry,
                properties: { id: parcelKey(p), selected: assemblage.some(a => sameParcel(a, p)) ? 1 : 0 },
            })),
        };
    }, [nearbyParcels, assemblage]);
    // Latest props for map callbacks (interaction handlers and onStyleReady)
    const latestRef = useRef({ assemblage, nearbyParcels, onToggleParcel, isDark, primaryFc, nearbyFc });
    useEffect(() => {
        latestRef.current = { assemblage, nearbyParcels, onToggleParcel, isDark, primaryFc, nearbyFc };
    });

    const { map, mbgl, ready, error } = useMapboxMap(containerRef, {
        center: [longitude, latitude],
        zoom: 16,
        onStyleReady: (m) => {
            const dark = latestRef.current.isDark;
            upsertGeoJsonSource(m, 'primary-parcel', latestRef.current.primaryFc);
            addLayerOnce(m, { id: 'primary-parcel-fill', type: 'fill', source: 'primary-parcel', paint: { 'fill-color': siteInkColor(dark), 'fill-opacity': 0.25 } });
            addLayerOnce(m, { id: 'primary-parcel-outline', type: 'line', source: 'primary-parcel', paint: { 'line-color': siteInkColor(dark), 'line-width': 2.5 } });
            upsertGeoJsonSource(m, 'nearby-parcels', latestRef.current.nearbyFc, { promoteId: 'id' });
            addLayerOnce(m, {
                id: 'nearby-fill',
                type: 'fill',
                source: 'nearby-parcels',
                paint: {
                    'fill-color': nearbyFillColor(dark),
                    'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.35, ['boolean', ['feature-state', 'hover'], false], 0.35, 0.2],
                },
            });
            addLayerOnce(m, {
                id: 'nearby-outline',
                type: 'line',
                source: 'nearby-parcels',
                paint: {
                    'line-color': nearbyLineColor(dark),
                    'line-width': ['case', ['==', ['get', 'selected'], 1], 2.5, ['boolean', ['feature-state', 'hover'], false], 2, 1],
                },
            });
        },
    });

    // Hover highlight + one reusable popup; click (or tap) toggles the parcel and shows its info
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        const popup = createPopup(mbgl, { maxWidth: '220px', offset: 10 });
        const findParcel = (feature: TargetFeature | undefined) => {
            const id = feature?.properties?.id;
            return id ? latestRef.current.nearbyParcels.find(p => parcelKey(p) === id) : undefined;
        };
        const isSelected = (p: NearbyParcel) => latestRef.current.assemblage.some(a => sameParcel(a, p));
        const ids = ['nearby-enter', 'nearby-move', 'nearby-leave', 'nearby-click', 'nearby-click-away'];

        map.addInteraction('nearby-enter', {
            type: 'mouseenter',
            target: { layerId: 'nearby-fill' },
            handler: (e) => {
                const parcel = findParcel(e.feature);
                if (!e.feature || !parcel) return;
                if (hoveredRef.current && hoveredRef.current.id !== e.feature.id) map.setFeatureState(hoveredRef.current, { hover: false });
                hoveredRef.current = e.feature;
                map.setFeatureState(e.feature, { hover: true });
                map.getCanvas().style.cursor = 'pointer';
                popup.setLngLat(e.lngLat).setHTML(parcelPopupHtml(parcel, isSelected(parcel))).addTo(map);
            },
        });
        map.addInteraction('nearby-move', {
            type: 'mousemove',
            target: { layerId: 'nearby-fill' },
            handler: (e) => {
                if (hoveredRef.current) popup.setLngLat(e.lngLat);
                return false;
            },
        });
        map.addInteraction('nearby-leave', {
            type: 'mouseleave',
            target: { layerId: 'nearby-fill' },
            handler: (e) => {
                if (e.feature) map.setFeatureState(e.feature, { hover: false });
                // Moving straight onto a neighbouring parcel may enter it before leaving this one
                if (!hoveredRef.current || hoveredRef.current.id === e.feature?.id) {
                    hoveredRef.current = null;
                    map.getCanvas().style.cursor = '';
                    popup.remove();
                }
                return false;
            },
        });
        map.addInteraction('nearby-click', {
            type: 'click',
            target: { layerId: 'nearby-fill' },
            handler: (e) => {
                const parcel = findParcel(e.feature);
                if (!parcel) return;
                const willBeSelected = !isSelected(parcel);
                latestRef.current.onToggleParcel(parcel);
                popup.setLngLat(e.lngLat).setHTML(parcelPopupHtml(parcel, willBeSelected)).addTo(map);
            },
        });
        // Tap/click off a parcel closes the popup (touch has no mouseleave)
        map.addInteraction('nearby-click-away', { type: 'click', handler: () => { popup.remove(); } });

        return () => {
            removeInteractions(map, ids);
            popup.remove();
            hoveredRef.current = null;
        };
    }, [map, mbgl, ready]);

    // Keep the drawn parcels current (selection changes, new search results)
    useEffect(() => {
        if (!map || !ready) return;
        setGeoJsonData(map, 'primary-parcel', primaryFc);
        setGeoJsonData(map, 'nearby-parcels', nearbyFc);
    }, [map, ready, primaryFc, nearbyFc]);

    // Frame the site and every nearby parcel when a new search comes back (not on selection changes)
    const framedRef = useRef(false);
    useEffect(() => {
        if (!map || !mbgl || !ready) return;
        const bounds = boundsOf(mbgl, {
            type: 'FeatureCollection',
            features: [...primaryFc.features, ...nearbyParcels.filter(p => p.geometry).map(p => ({ type: 'Feature' as const, geometry: p.geometry, properties: {} }))],
        });
        if (!bounds) return;
        bounds.extend([longitude, latitude]);
        map.fitBounds(bounds, { padding: 40, maxZoom: 18, duration: framedRef.current ? 800 : 0 });
        framedRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, mbgl, ready, nearbyParcels, primaryFc]);

    // Theme-dependent paint (the map itself is not rebuilt on theme change)
    useEffect(() => {
        if (!map || !ready) return;
        if (map.getLayer('primary-parcel-fill')) map.setPaintProperty('primary-parcel-fill', 'fill-color', siteInkColor(isDark));
        if (map.getLayer('primary-parcel-outline')) map.setPaintProperty('primary-parcel-outline', 'line-color', siteInkColor(isDark));
        if (map.getLayer('nearby-fill')) map.setPaintProperty('nearby-fill', 'fill-color', nearbyFillColor(isDark));
        if (map.getLayer('nearby-outline')) map.setPaintProperty('nearby-outline', 'line-color', nearbyLineColor(isDark));
    }, [map, ready, isDark]);

    // Site marker follows the location and theme
    useEffect(() => {
        if (!map || !mbgl) return;
        const marker: Marker = new mbgl.Marker({ color: siteInkColor(isDark) }).setLngLat([longitude, latitude]).addTo(map);
        return () => { marker.remove(); };
    }, [map, mbgl, isDark, latitude, longitude]);

    return (
        <div className="relative w-full h-[300px] sm:h-[400px] rounded-lg overflow-hidden border border-[var(--border)]">
            <div
                ref={containerRef}
                className="absolute inset-0"
                role="region"
                aria-label="Nearby parcels map. Click a parcel to add or remove it; the list alongside offers the same actions."
            />
            <MapStatusOverlay ready={ready} error={error} />
        </div>
    );
}
