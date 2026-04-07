'use client';

import { useQuery } from '@tanstack/react-query';
import type { UnitPrototype } from '@/app/api/smartsheet/prototypes/route';

export type { UnitPrototype };

export function useUnitPrototypes() {
    return useQuery<UnitPrototype[]>({
        queryKey: ['unit-prototypes'],
        queryFn: async () => {
            const res = await fetch('/api/smartsheet/prototypes');
            if (!res.ok) throw new Error('Failed to fetch unit prototypes');
            return res.json();
        },
        staleTime: 60 * 60 * 1000, // 1 hour — prototype data rarely changes
        gcTime: 2 * 60 * 60 * 1000, // Keep in garbage-collected cache for 2 hours
    });
}
