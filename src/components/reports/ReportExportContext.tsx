'use client';

/**
 * Lets a report tab that renders its own grid (Pre-Dev, Key Dates, Pursuit
 * Costs) hand its current export payload to the toolbar's XLSX/PDF buttons.
 *
 * Without this the toolbar only ever saw the config-driven report engine, so
 * those tabs exported the Pursuits table regardless of what was on screen.
 */

import { createContext, useContext, useEffect } from 'react';
import type { TableExportSpec } from '@/components/export/tableExport';

/** Built lazily on click so the export always reflects current state. */
export type ReportExportBuilder = () => TableExportSpec;

interface ReportExportContextValue {
    register: (build: ReportExportBuilder | null) => void;
}

const ReportExportContext = createContext<ReportExportContextValue | null>(null);

export function ReportExportProvider({
    register,
    children,
}: {
    /** Must be referentially stable (useCallback) — it is an effect dependency. */
    register: (build: ReportExportBuilder | null) => void;
    children: React.ReactNode;
}) {
    return (
        <ReportExportContext.Provider value={{ register }}>
            {children}
        </ReportExportContext.Provider>
    );
}

/**
 * Registers the calling tab as the owner of the toolbar export buttons.
 * Pass `null` while loading or empty so the buttons stay disabled instead of
 * falling back to an unrelated data source.
 *
 * `build` should be memoized with useCallback over the state it reads.
 */
export function useRegisterReportExport(build: ReportExportBuilder | null) {
    const ctx = useContext(ReportExportContext);
    const register = ctx?.register;

    useEffect(() => {
        if (!register) return;
        register(build);
        return () => register(null);
    }, [register, build]);
}
