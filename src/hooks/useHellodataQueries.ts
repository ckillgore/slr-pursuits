'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import * as queries from '@/lib/supabase/queries';
import type {
    HellodataSearchResult,
    HellodataProperty,
    HellodataComparable,
    PursuitRentComp,
} from '@/types';

// ============================================================
// Query Keys
// ============================================================
export const hellodataKeys = {
    rentComps: (pursuitId: string) => ['pursuit-rent-comps', pursuitId] as const,
    property: (hellodataId: string) => ['hellodata-property', hellodataId] as const,
    search: (query: string) => ['hellodata-search', query] as const,
};

// ============================================================
// Hellodata Search (debounced)
// ============================================================

export function useHellodataSearch() {
    const [results, setResults] = useState<HellodataSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback((query: string, filters?: { state?: string; zip_code?: string }) => {
        // Clear previous debounce
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!query || query.length < 2) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        setSearchError(null);

        debounceRef.current = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ q: query });
                if (filters?.state) params.set('state', filters.state);
                if (filters?.zip_code) params.set('zip_code', filters.zip_code);

                const response = await fetch(`/api/hellodata/search?${params.toString()}`);
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || `Search failed: ${response.status}`);
                }
                const data = await response.json();
                setResults(Array.isArray(data) ? data : []);
            } catch (err) {
                setSearchError(err instanceof Error ? err.message : 'Search failed');
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300);
    }, []);

    const clearResults = useCallback(() => {
        setResults([]);
        setSearchError(null);
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    return { results, isSearching, searchError, search, clearResults };
}

// ============================================================
// Fetch Property Details (via cache-aware API route)
// ============================================================

export function useHellodataProperty(hellodataId: string | null) {
    return useQuery<{ property: HellodataProperty; source: 'cache' | 'api' }>({
        queryKey: hellodataKeys.property(hellodataId ?? ''),
        queryFn: async () => {
            const response = await fetch(`/api/hellodata/property?hellodataId=${hellodataId}`);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || `Property fetch failed`);
            }
            return response.json();
        },
        enabled: !!hellodataId,
        staleTime: 1000 * 60 * 60, // 1 hour (server handles real cache TTL)
    });
}

/** Imperative property fetch (for adding new comps) */
export function useFetchHellodataProperty() {
    const queryClient = useQueryClient();

    return useMutation<
        { property: HellodataProperty; source: 'cache' | 'api' },
        Error,
        { hellodataId: string; forceRefresh?: boolean }
    >({
        mutationFn: async ({ hellodataId, forceRefresh }) => {
            const params = new URLSearchParams({ hellodataId });
            if (forceRefresh) params.set('forceRefresh', 'true');
            const response = await fetch(`/api/hellodata/property?${params.toString()}`);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Property fetch failed');
            }
            return response.json();
        },
        onSuccess: (data) => {
            queryClient.setQueryData(
                hellodataKeys.property(data.property.hellodata_id),
                data
            );
        },
    });
}

// ============================================================
// Comparables (free endpoint)
// ============================================================

export function useFindComparables() {
    const [comparables, setComparables] = useState<HellodataComparable[]>([]);
    const [isFinding, setIsFinding] = useState(false);
    const [findError, setFindError] = useState<string | null>(null);

    const findComparables = useCallback(async (
        hellodataId: string,
        filters?: {
            max_distance?: number;
            min_number_units?: number;
            max_number_units?: number;
            min_year_built?: number;
            max_year_built?: number;
            topN?: number;
        }
    ) => {
        setIsFinding(true);
        setFindError(null);
        try {
            const response = await fetch('/api/hellodata/comparables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hellodataId, ...filters }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Comparables search failed');
            }
            const data = await response.json();
            setComparables(Array.isArray(data) ? data : []);
        } catch (err) {
            setFindError(err instanceof Error ? err.message : 'Failed to find comparables');
            setComparables([]);
        } finally {
            setIsFinding(false);
        }
    }, []);

    const clearComparables = useCallback(() => {
        setComparables([]);
        setFindError(null);
    }, []);

    return { comparables, isFinding, findError, findComparables, clearComparables };
}

// ============================================================
// Pursuit Rent Comps (CRUD)
// ============================================================

export function usePursuitRentComps(pursuitId: string) {
    return useQuery<PursuitRentComp[]>({
        queryKey: hellodataKeys.rentComps(pursuitId),
        queryFn: () => queries.fetchPursuitRentComps(pursuitId),
        enabled: !!pursuitId,
    });
}

export function useLinkRentComp() {
    const queryClient = useQueryClient();
    return useMutation<
        PursuitRentComp,
        Error,
        { pursuitId: string; propertyId: string; notes?: string }
    >({
        mutationFn: ({ pursuitId, propertyId, notes }) =>
            queries.linkRentCompToPursuit(pursuitId, propertyId, notes),
        onSuccess: (_, { pursuitId }) => {
            queryClient.invalidateQueries({ queryKey: hellodataKeys.rentComps(pursuitId) });
        },
    });
}

export function useUnlinkRentComp() {
    const queryClient = useQueryClient();
    return useMutation<
        void,
        Error,
        { pursuitId: string; propertyId: string }
    >({
        mutationFn: ({ pursuitId, propertyId }) =>
            queries.unlinkRentCompFromPursuit(pursuitId, propertyId),
        onSuccess: (_, { pursuitId }) => {
            queryClient.invalidateQueries({ queryKey: hellodataKeys.rentComps(pursuitId) });
        },
    });
}

export function useUpdateCompType() {
    const queryClient = useQueryClient();
    return useMutation<
        void,
        Error,
        { pursuitId: string; propertyId: string; compType: 'primary' | 'secondary' }
    >({
        mutationFn: ({ pursuitId, propertyId, compType }) =>
            queries.updateRentCompType(pursuitId, propertyId, compType),
        onSuccess: (_, { pursuitId }) => {
            queryClient.invalidateQueries({ queryKey: hellodataKeys.rentComps(pursuitId) });
        },
    });
}
