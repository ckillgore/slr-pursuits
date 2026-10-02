'use client';

import { Loader2, MapPinOff } from 'lucide-react';

/**
 * Loading spinner / error message over a map container. Render it as a
 * sibling of the map div inside a `relative` wrapper.
 */
export function MapStatusOverlay({ ready, error }: { ready: boolean; error: string | null }) {
    if (error) {
        return (
            <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--bg-elevated)] text-center px-6">
                <MapPinOff className="w-6 h-6 text-[var(--text-faint)]" aria-hidden />
                <p className="text-sm text-[var(--text-muted)] max-w-xs">{error}</p>
            </div>
        );
    }
    if (!ready) {
        return (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-elevated)]/60 pointer-events-none" role="status" aria-label="Loading map">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" />
            </div>
        );
    }
    return null;
}
